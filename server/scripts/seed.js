'use strict';
// Loads the demo dataset (20+ zones, 90+ users, schedules, audits, findings, actions...).
// Usage: npm run seed                 -> dataset relative to today
//        node scripts/seed.js --today=2026-10-01 --reset
//        node scripts/seed.js --empty --reset [--admin-id=ADMIN] [--admin-name="..."] [--admin-email=...]
//          -> clean start: settings, lists and released checksheets only, plus one administrator
const path = require('path');
const bcrypt = require('bcryptjs');
const { pool, tx } = require('../src/db');
const repo = require('../src/repo');
const cfg = require('../src/config');
const { toDocs } = require('../db/seed/to-docs');

// Clean start: keeps configuration (settings, lists, active checksheets) and drops the demo organisation and history.
function emptyDocs(docs, today, admin) {
  const ms = Object.assign({}, docs.cfg.masters, { plants: [], apus: [], departments: [], sections: [] });
  const sheets = {};
  Object.entries(docs.checksheets).filter(([, c]) => c.status === 'Active').forEach(([id, c]) => { sheets[id] = JSON.parse(JSON.stringify(c).replace(/APS1001/g, admin.id)); });
  const user = { name: admin.name, designation: 'System Administrator', role: 'admin', status: 'Active', email: admin.email, mobile: '', dept: '', section: '', plant: '', plants: [], apus: [], manager: '', joinDate: today };
  return { cfg: { settings: docs.cfg.settings, masters: ms }, users: { [admin.id]: user }, zones: {}, checksheets: sheets, schedules: {}, workorders: {}, findings: {}, actions: {}, improvements: {}, notifications: {}, logs: {} };
}

const arg = (k) => { const a = process.argv.find((x) => x.startsWith('--' + k)); return a ? (a.includes('=') ? a.split('=')[1] : true) : null; };
(async () => {
  const today = arg('today') || new Date().toISOString().slice(0, 10);
  if (arg('reset')) {
    await pool.query(`TRUNCATE tombstones, audit_calendar, audit_scores, audit_responses, action_verifications, action_history, actions, audit_findings, audit_work_orders, audit_schedules,
      checklist_questions, checklist_sections, audit_checklists, zone_members, zones, user_divisions, user_plants, user_roles, auth_sessions, users, sections, departments, divisions, areas, plants,
      improvements, notifications, attachments, audit_log_docs, counters, app_settings, s_categories, scoring_rules, notification_rules, permissions RESTART IDENTITY CASCADE`).catch(async (e) => {
      // audit_logs is append-only (TRUNCATE is blocked on purpose); a reset therefore needs the guard removed for the demo database only
      if (!/append-only/.test(e.message)) throw e;
      await pool.query('ALTER TABLE audit_logs DISABLE TRIGGER USER');
      await pool.query(`TRUNCATE audit_logs, tombstones, audit_calendar, audit_scores, audit_responses, action_verifications, action_history, actions, audit_findings, audit_work_orders, audit_schedules,
        checklist_questions, checklist_sections, audit_checklists, zone_members, zones, user_divisions, user_plants, user_roles, auth_sessions, users, sections, departments, divisions, areas, plants,
        improvements, notifications, attachments, audit_log_docs, counters, app_settings, s_categories, scoring_rules, notification_rules, permissions RESTART IDENTITY CASCADE`);
      await pool.query('ALTER TABLE audit_logs ENABLE TRIGGER USER');
    });
  } else if ((await pool.query('SELECT count(*)::int n FROM users')).rows[0].n > 0) { console.log('Database already has users. Use --reset to reload (add --empty for a clean start without demo data).'); await pool.end(); return; }

  const empty = !!arg('empty');
  const admin = { id: String(arg('admin-id') || 'ADMIN'), name: String(arg('admin-name') || 'System Administrator'), email: String(arg('admin-email') || 'admin@example.com') };
  if (empty && !/^[A-Za-z0-9_-]{3,20}$/.test(admin.id)) { console.error('--admin-id must be 3-20 letters, digits, - or _'); process.exit(1); }
  const docs = empty ? emptyDocs(toDocs(today), today, admin) : toDocs(today);
  const hash = await bcrypt.hash(cfg.seedPassword, 10);
  const t0 = Date.now();
  await tx(async (c) => {
    await c.query('SET CONSTRAINTS ALL DEFERRED');
    const order = ['cfg', 'users', 'zones', 'checksheets', 'schedules', 'workorders', 'findings', 'actions', 'improvements', 'notifications', 'logs'];
    for (const coll of order) {
      let n = 0;
      for (const [id, doc] of Object.entries(docs[coll])) {
        if (coll === 'cfg' && id === 'counters') continue;
        await repo.upsertDoc(c, coll, id, doc, { user: { id: 'seed' }, ip: 'seed' }); n++;
      }
      console.log(`  ${coll}: ${n}`);
    }
    await c.query('UPDATE users SET pwd_hash=$1, pwd_changed_at=now()', [hash]);
    const cnt = docs.cfg.counters || {};
    for (const [k, v] of Object.entries(cnt)) await c.query('INSERT INTO counters(kind,n) VALUES ($1,$2) ON CONFLICT (kind) DO UPDATE SET n=GREATEST(counters.n, EXCLUDED.n)', [k, v]);
    const sch = Math.max(0, ...Object.keys(docs.schedules).map((x) => Number(x.replace(/\D/g, '')) || 0));
    await c.query("INSERT INTO counters(kind,n) VALUES ('SCH',$1) ON CONFLICT (kind) DO UPDATE SET n=GREATEST(counters.n, EXCLUDED.n)", [sch]);
  });
  console.log(empty ? `Clean start complete. Sign in as ${admin.id} with the SEED_PASSWORD value, then change the password.` : `Seed complete for ${today} in ${((Date.now() - t0) / 1000).toFixed(1)}s. Demo password for all users: ${cfg.seedPassword}`);
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
