-- =====================================================================
-- 12_member1_demo.sql  -  Member 1's sample scenario, loaded SEPARATELY from the dev seed (02_seed_dev.sql).
-- Member 1's sample rows (users 3 and 4, orders ORD1001-ORD1003) are replayed as staged events through the real
-- pipeline (sessionization -> conversion -> attribution), so they double as an end-to-end test.
-- Idempotent: running it again changes nothing. Dates are treated as UTC.
--   Campaigns/ads are created under the first advertiser (Acme Retail) so the demo admin sees them.
--   Member 1's sample had no ad pricing (their campaign_spend rows were typed by hand: 3,000 for campaign 1 and 1,000 for
--   campaign 2). Integrated spend is COMPUTED from ad pricing, so the demo ads are priced at 1,000 per click, which makes the
--   computed spend equal Member 1's sample totals (3 Instagram clicks = 3,000; 1 Facebook click = 1,000).
-- =====================================================================
CREATE OR REPLACE FUNCTION fn_load_member1_demo() RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
    v_adv INT; v_admin INT; v_c1 INT; v_c2 INT; v_g INT; v_i INT; v_f INT;
    ad_google INT; ad_insta INT; ad_story INT; ad_fb INT; r RECORD;
BEGIN
    SELECT advertiser_id INTO v_adv FROM advertiser ORDER BY (name = 'Acme Retail') DESC, advertiser_id LIMIT 1;
    SELECT user_id INTO v_admin FROM app_user WHERE advertiser_id = v_adv AND role = 'ADMIN' ORDER BY user_id LIMIT 1;
    IF v_adv IS NULL OR v_admin IS NULL THEN RAISE EXCEPTION 'demo needs an advertiser with an ADMIN user (run 02_seed_dev.sql first)'; END IF;
    SELECT channel_id INTO v_g FROM channel WHERE channel_name = 'Google Ads';
    SELECT channel_id INTO v_i FROM channel WHERE channel_name = 'Instagram';
    SELECT channel_id INTO v_f FROM channel WHERE channel_name = 'Facebook';

    INSERT INTO campaign (advertiser_id, created_by, name, objective, total_budget, start_date, end_date, status)
    VALUES (v_adv, v_admin, 'Summer Sale Campaign',    'SALES',     50000, DATE '2026-10-01', DATE '2026-12-31', 'ACTIVE'),
           (v_adv, v_admin, 'Festive Instagram Campaign', 'AWARENESS', 30000, DATE '2026-10-01', DATE '2026-12-31', 'ACTIVE')
    ON CONFLICT (advertiser_id, name) DO NOTHING;
    SELECT campaign_id INTO v_c1 FROM campaign WHERE advertiser_id = v_adv AND name = 'Summer Sale Campaign';
    SELECT campaign_id INTO v_c2 FROM campaign WHERE advertiser_id = v_adv AND name = 'Festive Instagram Campaign';

    INSERT INTO ad (campaign_id, channel_id, ad_name, ad_format, pricing_model, unit_cost)
    SELECT x.camp, x.ch, x.nm, x.fmt, x.pm, x.cost
    FROM (VALUES (v_c1, v_g, 'Google Search Ad',        'text',  'CPC', 1000),
                 (v_c1, v_i, 'Instagram Summer Ad',     'image', 'CPC', 1000),
                 (v_c2, v_i, 'Festive Instagram Story', 'story', 'CPM', 4.00),
                 (v_c2, v_f, 'Festive Facebook Ad',     'image', 'CPC', 1000)) AS x(camp, ch, nm, fmt, pm, cost)
    WHERE NOT EXISTS (SELECT 1 FROM ad a WHERE a.campaign_id = x.camp AND a.ad_name = x.nm);
    SELECT ad_id INTO ad_google FROM ad WHERE campaign_id = v_c1 AND ad_name = 'Google Search Ad';
    SELECT ad_id INTO ad_insta  FROM ad WHERE campaign_id = v_c1 AND ad_name = 'Instagram Summer Ad';
    SELECT ad_id INTO ad_fb     FROM ad WHERE campaign_id = v_c2 AND ad_name = 'Festive Facebook Ad';

    -- Member 1's sample interactions and purchases (user ids 3 and 4), as raw events
    INSERT INTO staged_event (mongo_event_id, event_type, external_user_id, channel_name, ad_id, device_type, event_time, revenue, order_reference)
    SELECT 'm1demo' || lpad(n::text, 18, '0'), et, uid, chn, adid, dev, ts::timestamptz, rev, ord
    FROM (VALUES
        ( 1, 'IMPRESSION',  3, 'Google Ads', ad_google, 'Mobile',  '2026-10-20 10:02:00+00', NULL::numeric, NULL::text),
        ( 2, 'CLICK',       3, 'Instagram',  ad_insta,  'Mobile',  '2026-10-22 14:05:00+00', NULL, NULL),
        ( 3, 'VISIT',       3, 'Direct',     NULL,      'Mobile',  '2026-10-23 16:05:00+00', NULL, NULL),
        ( 4, 'ADD_TO_CART', 3, 'Direct',     NULL,      'Mobile',  '2026-10-23 16:10:00+00', NULL, NULL),
        ( 5, 'CLICK',       4, 'Facebook',   ad_fb,     'Desktop', '2026-10-24 11:05:00+00', NULL, NULL),
        ( 6, 'CLICK',       3, 'Instagram',  ad_insta,  'Mobile',  '2026-10-29 09:31:58.007+00', NULL, NULL),
        ( 7, 'IMPRESSION',  3, 'Google Ads', ad_google, 'Mobile',  '2026-10-29 09:32:17.831+00', NULL, NULL),
        ( 8, 'CLICK',       3, 'Instagram',  ad_insta,  'Mobile',  '2026-10-29 09:34:37.256+00', NULL, NULL),
        ( 9, 'PURCHASE',    3, 'Direct',     NULL,      'Mobile',  '2026-10-23 16:20:00+00', 5000, 'ORD1001'),
        (10, 'PURCHASE',    4, 'Direct',     NULL,      'Desktop', '2026-10-24 11:20:00+00', 2500, 'ORD1002'),
        (11, 'PURCHASE',    3, 'Direct',     NULL,      'Mobile',  '2026-10-31 09:57:54.105+00', 750, 'ORD1003')
    ) AS v(n, et, uid, chn, adid, dev, ts, rev, ord)
    ON CONFLICT (mongo_event_id) DO NOTHING;

    SELECT * INTO r FROM fn_process_staged_events(5000);
    RETURN format('member 1 demo loaded: %s events processed, %s rejected, %s conversions', r.processed, r.rejected, r.conversions);
END $$;
REVOKE ALL ON FUNCTION fn_load_member1_demo() FROM PUBLIC;
