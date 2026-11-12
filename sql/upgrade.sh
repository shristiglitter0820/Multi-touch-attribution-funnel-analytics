#!/usr/bin/env bash
# Upgrade an EXISTING database (created by the previous kit, v2) to the integrated version. Non-destructive:
# no table is dropped and no data is deleted; every file is idempotent. Back the database up first:
#   pg_dump <db> > backup_before_integration.sql
# Usage: ./upgrade.sh <db_name> <app_role_password> [psql connection flags]
#   LOAD_MEMBER1_DEMO=1   also load Member 1's sample scenario
set -euo pipefail
DB="${1:?db name}"; PW="${2:?app role password}"; shift 2
P="psql -v ON_ERROR_STOP=1 -d $DB $*"
echo ">> 03_funnel_functions.sql (CREATE OR REPLACE: funnel clamp)"; $P -q -f 03_funnel_functions.sql
for f in 06b_integration_schema 06c_journey_attribution 06d_analytics_views; do echo ">> $f.sql"; $P -q -f "$f.sql"; done
echo ">> 07_roles.sql"; $P -q -v app_pw="$PW" -f 07_roles.sql
echo ">> 12_member1_demo.sql"; $P -q -f 12_member1_demo.sql
if [ "${LOAD_MEMBER1_DEMO:-0}" = "1" ]; then $P -q -At -c "SELECT fn_load_member1_demo();"; fi
echo ">> funnel snapshot"; $P -q -c "CALL sp_build_funnel_snapshot(current_date);"
echo "Upgrade complete."
