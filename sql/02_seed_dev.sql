-- =====================================================================
-- 02_seed_dev.sql  -  DEV-ONLY sample data so Member 2 can work before
-- Member 1's generator/pipeline is ready. Safe to re-run on a fresh DB.
-- Dev logins:  admin@acme.test / Admin@123   analyst@acme.test / Analyst@123
-- =====================================================================
DO $$
DECLARE
  v_adv INT; v_admin INT;
  v_camp INT[] := '{}';
  v_ad   INT[] := '{}';
  v_c INT; i INT; j INT; k INT; n_imp INT;
  v_vis UUID; v_ad_i INT; v_t TIMESTAMPTZ; v_sess BIGINT; v_click_ts TIMESTAMPTZ;
  -- per-ad behaviour (index 1..6): click, visit-after-click, cart, purchase-after-cart
  p_click NUMERIC[] := '{0.14,0.10,0.06,0.05,0.22,0.18}';
  p_visit NUMERIC[] := '{0.90,0.85,0.70,0.75,0.92,0.95}';
  p_cart  NUMERIC[] := '{0.40,0.30,0.25,0.25,0.55,0.50}';
  p_buy   NUMERIC[] := '{0.45,0.35,0.30,0.30,0.60,0.55}';
BEGIN
  PERFORM setseed(0.42);

  INSERT INTO advertiser (name, industry) VALUES ('Acme Retail','E-commerce') RETURNING advertiser_id INTO v_adv;

  INSERT INTO app_user (advertiser_id, full_name, email, password_hash, role) VALUES
    (v_adv,'Ava Admin',  'admin@acme.test',   crypt('Admin@123',   gen_salt('bf',10)), 'ADMIN'),
    (v_adv,'Sam Analyst','analyst@acme.test', crypt('Analyst@123', gen_salt('bf',10)), 'ANALYST');
  SELECT user_id INTO v_admin FROM app_user WHERE email='admin@acme.test';

  -- campaigns
  FOR i IN 1..3 LOOP
    INSERT INTO campaign (advertiser_id, created_by, name, objective, total_budget, start_date, end_date, status)
    VALUES (v_adv, v_admin,
            (ARRAY['Summer Sale','Brand Awareness','Retargeting Push'])[i],
            (ARRAY['SALES','AWARENESS','SALES'])[i],
            (ARRAY[300,200,150])[i], current_date - 45, current_date + 15, 'ACTIVE')
    RETURNING campaign_id INTO v_c;
    v_camp := v_camp || v_c;
  END LOOP;

  -- ads: 2 per campaign (channel ids 1 Paid Search,2 Social,3 Display,4 Email)
  INSERT INTO ad (campaign_id, channel_id, ad_name, ad_format, pricing_model, unit_cost) VALUES
    (v_camp[1],1,'Search - Summer Deals','text','CPC',1.20),
    (v_camp[1],2,'Social - Summer Reel','video','CPC',0.80),
    (v_camp[2],3,'Display - Brand Banner','banner','CPM',4.00),
    (v_camp[2],2,'Social - Brand Story','video','CPM',3.50),
    (v_camp[3],3,'Display - Retarget Banner','banner','CPC',0.60),
    (v_camp[3],4,'Email - Cart Reminder','email','CPC',0.30);
  SELECT array_agg(ad_id ORDER BY ad_id) INTO v_ad FROM ad;

  -- visitors, touchpoints, sessions, funnel events, conversions
  FOR i IN 1..3000 LOOP
    v_vis := gen_random_uuid();
    k := 1 + floor(random()*6)::int;            -- the ad this visitor is exposed to
    v_ad_i := v_ad[k];
    v_t := now() - (random()*40 || ' days')::interval;
    INSERT INTO visitor (visitor_id, first_seen_at, last_seen_at, country, device_type)
    VALUES (v_vis, v_t, v_t, (ARRAY['IN','US','GB','DE'])[1+floor(random()*4)::int],
            (ARRAY['DESKTOP','MOBILE','TABLET'])[1+floor(random()*3)::int]);

    n_imp := 1 + floor(random()*3)::int;
    FOR j IN 1..n_imp LOOP
      INSERT INTO touchpoint (visitor_id, ad_id, channel_id, touch_type, touched_at, mongo_event_id)
      SELECT v_vis, v_ad_i, a.channel_id, 'IMPRESSION', v_t - (j || ' hours')::interval,
             left(md5(random()::text || clock_timestamp()::text), 24)
      FROM ad a WHERE a.ad_id = v_ad_i;
    END LOOP;

    IF random() < p_click[k] THEN
      v_click_ts := v_t + (floor(random()*30) || ' minutes')::interval;
      INSERT INTO session (visitor_id, source_channel_id, started_at, ended_at, landing_page)
      SELECT v_vis, a.channel_id, v_click_ts, v_click_ts + interval '8 minutes', '/landing'
      FROM ad a WHERE a.ad_id = v_ad_i RETURNING session_id INTO v_sess;

      INSERT INTO touchpoint (visitor_id, session_id, ad_id, channel_id, touch_type, touched_at, mongo_event_id)
      SELECT v_vis, v_sess, v_ad_i, a.channel_id, 'CLICK', v_click_ts,
             left(md5(random()::text || clock_timestamp()::text), 24)
      FROM ad a WHERE a.ad_id = v_ad_i;

      IF random() < p_visit[k] THEN
        INSERT INTO funnel_event (session_id, stage_id, event_time, mongo_event_id)
        VALUES (v_sess, 3, v_click_ts + interval '5 seconds', left(md5(random()::text || clock_timestamp()::text), 24));
        IF random() < p_cart[k] THEN
          INSERT INTO funnel_event (session_id, stage_id, event_time, mongo_event_id)
          VALUES (v_sess, 4, v_click_ts + interval '3 minutes', left(md5(random()::text || clock_timestamp()::text), 24));
          IF random() < p_buy[k] THEN
            INSERT INTO funnel_event (session_id, stage_id, event_time, mongo_event_id)
            VALUES (v_sess, 5, v_click_ts + interval '6 minutes', left(md5(random()::text || clock_timestamp()::text), 24));
            INSERT INTO conversion (session_id, visitor_id, revenue, converted_at, order_ref)
            VALUES (v_sess, v_vis, round((20 + random()*180)::numeric, 2), v_click_ts + interval '6 minutes',
                    'ORD-' || left(md5(random()::text || clock_timestamp()::text), 10));
            UPDATE session SET is_converted = TRUE WHERE session_id = v_sess;
          END IF;
        END IF;
      END IF;
    END IF;
  END LOOP;

  -- spend per campaign/channel/day: CPC => clicks * cost ; CPM => impressions/1000 * cost
  INSERT INTO campaign_daily_spend (campaign_id, channel_id, spend_date, amount)
  SELECT a.campaign_id, a.channel_id, t.touched_at::date,
         ROUND(SUM(CASE WHEN a.pricing_model='CPC' AND t.touch_type='CLICK'      THEN a.unit_cost
                        WHEN a.pricing_model='CPM' AND t.touch_type='IMPRESSION' THEN a.unit_cost/1000.0
                        ELSE 0 END)::numeric, 2)
  FROM touchpoint t JOIN ad a ON a.ad_id = t.ad_id
  GROUP BY a.campaign_id, a.channel_id, t.touched_at::date
  HAVING SUM(CASE WHEN a.pricing_model='CPC' AND t.touch_type='CLICK' THEN a.unit_cost
                  WHEN a.pricing_model='CPM' AND t.touch_type='IMPRESSION' THEN a.unit_cost/1000.0
                  ELSE 0 END) > 0
  ON CONFLICT (campaign_id, channel_id, spend_date) DO UPDATE SET amount = EXCLUDED.amount;
END $$;
