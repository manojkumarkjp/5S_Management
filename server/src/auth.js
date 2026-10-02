'use strict';
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const cfg = require('./config');
const { pool } = require('./db');
const { HttpError } = require('./policy');

const COOKIE = 'fives_token';
const hash = (pw) => bcrypt.hash(pw, 10);
const checkPassword = (pw) => {
  if (typeof pw !== 'string' || pw.length < 8) throw new HttpError(422, 'Password must be at least 8 characters.');
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) throw new HttpError(422, 'Password must contain letters and numbers.');
  if (pw.length > 128) throw new HttpError(422, 'Password is too long.');
};

function parseCookies(req) {
  const o = {}; (req.headers.cookie || '').split(';').forEach((p) => { const i = p.indexOf('='); if (i > 0) o[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return o;
}

async function issue(res, user, req) {
  const jti = crypto.randomUUID(); const exp = new Date(Date.now() + cfg.jwtTtlHours * 3600 * 1000);
  await pool.query('INSERT INTO auth_sessions(jti,user_id,expires_at,ip,user_agent) VALUES ($1,$2,$3,$4,$5)', [jti, user.id, exp, req.ip, String(req.headers['user-agent'] || '').slice(0, 250)]);
  const token = jwt.sign({ sub: user.id, role: user.role, jti }, cfg.jwtSecret, { expiresIn: cfg.jwtTtlHours + 'h', algorithm: 'HS256' });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'strict', secure: cfg.cookieSecure, maxAge: cfg.jwtTtlHours * 3600 * 1000, path: '/' });
  return token;
}

/* middleware: Bearer token or httpOnly cookie. Cookie-authenticated writes must carry X-Requested-With (CSRF). */
async function authenticate(req, res, next) {
  try {
    const bearer = (req.headers.authorization || '').match(/^Bearer (.+)$/i);
    const cookie = parseCookies(req)[COOKIE];
    const token = bearer ? bearer[1] : cookie;
    if (!token) throw new HttpError(401, 'Sign in required.');
    if (!bearer && !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers['x-requested-with'] !== 'fives') throw new HttpError(403, 'Missing CSRF header.', 'csrf');
    let p; try { p = jwt.verify(token, cfg.jwtSecret, { algorithms: ['HS256'] }); } catch (e) { throw new HttpError(401, 'Your session has expired. Please sign in again.'); }
    const r = await pool.query('SELECT u.id,u.name,u.role,u.status,u.data,s.revoked FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.jti=$1 AND s.expires_at>now()', [p.jti]);
    const row = r.rows[0];
    if (!row || row.revoked) throw new HttpError(401, 'Your session is no longer valid.');
    if (row.status !== 'Active') throw new HttpError(403, 'This account is inactive.');
    req.user = { id: row.id, name: row.name, role: row.role, jti: p.jti, data: row.data };
    next();
  } catch (e) { next(e); }
}

const requireRole = (...roles) => (req, res, next) => (roles.includes(req.user.role) ? next() : next(new HttpError(403, 'You do not have permission for this operation.')));

async function login(idOrEmail, password, req, res) {
  const key = String(idOrEmail || '').trim().toLowerCase();
  if (!key || !password) throw new HttpError(400, 'Employee ID and password are required.');
  const r = await pool.query('SELECT * FROM users WHERE lower(id)=$1 OR lower(email)=$1', [key]);
  const u = r.rows[0]; const bad = new HttpError(401, 'Employee ID or password is not correct.');
  if (!u || !u.pwd_hash) { await bcrypt.compare(String(password), '$2a$10$abcdefghijklmnopqrstuuT0q7mPcZpH4dZyP0Vh8mBlHqkpnWd5i'); throw bad; }
  if (u.locked_until && new Date(u.locked_until) > new Date()) throw new HttpError(423, 'Too many failed attempts. Try again in a few minutes.', 'locked');
  const ok = await bcrypt.compare(String(password), u.pwd_hash);
  if (!ok) {
    const n = u.failed_attempts + 1; const lock = n >= cfg.lockoutAttempts;
    await pool.query('UPDATE users SET failed_attempts=$2, locked_until=$3 WHERE id=$1', [u.id, lock ? 0 : n, lock ? new Date(Date.now() + cfg.lockoutMinutes * 60000) : null]);
    throw bad;
  }
  if (u.status !== 'Active') throw new HttpError(403, 'This account is inactive. Contact the System Administrator.');
  await pool.query('UPDATE users SET failed_attempts=0, locked_until=NULL, last_login=now() WHERE id=$1', [u.id]);
  await issue(res, u, req);
  return u;
}

async function logout(req, res) {
  if (req.user) await pool.query('UPDATE auth_sessions SET revoked=true WHERE jti=$1', [req.user.jti]);
  res.clearCookie(COOKIE, { path: '/' });
}

module.exports = { authenticate, requireRole, login, logout, hash, checkPassword, COOKIE };
