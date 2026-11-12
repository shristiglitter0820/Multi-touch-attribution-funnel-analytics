-- =====================================================================
-- 06c_journey_attribution.sql  -  event processing, sessionization, attribution, spend
--
--   fn_assign_session(visitor, time, channel, timeout)  30-minute inactivity sessionization
--   fn_attribute_conversion(conversion)                  FIRST_TOUCH / LAST_TOUCH / LINEAR credits
--   fn_attribute_unattributed()                          back-fills conversions that have no credits yet
--   fn_refresh_campaign_spend()                          spend = clicks x CPC and impressions/1000 x CPM
--   fn_process_staged_events(limit, timeout)             staged Mongo events -> visitors, sessions, touchpoints,
--                                                        funnel events, conversions, credits (per-event isolation)
-- PostgreSQL 16 compatible. Re-runnable.
-- =====================================================================

-- ---------- sessionization ----------
-- An event joins the visitor's session if it falls inside [started_at, ended_at + timeout]; otherwise it opens
-- a new session whose source channel is the channel of that first event.
CREATE OR REPLACE FUNCTION fn_assign_session(p_visitor UUID, p_time TIMESTAMPTZ, p_channel INT,
                                             p_timeout INTERVAL DEFAULT INTERVAL '30 minutes')
RETURNS BIGINT LANGUAGE plpgsql AS $$
DECLARE v_id BIGINT;
BEGIN
    SELECT session_id INTO v_id FROM session
    WHERE visitor_id = p_visitor AND started_at <= p_time AND p_time <= ended_at + p_timeout
    ORDER BY started_at DESC LIMIT 1;
    IF FOUND THEN
        UPDATE session SET ended_at = GREATEST(ended_at, p_time) WHERE session_id = v_id;
    ELSE
        INSERT INTO session (visitor_id, source_channel_id, started_at, ended_at)
        VALUES (p_visitor, p_channel, p_time, p_time) RETURNING session_id INTO v_id;
    END IF;
    RETURN v_id;
END $$;

-- ---------- attribution ----------
-- Rule (reverse-engineered from Member 1's sample data; reproduces all 14 sample rows exactly):
--   touches = the visitor's IMPRESSION and CLICK touchpoints that have an ad, at or before the conversion time.
--   FIRST_TOUCH: earliest touch gets 100%.  LAST_TOUCH: latest touch gets 100%.  LINEAR: 1/n each.
--   LINEAR revenue = round(revenue/n, 2) per touch; any rounding remainder goes to the latest touch,
--   so the credited revenue always sums to the order revenue.
-- Model ids come from attribution_model: 1 FIRST_TOUCH, 2 LAST_TOUCH, 3 LINEAR (4 TIME_DECAY is not implemented).
CREATE OR REPLACE FUNCTION fn_attribute_conversion(p_conversion_id BIGINT)
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE v_visitor UUID; v_revenue NUMERIC; v_at TIMESTAMPTZ; v_rows INT := 0;
BEGIN
    SELECT visitor_id, revenue, converted_at INTO v_visitor, v_revenue, v_at FROM conversion WHERE conversion_id = p_conversion_id;
    IF NOT FOUND THEN RETURN 0; END IF;

    DELETE FROM attribution_credit WHERE conversion_id = p_conversion_id AND model_id IN (1, 2, 3);

    WITH touches AS (
        SELECT t.touchpoint_id,
               row_number() OVER (ORDER BY t.touched_at, t.touchpoint_id)           AS rn_first,
               row_number() OVER (ORDER BY t.touched_at DESC, t.touchpoint_id DESC) AS rn_last,
               count(*) OVER ()                                                     AS n
        FROM touchpoint t
        WHERE t.visitor_id = v_visitor AND t.touch_type IN ('IMPRESSION', 'CLICK')
          AND t.ad_id IS NOT NULL AND t.touched_at <= v_at
    )
    INSERT INTO attribution_credit (conversion_id, touchpoint_id, model_id, credit_weight, attributed_revenue)
    SELECT p_conversion_id, touchpoint_id, 1, 1.0, v_revenue FROM touches WHERE rn_first = 1
    UNION ALL
    SELECT p_conversion_id, touchpoint_id, 2, 1.0, v_revenue FROM touches WHERE rn_last = 1
    UNION ALL
    SELECT p_conversion_id, touchpoint_id, 3, round(1.0 / n, 6),
           CASE WHEN rn_last = 1 THEN v_revenue - round(v_revenue / n, 2) * (n - 1) ELSE round(v_revenue / n, 2) END
    FROM touches;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RETURN v_rows;
END $$;

CREATE OR REPLACE FUNCTION fn_attribute_unattributed()
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE r RECORD; v_total INT := 0;
BEGIN
    FOR r IN SELECT conversion_id FROM conversion c
             WHERE NOT EXISTS (SELECT 1 FROM attribution_credit a WHERE a.conversion_id = c.conversion_id) LOOP
        v_total := v_total + fn_attribute_conversion(r.conversion_id);
    END LOOP;
    RETURN v_total;
END $$;

-- ---------- spend ----------
-- campaign_daily_spend is DERIVED data: CPC ads cost unit_cost per CLICK, CPM ads cost unit_cost per 1,000 IMPRESSIONS.
-- For every (campaign, channel) that has tracked touches the rows are recomputed, so the call is idempotent.
-- (UTC dates are used so the result does not depend on the session time zone.) The budget trigger still fires.
CREATE OR REPLACE FUNCTION fn_refresh_campaign_spend()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_rows INT;
BEGIN
    DROP TABLE IF EXISTS _spend_calc;
    CREATE TEMP TABLE _spend_calc ON COMMIT DROP AS
    SELECT a.campaign_id, a.channel_id, (t.touched_at AT TIME ZONE 'UTC')::date AS spend_date,
           ROUND(SUM(CASE WHEN a.pricing_model = 'CPC' AND t.touch_type = 'CLICK'      THEN a.unit_cost
                          WHEN a.pricing_model = 'CPM' AND t.touch_type = 'IMPRESSION' THEN a.unit_cost / 1000.0
                          ELSE 0 END)::numeric, 2) AS amount
    FROM touchpoint t JOIN ad a ON a.ad_id = t.ad_id
    GROUP BY 1, 2, 3;

    DELETE FROM campaign_daily_spend s
    WHERE EXISTS (SELECT 1 FROM _spend_calc c WHERE c.campaign_id = s.campaign_id AND c.channel_id = s.channel_id);
    INSERT INTO campaign_daily_spend (campaign_id, channel_id, spend_date, amount)
    SELECT campaign_id, channel_id, spend_date, amount FROM _spend_calc WHERE amount > 0;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RETURN v_rows;
END $$;

-- ---------- event processing ----------
-- Turns PENDING staged events into the relational journey. Each event runs in its own sub-transaction:
-- a bad event is marked REJECTED with a reason and can never block the others.
--   IMPRESSION        -> touchpoint (no session: an impression is not a visit)
--   CLICK             -> session (30-min rule) + touchpoint
--   VISIT / ADD_TO_CART -> session + funnel_event (stage 3 / 4)
--   PURCHASE          -> session + conversion + funnel_event (stage 5) + FIRST/LAST/LINEAR credits
-- Unknown integer user ids create a new visitor. Channels and ads are NOT auto-created (as in Member 1's sync).
CREATE OR REPLACE FUNCTION fn_process_staged_events(p_limit INT DEFAULT 5000, p_timeout INTERVAL DEFAULT INTERVAL '30 minutes')
RETURNS TABLE (processed INT, rejected INT, conversions INT, attribution_rows INT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    e RECORD; v_vis UUID; v_ch INT; v_ad_ch INT; v_sess BIGINT; v_conv BIGINT; v_dev TEXT;
    n_proc INT := 0; n_rej INT := 0; n_conv INT := 0; n_attr INT := 0; touched BOOLEAN := FALSE;
BEGIN
    PERFORM pg_advisory_xact_lock(727001);       -- one processor at a time (keeps sessionization consistent)

    FOR e IN SELECT * FROM staged_event WHERE status = 'PENDING' ORDER BY event_time, mongo_event_id LIMIT p_limit LOOP
        BEGIN
            SELECT channel_id INTO v_ch FROM channel WHERE channel_name = e.channel_name;
            IF v_ch IS NULL THEN RAISE EXCEPTION 'unknown channel "%"', e.channel_name; END IF;

            IF e.event_type IN ('IMPRESSION', 'CLICK') THEN
                IF e.ad_id IS NULL THEN RAISE EXCEPTION '% events require an ad_id', e.event_type; END IF;
                SELECT channel_id INTO v_ad_ch FROM ad WHERE ad_id = e.ad_id;
                IF NOT FOUND THEN RAISE EXCEPTION 'unknown ad_id %', e.ad_id; END IF;
                IF v_ad_ch <> v_ch THEN RAISE EXCEPTION 'ad % does not belong to channel "%"', e.ad_id, e.channel_name; END IF;
            END IF;

            v_dev := upper(e.device_type);
            INSERT INTO visitor (visitor_id, first_seen_at, last_seen_at, device_type, external_user_id)
            VALUES (gen_random_uuid(), e.event_time, e.event_time,
                    CASE WHEN v_dev IN ('DESKTOP', 'MOBILE', 'TABLET') THEN v_dev END, e.external_user_id)
            ON CONFLICT (external_user_id) WHERE external_user_id IS NOT NULL DO NOTHING;
            SELECT visitor_id INTO v_vis FROM visitor WHERE external_user_id = e.external_user_id;
            UPDATE visitor SET first_seen_at = LEAST(first_seen_at, e.event_time), last_seen_at = GREATEST(last_seen_at, e.event_time)
            WHERE visitor_id = v_vis;

            IF e.event_type = 'IMPRESSION' THEN
                INSERT INTO touchpoint (visitor_id, session_id, ad_id, channel_id, touch_type, touched_at, mongo_event_id)
                VALUES (v_vis, NULL, e.ad_id, v_ch, 'IMPRESSION', e.event_time, e.mongo_event_id);
                touched := TRUE;

            ELSIF e.event_type = 'CLICK' THEN
                v_sess := fn_assign_session(v_vis, e.event_time, v_ch, p_timeout);
                INSERT INTO touchpoint (visitor_id, session_id, ad_id, channel_id, touch_type, touched_at, mongo_event_id)
                VALUES (v_vis, v_sess, e.ad_id, v_ch, 'CLICK', e.event_time, e.mongo_event_id);
                touched := TRUE;

            ELSIF e.event_type IN ('VISIT', 'ADD_TO_CART') THEN
                v_sess := fn_assign_session(v_vis, e.event_time, v_ch, p_timeout);
                INSERT INTO funnel_event (session_id, stage_id, event_time, mongo_event_id)
                VALUES (v_sess, CASE e.event_type WHEN 'VISIT' THEN 3 ELSE 4 END, e.event_time, e.mongo_event_id);

            ELSE  -- PURCHASE
                IF e.revenue IS NULL OR e.order_reference IS NULL THEN RAISE EXCEPTION 'purchase needs revenue and order_reference'; END IF;
                IF e.session_hint IS NOT NULL THEN
                    SELECT session_id INTO v_sess FROM session WHERE session_id = e.session_hint AND visitor_id = v_vis;
                    IF NOT FOUND THEN RAISE EXCEPTION 'session_id % does not belong to this user', e.session_hint; END IF;
                    UPDATE session SET ended_at = GREATEST(ended_at, e.event_time) WHERE session_id = v_sess;
                ELSE
                    v_sess := fn_assign_session(v_vis, e.event_time, v_ch, p_timeout);
                END IF;
                INSERT INTO conversion (session_id, visitor_id, revenue, converted_at, order_ref)
                VALUES (v_sess, v_vis, e.revenue, e.event_time, e.order_reference)
                ON CONFLICT (order_ref) DO NOTHING RETURNING conversion_id INTO v_conv;
                IF v_conv IS NULL THEN RAISE EXCEPTION 'duplicate order_reference "%"', e.order_reference; END IF;
                INSERT INTO funnel_event (session_id, stage_id, event_time, mongo_event_id) VALUES (v_sess, 5, e.event_time, e.mongo_event_id);
                UPDATE session SET is_converted = TRUE WHERE session_id = v_sess;
                n_attr := n_attr + fn_attribute_conversion(v_conv);
                n_conv := n_conv + 1;
            END IF;

            UPDATE staged_event SET status = 'PROCESSED', reject_reason = NULL, processed_at = now() WHERE mongo_event_id = e.mongo_event_id;
            n_proc := n_proc + 1;
        EXCEPTION WHEN OTHERS THEN
            UPDATE staged_event SET status = 'REJECTED', reject_reason = left(SQLERRM, 300), processed_at = now() WHERE mongo_event_id = e.mongo_event_id;
            n_rej := n_rej + 1;
        END;
    END LOOP;

    IF touched THEN PERFORM fn_refresh_campaign_spend(); END IF;
    RETURN QUERY SELECT n_proc, n_rej, n_conv, n_attr;
END $$;

-- Give existing conversions (for example the dev seed on an upgraded database) their attribution credits.
SELECT fn_attribute_unattributed();
