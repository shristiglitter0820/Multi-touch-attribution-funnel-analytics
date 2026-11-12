-- =====================================================================
-- 04_views.sql  -  Dashboard views (Member 2)
-- =====================================================================
CREATE OR REPLACE VIEW v_campaign_budget_status AS
SELECT c.campaign_id, c.advertiser_id, c.name, c.status, c.total_budget,
       COALESCE(SUM(s.amount), 0)                                   AS spent,
       c.total_budget - COALESCE(SUM(s.amount), 0)                  AS remaining,
       ROUND(100.0 * COALESCE(SUM(s.amount), 0) / c.total_budget, 2) AS pct_used
FROM campaign c
LEFT JOIN campaign_daily_spend s ON s.campaign_id = c.campaign_id
GROUP BY c.campaign_id;

-- most recent snapshot per campaign, one row per stage
CREATE OR REPLACE VIEW v_funnel_latest AS
SELECT c.campaign_id, c.advertiser_id, c.name AS campaign_name,
       fs.stage_order, fs.stage_name, sn.visitor_count, sn.dropoff_rate, sn.snapshot_date
FROM campaign_funnel_snapshot sn
JOIN campaign c       ON c.campaign_id = sn.campaign_id
JOIN funnel_stage fs  ON fs.stage_id   = sn.stage_id
WHERE sn.snapshot_date = (SELECT MAX(x.snapshot_date) FROM campaign_funnel_snapshot x
                          WHERE x.campaign_id = sn.campaign_id);

-- biggest drop-off transition per campaign (stage N-1 -> N)
CREATE OR REPLACE VIEW v_biggest_dropoff AS
SELECT DISTINCT ON (v.campaign_id)
       v.campaign_id, v.advertiser_id, v.campaign_name,
       prev.stage_name AS from_stage, v.stage_name AS to_stage,
       prev.visitor_count AS from_visitors, v.visitor_count AS to_visitors,
       v.dropoff_rate, v.snapshot_date
FROM v_funnel_latest v
JOIN v_funnel_latest prev
  ON prev.campaign_id = v.campaign_id AND prev.stage_order = v.stage_order - 1
ORDER BY v.campaign_id, v.dropoff_rate DESC;

-- cross-campaign summary used by the dashboard home page
CREATE OR REPLACE VIEW v_campaign_overview AS
SELECT b.campaign_id, b.advertiser_id, b.name, b.status, b.total_budget, b.spent, b.pct_used,
       d.from_stage, d.to_stage, d.dropoff_rate AS worst_dropoff_pct, d.snapshot_date
FROM v_campaign_budget_status b
LEFT JOIN v_biggest_dropoff d ON d.campaign_id = b.campaign_id;

-- Readable audit trail for the Admin audit-log page.
-- 'changes' = for UPDATE: {column: {old, new}} containing only the columns that changed;
--             for INSERT: the new row. Exposes no credentials (campaign rows contain none).
-- Access: adtech_admin only (see 07_roles.sql).
CREATE OR REPLACE VIEW v_campaign_audit AS
SELECT a.audit_id, a.campaign_id, c.name AS campaign_name, c.advertiser_id,
       a.action, a.changed_by, u.full_name AS changed_by_name, a.changed_at,
       CASE WHEN a.action = 'UPDATE' THEN
            (SELECT COALESCE(jsonb_object_agg(n.key, jsonb_build_object('old', a.old_value -> n.key, 'new', n.value)), '{}'::jsonb)
             FROM jsonb_each(a.new_value) AS n
             WHERE (a.old_value -> n.key) IS DISTINCT FROM n.value)
            ELSE a.new_value END AS changes
FROM campaign_audit_log a
JOIN campaign c       ON c.campaign_id = a.campaign_id
LEFT JOIN app_user u  ON u.user_id     = a.changed_by;
