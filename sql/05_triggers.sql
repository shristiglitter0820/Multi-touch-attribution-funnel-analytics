-- =====================================================================
-- 05_triggers.sql  -  Triggers (Member 2)
--   1. trg_campaign_audit        : audit trail of campaign INSERT/UPDATE
--   2. trg_campaign_budget_guard : budget can never drop below spend so far
--   3. trg_campaign_no_delete    : campaigns are ended, never deleted
--   4. trg_pause_on_budget_spent : auto-pause when spend reaches the budget
-- The app sets the acting user with:  SET LOCAL app.current_user_id = '<id>'
-- =====================================================================
CREATE OR REPLACE FUNCTION fn_campaign_audit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_uid INT := NULLIF(current_setting('app.current_user_id', true), '')::int;
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO campaign_audit_log (campaign_id, changed_by, action, old_value, new_value)
        VALUES (NEW.campaign_id, v_uid, 'INSERT', NULL, to_jsonb(NEW));
    ELSIF TG_OP = 'UPDATE' AND to_jsonb(OLD) IS DISTINCT FROM to_jsonb(NEW) THEN
        INSERT INTO campaign_audit_log (campaign_id, changed_by, action, old_value, new_value)
        VALUES (NEW.campaign_id, v_uid, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW));
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER trg_campaign_audit
AFTER INSERT OR UPDATE ON campaign
FOR EACH ROW EXECUTE FUNCTION fn_campaign_audit();

-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_campaign_budget_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_spent NUMERIC;
BEGIN
    SELECT COALESCE(SUM(amount), 0) INTO v_spent
    FROM campaign_daily_spend WHERE campaign_id = NEW.campaign_id;
    IF NEW.total_budget < v_spent THEN
        RAISE EXCEPTION 'Budget % is below amount already spent (%) for campaign %',
              NEW.total_budget, v_spent, NEW.campaign_id
              USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER trg_campaign_budget_guard
BEFORE UPDATE OF total_budget ON campaign
FOR EACH ROW EXECUTE FUNCTION fn_campaign_budget_guard();

-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_campaign_no_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Campaigns cannot be deleted (audit history); set status = ENDED instead'
          USING ERRCODE = 'restrict_violation';
END $$;

CREATE TRIGGER trg_campaign_no_delete
BEFORE DELETE ON campaign
FOR EACH ROW EXECUTE FUNCTION fn_campaign_no_delete();

-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_pause_on_budget_spent() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_budget NUMERIC; v_spent NUMERIC;
BEGIN
    SELECT total_budget INTO v_budget FROM campaign WHERE campaign_id = NEW.campaign_id;
    SELECT COALESCE(SUM(amount), 0) INTO v_spent
    FROM campaign_daily_spend WHERE campaign_id = NEW.campaign_id;
    IF v_spent >= v_budget THEN
        UPDATE campaign SET status = 'PAUSED'
        WHERE campaign_id = NEW.campaign_id AND status = 'ACTIVE';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER trg_pause_on_budget_spent
AFTER INSERT OR UPDATE OF amount ON campaign_daily_spend
FOR EACH ROW EXECUTE FUNCTION fn_pause_on_budget_spent();
