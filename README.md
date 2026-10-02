# 5S Management System

A role-based web application that digitises the complete 5S lifecycle for a manufacturing organisation:

**Application → APU → Zone → Audit Planner → Work Order & Execution → Checksheet scoring → Findings → Corrective Action Register → Verification → Closure → Audit summary → Dashboard → Reports**

It ships in two editions that share one code base (`src/`):

| Edition | What it is | Data store |
|---|---|---|
| **Demo (single file)** `dist/fives-artifact.html` | Runs inside Claude as a shared, multi-viewer demo. | Claude shared database |
| **Server (full stack)** `server/` | Node.js / Express REST API + PostgreSQL + the same web app as an installable PWA. Docker-ready, can run on a local server. | PostgreSQL + file storage |

## Quick start (server edition)

Requirements: Node.js 18+ and PostgreSQL 14+ (or just Docker).

```bash
# 1. database
createdb fives                      # or use docker compose (below)
# 2. install + schema + demo data
cd server
npm install
export DATABASE_URL=postgres://user:pass@localhost:5432/fives
export JWT_SECRET=$(openssl rand -hex 48)
npm run setup                       # applies db/schema.sql, loads demo organisation
npm start                           # http://localhost:3000
```

**Docker:** `cp server/.env.example server/.env`, set `JWT_SECRET` and `POSTGRES_PASSWORD`, then
`cd server && docker compose up -d --build` → http://localhost:3000.
`docker compose --profile https up -d` adds a Caddy reverse proxy with automatic HTTPS for `SITE_ADDRESS`.
(Set `SEED_DEMO=false` once you load your own organisation.)

**Demo accounts** (password `Demo@123`):

| Employee ID | Role | Notes |
|---|---|---|
| APS1001 | System Administrator | everything |
| APS1010 | 5S Facilitator | Copper APU |
| APS1020 | Auditor | has open work orders, mobile-first execution |
| APS1103 | Zone Leader | zone CU-P03 (score drop + repeat findings story) |
| APS1207 | Zone Member | CU-P03 team |
| APS1002 | Management | read-only dashboards and reports |

Demo data: 2 plants, 4 APUs (Copper, Fiber, Power Electronics, Semiconductor), 24 zones, 96 users, 26 schedules, 152 work orders, 181 findings, 154 actions, overdue actions, repeat findings. `node scripts/seed.js --today=YYYY-MM-DD --reset` regenerates it relative to any date.

## Menu and dashboard (as requested)

Menu: **Master · User Role · Audit Planner · Work Order & Execution (with Audit Report) · Correction Action Register** (plus Dashboard, 5S Organization, Analytics, Reports, Audit Trail).
Master includes **NC Closure Timeline** (days to close by severity) and **Work Order Trigger Duration** (how many days before the planned date a work order is generated, per frequency).
Dashboard cards: **No. of Audits Plan vs Actual · No. of Findings · Open · Closed**. Charts: **APU Ranking (average score of the month) · Zone Leader % bar chart · Findings vs No. of Occurrences, zone-wise**, plus score trend, S1–S5, severity, aging, repeat findings.

## Architecture

```
browser (SPA, PWA)  ──REST/JSON──►  Express API  ──►  PostgreSQL
  IndexedDB outbox  ◄─ poll sync ─   auth · RBAC · validation ·    schema.sql: 37 tables, 43 FKs, 90+ indexes,
  (offline audits)                   scheduler · uploads · exports    append-only audit_logs, reporting views
                                          └──► photo storage (disk driver; S3/Azure driver = 3 functions)
```

* `src/` – web app (vanilla JS, no framework): `shared.js` scoring/dates, `app-core.js` store + domain, `page-*.js` screens, `adapter-api.js` talks to the server. `node build.js --server` bundles it into `server/public/index.html`; `node build.js` makes the single-file demo.
* `server/src/` – `app.js` routes, `repo.js` document ↔ relational mapping and scoping, `policy.js` authorisation and business rules, `services.js` numbering / audit submission / work-order generation, `dashboard.js` KPIs, `files.js` photographs, `auth.js`.
* `server/db/schema.sql` – the database (see `docs/DATABASE.md`).
* `seed/` – deterministic demo-data generator.

How data is stored: each business table has real key columns (PK, FKs, status, dates, owners) **and** a JSONB `data` column with the full record; detail tables (zone members, checklist questions, audit responses, audit scores, action history, action verifications …) are maintained in the same transaction on every write. This keeps the browser contract simple while SQL/BI tools query ordinary relational tables.

## Security

* Passwords: bcrypt (cost 10), complexity rule, lock-out after 5 failures (15 min), admin-set passwords are flagged for change, sessions revocable (reset/deactivate/change-password revoke them).
* JWT in an `httpOnly`, `SameSite=Strict` cookie (or `Authorization: Bearer`). Cookie-authenticated writes also need `X-Requested-With` (CSRF).
* Authorisation is enforced **on the server** per collection/record: role permission matrix, zone/APU/plant scoping on every read and sync, auditors only touch their own work orders, leaders only their zones, members only their actions.
* Business rules enforced server-side: mandatory questions, finding required below threshold, photo required, due date ≥ audit date, closed action requires verification, rejection needs remarks, N/A excluded from the denominator, audit locking, reopen with reason, immutable released checksheet versions.
* Audit trail is append-only (DB trigger blocks UPDATE/DELETE/TRUNCATE; the API refuses edits; entries are attributed to the signed-in user, IP recorded).
* Uploads: validated by content, re-encoded (EXIF stripped), size-limited, stored outside the DB, served only to users who may see the zone.
* Helmet headers + CSP, rate limiting on login, parameterised SQL only, output escaping in the UI, CSV formula injection guarded.
* Employee e-mail/mobile are withheld from roles that do not manage users.
* Known limitation: the single-file web bundle uses inline scripts, so the CSP allows `'unsafe-inline'` for scripts. Move to hashed/nonce scripts if you split the bundle.

## Offline and sync

Audit responses and actions are saved to IndexedDB first. When the connection drops, changes queue (status shows *Offline / Sync pending*), photographs queue separately, and everything is replayed on reconnect. Submitting an audit is idempotent, so a retry never creates duplicate findings. Other users' changes arrive through incremental `/api/sync` polling every 5 s.

## Operations

* Scheduler: runs inside the API every `SCHEDULER_INTERVAL_MIN` minutes (guarded by a PostgreSQL advisory lock and a unique index, so several instances are safe): generates work orders from schedules using the *Work Order Trigger Duration* master and raises overdue notices once per day.
* Backups: `server/scripts/backup.sh` / `restore.sh` (database + photographs); compose runs it nightly with 30-day retention.
* Environments: `NODE_ENV=development|test|production` and `.env.example`. Production refuses to start without `JWT_SECRET`.
* Scaling: stateless API (run several behind a proxy), indexed queries, paginated REST lists (`limit`, `cursor`), chunked sync, thumbnails for galleries.

## Tests

```bash
cd server && DATABASE_URL=postgres://.../fives_test npm test       # 39 API tests incl. the §63 acceptance scenario
python3 server/test/ui-e2e.py        # real browser: audit → approvals → action → verify → close → PDF/Excel/CSV
python3 server/test/ui-sync.py       # two browsers, offline queue, refusal revert
```
The UI tests need Playwright (Python) and a running server on :3100 with the demo data.

More: `docs/API.md` (endpoints), `docs/DATABASE.md` (tables + ERD), `docs/SPEC-COVERAGE.md` (requirement → implementation).
