-- =====================================================================
-- 01_schema.sql  -  Shared PostgreSQL schema (agreed by Member 1 & 2)
-- Run:  psql -U postgres -d adtech -f 01_schema.sql
-- =====================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE advertiser (
    advertiser_id SERIAL PRIMARY KEY,
    name          VARCHAR(100) NOT NULL UNIQUE,
    industry      VARCHAR(60),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE app_user (
    user_id       SERIAL PRIMARY KEY,
    advertiser_id INT          NOT NULL REFERENCES advertiser(advertiser_id),
    full_name     VARCHAR(100) NOT NULL,
    email         VARCHAR(150) NOT NULL UNIQUE,
    password_hash TEXT         NOT NULL,
    role          VARCHAR(10)  NOT NULL CHECK (role IN ('ADMIN','ANALYST')),
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE channel (
    channel_id   SERIAL PRIMARY KEY,
    channel_name VARCHAR(50) NOT NULL UNIQUE,
    channel_type VARCHAR(10) NOT NULL CHECK (channel_type IN ('PAID','ORGANIC','DIRECT'))
);

CREATE TABLE campaign (
    campaign_id   SERIAL PRIMARY KEY,
    advertiser_id INT           NOT NULL REFERENCES advertiser(advertiser_id),
    created_by    INT           NOT NULL REFERENCES app_user(user_id),
    name          VARCHAR(120)  NOT NULL,
    objective     VARCHAR(40),
    total_budget  NUMERIC(12,2) NOT NULL CHECK (total_budget > 0),
    start_date    DATE          NOT NULL,
    end_date      DATE          NOT NULL,
    status        VARCHAR(10)   NOT NULL DEFAULT 'DRAFT'
                  CHECK (status IN ('DRAFT','ACTIVE','PAUSED','ENDED')),
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
    UNIQUE (advertiser_id, name),
    CHECK (end_date >= start_date)
);

CREATE TABLE ad (
    ad_id         SERIAL PRIMARY KEY,
    campaign_id   INT           NOT NULL REFERENCES campaign(campaign_id) ON DELETE CASCADE,
    channel_id    INT           NOT NULL REFERENCES channel(channel_id),
    ad_name       VARCHAR(120)  NOT NULL,
    ad_format     VARCHAR(30),
    pricing_model VARCHAR(3)    NOT NULL CHECK (pricing_model IN ('CPC','CPM')),
    unit_cost     NUMERIC(10,4) NOT NULL CHECK (unit_cost >= 0),
    status        VARCHAR(10)   NOT NULL DEFAULT 'ACTIVE'
);

CREATE TABLE campaign_daily_spend (
    spend_id    BIGSERIAL PRIMARY KEY,
    campaign_id INT           NOT NULL REFERENCES campaign(campaign_id),
    channel_id  INT           NOT NULL REFERENCES channel(channel_id),
    spend_date  DATE          NOT NULL,
    amount      NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
    UNIQUE (campaign_id, channel_id, spend_date)
);

CREATE TABLE campaign_audit_log (
    audit_id    BIGSERIAL PRIMARY KEY,
    campaign_id INT         NOT NULL REFERENCES campaign(campaign_id) ON DELETE RESTRICT,
    changed_by  INT         REFERENCES app_user(user_id) ON DELETE SET NULL,
    action      VARCHAR(10) NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
    old_value   JSONB,
    new_value   JSONB,
    changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE visitor (
    visitor_id    UUID PRIMARY KEY,
    first_seen_at TIMESTAMPTZ NOT NULL,
    last_seen_at  TIMESTAMPTZ NOT NULL,
    country       CHAR(2),
    device_type   VARCHAR(10) CHECK (device_type IN ('DESKTOP','MOBILE','TABLET'))
);

CREATE TABLE session (
    session_id        BIGSERIAL PRIMARY KEY,
    visitor_id        UUID        NOT NULL REFERENCES visitor(visitor_id),
    source_channel_id INT         NOT NULL REFERENCES channel(channel_id),
    started_at        TIMESTAMPTZ NOT NULL,
    ended_at          TIMESTAMPTZ NOT NULL,
    landing_page      VARCHAR(255),
    is_converted      BOOLEAN     NOT NULL DEFAULT FALSE,
    CHECK (ended_at >= started_at)
);

CREATE TABLE touchpoint (
    touchpoint_id  BIGSERIAL PRIMARY KEY,
    visitor_id     UUID        NOT NULL REFERENCES visitor(visitor_id),
    session_id     BIGINT      REFERENCES session(session_id) ON DELETE SET NULL,
    ad_id          INT         REFERENCES ad(ad_id) ON DELETE SET NULL,
    channel_id     INT         NOT NULL REFERENCES channel(channel_id),
    touch_type     VARCHAR(15) NOT NULL
                   CHECK (touch_type IN ('IMPRESSION','CLICK','DIRECT_VISIT','ORGANIC_VISIT')),
    touched_at     TIMESTAMPTZ NOT NULL,
    mongo_event_id VARCHAR(24) NOT NULL UNIQUE,
    CHECK (touch_type NOT IN ('IMPRESSION','CLICK') OR ad_id IS NOT NULL)
);

CREATE TABLE funnel_stage (
    stage_id    SMALLINT PRIMARY KEY,
    stage_name  VARCHAR(20) NOT NULL UNIQUE,
    stage_order SMALLINT    NOT NULL UNIQUE
);

CREATE TABLE funnel_event (
    funnel_event_id BIGSERIAL PRIMARY KEY,
    session_id      BIGINT      NOT NULL REFERENCES session(session_id) ON DELETE CASCADE,
    stage_id        SMALLINT    NOT NULL REFERENCES funnel_stage(stage_id),
    event_time      TIMESTAMPTZ NOT NULL,
    mongo_event_id  VARCHAR(24) NOT NULL UNIQUE
);

CREATE TABLE conversion (
    conversion_id BIGSERIAL PRIMARY KEY,
    session_id    BIGINT        NOT NULL UNIQUE REFERENCES session(session_id),
    visitor_id    UUID          NOT NULL REFERENCES visitor(visitor_id),
    revenue       NUMERIC(12,2) NOT NULL CHECK (revenue > 0),
    converted_at  TIMESTAMPTZ   NOT NULL,
    order_ref     VARCHAR(40)   NOT NULL UNIQUE
);

CREATE TABLE attribution_model (
    model_id    SMALLINT PRIMARY KEY,
    model_name  VARCHAR(30) NOT NULL UNIQUE,
    description TEXT
);

CREATE TABLE attribution_credit (
    credit_id          BIGSERIAL PRIMARY KEY,
    conversion_id      BIGINT        NOT NULL REFERENCES conversion(conversion_id) ON DELETE CASCADE,
    touchpoint_id      BIGINT        NOT NULL REFERENCES touchpoint(touchpoint_id),
    model_id           SMALLINT      NOT NULL REFERENCES attribution_model(model_id),
    credit_weight      NUMERIC(5,4)  NOT NULL CHECK (credit_weight BETWEEN 0 AND 1),
    attributed_revenue NUMERIC(12,2) NOT NULL CHECK (attributed_revenue >= 0),
    UNIQUE (conversion_id, touchpoint_id, model_id)
);

CREATE TABLE campaign_funnel_snapshot (
    snapshot_id   BIGSERIAL PRIMARY KEY,
    campaign_id   INT          NOT NULL REFERENCES campaign(campaign_id),
    stage_id      SMALLINT     NOT NULL REFERENCES funnel_stage(stage_id),
    snapshot_date DATE         NOT NULL,
    visitor_count INT          NOT NULL CHECK (visitor_count >= 0),
    dropoff_rate  NUMERIC(5,2) CHECK (dropoff_rate BETWEEN 0 AND 100),
    UNIQUE (campaign_id, stage_id, snapshot_date)
);

CREATE TABLE etl_run_log (
    run_id          SERIAL PRIMARY KEY,
    started_at      TIMESTAMPTZ NOT NULL,
    finished_at     TIMESTAMPTZ,
    status          VARCHAR(10) NOT NULL CHECK (status IN ('RUNNING','SUCCESS','FAILED')),
    events_ingested INT         NOT NULL DEFAULT 0,
    last_event_ts   TIMESTAMPTZ
);

-- ---------- lookup seed data ----------
INSERT INTO channel (channel_name, channel_type) VALUES
  ('Paid Search','PAID'), ('Social','PAID'), ('Display','PAID'),
  ('Email','PAID'), ('Organic','ORGANIC'), ('Direct','DIRECT');

INSERT INTO funnel_stage (stage_id, stage_name, stage_order) VALUES
  (1,'IMPRESSION',1), (2,'CLICK',2), (3,'VISIT',3), (4,'CART',4), (5,'PURCHASE',5);

INSERT INTO attribution_model (model_id, model_name, description) VALUES
  (1,'FIRST_TOUCH','100% credit to the first touchpoint'),
  (2,'LAST_TOUCH','100% credit to the last touchpoint before conversion'),
  (3,'LINEAR','Equal credit to every touchpoint'),
  (4,'TIME_DECAY','More credit to touchpoints closer to conversion');

-- ---------- indexes ----------
CREATE INDEX idx_touchpoint_visitor_time   ON touchpoint (visitor_id, touched_at);
CREATE INDEX idx_touchpoint_ad             ON touchpoint (ad_id);
CREATE INDEX idx_touchpoint_session        ON touchpoint (session_id);
CREATE INDEX idx_session_visitor_start     ON session (visitor_id, started_at);
CREATE INDEX idx_campaign_adv_status       ON campaign (advertiser_id, status);
CREATE INDEX idx_funnel_event_session_stage ON funnel_event (session_id, stage_id);
CREATE INDEX idx_credit_conversion_model   ON attribution_credit (conversion_id, model_id);
CREATE INDEX idx_conversion_visitor        ON conversion (visitor_id);
CREATE INDEX idx_audit_campaign_time       ON campaign_audit_log (campaign_id, changed_at DESC);
