-- =====================================================================
-- 06d_analytics_views.sql  -  attribution, ROI, CTR and conversion-rate views (Member 2 dashboard)
-- Derived metrics are never stored. Access: adtech_analyst and adtech_admin (see 07_roles.sql).
-- =====================================================================

-- Credited conversions and revenue per campaign x channel x attribution model
CREATE OR REPLACE VIEW v_attribution_by_channel AS
SELECT c.campaign_id, c.advertiser_id, c.name AS campaign_name, ch.channel_id, ch.channel_name, m.model_name,
       ROUND(SUM(ac.credit_weight), 4) AS credited_conversions,
       SUM(ac.attributed_revenue)      AS attributed_revenue
FROM attribution_credit ac
JOIN touchpoint t        ON t.touchpoint_id = ac.touchpoint_id
JOIN ad a                ON a.ad_id         = t.ad_id
JOIN campaign c          ON c.campaign_id   = a.campaign_id
JOIN channel ch          ON ch.channel_id   = t.channel_id
JOIN attribution_model m ON m.model_id      = ac.model_id
GROUP BY c.campaign_id, c.advertiser_id, c.name, ch.channel_id, ch.channel_name, m.model_name;

-- One row per campaign x attribution model (FIRST_TOUCH, LAST_TOUCH, LINEAR)
--   ctr_pct              = clicks / impressions x 100
--   credited_conversions = sum of attribution credits (fractional under multi-touch models)
--   conversion_rate_pct  = credited conversions / clicks x 100
--   roi_pct              = (attributed revenue - spend) / spend x 100       roas = revenue / spend
--   cpa                  = spend / credited conversions
-- Division by zero gives NULL (shown as "-" in the UI), never a fake 0.
CREATE OR REPLACE VIEW v_campaign_roi AS
WITH traffic AS (
    SELECT a.campaign_id,
           COUNT(*) FILTER (WHERE t.touch_type = 'IMPRESSION') AS impressions,
           COUNT(*) FILTER (WHERE t.touch_type = 'CLICK')      AS clicks
    FROM touchpoint t JOIN ad a ON a.ad_id = t.ad_id GROUP BY a.campaign_id
), spend AS (
    SELECT campaign_id, SUM(amount) AS spend FROM campaign_daily_spend GROUP BY campaign_id
), revenue AS (
    SELECT a.campaign_id, ac.model_id, SUM(ac.credit_weight) AS credited, SUM(ac.attributed_revenue) AS revenue
    FROM attribution_credit ac JOIN touchpoint t ON t.touchpoint_id = ac.touchpoint_id JOIN ad a ON a.ad_id = t.ad_id
    GROUP BY a.campaign_id, ac.model_id
)
SELECT c.campaign_id, c.advertiser_id, c.name AS campaign_name, m.model_name,
       COALESCE(s.spend, 0)                       AS spend,
       COALESCE(tr.impressions, 0)                AS impressions,
       COALESCE(tr.clicks, 0)                     AS clicks,
       ROUND(100.0 * tr.clicks / NULLIF(tr.impressions, 0), 2) AS ctr_pct,
       ROUND(COALESCE(r.credited, 0), 4)          AS credited_conversions,
       COALESCE(r.revenue, 0)                     AS attributed_revenue,
       ROUND(100.0 * COALESCE(r.credited, 0) / NULLIF(tr.clicks, 0), 2)              AS conversion_rate_pct,
       ROUND(100.0 * (COALESCE(r.revenue, 0) - COALESCE(s.spend, 0)) / NULLIF(s.spend, 0), 2) AS roi_pct,
       ROUND(COALESCE(r.revenue, 0) / NULLIF(s.spend, 0), 2)                         AS roas,
       ROUND(COALESCE(s.spend, 0) / NULLIF(r.credited, 0), 2)                        AS cpa
FROM campaign c
CROSS JOIN (SELECT model_id, model_name FROM attribution_model WHERE model_id IN (1, 2, 3)) m
LEFT JOIN traffic tr ON tr.campaign_id = c.campaign_id
LEFT JOIN spend   s  ON s.campaign_id  = c.campaign_id
LEFT JOIN revenue r  ON r.campaign_id  = c.campaign_id AND r.model_id = m.model_id;
