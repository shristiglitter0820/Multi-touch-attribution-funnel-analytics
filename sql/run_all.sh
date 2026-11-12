#!/usr/bin/env bash
# Fresh install of the complete integrated database (PostgreSQL 16).
# Usage: ./run_all.sh <db_name> <app_role_password> [psql connection flags]
#   SKIP_MEMBER1_DEMO=1   do not load Member 1's sample scenario (12_member1_demo.sql)
# Run order matters: tables -> seed -> functions -> views -> triggers -> procedures -> integration -> roles -> demo -> snapshot.
set -euo pipefail
DB="${1:?db name}"; PW="${2:?app role password}"; shift 2
P="psql -v ON_ERROR_STOP=1 -d $DB $*"
for f in 01_schema 02_seed_dev 03_funnel_functions 04_views 05_triggers 06_transaction_procedures \
         06b_integration_schema 06c_journey_attribution 06d_analytics_views; do
  echo ">> $f.sql"; $P -q -f "$f.sql"
done
echo ">> 07_roles.sql"; $P -q -v app_pw="$PW" -f 07_roles.sql
echo ">> 12_member1_demo.sql"; $P -q -f 12_member1_demo.sql
if [ "${SKIP_MEMBER1_DEMO:-0}" != "1" ]; then $P -q -At -c "SELECT fn_load_member1_demo();"; fi
echo ">> funnel snapshot"; $P -q -c "CALL sp_build_funnel_snapshot(current_date);"
echo "All done."
