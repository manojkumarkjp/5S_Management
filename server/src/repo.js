'use strict';
/* Document repository: maps the web app's collections onto relational tables.
   Every write runs inside one transaction: the key columns, the JSONB document and
   the detail/projection tables (members, questions, responses, scores, history ...). */
const { pool, tx } = require('./db');

const nz = (v) => (v === undefined || v === null || v === '' ? null : v);
const num = (v) => (v === undefined || v === null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const day = (v) => (v ? String(v).slice(0, 10) : null);
const ts = (v) => (v ? v : null);

/* collection -> table + key columns */
const COLL = {
  cfg: { table: 'app_settings', pk: 'key' },
  users: {
    table: 'users',
    cols: (d) => ({ name: d.name, email: nz(d.email), mobile: nz(d.mobile), role: d.role, status: d.status || 'Active', department: nz(d.dept), designation: nz(d.designation), manager_id: nz(d.manager), plant_id: nz(d.plant), join_date: day(d.joinDate) }),
  },
  zones: {
    table: 'zones',
    cols: (d) => ({ code: d.code, name: d.name, plant_id: d.plant, division_id: d.apu, department: nz(d.dept), section: nz(d.section), zone_type: nz(d.type), risk: nz(d.risk), leader_id: nz(d.leader), backup_id: nz(d.backup), frequency: nz(d.frequency), checklist_family: nz(d.checksheet), status: d.status || 'Active', effective_from: day(d.effFrom), effective_to: day(d.effTo) }),
  },
  checksheets: {
    table: 'audit_checklists',
    cols: (d) => ({ family: d.family, name: d.name, version: String(d.version), status: d.status, effective_from: day(d.effectiveFrom), effective_to: day(d.effectiveTo) }),
  },
  schedules: {
    table: 'audit_schedules',
    cols: (d) => ({ zone_id: d.zone, checklist_family: d.checksheet, frequency: d.frequency, interval_days: num(d.interval), start_date: day(d.startDate), end_date: day(d.endDate), start_time: nz(d.time), end_time: nz(d.endTime), auditor_id: nz(d.auditor), backup_id: nz(d.backup), audit_type: nz(d.auditType), priority: nz(d.priority), status: d.status || 'Active' }),
  },
  workorders: {
    table: 'audit_work_orders',
    cols: (d) => ({ no: d.no, schedule_id: nz(d.scheduleId), zone_id: d.zone, plant_id: d.plant, division_id: d.apu, department: nz(d.dept), checklist_id: nz(d.checksheetId), auditor_id: nz(d.auditor), backup_auditor_id: nz(d.backupAuditor), leader_id: nz(d.leader), audit_type: nz(d.auditType), planned_date: day(d.plannedDate), due_date: day(d.dueDate), priority: nz(d.priority), status: d.status, locked: !!d.locked, overall_pct: d.score && d.score.overall ? num(d.score.overall.pct) : null, original_pct: num(d.originalScore), duration_min: num(d.duration), started_at: ts(d.startedAt), submitted_at: ts(d.submittedAt) }),
  },
  findings: {
    table: 'audit_findings',
    cols: (d) => ({ no: d.no, work_order_id: nz(d.woId), zone_id: d.zone, division_id: nz(d.apu), s_code: nz(d.s), qid: nz(d.qid), category: nz(d.category), severity: d.severity, status: d.status || 'Open', responsible_id: nz(d.responsible), due_date: day(d.due), audit_date: day(d.auditDate) }),
  },
  actions: {
    table: 'actions',
    cols: (d) => ({ no: d.no, finding_id: nz(d.findingId), work_order_id: nz(d.woId), zone_id: d.zone, division_id: nz(d.apu), action_type: nz(d.type), responsible_id: nz(d.responsible), target_date: day(d.revisedTarget || d.target), priority: nz(d.priority), status: d.status || 'Open', completed_at: ts(d.completedAt), verified_by: nz(d.verifiedBy), verified_at: ts(d.verifiedAt) }),
  },
  improvements: {
    table: 'improvements',
    cols: (d) => ({ no: d.no, zone_id: d.zone, finding_id: nz(d.findingId), owner_id: nz(d.owner), s_code: nz(d.s), title: nz(d.title), status: d.status || 'Open', imp_date: day(d.date), saving: num(d.saving) }),
  },
  notifications: {
    table: 'notifications',
    cols: (d) => ({ at: d.at || new Date().toISOString(), type: d.type || 'Notice', title: nz(d.title), recipients: Array.isArray(d.to) ? d.to : [] }),
  },
  logs: {
    table: 'audit_log_docs',
    cols: (d) => ({ log_date: day(d.date) }),
  },
};
const COLLECTIONS = Object.keys(COLL);

/* ---------- helpers ---------- */
async function bulk(c, table, cols, rows) {
  if (!rows.length) return;
  const chunk = Math.max(1, Math.floor(30000 / cols.length));
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk); const params = [];
    const values = part.map((r) => '(' + r.map((v) => { params.push(v); return '$' + params.length; }).join(',') + ')').join(',');
    await c.query(`INSERT INTO ${table} (${cols.join(',')}) VALUES ${values} ON CONFLICT DO NOTHING`, params);
  }
}
const stripPwd = (d) => { const o = Object.assign({}, d); delete o.pwd; delete o.id; return o; };

/* ---------- projections ---------- */
const PROJECT = {
  async cfg(c, id, d) {
    if (id === 'masters') {
      await bulk(c, 'plants', ['id', 'code', 'name', 'location', 'status'], (d.plants || []).map((p) => [p.id, nz(p.code), p.name, nz(p.location), p.status || 'Active']));
      for (const p of d.plants || []) await c.query('UPDATE plants SET code=$2,name=$3,location=$4,status=$5 WHERE id=$1', [p.id, nz(p.code), p.name, nz(p.location), p.status || 'Active']);
      await bulk(c, 'departments', ['id', 'name', 'status'], (d.departments || []).map((x) => [x.id, x.name, x.status || 'Active']));
      for (const x of d.departments || []) await c.query('UPDATE departments SET name=$2,status=$3 WHERE id=$1', [x.id, x.name, x.status || 'Active']);
      await bulk(c, 'divisions', ['id', 'code', 'name', 'plant_id', 'facilitator_id', 'status'], (d.apus || []).map((a) => [a.id, nz(a.code), a.name, nz(a.plant), nz(a.facilitator), a.status || 'Active']));
      for (const a of d.apus || []) await c.query('UPDATE divisions SET code=$2,name=$3,plant_id=$4,facilitator_id=$5,status=$6 WHERE id=$1', [a.id, nz(a.code), a.name, nz(a.plant), nz(a.facilitator), a.status || 'Active']);
      const depts = (await c.query('SELECT id,name FROM departments')).rows; const byName = new Map(depts.map((x) => [x.name, x.id]));
      await bulk(c, 'sections', ['id', 'name', 'department_id', 'status'], (d.sections || []).map((s) => [s.id, s.name, byName.get(s.dept) || null, s.status || 'Active']));
      for (const s of d.sections || []) await c.query('UPDATE sections SET name=$2,department_id=$3,status=$4 WHERE id=$1', [s.id, s.name, byName.get(s.dept) || null, s.status || 'Active']);
      if (Array.isArray(d.areas)) await bulk(c, 'areas', ['id', 'name', 'plant_id', 'status'], d.areas.map((a) => [a.id, a.name, nz(a.plant), a.status || 'Active']));
    } else if (id === 'settings') {
      await c.query('DELETE FROM s_categories WHERE false');
      const sn = d.sNames || {}; const w = d.sWeights || {};
      for (const k of Object.keys(sn)) await c.query('INSERT INTO s_categories(code,name,jp_name,description,weight) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, jp_name=EXCLUDED.jp_name, description=EXCLUDED.description, weight=EXCLUDED.weight', [k, sn[k].name, nz(sn[k].jp), nz(sn[k].desc), num(w[k]) ?? 1]);
      await c.query('DELETE FROM scoring_rules');
      await bulk(c, 'scoring_rules', ['kind', 'position', 'label', 'value', 'color'], (d.ratingScale || []).map((r, i) => ['rating', i, r.label, num(r.value), null]).concat((d.bands || []).map((b, i) => ['band', i, b.label, num(b.min), nz(b.color)])));
      await c.query('DELETE FROM notification_rules');
      await bulk(c, 'notification_rules', ['event', 'inapp', 'email', 'messaging', 'data'], (d.notificationRules || []).map((r) => [r.event, r.inapp !== false, !!r.email, !!r.msg, JSON.stringify(r)]));
      if (d.permissions) {
        await c.query('DELETE FROM permissions');
        const rows = []; Object.entries(d.permissions).forEach(([role, fns]) => Object.entries(fns).forEach(([fn, lvl]) => rows.push([role, fn, lvl])));
        await bulk(c, 'permissions', ['role_code', 'func', 'level'], rows);
      }
    }
  },
  async users(c, id, d) {
    await c.query('DELETE FROM user_roles WHERE user_id=$1', [id]); await c.query('DELETE FROM user_plants WHERE user_id=$1', [id]); await c.query('DELETE FROM user_divisions WHERE user_id=$1', [id]);
    if (d.role) await c.query('INSERT INTO user_roles(user_id,role_code) VALUES ($1,$2)', [id, d.role]);
    await bulk(c, 'user_plants', ['user_id', 'plant_id'], [...new Set(d.plants || [])].map((p) => [id, p]));
    await bulk(c, 'user_divisions', ['user_id', 'division_id'], [...new Set(d.apus || [])].map((a) => [id, a]));
  },
  async zones(c, id, d) {
    await c.query('DELETE FROM zone_members WHERE zone_id=$1', [id]);
    const rows = []; const seen = new Set();
    const add = (u, r) => { if (u && !seen.has(u + r)) { seen.add(u + r); rows.push([id, u, r]); } };
    add(d.leader, 'leader'); add(d.backup, 'backup'); (d.members || []).forEach((m) => add(m, 'member'));
    await bulk(c, 'zone_members', ['zone_id', 'user_id', 'member_role'], rows);
  },
  async checksheets(c, id, d) {
    await c.query('DELETE FROM checklist_questions WHERE checklist_id=$1', [id]); await c.query('DELETE FROM checklist_sections WHERE checklist_id=$1', [id]);
    const qs = d.questions || []; const secs = [...new Set(qs.map((q) => q.s))];
    await bulk(c, 'checklist_sections', ['checklist_id', 's_code', 'position'], secs.map((s, i) => [id, s, i]));
    await bulk(c, 'checklist_questions', ['checklist_id', 'qid', 's_code', 'subcategory', 'question', 'description', 'guidance', 'max_score', 'min_score', 'weight', 'mandatory', 'evidence_required', 'photo_required', 'finding_required', 'active', 'response_type', 'position'],
      qs.map((q, i) => [id, q.qid, q.s, nz(q.sub), q.text, nz(q.desc), nz(q.guidance), num(q.max) ?? 5, num(q.min) ?? 1, num(q.weight) ?? 1, q.mandatory !== false, !!q.evidence, !!q.photo, !!q.findingReq, q.active !== false, q.rtype || 'score', i]));
  },
  async workorders(c, id, d) {
    await c.query('DELETE FROM audit_responses WHERE work_order_id=$1', [id]); await c.query('DELETE FROM audit_scores WHERE work_order_id=$1', [id]);
    const R = d.responses || {};
    await bulk(c, 'audit_responses', ['work_order_id', 'qid', 'value', 'remark', 'finding_id', 'photo_count', 'answered_at'],
      Object.entries(R).map(([q, r]) => [id, q, r.v === undefined || r.v === null ? null : String(r.v), nz(r.remark), nz(r.findingId), (r.photos || []).length, ts(r.at)]));
    const sc = d.score;
    if (sc) await bulk(c, 'audit_scores', ['work_order_id', 's_key', 'got', 'max', 'pct'], Object.entries(sc).filter(([, v]) => v && typeof v === 'object' && 'pct' in v).map(([k, v]) => [id, k, num(v.got), num(v.max), num(v.pct)]));
    if (d.scheduleId && d.plannedDate) await c.query('INSERT INTO audit_calendar(schedule_id,planned_date,work_order_id) VALUES ($1,$2,$3) ON CONFLICT (schedule_id,planned_date) DO UPDATE SET work_order_id=EXCLUDED.work_order_id', [d.scheduleId, day(d.plannedDate), id]);
  },
  async actions(c, id, d) {
    await c.query('DELETE FROM action_history WHERE action_id=$1', [id]); await c.query('DELETE FROM action_verifications WHERE action_id=$1', [id]);
    const h = d.history || [];
    await bulk(c, 'action_history', ['action_id', 'seq', 'at', 'by_user', 'from_status', 'to_status', 'note'], h.map((x, i) => [id, i, ts(x.at), nz(x.by), nz(x.from), nz(x.to), nz(x.note)]));
    const v = h.filter((x) => x.to === 'Verified' || x.to === 'Rejected');
    await bulk(c, 'action_verifications', ['action_id', 'seq', 'result', 'verified_by', 'verified_at', 'remarks', 'revised_target'], v.map((x, i) => [id, i, x.to === 'Verified' ? 'Accepted' : 'Rejected', nz(x.by), ts(x.at), nz(x.note), x.to === 'Rejected' ? day(d.revisedTarget) : null]));
  },
};

/* ---------- document API ---------- */
function rowToDoc(coll, row) {
  if (coll === 'cfg') return Object.assign({}, row.data, { id: row.key });
  return Object.assign({}, row.data, { id: row.id });
}

async function getDoc(client, coll, id, forUpdate) {
  const m = COLL[coll]; const pk = m.pk || 'id';
  const r = await (client || pool).query(`SELECT * FROM ${m.table} WHERE ${pk}=$1${forUpdate ? ' FOR UPDATE' : ''}`, [id]);
  return r.rows[0] ? rowToDoc(coll, r.rows[0]) : null;
}

async function upsertDoc(client, coll, id, doc, ctx = {}) {
  const m = COLL[coll]; if (!m) throw Object.assign(new Error('Unknown collection'), { status: 404 });
  const body = coll === 'users' ? stripPwd(doc) : (() => { const o = Object.assign({}, doc); delete o.id; return o; })();
  if (coll === 'cfg') {
    await client.query('INSERT INTO app_settings(key,data) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET data=EXCLUDED.data', [id, body]);
    await PROJECT.cfg(client, id, body); return;
  }
  let cols = m.cols(body, id);
  if (coll === 'logs') cols.owner = ctx.user ? ctx.user.id : null;
  const names = Object.keys(cols); const vals = Object.values(cols);
  const ins = ['id'].concat(names, ['data']); const params = [id].concat(vals, [body]);
  const ph = params.map((_, i) => '$' + (i + 1));
  const upd = names.concat(['data']).map((n) => `${n}=EXCLUDED.${n}`).join(',');
  await client.query(`INSERT INTO ${m.table} (${ins.join(',')}) VALUES (${ph.join(',')}) ON CONFLICT (id) DO UPDATE SET ${upd}`, params);
  await client.query('DELETE FROM tombstones WHERE coll=$1 AND id=$2', [coll, id]);
  if (PROJECT[coll]) await PROJECT[coll](client, id, body);
  if (coll === 'logs') await projectLog(client, id, body, ctx);
}

async function projectLog(client, id, body, ctx) {
  const have = (await client.query('SELECT count(*)::int n FROM audit_logs WHERE log_doc=$1', [id])).rows[0].n;
  const fresh = (body.entries || []).slice(have);
  await bulk(client, 'audit_logs', ['at', 'user_id', 'module', 'record', 'action', 'prev_value', 'new_value', 'device', 'ip', 'log_doc'],
    fresh.map((e) => [e.at || new Date().toISOString(), e.user || (ctx.user && ctx.user.id) || 'unknown', e.module || 'System', nz(e.record), e.action || '', nz(e.prev), nz(e.next), nz(e.device), ctx.ip || null, id]));
}

async function deleteDoc(client, coll, id) {
  const m = COLL[coll]; const r = await client.query(`DELETE FROM ${m.table} WHERE ${m.pk || 'id'}=$1`, [id]);
  if (r.rowCount) await client.query('INSERT INTO tombstones(coll,id) VALUES ($1,$2) ON CONFLICT (coll,id) DO UPDATE SET rev=nextval(\'change_seq\')', [coll, id]);
  return r.rowCount;
}

/* ---------- scoping (zones / departments a user may see) ---------- */
async function zoneIdsFor(user, client) {
  const q = client || pool;
  if (user.role === 'admin') return (await q.query('SELECT id FROM zones')).rows.map((r) => r.id);      // administrators are not limited to listed APUs
  if (user.role === 'leader') return (await q.query('SELECT id FROM zones WHERE leader_id=$1 OR backup_id=$1', [user.id])).rows.map((r) => r.id);
  if (user.role === 'member') return (await q.query("SELECT DISTINCT zone_id id FROM zone_members WHERE user_id=$1", [user.id])).rows.map((r) => r.id);
  return (await q.query(`SELECT id FROM zones z WHERE
      (NOT EXISTS (SELECT 1 FROM user_divisions ud WHERE ud.user_id=$1) OR z.division_id IN (SELECT division_id FROM user_divisions WHERE user_id=$1))
  AND (NOT EXISTS (SELECT 1 FROM user_plants up WHERE up.user_id=$1) OR z.plant_id IN (SELECT plant_id FROM user_plants WHERE user_id=$1))`, [user.id])).rows.map((r) => r.id);
}

/* returns [sqlCondition, params] using $1=user id, $2=zone ids */
function scopeSql(coll, user) {
  const priv = ['admin', 'facilitator', 'management'].includes(user.role);
  switch (coll) {
    case 'zones': return 'id = ANY($2)';
    case 'workorders': return 'zone_id = ANY($2) OR auditor_id=$1 OR backup_auditor_id=$1';
    case 'findings': case 'actions': return 'zone_id = ANY($2) OR responsible_id=$1';
    case 'improvements': return 'zone_id = ANY($2)';
    case 'schedules': return 'zone_id = ANY($2) OR auditor_id=$1 OR backup_id=$1';
    case 'notifications': return '$1 = ANY(recipients)';
    case 'logs': return priv ? 'true' : 'false';
    default: return 'true';
  }
}

/* what a role may see of other employees */
function publicUser(doc, viewer) {
  const o = Object.assign({}, doc); delete o.pwd;
  if (!['admin', 'facilitator'].includes(viewer.role) && viewer.id !== doc.id) { delete o.mobile; delete o.email; delete o.joinDate; }
  return o;
}

async function listChanged(user, since, limit) {
  const zoneIds = await zoneIdsFor(user);
  const out = []; let cap = Infinity;
  for (const coll of COLLECTIONS) {
    const m = COLL[coll]; const pk = m.pk || 'id';
    const r = await pool.query(`SELECT ${pk} AS id, data, rev FROM ${m.table} WHERE rev > $3 AND (${scopeSql(coll, user)}) AND $1::text IS NOT NULL AND $2::text[] IS NOT NULL ORDER BY rev LIMIT ${limit + 1}`, [user.id, zoneIds, since]);
    let rows = r.rows;
    if (rows.length > limit) { rows = rows.slice(0, limit); cap = Math.min(cap, Number(rows[rows.length - 1].rev)); }
    rows.forEach((x) => out.push({ c: coll, id: x.id, rev: Number(x.rev), doc: coll === 'users' ? publicUser(Object.assign({}, x.data, { id: x.id }), user) : Object.assign({}, x.data, { id: x.id }) }));
  }
  const t = await pool.query('SELECT coll,id,rev FROM tombstones WHERE rev > $1 ORDER BY rev LIMIT $2', [since, limit + 1]);
  let trows = t.rows; if (trows.length > limit) { trows = trows.slice(0, limit); cap = Math.min(cap, Number(trows[trows.length - 1].rev)); }
  trows.forEach((x) => out.push({ c: x.coll, id: x.id, rev: Number(x.rev), doc: null }));
  const kept = out.filter((x) => x.rev <= cap).sort((a, b) => a.rev - b.rev);
  const head = (await pool.query('SELECT last_value::bigint v FROM change_seq')).rows[0].v;
  const rev = cap !== Infinity ? cap : Math.max(Number(since), Number(head));
  return { docs: kept, rev, more: cap !== Infinity };
}

async function nextNumber(client, kind) {
  const r = await client.query('INSERT INTO counters(kind,n) VALUES ($1,1) ON CONFLICT (kind) DO UPDATE SET n = counters.n + 1 RETURNING n', [kind]);
  return Number(r.rows[0].n);
}

async function pagedList(coll, user, { limit = 50, cursor = '' } = {}) {
  const m = COLL[coll]; const pk = m.pk || 'id'; const zoneIds = await zoneIdsFor(user);
  limit = Math.min(Math.max(Number(limit) || 50, 1), 500);
  const r = await pool.query(`SELECT ${pk} AS id, data FROM ${m.table} WHERE ${pk} > $3 AND (${scopeSql(coll, user)}) AND $1::text IS NOT NULL AND $2::text[] IS NOT NULL ORDER BY ${pk} LIMIT ${limit + 1}`, [user.id, zoneIds, cursor]);
  const rows = r.rows; const more = rows.length > limit; if (more) rows.pop();
  const items = rows.map((x) => (coll === 'users' ? publicUser(Object.assign({}, x.data, { id: x.id }), user) : Object.assign({}, x.data, { id: x.id })));
  return { items, next: more ? rows[rows.length - 1].id : null };
}

module.exports = { COLL, COLLECTIONS, getDoc, upsertDoc, deleteDoc, zoneIdsFor, scopeSql, listChanged, nextNumber, pagedList, publicUser, rowToDoc, tx, pool, bulk };
