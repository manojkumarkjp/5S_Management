/* ===== Work Orders & Execution, Audit Summary, Scorecard ===== */
const WO_TABS = { mine: (w) => w.auditor === App.user.id || w.backupAuditor === App.user.id, open: (w) => ['Assigned', 'Accepted', 'Due', 'Draft'].includes(Domain.woStatus(w)), progress: (w) => w.status === 'In Progress' && Domain.woStatus(w) !== 'Overdue', review: (w) => ['Submitted', 'Under Review'].includes(w.status), done: (w) => ['Approved', 'Closed'].includes(w.status), overdue: (w) => Domain.woStatus(w) === 'Overdue', cancelled: (w) => w.status === 'Cancelled', all: () => true };
Pages.wos = {
  perm: 'Work Orders', perm2: 'Execute Audit',
  render(p) {
    if (p.tab) { App.ui.wosTab = p.tab; delete p.tab; }
    const isAud = Domain.can('Execute Audit', 'edit');
    const tab = App.ui.wosTab || (App.user.role === 'auditor' ? 'mine' : 'open');
    const all = Domain.wos();
    const f = App.st('wosF', { apu: '', zone: '', auditor: '', auditType: '', month: '', q: '' });
    let list = all.filter(WO_TABS[tab] || WO_TABS.all).filter((w) => (!f.apu || w.apu === f.apu) && (!f.zone || w.zone === f.zone) && (!f.auditor || w.auditor === f.auditor) && (!f.auditType || w.auditType === f.auditType) && (!f.month || w.plannedDate.startsWith(f.month)) && (!f.q || (w.no + ' ' + w.zone + ' ' + Domain.uname(w.auditor)).toLowerCase().includes(f.q.toLowerCase())));
    const count = (k) => all.filter(WO_TABS[k]).length;
    const tabs = [isAud ? ['mine', 'My Audits', all.filter((w) => WO_TABS.mine(w) && !Domain.isDone(w) && w.status !== 'Cancelled').length] : null, ['open', 'Assigned / Due', count('open')], ['progress', 'In Progress', count('progress')], ['review', 'Submitted / Under Review', count('review')], ['overdue', 'Overdue', count('overdue')], ['done', 'Approved / Closed', count('done')], ['cancelled', 'Cancelled', count('cancelled')], ['all', 'All', all.length]].filter(Boolean);
    const canCreate = Domain.can('Work Orders', 'edit');
    const months = uniq(all.map((w) => w.plannedDate.slice(0, 7))).sort().reverse();
    const body = tab === 'mine' ? this.mine(list) : UI.card('', UI.table('wos-' + tab, [
      { k: 'no', h: 'Work order / Audit no.', r: (w) => `<b class="mono">${esc(w.no)}</b><div class="small faint">${esc(w.scheduleId || 'Ad-hoc')}</div>` },
      { k: 'zone', h: 'Zone', r: (w) => `<b class="mono">${esc(w.zone)}</b><div class="small muted">${esc((Domain.zone(w.zone) || {}).name || '')}</div>` },
      { k: 'dept', h: 'APU / Dept', r: (w) => `${esc(Domain.apuName(w.apu))}<div class="small muted">${esc(w.dept)}</div>` },
      { k: 'auditor', h: 'Auditor', r: (w) => UI.person(w.auditor), sortv: (w) => Domain.uname(w.auditor) }, { k: 'leader', h: 'Zone Leader', r: (w) => esc(Domain.uname(w.leader)) },
      { k: 'auditType', h: 'Type' }, { k: 'plannedDate', h: 'Planned', r: (w) => fmtDate(w.plannedDate) }, { k: 'dueDate', h: 'Due', r: (w) => fmtDate(w.dueDate) },
      { k: 'priority', h: 'Priority', r: (w) => UI.badge(w.priority, w.priority === 'High' ? 'b-red' : w.priority === 'Medium' ? 'b-amber' : 'b-gray') },
      { k: 'score', h: 'Score', r: (w) => UI.score(Domain.isDone(w) && w.score ? w.score.overall.pct : null), sortv: (w) => (w.score && Domain.isDone(w) ? w.score.overall.pct : -1) },
      { k: 'status', h: 'Status', r: (w) => UI.woBadge(w) + (w.syncState ? `<div class="tiny" style="color:var(--warn)">${esc(w.syncState)}</div>` : ''), sortv: (w) => Domain.woStatus(w) }], list, { go: (w) => ['wo', w.id], sort: 'plannedDate', dir: tab === 'done' || tab === 'all' ? 'desc' : 'asc', rowCls: (w) => (Domain.woStatus(w) === 'Overdue' ? 'over' : '') }));
    return `${UI.head('Work Orders & Execution', [], `${canCreate ? `<button class="btn" data-act="wo-new">${icon('plus')}Ad-hoc audit</button>` : ''}`, 'Work orders are generated from the Audit Planner; open one to execute, review or report.')}
      ${UI.tabs('wosTab', tabs.map((t) => [t[0], t[1], t[2]]), tab)}
      ${tab !== 'mine' ? `<div class="filters"><input type="search" placeholder="Search number, zone, auditor" value="${esc(f.q)}" data-input="wos-q" aria-label="Search work orders">${UI.sel('wosF:apu', [['', 'All APUs']].concat((Domain.masters().apus || []).map((a) => [a.id, a.name])), f.apu)}${UI.sel('wosF:zone', [['', 'All zones']].concat(Domain.scopeZones().map((z) => [z.id, z.code])), f.zone)}${UI.sel('wosF:auditor', [['', 'All auditors']].concat(uniq(all.map((w) => w.auditor)).map((a) => [a, Domain.uname(a)])), f.auditor)}${UI.sel('wosF:auditType', [['', 'All types']].concat((Domain.masters().auditTypes || []).map((a) => [a, a])), f.auditType)}${UI.sel('wosF:month', [['', 'All months']].concat(months.map((m) => [m, fmtMonth(m)])), f.month)}</div>` : ''}${body}`;
  },
  mine(list) {
    const open = list.filter((w) => !Domain.isDone(w) && w.status !== 'Cancelled').sort((a, b) => a.plannedDate.localeCompare(b.plannedDate));
    const recent = list.filter((w) => Domain.isDone(w)).sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || '')).slice(0, 6);
    const off = LS.get('offline', []);
    const card = (w) => { const z = Domain.zone(w.zone) || {}; const qs = Domain.questionsOf(w); const ans = Object.values(w.responses || {}).filter((r) => r && r.v !== undefined && r.v !== null && r.v !== '').length; const st = Domain.woStatus(w);
      return `<div class="card"><div class="card-b stack"><div><div class="row between"><span class="mono small faint">${esc(w.no)}</span>${UI.woBadge(w)}</div><h3 style="font-size:19px;margin-top:4px">${esc(z.code)} · ${esc(z.name)}</h3><div class="small muted">${esc(w.auditType)} · ${esc(w.csName)} v${esc(w.csVersion)}</div></div>
        <div class="kv" style="grid-template-columns:repeat(3,minmax(0,1fr))"><div><div class="k">Planned</div><div class="v">${fmtDate(w.plannedDate)}<div class="small faint">${relDays(w.plannedDate)}</div></div></div><div><div class="k">Due</div><div class="v">${fmtDate(w.dueDate)}</div></div><div><div class="k">Zone Leader</div><div class="v">${esc(Domain.uname(w.leader))}</div></div></div>
        <div><div class="row between small"><span>${ans} of ${qs.length} questions answered</span><span>${Math.round((ans / (qs.length || 1)) * 100)}%</span></div>${UI.meter((ans / (qs.length || 1)) * 100)}</div>
        <div class="row">${w.status === 'Assigned' ? `<button class="btn" data-act="wo-accept" data-id="${w.id}">${icon('check')}Accept</button>` : ''}<button class="btn primary lg grow" data-act="exec-open" data-id="${w.id}">${icon('play')}${w.status === 'In Progress' ? 'Continue audit' : 'Start audit'}</button></div>
        <label class="check small"><input type="checkbox" data-change="wo-offline" data-id="${w.id}" ${off.includes(w.id) ? 'checked' : ''}> Keep available offline on this device</label></div></div>`; };
    return `${open.length ? `<div class="grid">${open.map((w) => `<div class="c6">${card(w)}</div>`).join('')}</div>` : UI.empty('clipboard', 'No open audits assigned to you', 'New work orders appear here when a schedule becomes due.')}
      ${recent.length ? `<h3 style="margin:24px 0 10px">Recently submitted</h3>${UI.card('', UI.table('mine-recent', [{ k: 'no', h: 'Audit no.', r: (w) => `<b class="mono">${esc(w.no)}</b>` }, { k: 'zone', h: 'Zone' }, { k: 'd', h: 'Date', r: (w) => fmtDate(Domain.auditDate(w)) }, { k: 's', h: 'Score', r: (w) => UI.score(w.score.overall.pct) }, { k: 'st', h: 'Status', r: (w) => UI.woBadge(w) }], recent, { go: (w) => ['wo', w.id], noPage: true }))}` : ''}`;
  },
};
Acts['wos-q'] = (el) => { App.st('wosF', {}).q = el.value; clearTimeout(Acts._wq); Acts._wq = setTimeout(() => { App.render(); const i = $('[data-input="wos-q"]'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 300); };

Domain.canApprove = function (wo, level) {
  const u = App.user; if (!u) return false; if (u.role === 'admin') return true;
  if (level === 'Zone Leader') return wo.leader === u.id || (Domain.zone(wo.zone) || {}).backup === u.id;
  if (level === '5S Facilitator') return u.role === 'facilitator' && (u.apus || []).includes(wo.apu);
  if (level === 'Management') return u.role === 'management';
  return false;
};
Domain.canExecute = function (wo) { const u = App.user; if (!Domain.can('Execute Audit', 'edit')) return false; if (['admin', 'facilitator'].includes(u.role)) return true; return wo.auditor === u.id || wo.backupAuditor === u.id || (u.role === 'leader' && Domain.can('Execute Audit', 'edit')); };

Pages.wo = {
  perm: 'Work Orders', perm2: 'Execute Audit',
  render(p) {
    const w = Store.get('workorders', p.id); if (!w) return UI.empty('clipboard', 'Work order not found');
    const z = Domain.zone(w.zone) || {}; const st = Domain.woStatus(w); const done = Domain.isDone(w);
    const qs = Domain.questionsOf(w); const prev = done ? Domain.prevAudit(w) : null;
    const fs = Store.all('findings').filter((f) => f.woId === w.id); const acts = Store.all('actions').filter((a) => a.woId === w.id || fs.some((f) => f.id === a.findingId));
    const u = App.user; const canMng = Domain.can('Work Orders', 'edit'); const canEx = Domain.canExecute(w);
    const curLevel = (w.approvals || []).find((a) => a.status === 'Pending');
    const btns = [];
    if (w.status === 'Assigned' && canEx) btns.push(`<button class="btn" data-act="wo-accept" data-id="${w.id}">${icon('check')}Accept</button>`);
    if (FS.WO_OPEN.includes(w.status) && canEx) btns.push(`<button class="btn primary" data-act="exec-open" data-id="${w.id}">${icon('play')}${w.status === 'In Progress' ? 'Continue audit' : 'Start audit'}</button>`);
    if (FS.WO_OPEN.includes(w.status) && canMng) btns.push(`<button class="btn" data-act="wo-reassign" data-id="${w.id}">${icon('users')}Reassign</button><button class="btn danger" data-act="wo-cancel" data-id="${w.id}">${icon('x')}Cancel</button>`);
    if (done) btns.push(`<button class="btn" data-go="scorecard" data-id="${w.id}">${icon('award')}Scorecard</button><button class="btn" data-act="rep-audit-pdf" data-id="${w.id}">${icon('download')}PDF</button><button class="btn" data-act="rep-audit-xlsx" data-id="${w.id}">${icon('download')}Excel</button>`);
    if (done && ['admin', 'facilitator'].includes(u.role)) btns.push(`<button class="btn" data-act="wo-reopen" data-id="${w.id}">${icon('unlock')}Reopen</button>`);
    if (w.status === 'Approved' && canMng) btns.push(`<button class="btn" data-act="wo-close" data-id="${w.id}">${icon('lock')}Close audit</button>`);
    const sevCount = (s) => fs.filter((f) => f.severity === s).length;
    const summary = done && w.score ? `<div class="grid">
      <div class="c4">${UI.card('Audit summary', `<div class="row" style="gap:18px">${UI.ring(w.score.overall.pct, 132, (Domain.band(w.score.overall.pct) || {}).label)}<div class="stack tight"><div class="small muted">Previous score</div><b class="num" style="font-size:20px">${prev ? fmtPct(prev.score.overall.pct, 1) : '—'}</b>${prev ? `<div class="small">Improvement <span class="delta ${w.score.overall.pct >= prev.score.overall.pct ? 'up' : 'down'}">${w.score.overall.pct >= prev.score.overall.pct ? '+' : ''}${round1(w.score.overall.pct - prev.score.overall.pct)} pts</span></div>` : ''}${w.originalScore && w.originalScore !== w.score.overall.pct ? `<div class="small faint">Original score ${fmtPct(w.originalScore, 1)} (before reopen)</div>` : ''}</div></div>`)}</div>
      <div class="c8">${UI.card('Score summary', `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Category</th><th class="num">Score</th><th class="num">Maximum</th><th class="num">Percentage</th><th style="width:30%"></th></tr></thead><tbody>${FS.S_KEYS.map((s) => `<tr><td>${UI.stag(s)} ${s} – ${esc(Domain.sName(s))}</td><td class="num">${w.score[s].got}</td><td class="num">${w.score[s].max}</td><td class="num"><b>${fmtPct(w.score[s].pct, 1)}</b></td><td><div class="hb-track" style="height:10px"><i style="width:${w.score[s].pct || 0}%;background:var(--${s.toLowerCase()})"></i></div></td></tr>`).join('')}<tr><td><b>Overall</b> <span class="small faint">(${Domain.settings().scoringMethod === 'weighted' ? 'weighted' : 'average of S1–S5'})</span></td><td class="num"><b>${w.score.overall.got}</b></td><td class="num"><b>${w.score.overall.max}</b></td><td class="num">${UI.score(w.score.overall.pct)}</td><td></td></tr></tbody></table></div>`)}</div>
      <div class="c12"><div class="kpis six"><div class="kpi mini"><span class="k-l">Findings</span><span class="k-v">${fs.length}</span></div>${['Critical', 'Major', 'Minor', 'Observation'].map((s) => `<div class="kpi mini"><span class="k-l">${s}</span><span class="k-v" style="color:${sevCount(s) && s === 'Critical' ? 'var(--bad)' : 'inherit'}">${sevCount(s)}</span></div>`).join('')}<div class="kpi mini"><span class="k-l">Actions open / closed / overdue</span><span class="k-v">${acts.filter((a) => Domain.isActOpen(a)).length}<small> / ${acts.filter((a) => !Domain.isActOpen(a)).length} / </small><span style="color:var(--bad)">${acts.filter((a) => Domain.actStatus(a) === 'Overdue').length}</span></span></div></div></div></div>` : '';
    const approvals = (w.approvals || []).length ? UI.card('Approval workflow', `<div class="steps">${[{ level: 'Auditor', status: done ? 'Approved' : 'Pending', by: w.auditor, at: w.submittedAt, remark: 'Submitted' }].concat(w.approvals).map((a) => `<div class="step ${a.status === 'Approved' ? 'done' : a.status === 'Rejected' ? 'bad' : a === curLevel && done ? 'cur' : ''}"><i></i><div>${esc(a.level)}</div><div class="tiny">${a.status === 'Approved' ? esc(Domain.uname(a.by)) + '<br>' + fmtDate(a.at) : esc(a.status)}</div></div>`).join('')}</div>${done && curLevel && Domain.canApprove(w, curLevel.level) ? `<div class="row" style="margin-top:14px;justify-content:flex-end"><span class="small muted grow">Waiting for your review as ${esc(curLevel.level)}.</span><button class="btn danger" data-act="wo-reject" data-id="${w.id}">Reject</button><button class="btn good" data-act="wo-approve" data-id="${w.id}">${icon('check')}Approve</button></div>` : ''}${(w.approvals || []).filter((a) => a.remark && a.status !== 'Pending').map((a) => `<div class="small" style="margin-top:6px"><b>${esc(a.level)}:</b> ${esc(a.remark)}</div>`).join('')}`, { sub: 'Configured per audit type in Master → Workflow' }) : '';
    const bySec = FS.S_KEYS.map((s) => { const qq = qs.filter((q) => q.s === s && q.active !== false); if (!qq.length) return ''; return `<div style="margin-top:14px"><div class="row" style="margin-bottom:6px">${UI.stag(s)}<h4>${esc(Domain.sName(s))}</h4>${w.score && w.score[s] ? `<span class="small muted">${w.score[s].got}/${w.score[s].max} · ${fmtPct(w.score[s].pct)}</span>` : ''}</div><div class="tbl-wrap"><table class="tbl"><thead><tr><th style="width:60px">ID</th><th>Question</th><th style="width:150px">Response</th><th>Remark / evidence</th></tr></thead><tbody>${qq.map((q) => { const r = (w.responses || {})[q.qid] || {}; const lab = Exec.respLabel(q, r.v); return `<tr><td class="mono small">${esc(q.qid)}</td><td>${esc(q.text)}</td><td>${r.v === undefined || r.v === null ? '<span class="faint">Not answered</span>' : `<span class="score" style="background:${r.v === 'NA' ? 'var(--ink-3)' : Domain.bandColor((FS.responseValue(q, r.v) / q.max) * 100)}">${r.v === 'NA' ? 'N/A' : esc(String(r.v).length > 3 ? String(r.v).slice(0, 3) : r.v)}</span> <span class="small">${esc(lab)}</span>`}</td><td>${esc(r.remark || '')}${UI.thumbs(r.photos)}${r.findingId ? `<div>${UI.link('finding', r.findingId, (Store.get('findings', r.findingId) || {}).no || r.findingId)}</div>` : r.finding ? '<div class="small" style="color:var(--warn)">Finding drafted</div>' : ''}</td></tr>`; }).join('')}</tbody></table></div></div>`; }).join('');
    return `${UI.head(`Audit Work Order <span class="mono" style="font-size:.72em">${esc(w.no)}</span>`, [['Work Orders', 'wos'], w.no], btns.join(''), `${UI.woBadge(w)} ${w.locked ? `<span class="badge b-gray plain">${icon('lock', '').replace('<svg', '<svg style="width:12px;height:12px"')} Locked</span>` : ''} ${w.syncState ? `<span class="badge b-amber">${esc(w.syncState)}</span>` : ''}`)}
      ${st === 'Overdue' ? `<div class="banner hazard">${icon('clock')}<span>This audit was due on <b>${fmtDate(w.dueDate)}</b> and has not been submitted.</span></div>` : ''}
      <div class="stack loose">
      ${UI.card('Work order', UI.kv([['Audit number', `<span class="mono">${esc(w.no)}</span>`], ['Schedule ID', `<span class="mono">${esc(w.scheduleId || 'Ad-hoc')}</span>`], ['Plant', esc(Domain.plantName(w.plant))], ['APU', esc(Domain.apuName(w.apu))], ['Department', esc(w.dept)], ['Zone', `${UI.link('zone', w.zone, w.zone)} ${esc(z.name || '')}`], ['Zone Leader', esc(Domain.uname(w.leader))], ['Auditor', esc(Domain.uname(w.auditor))], ['Backup auditor', esc(Domain.uname(w.backupAuditor))], ['Checksheet', `${esc(w.csName)} <span class="faint">v${esc(w.csVersion)}</span>`], ['Audit type', esc(w.auditType)], ['Planned date', fmtDate(w.plannedDate) + (w.plannedTime ? ' ' + esc(w.plannedTime) : '')], ['Due date', fmtDate(w.dueDate)], ['Priority', esc(w.priority)], ['Created', fmtDT(w.createdAt)], ['Created by', esc(Domain.uname(w.createdBy))], ['Audit start', fmtDT(w.startedAt)], ['Audit end', fmtDT(w.endedAt)], ['Duration', w.duration ? w.duration + ' min' : '']]))}
      ${summary}${approvals}
      ${(w.reopens || []).length ? UI.card('Reopen history', (w.reopens || []).map((r) => `<div class="row top" style="padding:6px 0;border-bottom:1px solid var(--line-2)">${UI.av(r.by, 'sm')}<div><b>${esc(Domain.uname(r.by))}</b> reopened on ${fmtDT(r.at)}${r.prevScore ? ` · score before reopen ${fmtPct(r.prevScore, 1)}` : ''}<div class="small muted">${esc(r.reason)}</div></div></div>`).join('')) : ''}
      ${UI.card('Checksheet & responses', bySec || UI.empty('clipboard', 'Checksheet not found'), { sub: `${esc(w.csName)} v${esc(w.csVersion)} – the version used at the time of audit` })}
      <div class="grid"><div class="c6">${UI.card('Findings', UI.table('wof-' + w.id, [{ k: 'no', h: 'Finding', r: (f) => `<b class="mono">${esc(f.no)}</b><div class="small muted">${esc(f.desc)}</div>` }, { k: 'severity', h: 'Severity', r: (f) => UI.sev(f.severity) }, { k: 'responsible', h: 'Responsible', r: (f) => esc(Domain.uname(f.responsible)) }, { k: 'st', h: 'Status', r: (f) => UI.fBadge(f) }], fs, { go: (f) => ['finding', f.id], noPage: true, empty: UI.empty('check', 'No findings recorded') }))}</div>
      <div class="c6">${UI.card('Corrective actions', UI.table('woa-' + w.id, [{ k: 'no', h: 'Action', r: (a) => `<b class="mono">${esc(a.no)}</b><div class="small muted">${esc(a.desc)}</div>` }, { k: 'responsible', h: 'Responsible', r: (a) => esc(Domain.uname(a.responsible)) }, { k: 'target', h: 'Target', r: (a) => fmtDate(a.revisedTarget || a.target) }, { k: 'st', h: 'Status', r: (a) => UI.actBadge(a) }], acts, { go: (a) => ['action', a.id], noPage: true, empty: UI.empty('wrench', 'No actions yet') }))}</div></div>
      ${UI.card('History', `<div class="tl">${(w.history || []).slice().reverse().map((h) => `<div class="tl-i"><span class="tl-dot"></span><div><div class="t"><b>${esc(h.status)}</b>${h.note ? ' – ' + esc(h.note) : ''}</div><div class="w">${fmtDT(h.at)} · ${esc(Domain.uname(h.by))}</div></div></div>`).join('')}</div>`)}
      </div>`;
  },
};

Object.assign(Acts, {
  async 'wo-accept'(el) { const w = Store.get('workorders', el.dataset.id); await Store.patch('workorders', w.id, { status: 'Accepted', acceptedAt: nowISO(), history: (w.history || []).concat([{ at: nowISO(), by: App.user.id, status: 'Accepted' }]) }); Domain.log('Work Orders', w.no, 'Audit accepted', w.status, 'Accepted'); UI.toast('Audit accepted', 'good'); },
  'wo-offline'(el) { let o = LS.get('offline', []); o = el.checked ? uniq(o.concat(el.dataset.id)) : o.filter((x) => x !== el.dataset.id); LS.set('offline', o); Store._persist(); UI.toast(el.checked ? 'Saved for offline use. You can execute this audit without a connection.' : 'Removed from offline list'); },
  'wo-reassign'(el) {
    const w = Store.get('workorders', el.dataset.id); const opts = UI.userOpts((u) => ['auditor', 'facilitator', 'admin', 'management'].includes(u.role));
    const fields = [{ name: 'auditor', label: 'Auditor', type: 'select', options: opts, required: true, full: true }, { name: 'backupAuditor', label: 'Backup auditor', type: 'select', options: opts, full: true }, { name: 'plannedDate', label: 'Planned date', type: 'date', required: true }, { name: 'dueDate', label: 'Due date', type: 'date', required: true, validate: (v, o) => (v < o.plannedDate ? 'Due date cannot be before the planned date' : '') }, { name: 'reason', label: 'Reason', full: true, required: true }];
    UI.modal({ title: 'Reassign work order', sub: w.no, body: UI.form(fields, w), actions: [{ label: 'Cancel' }, { label: 'Save', cls: 'primary', onClick: async (m) => { const v = UI.readForm(m, fields); if (!v) return false; await Store.patch('workorders', w.id, { auditor: v.auditor, backupAuditor: v.backupAuditor, plannedDate: v.plannedDate, dueDate: v.dueDate, history: (w.history || []).concat([{ at: nowISO(), by: App.user.id, status: w.status, note: `Reassigned: ${v.reason}` }]) }); if (v.auditor !== w.auditor) { Domain.notify('Audit assigned', 'Audit assigned: ' + w.no, `Zone ${w.zone}, planned ${fmtDate(v.plannedDate)}`, [v.auditor], { page: 'wo', id: w.id }); Domain.log('Work Orders', w.no, 'Auditor assigned', w.auditor, v.auditor); } if (v.plannedDate !== w.plannedDate) Domain.log('Work Orders', w.no, 'Audit date changed', w.plannedDate, v.plannedDate); UI.toast('Work order updated', 'good'); } }] });
  },
  'wo-cancel'(el) {
    const w = Store.get('workorders', el.dataset.id); const fields = [{ name: 'reason', label: 'Cancellation reason', type: 'textarea', required: true, full: true }];
    UI.modal({ title: 'Cancel work order', sub: w.no, body: UI.form(fields), actions: [{ label: 'Keep' }, { label: 'Cancel work order', cls: 'danger solid', onClick: async (m) => { const v = UI.readForm(m, fields); if (!v) return false; await Store.patch('workorders', w.id, { status: 'Cancelled', cancelReason: v.reason, history: (w.history || []).concat([{ at: nowISO(), by: App.user.id, status: 'Cancelled', note: v.reason }]) }); Domain.log('Work Orders', w.no, 'Work order cancelled', w.status, v.reason); } }] });
  },
  'wo-approve'(el) {
    const w = Store.get('workorders', el.dataset.id); const fields = [{ name: 'remark', label: 'Review remark', type: 'textarea', full: true }];
    UI.modal({ title: 'Approve audit', sub: `${w.no} · ${fmtPct(w.score.overall.pct, 1)}`, body: UI.form(fields), actions: [{ label: 'Cancel' }, { label: 'Approve', cls: 'good', onClick: async (m) => {
      const v = UI.readForm(m, fields); const ap = clone(w.approvals); const i = ap.findIndex((a) => a.status === 'Pending'); ap[i] = Object.assign(ap[i], { status: 'Approved', by: App.user.id, at: nowISO(), remark: v.remark || 'Approved' });
      const last = ap.every((a) => a.status === 'Approved'); const ns = last ? 'Approved' : 'Under Review';
      await Store.patch('workorders', w.id, { approvals: ap, status: ns, history: (w.history || []).concat([{ at: nowISO(), by: App.user.id, status: ns, note: `${ap[i].level} approved${v.remark ? ': ' + v.remark : ''}` }]) });
      Domain.log('Work Orders', w.no, 'Audit approved (' + ap[i].level + ')', w.status, ns); UI.toast(last ? 'Audit approved and locked' : 'Approved – sent to the next level', 'good'); } }] });
  },
  'wo-reject'(el) {
    const w = Store.get('workorders', el.dataset.id); const fields = [{ name: 'remark', label: 'Reason for rejection', type: 'textarea', required: true, full: true }];
    UI.modal({ title: 'Reject audit', sub: 'The audit goes back to the auditor for correction.', body: UI.form(fields), actions: [{ label: 'Cancel' }, { label: 'Reject audit', cls: 'danger solid', onClick: async (m) => { const v = UI.readForm(m, fields); if (!v) return false; const ap = clone(w.approvals); const i = ap.findIndex((a) => a.status === 'Pending'); ap[i] = Object.assign(ap[i], { status: 'Rejected', by: App.user.id, at: nowISO(), remark: v.remark }); await Store.patch('workorders', w.id, { approvals: ap.map((a) => Object.assign(a, a.status === 'Rejected' ? {} : {})), status: 'In Progress', locked: false, history: (w.history || []).concat([{ at: nowISO(), by: App.user.id, status: 'Rejected', note: v.remark }]) }); Domain.notify('Audit rejected', 'Audit returned for correction: ' + w.no, v.remark, [w.auditor], { page: 'wo', id: w.id }); Domain.log('Work Orders', w.no, 'Audit rejected', w.status, v.remark); } }] });
  },
  async 'wo-close'(el) { const w = Store.get('workorders', el.dataset.id); const fs = Store.all('findings').filter((f) => f.woId === w.id && Domain.findSt(f) !== 'Closed'); if (fs.length && !(await UI.confirm('Close audit?', `${fs.length} finding(s) are still open. Their actions stay tracked in the Corrective Action Register. Close the audit anyway?`, 'Close audit'))) return; await Store.patch('workorders', w.id, { status: 'Closed', closedAt: nowISO(), history: (w.history || []).concat([{ at: nowISO(), by: App.user.id, status: 'Closed' }]) }); Domain.log('Work Orders', w.no, 'Audit closed', w.status, 'Closed'); },
  'wo-reopen'(el) {
    const w = Store.get('workorders', el.dataset.id); const fields = [{ name: 'reason', label: 'Reason for reopening', type: 'textarea', required: true, full: true, help: 'Recorded in the audit history and the audit trail. The original score is preserved.' }];
    UI.modal({ title: 'Reopen audit', sub: w.no, body: UI.form(fields), actions: [{ label: 'Cancel' }, { label: 'Reopen audit', cls: 'danger solid', onClick: async (m) => { const v = UI.readForm(m, fields); if (!v) return false; await Store.patch('workorders', w.id, { status: 'In Progress', locked: false, originalScore: w.originalScore || w.score.overall.pct, reopens: (w.reopens || []).concat([{ by: App.user.id, at: nowISO(), reason: v.reason, prevScore: w.score.overall.pct, prevStatus: w.status, prevResponses: w.responses }]), approvals: (w.approvals || []).map((a) => ({ level: a.level, status: 'Pending' })), history: (w.history || []).concat([{ at: nowISO(), by: App.user.id, status: 'Reopened', note: v.reason }]) }); Domain.log('Work Orders', w.no, 'Audit reopened', w.status, v.reason); Domain.notify('Audit rejected', 'Audit reopened for correction: ' + w.no, v.reason, [w.auditor], { page: 'wo', id: w.id }); } }] });
  },
  'wo-new'() {
    const ms = Domain.masters(); const fams = uniq(Store.all('checksheets').map((c) => c.family)).map((f) => { const c = Domain.activeChecksheet(f); return c ? [f, `${c.name} (v${c.version})`] : null; }).filter(Boolean);
    const fields = [{ name: 'zone', label: 'Zone', type: 'select', options: UI.zoneOpts(), required: true }, { name: 'checksheet', label: 'Checksheet', type: 'select', options: fams, required: true }, { name: 'auditType', label: 'Audit type', type: 'select', options: ms.auditTypes, required: true, value: 'Surprise Audit' }, { name: 'priority', label: 'Priority', type: 'select', options: ms.priorities, required: true, value: 'High' }, { name: 'plannedDate', label: 'Planned date', type: 'date', required: true, value: Domain.today }, { name: 'dueDate', label: 'Due date', type: 'date', required: true, value: FS.addDays(Domain.today, 2), validate: (v, o) => (v < o.plannedDate ? 'Due date cannot be before the planned date' : '') }, { name: 'auditor', label: 'Auditor', type: 'select', options: UI.userOpts((u) => ['auditor', 'facilitator', 'admin', 'management'].includes(u.role)), required: true }, { name: 'plannedTime', label: 'Planned time', type: 'time' }];
    UI.modal({ title: 'Create ad-hoc audit work order', size: 'wide', body: UI.form(fields), onMount: (m) => $('[name=zone]', m).addEventListener('change', (e) => { const z = Domain.zone(e.target.value); if (z) $('[name=checksheet]', m).value = z.checksheet; }), actions: [{ label: 'Cancel' }, { label: 'Create work order', cls: 'primary', onClick: async (m) => {
      const v = UI.readForm(m, fields); if (!v) return false; const z = Domain.zone(v.zone); const cs = Domain.activeChecksheet(v.checksheet); const st = Domain.settings(); const num = await Store.nextNo('AUD');
      await Store.put('workorders', num.id, { no: num.no, scheduleId: '', zone: z.id, plant: z.plant, apu: z.apu, dept: z.dept, leader: z.leader, auditor: v.auditor, backupAuditor: '', checksheetId: cs.id, csName: cs.name, csVersion: cs.version, auditType: v.auditType, plannedDate: v.plannedDate, plannedTime: v.plannedTime, dueDate: v.dueDate, priority: v.priority, status: 'Assigned', createdAt: nowISO(), createdBy: App.user.id, responses: {}, score: null, approvals: ((st.approvals || {})[v.auditType] || []).map((level) => ({ level, status: 'Pending' })), locked: false, reopens: [], history: [{ at: nowISO(), by: App.user.id, status: 'Assigned', note: 'Ad-hoc work order' }] });
      Domain.notify('Audit assigned', 'Audit assigned: ' + num.no, `Zone ${z.code}, planned ${fmtDate(v.plannedDate)}`, [v.auditor], { page: 'wo', id: num.id }); Domain.log('Work Orders', num.no, 'Work order created', '', `${v.auditType} ${z.code}`);
      setTimeout(() => App.go('wo', { id: num.id }), 50); } }] });
  },
});

/* ---------- Audit execution (mobile-first) ---------- */
const Exec = {
  pending: {}, t: null, saveState: 'Saved',
  wo() { return Store.get('workorders', App.ui.execId); },
  respLabel(q, v) { if (v === undefined || v === null || v === '') return ''; if (v === 'NA') return 'Not applicable'; if ((q.rtype || 'score') === 'score') { const r = (Domain.settings().ratingScale || []).find((x) => Number(x.value) === Number(v)); return r ? r.label : String(v); } return String(v); },
  options(q) { const t = q.rtype || 'score'; if (t === 'score') { const sc = (Domain.settings().ratingScale || []).filter((r) => r.value >= (q.min ?? 1) && r.value <= (q.max ?? 5)); return sc.map((r) => [String(r.value), r.value, r.label]).concat([['NA', 'N/A', 'Not applicable']]); } return FS.BINARY[t].map((o) => [o, o, '']).concat([['NA', 'N/A', 'Not applicable']]); },
  queue(qid, part) { const id = App.ui.execId; this.pending[qid] = deepMerge(this.pending[qid] || {}, part); Store._applyOp({ op: 'update', c: 'workorders', id, doc: { responses: { [qid]: part } } }); this.setSave('Saving…'); clearTimeout(this.t); this.t = setTimeout(() => this.flush(), 900); },
  async flush() { clearTimeout(this.t); const p = this.pending; this.pending = {}; if (!Object.keys(p).length) return; const id = App.ui.execId; const ok = await Store._send({ op: 'update', c: 'workorders', id, doc: { responses: p, lastSavedAt: nowISO() } }); this.setSave(ok ? 'Saved' : navigator.onLine ? 'Saved on this device' : 'Saved offline – will sync'); },
  setSave(s) { this.saveState = s; const el = $('#exec-save'); if (el) el.textContent = s; },
  issues(w) {
    const st = Domain.settings(); const out = []; const qs = Domain.questionsOf(w).filter((q) => q.active !== false); const ad = Domain.auditDate(w) || Domain.today;
    qs.forEach((q) => { const r = (w.responses || {})[q.qid] || {}; const has = r.v !== undefined && r.v !== null && r.v !== '';
      if (q.mandatory && !has) out.push({ qid: q.qid, s: q.s, msg: 'Mandatory question not answered' });
      const val = has ? FS.responseValue(q, r.v) : null;
      const needF = has && r.v !== 'NA' && ((q.rtype || 'score') === 'score' ? val <= (st.findingThreshold ?? 2) : val === Number(q.min ?? 0)) && q.findingReq !== false;
      if (needF && !r.finding && !r.findingId) out.push({ qid: q.qid, s: q.s, msg: `Score ${r.v} needs a finding` });
      if (r.finding && !r.findingId) { if (!r.finding.desc) out.push({ qid: q.qid, s: q.s, msg: 'Finding description missing' }); if (!r.finding.severity) out.push({ qid: q.qid, s: q.s, msg: 'Finding severity missing' }); if (!r.finding.responsible) out.push({ qid: q.qid, s: q.s, msg: 'Finding responsible person missing' }); if (r.finding.due && r.finding.due < ad) out.push({ qid: q.qid, s: q.s, msg: 'Due date is before the audit date' }); if (r.finding.caRequired && !r.finding.action) out.push({ qid: q.qid, s: q.s, msg: 'Describe the corrective action or untick "Corrective action required"' }); }
      if (q.photo && has && r.v !== 'NA' && !(r.photos || []).length) out.push({ qid: q.qid, s: q.s, msg: 'Photograph required' });
      if (q.evidence && needF && !(r.photos || []).length && !r.remark) out.push({ qid: q.qid, s: q.s, msg: 'Evidence (photo or remark) required' }); });
    return out;
  },
  qcard(q, w) {
    const r = (w.responses || {})[q.qid] || {}; const st = Domain.settings(); const has = r.v !== undefined && r.v !== null && r.v !== '';
    const val = has && r.v !== 'NA' ? FS.responseValue(q, r.v) : null;
    const needF = has && r.v !== 'NA' && ((q.rtype || 'score') === 'score' ? val <= (st.findingThreshold ?? 2) : val === Number(q.min ?? 0));
    const fOpen = needF || r.finding || App.ui['fopen:' + q.qid];
    const opts = this.options(q); const bin = (q.rtype || 'score') !== 'score';
    const z = Domain.zone(w.zone) || {}; const team = uniq([z.leader, z.backup].concat(z.members || [])).filter(Boolean);
    const f = r.finding || {}; const sevs = (Domain.masters().severities || []).map((s) => s.name);
    const defSev = val === null ? 'Observation' : (q.rtype || 'score') === 'score' ? (val <= 1 ? 'Major' : val <= 2 ? 'Minor' : 'Observation') : 'Minor';
    const issues = App.ui.execShowIssues ? this.issues(w).filter((i) => i.qid === q.qid) : [];
    return `<div class="qcard ${issues.length ? 'need' : ''}" id="q-${q.qid}" data-qid="${q.qid}">
      <div class="qmeta">${UI.stag(q.s)}<span class="mono">${esc(q.qid)}</span><span>${esc(q.sub || '')}</span>${q.mandatory ? '<span class="badge b-gray plain">Mandatory</span>' : '<span class="badge b-outline plain">Optional</span>'}${q.photo ? `<span class="badge b-amber plain">Photo required</span>` : ''}${q.weight && q.weight !== 1 ? `<span class="badge b-gray plain">Weight ${q.weight}</span>` : ''}</div>
      <div class="qtext">${esc(q.text)}</div>${q.guidance ? `<div class="small muted">${icon('eye').replace('<svg', '<svg style="width:13px;height:13px;vertical-align:-2px"')} ${esc(q.guidance)}</div>` : ''}
      <div class="rate ${bin ? 'bin' : ''}" role="radiogroup" aria-label="Response">${opts.map(([v, big, lab]) => { const on = String(r.v) === v; const col = v === 'NA' ? 'var(--ink-3)' : Domain.bandColor(((bin ? FS.responseValue(q, v) : Number(v)) / (q.max || 5)) * 100); return `<button role="radio" aria-checked="${on}" class="${on ? 'on' : ''}" style="${on ? 'background:' + col : ''}" data-act="ex-rate" data-qid="${q.qid}" data-v="${esc(v)}"><b>${esc(big)}</b><span>${esc(lab)}</span></button>`; }).join('')}</div>
      <div class="field"><label for="rm-${q.qid}">Auditor remark</label><textarea id="rm-${q.qid}" rows="2" data-input="ex-remark" data-qid="${q.qid}" placeholder="What did you observe?">${esc(r.remark || '')}</textarea></div>
      <div class="stack tight">${UI.thumbs(r.photos, { remove: 'ex-photo-del', k: q.qid })}<div class="qtools"><button class="btn" data-act="ex-photo" data-qid="${q.qid}" data-cap="1">${icon('camera')}Take photo</button><button class="btn" data-act="ex-photo" data-qid="${q.qid}">${icon('upload')}Upload</button>${!fOpen ? `<button class="btn" data-act="ex-fopen" data-qid="${q.qid}">${icon('flag')}Add finding</button>` : ''}</div></div>
      ${issues.length ? `<div class="small" style="color:var(--bad)">${issues.map((i) => esc(i.msg)).join(' · ')}</div>` : ''}
      ${fOpen ? `<div class="findbox stack" data-fbox="${q.qid}"><div class="row between"><b>${icon('flag').replace('<svg', '<svg style="width:15px;height:15px;vertical-align:-2px;color:var(--bad)"')} Finding ${needF ? '<span class="small muted">(required for this score)</span>' : ''}</b>${!needF ? `<button class="btn sm ghost" data-act="ex-fremove" data-qid="${q.qid}">Remove</button>` : ''}</div>${r.findingId ? `<div class="small">Recorded as ${UI.link('finding', r.findingId, (Store.get('findings', r.findingId) || {}).no || r.findingId)}</div>` : `
        <div class="form">${UI.field({ name: 'desc', label: 'Finding description', type: 'textarea', required: true, full: true, ph: 'Describe the non-conformity' }, f.desc || '')}
        ${UI.field({ name: 'severity', label: 'Severity', type: 'select', options: sevs, required: true }, f.severity || defSev)}
        ${UI.field({ name: 'category', label: 'Finding category', type: 'select', options: Domain.masters().findingCategories || [] }, f.category || '')}
        ${UI.field({ name: 'responsible', label: 'Responsible person', type: 'select', options: team.map((id) => [id, Domain.uname(id) + (id === z.leader ? ' (Zone Leader)' : '')]), required: true }, f.responsible || z.leader)}
        ${UI.field({ name: 'due', label: 'Due date', type: 'date', required: true, help: 'From the NC Closure Timeline for the severity' }, f.due || FS.addDays(Domain.today, (st.ncClosure || {})[f.severity || defSev] || 15))}
        ${UI.field({ name: 'immediate', label: 'Immediate action taken', full: true }, f.immediate || '')}
        ${UI.field({ name: 'caRequired', label: 'Corrective action required', type: 'checkbox' }, f.caRequired !== undefined ? f.caRequired : true)}
        ${UI.field({ name: 'action', label: 'Corrective action (assigned on submit)', ph: 'e.g. Relabel bins with laminated labels' }, f.action || '')}</div>`}</div>` : ''}
    </div>`;
  },
};
Pages.exec = {
  live: false,
  render(p) {
    const w = Store.get('workorders', p.id); if (!w) return UI.empty('clipboard', 'Work order not found');
    if (Domain.isDone(w)) return `${UI.empty('lock', 'This audit has been submitted and is locked.', 'Ask a 5S Facilitator to reopen it if a correction is needed.', `<button class="btn primary" data-go="wo" data-id="${w.id}">Open audit summary</button>`)}`;
    if (!Domain.canExecute(w)) return UI.empty('lock', 'Only the assigned auditor can execute this audit.');
    App.ui.execId = w.id;
    const qs = Domain.questionsOf(w).filter((q) => q.active !== false); const z = Domain.zone(w.zone) || {};
    const sKeys = FS.S_KEYS.filter((s) => qs.some((q) => q.s === s));
    const cur = App.ui.execS && sKeys.includes(App.ui.execS) ? App.ui.execS : sKeys[0]; App.ui.execS = cur;
    const score = FS.scoreAudit(qs, w.responses, Domain.settings());
    const idx = sKeys.indexOf(cur);
    return `<div class="exec"><div class="exec-head" id="exec-head">${this.head(w, z, qs, score, sKeys, cur)}</div>
      <div class="stack" id="exec-qs">${qs.filter((q) => q.s === cur).map((q) => Exec.qcard(q, w)).join('')}</div>
      <div class="exec-foot"><button class="btn" data-act="ex-s" data-v="${sKeys[idx - 1] || ''}" ${idx === 0 ? 'disabled' : ''}>${icon('left')}${idx > 0 ? sKeys[idx - 1] : 'Back'}</button>${idx < sKeys.length - 1 ? `<button class="btn primary" data-act="ex-s" data-v="${sKeys[idx + 1]}">Next: ${sKeys[idx + 1]} ${esc(Domain.sName(sKeys[idx + 1]))}${icon('right')}</button>` : `<button class="btn primary" data-act="ex-review">${icon('send')}Review & submit</button>`}</div></div>`;
  },
  head(w, z, qs, score, sKeys, cur) {
    const ans = (s) => qs.filter((q) => q.s === s && (w.responses || {})[q.qid] && (w.responses || {})[q.qid].v !== undefined && (w.responses || {})[q.qid].v !== null).length;
    return `<div class="exec-bar"><button class="iconbtn" data-go="wo" data-id="${w.id}" aria-label="Back to work order">${icon('left')}</button><div class="grow"><div class="mono tiny faint">${esc(w.no)} · ${esc(w.auditType)} · ${esc(w.csName)} v${esc(w.csVersion)}</div><b style="font-family:var(--f-display);font-size:17px">${esc(z.code)} · ${esc(z.name)}</b><div class="tiny muted">Auditor ${esc(Domain.uname(w.auditor))} · Leader ${esc(Domain.uname(w.leader))} · ${fmtDate(Domain.today)}</div></div><div class="stack tight" style="align-items:flex-end">${UI.score(score.overall.pct)}<span class="tiny faint" id="exec-save">${esc(Exec.saveState)}</span></div></div>
      <div class="s-tabs">${sKeys.map((s, i) => { const n = qs.filter((q) => q.s === s).length; const a = ans(s); return `<button class="s-tab ${s === cur ? 'on' : ''}" data-act="ex-s" data-v="${s}"><b style="color:var(--s${i + 1})">${s}</b><span>${a}/${n} · ${score[s].pct === null ? '—' : Math.round(score[s].pct) + '%'}</span><span class="prog"><i style="width:${(a / n) * 100}%;background:var(--s${i + 1})"></i></span></button>`; }).join('')}</div>`;
  },
  mount() {
    const w = Exec.wo(); if (!w || Domain.isDone(w)) return;
    if (['Assigned', 'Accepted', 'Draft'].includes(w.status)) { Store.patch('workorders', w.id, { status: 'In Progress', startedAt: w.startedAt || nowISO(), resumedAt: nowISO(), history: (w.history || []).concat([{ at: nowISO(), by: App.user.id, status: 'In Progress', note: 'Audit started' }]) }); Domain.log('Work Orders', w.no, 'Audit started', w.status, 'In Progress'); }
    else { const part = { resumedAt: nowISO() }; if (!w.startedAt) part.startedAt = nowISO(); if (w.resumedAt && w.lastSavedAt && w.lastSavedAt > w.resumedAt) part.activeMin = (w.activeMin || 0) + Math.round((new Date(w.lastSavedAt) - new Date(w.resumedAt)) / 60000); Store.patch('workorders', w.id, part); }
    $$('[data-fbox]').forEach(Pages.exec.wireF);
    if (App.ui.execJump) { const el = $('#q-' + App.ui.execJump); App.ui.execJump = null; if (el) el.scrollIntoView({ block: 'start' }); }
  },
  wireF(box) {
    const qid = box.dataset.fbox; let dueTouched = false;
    box.addEventListener('input', (e) => { const n = e.target.name; if (!n) return; if (n === 'due') dueTouched = true; Exec.queue(qid, { finding: { [n]: e.target.type === 'checkbox' ? e.target.checked : e.target.value } }); });
    box.addEventListener('change', (e) => { const n = e.target.name; if (!n) return; Exec.queue(qid, { finding: { [n]: e.target.type === 'checkbox' ? e.target.checked : e.target.value } }); if (n === 'severity' && !dueTouched) { const d = FS.addDays(Domain.today, (Domain.settings().ncClosure || {})[e.target.value] || 15); const di = $('[name=due]', box); if (di) { di.value = d; Exec.queue(qid, { finding: { due: d } }); } } });
    const w = Exec.wo(); const r = (w.responses || {})[qid] || {};
    if (!r.finding && !r.findingId) { const vals = {}; $$('input,select,textarea', box).forEach((i) => { if (i.name) vals[i.name] = i.type === 'checkbox' ? i.checked : i.value; }); Exec.queue(qid, { finding: vals }); }
  },
  refreshQ(qid) {
    const w = Exec.wo(); const q = Domain.questionsOf(w).find((x) => x.qid === qid); const el = $('#q-' + qid); if (!el || !q) return;
    el.outerHTML = Exec.qcard(q, w); const box = $(`[data-fbox="${qid}"]`); if (box) Pages.exec.wireF(box);
    const qs = Domain.questionsOf(w).filter((x) => x.active !== false); const sKeys = FS.S_KEYS.filter((s) => qs.some((x) => x.s === s));
    $('#exec-head').innerHTML = this.head(w, Domain.zone(w.zone) || {}, qs, FS.scoreAudit(qs, w.responses, Domain.settings()), sKeys, App.ui.execS);
  },
};
Object.assign(Acts, {
  'exec-open'(el) { App.ui.execS = null; App.ui.execShowIssues = false; App.go('exec', { id: el.dataset.id }); },
  async 'ex-s'(el) { if (!el.dataset.v) return; await Exec.flush(); App.ui.execS = el.dataset.v; App.render(); window.scrollTo(0, 0); },
  'ex-rate'(el) { const qid = el.dataset.qid; const w = Exec.wo(); const r = (w.responses || {})[qid] || {}; const v = el.dataset.v === 'NA' ? 'NA' : isNaN(Number(el.dataset.v)) ? el.dataset.v : Number(el.dataset.v); if (String(r.v) === String(v)) return; Exec.queue(qid, { v, at: nowISO(), by: App.user.id }); Pages.exec.refreshQ(qid); },
  'ex-remark'(el) { Exec.queue(el.dataset.qid, { remark: el.value }); },
  async 'ex-photo'(el) { const qid = el.dataset.qid; const w = Exec.wo(); const refs = await UI.capture({ woId: w.id, qid, zone: w.zone, kind: 'audit' }, { capture: !!el.dataset.cap, annotate: !!App.ui.annotate }); if (!refs.length) return; const r = (Exec.wo().responses || {})[qid] || {}; Exec.queue(qid, { photos: (r.photos || []).concat(refs) }); Pages.exec.refreshQ(qid); UI.toast(`${refs.length} photo${refs.length > 1 ? 's' : ''} added`, 'good'); },
  async 'ex-photo-del'(el, e) { e.stopPropagation(); const qid = el.dataset.k; const r = (Exec.wo().responses || {})[qid] || {}; const ph = (r.photos || []).slice(); ph.splice(Number(el.dataset.i), 1); Exec.queue(qid, { photos: ph }); Pages.exec.refreshQ(qid); },
  'ex-fopen'(el) { App.ui['fopen:' + el.dataset.qid] = true; Pages.exec.refreshQ(el.dataset.qid); },
  'ex-fremove'(el) { App.ui['fopen:' + el.dataset.qid] = false; Exec.queue(el.dataset.qid, { finding: null }); Pages.exec.refreshQ(el.dataset.qid); },
  async 'ex-review'() {
    await Exec.flush(); const w = Exec.wo(); const qs = Domain.questionsOf(w).filter((q) => q.active !== false); const sc = FS.scoreAudit(qs, w.responses, Domain.settings()); const issues = Exec.issues(w);
    const drafted = qs.filter((q) => ((w.responses || {})[q.qid] || {}).finding).length;
    UI.modal({ title: 'Review & submit audit', sub: `${w.no} · ${w.zone}`, size: 'wide', body: `<div class="row" style="gap:20px;align-items:center;margin-bottom:14px">${UI.ring(sc.overall.pct, 120, (Domain.band(sc.overall.pct) || {}).label || '')}<div class="grow">${UI.sBoxes(sc)}</div></div>
      <div class="kv" style="margin-bottom:12px"><div><div class="k">Answered</div><div class="v">${sc.progress.answered} / ${sc.progress.total}</div></div><div><div class="k">Findings to create</div><div class="v">${drafted}</div></div><div><div class="k">Photos</div><div class="v">${sum(Object.values(w.responses || {}).map((r) => (r && r.photos ? r.photos.length : 0)))}</div></div><div><div class="k">Connection</div><div class="v">${navigator.onLine ? 'Online' : 'Offline – will be queued'}</div></div></div>
      ${issues.length ? `<div class="banner warn" style="display:block"><b>${issues.length} item${issues.length > 1 ? 's' : ''} must be fixed before submitting</b><div class="stack tight" style="margin-top:8px">${issues.map((i) => `<a data-act="ex-jump" data-qid="${i.qid}" data-s="${i.s}" style="cursor:pointer">${UI.stag(i.s)} <span class="mono">${i.qid}</span> – ${esc(i.msg)}</a>`).join('')}</div></div>` : `<div class="banner info">${icon('check')}All checks passed. After submission the responses are locked and the audit goes to ${(((Domain.settings().approvals || {})[w.auditType]) || []).join(' → ') || 'approval'}.</div>`}`,
      actions: [{ label: 'Keep editing' }, { label: navigator.onLine ? 'Submit audit' : 'Queue submission', cls: 'primary', icon: 'send', onClick: async (m) => {
        if (Exec.issues(Exec.wo()).length) { App.ui.execShowIssues = true; UI.toast('Fix the highlighted items first', 'bad'); return false; }
        const btn = $('[data-mi="1"]', m.parentElement); if (btn) btn.textContent = 'Submitting…';
        const r = await Domain.submitAudit(w.id);
        if (r && r.queued) UI.toast('You are offline. The submission is queued and will sync automatically.', 'good'); else UI.toast(`Audit submitted – ${fmtPct(r && r.score ? r.score.overall.pct : null, 1)}`, 'good');
        setTimeout(() => App.go('wo', { id: w.id }, { replace: true }), 30);
      } }] });
  },
  'ex-jump'(el) { UI.closeModal(); App.ui.execShowIssues = true; App.ui.execS = el.dataset.s; App.ui.execJump = el.dataset.qid; App.render(); },
});

/* ---------- Scorecard ---------- */
Pages.scorecard = {
  perm: 'Work Orders', perm2: 'Execute Audit',
  render(p) {
    const w = Store.get('workorders', p.id); if (!w || !w.score) return UI.empty('award', 'Scorecard is available after the audit is submitted');
    const z = Domain.zone(w.zone) || {}; const fs = Store.all('findings').filter((f) => f.woId === w.id); const acts = Store.all('actions').filter((a) => fs.some((f) => f.id === a.findingId)); const b = Domain.band(w.score.overall.pct) || {}; const st = Domain.settings();
    const sign = (lvl, id, at) => `<div>${id ? `<b style="color:var(--ink)">${esc(Domain.uname(id))}</b><span>${at ? 'Signed ' + fmtDate(at) : ''}</span>` : '<span class="faint">Pending</span>'}<span>${esc(lvl)}</span></div>`;
    const ap = (lvl) => (w.approvals || []).find((a) => a.level === lvl && a.status === 'Approved');
    return `${UI.head('5S Audit Scorecard', [['Work Orders', 'wos'], [w.no, 'wo', w.id], 'Scorecard'], `<button class="btn primary" data-act="rep-score-pdf" data-id="${w.id}">${icon('download')}Download PDF</button>`)}
      <div class="scorecard"><div class="sc-head"><div><div class="eyebrow" style="color:var(--nav-ink-2)">${esc(st.reportHeader || '5S MANAGEMENT SYSTEM')}</div><h2 style="color:#fff;font-size:22px">5S AUDIT SCORECARD</h2><div class="small" style="color:var(--nav-ink)">${esc(w.no)}</div></div><div class="brand-mark" style="width:52px;height:52px;font-size:22px">5S</div></div>
      <div class="sc-body"><div class="kv"><div><div class="k">Zone</div><div class="v">${esc(z.code)} · ${esc(z.name)}</div></div><div><div class="k">Department</div><div class="v">${esc(w.dept)}</div></div><div><div class="k">APU / Plant</div><div class="v">${esc(Domain.apuName(w.apu))} · ${esc(Domain.plantName(w.plant))}</div></div><div><div class="k">Audit date</div><div class="v">${fmtDate(Domain.auditDate(w))}</div></div><div><div class="k">Auditor</div><div class="v">${esc(Domain.uname(w.auditor))}</div></div><div><div class="k">Audit type</div><div class="v">${esc(w.auditType)}</div></div></div>
      <div class="row" style="gap:24px;padding:10px 0;border-top:1px solid var(--line-2);border-bottom:1px solid var(--line-2)">${UI.ring(w.score.overall.pct, 140, 'Overall')}<div><div class="eyebrow">Overall score</div><div style="font:600 34px var(--f-display);color:${b.color}">${fmtPct(w.score.overall.pct)} – ${esc((b.label || '').toUpperCase())}</div><div class="stack tight" style="margin-top:8px">${FS.S_KEYS.map((s) => `<div class="row" style="gap:8px">${UI.stag(s)}<span style="width:110px">${esc(Domain.sName(s))}</span><div class="hb-track" style="width:160px;height:10px"><i style="width:${w.score[s].pct || 0}%;background:var(--${s.toLowerCase()})"></i></div><b class="num">${fmtPct(w.score[s].pct)}</b></div>`).join('')}</div></div></div>
      <div class="grid" style="gap:12px"><div class="c6"><div class="eyebrow" style="margin-bottom:6px">Findings: ${fs.length}</div>${['Critical', 'Major', 'Minor', 'Observation', 'Improvement Opportunity'].map((s) => `<div class="row between small" style="padding:2px 0">${UI.sev(s)}<b>${fs.filter((f) => f.severity === s).length}</b></div>`).join('')}</div><div class="c6"><div class="eyebrow" style="margin-bottom:6px">Actions</div><div class="row between small"><span>Open</span><b>${acts.filter((a) => Domain.isActOpen(a)).length}</b></div><div class="row between small"><span>Closed</span><b>${acts.filter((a) => !Domain.isActOpen(a)).length}</b></div><div class="row between small"><span>Overdue</span><b style="color:var(--bad)">${acts.filter((a) => Domain.actStatus(a) === 'Overdue').length}</b></div></div></div>
      <div class="eyebrow">Approval / sign-off</div><div class="sc-sign">${sign('Auditor', w.auditor, w.submittedAt)}${sign('Zone Leader', (ap('Zone Leader') || {}).by || '', (ap('Zone Leader') || {}).at)}${sign('5S Facilitator', (ap('5S Facilitator') || {}).by || '', (ap('5S Facilitator') || {}).at)}</div></div></div>`;
  },
};
