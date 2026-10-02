'use strict';
/* Dashboard / KPI endpoints (spec section 39 + 43). All queries are scoped to the user's zones. */
const express = require('express');
const { pool } = require('./db');
const repo = require('./repo');
const FS = require('./shared');
const { HttpError } = require('./policy');

const DONE = "('Submitted','Under Review','Approved','Closed')";

function range(q) {
  const today = new Date().toISOString().slice(0, 10);
  if (q.from || q.to) return [q.from || '0001-01-01', q.to || '9999-12-31'];
  if (q.month) { if (!/^\d{4}-\d{2}$/.test(q.month)) throw new HttpError(400, 'month must be YYYY-MM'); const s = q.month + '-01'; return [s, FS.addDays(FS.addMonths(s, 1), -1)]; }
  if (q.year) { const fy = Number(q.fyStart || 4); const s = `${Number(q.year)}-${FS.pad(fy)}-01`; return [s, FS.addDays(FS.addMonths(s, 12), -1)]; }
  if (q.quarter) { const m = /^(\d{4})-Q([1-4])$/.exec(q.quarter); if (!m) throw new HttpError(400, 'quarter must be YYYY-Qn'); const s = FS.addMonths(`${m[1]}-04-01`, (Number(m[2]) - 1) * 3); return [s, FS.addDays(FS.addMonths(s, 3), -1)]; }
  return ['0001-01-01', '9999-12-31'];
}

function filters(req, alias = 'w') {
  const q = req.query; const p = []; const w = [];
  const add = (cond, v) => { p.push(v); w.push(cond.replace('?', '$' + p.length)); };
  add(`${alias}.zone_id = ANY(?)`, req.zoneIds);
  if (q.apu) add(`${alias}.division_id = ?`, q.apu);
  if (q.plant) add(`${alias}.plant_id = ?`, q.plant);
  if (q.zone) add(`${alias}.zone_id = ?`, q.zone);
  return { w, p, add };
}

const router = express.Router();
router.use(async (req, res, next) => { try { req.zoneIds = await repo.zoneIdsFor(req.user); next(); } catch (e) { next(e); } });

router.get('/summary', async (req, res, next) => {
  try {
    const [from, to] = range(req.query); const f = filters(req, 'w'); const { w, p } = f;
    if (req.query.dept) { p.push(req.query.dept); w.push(`w.department = $${p.length}`); }
    if (req.query.auditType) { p.push(req.query.auditType); w.push(`w.audit_type = $${p.length}`); }
    const base = w.join(' AND '); const pf = p.length + 1; const pt = p.length + 2; const pr = [...p, from, to];
    const woQ = await pool.query(`SELECT
        count(*) FILTER (WHERE status <> 'Cancelled')::int AS planned,
        count(*) FILTER (WHERE status IN ${DONE})::int AS completed,
        round(avg(overall_pct) FILTER (WHERE status IN ${DONE} AND overall_pct IS NOT NULL)::numeric,1) AS avg_score
      FROM audit_work_orders w WHERE ${base} AND w.planned_date BETWEEN $${pf} AND $${pt}`, pr);
    const wo = woQ.rows[0];
    const zq = await pool.query('SELECT count(*)::int n FROM zones z WHERE z.id = ANY($1) AND z.status=\'Active\'' + (req.query.apu ? ' AND z.division_id=$2' : ''), req.query.apu ? [req.zoneIds, req.query.apu] : [req.zoneIds]);
    const fp = [req.zoneIds, from, to]; let fw = 'f.zone_id = ANY($1) AND f.audit_date BETWEEN $2 AND $3';
    if (req.query.apu) { fp.push(req.query.apu); fw += ` AND f.division_id=$${fp.length}`; }
    const fq = await pool.query(`SELECT count(*)::int total,
        count(*) FILTER (WHERE f.status='Closed')::int closed,
        count(*) FILTER (WHERE f.status<>'Closed')::int open,
        count(*) FILTER (WHERE f.severity='Critical')::int critical,
        count(*) FILTER (WHERE f.severity='Major')::int major,
        count(*) FILTER (WHERE f.severity='Minor')::int minor,
        count(*) FILTER (WHERE f.severity='Observation')::int observation,
        count(*) FILTER (WHERE f.severity='Improvement Opportunity')::int improvement,
        count(*) FILTER (WHERE EXISTS (SELECT 1 FROM audit_findings o WHERE o.zone_id=f.zone_id AND o.qid=f.qid AND o.audit_date < f.audit_date))::int repeats
      FROM audit_findings f WHERE ${fw}`, fp);
    const ap = [req.zoneIds]; let aw = 'a.zone_id = ANY($1)'; if (req.query.apu) { ap.push(req.query.apu); aw += ` AND a.division_id=$${ap.length}`; }
    const aq = await pool.query(`SELECT count(*)::int total,
        count(*) FILTER (WHERE a.status IN ('Verified','Closed'))::int closed,
        count(*) FILTER (WHERE a.status NOT IN ('Verified','Closed'))::int open,
        count(*) FILTER (WHERE a.status NOT IN ('Verified','Closed') AND a.target_date < current_date)::int overdue
      FROM actions a WHERE ${aw}`, ap);
    const sq = await pool.query(`SELECT s.s_key, round(avg(s.pct)::numeric,1) pct FROM audit_scores s JOIN audit_work_orders w ON w.id=s.work_order_id
        WHERE ${base} AND w.status IN ${DONE} AND w.planned_date BETWEEN $${pf} AND $${pt} AND s.s_key <> 'overall' GROUP BY s.s_key ORDER BY s.s_key`, pr);
    const rank = await pool.query(`SELECT w.zone_id, z.code, z.name, round(avg(w.overall_pct)::numeric,1) score FROM audit_work_orders w JOIN zones z ON z.id=w.zone_id
        WHERE ${base} AND w.status IN ${DONE} AND w.overall_pct IS NOT NULL AND w.planned_date BETWEEN $${pf} AND $${pt} GROUP BY 1,2,3 ORDER BY score DESC`, pr);
    const F = fq.rows[0]; const A = aq.rows[0];
    res.json({
      period: { from, to },
      cards: {
        totalZones: zq.rows[0].n, auditsPlanned: wo.planned, auditsCompleted: wo.completed,
        completionPct: wo.planned ? Math.round((wo.completed / wo.planned) * 1000) / 10 : null,
        avgScore: wo.avg_score === null ? null : Number(wo.avg_score),
        findings: F.total, findingsOpen: F.open, findingsClosed: F.closed, criticalFindings: F.critical,
        openActions: A.open, overdueActions: A.overdue,
        actionClosurePct: A.total ? Math.round((A.closed / A.total) * 1000) / 10 : null,
        overduePct: A.open ? Math.round((A.overdue / A.open) * 1000) / 10 : null,
        findingRate: wo.completed ? Math.round((F.total / wo.completed) * 100) / 100 : null,
        repeatFindingRate: F.total ? Math.round((F.repeats / F.total) * 1000) / 10 : null,
        bestZone: rank.rows[0] ? { zone: rank.rows[0].code, name: rank.rows[0].name, score: Number(rank.rows[0].score) } : null,
        lowestZone: rank.rows.length ? { zone: rank.rows[rank.rows.length - 1].code, name: rank.rows[rank.rows.length - 1].name, score: Number(rank.rows[rank.rows.length - 1].score) } : null,
      },
      severity: { Critical: F.critical, Major: F.major, Minor: F.minor, Observation: F.observation, 'Improvement Opportunity': F.improvement },
      sPerformance: Object.fromEntries(sq.rows.map((r) => [r.s_key, Number(r.pct)])),
    });
  } catch (e) { next(e); }
});

router.get('/trends', async (req, res, next) => {
  try {
    const [from, to] = range(Object.assign({}, req.query)); const f = filters(req, 'w'); const { w, p } = f;
    p.push(from, to);
    const r = await pool.query(`SELECT to_char(w.planned_date,'YYYY-MM') AS month, round(avg(w.overall_pct)::numeric,1) AS overall, count(*)::int AS audits,
        round(avg(s1.pct)::numeric,1) s1, round(avg(s2.pct)::numeric,1) s2, round(avg(s3.pct)::numeric,1) s3, round(avg(s4.pct)::numeric,1) s4, round(avg(s5.pct)::numeric,1) s5
      FROM audit_work_orders w
      LEFT JOIN audit_scores s1 ON s1.work_order_id=w.id AND s1.s_key='S1' LEFT JOIN audit_scores s2 ON s2.work_order_id=w.id AND s2.s_key='S2'
      LEFT JOIN audit_scores s3 ON s3.work_order_id=w.id AND s3.s_key='S3' LEFT JOIN audit_scores s4 ON s4.work_order_id=w.id AND s4.s_key='S4'
      LEFT JOIN audit_scores s5 ON s5.work_order_id=w.id AND s5.s_key='S5'
      WHERE ${w.join(' AND ')} AND w.status IN ${DONE} AND w.overall_pct IS NOT NULL AND w.planned_date BETWEEN $${p.length - 1} AND $${p.length}
      GROUP BY 1 ORDER BY 1`, p);
    res.json({ months: r.rows.map((x) => ({ month: x.month, overall: Number(x.overall), audits: x.audits, S1: Number(x.s1), S2: Number(x.s2), S3: Number(x.s3), S4: Number(x.s4), S5: Number(x.s5) })) });
  } catch (e) { next(e); }
});

router.get('/zones', async (req, res, next) => {
  try {
    const [from, to] = range(req.query); const f = filters(req, 'w'); const { w, p } = f; p.push(from, to);
    const r = await pool.query(`WITH s AS (
        SELECT w.zone_id, round(avg(w.overall_pct)::numeric,1) score, count(*)::int audits, max(w.planned_date) last_audit
          FROM audit_work_orders w WHERE ${w.join(' AND ')} AND w.status IN ${DONE} AND w.overall_pct IS NOT NULL AND w.planned_date BETWEEN $${p.length - 1} AND $${p.length} GROUP BY 1),
      f AS (SELECT zone_id, count(*)::int findings FROM audit_findings WHERE zone_id = ANY($1) AND audit_date BETWEEN $${p.length - 1} AND $${p.length} GROUP BY 1),
      a AS (SELECT zone_id, count(*) FILTER (WHERE status NOT IN ('Verified','Closed'))::int open_actions,
                   count(*) FILTER (WHERE status NOT IN ('Verified','Closed') AND target_date < current_date)::int overdue FROM actions WHERE zone_id = ANY($1) GROUP BY 1)
      SELECT z.id, z.code, z.name, z.division_id apu, d.name apu_name, z.leader_id, u.name leader, s.score, s.audits, s.last_audit,
             coalesce(f.findings,0) findings, coalesce(a.open_actions,0) open_actions, coalesce(a.overdue,0) overdue_actions
        FROM zones z JOIN divisions d ON d.id=z.division_id LEFT JOIN users u ON u.id=z.leader_id LEFT JOIN s ON s.zone_id=z.id LEFT JOIN f ON f.zone_id=z.id LEFT JOIN a ON a.zone_id=z.id
       WHERE z.id = ANY($1) AND z.status='Active' ORDER BY s.score DESC NULLS LAST, z.code`, p);
    const zones = r.rows.map((x, i) => ({ rank: x.score === null ? null : i + 1, zone: x.code, id: x.id, name: x.name, apu: x.apu, apuName: x.apu_name, leader: x.leader, score: x.score === null ? null : Number(x.score), audits: x.audits || 0, lastAudit: x.last_audit, findings: x.findings, openActions: x.open_actions, overdueActions: x.overdue_actions }));
    const apu = {}; zones.filter((z) => z.score !== null).forEach((z) => { (apu[z.apuName] = apu[z.apuName] || []).push(z.score); });
    const leaders = {}; r.rows.filter((x) => x.score !== null && x.leader).forEach((x) => { (leaders[x.leader] = leaders[x.leader] || []).push(Number(x.score)); });
    const avg = (a) => Math.round((a.reduce((s, v) => s + v, 0) / a.length) * 10) / 10;
    res.json({
      zones,
      apuRanking: Object.entries(apu).map(([name, v]) => ({ apu: name, score: avg(v) })).sort((a, b) => b.score - a.score),
      leaderScores: Object.entries(leaders).map(([name, v]) => ({ leader: name, score: avg(v) })).sort((a, b) => b.score - a.score),
      findingsByZone: zones.filter((z) => z.findings).map((z) => ({ zone: z.zone, findings: z.findings })).sort((a, b) => b.findings - a.findings),
    });
  } catch (e) { next(e); }
});

module.exports = router;
