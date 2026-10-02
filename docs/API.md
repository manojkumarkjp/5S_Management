# REST API

Base path `/api`. JSON in/out. Authentication: `POST /api/auth/login` sets an `httpOnly` cookie (also usable as `Authorization: Bearer <token>`). Writes made with the cookie must send `X-Requested-With: fives`.
Errors: `{ "error": { "code", "message", "details?" } }` with 400 bad request · 401 not signed in · 403 not permitted · 404 · 409 conflict/foreign key · 422 validation · 423 locked · 429 rate limited.
All reads are scoped to what the signed-in role may see (zones/APUs/plants); every write is authorised and validated on the server.

## Authentication
| Method | Path | |
|---|---|---|
| POST | `/auth/login` `{username,password}` | sign in (Employee ID or e-mail) |
| POST | `/auth/logout` | revoke session |
| GET | `/auth/me` | current user |
| POST | `/auth/change-password` `{current,password}` | |
| POST | `/auth/forgot` `{id}` | notifies administrators (always 202) |
| GET | `/branding` | public: application title and S names for the login page |

## Resources (spec §39) – list is paginated: `?limit=50&cursor=<next>` → `{items,next}`
| Resource | Path | Notes |
|---|---|---|
| Users | `GET /users`, `GET /users/:id`, `POST /users`, `PUT /users/:id` `{user,password?}`, `POST /users/:id/reset-password` | admin only for writes |
| Zones | `/zones` GET/POST/PUT/PATCH/DELETE | admin, facilitator |
| Checklists | `/checklists` | released versions are immutable; new version = new id |
| Audit schedules | `/audits/schedule` | `POST` allocates `SCH-nnnn` |
| Work orders | `/audit-work-orders` | `POST` allocates `AUD-nnnnnn` and `5S-AUD-YYYY-nnnnnn` |
| Findings | `/findings` | |
| Actions | `/actions` | verification/closure rules enforced |
| Improvements | `/improvements` | Kaizen / before-after |
| Notifications | `/notifications` | |

## Audit execution
| Method | Path | |
|---|---|---|
| GET | `/audits/:id` | work order + checksheet version used + live score + findings + actions |
| POST | `/audits/:id/responses` `{responses:{qid:{v,remark,photos,finding}}}` | autosave; moves the work order to *In Progress*; 423 once locked |
| POST | `/audits/:id/submit` | validates, scores (N/A excluded), creates findings/actions, applies the approval chain, locks. Idempotent (`already:true` on retry) |

## Dashboard
`GET /dashboard/summary` · `/dashboard/trends` · `/dashboard/zones` with `?apu=&plant=&zone=&dept=&auditType=&month=YYYY-MM|quarter=YYYY-Qn|year=&from=&to=`.
Summary returns the KPI cards (audits planned vs completed, completion %, average score, findings total/open/closed, critical, open/overdue actions, closure %, overdue %, finding rate, repeat-finding rate, best/lowest zone), severity split and S1–S5 averages. `/zones` returns zone ranking, **APU ranking**, **zone-leader score bars** and **findings per zone**.

## Files
`POST /files` `{id?, full:dataURL, name, woId?, qid?, findingId?, actionId?}` → `{id,url,thumbUrl}` · `GET /files/:id[?thumb=1]` (access follows the zone).

## Other
`POST /numbers/:kind` (atomic numbering) · `GET /export/{workorders|findings|actions}.csv` · `POST /admin/generate-work-orders` · `GET /health`.
Web-app sync: `GET /sync?since=<rev>&limit=` (incremental, scoped, includes deletions) and generic `GET|PUT|PATCH|DELETE /docs/:collection/:id`.
