# Database design (PostgreSQL 14+)

`server/db/schema.sql` (idempotent). 37 tables, 43 foreign keys, 90+ indexes, 4 reporting views.
Principle (spec §64): every record keeps a link to its parent, so one query walks **Plant → APU → Zone → Schedule → Work order → Response/Score → Finding → Action → Verification**.

```mermaid
erDiagram
  plants ||--o{ divisions : "APU"
  plants ||--o{ zones : has
  divisions ||--o{ zones : has
  users ||--o{ zones : "leader / backup"
  zones ||--o{ zone_members : has
  users ||--o{ zone_members : is
  audit_checklists ||--o{ checklist_sections : has
  audit_checklists ||--o{ checklist_questions : has
  zones ||--o{ audit_schedules : planned
  audit_schedules ||--o{ audit_calendar : occurrences
  audit_schedules ||--o{ audit_work_orders : generates
  zones ||--o{ audit_work_orders : audited
  audit_checklists ||--o{ audit_work_orders : "version used"
  audit_work_orders ||--o{ audit_responses : has
  audit_work_orders ||--o{ audit_scores : "S1..S5, overall"
  audit_work_orders ||--o{ audit_findings : raises
  audit_findings ||--o{ actions : "corrected by"
  actions ||--o{ action_history : has
  actions ||--o{ action_verifications : "accept / reject"
  zones ||--o{ improvements : has
  users ||--o{ user_roles : has
  roles ||--o{ permissions : grants
```

| Group | Tables |
|---|---|
| Configuration | `app_settings` (settings, masters JSON), `counters`, `s_categories`, `scoring_rules`, `notification_rules` |
| RBAC | `roles`, `permissions`, `users`, `user_roles`, `user_plants`, `user_divisions`, `auth_sessions` |
| Organisation | `plants`, `divisions` (APU), `departments`, `sections`, `areas`, `zones`, `zone_members` |
| 5S configuration | `audit_checklists` (versioned), `checklist_sections`, `checklist_questions` |
| Planning | `audit_schedules`, `audit_calendar` |
| Execution | `audit_work_orders`, `audit_responses`, `audit_scores`, `audit_findings`, `attachments` |
| Corrective actions | `actions`, `action_history`, `action_verifications`, `improvements` |
| Notifications | `notifications` (GIN index on recipients) |
| Audit trail | `audit_log_docs`, `audit_logs` (append-only trigger) |
| Sync | `tombstones`, sequence `change_seq` (revision stamp via trigger) |

Notable constraints: unique `(schedule_id, planned_date)` on work orders (no duplicate generation), unique work-order/finding/action numbers, status `CHECK`s, deferrable FKs for user references, `ON DELETE RESTRICT` between audit → finding → action so history cannot be orphaned.
Views: `v_latest_zone_score`, `v_monthly_apu_score` (APU ranking), `v_action_aging` (0–7 / 8–15 / 16–30 / 31–60 / 60+), `v_repeat_findings`.
Numbering is a single atomic `UPDATE counters ... RETURNING` per kind (AUD, FND, ACT, IMP, SCH); formats come from the numbering setting, e.g. `5S-AUD-2026-000125`.
