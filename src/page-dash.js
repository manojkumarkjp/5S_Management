/* ===== Login, Dashboard, Analytics ===== */
Pages.login = {
  render() {
    const st = Domain.settings(); const ready = Store.all('users').length > 0 || (Store.adapter && Store.adapter.kind === 'api');
    const sCols = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)'];
    const demo = [['APS1001', 'System Administrator', 'Full access'], ['APS1010', '5S Facilitator', 'Copper APU'], ['APS1020', 'Auditor', 'Executes audits'], ['APS1103', 'Zone Leader', 'CU-P03 Annealing'], ['APS1207', 'Zone Member', 'CU-P03 team'], ['APS1002', 'Management', 'Read-only view']];
    const status = Store.mode === 'none' ? `<div class="banner warn">${icon('wifioff')}<span>The shared 5S data could not be reached from this view. Open the page inside Claude while signed in, or reconnect to the network.</span></div>` : !ready ? `<div class="banner info">${icon('refresh')}<span>Loading the shared 5S data…</span></div>` : '';
    return `<div class="login"><section class="login-art"><div class="row" style="gap:14px"><div class="brand-mark" style="width:46px;height:46px;font-size:20px">5S</div><div><div class="brand-name" style="font-size:18px">${esc(st.appTitle || '5S Management System')}</div><div class="brand-sub">Workplace organisation, audited and tracked</div></div></div>
      <div class="stack loose"><h1>${esc(st.appTitle || '5S Management System')}</h1>
      <div class="flow">${['Organization', 'Zones', 'Audit Planning', 'Work Order', 'Execution', 'Scoring', 'Findings', 'Corrective Actions', 'Verification', 'Closure', 'Dashboard'].map((x) => `<span>${x}</span>`).join('')}</div>
      <div class="five">${FS.S_KEYS.map((s, i) => `<div style="border-color:${sCols[i]}"><b>${s}</b><span>${esc(((st.sNames || {})[s] || {}).name || s)}</span></div>`).join('')}</div></div>
      <div class="tape" style="max-width:240px;border-radius:2px"></div></section>
      <section class="login-form"><form id="loginForm" autocomplete="on"><div><h2>Sign in</h2><div class="muted small">Use your Employee ID or username.</div></div>${status}
      <div class="field"><label for="login-id">Employee ID / Username</label><input id="login-id" name="username" autocomplete="username" value="${esc(LS.get('lastId', ''))}" required></div>
      <div class="field"><label for="login-pw">Password</label><input id="login-pw" name="password" type="password" autocomplete="current-password" required></div>
      <div class="row between"><label class="check"><input type="checkbox" id="login-rem" ${LS.get('remember', true) ? 'checked' : ''}> Remember me</label><a href="#" data-act="forgot" class="small">Forgot password?</a></div>
      <div id="login-err" class="small" style="color:var(--bad)"></div>
      <button class="btn primary lg block" type="submit" ${ready ? '' : 'disabled'}>Sign in</button>
      ${ready && Store.adapter && Store.adapter.kind === 'db' ? `<div class="divider"></div><div class="eyebrow">Demo accounts · password Demo@123</div><div class="demo-roles">${demo.map(([id, r, s]) => `<button type="button" data-act="demo-login" data-id="${id}"><b>${r}</b><span>${esc(Domain.uname(id))} · ${s}</span></button>`).join('')}</div>` : ''}
      </form></section></div>`;
  },
  mount(root) {
    const f = $('#loginForm', root); if (!f) return;
    f.addEventListener('submit', async (e) => { e.preventDefault(); await Auth.login($('#login-id').value.trim(), $('#login-pw').value, $('#login-rem').checked); });
  },
};
const Auth = {
  async login(id, pw, remember) {
    const err = $('#login-err'); if (err) err.textContent = '';
    try {
      let u;
      if (Store.adapter && Store.adapter.login) u = await Store.adapter.login(id, pw);
      else {
        u = Store.all('users').find((x) => x.id.toLowerCase() === id.toLowerCase() || (x.email || '').toLowerCase() === id.toLowerCase());
        if (!u || (await pwdHash(u.id, pw)) !== u.pwd) throw new Error('Employee ID or password is not correct.');
      }
      if (u.status !== 'Active') throw new Error('This account is inactive. Contact the System Administrator.');
      App.user = u; LS.set('lastId', u.id); LS.set('remember', !!remember);
      if (remember) LS.set('session', { id: u.id, at: Date.now() }); else LS.del('session');
      App.plant = LS.get('plant', 'all'); if (u.plants && u.plants.length === 1) App.plant = u.plants[0];
      App.route = { page: u.role === 'auditor' ? 'wos' : u.role === 'member' ? 'car' : 'dashboard', params: {} };
      if (u.role === 'auditor') App.ui.wosTab = 'mine';
      $('#app').innerHTML = ''; App.render(); window.scrollTo(0, 0);
      Domain.log('Login', u.id, 'Signed in', '', deviceInfo());
      Domain.generateDueWorkOrders(false).then((n) => n && UI.toast(`${n} audit work order${n > 1 ? 's were' : ' was'} generated from the schedule.`));
    } catch (e) { if (err) err.textContent = e.message || 'Sign-in failed.'; }
  },
};
Object.assign(Acts, {
  'demo-login'(el) { $('#login-id').value = el.dataset.id; $('#login-pw').value = 'Demo@123'; Auth.login(el.dataset.id, 'Demo@123', $('#login-rem').checked); },
  forgot() {
    const fields = [{ name: 'id', label: 'Employee ID / Username', required: true, full: true, value: ($('#login-id') || {}).value || '' }];
    UI.modal({ title: 'Reset password', sub: 'The System Administrator will receive a reset request.', body: UI.form(fields), actions: [{ label: 'Cancel' }, { label: 'Send request', cls: 'primary', onClick: async (m) => { const v = UI.readForm(m, fields); if (!v) return false; const u = Store.all('users').find((x) => x.id.toLowerCase() === v.id.toLowerCase()); if (Store.adapter && Store.adapter.forgot) await Store.adapter.forgot(v.id); else if (u) { const admins = Store.all('users').filter((x) => x.role === 'admin').map((x) => x.id); await Store.put('notifications', uid('N-'), { at: nowISO(), type: 'Password reset request', title: 'Password reset requested', body: `${u.name} (${u.id}) asked for a password reset.`, to: admins, link: { page: 'users', id: '' }, readBy: [], channels: ['In-app', 'Email'] }); } UI.toast('Request sent. Your administrator will reset the password and share it with you.', 'good'); } }] });
  },
});

/* ---------- filter helpers shared by dashboard / analytics / reports ---------- */
const Filt = {
  periodOpts(type) {
    const st = Domain.settings(); const fy = st.fiscalYearStart || 4;
    const dates = Store.all('workorders').map((w) => w.plannedDate).filter(Boolean).sort(); const t = Domain.today;
    const first = dates[0] || t; const last = dates[dates.length - 1] > t ? dates[dates.length - 1] : t;
    if (type === 'month') { const out = []; let d = first.slice(0, 7) + '-01'; while (d.slice(0, 7) <= last.slice(0, 7)) { out.push([d.slice(0, 7), fmtMonth(d.slice(0, 7))]); d = FS.addMonths(d, 1); } return out.reverse(); }
    if (type === 'quarter') { const out = []; const y0 = FS.fiscalYear(first, fy), y1 = FS.fiscalYear(last, fy); for (let y = y1; y >= y0; y--) for (let q = 4; q >= 1; q--) out.push([`${y}-Q${q}`, `FY${String(y).slice(2)}-${String(y + 1).slice(2)} Q${q}`]); return out; }
    if (type === 'year') { const out = []; const y0 = FS.fiscalYear(first, fy), y1 = FS.fiscalYear(last, fy); for (let y = y1; y >= y0; y--) out.push([String(y), `FY ${y}-${String(y + 1).slice(2)}`]); return out; }
    return [['all', 'All time']];
  },
  defaults() { return { ptype: 'month', pval: Domain.lastDataMonth(), apu: '', dept: '', zone: '', auditor: '', auditType: '', section: '' }; },
  toFilter(s) { const p = s.ptype === 'all' ? { type: 'all' } : { type: s.ptype, value: s.pval }; return { period: p, apu: s.apu, dept: s.dept, zone: s.zone, auditor: s.auditor, auditType: s.auditType, section: s.section }; },
  label(s) { if (s.ptype === 'all') return 'All time'; const o = Filt.periodOpts(s.ptype).find((x) => x[0] === s.pval); return o ? o[1] : s.pval; },
  bar(key, s, opts = {}) {
    const ms = Domain.masters(); const zones = Domain.scopeZones().filter((z) => (!s.apu || z.apu === s.apu) && (!s.dept || z.dept === s.dept));
    const apus = (ms.apus || []).filter((a) => App.plant === 'all' || a.plant === App.plant).filter((a) => !App.user.apus || !App.user.apus.length || App.user.apus.includes(a.id));
    const pOpts = Filt.periodOpts(s.ptype);
    if (s.ptype !== 'all' && !pOpts.find((x) => x[0] === s.pval)) s.pval = pOpts[0] ? pOpts[0][0] : '';
    const auditors = uniq(Store.all('workorders').map((w) => w.auditor)).filter(Boolean);
    return `<div class="filters">${icon('filter', 'faint')}
      ${UI.sel(key + ':apu', [['', 'All APUs']].concat(apus.map((a) => [a.id, a.name])), s.apu, 'APU')}
      ${UI.sel(key + ':dept', [['', 'All departments']].concat((ms.departments || []).map((d) => [d.name, d.name])), s.dept, 'Department')}
      ${opts.section ? UI.sel(key + ':section', [['', 'All sections']].concat((ms.sections || []).filter((x) => !s.dept || x.dept === s.dept).map((d) => [d.name, d.name])), s.section, 'Section') : ''}
      ${UI.sel(key + ':zone', [['', 'All zones']].concat(zones.map((z) => [z.id, z.code])), s.zone, 'Zone')}
      ${opts.auditor !== false ? UI.sel(key + ':auditor', [['', 'All auditors']].concat(auditors.map((a) => [a, Domain.uname(a)])), s.auditor, 'Auditor') : ''}
      ${UI.sel(key + ':auditType', [['', 'All audit types']].concat((ms.auditTypes || []).map((a) => [a, a])), s.auditType, 'Audit type')}
      <span class="lbl" style="margin-left:6px">Period</span>${UI.sel(key + ':ptype', [['month', 'Month'], ['quarter', 'Quarter'], ['year', 'Year'], ['all', 'All time']], s.ptype, 'Period type')}
      ${s.ptype !== 'all' ? UI.sel(key + ':pval', pOpts, s.pval, 'Period') : ''}
      ${s.apu || s.dept || s.zone || s.auditor || s.auditType || s.section ? `<button class="btn sm ghost" data-act="filt-clear" data-key="${key}">Clear</button>` : ''}</div>`;
  },
};
Acts['filt-clear'] = (el) => { const s = App.st(el.dataset.key, {}); Object.assign(s, { apu: '', dept: '', zone: '', auditor: '', auditType: '', section: '' }); App.render(); };

/* ---------- Dashboard ---------- */
Pages.dashboard = {
  perm: 'Dashboard',
  render() {
    const s = App.st('dash', Filt.defaults()); const f = Filt.toFilter(s); const st = Domain.settings();
    const k = Domain.kpis(f); const ms = Domain.masters();
    const per = Filt.label(s);
    const sAvg = Domain.sAverages(k.done); const weakest = FS.S_KEYS.filter((x) => sAvg[x] !== null).sort((a, b) => sAvg[a] - sAvg[b])[0];
    // APU ranking (avg score of period)
    const apus = (ms.apus || []).filter((a) => App.plant === 'all' || a.plant === App.plant);
    const apuRank = apus.map((a) => { const d = k.done.filter((w) => w.apu === a.id); return { label: a.name, sub: `${d.length} audits · ${Domain.uname(a.facilitator)}`, value: round1(avg(d.map((w) => w.score.overall.pct))), color: Domain.bandColor(avg(d.map((w) => w.score.overall.pct))), act: 'dash-apu', v: a.id }; }).filter((x) => x.value !== null).sort((a, b) => b.value - a.value);
    // Zone leader %
    const leaders = groupBy(k.zScores, (x) => x.z.leader);
    const ldr = Object.entries(leaders).map(([id, l]) => ({ id, name: Domain.uname(id), pct: round1(avg(l.map((x) => x.pct))), zones: l.map((x) => x.z.code).join(', ') })).sort((a, b) => b.pct - a.pct);
    // Findings vs occurrences zone-wise (period-to-date in FY)
    const fyStart = Domain.periodRange({ type: 'year', value: String(FS.fiscalYear((s.pval || Domain.today) + (s.ptype === 'month' ? '-01' : ''), st.fiscalYearStart || 4)) })[0];
    const fsYtd = Domain.applyFilter(Domain.findings(), Object.assign({}, f, { period: { type: 'range', from: s.ptype === 'all' ? '0000-01-01' : fyStart, to: Domain.periodRange(f.period)[1] } }), 'finding');
    const fz = Object.entries(groupBy(fsYtd, (x) => x.zone)).map(([z, l]) => ({ z, unique: uniq(l.map((x) => x.qid)).length, occ: l.length })).sort((a, b) => b.occ - a.occ).slice(0, 16);
    const months = Domain.fyMonths(s.ptype === 'month' ? s.pval : Domain.lastDataMonth());
    const trend = Domain.monthlyTrend(Object.assign({}, f, { period: { type: 'all' } }), months);
    const sevs = (ms.severities || []).map((x) => ({ label: x.name, value: k.fs.filter((y) => y.severity === x.name).length, color: x.color }));
    const aStat = ['Open', 'In Progress', 'Submitted for Verification', 'Rejected', 'Overdue', 'Verified', 'Closed'].map((x) => ({ label: x, value: k.acts.filter((a) => Domain.actStatus(a) === x).length, color: { Open: 'var(--info)', 'In Progress': 'var(--violet)', 'Submitted for Verification': 'var(--warn)', Rejected: '#c0592b', Overdue: 'var(--bad)', Verified: 'var(--good)', Closed: 'var(--ink-3)' }[x] }));
    const comp = months.map((m) => { const ff = Object.assign({}, f, { period: { type: 'month', value: m } }); const kk = Domain.applyFilter(Domain.wos().filter((w) => w.status !== 'Cancelled'), ff, 'wo'); return { m, p: kk.length, c: kk.filter((w) => Domain.isDone(w)).length }; }).filter((x) => x.p || x.m <= Domain.today.slice(0, 7));
    const depts = Object.entries(groupBy(k.done, (w) => w.dept)).map(([d, l]) => ({ label: d, sub: `${uniq(l.map((w) => w.zone)).length} zones · ${l.length} audits`, value: round1(avg(l.map((w) => w.score.overall.pct))), act: 'dash-dept', v: d })).map((x) => Object.assign(x, { color: Domain.bandColor(x.value) })).sort((a, b) => b.value - a.value);
    const themes = Domain.recurringThemes(Domain.applyFilter(Domain.findings(), Object.assign({}, f, { period: { type: 'all' } }), 'finding')).slice(0, 5);
    const improv = k.zScores.map((x) => { const p = Domain.prevAudit(x.w); return { z: x.z, cur: x.pct, prev: p ? p.score.overall.pct : null }; }).filter((x) => x.prev !== null).map((x) => Object.assign(x, { d: round1(x.cur - x.prev) })).sort((a, b) => b.d - a.d);
    const alerts = Domain.alerts(f);
    const delta = (cur, prev) => (cur === null || prev === null ? '' : `<span class="delta ${cur >= prev ? 'up' : 'down'}">${cur >= prev ? '▲' : '▼'} ${Math.abs(round1(cur - prev))}</span>`);
    const prevMonth = s.ptype === 'month' ? FS.addMonths(s.pval + '-01', -1).slice(0, 7) : null;
    const kPrev = prevMonth ? Domain.kpis(Object.assign({}, f, { period: { type: 'month', value: prevMonth } })) : null;

    return `${UI.head('5S Management Dashboard', [], `<button class="btn" data-go="reports" data-id='${JSON.stringify({ r: 'mgmt' })}'>${icon('file')}Management report</button>`, `${esc(per)} · ${App.plant === 'all' ? 'All plants' : esc(Domain.plantName(App.plant))}${s.apu ? ' · ' + esc(Domain.apuName(s.apu)) + ' APU' : ''}${s.dept ? ' · ' + esc(s.dept) : ''}`)}
      ${Filt.bar('dash', s)}
      <div class="kpis" style="margin-bottom:12px">
        <button class="kpi" data-go="wos" data-id='${JSON.stringify({ tab: 'all' })}'><span class="k-l">No. of Audits · Plan vs Actual</span><span class="k-v">${k.completed}<small> / ${k.planned}</small></span>${UI.meter(k.completion, k.completion >= (st.completionTarget || 95) ? 'var(--good)' : 'var(--warn)')}<span class="k-s">${fmtPct(k.completion)} completed · target ${st.completionTarget || 95}%</span></button>
        <button class="kpi" data-go="car" data-id='${JSON.stringify({ tab: 'findings' })}'><span class="k-l">No. of Findings</span><span class="k-v">${k.findings}</span><span class="k-s">${k.critical} critical · ${k.fs.filter((x) => x.severity === 'Major').length} major · ${k.findingRate !== null ? k.findingRate.toFixed(1) + ' per audit' : ''}</span></button>
        <button class="kpi" data-go="car" data-id='${JSON.stringify({ tab: 'findings', fstatus: 'open' })}'><span class="k-l">Open</span><span class="k-v" style="color:${k.findingsOpen ? 'var(--warn)' : 'inherit'}">${k.findingsOpen}</span><span class="k-s">findings · ${k.openActions} open actions${k.overdue ? ` · <b style="color:var(--bad)">${k.overdue} overdue</b>` : ''}</span></button>
        <button class="kpi" data-go="car" data-id='${JSON.stringify({ tab: 'findings', fstatus: 'Closed' })}'><span class="k-l">Closed</span><span class="k-v" style="color:var(--good)">${k.findingsClosed}</span><span class="k-s">findings · action closure ${fmtPct(k.actionClosure)}</span></button>
      </div>
      <div class="kpis six" style="margin-bottom:16px">
        <div class="kpi mini"><span class="k-l">Active zones</span><span class="k-v">${k.zones}</span><span class="k-s">${uniq(k.done.map((w) => w.zone)).length} audited in period</span></div>
        <div class="kpi mini"><span class="k-l">Average 5S score</span><span class="k-v" style="color:${Domain.bandColor(k.avgScore)}">${fmtPct(k.avgScore, 1)}</span><span class="k-s">${esc((Domain.band(k.avgScore) || {}).label || '')} ${kPrev ? delta(k.avgScore, kPrev.avgScore) : ''}</span></div>
        <button class="kpi mini" data-go="car" data-id='${JSON.stringify({ tab: 'actions', status: 'Overdue' })}'><span class="k-l">Overdue actions</span><span class="k-v" style="color:${k.overdue ? 'var(--bad)' : 'inherit'}">${k.overdue}</span><span class="k-s">${fmtPct(k.overduePct)} of open actions</span></button>
        <button class="kpi mini" data-go="car" data-id='${JSON.stringify({ tab: 'findings', sev: 'Critical' })}'><span class="k-l">Critical findings</span><span class="k-v" style="color:${k.criticalOpen ? 'var(--bad)' : 'inherit'}">${k.critical}</span><span class="k-s">${k.criticalOpen} still open</span></button>
        ${k.best ? `<button class="kpi mini" data-go="zone" data-id="${k.best.z.id}"><span class="k-l">Best performing zone</span><span class="k-v">${UI.score(k.best.pct)}</span><span class="k-s">${esc(k.best.z.code)} · ${esc(k.best.z.name)}</span></button>` : '<div class="kpi mini"><span class="k-l">Best performing zone</span><span class="k-v">—</span></div>'}
        ${k.worst ? `<button class="kpi mini" data-go="zone" data-id="${k.worst.z.id}"><span class="k-l">Lowest performing zone</span><span class="k-v">${UI.score(k.worst.pct)}</span><span class="k-s">${esc(k.worst.z.code)} · ${esc(k.worst.z.name)}</span></button>` : '<div class="kpi mini"><span class="k-l">Lowest performing zone</span><span class="k-v">—</span></div>'}
      </div>
      <div class="grid">
        <div class="c6">${UI.card('APU Ranking', UI.hbars(apuRank, { rank: true, fmt: (v) => v + '%', max: 100, target: st.targetScore }), { sub: 'Average audit score in ' + esc(per) + ' · click an APU to focus the dashboard' })}</div>
        <div class="c6">${UI.card('Needs attention', alerts.length ? `<div class="alerts">${alerts.slice(0, 7).map((a) => `<div class="alert ${a.lvl}" data-go="${a.go[0]}" data-id="${esc(typeof a.go[1] === 'object' ? JSON.stringify(a.go[1]) : a.go[1])}"><span class="ai">${icon(a.icon)}</span><span>${esc(a.text)}</span></div>`).join('')}</div>${alerts.length > 7 ? `<button class="btn sm ghost" style="margin-top:8px" data-act="all-alerts">Show all ${alerts.length} alerts</button>` : ''}` : UI.empty('check', 'Nothing needs attention'), { sub: 'Smart alerts from audits, actions and score trends' })}</div>
        <div class="c12">${UI.card('Zone Leader performance', ldr.length ? UI.chart('bars', { labels: ldr.map((x) => x.name), series: [{ name: 'Average zone score', values: ldr.map((x) => x.pct), color: (v) => Domain.bandColor(v) }] }, { h: 260, yMax: 100, unit: '%', target: st.targetScore, rot: true, act: 'dash-leader' }) : UI.empty('chart', 'No completed audits in this period'), { sub: `Latest audit score of each leader's zones · dashed line = ${st.targetScore}% target`, right: `<div class="legend">${(st.bands || []).map((b) => `<span><i style="background:${b.color}"></i>${esc(b.label)}</span>`).join('')}</div>` })}</div>
        <div class="c12">${UI.card('Findings vs No. of Occurrences – Zone wise', fz.length ? `${UI.chart('bars', { labels: fz.map((x) => x.z), series: [{ name: 'Unique findings (distinct checkpoints)', values: fz.map((x) => x.unique), color: 'var(--accent)' }, { name: 'Total occurrences', values: fz.map((x) => x.occ), color: 'var(--s1)' }] }, { h: 250, rot: true, act: 'dash-zone' })}<div class="legend"><span><i style="background:var(--accent)"></i>Unique findings (distinct checkpoints)</span><span><i style="background:var(--s1)"></i>Total occurrences</span><span class="faint">A wide gap means the same checkpoint keeps failing.</span></div>` : UI.empty('chart', 'No findings in this period'), { sub: 'Financial year to date, top 16 zones by occurrences' })}</div>
        <div class="c8">${UI.card('5S Score Trend', UI.chart('line', { labels: months.map((m) => MON[Number(m.slice(5)) - 1]), series: [{ name: 'Overall', values: trend.map((t) => t.overall), color: 'var(--accent)', area: true, width: 2.8 }] }, { h: 240, target: st.targetScore, yMin: 50 }), { sub: 'Monthly average overall score, ' + esc(Filt.periodOpts('year').find((x) => x[0] === String(FS.fiscalYear(months[0] + '-01', st.fiscalYearStart)))?.[1] || '') })}</div>
        <div class="c4">${UI.card('S1–S5 Performance', `${UI.chart('bars', { labels: FS.S_KEYS.slice(), series: [{ name: 'Score', values: FS.S_KEYS.map((x) => sAvg[x]), color: (v, i) => `var(--s${i + 1})` }] }, { h: 220, yMax: 100, unit: '%', target: st.targetScore })}${weakest ? `<div class="small" style="margin-top:6px">Weakest S: <b>${weakest} – ${esc(Domain.sName(weakest))}</b> at ${fmtPct(sAvg[weakest])}</div>` : ''}`, { sub: 'Average of audits in period' })}</div>
        <div class="c4">${UI.card('Finding severity', UI.chart('donut', { items: sevs, centerLabel: 'findings' }, { h: 190 }), { sub: esc(per) })}</div>
        <div class="c4">${UI.card('Action status', `${UI.stackbar(aStat)}<div class="divider" style="margin:14px 0 10px"></div>${Pages.analytics.agingMini(k.open)}`, { sub: 'All actions in scope' })}</div>
        <div class="c4">${UI.card('Audit completion', UI.chart('bars', { labels: comp.map((x) => MON[Number(x.m.slice(5)) - 1]), series: [{ name: 'Planned', values: comp.map((x) => x.p), color: 'var(--surface-3)' }, { name: 'Completed', values: comp.map((x) => x.c), color: 'var(--good)' }] }, { h: 190, values: false }) + '<div class="legend"><span><i style="background:var(--surface-3)"></i>Planned</span><span><i style="background:var(--good)"></i>Completed</span></div>', { sub: 'Planned vs completed per month' })}</div>
        <div class="c6">${UI.card('Zone ranking', `<div class="grid" style="gap:14px"><div class="c6"><div class="eyebrow" style="margin-bottom:8px">Top 5</div>${UI.hbars(k.zScores.slice(0, 5).map((x) => ({ label: x.z.code, sub: x.z.name, value: round1(x.pct), color: Domain.bandColor(x.pct), go: ['zone', x.z.id] })), { max: 100, fmt: (v) => Math.round(v) + '%' })}</div><div class="c6"><div class="eyebrow" style="margin-bottom:8px">Bottom 5</div>${UI.hbars(k.zScores.slice(-5).reverse().map((x) => ({ label: x.z.code, sub: x.z.name, value: round1(x.pct), color: Domain.bandColor(x.pct), go: ['zone', x.z.id] })), { max: 100, fmt: (v) => Math.round(v) + '%' })}</div></div><button class="btn sm ghost" data-go="analytics" data-id='${JSON.stringify({ tab: 'heat' })}' style="margin-top:8px">Open 5S heat map</button>`, { sub: 'Latest audit in period' })}</div>
        <div class="c6">${UI.card('Department performance', UI.hbars(depts, { fmt: (v) => v + '%', max: 100, target: st.targetScore }), { sub: 'Click a department to drill down' })}</div>
        <div class="c6">${UI.card('Top recurring findings', themes.length ? `<div class="stack tight">${themes.map((t, i) => `<div class="row top" style="gap:10px;padding:6px 0;border-bottom:1px solid var(--line-2)"><span class="rank">${i + 1}</span>${UI.stag(t.s)}<div class="grow"><div>${esc(t.label)}</div><div class="small faint">${t.zones.slice(0, 6).join(', ')}${t.zones.length > 6 ? ' +' + (t.zones.length - 6) : ''}</div></div><b class="num" style="font-size:18px">${t.n}</b></div>`).join('')}</div>` : UI.empty('repeat', 'No recurring findings'), { sub: 'Grouped by similar description within the same S', right: `<button class="btn sm ghost" data-go="car" data-id='${JSON.stringify({ tab: 'repeat' })}'>Repeat analysis</button>` })}</div>
        <div class="c6">${UI.card('Improvement vs previous audit', improv.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Zone</th><th class="num">Previous</th><th class="num">Latest</th><th class="num">Change</th></tr></thead><tbody>${improv.slice(0, 4).concat(improv.length > 8 ? [null] : [], improv.slice(-4).filter((x) => !improv.slice(0, 4).includes(x))).map((x) => (x ? `<tr class="click" data-go="zone" data-id="${x.z.id}"><td><b class="mono">${esc(x.z.code)}</b> <span class="muted small">${esc(x.z.name)}</span></td><td class="num">${fmtPct(x.prev)}</td><td class="num">${UI.score(x.cur)}</td><td class="num"><span class="delta ${x.d >= 0 ? 'up' : 'down'}">${x.d >= 0 ? '+' : ''}${x.d} pts (${x.prev ? (x.d >= 0 ? '+' : '') + Math.round((x.d / x.prev) * 100) + '%' : ''})</span></td></tr>` : '<tr><td colspan="4" class="center faint small">…</td></tr>')).join('')}</tbody></table></div>` : UI.empty('chart', 'Not enough audit history'), { sub: 'Biggest gains and drops' })}</div>
      </div>`;
  },
};
Object.assign(Acts, {
  'dash-apu'(el) { const s = App.st('dash', Filt.defaults()); s.apu = s.apu === el.dataset.v ? '' : el.dataset.v; s.zone = ''; App.render(); UI.toast(s.apu ? `Dashboard focused on ${Domain.apuName(s.apu)} APU` : 'Showing all APUs'); },
  'dash-dept'(el) { const s = App.st('dash', Filt.defaults()); s.dept = s.dept === el.dataset.v ? '' : el.dataset.v; App.render(); },
  'dash-zone'(el) { const s = App.st('dash', Filt.defaults()); const lbl = UI._charts[el.closest('.chart').dataset.chart].data.labels[Number(el.dataset.i)]; App.go('zone', { id: lbl }); },
  'dash-leader'(el) { const c = UI._charts[el.closest('.chart').dataset.chart]; const name = c.data.labels[Number(el.dataset.i)]; const u = Store.all('users').find((x) => x.name === name); const z = u && Store.all('zones').find((x) => x.leader === u.id); if (z) App.go('zone', { id: z.id }); },
  'all-alerts'() { const s = App.st('dash', Filt.defaults()); const al = Domain.alerts(Filt.toFilter(s)); UI.modal({ title: 'All alerts', size: 'wide', body: `<div class="alerts">${al.map((a) => `<div class="alert ${a.lvl}" data-go="${a.go[0]}" data-id="${esc(typeof a.go[1] === 'object' ? JSON.stringify(a.go[1]) : a.go[1])}"><span class="ai">${icon(a.icon)}</span><span>${esc(a.text)}</span></div>`).join('')}</div>` }); },
});

/* ---------- Analytics ---------- */
Pages.analytics = {
  perm: 'Analytics',
  agingMini(open) {
    const buckets = Pages.analytics.buckets(open);
    return `<div class="eyebrow" style="margin-bottom:6px">Open action aging</div><div class="row" style="gap:6px">${buckets.map((b) => `<div style="flex:1;min-width:52px;text-align:center;padding:6px 2px;border-radius:6px;background:${b.over ? 'var(--bad-soft)' : 'var(--surface-2)'}"><div class="num" style="font-size:18px;font-weight:600">${b.list.length}</div><div class="tiny faint">${b.label}</div></div>`).join('')}</div>`;
  },
  buckets(open) {
    const t = Domain.today; const B = [['0–7 d', 0, 7], ['8–15 d', 8, 15], ['16–30 d', 16, 30], ['31–60 d', 31, 60], ['>60 d', 61, 1e9]];
    return B.map(([label, a, b]) => { const list = open.filter((x) => { const age = FS.diffDays(t, (x.createdAt || t).slice(0, 10)); return age >= a && age <= b; }); return { label, list, over: list.some((x) => Domain.actStatus(x) === 'Overdue') }; });
  },
  render() {
    const tab = App.ui.anTab || 'heat';
    const s = App.st('an', Object.assign(Filt.defaults(), { ptype: 'year', pval: String(FS.fiscalYear(Domain.today, Domain.settings().fiscalYearStart || 4)) }));
    const body = { heat: this.heat, trend: this.trend, aging: this.aging, auditors: this.auditors, depts: this.depts, duration: this.duration }[tab].call(this, s);
    return `${UI.head('Analytics', [], '', 'Heat map, trends, aging and people analytics')}
      ${UI.tabs('anTab', [['heat', '5S Heat Map'], ['trend', 'Trend Analysis'], ['aging', 'Action Aging'], ['depts', 'Departments'], ['auditors', 'Auditors'], ['duration', 'Audit Duration']], tab)}
      ${Filt.bar('an', s, { section: true })}${body}`;
  },
  heat(s) {
    const f = Filt.toFilter(s); const done = Domain.completedWOs(f); const st = Domain.settings();
    const zones = Domain.scopeZones().filter((z) => (!s.apu || z.apu === s.apu) && (!s.dept || z.dept === s.dept) && (!s.zone || z.id === s.zone) && (!s.section || z.section === s.section));
    const rows = zones.map((z) => { const l = done.filter((w) => w.zone === z.id).sort((a, b) => Domain.auditDate(b).localeCompare(Domain.auditDate(a))); const w = l[0]; return { z, w }; }).sort((a, b) => (b.w ? b.w.score.overall.pct : -1) - (a.w ? a.w.score.overall.pct : -1));
    const cell = (p) => (p === null || p === undefined ? '<td class="hc"><span class="faint">—</span></td>' : `<td class="hc"><span style="background:color-mix(in srgb, ${Domain.bandColor(p)} 22%, transparent);color:var(--ink);box-shadow:inset 3px 0 0 ${Domain.bandColor(p)}">${Math.round(p)}</span></td>`);
    return UI.card('Zone-wise 5S heat map', `<div class="tbl-wrap"><table class="tbl heat"><thead><tr><th>Zone</th>${FS.S_KEYS.map((x) => `<th>${x}<div class="tiny faint" style="text-transform:none;letter-spacing:0">${esc(Domain.sName(x))}</div></th>`).join('')}<th>Overall</th><th>Audit</th></tr></thead><tbody>${rows.map(({ z, w }) => `<tr class="click" data-go="zone" data-id="${z.id}"><td><b class="mono">${esc(z.code)}</b><div class="small muted">${esc(z.name)} · ${esc(Domain.apuName(z.apu))}</div></td>${FS.S_KEYS.map((x) => cell(w ? w.score[x].pct : null)).join('')}<td class="hc">${w ? UI.score(w.score.overall.pct) : '<span class="faint">—</span>'}</td><td class="small nowrap">${w ? fmtDate(Domain.auditDate(w)) : '<span class="faint">No audit</span>'}</td></tr>`).join('')}</tbody></table></div><div class="legend" style="margin-top:10px">${(st.bands || []).map((b) => `<span><i style="background:${b.color}"></i>${esc(b.label)} ≥ ${b.min}</span>`).join('')}<span class="faint">Bands are configured in Master → Scoring.</span></div>`, { sub: 'Latest audit per zone in ' + esc(Filt.label(s)) + ' · click a zone for its profile' });
  },
  trend(s) {
    const zs = Domain.scopeZones().filter((z) => (!s.apu || z.apu === s.apu) && (!s.dept || z.dept === s.dept));
    const zid = s.zone || App.ui.trendZone || (zs[0] && zs[0].id);
    const months = Domain.fyMonths(s.ptype === 'month' ? s.pval : Domain.lastDataMonth());
    const f = Filt.toFilter(Object.assign({}, s, { zone: s.zone }));
    const tr = Domain.monthlyTrend(Object.assign({}, f, { period: { type: 'all' } }), months).filter((x) => x.m <= Domain.today.slice(0, 7));
    const hide = App.st('trendHide', {});
    const series = [{ k: 'overall', name: 'Overall', color: 'var(--ink)', width: 3 }].concat(FS.S_KEYS.map((x, i) => ({ k: x, name: x + ' ' + Domain.sName(x), color: `var(--s${i + 1})`, width: 1.8 }))).filter((x) => !hide[x.k]).map((x) => Object.assign(x, { values: tr.map((t) => t[x.k]) }));
    const tbl = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Month</th>${FS.S_KEYS.map((x) => `<th class="num">${x}</th>`).join('')}<th class="num">Overall</th><th class="num">Audits</th></tr></thead><tbody>${tr.map((t) => `<tr><td>${fmtMonth(t.m)}</td>${FS.S_KEYS.map((x) => `<td class="num">${t[x] === null ? '—' : Math.round(t[x])}</td>`).join('')}<td class="num">${t.overall === null ? '—' : UI.score(t.overall)}</td><td class="num">${t.n}</td></tr>`).join('')}</tbody></table></div>`;
    const reps = s.zone ? Domain.repeatGroups().filter((r) => r.zone === s.zone) : [];
    const zf = s.zone ? Domain.findings().filter((x) => x.zone === s.zone) : Domain.applyFilter(Domain.findings(), Object.assign({}, f, { period: { type: 'all' } }), 'finding');
    const fByM = months.map((m) => zf.filter((x) => (x.auditDate || '').startsWith(m)).length);
    const aByM = months.map((m) => { const za = Domain.applyFilter(Domain.actions(), Object.assign({}, f, { period: { type: 'all' } }), 'action'); return za.filter((a) => (a.verifiedAt || '').startsWith(m)).length; });
    return `<div class="grid"><div class="c12">${UI.card(s.zone ? `Score trend – ${esc(s.zone)}` : 'Score trend – all zones in filter', `<div class="legend" style="margin-bottom:8px">${[{ k: 'overall', name: 'Overall', color: 'var(--ink)' }].concat(FS.S_KEYS.map((x, i) => ({ k: x, name: x + ' ' + Domain.sName(x), color: `var(--s${i + 1})` }))).map((x) => `<button class="${hide[x.k] ? 'off' : ''}" data-act="trend-toggle" data-v="${x.k}"><i style="background:${x.color}"></i>${esc(x.name)}</button>`).join('')}</div>${UI.chart('line', { labels: tr.map((t) => MON[Number(t.m.slice(5)) - 1]), series }, { h: 300, target: Domain.settings().targetScore, endLabels: true })}`, { sub: 'Pick one zone in the filter above for the zone trend; click a legend item to hide a line' })}</div>
      <div class="c7">${UI.card('Monthly table', tbl)}</div>
      <div class="c5">${UI.card('Findings raised vs actions verified', UI.chart('bars', { labels: months.filter((m) => m <= Domain.today.slice(0, 7)).map((m) => MON[Number(m.slice(5)) - 1]), series: [{ name: 'Findings', values: fByM.slice(0, tr.length), color: 'var(--s1)' }, { name: 'Actions verified', values: aByM.slice(0, tr.length), color: 'var(--good)' }] }, { h: 230 }) + '<div class="legend"><span><i style="background:var(--s1)"></i>Findings raised</span><span><i style="background:var(--good)"></i>Actions verified</span></div>' + (reps.length ? `<div class="divider" style="margin:12px 0"></div><div class="eyebrow">Repeat findings in this zone</div>${reps.map((r) => `<div class="small" style="margin-top:6px">${UI.stag(r.s)} ${esc(r.desc)} – ${r.count}×</div>`).join('')}` : ''))}</div></div>`;
  },
  aging(s) {
    const f = Filt.toFilter(Object.assign({}, s, { ptype: 'all' }));
    const open = Domain.applyFilter(Domain.actions(), f, 'action').filter((a) => Domain.isActOpen(a));
    const B = this.buckets(open);
    const cur = App.ui.ageB || '';
    const list = cur ? (B.find((b) => b.label === cur) || { list: [] }).list : open;
    return `<div class="kpis six" style="grid-template-columns:repeat(5,minmax(0,1fr));margin-bottom:16px">${B.map((b) => `<button class="kpi ${cur === b.label ? '' : ''}" style="${cur === b.label ? 'border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)' : ''}" data-act="tab" data-key="ageB" data-v="${cur === b.label ? '' : b.label}"><span class="k-l">${b.label}</span><span class="k-v" style="color:${b.over ? 'var(--bad)' : 'inherit'}">${b.list.length}</span><span class="k-s">${b.list.filter((a) => Domain.actStatus(a) === 'Overdue').length} overdue</span></button>`).join('')}</div>
      <div class="grid"><div class="c4">${UI.card('By responsible department', UI.hbars(Object.entries(groupBy(open, (a) => a.dept)).map(([d, l]) => ({ label: d, value: l.length, color: l.some((a) => Domain.actStatus(a) === 'Overdue') ? 'var(--bad)' : 'var(--accent)' })).sort((a, b) => b.value - a.value)))}</div>
      <div class="c8">${UI.card(cur ? `Open actions aged ${cur}` : 'All open actions', UI.table('aging', [
        { k: 'no', h: 'Action', r: (a) => `<b class="mono">${esc(a.no)}</b>` }, { k: 'zone', h: 'Zone', r: (a) => esc(a.zone) },
        { k: 'sev', h: 'Severity', r: (a) => UI.sev((Store.get('findings', a.findingId) || {}).severity || '—'), sortv: (a) => (Store.get('findings', a.findingId) || {}).severity },
        { k: 'responsible', h: 'Responsible', r: (a) => UI.person(a.responsible), sortv: (a) => Domain.uname(a.responsible) }, { k: 'dept', h: 'Department' },
        { k: 'target', h: 'Due date', r: (a) => fmtDate(a.revisedTarget || a.target), sortv: (a) => a.revisedTarget || a.target },
        { k: 'age', h: 'Age (days)', num: true, r: (a) => FS.diffDays(Domain.today, a.createdAt.slice(0, 10)), sortv: (a) => FS.diffDays(Domain.today, a.createdAt.slice(0, 10)) },
        { k: 'status', h: 'Status', r: (a) => UI.actBadge(a), sortv: (a) => Domain.actStatus(a) }], list, { go: (a) => ['action', a.id], rowCls: (a) => (Domain.actStatus(a) === 'Overdue' ? 'over' : ''), sort: 'age', dir: 'desc' }), { sub: 'Overdue rows are highlighted' })}</div></div>`;
  },
  depts(s) {
    const f = Filt.toFilter(s); const k = Domain.kpis(f);
    const all = Domain.applyFilter(Domain.wos().filter((w) => w.status !== 'Cancelled'), f, 'wo');
    const rows = Object.entries(groupBy(all, (w) => w.dept)).map(([d, l]) => { const done = l.filter((w) => Domain.isDone(w)); const acts = Domain.applyFilter(Domain.actions(), f, 'action').filter((a) => a.dept === d); return { d, planned: l.length, done: done.length, comp: l.length ? (done.length / l.length) * 100 : null, avg: round1(avg(done.map((w) => w.score && w.score.overall.pct))), acts: acts.length, closure: acts.length ? (acts.filter((a) => !Domain.isActOpen(a)).length / acts.length) * 100 : null, overdue: acts.filter((a) => Domain.actStatus(a) === 'Overdue').length }; }).sort((a, b) => (b.avg || 0) - (a.avg || 0));
    const apuRows = Object.entries(groupBy(k.done, (w) => w.apu)).map(([a, l]) => ({ a, avg: round1(avg(l.map((w) => w.score.overall.pct))), n: l.length })).sort((a, b) => b.avg - a.avg);
    const risk = k.zScores.filter((x) => x.pct < (Domain.settings().alertScoreThreshold || 70) || Domain.zoneOpenActions(x.z.id).some((a) => Domain.actStatus(a) === 'Overdue')).slice(-8);
    return `<div class="grid"><div class="c8">${UI.card('Department analytics', `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>Department</th><th class="num">Planned</th><th class="num">Completed</th><th class="num">Completion</th><th class="num">Avg score</th><th class="num">Actions</th><th class="num">Closure</th><th class="num">Overdue</th></tr></thead><tbody>${rows.map((r, i) => `<tr class="click" data-act="dept-drill" data-v="${esc(r.d)}"><td><span class="rank">${i + 1}</span></td><td><b>${esc(r.d)}</b></td><td class="num">${r.planned}</td><td class="num">${r.done}</td><td class="num">${fmtPct(r.comp)}</td><td class="num">${UI.score(r.avg)}</td><td class="num">${r.acts}</td><td class="num">${fmtPct(r.closure)}</td><td class="num" style="color:${r.overdue ? 'var(--bad)' : 'inherit'}">${r.overdue}</td></tr>`).join('')}</tbody></table></div>`, { sub: 'Click a department to see its zones' })}</div>
      <div class="c4">${UI.card('Plant / APU score', UI.hbars(apuRows.map((x) => ({ label: Domain.apuName(x.a), sub: Domain.plantName((Domain.apu(x.a) || {}).plant) + ' · ' + x.n + ' audits', value: x.avg, color: Domain.bandColor(x.avg) })), { max: 100, fmt: (v) => v + '%', rank: true }))}
      <div style="height:16px"></div>${UI.card('Risk zones', risk.length ? `<div class="stack tight">${risk.map((x) => `<div class="row between" data-go="zone" data-id="${x.z.id}" style="cursor:pointer;padding:4px 0;border-bottom:1px solid var(--line-2)"><span><b class="mono">${esc(x.z.code)}</b> <span class="small muted">${esc(x.z.name)}</span></span><span class="row tight">${Domain.zoneOpenActions(x.z.id).filter((a) => Domain.actStatus(a) === 'Overdue').length ? `<span class="badge b-red">${Domain.zoneOpenActions(x.z.id).filter((a) => Domain.actStatus(a) === 'Overdue').length} overdue</span>` : ''}${UI.score(x.pct)}</span></div>`).join('')}</div>` : UI.empty('check', 'No risk zones'), { sub: 'Below threshold or carrying overdue actions' })}</div></div>`;
  },
  auditors(s) {
    const f = Filt.toFilter(s);
    const all = Domain.applyFilter(Domain.wos().filter((w) => w.status !== 'Cancelled'), f, 'wo');
    const rows = Object.entries(groupBy(all, (w) => w.auditor)).map(([a, l]) => { const done = l.filter((w) => Domain.isDone(w)); const fs = Store.all('findings').filter((x) => done.some((w) => w.id === x.woId)); const onTime = done.filter((w) => Domain.auditDate(w) <= w.dueDate).length; const photos = fs.filter((x) => (x.photos || []).length).length; return { a, planned: l.length, done: done.length, overdue: l.filter((w) => Domain.woStatus(w) === 'Overdue').length, dur: round1(avg(done.map((w) => w.duration))), fnd: fs.length, rate: done.length ? fs.length / done.length : null, onTime: done.length ? (onTime / done.length) * 100 : null, evidence: fs.length ? (photos / fs.length) * 100 : null, avg: round1(avg(done.map((w) => w.score && w.score.overall.pct))) }; }).sort((a, b) => b.done - a.done);
    return UI.card('Auditor analytics', `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Auditor</th><th class="num">Assigned</th><th class="num">Completed</th><th class="num">Overdue</th><th class="num">On-time %</th><th class="num">Avg duration</th><th class="num">Findings</th><th class="num">Findings / audit</th><th class="num">Photo evidence %</th><th class="num">Avg score given</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${UI.person(r.a)}</td><td class="num">${r.planned}</td><td class="num">${r.done}</td><td class="num" style="color:${r.overdue ? 'var(--bad)' : 'inherit'}">${r.overdue}</td><td class="num">${fmtPct(r.onTime)}</td><td class="num">${r.dur ? r.dur + ' min' : '—'}</td><td class="num">${r.fnd}</td><td class="num">${r.rate === null ? '—' : r.rate.toFixed(1)}</td><td class="num">${fmtPct(r.evidence)}</td><td class="num">${UI.score(r.avg)}</td></tr>`).join('')}</tbody></table></div><div class="small faint" style="margin-top:8px">Audit quality is shown through on-time completion, findings per audit and the share of findings backed by photo evidence.</div>`, { sub: esc(Filt.label(s)) });
  },
  duration(s) {
    const f = Filt.toFilter(s); const done = Domain.completedWOs(f).filter((w) => w.duration);
    const block = (title, key, lbl) => { const rows = Object.entries(groupBy(done, key)).map(([k, l]) => ({ label: lbl(k), value: round1(avg(l.map((w) => w.duration))), sub: l.length + ' audits' })).sort((a, b) => b.value - a.value); return UI.card(title, UI.hbars(rows, { fmt: (v) => Math.round(v) + ' min' })); };
    return `<div class="kpis" style="margin-bottom:16px"><div class="kpi"><span class="k-l">Audits with timing</span><span class="k-v">${done.length}</span></div><div class="kpi"><span class="k-l">Average duration</span><span class="k-v">${Math.round(avg(done.map((w) => w.duration)) || 0)}<small> min</small></span></div><div class="kpi"><span class="k-l">Shortest</span><span class="k-v">${done.length ? Math.min(...done.map((w) => w.duration)) : '—'}<small> min</small></span></div><div class="kpi"><span class="k-l">Longest</span><span class="k-v">${done.length ? Math.max(...done.map((w) => w.duration)) : '—'}<small> min</small></span></div></div>
      <div class="grid"><div class="c6">${block('By auditor', (w) => w.auditor, (k) => Domain.uname(k))}</div><div class="c6">${block('By zone', (w) => w.zone, (k) => k)}</div><div class="c6">${block('By department', (w) => w.dept, (k) => k)}</div><div class="c6">${block('By audit type', (w) => w.auditType, (k) => k)}</div></div>`;
  },
};
Object.assign(Acts, {
  'trend-toggle'(el) { const h = App.st('trendHide', {}); h[el.dataset.v] = !h[el.dataset.v]; App.render(); },
  'dept-drill'(el) { const s = App.st('an', {}); s.dept = el.dataset.v; App.ui.anTab = 'heat'; App.render(); },
});
