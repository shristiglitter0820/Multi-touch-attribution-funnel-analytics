-- =====================================================================
-- 07_roles.sql  -  Database-level role based access (Member 2)
-- Run as superuser:  psql -d adtech -v app_pw='choose-a-password' -f 07_roles.sql
-- (the password comes from the command line / .env, never hard-coded)
-- The backend connects as adtech_app and, per request, does
--   BEGIN; SET LOCAL ROLE adtech_admin|adtech_analyst; SET LOCAL app.current_user_id = '<id>'; ...
-- =====================================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'adtech_admin')   THEN CREATE ROLE adtech_admin NOLOGIN;   END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'adtech_analyst') THEN CREATE ROLE adtech_analyst NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'adtech_ingest')  THEN CREATE ROLE adtech_ingest NOLOGIN;  END IF;
END $$;

SELECT format('CREATE ROLE adtech_app LOGIN PASSWORD %L', :'app_pw')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'adtech_app') \gexec
SELECT format('ALTER ROLE adtech_app PASSWORD %L', :'app_pw') \gexec

GRANT adtech_admin, adtech_analyst, adtech_ingest TO adtech_app;
GRANT USAGE ON SCHEMA public TO adtech_app, adtech_admin, adtech_analyst, adtech_ingest;

-- login service account: needs to read credentials only
GRANT SELECT ON app_user TO adtech_app;

-- ANALYST: read-only analytics (no app_user, no writes)
GRANT SELECT ON campaign, ad, channel, campaign_daily_spend, visitor, session, touchpoint,
                funnel_stage, funnel_event, conversion, attribution_model, attribution_credit,
                campaign_funnel_snapshot,
                v_campaign_budget_status, v_funnel_latest, v_biggest_dropoff, v_campaign_overview
      TO adtech_analyst;
GRANT EXECUTE ON FUNCTION fn_campaign_funnel(INT, DATE, DATE) TO adtech_analyst;

-- ADMIN (advertiser): everything analyst can do + manage campaigns/ads/budget
GRANT adtech_analyst TO adtech_admin;
GRANT SELECT ON campaign_audit_log, etl_run_log, v_campaign_audit TO adtech_admin;
-- budget procedures check the caller's role/advertiser; password_hash is deliberately NOT included
GRANT SELECT (user_id, advertiser_id, full_name, email, role, is_active, created_at) ON app_user TO adtech_admin;
GRANT INSERT, UPDATE ON campaign, ad TO adtech_admin;
GRANT DELETE ON ad TO adtech_admin;
GRANT INSERT, UPDATE ON campaign_funnel_snapshot TO adtech_admin;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO adtech_admin;

REVOKE ALL ON PROCEDURE sp_update_campaign_budget(INT, NUMERIC, INT) FROM PUBLIC;
REVOKE ALL ON PROCEDURE sp_transfer_budget(INT, INT, NUMERIC, INT)   FROM PUBLIC;
REVOKE ALL ON PROCEDURE sp_build_funnel_snapshot(DATE)               FROM PUBLIC;
GRANT EXECUTE ON PROCEDURE sp_update_campaign_budget(INT, NUMERIC, INT) TO adtech_admin;
GRANT EXECUTE ON PROCEDURE sp_transfer_budget(INT, INT, NUMERIC, INT)   TO adtech_admin;
GRANT EXECUTE ON PROCEDURE sp_build_funnel_snapshot(DATE)               TO adtech_admin;

-- =====================================================================
-- Member 1 + Member 2 integration (event ingestion, attribution, ROI)
-- =====================================================================
-- ANALYST / ADMIN: read the attribution / ROI / CTR views
GRANT SELECT ON v_attribution_by_channel, v_campaign_roi TO adtech_analyst;
-- ADMIN only: see staged events (sync status, rejection reasons)
GRANT SELECT ON staged_event TO adtech_admin;

-- INGEST (used only by the event synchronisation endpoint): least privilege.
--   It may stage raw events, log its runs, and call the processor. The processor is SECURITY DEFINER, so this role
--   needs NO direct access to visitors, sessions, touchpoints, conversions, campaigns or users.
GRANT SELECT, INSERT ON staged_event TO adtech_ingest;
GRANT SELECT, INSERT, UPDATE ON etl_run_log TO adtech_ingest;
GRANT USAGE ON SEQUENCE etl_run_log_run_id_seq TO adtech_ingest;

REVOKE ALL ON FUNCTION fn_process_staged_events(INT, INTERVAL)       FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_assign_session(UUID, TIMESTAMPTZ, INT, INTERVAL) FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_attribute_conversion(BIGINT)               FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_attribute_unattributed()                   FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_refresh_campaign_spend()                   FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_process_staged_events(INT, INTERVAL) TO adtech_ingest;
