'use strict';
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const cfg = require('./config');
const { pool, tx } = require('./db');
const repo = require('./repo');
const auth = require('./auth');
const svc = require('./services');
const FS = require('./shared');
const { authorize, HttpError } = require('./policy');

const app = express();
if (cfg.trustProxy) app.set('trust proxy', 1);
app.disable('x-powered-by');

/* ---------- security headers ---------- */
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],        // the single-file web app is delivered as one inline bundle
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'", 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'],
      workerSrc: ["'self'"], manifestSrc: ["'self'"],
      objectSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'self'"], formAction: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: cfg.isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
}));
if (cfg.corsOrigin) app.use((req, res, next) => { res.set({ 'Access-Control-Allow-Origin': cfg.corsOrigin, 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With', 'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS', Vary: 'Origin' }); if (req.method === 'OPTIONS') return res.sendStatus(204); next(); });

const json = express.json({ limit: '6mb' });
const api = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/* ---------- helpers ---------- */
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
function deepMerge(base, part) {
  const out = JSON.parse(JSON.stringify(base || {}));
  Object.entries(part || {}).forEach(([k, v]) => {
    if (BAD_KEYS.has(k)) return;
    if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) out[k] = deepMerge(out[k], v); else out[k] = v === undefined ? null : v;
  });
  return out;
}
const cleanId = (id) => { if (!/^[A-Za-z0-9_.:@+-]{1,120}$/.test(String(id || ''))) throw new HttpError(400, 'Invalid id'); return String(id); };
const COLL_OF = (name) => { if (!repo.COLL[name]) throw new HttpError(404, 'Unknown collection'); return name; };
const REQUIRED = { zones: ['code', 'name', 'plant', 'apu'], checksheets: ['family', 'name', 'version', 'status', 'questions'], schedules: ['zone', 'checksheet', 'frequency', 'startDate'], workorders: ['no', 'zone', 'plant', 'apu', 'plannedDate', 'status'], findings: ['no', 'zone', 'severity'], actions: ['no', 'zone'], improvements: ['no', 'zone'], users: ['name', 'role'] };
const NUMBERED = { workorders: 'AUD', findings: 'FND', actions: 'ACT', improvements: 'IMP' };

function validate(coll, doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new HttpError(422, 'Document must be a JSON object.');
  (REQUIRED[coll] || []).forEach((f) => { if (doc[f] === undefined || doc[f] === null || doc[f] === '') throw new HttpError(422, `Field "${f}" is required.`); });
  if (coll === 'checksheets' && !Array.isArray(doc.questions)) throw new HttpError(422, 'Checksheet needs a list of questions.');
  if (coll === 'findings' && !['Critical', 'Major', 'Minor', 'Observation', 'Improvement Opportunity'].includes(doc.severity)) throw new HttpError(422, 'Invalid severity.');
  if (coll === 'users' && !['admin', 'facilitator', 'auditor', 'leader', 'member', 'management'].includes(doc.role)) throw new HttpError(422, 'Invalid role.');
}

/* one authoritative write path used by sync + REST resources */
async function writeDoc(req, coll, id, op, body) {
  return tx(async (c) => {
    const existing = await repo.getDoc(c, coll, id, true);
    if (existing && coll === 'logs') existing.__owner = (await c.query('SELECT owner FROM audit_log_docs WHERE id=$1', [id])).rows[0].owner;
    let next = null;
    if (op === 'set') next = body;
    else if (op === 'update') { if (!existing) throw new HttpError(404, 'Document does not exist', 'invalid_argument'); next = deepMerge(existing, body); delete next.id; }
    if (existing) { delete existing.id; }
    if (next) { delete next.id; if (coll !== 'cfg' && !(coll === 'users' && existing)) validate(coll, Object.assign({}, existing || {}, next)); }
    const settings = await svc.getSettings(c);
    await authorize({ user: req.user, coll, id, op: op === 'delete' ? 'delete' : existing ? 'update' : 'create', existing: existing ? Object.assign({}, existing) : null, next, settings, client: c });
    if (existing) delete existing.__owner;
    if (op === 'delete') { const n = await repo.deleteDoc(c, coll, id); return { deleted: n }; }
    if (coll === 'users' && existing) { next = Object.assign({}, next); }
    await repo.upsertDoc(c, coll, id, next, { user: req.user, ip: req.ip });
    return { ok: true };
  });
}

/* ---------- public ---------- */
api.get('/health', wrap(async (req, res) => { const r = await pool.query('SELECT 1 AS ok'); res.json({ status: 'ok', db: r.rows[0].ok === 1, time: new Date().toISOString() }); }));

api.get('/branding', wrap(async (req, res) => { const st = await svc.getSettings(); res.json({ appTitle: st.appTitle, sNames: st.sNames }); }));

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false, message: { error: { code: 'rate_limited', message: 'Too many attempts. Try again later.' } } });
api.post('/auth/login', loginLimiter, json, wrap(async (req, res) => {
  const { username, password } = req.body || {};
  try {
    const u = await auth.login(username, password, req, res);
    const me = await repo.getDoc(null, 'users', u.id);
    res.json({ user: repo.publicUser(me, { id: u.id, role: u.role }) });
  } catch (e) { if (e.status === 401 || e.status === 423) await svc.serverLog(null, null, 'Login', String(username || '').slice(0, 40), 'Sign-in failed', '', e.message, req).catch(() => {}); throw e; }
}));
api.post('/auth/forgot', loginLimiter, json, wrap(async (req, res) => {
  const id = String((req.body || {}).id || '').trim().toLowerCase().slice(0, 60);
  const u = (await pool.query('SELECT id,name FROM users WHERE lower(id)=$1 OR lower(email)=$1', [id])).rows[0];
  if (u) { const st = await svc.getSettings(); const admins = (await pool.query("SELECT id FROM users WHERE role='admin' AND status='Active'")).rows.map((x) => x.id); await tx((c) => svc.notify(c, st, 'Password reset request', 'Password reset requested', `${u.name} (${u.id}) asked for a password reset.`, admins, { page: 'users', id: '' })); }
  res.status(202).json({ ok: true });       // identical response whether or not the account exists
}));

/* ---------- authenticated ---------- */
api.use(wrap(auth.authenticate));

api.get('/auth/me', wrap(async (req, res) => { res.json({ user: repo.publicUser(await repo.getDoc(null, 'users', req.user.id), req.user) }); }));
api.post('/auth/logout', wrap(async (req, res) => { await auth.logout(req, res); res.json({ ok: true }); }));
api.post('/auth/change-password', json, wrap(async (req, res) => {
  const { current, password } = req.body || {}; auth.checkPassword(password);
  const u = (await pool.query('SELECT pwd_hash FROM users WHERE id=$1', [req.user.id])).rows[0];
  if (!u || !(await require('bcryptjs').compare(String(current || ''), u.pwd_hash || ''))) throw new HttpError(422, 'Current password is not correct.');
  await pool.query('UPDATE users SET pwd_hash=$2, pwd_changed_at=now(), must_change_pwd=false WHERE id=$1', [req.user.id, await auth.hash(password)]);
  await pool.query('UPDATE auth_sessions SET revoked=true WHERE user_id=$1 AND jti<>$2', [req.user.id, req.user.jti]);
  await svc.serverLog(null, req.user, 'User Role', 'User ' + req.user.id, 'Password changed', '', '', req);
  res.json({ ok: true });
}));

/* incremental sync used by the web app (scoped to the user's zones) */
api.get('/sync', wrap(async (req, res) => {
  const since = Math.max(0, Number(req.query.since) || 0); const limit = Math.min(Math.max(Number(req.query.limit) || 400, 50), 2000);
  res.json(await repo.listChanged(req.user, since, limit));
}));

/* numbering (atomic, gap-free per kind) */
api.post('/numbers/:kind', wrap(async (req, res) => {
  const kind = String(req.params.kind).toUpperCase(); if (!/^[A-Z]{2,5}$/.test(kind)) throw new HttpError(400, 'Invalid number kind');
  if (req.user.role === 'management') throw new HttpError(403, 'Management has read-only access.');
  const n = await tx((c) => repo.nextNumber(c, kind)); res.json({ n });
}));

/* generic document endpoints */
api.get('/docs/:coll', wrap(async (req, res) => res.json(await repo.pagedList(COLL_OF(req.params.coll), req.user, { limit: req.query.limit, cursor: req.query.cursor }))));
api.get('/docs/:coll/:id', wrap(async (req, res) => res.json(await getScoped(req, COLL_OF(req.params.coll), cleanId(req.params.id)))));
api.put('/docs/:coll/:id', json, wrap(async (req, res) => res.json(await writeDoc(req, COLL_OF(req.params.coll), cleanId(req.params.id), 'set', req.body))));
api.patch('/docs/:coll/:id', json, wrap(async (req, res) => res.json(await writeDoc(req, COLL_OF(req.params.coll), cleanId(req.params.id), 'update', req.body))));
api.delete('/docs/:coll/:id', wrap(async (req, res) => res.json(await writeDoc(req, COLL_OF(req.params.coll), cleanId(req.params.id), 'delete'))));

async function getScoped(req, coll, id) {
  const m = repo.COLL[coll]; const zones = await repo.zoneIdsFor(req.user);
  const r = await pool.query(`SELECT ${m.pk || 'id'} AS id, data FROM ${m.table} WHERE ${m.pk || 'id'}=$3 AND (${repo.scopeSql(coll, req.user)}) AND $1::text IS NOT NULL AND $2::text[] IS NOT NULL`, [req.user.id, zones, id]);
  if (!r.rows[0]) throw new HttpError(404, 'Not found');
  const d = Object.assign({}, r.rows[0].data, { id: r.rows[0].id }); return coll === 'users' ? repo.publicUser(d, req.user) : d;
}

/* ---------- REST resources (spec section 39) ---------- */
const RES = { zones: 'zones', checklists: 'checksheets', 'audits/schedule': 'schedules', 'audit-work-orders': 'workorders', findings: 'findings', actions: 'actions', improvements: 'improvements', notifications: 'notifications' };

/* users (credentials handled here, never through the document endpoints) */
const userRouter = express.Router();
userRouter.get('/', wrap(async (req, res) => res.json(await repo.pagedList('users', req.user, { limit: req.query.limit, cursor: req.query.cursor }))));
userRouter.get('/:id', wrap(async (req, res) => res.json(await getScoped(req, 'users', cleanId(req.params.id)))));
const saveUser = wrap(async (req, res) => {
  if (req.user.role !== 'admin') throw new HttpError(403, 'Only the System Administrator can manage users.');
  const id = cleanId(req.params.id || (req.body.user || req.body).id); const body = req.body || {}; const doc = Object.assign({}, body.user || body); delete doc.password; delete doc.pwd;
  const password = body.password || (body.user && body.user.password) || null;
  const existing = await repo.getDoc(null, 'users', id);
  if (!existing && !password) throw new HttpError(422, 'A temporary password is required for a new user.');
  if (password) auth.checkPassword(password);
  const merged = existing ? deepMerge(existing, doc) : doc; delete merged.id; validate('users', merged);
  if (!merged.status) merged.status = 'Active';
  await tx(async (c) => {
    await repo.upsertDoc(c, 'users', id, merged, { user: req.user, ip: req.ip });
    if (password) await c.query('UPDATE users SET pwd_hash=$2, pwd_changed_at=now(), must_change_pwd=true WHERE id=$1', [id, await auth.hash(password)]);
    if (merged.status !== 'Active') await c.query('UPDATE auth_sessions SET revoked=true WHERE user_id=$1', [id]);
    await svc.serverLog(c, req.user, 'User Role', 'User ' + id, existing ? 'User updated' : 'User created', existing ? `${existing.role}/${existing.status}` : '', `${merged.role}/${merged.status}`, req);
  });
  res.status(existing ? 200 : 201).json({ ok: true, id });
});
userRouter.put('/:id', json, saveUser);
userRouter.post('/', json, saveUser);
userRouter.post('/:id/reset-password', json, wrap(async (req, res) => {
  if (req.user.role !== 'admin') throw new HttpError(403, 'Only the System Administrator can reset passwords.');
  const id = cleanId(req.params.id); const { password } = req.body || {}; auth.checkPassword(password);
  const r = await pool.query('UPDATE users SET pwd_hash=$2, pwd_changed_at=now(), must_change_pwd=true, failed_attempts=0, locked_until=NULL WHERE id=$1', [id, await auth.hash(password)]);
  if (!r.rowCount) throw new HttpError(404, 'User not found');
  await pool.query('UPDATE auth_sessions SET revoked=true WHERE user_id=$1', [id]);
  await svc.serverLog(null, req.user, 'User Role', 'User ' + id, 'Password reset', '', '', req);
  res.json({ ok: true });
}));
api.use('/users', userRouter);

Object.entries(RES).forEach(([path0, coll]) => {
  const r = express.Router();
  r.get('/', wrap(async (req, res) => res.json(await repo.pagedList(coll, req.user, { limit: req.query.limit, cursor: req.query.cursor }))));
  r.get('/:id', wrap(async (req, res) => res.json(await getScoped(req, coll, cleanId(req.params.id)))));
  r.post('/', json, wrap(async (req, res) => {
    const body = Object.assign({}, req.body || {}); let id = body.id; delete body.id;
    if (!id) {
      if (NUMBERED[coll]) { const n = await tx((c) => svc.number(c, NUMBERED[coll])); id = n.id; if (!body.no) body.no = n.no; }
      else if (coll === 'schedules') { const n = await tx((c) => repo.nextNumber(c, 'SCH')); id = 'SCH-' + FS.pad(n, 4); }
      else if (coll === 'zones' && body.code) id = body.code;
      else if (coll === 'notifications') id = 'N-' + Date.now().toString(36);
      else throw new HttpError(422, 'id is required');
    }
    cleanId(id);
    if (await repo.getDoc(null, coll, id)) throw new HttpError(409, 'A record with this id already exists.');
    if (coll === 'workorders') Object.assign(body, { createdAt: body.createdAt || svc.nowISO(), createdBy: body.createdBy || req.user.id, status: body.status || 'Assigned', responses: body.responses || {}, locked: false, history: body.history || [{ at: svc.nowISO(), by: req.user.id, status: 'Assigned', note: 'Created via API' }] });
    await writeDoc(req, coll, id, 'set', body);
    res.status(201).json(Object.assign({ id }, body));
  }));
  r.put('/:id', json, wrap(async (req, res) => { await writeDoc(req, coll, cleanId(req.params.id), 'set', req.body); res.json({ ok: true }); }));
  r.patch('/:id', json, wrap(async (req, res) => { await writeDoc(req, coll, cleanId(req.params.id), 'update', req.body); res.json({ ok: true }); }));
  r.delete('/:id', wrap(async (req, res) => res.json(await writeDoc(req, coll, cleanId(req.params.id), 'delete'))));
  api.use('/' + path0, r);
});

/* ---------- audit execution ---------- */
api.get('/audits/:id', wrap(async (req, res) => {
  const id = cleanId(req.params.id); const wo = await getScoped(req, 'workorders', id);
  const cs = await repo.getDoc(null, 'checksheets', wo.checksheetId); const st = await svc.getSettings();
  const findings = (await pool.query('SELECT id,data FROM audit_findings WHERE work_order_id=$1 ORDER BY id', [id])).rows.map((r) => Object.assign({}, r.data, { id: r.id }));
  const fids = findings.map((f) => f.id);
  const actions = fids.length ? (await pool.query('SELECT id,data FROM actions WHERE finding_id = ANY($1) ORDER BY id', [fids])).rows.map((r) => Object.assign({}, r.data, { id: r.id })) : [];
  res.json({ workOrder: wo, checklist: cs, score: FS.scoreAudit(cs ? cs.questions : [], wo.responses, st), findings, actions });
}));
api.post('/audits/:id/responses', json, wrap(async (req, res) => {
  const id = cleanId(req.params.id); const rs = (req.body || {}).responses;
  if (!rs || typeof rs !== 'object' || Array.isArray(rs)) throw new HttpError(422, 'responses object required');
  const wo = await getScoped(req, 'workorders', id);
  if (wo.locked || FS.WO_DONE.includes(wo.status)) throw new HttpError(423, 'This audit is submitted and locked.', 'locked');
  const patch = { responses: rs };
  if (['Assigned', 'Accepted', 'Draft'].includes(wo.status)) { patch.status = 'In Progress'; patch.startedAt = wo.startedAt || svc.nowISO(); patch.history = (wo.history || []).concat([{ at: svc.nowISO(), by: req.user.id, status: 'In Progress' }]); }
  await writeDoc(req, 'workorders', id, 'update', patch);
  const cs = await repo.getDoc(null, 'checksheets', wo.checksheetId);
  const after = await repo.getDoc(null, 'workorders', id);
  res.json({ ok: true, score: FS.scoreAudit(cs.questions, after.responses, await svc.getSettings()) });
}));
api.post('/audits/:id/submit', wrap(async (req, res) => { const id = cleanId(req.params.id); await getScoped(req, 'workorders', id); res.json(await svc.submitAudit(id, req.user, req)); }));

/* ---------- dashboards, files, exports, admin ---------- */
api.use('/dashboard', require('./dashboard'));
api.use('/files', require('./files'));

const csvCell = (v) => { let s = v === null || v === undefined ? '' : String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const EXPORTS = {
  workorders: { coll: 'workorders', cols: [['no', 'Audit No'], ['zone', 'Zone'], ['apu', 'APU'], ['dept', 'Department'], ['auditType', 'Audit Type'], ['plannedDate', 'Planned'], ['dueDate', 'Due'], ['auditor', 'Auditor'], ['status', 'Status'], ['csVersion', 'Checksheet Version'], (d) => (d.score && d.score.overall ? d.score.overall.pct : '')] , heads: ['Score %'] },
  findings: { coll: 'findings', cols: [['no', 'Finding No'], ['woNo', 'Audit No'], ['zone', 'Zone'], ['s', 'S'], ['severity', 'Severity'], ['desc', 'Description'], ['responsible', 'Responsible'], ['due', 'Due'], ['status', 'Status']] },
  actions: { coll: 'actions', cols: [['no', 'Action No'], ['findingNo', 'Finding No'], ['zone', 'Zone'], ['desc', 'Description'], ['responsible', 'Responsible'], ['target', 'Target'], ['priority', 'Priority'], ['status', 'Status'], ['verifiedBy', 'Verified By'], ['verifiedAt', 'Verified At']] },
};
api.get('/export/:kind', wrap(async (req, res) => {
  const ex = EXPORTS[req.params.kind.replace(/\.csv$/, '')]; if (!ex) throw new HttpError(404, 'Unknown export');
  if (!['edit', 'view', 'limited'].includes(((await svc.getSettings()).permissions[req.user.role] || {}).Reports)) throw new HttpError(403, 'No access to reports.');
  const heads = ex.cols.filter((c) => Array.isArray(c)).map((c) => c[1]).concat(ex.heads || []);
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="5S-${req.params.kind.replace(/\.csv$/, '')}-${svc.todayISO()}.csv"` });
  res.write('﻿' + heads.map(csvCell).join(',') + '\n');
  let cursor = '';
  for (;;) {
    const page = await repo.pagedList(ex.coll, req.user, { limit: 500, cursor });
    for (const d of page.items) res.write(ex.cols.map((c) => csvCell(typeof c === 'function' ? c(d) : d[c[0]])).join(',') + '\n');
    if (!page.next) break; cursor = page.next;
  }
  await svc.serverLog(null, req.user, 'Reports', req.params.kind, 'Report exported (CSV)', '', '', req);
  res.end();
}));
api.post('/admin/generate-work-orders', wrap(async (req, res) => {
  if (!['admin', 'facilitator'].includes(req.user.role)) throw new HttpError(403, 'Not allowed');
  res.json({ created: await svc.generateDueWorkOrders(req.user) });
}));

api.use((req, res, next) => next(new HttpError(404, 'Endpoint not found')));
app.use('/api', api);

/* ---------- static web app ---------- */
const pub = path.join(__dirname, '..', 'public');
app.use(express.static(pub, { index: 'index.html', setHeaders: (res, p) => { if (/sw\.js$|index\.html$/.test(p)) res.set('Cache-Control', 'no-cache'); } }));
app.get(/^\/(?!api\/).*/, (req, res, next) => { if (req.method !== 'GET') return next(); res.sendFile(path.join(pub, 'index.html'), (e) => e && next()); });

/* ---------- errors ---------- */
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  let status = err.status || 500; let code = err.code && typeof err.code === 'string' && !/^\d/.test(err.code) && !/^[A-Z0-9]{5}$/.test(err.code) ? err.code : undefined; let message = err.message;
  if (err.type === 'entity.too.large') { status = 413; message = 'Request is too large.'; }
  else if (err.type === 'entity.parse.failed') { status = 400; message = 'Invalid JSON.'; }
  else if (/^23503/.test(err.code || '')) { status = 409; code = 'conflict'; message = 'A related record does not exist or is still in use. ' + (err.detail || ''); }
  else if (/^23505/.test(err.code || '')) { status = 409; code = 'conflict'; message = 'A record with this value already exists. ' + (err.detail || ''); }
  else if (/^(23514|23502|22P02|22007|22008|22001)/.test(err.code || '')) { status = 422; code = 'invalid_argument'; message = 'Invalid value: ' + (err.detail || err.message); }
  else if (status >= 500) { console.error(req.method, req.originalUrl, err); message = 'Unexpected server error.'; code = 'server_error'; }
  res.status(status).json({ error: { code: code || 'error', message, details: err.details } });
});

module.exports = app;
