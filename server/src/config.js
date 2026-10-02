'use strict';
// Environment configuration (Development / Testing / Production)
const env = process.env.NODE_ENV || 'development';
const bool = (v, d) => (v === undefined ? d : /^(1|true|yes|on)$/i.test(String(v)));
const cfg = {
  env,
  isProd: env === 'production',
  port: Number(process.env.PORT || 3000),
  databaseUrl: process.env.DATABASE_URL || 'postgres://fives:fives@localhost:5432/fives',
  pgSsl: bool(process.env.PGSSL, false),
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-change-me',
  jwtTtlHours: Number(process.env.JWT_TTL_HOURS || 12),
  cookieSecure: bool(process.env.COOKIE_SECURE, env === 'production'),
  trustProxy: bool(process.env.TRUST_PROXY, false),
  uploadDir: process.env.UPLOAD_DIR || require('path').join(__dirname, '..', 'uploads'),
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 12),
  schedulerEnabled: bool(process.env.SCHEDULER_ENABLED, true),
  schedulerIntervalMin: Number(process.env.SCHEDULER_INTERVAL_MIN || 30),
  lockoutAttempts: Number(process.env.LOGIN_MAX_ATTEMPTS || 5),
  lockoutMinutes: Number(process.env.LOGIN_LOCK_MINUTES || 15),
  corsOrigin: process.env.CORS_ORIGIN || '',          // empty = same origin only
  seedPassword: process.env.SEED_PASSWORD || 'Demo@123',
};
if (cfg.isProd && cfg.jwtSecret === 'dev-only-secret-change-me') { console.error('FATAL: set JWT_SECRET in production'); process.exit(1); }
module.exports = cfg;
