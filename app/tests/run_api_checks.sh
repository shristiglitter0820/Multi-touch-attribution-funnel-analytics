#!/usr/bin/env bash
# Creates a campaign owned by a DIFFERENT advertiser (to test tenant isolation), runs the API checks, cleans up.
# Uses plain `psql` and the standard PG* environment variables (PGUSER, PGHOST, PGPASSWORD, PGPORT).
# On a Homebrew Mac the default superuser is your macOS user, so just:   DB=adtech_test_db ./tests/run_api_checks.sh
set -uo pipefail
DB="${DB:-adtech}"
run_sql() { psql -At -d "$DB" -c "$1"; }
run_sql "INSERT INTO advertiser(name) VALUES ('Other Co') ON CONFLICT DO NOTHING" >/dev/null
OTHER=$(run_sql "SELECT advertiser_id FROM advertiser WHERE name='Other Co'")
ADMIN_ID=$(run_sql "SELECT user_id FROM app_user WHERE email='admin@acme.test'")
FID=$(run_sql "INSERT INTO campaign(advertiser_id,created_by,name,total_budget,start_date,end_date,status) VALUES ($OTHER,$ADMIN_ID,'Foreign campaign',100,current_date,current_date+1,'ACTIVE') ON CONFLICT (advertiser_id,name) DO UPDATE SET status='ACTIVE' RETURNING campaign_id" | head -1)
FOREIGN_CAMPAIGN_ID=$FID BASE="${BASE:-http://localhost:3100}" node "$(dirname "$0")/api_checks.mjs"
