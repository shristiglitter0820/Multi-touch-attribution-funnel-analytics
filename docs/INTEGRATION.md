# Member 1 + Member 2 integration

PostgreSQL 16, Next.js 16, MongoDB. Canonical schema = Member 2's (17 tables). Member 1's behaviour was ported onto it.
Member 1's original handoff is kept unchanged in `member1-original/` for reference (it is no longer run).

## 1. Architecture

```
 ad server / tracker                 browser (ADMIN / ANALYST)
        |  POST /api/events                |  pages + /api/*  (signed session cookie)
        |  x-api-key = INGEST_API_KEY      |
        v                                  v
  +---------------------------- Next.js (one backend, one pg pool, one Mongo client) ----------------------------+
  | proxy.ts: session gate, ADMIN gate for /admin + /api/admin; /api/events = API key; /api/events/sync = ADMIN or key |
  +------------+------------------------------------------------------------+----------------------------------+
               | MongoDB  adtech_analytics.ad_events                        | PostgreSQL  adtech
               |  raw events, immutable                                     |  SET LOCAL ROLE adtech_admin | adtech_analyst | adtech_ingest
               v                                                            v
   POST /api/events/sync:  read new docs (received_at high-water mark, 10-min overlap)
        -> INSERT staged_event (PK = Mongo _id, ON CONFLICT DO NOTHING)            [adtech_ingest]
        -> fn_process_staged_events()  (SECURITY DEFINER, one sub-transaction per event)
             visitor (external_user_id) -> session (30-min inactivity) -> touchpoint / funnel_event
             -> conversion -> fn_attribute_conversion (FIRST_TOUCH, LAST_TOUCH, LINEAR) -> fn_refresh_campaign_spend
        -> views v_campaign_roi, v_attribution_by_channel, v_funnel_latest ... -> dashboard pages
```

## 2. How Member 1's concepts map onto the canonical schema

| Member 1 | Canonical (Member 2) | Notes |
|---|---|---|
| app_role, app_user (logins **and** customers) | app_user (logins, bcrypt) + **visitor** (end users) | integer `user_id` in events -> `visitor.external_user_id`; visitors are created on first event |
| advertiser, campaign, ad, channel | same names, richer columns | status ACTIVE/PAUSED/COMPLETED -> DRAFT/ACTIVE/PAUSED/ENDED; channels matched **by name**, three added (Google Ads, Instagram, Facebook) |
| user_session | session | built by the 30-minute rule (Member 1's sync never created sessions) |
| ad_interaction IMPRESSION/CLICK | touchpoint | CLICK also opens/joins a session |
| ad_interaction VISIT/ADD_TO_CART | funnel_event (stage 3 / 4) | |
| conversion | conversion + funnel_event stage 5 | revenue >= 0, order ref up to 100 chars, several orders per session allowed |
| attribution (interaction_id, model text) | attribution_credit (touchpoint_id, model_id) | `credit_weight` widened to numeric(8,6) |
| campaign_spend (typed by hand) | campaign_daily_spend (**computed**) | clicks x CPC and impressions/1000 x CPM, see `fn_refresh_campaign_spend` |

## 3. Attribution rule (verified against Member 1's data)
Member 1's attribution SQL was not in the handoff. The rule was recovered from their sample results and **reproduces all 14 sample rows exactly**:
touches = the visitor's IMPRESSION and CLICK touchpoints that have an ad, at or before the conversion time.
FIRST_TOUCH = earliest (100%), LAST_TOUCH = latest (100%), LINEAR = 1/n each (revenue rounded to 2 decimals; any remainder goes to the latest touch).
Now automatic: every purchase that is synchronised is attributed inside the same transaction. `TIME_DECAY` exists in the lookup table but is not implemented. No look-back window (same as the sample).

## 4. Files changed
New SQL: `06b_integration_schema.sql`, `06c_journey_attribution.sql`, `06d_analytics_views.sql`, `09_integration_tests.sql`, `12_member1_demo.sql`, `upgrade.sh`.
Modified SQL: `03_funnel_functions.sql` (clamp: drop-off never negative, continue-rate never > 100), `07_roles.sql` (new `adtech_ingest` role + grants), `08_tests.sql` (T1 scoped, T1b added, see section 8), `run_all.sh`.
**Unchanged:** `01_schema.sql`, `02_seed_dev.sql`, `04_views.sql`, `05_triggers.sql`, `06_transaction_procedures.sql` (all existing tables, views, triggers, procedures, and the audit-log view/permissions).
New app files: `lib/{events,mongo,ingest-auth}.ts`, `app/api/{health,events,events/sync,admin/events,analytics/roi,analytics/attribution}/route.ts`, pages `attribution/` and `admin/events/`, tests `tests/integration_flow.mjs`.
Modified app files: `proxy.ts`, `lib/db.ts` (+`withIngest`), `components/{AppShell,charts,ui}.tsx`, `admin/ads/AdsClient.tsx` (shows ad id), `.env.example`, `tests/{ui_e2e.py,run_api_checks.sh}`.

## 5. Setup on your Mac (Homebrew PostgreSQL 16)

**Read first:** database roles are cluster-wide. `07_roles.sql` sets the password of `adtech_app`, so use the SAME password as in your `.env.local` for every run (also for test databases), or you will change the password your running app uses.

```bash
# 0. BACKUP (no Git repo here)
cd ~/Documents && cp -R member2_project member2_project_backup_before_integration
pg_dump adtech > ~/Documents/adtech_backup_before_integration.sql

# 1. MongoDB
brew tap mongodb/brew && brew install mongodb-community@7.0 && brew services start mongodb-community@7.0

# 2. Put the new files in place: copy sql/ over your sql folder, and the contents of app/ over your Next.js project folder
#    (the folder that contains app/, components/, lib/, proxy.ts). Nothing existing is deleted.
cd <your Next.js project> && npm install mongodb
chmod +x <sql folder>/run_all.sh <sql folder>/upgrade.sh <your project>/tests/run_api_checks.sh

# 3. TEST 1 - fresh install on a separate database
cd <sql folder>
createdb adtech_integration_test
./run_all.sh adtech_integration_test "<your adtech_app password>"
psql -d adtech_integration_test -f 08_tests.sql        # expect 15 PASS
psql -d adtech_integration_test -f 09_integration_tests.sql   # expect 10 PASS

# 4. TEST 2 - upgrade a COPY of your real database (stop `npm run dev` first, createdb -T needs no open connections)
createdb -T adtech adtech_upgrade_test
LOAD_MEMBER1_DEMO=1 ./upgrade.sh adtech_upgrade_test "<your adtech_app password>"
psql -d adtech_upgrade_test -f 08_tests.sql && psql -d adtech_upgrade_test -f 09_integration_tests.sql

# 5. Upgrade your real database (optional demo: LOAD_MEMBER1_DEMO=1)
./upgrade.sh adtech "<your adtech_app password>"
```
`.env.local` additions:
```
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB=adtech_analytics
INGEST_API_KEY=<output of: openssl rand -hex 32>
NEXT_PUBLIC_CURRENCY=USD        # or INR (display only)
```
Run: `npm run dev`, sign in as admin, open **Events**, and send an event:
```bash
curl -X POST http://localhost:3000/api/events -H "Content-Type: application/json" -H "x-api-key: $INGEST_API_KEY" \
  -d '{"user_id": 3, "event_type": "CLICK", "channel": "Instagram", "ad_id": <id from the Ads page>}'
```
then press **Synchronise events now** (or `curl -X POST .../api/events/sync -H "x-api-key: $INGEST_API_KEY"`). Event ids must be real ad ids (shown on the Ads page; they differ from Member 1's 1-4).

Automated suites against a test database (never your live one): start a second app instance with
`DATABASE_URL=postgresql://adtech_app:<pw>@localhost:5432/adtech_integration_test MONGODB_DB=adtech_test INGEST_API_KEY=<key> npm run dev -- -p 3100`, then
`DB=adtech_integration_test BASE=http://localhost:3100 ./tests/run_api_checks.sh`,
`E2E_WITH_MONGO=1 python3 tests/ui_e2e.py http://localhost:3100`,
`BASE=http://localhost:3100 MONGODB_DB=adtech_test INGEST_API_KEY=<key> node tests/integration_flow.mjs` (this script clears `ad_events` in the DB named *test* only).

## 6. What was verified (my sandbox: PostgreSQL 16.15, Node 22, Next 16.4)
| Check | Result |
|---|---|
| Fresh PG16 install with `run_all.sh`, no manual SQL | OK |
| `08_tests.sql` (T1-T14 + T1b) on fresh DB and on upgraded DB | 15 PASS / 0 FAIL on both |
| `09_integration_tests.sql` (T15-T24) on fresh DB and on upgraded DB | 10 PASS / 0 FAIL on both |
| Upgrade of a v2-era database (`upgrade.sh`) | all 11 existing tables byte-identical (checksums) before/after; 87/87 old conversions attributed |
| Existing API/authorization regression (91 checks) | 91 / 91 on fresh and on upgraded DB |
| Existing + new browser flows | 28 / 28 |
| MongoDB -> sync -> sessions -> conversion -> attribution -> analytics flow (56 checks) | 56 / 56 on fresh and on upgraded DB |
| Member 1 sample: FIRST/LAST/LINEAR | 14 / 14 rows identical (T18) |
| Contrast (WCAG AA) and horizontal overflow, 7 pages x 2 roles x 2 sizes x light/dark OS theme | 5,384 checks per theme, 0 failing |
| Failure modes: Mongo down (cold and warm), `INGEST_API_KEY` unset | clear 503s; unset key refuses all ingestion (fails closed) |

**Not tested:** real MongoDB (I used FerretDB 1.24, a Mongo-protocol server on PostgreSQL; `mongodb` driver calls used: insertOne/insertMany/find/sort/createIndex/deleteMany/countDocuments), macOS/Homebrew, a `psql` older/newer than 16.15, Node versions other than 22. Please run the Section 5 tests on your Mac.

## 7. Security
Ingestion needs `x-api-key` (constant-time compare, key only in env; refuses everyone if unset). Sync needs an ADMIN session or the key. The sync runs as the least-privilege DB role `adtech_ingest`: it can stage events, log runs and call the processor; it cannot read `app_user`, campaigns, conversions, or write any journey table directly (T24). Analysts read views only; the audit-log view stays admin-only; all earlier layers (proxy, guards, `SET LOCAL ROLE`, audit trigger) are unchanged.

## 8. Decisions, deviations and limitations (please read)
1. **Member 1's schema is not used.** Both schemas share table names with different columns and cannot coexist (verified). Their schema/server are preserved in `member1-original/`. Tell Member 1.
2. **Existing test changed:** `T1` ("funnel never grows") now covers the dev-seed campaigns only; Member 1's sample has a click with no impression (Festive campaign), which violates that invariant by nature. `T1b` checks well-formedness for all campaigns. No other existing test was changed.
3. **Constraints relaxed (as approved/needed):** `conversion.revenue >= 0` (was > 0); `order_ref` 100 chars (was 40); `conversion.session_id` no longer UNIQUE (Member 1's sample has two orders in session 3; `order_ref` stays UNIQUE).
4. **Behaviour differences from Member 1's server:** `GET /` health is now `GET /api/health`; events need an API key; unknown user ids create a visitor instead of being skipped; IMPRESSION/CLICK without a valid ad_id are rejected (with a reason) instead of stored; event time is the server receive time (as before); the sync no longer fails entirely because of one bad event.
5. **Spend is computed** from ad pricing; Member 1's typed `campaign_spend` rows were not migrated. The demo ads cost 1,000 per click so the computed spend equals their sample totals (3,000 and 1,000).
6. **Funnel counts only recorded events.** Member 1's ORD1002 has no visit/cart events, so PURCHASE can exceed CART for that campaign; percentages are clamped to 0-100.
7. Sessions: impressions do not open sessions; a purchase 31+ minutes after the last event is a separate session (still attributed through touchpoints).
8. Synchronisation is pull-based (button or API call); there is no scheduler. TIME_DECAY and a look-back window are not implemented.
9. Dev logins and the dev seed remain demo data (`admin@acme.test`, `analyst@acme.test`).

## 9. Message you can send to Member 1
> The integrated app uses Member 2's PostgreSQL schema as the single database (our tables had the same names but different columns, so both could not be loaded together). Your event API paths are unchanged (`POST /api/events`, `POST /api/events/sync`) and now live in the Next.js app, same port 3000; ingestion needs an `x-api-key` header. Your validation rules and messages were kept. Your attribution rule (first/last/linear over a user's impressions+clicks before the conversion) reproduces all 14 of your sample rows exactly and now runs automatically in SQL on every synchronised purchase. Sessions are built with a 30-minute inactivity rule. Please check: (1) Is it OK that your schema is replaced by ours? (2) Should IMPRESSION/CLICK without an ad_id be allowed? (3) Do you need a look-back window or TIME_DECAY? Your original code is in `member1-original/`.
