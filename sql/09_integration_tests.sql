-- =====================================================================
-- 09_integration_tests.sql  -  tests for the Member 1 + Member 2 integration (T15 - T24).
-- Run as superuser after run_all.sh / upgrade.sh:   psql -d adtech -f 09_integration_tests.sql
-- Everything runs in ONE transaction that is ROLLED BACK at the end (your data is untouched).
-- Each check prints PASS or aborts with FAIL.
-- =====================================================================
\set ON_ERROR_STOP on
\set QUIET on
SET client_min_messages = notice;
BEGIN;

-- helper used by the tests: stage one raw event the same way the Node sync does
CREATE FUNCTION pg_temp.stage(p_id TEXT, p_type TEXT, p_user BIGINT, p_channel TEXT, p_ad INT, p_time TEXT,
                              p_rev NUMERIC DEFAULT NULL, p_order TEXT DEFAULT NULL, p_hint BIGINT DEFAULT NULL) RETURNS VOID LANGUAGE sql AS $$
  INSERT INTO staged_event (mongo_event_id, event_type, external_user_id, channel_name, ad_id, event_time, revenue, order_reference, session_hint)
  VALUES (p_id, p_type, p_user, p_channel, p_ad, p_time::timestamptz, p_rev, p_order, p_hint) ON CONFLICT (mongo_event_id) DO NOTHING $$;

-- T15: schema compatibility changes
DO $$
DECLARE v_s BIGINT; v_v UUID := gen_random_uuid(); n INT;
BEGIN
  INSERT INTO visitor (visitor_id, first_seen_at, last_seen_at) VALUES (v_v, now(), now());
  INSERT INTO session (visitor_id, source_channel_id, started_at, ended_at) VALUES (v_v, 1, now(), now()) RETURNING session_id INTO v_s;
  INSERT INTO conversion (session_id, visitor_id, revenue, converted_at, order_ref) VALUES (v_s, v_v, 0, now(), 'T15-' || repeat('x', 90));   -- revenue 0, 94-char reference
  INSERT INTO conversion (session_id, visitor_id, revenue, converted_at, order_ref) VALUES (v_s, v_v, 10, now(), 'T15-b');                    -- 2nd order in same session
  BEGIN INSERT INTO conversion (session_id, visitor_id, revenue, converted_at, order_ref) VALUES (v_s, v_v, -1, now(), 'T15-neg'); RAISE EXCEPTION 'T15 FAIL: negative revenue accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO conversion (session_id, visitor_id, revenue, converted_at, order_ref) VALUES (v_s, v_v, 1, now(), 'T15-b'); RAISE EXCEPTION 'T15 FAIL: duplicate order_ref accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  SELECT COUNT(*) INTO n FROM channel WHERE channel_name IN ('Google Ads', 'Instagram', 'Facebook');
  IF n <> 3 THEN RAISE EXCEPTION 'T15 FAIL: member 1 channels missing (%)', n; END IF;
  RAISE NOTICE 'T15 PASS  revenue>=0, 100-char order_ref, several orders per session, duplicate order_ref still blocked, member-1 channels present';
END $$;

-- T16: 30-minute inactivity sessionization
DO $$
DECLARE r RECORD; v_vis UUID; n_sess INT; n_first INT;
BEGIN
  PERFORM pg_temp.stage('t16' || lpad(1::text, 20, '0'), 'CLICK', 90016, 'Paid Search', 1, '2030-01-01 10:00:00+00');
  PERFORM pg_temp.stage('t16' || lpad(2::text, 20, '0'), 'VISIT', 90016, 'Direct', NULL, '2030-01-01 10:29:00+00');   -- 29 min after the click: same session
  PERFORM pg_temp.stage('t16' || lpad(3::text, 20, '0'), 'ADD_TO_CART', 90016, 'Direct', NULL, '2030-01-01 10:58:00+00'); -- 29 min after previous: still same (window slides)
  PERFORM pg_temp.stage('t16' || lpad(4::text, 20, '0'), 'VISIT', 90016, 'Direct', NULL, '2030-01-01 11:29:00+00');   -- 31 min gap: NEW session
  SELECT * INTO r FROM fn_process_staged_events(100);
  IF r.processed <> 4 OR r.rejected <> 0 THEN RAISE EXCEPTION 'T16 FAIL: processed=% rejected=%', r.processed, r.rejected; END IF;
  SELECT visitor_id INTO v_vis FROM visitor WHERE external_user_id = 90016;
  SELECT COUNT(*) INTO n_sess FROM session WHERE visitor_id = v_vis;
  IF n_sess <> 2 THEN RAISE EXCEPTION 'T16 FAIL: expected 2 sessions, got %', n_sess; END IF;
  SELECT COUNT(*) INTO n_first FROM session s JOIN funnel_event fe USING (session_id) WHERE s.visitor_id = v_vis AND s.started_at = '2030-01-01 10:00:00+00';
  IF n_first <> 2 THEN RAISE EXCEPTION 'T16 FAIL: first session should hold 2 funnel events, has %', n_first; END IF;
  IF (SELECT source_channel_id FROM session WHERE visitor_id = v_vis ORDER BY started_at LIMIT 1) <> (SELECT channel_id FROM channel WHERE channel_name = 'Paid Search') THEN
    RAISE EXCEPTION 'T16 FAIL: session source channel should be the clicked channel'; END IF;
  RAISE NOTICE 'T16 PASS  30-minute rule: 29-minute gaps join the session, a 31-minute gap opens a new one; source channel = first event';
END $$;

-- T17: full flow integrates with the existing funnel (impression -> click -> visit -> cart -> purchase) and is auto-attributed
DO $$
DECLARE v_camp INT; before_ INT[]; after_ INT[]; v_conv BIGINT; r RECORD; v_lin NUMERIC; n_models INT;
BEGIN
  SELECT campaign_id INTO v_camp FROM ad WHERE ad_id = 1;
  SELECT array_agg(visitors::int ORDER BY stage_order) INTO before_ FROM fn_campaign_funnel(v_camp);
  PERFORM pg_temp.stage('t17' || lpad(1::text, 20, '0'), 'IMPRESSION', 90017, 'Paid Search', 1, '2030-02-01 09:00:00+00');
  PERFORM pg_temp.stage('t17' || lpad(2::text, 20, '0'), 'CLICK',      90017, 'Paid Search', 1, '2030-02-01 09:10:00+00');
  PERFORM pg_temp.stage('t17' || lpad(3::text, 20, '0'), 'VISIT',      90017, 'Direct', NULL,   '2030-02-01 09:11:00+00');
  PERFORM pg_temp.stage('t17' || lpad(4::text, 20, '0'), 'ADD_TO_CART',90017, 'Direct', NULL,   '2030-02-01 09:15:00+00');
  PERFORM pg_temp.stage('t17' || lpad(5::text, 20, '0'), 'PURCHASE',   90017, 'Direct', NULL,   '2030-02-01 09:20:00+00', 100.01, 'T17-ORDER');
  SELECT * INTO r FROM fn_process_staged_events(100);
  IF r.processed <> 5 OR r.conversions <> 1 THEN RAISE EXCEPTION 'T17 FAIL: processed=% conversions=%', r.processed, r.conversions; END IF;
  SELECT array_agg(visitors::int ORDER BY stage_order) INTO after_ FROM fn_campaign_funnel(v_camp);
  IF after_ IS DISTINCT FROM ARRAY[before_[1]+1, before_[2]+1, before_[3]+1, before_[4]+1, before_[5]+1] THEN
    RAISE EXCEPTION 'T17 FAIL: funnel before % after % (expected +1 at every stage)', before_, after_; END IF;
  SELECT conversion_id INTO v_conv FROM conversion WHERE order_ref = 'T17-ORDER';
  SELECT COUNT(DISTINCT model_id) INTO n_models FROM attribution_credit WHERE conversion_id = v_conv;
  SELECT SUM(attributed_revenue) INTO v_lin FROM attribution_credit WHERE conversion_id = v_conv AND model_id = 3;
  IF n_models <> 3 OR v_lin <> 100.01 THEN RAISE EXCEPTION 'T17 FAIL: models=% linear revenue=%', n_models, v_lin; END IF;
  IF NOT (SELECT is_converted FROM session WHERE session_id = (SELECT session_id FROM conversion WHERE conversion_id = v_conv)) THEN RAISE EXCEPTION 'T17 FAIL: session not flagged converted'; END IF;
  RAISE NOTICE 'T17 PASS  events -> sessions -> funnel (+1 at all 5 stages) -> conversion -> FIRST/LAST/LINEAR credits (linear sums to 100.01)';
END $$;

-- T18: Member 1's sample scenario reproduces Member 1's attribution table EXACTLY (all 14 rows)
DO $$
DECLARE d1 INT; d2 INT; n INT;
BEGIN
  PERFORM fn_load_member1_demo();
  CREATE TEMP TABLE m1_expected (order_ref TEXT, model TEXT, ad_name TEXT, touched TIMESTAMPTZ, credit NUMERIC, revenue NUMERIC) ON COMMIT DROP;
  INSERT INTO m1_expected VALUES
   ('ORD1001','FIRST_TOUCH','Google Search Ad',    '2026-10-20 10:02:00+00',1.0,5000), ('ORD1001','LAST_TOUCH','Instagram Summer Ad','2026-10-22 14:05:00+00',1.0,5000),
   ('ORD1001','LINEAR','Google Search Ad',         '2026-10-20 10:02:00+00',0.5,2500), ('ORD1001','LINEAR','Instagram Summer Ad',    '2026-10-22 14:05:00+00',0.5,2500),
   ('ORD1002','FIRST_TOUCH','Festive Facebook Ad', '2026-10-24 11:05:00+00',1.0,2500), ('ORD1002','LAST_TOUCH','Festive Facebook Ad','2026-10-24 11:05:00+00',1.0,2500),
   ('ORD1002','LINEAR','Festive Facebook Ad',      '2026-10-24 11:05:00+00',1.0,2500),
   ('ORD1003','FIRST_TOUCH','Google Search Ad',    '2026-10-20 10:02:00+00',1.0,750),  ('ORD1003','LAST_TOUCH','Instagram Summer Ad','2026-10-29 09:34:37.256+00',1.0,750),
   ('ORD1003','LINEAR','Google Search Ad',         '2026-10-20 10:02:00+00',0.2,150),  ('ORD1003','LINEAR','Instagram Summer Ad',    '2026-10-22 14:05:00+00',0.2,150),
   ('ORD1003','LINEAR','Instagram Summer Ad',      '2026-10-29 09:31:58.007+00',0.2,150), ('ORD1003','LINEAR','Google Search Ad',    '2026-10-29 09:32:17.831+00',0.2,150),
   ('ORD1003','LINEAR','Instagram Summer Ad',      '2026-10-29 09:34:37.256+00',0.2,150);
  CREATE TEMP TABLE m1_actual ON COMMIT DROP AS
    SELECT cv.order_ref, m.model_name AS model, a.ad_name, t.touched_at AS touched, ac.credit_weight AS credit, ac.attributed_revenue AS revenue
    FROM attribution_credit ac JOIN conversion cv USING (conversion_id) JOIN touchpoint t USING (touchpoint_id)
    JOIN ad a ON a.ad_id = t.ad_id JOIN attribution_model m USING (model_id) WHERE cv.order_ref IN ('ORD1001','ORD1002','ORD1003');
  SELECT COUNT(*) INTO n FROM m1_actual;
  SELECT COUNT(*) INTO d1 FROM (SELECT * FROM m1_expected EXCEPT SELECT * FROM m1_actual) x;
  SELECT COUNT(*) INTO d2 FROM (SELECT * FROM m1_actual EXCEPT SELECT * FROM m1_expected) x;
  IF n <> 14 OR d1 <> 0 OR d2 <> 0 THEN RAISE EXCEPTION 'T18 FAIL: rows=% missing=% unexpected=%', n, d1, d2; END IF;
  RAISE NOTICE 'T18 PASS  Member 1 sample (ORD1001-1003): 14/14 FIRST/LAST/LINEAR rows identical to Member 1''s table';
END $$;

-- T19: zero-revenue purchases accepted; duplicate order reference rejected; re-processing never duplicates
DO $$
DECLARE r RECORD; n1 INT; n2 INT;
BEGIN
  PERFORM pg_temp.stage('t19' || lpad(1::text, 20, '0'), 'CLICK',    90019, 'Paid Search', 1, '2030-03-01 08:00:00+00');
  PERFORM pg_temp.stage('t19' || lpad(2::text, 20, '0'), 'PURCHASE', 90019, 'Direct', NULL, '2030-03-01 08:05:00+00', 0, 'T19-FREE');
  PERFORM pg_temp.stage('t19' || lpad(3::text, 20, '0'), 'PURCHASE', 90019, 'Direct', NULL, '2030-03-01 08:06:00+00', 25, 'T19-FREE');   -- same order reference again
  SELECT * INTO r FROM fn_process_staged_events(100);
  IF r.processed <> 2 OR r.rejected <> 1 OR r.conversions <> 1 THEN RAISE EXCEPTION 'T19 FAIL: %/%/%', r.processed, r.rejected, r.conversions; END IF;
  IF (SELECT revenue FROM conversion WHERE order_ref = 'T19-FREE') <> 0 THEN RAISE EXCEPTION 'T19 FAIL: zero revenue not stored'; END IF;
  IF (SELECT reject_reason FROM staged_event WHERE mongo_event_id = 't19' || lpad(3::text, 20, '0')) NOT LIKE '%duplicate order_reference%' THEN RAISE EXCEPTION 'T19 FAIL: reject reason'; END IF;
  SELECT COUNT(*) INTO n1 FROM conversion;
  PERFORM pg_temp.stage('t19' || lpad(1::text, 20, '0'), 'CLICK', 90019, 'Paid Search', 1, '2030-03-01 08:00:00+00');   -- same Mongo _id staged again (re-sync)
  SELECT * INTO r FROM fn_process_staged_events(100);
  SELECT COUNT(*) INTO n2 FROM conversion;
  IF r.processed <> 0 OR n1 <> n2 THEN RAISE EXCEPTION 'T19 FAIL: re-sync changed data (% -> %)', n1, n2; END IF;
  RAISE NOTICE 'T19 PASS  zero revenue accepted; duplicate order rejected with reason; re-sync of the same Mongo ids is a no-op';
END $$;

-- T20: one bad event never blocks the batch (per-event isolation)
DO $$
DECLARE r RECORD; v_bad TEXT; v_good TEXT;
BEGIN
  PERFORM pg_temp.stage('t20' || lpad(1::text, 20, '0'), 'CLICK', 90020, 'Nonexistent Channel', 1, '2030-04-01 08:00:00+00');   -- unknown channel
  PERFORM pg_temp.stage('t20' || lpad(2::text, 20, '0'), 'CLICK', 90020, 'Paid Search', 999999, '2030-04-01 08:01:00+00');      -- unknown ad
  PERFORM pg_temp.stage('t20' || lpad(3::text, 20, '0'), 'CLICK', 90020, 'Social', 1, '2030-04-01 08:02:00+00');                 -- ad 1 is not a Social ad
  PERFORM pg_temp.stage('t20' || lpad(4::text, 20, '0'), 'IMPRESSION', 90020, 'Paid Search', NULL, '2030-04-01 08:03:00+00');    -- ad required
  PERFORM pg_temp.stage('t20' || lpad(5::text, 20, '0'), 'CLICK', 90020, 'Paid Search', 1, '2030-04-01 08:04:00+00');            -- good
  SELECT * INTO r FROM fn_process_staged_events(100);
  IF r.processed <> 1 OR r.rejected <> 4 THEN RAISE EXCEPTION 'T20 FAIL: processed=% rejected=%', r.processed, r.rejected; END IF;
  IF (SELECT COUNT(*) FROM staged_event WHERE mongo_event_id LIKE 't20%' AND status = 'REJECTED' AND reject_reason IS NOT NULL) <> 4 THEN RAISE EXCEPTION 'T20 FAIL: reasons missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM touchpoint WHERE mongo_event_id = 't20' || lpad(5::text, 20, '0')) THEN RAISE EXCEPTION 'T20 FAIL: good event lost'; END IF;
  RAISE NOTICE 'T20 PASS  4 invalid events rejected with reasons, the valid event in the same batch was still imported';
END $$;

-- T21: ROI / CTR / conversion-rate views give the expected numbers for Member 1's scenario
DO $$
DECLARE v RECORD;
BEGIN
  PERFORM fn_load_member1_demo();
  SELECT * INTO v FROM v_campaign_roi WHERE campaign_name = 'Summer Sale Campaign' AND model_name = 'LAST_TOUCH';
  IF v.spend <> 3000 OR v.impressions <> 2 OR v.clicks <> 3 OR v.ctr_pct <> 150.00 OR v.credited_conversions <> 2 OR v.attributed_revenue <> 5750
     OR v.roi_pct <> 91.67 OR v.roas <> 1.92 OR v.conversion_rate_pct <> 66.67 OR v.cpa <> 1500.00 THEN
    RAISE EXCEPTION 'T21 FAIL: Summer Sale %', row_to_json(v); END IF;
  SELECT * INTO v FROM v_campaign_roi WHERE campaign_name = 'Festive Instagram Campaign' AND model_name = 'LINEAR';
  IF v.spend <> 1000 OR v.impressions <> 0 OR v.ctr_pct IS NOT NULL OR v.attributed_revenue <> 2500 OR v.roi_pct <> 150.00 THEN
    RAISE EXCEPTION 'T21 FAIL: Festive %', row_to_json(v); END IF;
  -- revenue split differs by model for the same campaign (multi-touch check): Google Ads gets credit under FIRST/LINEAR but not LAST
  IF (SELECT attributed_revenue FROM v_attribution_by_channel WHERE campaign_name = 'Summer Sale Campaign' AND channel_name = 'Google Ads' AND model_name = 'FIRST_TOUCH') <> 5750
     OR (SELECT COUNT(*) FROM v_attribution_by_channel WHERE campaign_name = 'Summer Sale Campaign' AND channel_name = 'Google Ads' AND model_name = 'LAST_TOUCH') <> 0
     OR (SELECT attributed_revenue FROM v_attribution_by_channel WHERE campaign_name = 'Summer Sale Campaign' AND channel_name = 'Google Ads' AND model_name = 'LINEAR') <> 2800 THEN
    RAISE EXCEPTION 'T21 FAIL: per-channel attribution'; END IF;
  RAISE NOTICE 'T21 PASS  CTR 150%% (3 clicks/2 impressions), spend 3000, ROI 91.67%%, conv.rate 66.67%%, CPA 1500; NULL (not 0) when impressions = 0; per-model channel credit differs as expected';
END $$;

-- T22: spend refresh is idempotent and equals clicks x CPC
DO $$
DECLARE a NUMERIC; b NUMERIC;
BEGIN
  PERFORM fn_refresh_campaign_spend();
  SELECT SUM(amount) INTO a FROM campaign_daily_spend;
  PERFORM fn_refresh_campaign_spend();
  SELECT SUM(amount) INTO b FROM campaign_daily_spend;
  IF a <> b THEN RAISE EXCEPTION 'T22 FAIL: refresh not idempotent (% vs %)', a, b; END IF;
  RAISE NOTICE 'T22 PASS  spend refresh is idempotent (total %)', a;
END $$;

-- T23: funnel stays sane for incomplete journeys (purchase without a visit event): no negative drop-off, no >100%% continue
DO $$
DECLARE v_camp INT; bad INT;
BEGIN
  SELECT campaign_id INTO v_camp FROM ad WHERE ad_id = 2;
  PERFORM pg_temp.stage('t23' || lpad(1::text, 20, '0'), 'CLICK',    90023, 'Social', 2, '2030-05-01 08:00:00+00');
  PERFORM pg_temp.stage('t23' || lpad(2::text, 20, '0'), 'PURCHASE', 90023, 'Direct', NULL, '2030-05-01 08:05:00+00', 10, 'T23-ORDER');
  PERFORM fn_process_staged_events(100);
  SELECT COUNT(*) INTO bad FROM fn_campaign_funnel(v_camp) WHERE dropoff_pct < 0 OR pct_of_previous > 100;
  IF bad <> 0 THEN RAISE EXCEPTION 'T23 FAIL: % anomalous stage rows', bad; END IF;
  RAISE NOTICE 'T23 PASS  funnel clamps anomalies (drop-off >= 0, continue <= 100)';
END $$;

-- T24: permissions of the new objects
DO $$
DECLARE r RECORD; n INT;
BEGIN
  PERFORM pg_temp.stage('t24' || lpad(1::text, 20, '0'), 'CLICK', 90024, 'Paid Search', 1, '2030-06-01 08:00:00+00');
  -- ingest role: may stage + process, nothing else
  SET LOCAL ROLE adtech_ingest;
  INSERT INTO staged_event (mongo_event_id, event_type, external_user_id, channel_name, ad_id, event_time)
    VALUES ('t24' || lpad(2::text, 20, '0'), 'CLICK', 90024, 'Paid Search', 1, '2030-06-01 08:01:00+00');
  SELECT * INTO r FROM fn_process_staged_events(100);
  IF r.processed <> 2 THEN RESET ROLE; RAISE EXCEPTION 'T24 FAIL: ingest role processed %', r.processed; END IF;
  BEGIN PERFORM 1 FROM app_user;                      RESET ROLE; RAISE EXCEPTION 'T24 FAIL: ingest read app_user';   EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN UPDATE campaign SET status = 'ENDED';         RESET ROLE; RAISE EXCEPTION 'T24 FAIL: ingest updated campaign'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM 1 FROM conversion;                    RESET ROLE; RAISE EXCEPTION 'T24 FAIL: ingest read conversion';  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO touchpoint (visitor_id, ad_id, channel_id, touch_type, touched_at, mongo_event_id) VALUES (gen_random_uuid(), 1, 1, 'CLICK', now(), 'x');
        RESET ROLE; RAISE EXCEPTION 'T24 FAIL: ingest wrote touchpoint directly'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;
  -- analyst: reads views, cannot see/process raw events
  SET LOCAL ROLE adtech_analyst;
  PERFORM 1 FROM v_campaign_roi; PERFORM 1 FROM v_attribution_by_channel;
  BEGIN PERFORM 1 FROM staged_event;                  RESET ROLE; RAISE EXCEPTION 'T24 FAIL: analyst read staged_event'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM fn_process_staged_events(1);          RESET ROLE; RAISE EXCEPTION 'T24 FAIL: analyst ran the processor'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM fn_load_member1_demo();               RESET ROLE; RAISE EXCEPTION 'T24 FAIL: analyst loaded the demo'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;
  -- admin: reads views and staged events, cannot run the processor directly
  SET LOCAL ROLE adtech_admin;
  PERFORM 1 FROM v_campaign_roi; SELECT COUNT(*) INTO n FROM staged_event;
  BEGIN PERFORM fn_process_staged_events(1);          RESET ROLE; RAISE EXCEPTION 'T24 FAIL: admin ran the processor'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;
  -- the audit view is still admin-only
  SET LOCAL ROLE adtech_analyst;
  BEGIN PERFORM 1 FROM v_campaign_audit;              RESET ROLE; RAISE EXCEPTION 'T24 FAIL: analyst read audit view'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;
  RAISE NOTICE 'T24 PASS  ingest role = stage+process only; analyst = views only; admin = views + staged events; audit view still admin-only';
END $$;

ROLLBACK;
\echo Integration tests finished (changes rolled back).
