'use strict';
/* Server-side domain services: numbering, notifications, audit submission, work-order generation, server audit-trail. */
const FS = require('./shared');
const repo = require('./repo');
const { pool, tx } = require('./db');
const { HttpError } = require('./policy');

const nowISO = () => new Date().toISOString();
const todayISO = () => new Date().toISOString().slice(0, 10);

async function getSettings(client) {
  const r = await (client || pool).query("SELECT data FROM app_settings WHERE key='settings'");
  return r.rows[0] ? r.rows[0].data : {};
}

async function number(client, kind, settings) {
  const n = await repo.nextNumber(client, kind);
  const st = settings || (await getSettings(client));
  return { n, id: kind + '-' + FS.pad(n, 6), no: FS.formatNo((st.numbering || {})[kind], kind, new Date().getFullYear(), n) };
}

/* append an event to the server audit-trail document of the day (visible in Audit Trail) */
async function serverLog(client, user, module, record, action, prev, next, req) {
  const date = todayISO(); const id = 'L-' + date.replace(/-/g, '') + '-server';
  const e = { at: nowISO(), user: user ? user.id : 'SYSTEM', module, record: String(record || ''), action, prev: prev == null ? '' : String(prev), next: next == null ? '' : String(next), device: req ? String(req.headers['user-agent'] || '').slice(0, 80) : 'server', ip: req ? req.ip : '' };
  const q = client || pool;
  await q.query(`INSERT INTO audit_log_docs(id, owner, log_date, data) VALUES ($1,'server',$2,$3)
    ON CONFLICT (id) DO UPDATE SET data = jsonb_set(audit_log_docs.data, '{entries}', COALESCE(audit_log_docs.data->'entries','[]'::jsonb) || $4::jsonb)`,
    [id, date, { date, session: 'server', entries: [e] }, JSON.stringify([e])]);
  await q.query('INSERT INTO audit_logs(at,user_id,module,record,action,prev_value,new_value,device,ip,log_doc) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [e.at, e.user, module, e.record, action, e.prev, e.next, e.device, e.ip, id]);
}

async function notify(client, settings, type, title, body, to, link, by) {
  const rule = ((settings.notificationRules || []).find((r) => r.event === type)) || { inapp: true };
  if (rule.inapp === false) return;
  const ids = [...new Set((to || []).filter(Boolean))]; if (!ids.length) return;
  const id = 'N-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  await repo.upsertDoc(client, 'notifications', id, { at: nowISO(), type, title, body: body || '', to: ids, link: link || null, readBy: [], channels: ['In-app'].concat(rule.email ? ['Email'] : [], rule.msg ? ['Messaging'] : []), by: by || 'SYSTEM' });
}

/* validation rules from spec section 52 */
function auditIssues(wo, questions, st) {
  const out = []; const ad = String(wo.startedAt || wo.plannedDate || '').slice(0, 10);
  (questions || []).filter((q) => q.active !== false).forEach((q) => {
    const r = (wo.responses || {})[q.qid] || {}; const has = r.v !== undefined && r.v !== null && r.v !== '';
    if (q.mandatory && !has) out.push({ qid: q.qid, msg: 'Mandatory question not answered' });
    const val = has ? FS.responseValue(q, r.v) : null;
    const needF = has && r.v !== 'NA' && ((q.rtype || 'score') === 'score' ? val <= (st.findingThreshold ?? 2) : val === Number(q.min ?? 0)) && q.findingReq !== false;
    if (needF && !r.finding && !r.findingId) out.push({ qid: q.qid, msg: `Score ${r.v} needs a finding` });
    if (r.finding && !r.findingId) {
      if (!r.finding.desc) out.push({ qid: q.qid, msg: 'Finding description missing' });
      if (!r.finding.severity) out.push({ qid: q.qid, msg: 'Finding severity missing' });
      if (!r.finding.responsible) out.push({ qid: q.qid, msg: 'Finding responsible person missing' });
      if (r.finding.due && ad && r.finding.due < ad) out.push({ qid: q.qid, msg: 'Due date is before the audit date' });
    }
    if (q.photo && has && r.v !== 'NA' && !(r.photos || []).length) out.push({ qid: q.qid, msg: 'Photograph required' });
  });
  return out;
}

/* Idempotent audit submission: scores, findings, actions, approvals, lock. */
async function submitAudit(woId, user, req) {
  return tx(async (c) => {
    const wo = await repo.getDoc(c, 'workorders', woId, true);
    if (!wo) throw new HttpError(404, 'Audit not found');
    if (FS.WO_DONE.includes(wo.status)) return { already: true, workOrder: wo };           // duplicate submit (offline sync) is harmless
    if (!['admin', 'facilitator'].includes(user.role) && ![wo.auditor, wo.backupAuditor].includes(user.id)) throw new HttpError(403, 'This audit is not assigned to you.');
    if (!FS.WO_OPEN.includes(wo.status)) throw new HttpError(409, `An audit in status "${wo.status}" cannot be submitted.`);
    const st = await getSettings(c);
    const cs = await repo.getDoc(c, 'checksheets', wo.checksheetId);
    if (!cs) throw new HttpError(422, 'Checksheet version used by this audit was not found.');
    const issues = auditIssues(wo, cs.questions, st);
    if (issues.length) { const e = new HttpError(422, `${issues.length} item(s) must be fixed before submitting.`); e.details = issues; throw e; }
    const zone = await repo.getDoc(c, 'zones', wo.zone);
    const responses = JSON.parse(JSON.stringify(wo.responses || {})); const date = String(wo.startedAt || wo.plannedDate).slice(0, 10);
    const created = { findings: [], actions: [] };
    for (const q of cs.questions.filter((x) => x.active !== false)) {
      const r = responses[q.qid]; if (!r || !r.finding || r.findingId) continue;
      const fd = r.finding; const num = await number(c, 'FND', st);
      const finding = { no: num.no, woId, woNo: wo.no, zone: wo.zone, plant: wo.plant, apu: wo.apu, dept: wo.dept, s: q.s, qid: q.qid, question: q.text, desc: fd.desc, category: fd.category || '', severity: fd.severity, score: r.v === 'NA' ? null : FS.responseValue(q, r.v), responsible: fd.responsible || (zone && zone.leader), due: fd.due, immediate: fd.immediate || '', rootCause: '', ca: '', pa: '', status: 'Open', photos: r.photos || [], createdAt: nowISO(), createdBy: wo.auditor, auditDate: date };
      await repo.upsertDoc(c, 'findings', num.id, finding); created.findings.push(num.id);
      r.findingId = num.id;
      if (fd.severity === 'Critical') await notify(c, st, 'Critical finding created', 'Critical finding in ' + wo.zone, fd.desc, [finding.responsible, zone && zone.leader], { page: 'finding', id: num.id });
      if (fd.caRequired && fd.action) {
        const an = await number(c, 'ACT', st);
        await repo.upsertDoc(c, 'actions', an.id, { no: an.no, findingId: num.id, findingNo: num.no, woId, zone: wo.zone, plant: wo.plant, apu: wo.apu, dept: wo.dept, desc: fd.action, type: 'Corrective', responsible: finding.responsible, target: fd.due, priority: ['Critical', 'Major'].includes(fd.severity) ? 'High' : 'Medium', status: 'Open', rootCause: '', ca: '', pa: '', evidence: [], createdAt: nowISO(), createdBy: wo.auditor, history: [{ at: nowISO(), by: wo.auditor, from: '', to: 'Open', note: 'Assigned during audit' }] });
        created.actions.push(an.id);
        await notify(c, st, 'Action assigned', 'Action assigned: ' + an.no, fd.action, [finding.responsible], { page: 'action', id: an.id });
      }
    }
    const score = FS.scoreAudit(cs.questions, responses, st);
    const end = nowISO(); const from = wo.resumedAt || wo.startedAt;
    const duration = from ? Math.max(1, (wo.activeMin || 0) + Math.round((new Date(end) - new Date(from)) / 60000)) : null;
    const approvals = ((st.approvals || {})[wo.auditType] || []).map((level) => ({ level, status: 'Pending' }));
    const next = Object.assign({}, wo, { responses, status: approvals.length ? 'Submitted' : 'Approved', score, endedAt: end, submittedAt: end, duration, approvals, locked: true, syncState: null, originalScore: wo.originalScore || score.overall.pct, history: (wo.history || []).concat([{ at: end, by: user.id, status: 'Submitted', note: '' }]) });
    await repo.upsertDoc(c, 'workorders', woId, next);
    await notify(c, st, 'Audit completed', `Audit submitted: ${wo.zone} scored ${score.overall.pct}%`, wo.no, [wo.leader], { page: 'wo', id: woId });
    await serverLog(c, user, 'Work Orders', wo.no, 'Audit submitted', wo.status, `${next.status} – ${score.overall.pct}%`, req);
    return Object.assign({ ok: true, score, workOrder: Object.assign({}, next, { id: woId }) }, created);
  });
}

/* Work orders are generated from schedules using the trigger-duration and grace masters. */
async function generateDueWorkOrders(manualUser) {
  const lock = await pool.connect();
  try {
    const got = (await lock.query('SELECT pg_try_advisory_lock(52001) AS ok')).rows[0].ok;
    if (!got) return 0;
    const st = await getSettings(); const t = todayISO(); let created = 0;
    const scheds = (await pool.query("SELECT id, data FROM audit_schedules WHERE status='Active'")).rows;
    for (const s of scheds) {
      const sc = Object.assign({}, s.data, { id: s.id });
      const trig = (st.woTrigger || {})[sc.frequency] ?? 7; const grace = (st.woGrace || {})[sc.frequency] ?? 3;
      const z = await repo.getDoc(null, 'zones', sc.zone); if (!z || z.status !== 'Active') continue;
      for (const d of FS.occurrences(sc, FS.addDays(t, -grace), FS.addDays(t, trig))) {
        const exists = await pool.query('SELECT 1 FROM audit_work_orders WHERE schedule_id=$1 AND planned_date=$2', [s.id, d]);
        if (exists.rowCount) continue;
        try {
          await tx(async (c) => {
            const cs = (await c.query("SELECT id, data FROM audit_checklists WHERE family=$1 AND status='Active' ORDER BY (data->>'version')::numeric DESC NULLS LAST LIMIT 1", [sc.checksheet])).rows[0]
              || (await c.query('SELECT id, data FROM audit_checklists WHERE family=$1 ORDER BY version DESC LIMIT 1', [sc.checksheet])).rows[0];
            if (!cs) return;
            const num = await number(c, 'AUD', st);
            const wo = { no: num.no, scheduleId: s.id, zone: z.id, plant: z.plant, apu: z.apu, dept: z.dept, leader: z.leader, auditor: sc.auditor, backupAuditor: sc.backup || '', checksheetId: cs.id, csName: cs.data.name, csVersion: cs.data.version, auditType: sc.auditType, plannedDate: d, plannedTime: sc.time || '', dueDate: FS.addDays(d, grace), priority: sc.priority || 'Medium', status: 'Assigned', createdAt: nowISO(), createdBy: 'SYSTEM', responses: {}, score: null, approvals: ((st.approvals || {})[sc.auditType] || []).map((level) => ({ level, status: 'Pending' })), locked: false, reopens: [], history: [{ at: nowISO(), by: 'SYSTEM', status: 'Assigned', note: 'Auto-generated from ' + s.id + (manualUser ? ' (manual run)' : '') }] };
            await repo.upsertDoc(c, 'workorders', num.id, wo);
            await notify(c, st, 'Audit assigned', 'Audit assigned: ' + num.no, `Zone ${z.code} – ${z.name}, planned ${d}`, [sc.auditor], { page: 'wo', id: num.id });
            await serverLog(c, null, 'Work Orders', num.no, 'Work order generated', '', `${s.id} → ${d}`);
            created++;
          });
        } catch (e) { if (e.code !== '23505') console.error('generate WO failed', s.id, d, e.message); }   // 23505 = another instance created it first
      }
    }
    return created;
  } finally { try { await lock.query('SELECT pg_advisory_unlock(52001)'); } catch (e) {} lock.release(); }
}

/* overdue notices (once per record per day) */
async function overdueNotices() {
  const st = await getSettings(); const t = todayISO(); let n = 0;
  const wos = (await pool.query("SELECT id, no, zone_id, auditor_id, data->>'leader' leader FROM audit_work_orders WHERE status IN ('Draft','Assigned','Accepted','In Progress') AND due_date < $1", [t])).rows;
  const acts = (await pool.query("SELECT id, no, zone_id, responsible_id FROM actions WHERE status IN ('Open','In Progress','Rejected') AND target_date < $1", [t])).rows;
  const items = wos.map((w) => ({ id: `N-ODW-${w.id}-${t}`, type: 'Audit overdue', title: 'Audit overdue: ' + w.no, to: [w.auditor_id, w.leader], link: { page: 'wo', id: w.id } }))
    .concat(acts.map((a) => ({ id: `N-ODA-${a.id}-${t}`, type: 'Action overdue', title: 'Action overdue: ' + a.no, to: [a.responsible_id], link: { page: 'action', id: a.id } })));
  for (const it of items) {
    const ex = await pool.query('SELECT 1 FROM notifications WHERE id=$1', [it.id]); if (ex.rowCount) continue;
    const rule = (st.notificationRules || []).find((r) => r.event === it.type) || { inapp: true }; if (rule.inapp === false) continue;
    await tx((c) => repo.upsertDoc(c, 'notifications', it.id, { at: nowISO(), type: it.type, title: it.title, body: '', to: [...new Set(it.to.filter(Boolean))], link: it.link, readBy: [], channels: ['In-app'], by: 'SYSTEM' })); n++;
  }
  return n;
}

module.exports = { getSettings, number, serverLog, notify, submitAudit, generateDueWorkOrders, overdueNotices, auditIssues, nowISO, todayISO };
