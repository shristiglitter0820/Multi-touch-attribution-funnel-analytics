-- =====================================================================
-- 08_tests.sql  -  Automated checks for Member 2's database work.
-- Run as superuser:  psql -d adtech -f 08_tests.sql
-- Everything runs inside a transaction that is ROLLED BACK at the end.
-- Each check prints  PASS / FAIL  (a FAIL aborts the script).
-- =====================================================================
\set ON_ERROR_STOP on
\set QUIET on
SET client_min_messages = notice;
BEGIN;

-- T1: funnel is non-increasing and starts with impressions.
-- INTEGRATION NOTE: scoped to the DEV-SEED campaigns. Member 1's sample scenario (12_member1_demo.sql) legitimately contains
-- a click with no recorded impression (Festive Instagram Campaign: CLICK 1 > IMPRESSION 0), so "impressions >= clicks" is a
-- property of the dev seed, not of arbitrary real data. Well-formedness for ALL campaigns is checked in T1b below, and the clamp
-- that keeps such anomalies displayable is tested in T23.
DO $$
DECLARE r RECORD; bad INT;
BEGIN
  FOR r IN SELECT campaign_id FROM campaign WHERE name NOT IN ('Summer Sale Campaign', 'Festive Instagram Campaign') LOOP
    SELECT COUNT(*) INTO bad FROM (
      SELECT visitors, LAG(visitors) OVER (ORDER BY stage_order) AS prev FROM fn_campaign_funnel(r.campaign_id)) x
    WHERE prev IS NOT NULL AND visitors > prev;
    IF bad > 0 THEN RAISE EXCEPTION 'T1 FAIL: funnel not monotonic for campaign %', r.campaign_id; END IF;
  END LOOP;
  RAISE NOTICE 'T1 PASS  funnel is monotonic for every dev-seed campaign';
END $$;

-- T1b: for ALL campaigns (including Member 1's demo campaigns) the funnel is well-formed: five ordered stages, no negative
-- counts, percentages inside 0..100. (Member 1's order ORD1002 goes straight from click to purchase with no visit/cart
-- event, so stage counts are not guaranteed to shrink; they are only what was recorded.)
DO $$
DECLARE r RECORD; bad INT; n INT;
BEGIN
  FOR r IN SELECT campaign_id FROM campaign LOOP
    SELECT COUNT(*), COUNT(*) FILTER (WHERE visitors < 0 OR dropoff_pct < 0 OR dropoff_pct > 100 OR pct_of_previous < 0 OR pct_of_previous > 100)
      INTO n, bad FROM fn_campaign_funnel(r.campaign_id);
    IF n <> 5 OR bad > 0 THEN RAISE EXCEPTION 'T1b FAIL: funnel malformed for campaign % (% stages, % bad rows)', r.campaign_id, n, bad; END IF;
  END LOOP;
  RAISE NOTICE 'T1b PASS funnel is well-formed (5 stages, counts >= 0, percentages within 0..100) for every campaign';
END $$;

-- T2: snapshot procedure writes 5 stages per campaign and is idempotent
DO $$
DECLARE n1 INT; n2 INT;
BEGIN
  CALL sp_build_funnel_snapshot(current_date);
  SELECT COUNT(*) INTO n1 FROM campaign_funnel_snapshot WHERE snapshot_date = current_date;
  CALL sp_build_funnel_snapshot(current_date);
  SELECT COUNT(*) INTO n2 FROM campaign_funnel_snapshot WHERE snapshot_date = current_date;
  IF n1 <> 5 * (SELECT COUNT(*) FROM campaign
              WHERE status IN ('ACTIVE','PAUSED','ENDED'))
   OR n1 <> n2 THEN
    RAISE EXCEPTION 'T2 FAIL: snapshot rows % / % ', n1, n2; END IF;
  RAISE NOTICE 'T2 PASS  snapshot procedure complete and idempotent (% rows)', n1;
END $$;

-- T3: ANALYST cannot change budgets through the procedure
DO $$
DECLARE v_an INT := (SELECT user_id FROM app_user WHERE role = 'ANALYST' LIMIT 1);
BEGIN
  BEGIN
    CALL sp_update_campaign_budget(1, 999, v_an);
    RAISE EXCEPTION 'T3 FAIL: analyst was allowed to change budget';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'T3 PASS  analyst blocked by procedure';
  END;
END $$;

-- T4: ADMIN can change budget, and the audit trigger records who did it
DO $$
DECLARE v_ad INT := (SELECT user_id FROM app_user WHERE role = 'ADMIN' LIMIT 1); v_b NUMERIC; v_by INT;
BEGIN
  CALL sp_update_campaign_budget(1, 450, v_ad);
  SELECT total_budget INTO v_b FROM campaign WHERE campaign_id = 1;
  SELECT changed_by INTO v_by FROM campaign_audit_log
   WHERE campaign_id = 1 AND action = 'UPDATE' ORDER BY audit_id DESC LIMIT 1;
  IF v_b <> 450 OR v_by IS DISTINCT FROM v_ad THEN RAISE EXCEPTION 'T4 FAIL: budget % audit_by %', v_b, v_by; END IF;
  RAISE NOTICE 'T4 PASS  admin updated budget; audit row has changed_by = %', v_by;
END $$;

-- T5: budget below amount already spent is rejected (check_violation), value unchanged
DO $$
DECLARE v_ad INT := (SELECT user_id FROM app_user WHERE role = 'ADMIN' LIMIT 1); v_b NUMERIC;
BEGIN
  BEGIN
    CALL sp_update_campaign_budget(3, 1, v_ad);   -- campaign 3 has spent far more than 1
    RAISE EXCEPTION 'T5 FAIL: budget below spend accepted';
  EXCEPTION WHEN check_violation THEN
    SELECT total_budget INTO v_b FROM campaign WHERE campaign_id = 3;
    IF v_b <> 150 THEN RAISE EXCEPTION 'T5 FAIL: budget changed to %', v_b; END IF;
    RAISE NOTICE 'T5 PASS  guard trigger rejected under-spend budget';
  END;
END $$;

-- T6: transfer is atomic - a failing transfer leaves BOTH budgets untouched; a valid one conserves the total
DO $$
DECLARE v_ad INT := (SELECT user_id FROM app_user WHERE role = 'ADMIN' LIMIT 1);
        b2 NUMERIC; b3 NUMERIC; t_before NUMERIC; t_after NUMERIC;
BEGIN
  SELECT total_budget INTO b2 FROM campaign WHERE campaign_id = 2;
  SELECT total_budget INTO b3 FROM campaign WHERE campaign_id = 3;
  BEGIN
    CALL sp_transfer_budget(3, 2, 140, v_ad);     -- would push campaign 3 below its spend
    RAISE EXCEPTION 'T6 FAIL: invalid transfer accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF (SELECT total_budget FROM campaign WHERE campaign_id = 2) <> b2
     OR (SELECT total_budget FROM campaign WHERE campaign_id = 3) <> b3 THEN
    RAISE EXCEPTION 'T6 FAIL: budgets changed after failed transfer'; END IF;
  SELECT SUM(total_budget) INTO t_before FROM campaign WHERE campaign_id IN (2,3);
  CALL sp_transfer_budget(2, 3, 20, v_ad);
  SELECT SUM(total_budget) INTO t_after FROM campaign WHERE campaign_id IN (2,3);
  IF t_before <> t_after THEN RAISE EXCEPTION 'T6 FAIL: total not conserved'; END IF;
  RAISE NOTICE 'T6 PASS  failed transfer rolled back; valid transfer conserves total budget';
END $$;

-- T7: auto-pause trigger when spend reaches the budget
DO $$
DECLARE v_st TEXT; v_b NUMERIC;
BEGIN
  SELECT total_budget - COALESCE((SELECT SUM(amount) FROM campaign_daily_spend WHERE campaign_id = 2), 0)
    INTO v_b FROM campaign WHERE campaign_id = 2;
  INSERT INTO campaign_daily_spend (campaign_id, channel_id, spend_date, amount)
  VALUES (2, 5, current_date + 30, v_b);
  SELECT status INTO v_st FROM campaign WHERE campaign_id = 2;
  IF v_st <> 'PAUSED' THEN RAISE EXCEPTION 'T7 FAIL: status is %', v_st; END IF;
  RAISE NOTICE 'T7 PASS  campaign auto-paused when budget exhausted';
END $$;

-- T8: campaigns cannot be deleted
DO $$
BEGIN
  BEGIN
    DELETE FROM campaign WHERE campaign_id = 1;
    RAISE EXCEPTION 'T8 FAIL: campaign deleted';
  EXCEPTION WHEN restrict_violation THEN
    RAISE NOTICE 'T8 PASS  hard delete of campaign blocked';
  END;
END $$;

-- T9: database-level roles - analyst is read-only and cannot read credentials
DO $$
BEGIN
  SET LOCAL ROLE adtech_analyst;
  BEGIN
    UPDATE campaign SET total_budget = 1 WHERE campaign_id = 1;
    RESET ROLE; RAISE EXCEPTION 'T9a FAIL: analyst could UPDATE campaign';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM password_hash FROM app_user;
    RESET ROLE; RAISE EXCEPTION 'T9b FAIL: analyst could read app_user';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM 1 FROM v_campaign_overview;             -- allowed
  RESET ROLE;
  RAISE NOTICE 'T9 PASS  analyst role: read-only, no access to credentials';
END $$;

-- T10: procedures work when called AS the admin database role (privileges are sufficient),
--      and even the admin role cannot read password hashes
DO $$
DECLARE v_ad INT := (SELECT user_id FROM app_user WHERE role = 'ADMIN' LIMIT 1);
BEGIN
  SET LOCAL ROLE adtech_admin;
  CALL sp_update_campaign_budget(1, 600, v_ad);
  CALL sp_transfer_budget(1, 2, 10, v_ad);
  CALL sp_build_funnel_snapshot(current_date);
  BEGIN
    PERFORM password_hash FROM app_user;
    RESET ROLE; RAISE EXCEPTION 'T10 FAIL: admin role could read password_hash';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
  RAISE NOTICE 'T10 PASS admin role can run budget/snapshot procedures; password_hash stays hidden';
END $$;

-- T11: audit view - admin can read it and sees WHAT changed; analyst cannot read it
DO $$
DECLARE v_ad INT := (SELECT user_id FROM app_user WHERE role = 'ADMIN' LIMIT 1); v_new TEXT; v_old TEXT; v_who TEXT;
BEGIN
  SET LOCAL ROLE adtech_admin;
  CALL sp_update_campaign_budget(1, 777, v_ad);
  SELECT changes->'total_budget'->>'new', changes->'total_budget'->>'old', changed_by_name
    INTO v_new, v_old, v_who
  FROM v_campaign_audit WHERE campaign_id = 1 AND action = 'UPDATE' ORDER BY audit_id DESC LIMIT 1;
  RESET ROLE;
  IF v_new::numeric <> 777 OR v_old IS NULL OR v_who IS NULL THEN RAISE EXCEPTION 'T11 FAIL: new=% old=% who=%', v_new, v_old, v_who; END IF;
  SET LOCAL ROLE adtech_analyst;
  BEGIN
    PERFORM 1 FROM v_campaign_audit;
    RESET ROLE; RAISE EXCEPTION 'T11 FAIL: analyst could read the audit view';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
  RAISE NOTICE 'T11 PASS  audit view shows old/new values and actor to admin; analyst denied';
END $$;

-- T12: admin role can create a campaign (INSERT is audited) and manage ads; ads with tracked events cannot be deleted
DO $$
DECLARE v_ad INT := (SELECT user_id FROM app_user WHERE role = 'ADMIN' LIMIT 1); v_adv INT; v_c INT; v_a INT; v_used INT; n INT;
BEGIN
  SELECT advertiser_id INTO v_adv FROM app_user WHERE user_id = v_ad;
  PERFORM set_config('app.current_user_id', v_ad::text, true);
  SET LOCAL ROLE adtech_admin;
  INSERT INTO campaign (advertiser_id, created_by, name, total_budget, start_date, end_date, status)
    VALUES (v_adv, v_ad, 'T12 Campaign', 100, current_date, current_date + 5, 'DRAFT') RETURNING campaign_id INTO v_c;
  INSERT INTO ad (campaign_id, channel_id, ad_name, pricing_model, unit_cost) VALUES (v_c, 1, 'T12 Ad', 'CPC', 0.5) RETURNING ad_id INTO v_a;
  UPDATE ad SET unit_cost = 0.75 WHERE ad_id = v_a;
  DELETE FROM ad WHERE ad_id = v_a;                                   -- no events: allowed
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RESET ROLE; RAISE EXCEPTION 'T12 FAIL: delete of unused ad affected % rows', n; END IF;
  RESET ROLE;
  IF NOT EXISTS (SELECT 1 FROM campaign_audit_log WHERE campaign_id = v_c AND action = 'INSERT' AND changed_by = v_ad) THEN
    RAISE EXCEPTION 'T12 FAIL: campaign INSERT not audited'; END IF;
  SELECT ad_id INTO v_used FROM touchpoint WHERE ad_id IS NOT NULL LIMIT 1;
  BEGIN
    SET LOCAL ROLE adtech_admin;
    DELETE FROM ad WHERE ad_id = v_used;
    RESET ROLE; RAISE EXCEPTION 'T12 FAIL: ad with tracked events was deleted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RESET ROLE;
  RAISE NOTICE 'T12 PASS  admin created campaign (audited) and ad; unused ad deleted; ad with events protected by CHECK';
END $$;

-- T13: snapshot refresh stamps snapshot_date in the dashboard view
DO $$
DECLARE d DATE;
BEGIN
  CALL sp_build_funnel_snapshot(current_date);
  SELECT MAX(snapshot_date) INTO d FROM v_campaign_overview;
  IF d IS DISTINCT FROM current_date THEN RAISE EXCEPTION 'T13 FAIL: snapshot_date = %', d; END IF;
  RAISE NOTICE 'T13 PASS  v_campaign_overview exposes the latest snapshot_date (%)', d;
END $$;

-- T14: EXECUTE on the budget / snapshot procedures is denied to the analyst database role
DO $$
DECLARE v_ad INT := (SELECT user_id FROM app_user WHERE role = 'ADMIN' LIMIT 1);
BEGIN
  SET LOCAL ROLE adtech_analyst;
  BEGIN
    CALL sp_update_campaign_budget(1, 999, v_ad);
    RESET ROLE; RAISE EXCEPTION 'T14 FAIL: analyst executed sp_update_campaign_budget';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    CALL sp_transfer_budget(1, 2, 5, v_ad);
    RESET ROLE; RAISE EXCEPTION 'T14 FAIL: analyst executed sp_transfer_budget';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    CALL sp_build_funnel_snapshot(current_date);
    RESET ROLE; RAISE EXCEPTION 'T14 FAIL: analyst executed sp_build_funnel_snapshot';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
  RAISE NOTICE 'T14 PASS  analyst role cannot EXECUTE budget or snapshot procedures';
END $$;

ROLLBACK;
\echo All tests finished (changes rolled back).
