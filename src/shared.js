/* 5S Management System — shared domain logic (browser + Node).
   Pure functions only: scoring, bands, numbering, dates, statuses. */
(function (root) {
  const S_KEYS = ['S1', 'S2', 'S3', 'S4', 'S5'];

  /* ---------- dates (ISO yyyy-mm-dd strings, local-agnostic) ---------- */
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const toISO = (d) => d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  const parseISO = (s) => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const addDays = (s, n) => { const d = parseISO(s); d.setUTCDate(d.getUTCDate() + n); return toISO(d); };
  const diffDays = (a, b) => Math.round((parseISO(a) - parseISO(b)) / 86400000); // a - b
  const monthKey = (s) => String(s).slice(0, 7);
  const addMonths = (s, n) => { const d = parseISO(s); const day = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n); const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); d.setUTCDate(Math.min(day, last)); return toISO(d); };
  const weekday = (s) => parseISO(s).getUTCDay();
  const quarterOf = (s, fyStart = 4) => { const m = parseISO(s).getUTCMonth() + 1; return Math.floor(((m - fyStart + 12) % 12) / 3) + 1; };
  const fiscalYear = (s, fyStart = 4) => { const d = parseISO(s); const y = d.getUTCFullYear(); return (d.getUTCMonth() + 1) >= fyStart ? y : y - 1; };

  /* ---------- scoring ---------- */
  const BINARY = { yesno: ['Yes', 'No'], compliance: ['Compliant', 'Non-Compliant'], passfail: ['Pass', 'Fail'] };

  function responseValue(q, v) {
    if (v === null || v === undefined || v === '') return null;
    if (v === 'NA') return 'NA';
    const t = q.rtype || 'score';
    if (t === 'score') return Number(v);
    const opts = BINARY[t];
    if (!opts) return Number(v);
    return v === opts[0] ? Number(q.max ?? 5) : Number(q.min ?? 0);
  }

  function scoreAudit(questions, responses, settings) {
    const out = {}; let answered = 0, total = 0, mandatoryMissing = 0;
    S_KEYS.forEach((s) => (out[s] = { got: 0, max: 0, pct: null, answered: 0, count: 0 }));
    (questions || []).filter((q) => q.active !== false).forEach((q) => {
      const r = (responses || {})[q.qid];
      const cell = out[q.s]; if (!cell) return;
      cell.count++; total++;
      const val = r ? responseValue(q, r.v) : null;
      if (val === null) { if (q.mandatory) mandatoryMissing++; return; }
      cell.answered++; answered++;
      if (val === 'NA') return; // N/A never enters the denominator
      const w = Number(q.weight || 1);
      cell.got += val * w; cell.max += Number(q.max ?? 5) * w;
    });
    let sumPct = 0, nPct = 0, gotAll = 0, maxAll = 0, wSum = 0, wPct = 0;
    const sW = (settings && settings.sWeights) || {};
    S_KEYS.forEach((s) => {
      const c = out[s];
      if (c.max > 0) {
        c.pct = Math.round((c.got / c.max) * 1000) / 10;
        sumPct += c.pct; nPct++; gotAll += c.got; maxAll += c.max;
        const w = Number(sW[s] || 1); wSum += w; wPct += c.pct * w;
      }
    });
    let pct = null;
    if (nPct) pct = settings && settings.scoringMethod === 'weighted' ? wPct / wSum : sumPct / nPct;
    if (pct !== null) pct = Math.round(pct * 10) / 10;
    out.overall = { got: Math.round(gotAll * 10) / 10, max: maxAll, pct };
    out.progress = { answered, total, mandatoryMissing };
    return out;
  }

  function band(pct, bands) {
    if (pct === null || pct === undefined || isNaN(pct)) return null;
    const list = [...(bands || [])].sort((a, b) => b.min - a.min);
    return list.find((b) => pct >= b.min) || list[list.length - 1] || null;
  }

  /* ---------- numbering ---------- */
  function formatNo(pattern, kind, year, n) {
    return String(pattern || '5S-{T}-{YYYY}-{N6}')
      .replace('{T}', kind).replace('{YYYY}', year).replace('{YY}', String(year).slice(2))
      .replace(/\{N(\d)\}/, (_, w) => pad(n, Number(w))).replace('{######}', pad(n, 6));
  }

  /* ---------- derived statuses ---------- */
  const WO_DONE = ['Submitted', 'Under Review', 'Approved', 'Closed'];
  const WO_OPEN = ['Draft', 'Assigned', 'Accepted', 'In Progress'];
  function woDisplayStatus(wo, today) {
    if (WO_OPEN.includes(wo.status) && wo.dueDate && wo.dueDate < today) return 'Overdue';
    if ((wo.status === 'Assigned' || wo.status === 'Accepted') && wo.plannedDate <= today) return wo.status === 'Accepted' ? 'Accepted' : 'Due';
    return wo.status;
  }
  const ACT_CLOSED = ['Verified', 'Closed'];
  const ACT_OPEN = ['Open', 'In Progress', 'Completed', 'Submitted for Verification', 'Rejected'];
  function actionDisplayStatus(a, today) {
    const target = a.revisedTarget || a.target;
    if (['Open', 'In Progress', 'Rejected'].includes(a.status) && target && target < today) return 'Overdue';
    return a.status;
  }
  function findingStatus(f, actions) {
    const acts = actions.filter((a) => a.findingId === f.id);
    if (f.status === 'Closed') return 'Closed';
    if (!acts.length) return 'Open';
    if (acts.every((a) => ACT_CLOSED.includes(a.status))) return 'Closed';
    return 'In Progress';
  }

  /* ---------- schedule occurrences ---------- */
  function occurrences(sch, from, to) {
    const out = []; if (!sch || !sch.startDate) return out;
    const end = sch.endDate && sch.endDate < to ? sch.endDate : to;
    let d = sch.startDate, guard = 0;
    while (d <= end && guard++ < 1000) {
      if (d >= from) out.push(d);
      if (sch.frequency === 'Weekly') d = addDays(d, 7);
      else if (sch.frequency === 'Fortnightly') d = addDays(d, 14);
      else if (sch.frequency === 'Monthly') d = addMonths(sch.startDate, guard);
      else if (sch.frequency === 'Quarterly') d = addMonths(sch.startDate, guard * 3);
      else d = addDays(d, Math.max(1, Number(sch.interval || 7)));
    }
    return out;
  }

  /* ---------- text similarity for repeat findings ---------- */
  const STOP = new Set('the a an of and or in on at to for is are not no with from by be was were this that'.split(' '));
  const tokens = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
  function similarity(a, b) {
    const A = new Set(tokens(a)), B = new Set(tokens(b)); if (!A.size || !B.size) return 0;
    let i = 0; A.forEach((w) => B.has(w) && i++); return i / (A.size + B.size - i);
  }

  const api = { S_KEYS, pad, toISO, parseISO, addDays, diffDays, monthKey, addMonths, weekday, quarterOf, fiscalYear,
    BINARY, responseValue, scoreAudit, band, formatNo, WO_DONE, WO_OPEN, woDisplayStatus, ACT_CLOSED, ACT_OPEN,
    actionDisplayStatus, findingStatus, occurrences, tokens, similarity };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FS = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
