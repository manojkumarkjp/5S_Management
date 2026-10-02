# Requirement coverage

Status: **Done** = implemented and exercised by the automated tests or browser runs; **Partial** = implemented with a stated limit; **Not included** = not built.

| Spec § | Requirement | Status | Where |
|---|---|---|---|
| 1–2 | Lifecycle, S1–S5, editable terminology | Done | `src/page-admin.js` (Master → Scoring & terms) |
| 3, 37 | Six roles, editable permission matrix, zone/APU scoping | Done | `server/src/policy.js`, `repo.js` (scope), User Role page |
| 4 | Login, remember me, forgot password, user master, reset, multi-plant, user audit trail | Done | `auth.js`, `src/page-admin.js` |
| 5–7 | Application/Plant → APU → Department → Zone, org chart, zone master with media | Done | `Pages.org`, `Pages.zone`, Master |
| 8–9, 56 | Configurable versioned checksheets, 5 response types, per-question flags | Done | Master → Checksheets; released versions immutable (tested) |
| 10 | Configurable scoring, weights, bands, N/A excluded | Done | `src/shared.js` `scoreAudit` (tested server-side too) |
| 11–12 | Schedules (weekly/fortnightly/monthly/quarterly/custom), calendar M/W/D/list, auto work orders | Done | `Pages.planner`, `services.generateDueWorkOrders` (+ Work Order Trigger Duration master) |
| 13–14, 33 | Mobile-first execution, photos (camera/upload/annotate), before/after | Done | `Pages.exec`, `UI.annotate` |
| 15–17 | Findings, actions, verification accept/reject with history | Done | `Pages.car`, `Pages.action` |
| 18, 43 | Audit summary, KPI calculations | Done | `Pages.wo`, `server/src/dashboard.js` |
| 19–25, 54 | Trends, dashboard, heat map, aging, repeat findings, before/after gallery, analytics | Done | `Pages.dashboard`, `Pages.analytics`, `Pages.car` |
| 26 | Notifications and configurable rules | Partial | In-app delivered and stored; rules for **e-mail/messaging are configurable and recorded but nothing is sent** (needs an SMTP/webhook sender) |
| 27–28, 48 | PDF / Excel / CSV reports, scorecard, report header/footer | Done | `src/page-reports.js` (generated in the browser); CSV exports also on the server |
| 29, 49 | Workflow, configurable approval chain per audit type | Done | Master → Workflow |
| 30 | Relational design | Done | `server/db/schema.sql` (37 tables) – a few suggested tables are named differently (`divisions` = APU) |
| 31 | Audit trail, append-only | Done | DB trigger + API rule (tested) |
| 32 | Global search, filters | Done | top bar search, filter bars |
| 34 | Offline mode, sync state, no duplicate submit | Done | IndexedDB outbox + photo queue (browser-tested), idempotent submit (API-tested) |
| 35–36, 45, 61 | UI, drill-down Plant → … → Action | Done | |
| 38, 50 | Master data and system settings | Partial | All masters included; **logo upload, report templates and language packs are not built** (fiscal year, numbering, time zone, date format are) |
| 39 | REST API | Done | `docs/API.md` |
| 40 | Security | Partial | See README. Not included: SSO/OAuth2/SAML (JWT only), virus scanning of uploads, CSP without `'unsafe-inline'` |
| 41 | File storage + thumbnails | Partial | Disk driver with thumbnails; S3/Azure driver not written (the storage interface is 3 functions in `files.js`) |
| 42 | Performance | Partial | Indexed queries, pagination, chunked sync, image compression. The web app loads all in-scope records into memory, which suits thousands of records per user, not millions; no load test was run |
| 46–47 | Improvement module, Kaizen conversion | Done | `Pages.improvement`, Kaizen tab |
| 52–53 | Validations, audit locking and reopen | Done | `policy.js`, `services.auditIssues` (tested) |
| 55 | Audit duration | Done | active-time tracking |
| 58 | Architecture | Partial | Spec suggests React/Next.js; the front end is a framework-free SPA and the backend is Node/Express + PostgreSQL |
| 60 | Phased build | Done | all eight phases are present |
| 62 | Demo data | Done | `seed/seed.js` |
| 63 | Acceptance scenario | Done | `server/test/api.test.js` steps 1–28, `ui-e2e.py` |
| Extra | APU/Zone naming, NC Closure Timeline, Work Order Trigger Duration, menu, dashboard cards/charts | Done | |

Not verified here: the Docker image build (no Docker daemon was available; `docker compose config` validates), HTTPS via Caddy, behaviour under many concurrent users, and iOS/Android device testing (mobile layout and the offline flow were tested in desktop Chromium emulation).
