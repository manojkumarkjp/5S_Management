'use strict';
// Loads the demo dataset (20+ zones, 90+ users, schedules, audits, findings, actions...).
// Usage: npm run seed                 -> dataset relative to today
//        node scripts/seed.js --today=2026-10-01 --reset
const path = require('path');
const bcrypt = require('bcryptjs');
const { pool, tx } = require('../src/db');
const repo = require('../src/repo');
const cfg = require('../src/config');
const { toDocs } = require('../db/seed/to-docs');

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
  } else if ((await pool.query('SELECT count(*)::int n FROM users')).rows[0].n > 0) { console.log('Database already has users. Use --reset to reload the demo data.'); await pool.end(); return; }

  const docs = toDocs(today);
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
  console.log(`Seed complete for ${today} in ${((Date.now() - t0) / 1000).toFixed(1)}s. Demo password for all users: ${cfg.seedPassword}`);
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
