-- =====================================================================
-- 03_funnel_functions.sql  -  Funnel analytics (Member 2)
--   fn_campaign_funnel(campaign, from, to)  -> stage-wise funnel + drop-off
--   sp_build_funnel_snapshot(date)          -> persists funnel per campaign
--
-- Funnel definition (distinct visitors):
--   IMPRESSION, CLICK  : from touchpoint (via ad -> campaign)
--   VISIT, CART, PURCHASE : from funnel_event, only for sessions that were
--                           opened by a CLICK on one of the campaign's ads
-- =====================================================================
CREATE OR REPLACE FUNCTION fn_campaign_funnel(
    p_campaign_id INT,
    p_from        DATE DEFAULT NULL,
    p_to          DATE DEFAULT NULL)
RETURNS TABLE (
    stage_id        SMALLINT,
    stage_name      VARCHAR,
    stage_order     SMALLINT,
    visitors        BIGINT,
    pct_of_previous NUMERIC,
    dropoff_pct     NUMERIC,
    pct_of_top      NUMERIC)
LANGUAGE sql STABLE AS $$
WITH counts AS (
    SELECT 1 AS ord, COUNT(DISTINCT t.visitor_id) AS n
    FROM touchpoint t JOIN ad a ON a.ad_id = t.ad_id
    WHERE a.campaign_id = p_campaign_id AND t.touch_type = 'IMPRESSION'
      AND (p_from IS NULL OR t.touched_at >= p_from)
      AND (p_to   IS NULL OR t.touched_at <  p_to + 1)
    UNION ALL
    SELECT 2, COUNT(DISTINCT t.visitor_id)
    FROM touchpoint t JOIN ad a ON a.ad_id = t.ad_id
    WHERE a.campaign_id = p_campaign_id AND t.touch_type = 'CLICK'
      AND (p_from IS NULL OR t.touched_at >= p_from)
      AND (p_to   IS NULL OR t.touched_at <  p_to + 1)
    UNION ALL
    SELECT fs.stage_order, COUNT(DISTINCT s.visitor_id)
    FROM funnel_event fe
    JOIN funnel_stage fs ON fs.stage_id = fe.stage_id
    JOIN session s       ON s.session_id = fe.session_id
    WHERE fs.stage_order BETWEEN 3 AND 5
      AND EXISTS (SELECT 1 FROM touchpoint t JOIN ad a ON a.ad_id = t.ad_id
                  WHERE t.session_id = s.session_id AND t.touch_type = 'CLICK'
                    AND a.campaign_id = p_campaign_id)
      AND (p_from IS NULL OR fe.event_time >= p_from)
      AND (p_to   IS NULL OR fe.event_time <  p_to + 1)
    GROUP BY fs.stage_order
), staged AS (
    SELECT fs.stage_id, fs.stage_name, fs.stage_order,
           COALESCE(c.n, 0)::bigint AS visitors,
           LAG(COALESCE(c.n, 0)) OVER (ORDER BY fs.stage_order) AS prev_n,
           FIRST_VALUE(COALESCE(c.n, 0)) OVER (ORDER BY fs.stage_order) AS top_n
    FROM funnel_stage fs LEFT JOIN counts c ON c.ord = fs.stage_order
)
SELECT st.stage_id, st.stage_name, st.stage_order, st.visitors,
       CASE WHEN st.prev_n IS NULL THEN 100.00
            ELSE LEAST(100.00, ROUND(100.0 * st.visitors / NULLIF(st.prev_n, 0), 2)) END,
       CASE WHEN st.prev_n IS NULL THEN 0.00
            ELSE GREATEST(0.00, ROUND(100.0 - 100.0 * st.visitors / NULLIF(st.prev_n, 0), 2)) END,
       ROUND(100.0 * st.visitors / NULLIF(st.top_n, 0), 2)
FROM staged st
ORDER BY st.stage_order;
$$;

-- Persist the cumulative funnel (campaign start .. snapshot date) for every campaign.
CREATE OR REPLACE PROCEDURE sp_build_funnel_snapshot(p_snapshot_date DATE DEFAULT current_date)
LANGUAGE plpgsql AS $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT campaign_id FROM campaign WHERE status IN ('ACTIVE','PAUSED','ENDED') LOOP
        INSERT INTO campaign_funnel_snapshot (campaign_id, stage_id, snapshot_date, visitor_count, dropoff_rate)
        SELECT r.campaign_id, f.stage_id, p_snapshot_date, f.visitors::int, LEAST(GREATEST(f.dropoff_pct, 0), 100)
        FROM fn_campaign_funnel(r.campaign_id, NULL, p_snapshot_date) f
        ON CONFLICT (campaign_id, stage_id, snapshot_date)
        DO UPDATE SET visitor_count = EXCLUDED.visitor_count, dropoff_rate = EXCLUDED.dropoff_rate;
    END LOOP;
END $$;
