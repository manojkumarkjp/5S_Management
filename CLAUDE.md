# CLAUDE.md – 5S Management System

Role-based web app for manufacturing 5S audits. Hierarchy: Application/Plant → APU → Zone. Lifecycle: schedule → work order → audit execution → scoring → findings → corrective actions → verification → closure → dashboard/reports.

## Layout
- `src/` – the web app (vanilla JS, no framework, no bundler). Files are concatenated by `build.js` in this order: shared, app-core, app-ui, page-dash, page-org, page-wo, page-car, page-admin, page-reports, [adapter-api], app-main.
  - `shared.js` pure logic (scoring, dates, numbering, statuses) – also used by the server.
  - `app-core.js` `Store` (in-memory + outbox/IndexedDB offline queue), `DbAdapter` (claude.ai demo), `Domain` (permissions, KPIs, alerts, audit submission).
  - `adapter-api.js` talks to the REST server (`window.ApiAdapter`).
  - `page-*.js` screens (`Pages.dashboard`, `Pages.wo`, `Pages.exec` …).
- `server/` – Node/Express API + PostgreSQL. `src/app.js` routes, `repo.js` document↔table mapping + scoping, `policy.js` authorisation/business rules, `services.js` numbering/submit/scheduler, `dashboard.js` KPIs, `files.js` photos, `auth.js`. Schema: `server/db/schema.sql`.
- `seed/` – deterministic demo-data generator (`seed.js`, `to-docs.js`). Demo password for all users: `Demo@123`.
- `docs/` – API.md, DATABASE.md, SPEC-COVERAGE.md (what is and isn't built).

## Commands
```bash
node build.js            # -> dist/fives-artifact.html (single-file demo for claude.ai)
node build.js --server   # -> server/public/index.html and syncs shared.js + seed into server/
cd server && npm install
export DATABASE_URL=postgres://user:pass@localhost:5432/fives JWT_SECRET=dev
npm run setup            # migrate + seed demo data
npm start                # http://localhost:3000
DATABASE_URL=postgres://.../fives_test npm test   # 39 API tests; resets that database
```
Browser tests (Python Playwright; server running on :3100 with demo data): `python3 server/test/ui-e2e.py`, `python3 server/test/ui-sync.py`.

## Rules to keep in mind
- Edit the sources in `src/`, then rebuild. Never edit `server/public/index.html`, `dist/`, `server/src/shared.js` or `server/db/seed/*` by hand – they are build outputs/copies (`build.js --server` refreshes them).
- Every business record is a document: key columns + JSONB `data` + projection tables written in one transaction (`repo.upsertDoc`). Add a column/projection in `repo.js` and `schema.sql` together.
- Authorisation and validation are enforced on the server in `policy.js`; the browser only mirrors them. A new rule goes in both places, with an API test.
- Audit trail (`audit_logs`) is append-only by DB trigger. Released checksheet versions are immutable. Submitted audits are locked; changes need Reopen with a reason.
- N/A answers are excluded from the score denominator. Work orders keep the checksheet version they were created with.
- No company name is hard-coded anywhere (removed on request); UI title comes from `settings.appTitle`.
- Dates are ISO strings (`yyyy-mm-dd`); use `FS.addDays/addMonths` rather than `Date` maths.

## Known gaps (see docs/SPEC-COVERAGE.md)
E-mail/messaging notifications are configurable but not sent; no logo upload, report templates or language packs; no SSO; photos use disk storage only; Docker image not built/tested in the original environment; no load testing; not tested on real iOS/Android devices.
