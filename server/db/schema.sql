-- =====================================================================
-- 5S Management System  -  PostgreSQL schema (v1)
--
-- Design: every business record has real key columns (PK, FKs, status,
-- dates, owner ids) that carry the relationships, constraints and indexes,
-- plus a `data` JSONB column holding the full document that the web app
-- reads and writes.  Detail tables (zone_members, checklist_questions,
-- audit_responses, audit_scores, action_history, action_verifications,
-- user_plants, ...) are projections maintained in the same transaction as
-- every write, so SQL / BI tools can query the data relationally.
--
-- Traceability chain (spec section 64):
--   plants -> apus -> zones -> audit_schedules -> audit_work_orders
--   -> audit_responses / audit_scores -> audit_findings -> actions
--   -> action_verifications -> closure
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE SEQUENCE IF NOT EXISTS change_seq;

-- revision stamp used for incremental sync + soft delete bookkeeping
CREATE OR REPLACE FUNCTION touch_rev() RETURNS trigger AS $$
BEGIN
  NEW.rev := nextval('change_seq');
  NEW.updated_at := now();
  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- Configuration
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_settings (
  key         text PRIMARY KEY,                 -- 'settings' | 'masters'
  data        jsonb NOT NULL,
  rev         bigint NOT NULL DEFAULT nextval('change_seq'),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS counters (            -- numbering: AUD / FND / ACT / IMP
  kind        text PRIMARY KEY,
  n           bigint NOT NULL DEFAULT 0 CHECK (n >= 0)
);

CREATE TABLE IF NOT EXISTS s_categories (        -- S1..S5 terminology + weights
  code        text PRIMARY KEY,
  name        text NOT NULL,
  jp_name     text,
  description text,
  weight      numeric NOT NULL DEFAULT 1 CHECK (weight >= 0)
);

CREATE TABLE IF NOT EXISTS scoring_rules (       -- rating scale + score bands
  kind        text NOT NULL CHECK (kind IN ('rating','band')),
  position    int  NOT NULL,
  label       text NOT NULL,
  value       numeric,                            -- rating value or band minimum %
  color       text,
  PRIMARY KEY (kind, position)
);

CREATE TABLE IF NOT EXISTS notification_rules (
  event       text PRIMARY KEY,
  inapp       boolean NOT NULL DEFAULT true,
  email       boolean NOT NULL DEFAULT false,
  messaging   boolean NOT NULL DEFAULT false,
  data        jsonb NOT NULL DEFAULT '{}'
);

-- ---------------------------------------------------------------------
-- Roles & permissions (RBAC)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
  code        text PRIMARY KEY,
  name        text NOT NULL
);
INSERT INTO roles(code, name) VALUES
  ('admin','System Administrator'),('facilitator','5S Facilitator'),('auditor','Auditor'),
  ('leader','Zone Leader'),('member','Zone Member'),('management','Management / Viewer')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS permissions (
  role_code   text NOT NULL REFERENCES roles(code) ON DELETE CASCADE,
  func        text NOT NULL,
  level       text NOT NULL CHECK (level IN ('none','view','limited','edit')),
  PRIMARY KEY (role_code, func)
);

-- ---------------------------------------------------------------------
-- Organisation:  Application / Plant -> APU -> Department -> Section -> Zone
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plants (
  id          text PRIMARY KEY,
  code        text,
  name        text NOT NULL,
  location    text,
  status      text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Inactive'))
);

CREATE TABLE IF NOT EXISTS divisions (          -- APU (Application Production Unit)
  id          text PRIMARY KEY,
  code        text,
  name        text NOT NULL,
  plant_id    text REFERENCES plants(id),
  facilitator_id text,                            -- FK added after users exist
  status      text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Inactive'))
);
CREATE INDEX IF NOT EXISTS ix_divisions_plant ON divisions(plant_id);

CREATE TABLE IF NOT EXISTS departments (
  id          text PRIMARY KEY,
  name        text NOT NULL UNIQUE,
  status      text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Inactive'))
);

CREATE TABLE IF NOT EXISTS sections (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  department_id text REFERENCES departments(id),
  status      text NOT NULL DEFAULT 'Active'
);

CREATE TABLE IF NOT EXISTS areas (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  plant_id    text REFERENCES plants(id),
  status      text NOT NULL DEFAULT 'Active'
);

-- ---------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            text PRIMARY KEY,                 -- Employee ID
  name          text NOT NULL,
  email         text,
  mobile        text,
  role          text NOT NULL REFERENCES roles(code),
  status        text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Inactive')),
  department    text,
  designation   text,
  manager_id    text REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED,
  plant_id      text,
  join_date     date,
  pwd_hash      text,
  pwd_changed_at timestamptz,
  must_change_pwd boolean NOT NULL DEFAULT false,
  failed_attempts int NOT NULL DEFAULT 0,
  locked_until  timestamptz,
  last_login    timestamptz,
  data          jsonb NOT NULL DEFAULT '{}',      -- profile without credentials
  rev           bigint NOT NULL DEFAULT nextval('change_seq'),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_users_email ON users (lower(email)) WHERE email IS NOT NULL AND email <> '';
CREATE INDEX IF NOT EXISTS ix_users_role ON users(role);
CREATE INDEX IF NOT EXISTS ix_users_rev ON users(rev);
CREATE INDEX IF NOT EXISTS ix_users_name_trgm ON users USING gin (name gin_trgm_ops);

ALTER TABLE divisions DROP CONSTRAINT IF EXISTS fk_divisions_facilitator;
ALTER TABLE divisions ADD CONSTRAINT fk_divisions_facilitator FOREIGN KEY (facilitator_id) REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE IF NOT EXISTS user_roles (          -- role assignment (primary role mirrors users.role)
  user_id     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_code   text NOT NULL REFERENCES roles(code),
  PRIMARY KEY (user_id, role_code)
);
CREATE TABLE IF NOT EXISTS user_plants (         -- multi-plant access
  user_id     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plant_id    text NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, plant_id)
);
CREATE TABLE IF NOT EXISTS user_divisions (      -- APU access
  user_id     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  division_id text NOT NULL REFERENCES divisions(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, division_id)
);

-- ---------------------------------------------------------------------
-- Zones
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS zones (
  id          text PRIMARY KEY,
  code        text NOT NULL,
  name        text NOT NULL,
  plant_id    text NOT NULL REFERENCES plants(id),
  division_id text NOT NULL REFERENCES divisions(id),
  department  text,
  section     text,
  zone_type   text,
  risk        text,
  leader_id   text REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED,
  backup_id   text REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED,
  frequency   text,
  checklist_family text,
  status      text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Inactive')),
  effective_from date,
  effective_to   date,
  data        jsonb NOT NULL,
  rev         bigint NOT NULL DEFAULT nextval('change_seq'),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_zones_code ON zones(code);
CREATE INDEX IF NOT EXISTS ix_zones_div ON zones(division_id);
CREATE INDEX IF NOT EXISTS ix_zones_plant ON zones(plant_id);
CREATE INDEX IF NOT EXISTS ix_zones_leader ON zones(leader_id);
CREATE INDEX IF NOT EXISTS ix_zones_rev ON zones(rev);

CREATE TABLE IF NOT EXISTS zone_members (
  zone_id     text NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  user_id     text NOT NULL REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED,
  member_role text NOT NULL DEFAULT 'member' CHECK (member_role IN ('leader','backup','member')),
  PRIMARY KEY (zone_id, user_id, member_role)
);
CREATE INDEX IF NOT EXISTS ix_zone_members_user ON zone_members(user_id);

-- ---------------------------------------------------------------------
-- Checksheet master (versioned)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_checklists (
  id          text PRIMARY KEY,                   -- e.g. CS-PROD-V2
  family      text NOT NULL,
  name        text NOT NULL,
  version     text NOT NULL,
  status      text NOT NULL CHECK (status IN ('Draft','Active','Superseded','Inactive')),
  effective_from date,
  effective_to   date,
  data        jsonb NOT NULL,
  rev         bigint NOT NULL DEFAULT nextval('change_seq'),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (family, version)
);
CREATE INDEX IF NOT EXISTS ix_checklists_family ON audit_checklists(family, status);
CREATE INDEX IF NOT EXISTS ix_checklists_rev ON audit_checklists(rev);

CREATE TABLE IF NOT EXISTS checklist_sections (
  checklist_id text NOT NULL REFERENCES audit_checklists(id) ON DELETE CASCADE,
  s_code       text NOT NULL REFERENCES s_categories(code),
  position     int NOT NULL DEFAULT 0,
  PRIMARY KEY (checklist_id, s_code)
);

CREATE TABLE IF NOT EXISTS checklist_questions (
  checklist_id text NOT NULL REFERENCES audit_checklists(id) ON DELETE CASCADE,
  qid          text NOT NULL,
  s_code       text NOT NULL REFERENCES s_categories(code),
  subcategory  text,
  question     text NOT NULL,
  description  text,
  guidance     text,
  max_score    numeric NOT NULL DEFAULT 5,
  min_score    numeric NOT NULL DEFAULT 1,
  weight       numeric NOT NULL DEFAULT 1,
  mandatory    boolean NOT NULL DEFAULT true,
  evidence_required boolean NOT NULL DEFAULT false,
  photo_required    boolean NOT NULL DEFAULT false,
  finding_required  boolean NOT NULL DEFAULT false,
  active       boolean NOT NULL DEFAULT true,
  response_type text NOT NULL DEFAULT 'score',
  position     int NOT NULL DEFAULT 0,
  PRIMARY KEY (checklist_id, qid)
);

-- ---------------------------------------------------------------------
-- Audit planning
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_schedules (
  id          text PRIMARY KEY,
  zone_id     text NOT NULL REFERENCES zones(id),
  checklist_family text NOT NULL,
  frequency   text NOT NULL,
  interval_days int,
  start_date  date NOT NULL,
  end_date    date,
  start_time  text,
  end_time    text,
  auditor_id  text REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED,
  backup_id   text REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED,
  audit_type  text,
  priority    text,
  status      text NOT NULL CHECK (status IN ('Active','Paused','Cancelled','Completed','Draft')),
  data        jsonb NOT NULL,
  rev         bigint NOT NULL DEFAULT nextval('change_seq'),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_sched_zone ON audit_schedules(zone_id);
CREATE INDEX IF NOT EXISTS ix_sched_auditor ON audit_schedules(auditor_id);
CREATE INDEX IF NOT EXISTS ix_sched_status ON audit_schedules(status);
CREATE INDEX IF NOT EXISTS ix_sched_rev ON audit_schedules(rev);

-- calendar of occurrences (one row per generated work order date)
CREATE TABLE IF NOT EXISTS audit_calendar (
  schedule_id text NOT NULL REFERENCES audit_schedules(id) ON DELETE CASCADE,
  planned_date date NOT NULL,
  work_order_id text,
  PRIMARY KEY (schedule_id, planned_date)
);

-- ---------------------------------------------------------------------
-- Audit execution
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_work_orders (
  id          text PRIMARY KEY,                   -- AUD-000125
  no          text NOT NULL UNIQUE,               -- 5S-AUD-2026-000125
  schedule_id text REFERENCES audit_schedules(id) ON DELETE SET NULL,
  zone_id     text NOT NULL REFERENCES zones(id),
  plant_id    text NOT NULL,
  division_id text NOT NULL,
  department  text,
  checklist_id text REFERENCES audit_checklists(id),
  auditor_id  text REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED,
  backup_auditor_id text,
  leader_id   text,
  audit_type  text,
  planned_date date NOT NULL,
  due_date    date,
  priority    text,
  status      text NOT NULL CHECK (status IN ('Draft','Assigned','Accepted','In Progress','Submitted','Under Review','Approved','Closed','Cancelled')),
  locked      boolean NOT NULL DEFAULT false,
  overall_pct numeric,
  original_pct numeric,
  duration_min int,
  started_at  timestamptz,
  submitted_at timestamptz,
  data        jsonb NOT NULL,
  rev         bigint NOT NULL DEFAULT nextval('change_seq'),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
-- one work order per schedule occurrence: prevents duplicates from concurrent generators
CREATE UNIQUE INDEX IF NOT EXISTS ux_wo_schedule_date ON audit_work_orders(schedule_id, planned_date) WHERE schedule_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_wo_zone ON audit_work_orders(zone_id, planned_date);
CREATE INDEX IF NOT EXISTS ix_wo_auditor ON audit_work_orders(auditor_id, status);
CREATE INDEX IF NOT EXISTS ix_wo_status ON audit_work_orders(status, planned_date);
CREATE INDEX IF NOT EXISTS ix_wo_division ON audit_work_orders(division_id, planned_date);
CREATE INDEX IF NOT EXISTS ix_wo_rev ON audit_work_orders(rev);

CREATE TABLE IF NOT EXISTS audit_responses (
  work_order_id text NOT NULL REFERENCES audit_work_orders(id) ON DELETE CASCADE,
  qid         text NOT NULL,
  value       text,                               -- '5' | 'NA' | 'Yes' ...
  remark      text,
  finding_id  text,
  photo_count int NOT NULL DEFAULT 0,
  answered_at timestamptz,
  PRIMARY KEY (work_order_id, qid)
);

CREATE TABLE IF NOT EXISTS audit_scores (        -- S1..S5 and 'overall' for each audit
  work_order_id text NOT NULL REFERENCES audit_work_orders(id) ON DELETE CASCADE,
  s_key       text NOT NULL,
  got         numeric,
  max         numeric,
  pct         numeric,
  PRIMARY KEY (work_order_id, s_key)
);

CREATE TABLE IF NOT EXISTS audit_findings (
  id          text PRIMARY KEY,                   -- FND-000001
  no          text NOT NULL UNIQUE,
  work_order_id text REFERENCES audit_work_orders(id) ON DELETE RESTRICT,
  zone_id     text NOT NULL REFERENCES zones(id),
  division_id text,
  s_code      text,
  qid         text,
  category    text,
  severity    text NOT NULL CHECK (severity IN ('Critical','Major','Minor','Observation','Improvement Opportunity')),
  status      text NOT NULL CHECK (status IN ('Open','In Progress','Closed')),
  responsible_id text REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED,
  due_date    date,
  audit_date  date,
  data        jsonb NOT NULL,
  rev         bigint NOT NULL DEFAULT nextval('change_seq'),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_find_wo ON audit_findings(work_order_id);
CREATE INDEX IF NOT EXISTS ix_find_zone ON audit_findings(zone_id, qid);
CREATE INDEX IF NOT EXISTS ix_find_status ON audit_findings(status, severity);
CREATE INDEX IF NOT EXISTS ix_find_resp ON audit_findings(responsible_id);
CREATE INDEX IF NOT EXISTS ix_find_rev ON audit_findings(rev);

-- ---------------------------------------------------------------------
-- Corrective actions
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS actions (
  id          text PRIMARY KEY,                   -- ACT-000001
  no          text NOT NULL UNIQUE,
  finding_id  text REFERENCES audit_findings(id) ON DELETE RESTRICT,
  work_order_id text,
  zone_id     text NOT NULL REFERENCES zones(id),
  division_id text,
  action_type text,
  responsible_id text REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED,
  target_date date,
  priority    text,
  status      text NOT NULL CHECK (status IN ('Open','In Progress','Completed','Submitted for Verification','Verified','Rejected','Closed')),
  completed_at timestamptz,
  verified_by text,
  verified_at timestamptz,
  data        jsonb NOT NULL,
  rev         bigint NOT NULL DEFAULT nextval('change_seq'),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_act_finding ON actions(finding_id);
CREATE INDEX IF NOT EXISTS ix_act_zone ON actions(zone_id);
CREATE INDEX IF NOT EXISTS ix_act_resp ON actions(responsible_id, status);
CREATE INDEX IF NOT EXISTS ix_act_target ON actions(target_date) WHERE status NOT IN ('Verified','Closed');
CREATE INDEX IF NOT EXISTS ix_act_rev ON actions(rev);

CREATE TABLE IF NOT EXISTS action_history (
  action_id   text NOT NULL REFERENCES actions(id) ON DELETE CASCADE,
  seq         int NOT NULL,
  at          timestamptz,
  by_user     text,
  from_status text,
  to_status   text,
  note        text,
  PRIMARY KEY (action_id, seq)
);

CREATE TABLE IF NOT EXISTS action_verifications (
  action_id   text NOT NULL REFERENCES actions(id) ON DELETE CASCADE,
  seq         int NOT NULL,
  result      text NOT NULL CHECK (result IN ('Accepted','Rejected')),
  verified_by text,
  verified_at timestamptz,
  remarks     text,
  revised_target date,
  PRIMARY KEY (action_id, seq)
);

CREATE TABLE IF NOT EXISTS improvements (         -- Kaizen / before-after
  id          text PRIMARY KEY,
  no          text NOT NULL UNIQUE,
  zone_id     text NOT NULL REFERENCES zones(id),
  finding_id  text,
  owner_id    text,
  s_code      text,
  title       text,
  status      text NOT NULL,
  imp_date    date,
  saving      numeric,
  data        jsonb NOT NULL,
  rev         bigint NOT NULL DEFAULT nextval('change_seq'),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_imp_zone ON improvements(zone_id);
CREATE INDEX IF NOT EXISTS ix_imp_rev ON improvements(rev);

-- ---------------------------------------------------------------------
-- Files (photographs are stored outside the transactional tables)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS attachments (
  id          text PRIMARY KEY,
  file_name   text NOT NULL,
  mime_type   text NOT NULL,
  size_bytes  bigint NOT NULL,
  width       int,
  height      int,
  storage_path text NOT NULL,
  thumb_path   text,
  work_order_id text,
  finding_id  text,
  action_id   text,
  improvement_id text,
  qid         text,
  zone_id     text,
  uploaded_by text NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  sha256      text
);
CREATE INDEX IF NOT EXISTS ix_att_wo ON attachments(work_order_id);
CREATE INDEX IF NOT EXISTS ix_att_finding ON attachments(finding_id);
CREATE INDEX IF NOT EXISTS ix_att_action ON attachments(action_id);
CREATE INDEX IF NOT EXISTS ix_att_zone ON attachments(zone_id);

-- ---------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id          text PRIMARY KEY,
  at          timestamptz NOT NULL,
  type        text NOT NULL,
  title       text,
  recipients  text[] NOT NULL DEFAULT '{}',
  data        jsonb NOT NULL,
  rev         bigint NOT NULL DEFAULT nextval('change_seq'),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_notif_recipients ON notifications USING gin (recipients);
CREATE INDEX IF NOT EXISTS ix_notif_at ON notifications(at DESC);
CREATE INDEX IF NOT EXISTS ix_notif_rev ON notifications(rev);

-- ---------------------------------------------------------------------
-- Audit trail: append-only
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log_docs (       -- one document per day + session (what the web app syncs)
  id          text PRIMARY KEY,
  owner       text,
  log_date    date,
  data        jsonb NOT NULL,
  rev         bigint NOT NULL DEFAULT nextval('change_seq'),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_logdocs_rev ON audit_log_docs(rev);

CREATE TABLE IF NOT EXISTS audit_logs (           -- one row per event, immutable
  id          bigserial PRIMARY KEY,
  at          timestamptz NOT NULL,
  user_id     text NOT NULL,
  module      text NOT NULL,
  record      text,
  action      text NOT NULL,
  prev_value  text,
  new_value   text,
  device      text,
  ip          text,
  log_doc     text
);
CREATE INDEX IF NOT EXISTS ix_logs_at ON audit_logs(at DESC);
CREATE INDEX IF NOT EXISTS ix_logs_user ON audit_logs(user_id, at DESC);
CREATE INDEX IF NOT EXISTS ix_logs_module ON audit_logs(module, at DESC);
CREATE INDEX IF NOT EXISTS ix_logs_record ON audit_logs(record);

CREATE OR REPLACE FUNCTION audit_logs_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only';
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_audit_logs_no_change ON audit_logs;
CREATE TRIGGER trg_audit_logs_no_change BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable();
DROP TRIGGER IF EXISTS trg_audit_logs_no_truncate ON audit_logs;
CREATE TRIGGER trg_audit_logs_no_truncate BEFORE TRUNCATE ON audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_immutable();

-- ---------------------------------------------------------------------
-- revision triggers on every synced table
-- ---------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['app_settings','users','zones','audit_checklists','audit_schedules',
                           'audit_work_orders','audit_findings','actions','improvements','notifications','audit_log_docs']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_touch_%1$s ON %1$s', t);
    EXECUTE format('CREATE TRIGGER trg_touch_%1$s BEFORE INSERT OR UPDATE ON %1$s FOR EACH ROW EXECUTE FUNCTION touch_rev()', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- Sessions (revocable JWT ids) and login history
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auth_sessions (
  jti         text PRIMARY KEY,
  user_id     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  revoked     boolean NOT NULL DEFAULT false,
  ip          text,
  user_agent  text
);
CREATE INDEX IF NOT EXISTS ix_sessions_user ON auth_sessions(user_id);

-- ---------------------------------------------------------------------
-- Reporting views
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_latest_zone_score AS
SELECT DISTINCT ON (w.zone_id)
       w.zone_id, z.code AS zone_code, z.name AS zone_name, z.division_id, w.id AS work_order_id,
       w.planned_date, w.overall_pct
  FROM audit_work_orders w JOIN zones z ON z.id = w.zone_id
 WHERE w.overall_pct IS NOT NULL AND w.status IN ('Submitted','Under Review','Approved','Closed')
 ORDER BY w.zone_id, w.planned_date DESC;

CREATE OR REPLACE VIEW v_monthly_apu_score AS
SELECT w.division_id, d.name AS apu, to_char(w.planned_date, 'YYYY-MM') AS month,
       round(avg(w.overall_pct)::numeric, 1) AS avg_score, count(*) AS audits
  FROM audit_work_orders w JOIN divisions d ON d.id = w.division_id
 WHERE w.overall_pct IS NOT NULL AND w.status IN ('Submitted','Under Review','Approved','Closed')
 GROUP BY 1, 2, 3;

CREATE OR REPLACE VIEW v_action_aging AS
SELECT a.id, a.no, a.zone_id, a.responsible_id, a.status, a.target_date,
       (current_date - a.target_date) AS days_overdue,
       CASE WHEN a.target_date >= current_date THEN 'Not due'
            WHEN current_date - a.target_date <= 7  THEN '0-7 days'
            WHEN current_date - a.target_date <= 15 THEN '8-15 days'
            WHEN current_date - a.target_date <= 30 THEN '16-30 days'
            WHEN current_date - a.target_date <= 60 THEN '31-60 days'
            ELSE '60+ days' END AS bucket
  FROM actions a WHERE a.status NOT IN ('Verified','Closed');

CREATE OR REPLACE VIEW v_repeat_findings AS
SELECT zone_id, qid, count(*) AS occurrences, min(audit_date) AS first_seen, max(audit_date) AS last_seen
  FROM audit_findings WHERE qid IS NOT NULL GROUP BY zone_id, qid HAVING count(*) > 1;

-- deletions are propagated to clients through tombstones (incremental sync)
CREATE TABLE IF NOT EXISTS tombstones (
  coll        text NOT NULL,
  id          text NOT NULL,
  rev         bigint NOT NULL DEFAULT nextval('change_seq'),
  PRIMARY KEY (coll, id)
);
CREATE INDEX IF NOT EXISTS ix_tomb_rev ON tombstones(rev);
