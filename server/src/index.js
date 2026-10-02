'use strict';
const cfg = require('./config');
const app = require('./app');
const svc = require('./services');
const { pool } = require('./db');

const server = app.listen(cfg.port, () => console.log(`5S server listening on :${cfg.port} (${cfg.env})`));

let timer = null;
async function tick() {
  try { const n = await svc.generateDueWorkOrders(); const o = await svc.overdueNotices(); if (n || o) console.log(`scheduler: ${n} work order(s) generated, ${o} overdue notice(s)`); }
  catch (e) { console.error('scheduler error', e.message); }
}
if (cfg.schedulerEnabled) { setTimeout(tick, 5000); timer = setInterval(tick, cfg.schedulerIntervalMin * 60 * 1000); }

async function shutdown() { clearInterval(timer); server.close(async () => { await pool.end().catch(() => {}); process.exit(0); }); setTimeout(() => process.exit(1), 10000).unref(); }
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
