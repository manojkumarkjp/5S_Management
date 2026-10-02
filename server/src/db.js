'use strict';
const { Pool } = require('pg');
const cfg = require('./config');
const pool = new Pool({ connectionString: cfg.databaseUrl, ssl: cfg.pgSsl ? { rejectUnauthorized: false } : false, max: Number(process.env.PG_POOL_MAX || 12) });
pool.on('error', (e) => console.error('pg pool error', e.message));
async function tx(fn) {
  const c = await pool.connect();
  try { await c.query('BEGIN'); const r = await fn(c); await c.query('COMMIT'); return r; }
  catch (e) { try { await c.query('ROLLBACK'); } catch (_) {} throw e; }
  finally { c.release(); }
}
module.exports = { pool, tx, query: (t, p) => pool.query(t, p) };
