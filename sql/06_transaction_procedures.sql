-- =====================================================================
-- 06_transaction_procedures.sql  -  Transactional operations (Member 2)
-- Each CALL runs as one atomic transaction: any RAISE rolls everything back.
-- =====================================================================
CREATE OR REPLACE PROCEDURE sp_update_campaign_budget(
    p_campaign_id INT, p_new_budget NUMERIC, p_user_id INT)
LANGUAGE plpgsql AS $$
DECLARE
    v_role TEXT; v_user_adv INT; v_camp_adv INT;
BEGIN
    SELECT role, advertiser_id INTO v_role, v_user_adv
    FROM app_user WHERE user_id = p_user_id AND is_active;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unknown or inactive user %', p_user_id;
    END IF;
    IF v_role <> 'ADMIN' THEN
        RAISE EXCEPTION 'Only ADMIN users may modify budgets' USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT advertiser_id INTO v_camp_adv
    FROM campaign WHERE campaign_id = p_campaign_id FOR UPDATE;      -- row lock
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Campaign % not found', p_campaign_id;
    END IF;
    IF v_camp_adv <> v_user_adv THEN
        RAISE EXCEPTION 'Campaign belongs to another advertiser' USING ERRCODE = 'insufficient_privilege';
    END IF;

    PERFORM set_config('app.current_user_id', p_user_id::text, true);  -- for the audit trigger
    UPDATE campaign SET total_budget = p_new_budget WHERE campaign_id = p_campaign_id;
    -- trg_campaign_budget_guard rejects values below the amount already spent
END $$;

-- Move budget between two campaigns atomically (classic transaction demo)
CREATE OR REPLACE PROCEDURE sp_transfer_budget(
    p_from INT, p_to INT, p_amount NUMERIC, p_user_id INT)
LANGUAGE plpgsql AS $$
DECLARE
    v_role TEXT; v_user_adv INT; v_cnt INT;
BEGIN
    IF p_amount <= 0 THEN RAISE EXCEPTION 'Transfer amount must be positive'; END IF;
    IF p_from = p_to  THEN RAISE EXCEPTION 'Source and target campaign must differ'; END IF;

    SELECT role, advertiser_id INTO v_role, v_user_adv
    FROM app_user WHERE user_id = p_user_id AND is_active;
    IF NOT FOUND OR v_role <> 'ADMIN' THEN
        RAISE EXCEPTION 'Only ADMIN users may transfer budget' USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- lock both rows in a fixed order to avoid deadlocks
    SELECT COUNT(*) INTO v_cnt FROM (
        SELECT 1 FROM campaign
        WHERE campaign_id IN (p_from, p_to) AND advertiser_id = v_user_adv
        ORDER BY campaign_id FOR UPDATE) l;
    IF v_cnt <> 2 THEN
        RAISE EXCEPTION 'Both campaigns must exist and belong to your advertiser';
    END IF;

    PERFORM set_config('app.current_user_id', p_user_id::text, true);
    UPDATE campaign SET total_budget = total_budget - p_amount WHERE campaign_id = p_from;  -- guard trigger may abort
    UPDATE campaign SET total_budget = total_budget + p_amount WHERE campaign_id = p_to;
END $$;
