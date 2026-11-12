# Ad Attribution & Funnel Analytics Engine: integrated project (Member 1 + Member 2)

PostgreSQL 16 + MongoDB + Next.js 16. **Start with `docs/INTEGRATION.md`** (architecture, Mac setup, test results, limitations).

```
sql/                 01..07 schema, seed, funnel, views, triggers, procedures, integration (06b-06d), roles; 08/09 tests; 12 Member 1 demo; run_all.sh, upgrade.sh
app/                 Next.js sources to copy over your project (pages, API routes, components, lib, proxy.ts, tests/)
tools/               ui_audit.py (computed WCAG contrast + overflow audit), palette_check.py
docs/                INTEGRATION.md, INTEGRATION_DEPENDENCIES.md, screenshots/
member1-original/    Member 1's handoff, unchanged, for reference only (not run)
```

## Quick start
1. Fresh database: `createdb adtech && cd sql && ./run_all.sh adtech "<app role password>"`  (set `SKIP_MEMBER1_DEMO=1` to skip Member 1's sample scenario)
   Existing database from the previous kit: `cd sql && ./upgrade.sh adtech "<same password>"`  (back up first: `pg_dump adtech > backup.sql`)
2. Tests: `psql -d adtech -f 08_tests.sql` (15 PASS) and `psql -d adtech -f 09_integration_tests.sql` (10 PASS); both roll back.
3. MongoDB running locally (`brew services start mongodb-community@7.0`).
4. In your Next.js project: copy `app/*` over it, `npm install pg jose bcryptjs zod recharts mongodb`, copy `.env.example` to `.env.local` and fill in `DATABASE_URL`, `JWT_SECRET`, `MONGODB_URI`, `MONGODB_DB`, `INGEST_API_KEY` (never commit `.env.local`).
5. `npm run dev`, sign in (`admin@acme.test / Admin@123`, `analyst@acme.test / Analyst@123`, dev seed only).

## Pages
| URL | Who | Purpose |
|---|---|---|
| /dashboard | ADMIN, ANALYST | budgets, funnel (live or snapshot, date filters), drop-off |
| /attribution | ADMIN, ANALYST | spend, CTR, conversion rate, ROI per campaign; revenue by channel under first / last / linear touch |
| /admin/campaigns, /admin/ads | ADMIN | campaign and ad management (ad ids are shown for event senders) |
| /admin/events | ADMIN | synchronise MongoDB events, run history, rejected events with reasons |
| /admin/audit | ADMIN | campaign audit trail |

## APIs
`POST /api/events` (x-api-key), `POST /api/events/sync` (ADMIN session or x-api-key), `GET /api/health` (public), `GET /api/analytics/roi?model=`, `GET /api/analytics/attribution?campaign_id=`, `GET /api/admin/events`, plus all earlier routes (`/api/campaigns`, `/api/campaigns/:id/funnel`, `/api/admin/*`, `/api/snapshot`, `/api/lookups`, `/api/auth/*`).

## Environment variables
| Variable | Purpose |
|---|---|
| DATABASE_URL | PostgreSQL login role `adtech_app` |
| JWT_SECRET | session signing, 32+ characters |
| MONGODB_URI, MONGODB_DB | raw event store (default db `adtech_analytics`, collection `ad_events`) |
| INGEST_API_KEY | key for `x-api-key`; if unset, ingestion refuses everyone |
| NEXT_PUBLIC_CURRENCY | display currency (USD default, INR, ...) |
