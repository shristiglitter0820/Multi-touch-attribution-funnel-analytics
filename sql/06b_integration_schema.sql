-- =====================================================================
-- 06b_integration_schema.sql  -  Member 1 + Member 2 integration: ADDITIVE / COMPATIBLE schema changes
-- Safe to re-run (idempotent) and safe on an existing database: no table is dropped, no data is deleted.
-- Compatible with PostgreSQL 16.
-- =====================================================================

-- 1. Member 1's events identify end users by an integer user_id. Our end users are `visitor` rows (UUID),
--    so a visitor remembers the external integer id it was created for.
ALTER TABLE visitor ADD COLUMN IF NOT EXISTS external_user_id BIGINT;
CREATE UNIQUE INDEX IF NOT EXISTS ux_visitor_external_user ON visitor (external_user_id) WHERE external_user_id IS NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'visitor_external_user_id_check') THEN
    ALTER TABLE visitor ADD CONSTRAINT visitor_external_user_id_check CHECK (external_user_id IS NULL OR external_user_id > 0);
  END IF;
END $$;

-- 2. conversion: align with Member 1's purchase rules
--    - order reference up to 100 characters (was 40)               [widening only]
--    - revenue >= 0 (zero-revenue orders allowed, was > 0)           [approved decision]
--    - several orders may happen in one session (was UNIQUE session_id); order_ref stays UNIQUE (duplicate guard)
ALTER TABLE conversion ALTER COLUMN order_ref TYPE VARCHAR(100);
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'conversion'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%revenue > (0)%' LOOP
    EXECUTE format('ALTER TABLE conversion DROP CONSTRAINT %I', r.conname);
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'conversion'::regclass AND conname = 'conversion_revenue_nonneg') THEN
    ALTER TABLE conversion ADD CONSTRAINT conversion_revenue_nonneg CHECK (revenue >= 0);
  END IF;
  FOR r IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'conversion'::regclass AND contype = 'u' AND pg_get_constraintdef(oid) = 'UNIQUE (session_id)' LOOP
    EXECUTE format('ALTER TABLE conversion DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;
CREATE INDEX IF NOT EXISTS idx_conversion_session ON conversion (session_id);

-- 3. attribution credit keeps Member 1's precision (numeric(8,6)); the 0..1 CHECK is unchanged
ALTER TABLE attribution_credit ALTER COLUMN credit_weight TYPE NUMERIC(8,6);

-- 4. channel names used by Member 1's events (the lookup is matched by name). "Direct" already exists.
INSERT INTO channel (channel_name, channel_type) VALUES ('Google Ads', 'PAID'), ('Instagram', 'PAID'), ('Facebook', 'PAID')
ON CONFLICT (channel_name) DO NOTHING;

-- 5. Staging area for events read from MongoDB. One row per Mongo document (_id), so synchronisation is
--    idempotent: a document can never be imported twice. Rejected rows keep the reason for the admin UI.
CREATE TABLE IF NOT EXISTS staged_event (
    mongo_event_id   VARCHAR(24)   PRIMARY KEY,
    event_type       VARCHAR(15)   NOT NULL CHECK (event_type IN ('IMPRESSION','CLICK','VISIT','ADD_TO_CART','PURCHASE')),
    external_user_id BIGINT        NOT NULL CHECK (external_user_id > 0),
    channel_name     VARCHAR(50)   NOT NULL,
    ad_id            INT,
    device_type      VARCHAR(30),
    event_time       TIMESTAMPTZ   NOT NULL,
    revenue          NUMERIC(12,2) CHECK (revenue IS NULL OR revenue >= 0),
    order_reference  VARCHAR(100),
    session_hint     BIGINT,
    status           VARCHAR(10)   NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROCESSED','REJECTED')),
    reject_reason    TEXT,
    staged_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
    processed_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_staged_event_status_time ON staged_event (status, event_time, mongo_event_id);
