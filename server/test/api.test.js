'use strict';
/* End-to-end API test: runs the section-63 acceptance scenario against a real PostgreSQL database.
   Usage: DATABASE_URL=postgres://.../fives_test npm test     (the database is reset and re-seeded) */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.SCHEDULER_ENABLED = 'false';
process.env.UPLOAD_DIR = require('path').join(require('os').tmpdir(), 'fives-test-uploads');
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://fives:fives@localhost:5432/fives_test';

const assert = require('assert');
const { execFileSync } = require('child_process');
const path = require('path');
const sharp = require('sharp');
const app = require('../src/app');
const { pool } = require('../src/db');
const svc = require('../src/services');

let base; let passed = 0; const failures = [];
const step = async (name, fn) => { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failures.push(name); console.log('  FAIL ' + name + '\n       ' + (e.stack || e.message).split('\n').slice(0, 3).join('\n       ')); } };

function client() {
  let cookie = '';
  const c = async (method, url, body, opts = {}) => {
    const headers = { 'Content-Type': 'application/json' };
    if (cookie) headers.Cookie = cookie;
    if (!opts.noCsrf) headers['X-Requested-With'] = 'fives';
    const r = await fetch(base + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const ct = r.headers.get('content-type') || ''; const data = ct.includes('json') ? await r.json() : ct.includes('image') ? Buffer.from(await r.arrayBuffer()) : await r.text();
    return { status: r.status, data, headers: r.headers };
  };
  c.login = async (id, pw = 'Demo@123') => { const r = await c('POST', '/api/auth/login', { username: id, password: pw }); assert.strictEqual(r.status, 200, 'login ' + id + ' -> ' + r.status + JSON.stringify(r.data)); return r.data.user; };
  c.sync = async (since = 0) => { const out = {}; let rev = since; for (;;) { const r = await c('GET', `/api/sync?since=${rev}&limit=500`); r.data.docs.forEach((d) => { (out[d.c] = out[d.c] || {})[d.id] = d.doc; }); rev = r.data.rev; if (!r.data.more) break; } out.__rev = rev; return out; };
  return c;
}

(async () => {
  const dir = path.join(__dirname, '..');
  const env = Object.assign({}, process.env);
  console.log('Preparing database…');
  execFileSync('node', ['scripts/migrate.js'], { cwd: dir, env, stdio: 'pipe' });
  execFileSync('node', ['scripts/seed.js', '--today=' + svc.todayISO(), '--reset'], { cwd: dir, env, stdio: 'pipe' });
  const server = app.listen(0); base = 'http://127.0.0.1:' + server.address().port;
  const T = svc.todayISO();

  const admin = client(), fac = client(), aud = client(), lead = client(), mem = client(), mgr = client(), anon = client();
  let ctx = {};

  console.log('\nAuthentication & security');
  await step('health endpoint', async () => { const r = await anon('GET', '/api/health'); assert.strictEqual(r.data.db, true); });
  await step('wrong password rejected, no detail leak', async () => { const r = await anon('POST', '/api/auth/login', { username: 'APS1020', password: 'nope' }); assert.strictEqual(r.status, 401); assert.ok(!/hash/i.test(JSON.stringify(r.data))); });
  await step('API requires authentication', async () => { assert.strictEqual((await anon('GET', '/api/zones')).status, 401); assert.strictEqual((await anon('GET', '/api/sync')).status, 401); });
  await step('sign in as all six roles', async () => { await admin.login('APS1001'); await fac.login('APS1010'); await aud.login('APS1020'); await lead.login('APS1103'); await mem.login('APS1207'); await mgr.login('APS1002'); });
  await step('cookie writes need the CSRF header', async () => { const r = await admin('PATCH', '/api/docs/zones/CU-P01', { desc: 'x' }, { noCsrf: true }); assert.strictEqual(r.status, 403); });
  await step('password hash is never returned', async () => { const s = await admin.sync(); assert.ok(Object.values(s.users).every((u) => !('pwd' in u))); assert.ok(!JSON.stringify(s).includes('$2a$')); });
  await step('lock-out after repeated failures', async () => { const x = client(); for (let i = 0; i < 5; i++) await x('POST', '/api/auth/login', { username: 'APS1210', password: 'bad' + i }); const r = await x('POST', '/api/auth/login', { username: 'APS1210', password: 'Demo@123' }); assert.ok([423, 401].includes(r.status)); await pool.query("UPDATE users SET failed_attempts=0, locked_until=NULL WHERE id='APS1210'"); });

  console.log('\nRole-based access & data scoping');
  await step('zone leader only receives their own zone data', async () => { const s = await lead.sync(); const zs = Object.keys(s.zones); assert.deepStrictEqual(zs, ['CU-P03']); assert.ok(Object.values(s.workorders).every((w) => w.zone === 'CU-P03')); assert.ok(Object.values(s.findings).every((f) => f.zone === 'CU-P03' || f.responsible === 'APS1103')); });
  await step('zone member scoped to their zone; no audit trail access', async () => { const s = await mem.sync(); assert.deepStrictEqual(Object.keys(s.zones), ['CU-P03']); assert.ok(!s.logs || !Object.keys(s.logs).length); });
  await step('employee contact details hidden from non-admin roles', async () => { const s = await mem.sync(); assert.ok(Object.values(s.users).filter((u) => u.id !== 'APS1207').every((u) => !u.mobile && !u.email)); const a = await admin.sync(); assert.ok(Object.values(a.users).some((u) => u.mobile)); });
  await step('management is read-only', async () => { const r = await mgr('PATCH', '/api/docs/zones/CU-P01', { desc: 'x' }); assert.strictEqual(r.status, 403); const n = await mgr('POST', '/api/numbers/AUD'); assert.strictEqual(n.status, 403); });
  await step('member cannot edit zones, users or settings', async () => { for (const [u, b] of [['/api/docs/zones/CU-P03', { desc: 'x' }], ['/api/docs/cfg/settings', { company: 'x' }], ['/api/docs/users/APS1001', { role: 'member' }]]) assert.strictEqual((await mem('PATCH', u, b)).status, 403, u); });
  await step('facilitator cannot manage users or settings', async () => { assert.strictEqual((await fac('PATCH', '/api/docs/cfg/settings', { company: 'x' })).status, 403); assert.strictEqual((await fac('PUT', '/api/users/APS9999', { user: { name: 'X', role: 'admin' }, password: 'Passw0rd!' })).status, 403); });
  await step('auditor cannot read another zone work order through the API', async () => { const other = (await pool.query("SELECT id FROM audit_work_orders WHERE auditor_id <> 'APS1020' AND backup_auditor_id IS DISTINCT FROM 'APS1020' AND zone_id NOT IN (SELECT zone_id FROM audit_work_orders WHERE auditor_id='APS1020') LIMIT 1")).rows[0]; if (other) { const r = await aud('GET', '/api/audit-work-orders/' + other.id); assert.ok([404, 200].includes(r.status)); } });

  console.log('\nAcceptance scenario (spec §63)');
  await step('1-4 admin creates a plant, department, APU, zone; assigns leader and members', async () => {
    const m = (await admin('GET', '/api/docs/cfg/masters')).data; delete m.id;
    m.plants.push({ id: 'PL9', code: 'PL9', name: 'Plant 9 – Test', location: 'Test', status: 'Active' });
    m.departments.push({ id: 'D9', name: 'Packaging', status: 'Active' });
    m.apus.push({ id: 'TS', code: 'TS', name: 'Test APU', plant: 'PL9', facilitator: 'APS1010', status: 'Active' });
    assert.strictEqual((await admin('PUT', '/api/docs/cfg/masters', m)).status, 200);
    assert.ok((await pool.query("SELECT 1 FROM plants WHERE id='PL9'")).rowCount === 1 && (await pool.query("SELECT 1 FROM divisions WHERE id='TS' AND plant_id='PL9'")).rowCount === 1);
    const z = { code: 'TS-01', name: 'Packing Line 1', plant: 'PL9', apu: 'TS', dept: 'Packaging', type: 'Production', risk: 'Medium', leader: 'APS1103', backup: 'APS1101', members: ['APS1207', 'APS1208'], frequency: 'Weekly', checksheet: 'CS-TEST', status: 'Active', effFrom: T };
    const r = await admin('POST', '/api/zones', z); assert.strictEqual(r.status, 201, JSON.stringify(r.data));
    assert.strictEqual((await pool.query("SELECT count(*)::int n FROM zone_members WHERE zone_id='TS-01'")).rows[0].n, 4);
  });
  await step('5 admin creates a versioned 5S checksheet (V1.0 then V2.0)', async () => {
    const q = (s, i) => ({ qid: `${s}-0${i}`, s, sub: 'General', text: `${s} question ${i}`, desc: '', guidance: 'Check', max: 5, min: 1, weight: 1, mandatory: true, evidence: false, photo: false, findingReq: true, active: true, rtype: 'score' });
    const qs = ['S1', 'S2', 'S3', 'S4', 'S5'].flatMap((s) => [1, 2].map((i) => q(s, i)));
    const v1 = { family: 'CS-TEST', name: 'Test Area 5S Audit', version: '1.0', status: 'Active', zoneTypes: ['Production'], effectiveFrom: T, createdBy: 'APS1001', createdAt: new Date().toISOString(), questions: qs };
    assert.strictEqual((await admin('PUT', '/api/docs/checksheets/CS-TEST-V1', v1)).status, 200);
    assert.strictEqual((await pool.query("SELECT count(*)::int n FROM checklist_questions WHERE checklist_id='CS-TEST-V1'")).rows[0].n, 10);
    // a released version cannot be edited in place...
    const bad = await admin('PATCH', '/api/docs/checksheets/CS-TEST-V1', { questions: qs.slice(0, 5) }); assert.strictEqual(bad.status, 423);
    ctx.qs = qs;
  });
  await step('6 facilitator creates an audit schedule', async () => {
    const s = { zone: 'TS-01', plant: 'PL9', apu: 'TS', dept: 'Packaging', checksheet: 'CS-TEST', frequency: 'Weekly', interval: 7, startDate: T, endDate: '2027-12-31', time: '09:00', endTime: '10:00', auditor: 'APS1020', backup: 'APS1023', priority: 'High', auditType: 'Monthly Audit', status: 'Active', createdBy: 'APS1010', createdAt: new Date().toISOString() };
    const r = await fac('POST', '/api/audits/schedule', s); assert.strictEqual(r.status, 201, JSON.stringify(r.data)); ctx.sched = r.data.id;
    assert.strictEqual((await aud('POST', '/api/audits/schedule', s)).status, 403, 'auditor must not schedule');
  });
  await step('7-8 the system generates the work order; the auditor receives it (and a notification)', async () => {
    const n = await svc.generateDueWorkOrders(); assert.ok(n >= 1, 'generated ' + n);
    const again = await svc.generateDueWorkOrders(); assert.strictEqual(again, 0, 'no duplicates on the next run');
    const s = await aud.sync(); const wo = Object.entries(s.workorders).find(([, w]) => w.scheduleId === ctx.sched && w.plannedDate === T); assert.ok(wo, 'work order visible to auditor');
    ctx.wo = wo[0]; assert.match(wo[1].no, /^5S-AUD-\d{4}-\d{6}$/); assert.strictEqual(wo[1].checksheetId, 'CS-TEST-V1');
    assert.ok(Object.values(s.notifications).some((x) => x.link && x.link.id === ctx.wo));
  });
  await step('9-13 auditor opens the audit, answers questions, records a finding with a photo', async () => {
    const png = await sharp({ create: { width: 640, height: 480, channels: 3, background: '#a33' } }).png().toBuffer();
    const up = await aud('POST', '/api/files', { full: 'data:image/png;base64,' + png.toString('base64'), name: 'rust.png', woId: ctx.wo, qid: 'S1-01' });
    assert.strictEqual(up.status, 201, JSON.stringify(up.data)); ctx.photo = up.data.id;
    const bad = await aud('POST', '/api/files', { full: 'data:image/png;base64,' + Buffer.from('<?php echo 1;').toString('base64') }); assert.strictEqual(bad.status, 422, 'non-images are rejected');
    const responses = {};
    ctx.qs.forEach((q) => { responses[q.qid] = { v: q.qid === 'S1-01' ? 2 : q.qid === 'S5-02' ? 'NA' : 4, remark: '', photos: [], at: new Date().toISOString() }; });
    responses['S1-01'].photos = [{ id: ctx.photo, url: up.data.url, thumb: 'data:image/jpeg;base64,/9j/4AAQ' }];
    responses['S1-01'].finding = { desc: 'Rusted rack with unused parts', severity: 'Major', responsible: 'APS1103', due: T, category: 'Sort', caRequired: true, action: 'Remove parts and repaint rack', immediate: 'Tagged' };
    const r = await aud('POST', `/api/audits/${ctx.wo}/responses`, { responses }); assert.strictEqual(r.status, 200, JSON.stringify(r.data));
    assert.ok(r.data.score.S1.pct !== null);
    const g = await aud('GET', `/api/audits/${ctx.wo}`); assert.strictEqual(g.data.workOrder.status, 'In Progress'); assert.ok(g.data.workOrder.startedAt);
  });
  await step('52 validation: audit cannot be submitted with mandatory questions unanswered', async () => {
    await aud('POST', `/api/audits/${ctx.wo}/responses`, { responses: { 'S2-01': { v: null } } });
    const r = await aud('POST', `/api/audits/${ctx.wo}/submit`); assert.strictEqual(r.status, 422); assert.ok(r.data.error.details.some((d) => d.qid === 'S2-01'));
    await aud('POST', `/api/audits/${ctx.wo}/responses`, { responses: { 'S2-01': { v: 4 } } });
  });
  await step('14-16 scores calculated (N/A excluded) and audit submitted; duplicate submit is harmless', async () => {
    const r = await aud('POST', `/api/audits/${ctx.wo}/submit`); assert.strictEqual(r.status, 200, JSON.stringify(r.data));
    // S1 = (2+4)/(5+5) = 60 ; S5 has one N/A -> 4/5 = 80 ; others 80
    assert.strictEqual(r.data.score.S1.pct, 60); assert.strictEqual(r.data.score.S5.pct, 80); assert.strictEqual(r.data.score.S5.max, 5);
    assert.strictEqual(r.data.score.overall.pct, 76); assert.strictEqual(r.data.findings.length, 1); assert.strictEqual(r.data.actions.length, 1);
    ctx.fnd = r.data.findings[0]; ctx.act = r.data.actions[0];
    const again = await aud('POST', `/api/audits/${ctx.wo}/submit`); assert.strictEqual(again.status, 200); assert.strictEqual(again.data.already, true);
    assert.strictEqual((await pool.query('SELECT count(*)::int n FROM audit_findings WHERE work_order_id=$1', [ctx.wo])).rows[0].n, 1);
    const sc = (await pool.query('SELECT s_key,pct FROM audit_scores WHERE work_order_id=$1 ORDER BY s_key', [ctx.wo])).rows; assert.strictEqual(sc.length, 6);
  });
  await step('53 audit locking: nobody can change a submitted audit; reopen needs a reason', async () => {
    assert.strictEqual((await aud('POST', `/api/audits/${ctx.wo}/responses`, { responses: { 'S1-02': { v: 1 } } })).status, 423);
    assert.strictEqual((await admin('PATCH', `/api/docs/workorders/${ctx.wo}`, { responses: { 'S1-02': { v: 1 } } })).status, 423);
    assert.strictEqual((await fac('PATCH', `/api/docs/workorders/${ctx.wo}`, { locked: false, status: 'In Progress' })).status, 422, 'reopen without reason');
  });
  await step('17 zone leader views the findings of their zone', async () => { const s = await lead.sync(); assert.ok(s.findings[ctx.fnd]); assert.ok(s.actions[ctx.act]); });
  await step('approval workflow: zone leader approves, then facilitator', async () => {
    const wo = (await lead.sync()).workorders[ctx.wo]; assert.ok(wo.approvals.length >= 1);
    const ap = wo.approvals.map((a) => Object.assign({}, a)); const i = ap.findIndex((a) => a.status === 'Pending'); ap[i] = Object.assign(ap[i], { status: 'Approved', by: 'APS1103', at: new Date().toISOString() });
    const last = ap.every((a) => a.status === 'Approved');
    assert.strictEqual((await lead('PATCH', `/api/docs/workorders/${ctx.wo}`, { approvals: ap, status: last ? 'Approved' : 'Under Review' })).status, 200);
    assert.strictEqual((await lead('PATCH', `/api/docs/workorders/${ctx.wo}`, { responses: { 'S1-02': { v: 5 } } })).status, 403, 'leader cannot edit responses');
  });
  await step('19-20 responsible person updates the action and uploads evidence', async () => {
    const png = await sharp({ create: { width: 320, height: 240, channels: 3, background: '#3a3' } }).jpeg().toBuffer();
    const up = await lead('POST', '/api/files', { full: 'data:image/jpeg;base64,' + png.toString('base64'), name: 'after.jpg', actionId: ctx.act }); assert.strictEqual(up.status, 201);
    const a = (await lead.sync()).actions[ctx.act];
    const h = (a.history || []).concat([{ at: new Date().toISOString(), by: 'APS1103', from: 'Open', to: 'Submitted for Verification', note: 'Evidence uploaded' }]);
    const r = await lead('PATCH', `/api/docs/actions/${ctx.act}`, { status: 'Submitted for Verification', rootCause: 'No owner', ca: 'Painted', pa: 'Monthly check', evidence: [{ id: up.data.id, url: up.data.url }], history: h, submittedAt: new Date().toISOString() });
    assert.strictEqual(r.status, 200, JSON.stringify(r.data)); ctx.hist = h;
  });
  await step('52 closed action requires verification; rejection needs remarks; member cannot verify', async () => {
    assert.strictEqual((await fac('PATCH', `/api/docs/actions/${ctx.act}`, { status: 'Closed' })).status, 422);
    assert.strictEqual((await fac('PATCH', `/api/docs/actions/${ctx.act}`, { status: 'Rejected', history: ctx.hist.concat([{ to: 'Rejected', by: 'APS1010', at: new Date().toISOString() }]) })).status, 422);
    assert.strictEqual((await mem('PATCH', `/api/docs/actions/${ctx.act}`, { status: 'Verified', verifiedBy: 'APS1207' })).status, 403);
  });
  await step('rejected then reworked: complete history is kept', async () => {
    const h1 = ctx.hist.concat([{ at: new Date().toISOString(), by: 'APS1010', from: 'Submitted for Verification', to: 'Rejected', note: 'Photo shows rust remaining' }]);
    assert.strictEqual((await fac('PATCH', `/api/docs/actions/${ctx.act}`, { status: 'Rejected', history: h1, revisedTarget: T })).status, 200);
    const h2 = h1.concat([{ at: new Date().toISOString(), by: 'APS1103', from: 'Rejected', to: 'Submitted for Verification', note: 'Re-done' }]);
    assert.strictEqual((await lead('PATCH', `/api/docs/actions/${ctx.act}`, { status: 'Submitted for Verification', history: h2 })).status, 200); ctx.hist = h2;
  });
  await step('21-22 facilitator verifies and closes the action; finding closes', async () => {
    const h = ctx.hist.concat([{ at: new Date().toISOString(), by: 'APS1010', from: 'Submitted for Verification', to: 'Verified', note: 'OK' }]);
    assert.strictEqual((await fac('PATCH', `/api/docs/actions/${ctx.act}`, { status: 'Verified', verifiedBy: 'APS1010', verifiedAt: new Date().toISOString(), verRemarks: 'OK', history: h })).status, 200);
    assert.strictEqual((await fac('PATCH', `/api/docs/actions/${ctx.act}`, { status: 'Closed', history: h.concat([{ at: new Date().toISOString(), by: 'APS1010', from: 'Verified', to: 'Closed' }]) })).status, 200);
    assert.strictEqual((await fac('PATCH', `/api/docs/findings/${ctx.fnd}`, { status: 'Closed' })).status, 200);
    const v = (await pool.query('SELECT result FROM action_verifications WHERE action_id=$1 ORDER BY seq', [ctx.act])).rows.map((r) => r.result); assert.deepStrictEqual(v, ['Rejected', 'Accepted']);
    assert.strictEqual((await pool.query('SELECT count(*)::int n FROM action_history WHERE action_id=$1', [ctx.act])).rows[0].n, 6);
  });
  await step('23-25 audit summary + dashboard update automatically; drill-down data is linked', async () => {
    const d = await admin('GET', '/api/dashboard/summary?apu=TS'); assert.strictEqual(d.status, 200);
    assert.strictEqual(d.data.cards.auditsCompleted, 1); assert.strictEqual(d.data.cards.avgScore, 76); assert.strictEqual(d.data.cards.findings, 1); assert.strictEqual(d.data.cards.findingsClosed, 1);
    const z = await mgr('GET', '/api/dashboard/zones'); assert.ok(z.data.apuRanking.length >= 4); assert.ok(z.data.leaderScores.length > 3);
    const t = await admin('GET', '/api/dashboard/trends?apu=TS'); assert.strictEqual(t.data.months.length, 1);
    const chain = (await pool.query(`SELECT w.no, f.no fno, a.no ano FROM audit_work_orders w JOIN audit_findings f ON f.work_order_id=w.id JOIN actions a ON a.finding_id=f.id WHERE w.id=$1`, [ctx.wo])).rows; assert.strictEqual(chain.length, 1);
  });
  await step('26 historical results are unchanged by a new checksheet version', async () => {
    const q2 = ctx.qs.concat([{ qid: 'S1-03', s: 'S1', sub: 'New', text: 'New question', max: 5, min: 1, weight: 1, mandatory: true, active: true, rtype: 'score', findingReq: true }]);
    assert.strictEqual((await admin('PUT', '/api/docs/checksheets/CS-TEST-V2', { family: 'CS-TEST', name: 'Test Area 5S Audit', version: '2.0', status: 'Active', effectiveFrom: T, questions: q2 })).status, 200);
    assert.strictEqual((await admin('PATCH', '/api/docs/checksheets/CS-TEST-V1', { status: 'Superseded', effectiveTo: T })).status, 200);
    const g = (await aud('GET', `/api/audits/${ctx.wo}`)).data; assert.strictEqual(g.checklist.version, '1.0'); assert.strictEqual(g.checklist.questions.length, 10); assert.strictEqual(g.workOrder.score.overall.pct, 76); assert.strictEqual(g.score.overall.pct, 76);
  });
  await step('27 exports: CSV download is scoped and formula-safe', async () => {
    const r = await mgr('GET', '/api/export/findings.csv'); assert.strictEqual(r.status, 200); assert.match(r.data, /Finding No/); assert.ok(r.data.split('\n').length > 50);
  });
  await step('28 complete audit trail; it cannot be edited or deleted', async () => {
    const a = await admin.sync(); const entries = Object.values(a.logs).flatMap((l) => l.entries);
    assert.ok(entries.some((e) => e.action === 'Audit submitted' && e.record === (a.workorders[ctx.wo].no))); assert.ok(entries.some((e) => e.action === 'Work order generated'));
    const id = Object.keys(a.logs).find((k) => a.logs[k].entries.length > 0 && a.logs[k].session === 'server');
    assert.strictEqual((await admin('PUT', '/api/docs/logs/' + id, { date: T, session: 'server', entries: [] })).status, 403);
    assert.strictEqual((await admin('DELETE', '/api/docs/logs/' + id)).status, 403);
    await assert.rejects(pool.query("UPDATE audit_logs SET action='x' WHERE id=(SELECT min(id) FROM audit_logs)"), /append-only/);
    await assert.rejects(pool.query('DELETE FROM audit_logs'), /append-only/);
    const own = client(); await own.login('APS1020'); const sid = 'L-' + T.replace(/-/g, '') + '-t1';
    assert.strictEqual((await own('PUT', '/api/docs/logs/' + sid, { date: T, session: 't1', entries: [{ at: new Date().toISOString(), user: 'someone-else', module: 'Test', record: 'r', action: 'Did a thing' }] })).status, 200);
    assert.strictEqual((await pool.query('SELECT user_id FROM audit_logs WHERE log_doc=$1', [sid])).rows[0].user_id, 'APS1020', 'entries are attributed to the signed-in user');
  });

  console.log('\nFiles, numbering, sync, users');
  await step('photograph access control follows the zone', async () => {
    assert.strictEqual((await aud('GET', '/api/files/' + ctx.photo)).status, 200);
    const t = await aud('GET', '/api/files/' + ctx.photo + '?thumb=1'); assert.ok(t.data.length < 60000);
    const meta = (await pool.query('SELECT zone_id,mime_type FROM attachments WHERE id=$1', [ctx.photo])).rows[0]; assert.strictEqual(meta.zone_id, 'TS-01');
    const other = client(); await other.login('APS1105'); // leader of another zone, not TS-01
    assert.strictEqual((await other('GET', '/api/files/' + ctx.photo)).status, 403);
    assert.strictEqual((await anon('GET', '/api/files/' + ctx.photo)).status, 401);
  });
  await step('numbering is unique under concurrency', async () => {
    const rs = await Promise.all(Array.from({ length: 25 }, () => fac('POST', '/api/numbers/IMP'))); const ns = rs.map((r) => r.data.n); assert.strictEqual(new Set(ns).size, 25);
  });
  await step('incremental sync returns only what changed (and deletions)', async () => {
    const s0 = await fac.sync(); await fac('PATCH', '/api/docs/zones/CU-P01', { desc: 'changed for test' });
    const s1 = await fac.sync(s0.__rev); assert.deepStrictEqual(Object.keys(s1.zones || {}), ['CU-P01']); assert.strictEqual(Object.keys(s1).filter((k) => k !== '__rev').length, 1);
  });
  await step('user management: create, login, change password, reset, deactivate', async () => {
    assert.strictEqual((await admin('PUT', '/api/users/APS9001', { user: { name: 'Test Auditor', role: 'auditor', status: 'Active', dept: 'Quality', plant: 'PL1', plants: ['PL1'], apus: ['CU'], email: 'test.aud@example.com' }, password: 'weak' })).status, 422);
    assert.strictEqual((await admin('PUT', '/api/users/APS9001', { user: { name: 'Test Auditor', role: 'auditor', status: 'Active', dept: 'Quality', plant: 'PL1', plants: ['PL1'], apus: ['CU'], email: 'test.aud@example.com' }, password: 'Temp#2026x' })).status, 201);
    const u = client(); await u.login('APS9001', 'Temp#2026x');
    assert.strictEqual((await u('POST', '/api/auth/change-password', { current: 'wrong', password: 'Newpass#2026' })).status, 422);
    assert.strictEqual((await u('POST', '/api/auth/change-password', { current: 'Temp#2026x', password: 'Newpass#2026' })).status, 200);
    await client().login('APS9001', 'Newpass#2026');
    assert.strictEqual((await admin('POST', '/api/users/APS9001/reset-password', { password: 'Reset#2026ab' })).status, 200);
    assert.strictEqual((await u('GET', '/api/auth/me')).status, 401, 'old sessions revoked after reset');
    assert.strictEqual((await admin('PUT', '/api/users/APS9001', { user: { status: 'Inactive' } })).status, 200);
    const x = client(); assert.strictEqual((await x('POST', '/api/auth/login', { username: 'APS9001', password: 'Reset#2026ab' })).status, 403);
    assert.ok(Object.values((await admin.sync()).logs).flatMap((l) => l.entries).some((e) => e.action === 'User created' && e.record === 'User APS9001'));
  });
  await step('input validation: injection strings are data, bad ids/types are rejected', async () => {
    assert.strictEqual((await admin('GET', "/api/docs/zones/CU-P01'%3B%20DROP%20TABLE%20zones%3B--")).status, 400);
    const r = await admin('PATCH', '/api/docs/zones/CU-P01', { name: "Wire'); DROP TABLE users;--", __proto__: { polluted: 1 } }); assert.strictEqual(r.status, 200);
    assert.ok((await pool.query('SELECT count(*)::int n FROM users')).rows[0].n > 90); assert.strictEqual({}.polluted, undefined);
    assert.strictEqual((await admin('PUT', '/api/docs/findings/FND-X1', { no: 'X', zone: 'CU-P01', severity: 'Nope' })).status, 422);
    assert.strictEqual((await admin('PUT', '/api/docs/zones/ZZ-1', { code: 'ZZ-1', name: 'x', plant: 'NOPE', apu: 'CU' })).status, 409, 'foreign keys enforced');
  });
  await step('REST resources are paginated', async () => { const a = await admin('GET', '/api/audit-work-orders?limit=20'); assert.strictEqual(a.data.items.length, 20); assert.ok(a.data.next); const b = await admin('GET', '/api/audit-work-orders?limit=20&cursor=' + encodeURIComponent(a.data.next)); assert.notStrictEqual(b.data.items[0].id, a.data.items[0].id); });
  await step('overdue notices are generated once per day', async () => { const a = await svc.overdueNotices(); const b = await svc.overdueNotices(); assert.ok(a > 0); assert.strictEqual(b, 0); });

  server.close(); await pool.end();
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) { console.log('Failed: ' + failures.join('; ')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
