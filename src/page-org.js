/* ===== 5S Organization chart, Zone profile, Audit Planner ===== */
Pages.org = {
  perm: '5S Organization',
  render() {
    const ms = Domain.masters(); const zones = Domain.scopeZones().filter((z) => z.status === 'Active');
    const apus = (ms.apus || []).filter((a) => zones.some((z) => z.apu === a.id));
    const cur = App.ui.orgApu || 'all'; const q = (App.ui.orgQ || '').toLowerCase();
    const shown = apus.filter((a) => cur === 'all' || a.id === cur);
    const zcard = (z) => {
      const w = Domain.latestAudit(z.id); const oa = Domain.zoneOpenActions(z.id); const od = oa.filter((a) => Domain.actStatus(a) === 'Overdue').length; const nx = Domain.nextAudit(z.id);
      return `<button class="zcard" data-go="zone" data-id="${z.id}"><div class="zc-top"><div><div class="zc-code">${esc(z.code)} · ${esc(z.type)}</div><div class="zc-name">${esc(z.name)}</div></div>${UI.score(w ? w.score.overall.pct : null)}</div>
        <dl><dt>Department</dt><dd>${esc(z.dept)}${z.section ? ' · ' + esc(z.section) : ''}</dd><dt>Zone Leader</dt><dd>${UI.person(z.leader)}</dd><dt>Backup</dt><dd>${esc(Domain.uname(z.backup))}</dd><dt>Members</dt><dd><span class="avs">${(z.members || []).slice(0, 5).map((m) => UI.av(m, 'sm')).join('')}</span> <span class="small muted">${(z.members || []).length}</span></dd></dl>
        <div class="zc-foot"><span>Last <b>${w ? fmtDate(Domain.auditDate(w)) : '—'}</b></span><span>Next <b>${nx ? fmtDate(nx) : '—'}</b></span><span class="${od ? '' : ''}" style="color:${od ? 'var(--bad)' : 'inherit'}">${oa.length} open${od ? ` (${od} late)` : ''}</span></div></button>`;
    };
    const matches = (z) => !q || [z.code, z.name, z.dept, Domain.uname(z.leader), ...(z.members || []).map((m) => Domain.uname(m))].join(' ').toLowerCase().includes(q);
    return `${UI.head('5S Organization', [], Domain.can('Master', 'edit') ? `<button class="btn" data-go="master" data-id='${JSON.stringify({ tab: 'zones' })}'>${icon('zone')}Manage zones</button>` : '', 'APU → 5S Facilitator → Zone Leader → Zone Members')}
      <div class="filters">${UI.seg('orgApu', [['all', 'All APUs']].concat(apus.map((a) => [a.id, a.name])), cur)}<input type="search" placeholder="Find zone or person…" value="${esc(App.ui.orgQ || '')}" data-input="org-q" style="max-width:240px" aria-label="Find zone or person"></div>
      <div class="org-node apu" style="display:inline-flex;margin-bottom:18px"><div class="brand-mark" style="width:32px;height:32px;font-size:14px">5S</div><div><div class="eyebrow">Organization</div><b>5S Organization</b></div></div>
      ${shown.map((a) => { const zs = zones.filter((z) => z.apu === a.id && matches(z)); const sc = avg(zs.map((z) => { const w = Domain.latestAudit(z.id); return w ? w.score.overall.pct : null; }));
        return `<section class="org-apu"><div class="org-head"><div class="org-node apu"><div><div class="eyebrow">APU · ${esc(Domain.plantName(a.plant))}</div><b style="font-family:var(--f-display);font-size:18px">${esc(a.name)}</b></div>${UI.score(sc)}</div><span class="org-link"></span><div class="org-node">${UI.av(a.facilitator)}<div><div class="eyebrow">5S Facilitator</div><b>${esc(Domain.uname(a.facilitator))}</b></div></div><span class="small muted">${zs.length} zones · ${sum(zs.map((z) => 1 + (z.members || []).length))} people</span></div>
        <div class="org-zones">${zs.map(zcard).join('') || '<div class="faint small">No zones match.</div>'}</div></section>`; }).join('')}`;
  },
};
Acts['org-q'] = (el) => { App.ui.orgQ = el.value; clearTimeout(Acts._oq); Acts._oq = setTimeout(() => { App.render(); const i = $('[data-input="org-q"]'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 250); };

Pages.zone = {
  perm: '5S Organization',
  render(p) {
    const z = Domain.zone(p.id); if (!z) return UI.empty('zone', 'Zone not found');
    const audits = Store.all('workorders').filter((w) => w.zone === z.id).sort((a, b) => b.plannedDate.localeCompare(a.plannedDate));
    const done = audits.filter((w) => Domain.isDone(w) && w.score).sort((a, b) => Domain.auditDate(a).localeCompare(Domain.auditDate(b)));
    const last = done[done.length - 1]; const prev = done[done.length - 2];
    const fs = Store.all('findings').filter((f) => f.zone === z.id).sort((a, b) => (b.auditDate || '').localeCompare(a.auditDate || ''));
    const acts = Store.all('actions').filter((a) => a.zone === z.id);
    const reps = Domain.repeatGroups(fs);
    const imps = Store.all('improvements').filter((i) => i.zone === z.id);
    const cs = Domain.activeChecksheet(z.checksheet);
    const best = last ? FS.S_KEYS.slice().sort((a, b) => last.score[b].pct - last.score[a].pct) : [];
    const canEdit = Domain.can('Master', 'edit');
    return `${UI.head(`<span class="mono" style="font-size:.7em;color:var(--ink-3);display:block;margin-bottom:2px">${esc(z.code)}</span>${esc(z.name)}`, [['5S Organization', 'org'], Domain.apuName(z.apu), z.code], `${canEdit ? `<button class="btn" data-act="zone-edit" data-id="${z.id}">${icon('edit')}Edit zone</button>` : ''}<button class="btn" data-go="reports" data-id='${JSON.stringify({ r: 'zone', zone: z.id })}'>${icon('file')}Zone report</button>`, `${esc(z.type)} zone · ${esc(z.dept)}${z.section ? ' / ' + esc(z.section) : ''} · ${esc(Domain.apuName(z.apu))} APU · ${esc(Domain.plantName(z.plant))}`)}
      <div class="grid">
        <div class="c4">${UI.card('Current 5S score', `<div class="row" style="gap:18px">${UI.ring(last ? last.score.overall.pct : null, 128, (Domain.band(last && last.score.overall.pct) || {}).label || 'No audit')}<div class="stack tight"><div class="small muted">Last audit</div><b>${last ? fmtDate(Domain.auditDate(last)) : '—'}</b>${prev && last ? `<div class="small">Previous ${fmtPct(prev.score.overall.pct)} <span class="delta ${last.score.overall.pct >= prev.score.overall.pct ? 'up' : 'down'}">${last.score.overall.pct >= prev.score.overall.pct ? '+' : ''}${round1(last.score.overall.pct - prev.score.overall.pct)}</span></div>` : ''}<div class="small muted">Next audit</div><b>${fmtDate(Domain.nextAudit(z.id))}</b></div></div>${last ? `<div class="small" style="margin-top:10px">Best S: <b>${best[0]} ${esc(Domain.sName(best[0]))}</b> · Weakest: <b>${best[4]} ${esc(Domain.sName(best[4]))}</b></div>` : ''}`)}</div>
        <div class="c8">${UI.card('S1–S5 in latest audit', last ? UI.sBoxes(last.score, prev && prev.score) : UI.empty('clipboard', 'No completed audit yet'))}</div>
        <div class="c8">${UI.card('Score trend', done.length ? UI.chart('line', { labels: done.map((w) => fmtDate(Domain.auditDate(w)).slice(3)), series: [{ name: 'Overall', values: done.map((w) => w.score.overall.pct), color: 'var(--ink)', width: 3 }].concat(FS.S_KEYS.map((s, i) => ({ name: s, values: done.map((w) => w.score[s].pct), color: `var(--s${i + 1})`, width: 1.5 }))) }, { h: 250, target: Domain.settings().targetScore, endLabels: true }) + `<div class="legend"><span><i style="background:var(--ink)"></i>Overall</span>${FS.S_KEYS.map((s, i) => `<span><i style="background:var(--s${i + 1})"></i>${s} ${esc(Domain.sName(s))}</span>`).join('')}</div>` : UI.empty('chart', 'No history yet'), { sub: 'Every completed audit, oldest to newest' })}</div>
        <div class="c4">${UI.card('Zone team', `<div class="stack"><div class="row">${UI.av(z.leader, 'lg')}<div><div class="eyebrow">Zone Leader</div><b>${esc(Domain.uname(z.leader))}</b><div class="small muted">${esc((Domain.user(z.leader) || {}).designation || '')}</div></div></div><div class="row">${UI.av(z.backup)}<div><div class="eyebrow">Backup Leader</div>${esc(Domain.uname(z.backup))}</div></div><div class="divider"></div><div class="eyebrow">Members (${(z.members || []).length})</div>${(z.members || []).map((m) => `<div class="row">${UI.av(m, 'sm')}<span>${esc(Domain.uname(m))}</span><span class="small faint">${esc((Domain.user(m) || {}).designation || '')}</span></div>`).join('')}<div class="divider"></div><div class="small muted">5S Facilitator: <b>${esc(Domain.uname(Domain.facilitatorOf(z.apu)))}</b></div></div>`)}</div>
        <div class="c12">${UI.card('Zone details', UI.kv([['Zone ID', `<span class="mono">${esc(z.code)}</span>`], ['Location', esc(z.location)], ['Area', z.area ? z.area + ' m²' : ''], ['Zone type', esc(z.type)], ['Risk classification', z.risk ? UI.badge(z.risk, z.risk === 'High' ? 'b-red' : z.risk === 'Medium' ? 'b-amber' : 'b-green') : ''], ['Audit frequency', esc(z.frequency)], ['Standard duration', z.duration + ' min'], ['Checksheet', cs ? `${esc(cs.name)} <span class="faint">v${esc(cs.version)}</span>` : esc(z.checksheet)], ['Status', UI.badge(z.status, z.status === 'Active' ? 'b-green' : 'b-gray')], ['Effective', `${fmtDate(z.effFrom)} → ${z.effTo ? fmtDate(z.effTo) : 'open'}`], ['Description', esc(z.desc)]]) + ((z.media || []).length ? `<div class="divider" style="margin:14px 0"></div><div class="eyebrow" style="margin-bottom:8px">Zone photos, layout & visual standards</div>${UI.thumbs(z.media, { lg: true })}` : ''))}</div>
        ${reps.length ? `<div class="c12">${UI.card('Repeat finding alerts', reps.map((r) => `<div class="banner hazard" style="margin-bottom:8px"><div class="grow"><div class="row tight">${UI.stag(r.s)}<b>${esc(Domain.sName(r.s))}</b><span class="mono small faint">${esc(r.qid)}</span></div><div style="margin-top:3px">${esc(r.desc)}</div><div class="small muted">Found in ${r.consecutive >= 2 ? r.consecutive + ' consecutive audits' : r.count + ' audits'} · first ${fmtDate(r.first)} · last ${fmtDate(r.last)} · ${esc(r.effectiveness)}</div></div><button class="btn sm" data-go="car" data-id='${JSON.stringify({ tab: 'repeat' })}'>Analyse</button></div>`).join(''))}</div>` : ''}
        <div class="c6">${UI.card('Audit history', UI.table('zaud-' + z.id, [{ k: 'no', h: 'Audit no.', r: (w) => `<b class="mono">${esc(w.no)}</b>` }, { k: 'plannedDate', h: 'Date', r: (w) => fmtDate(Domain.isDone(w) ? Domain.auditDate(w) : w.plannedDate) }, { k: 'auditType', h: 'Type' }, { k: 'auditor', h: 'Auditor', r: (w) => esc(Domain.uname(w.auditor)) }, { k: 'sc', h: 'Score', r: (w) => UI.score(w.score && Domain.isDone(w) ? w.score.overall.pct : null), sortv: (w) => (w.score ? w.score.overall.pct : -1) }, { k: 'st', h: 'Status', r: (w) => UI.woBadge(w) }], audits, { go: (w) => ['wo', w.id], pageSize: 8 }))}</div>
        <div class="c6">${UI.card('Findings & actions', UI.table('zf-' + z.id, [{ k: 'no', h: 'Finding', r: (f) => `<b class="mono">${esc(f.no)}</b><div class="small muted clip">${esc(f.desc)}</div>` }, { k: 's', h: 'S', r: (f) => UI.stag(f.s) }, { k: 'severity', h: 'Severity', r: (f) => UI.sev(f.severity) }, { k: 'auditDate', h: 'Date', r: (f) => fmtDate(f.auditDate) }, { k: 'st', h: 'Status', r: (f) => UI.fBadge(f), sortv: (f) => Domain.findSt(f) }], fs, { go: (f) => ['finding', f.id], pageSize: 8 }), { sub: `${acts.filter((a) => Domain.isActOpen(a)).length} open actions · ${acts.filter((a) => Domain.actStatus(a) === 'Overdue').length} overdue` })}</div>
        ${imps.length ? `<div class="c12">${UI.card('Improvements in this zone', `<div class="gallery">${imps.map(Pages.car.baCard).join('')}</div>`)}</div>` : ''}
      </div>`;
  },
};

/* ---------- Audit Planner ---------- */
const CAL_COL = { Planned: 'var(--ink-3)', Due: 'var(--warn)', 'In Progress': 'var(--violet)', Completed: 'var(--good)', Overdue: 'var(--bad)', Cancelled: 'var(--ink-3)', Assigned: 'var(--info)' };
Pages.planner = {
  perm: 'Audit Planner', perm2: 'Execute Audit',
  calStatus(w) { const s = Domain.woStatus(w); if (Domain.isDone(w)) return 'Completed'; if (s === 'Overdue') return 'Overdue'; if (s === 'In Progress') return 'In Progress'; if (s === 'Cancelled') return 'Cancelled'; if (s === 'Due') return 'Due'; return w.plannedDate <= FS.addDays(Domain.today, Domain.settings().auditDueSoonDays || 2) ? 'Due' : 'Planned'; },
  events(from, to) {
    const ev = [];
    const wos = Domain.wos().filter((w) => w.plannedDate >= from && w.plannedDate <= to);
    const have = new Set(Store.all('workorders').map((w) => w.scheduleId + '|' + w.plannedDate));
    wos.forEach((w) => ev.push({ d: w.plannedDate, kind: 'wo', id: w.id, label: `${w.zone} · ${Domain.uname(w.auditor).split(' ')[0]}`, st: this.calStatus(w), w }));
    const zs = new Set(Domain.scopeZones().map((z) => z.id));
    Store.all('schedules').filter((s) => s.status === 'Active' && zs.has(s.zone)).forEach((s) => FS.occurrences(s, from, to).forEach((d) => { if (!have.has(s.id + '|' + d)) ev.push({ d, kind: 'sch', id: s.id, label: `${s.zone} · ${Domain.uname(s.auditor).split(' ')[0]}`, st: 'Planned', s }); }));
    return ev.sort((a, b) => (a.d + a.label).localeCompare(b.d + b.label));
  },
  render() {
    const tab = App.ui.plTab || 'calendar'; const canEdit = Domain.can('Audit Planner', 'edit');
    const actions = canEdit ? `<button class="btn" data-act="gen-wo">${icon('refresh')}Generate due work orders</button><button class="btn primary" data-act="sch-edit">${icon('plus')}New schedule</button>` : '';
    return `${UI.head('Audit Planner', [], actions, 'Schedules create audit work orders automatically ahead of the planned date (Master → Work Order Trigger Duration).')}
      ${UI.tabs('plTab', [['calendar', 'Calendar'], ['schedules', 'Schedules', Store.all('schedules').filter((s) => Domain._scopeSet().has(s.zone)).length]], tab)}
      ${tab === 'calendar' ? this.calendar() : this.schedules()}`;
  },
  calendar() {
    const view = App.ui.calView || 'month'; const anchor = App.ui.calDate || Domain.today;
    let from, to, title;
    if (view === 'month') { from = anchor.slice(0, 7) + '-01'; to = FS.addDays(FS.addMonths(from, 1), -1); title = fmtMonth(anchor.slice(0, 7)); }
    else if (view === 'week') { from = FS.addDays(anchor, -((FS.weekday(anchor) + 6) % 7)); to = FS.addDays(from, 6); title = `${fmtDate(from)} – ${fmtDate(to)}`; }
    else if (view === 'day') { from = to = anchor; title = fmtDate(anchor); }
    else { from = anchor.slice(0, 7) + '-01'; to = FS.addDays(FS.addMonths(from, 1), -1); title = fmtMonth(anchor.slice(0, 7)); }
    const ev = this.events(view === 'month' ? FS.addDays(from, -7) : from, view === 'month' ? FS.addDays(to, 7) : to);
    const legend = `<div class="legend-status">${['Planned', 'Due', 'In Progress', 'Completed', 'Overdue', 'Cancelled'].map((s) => `<span class="row tight"><span class="badge ${WO_BADGE[s]}">${s}</span></span>`).join('')}</div>`;
    const evBtn = (e) => `<button class="ev" style="background:color-mix(in srgb, ${CAL_COL[e.st]} 14%, var(--surface));color:${CAL_COL[e.st]};${e.st === 'Cancelled' ? 'text-decoration:line-through;' : ''}${e.kind === 'sch' ? 'border-left-style:dashed;' : ''}" data-act="cal-ev" data-kind="${e.kind}" data-id="${esc(e.id)}" data-d="${e.d}" title="${esc(e.label)} – ${e.st}"><span style="color:var(--ink)">${esc(e.label)}</span></button>`;
    let body = '';
    if (view === 'month' || view === 'week') {
      const start = view === 'month' ? FS.addDays(from, -((FS.weekday(from) + 6) % 7)) : from; const days = view === 'month' ? Math.ceil((FS.diffDays(to, start) + 1) / 7) * 7 : 7;
      body = `<div class="cal ${view}">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => `<div class="dh">${d}</div>`).join('')}${Array.from({ length: days }, (_, i) => { const d = FS.addDays(start, i); const de = ev.filter((e) => e.d === d); const max = view === 'week' ? 12 : 3; return `<div class="d ${d.slice(0, 7) !== anchor.slice(0, 7) && view === 'month' ? 'out' : ''} ${d === Domain.today ? 'today' : ''}"><div class="dn"><span>${Number(d.slice(8))}</span>${de.length ? `<span class="tiny faint">${de.length}</span>` : ''}</div>${de.slice(0, max).map(evBtn).join('')}${de.length > max ? `<button class="ev more" data-act="cal-day" data-d="${d}">+${de.length - max} more</button>` : ''}</div>`; }).join('')}</div>`;
    } else {
      body = UI.card('', UI.table('callist', [{ k: 'd', h: 'Date', r: (e) => fmtDate(e.d) }, { k: 'label', h: 'Zone', r: (e) => { const z = Domain.zone((e.w || e.s).zone); return `<b class="mono">${esc(z ? z.code : '')}</b> <span class="small muted">${esc(z ? z.name : '')}</span>`; } }, { k: 'aud', h: 'Auditor', r: (e) => esc(Domain.uname((e.w || e.s).auditor)) }, { k: 'type', h: 'Type', r: (e) => esc((e.w || e.s).auditType) }, { k: 'no', h: 'Work order', r: (e) => (e.w ? `<span class="mono">${esc(e.w.no)}</span>` : '<span class="faint small">Not generated yet</span>') }, { k: 'st', h: 'Status', r: (e) => UI.badge(e.st, WO_BADGE[e.st]) }], ev, { pageSize: 50 }));
    }
    return `<div class="row between" style="margin-bottom:12px"><div class="row"><button class="btn sm" data-act="cal-nav" data-v="-1" aria-label="Previous">${icon('left')}</button><button class="btn sm" data-act="cal-nav" data-v="0">Today</button><button class="btn sm" data-act="cal-nav" data-v="1" aria-label="Next">${icon('right')}</button><h2 style="margin-left:6px">${esc(title)}</h2></div>${UI.seg('calView', [['month', 'Month'], ['week', 'Week'], ['day', 'Day'], ['list', 'List']], view)}</div>${view === 'day' ? UI.card('', ev.length ? `<div class="stack">${ev.map((e) => { const w = e.w; const s = e.s || Store.get('schedules', w.scheduleId) || {}; return `<div class="row between" style="padding:8px 0;border-bottom:1px solid var(--line-2)"><div><b class="mono">${esc((w || s).zone)}</b> ${esc((Domain.zone((w || s).zone) || {}).name || '')}<div class="small muted">${esc(s.time || '')}${s.endTime ? '–' + esc(s.endTime) : ''} · ${esc(Domain.uname((w || s).auditor))} · ${esc((w || s).auditType)}</div></div><div class="row">${UI.badge(e.st, WO_BADGE[e.st])}${w ? `<button class="btn sm" data-go="wo" data-id="${w.id}">Open</button>` : ''}</div></div>`; }).join('')}</div>` : UI.empty('calendar', 'No audits on this day')) : body}<div style="margin-top:12px">${legend}<div class="small faint" style="margin-top:6px">Dashed entries are future occurrences from a schedule; the work order is created ${Domain.settings().woTrigger ? 'automatically' : ''} when the trigger window opens.</div></div>`;
  },
  schedules() {
    const canEdit = Domain.can('Audit Planner', 'edit'); const zs = Domain._scopeSet();
    const list = Store.all('schedules').filter((s) => zs.has(s.zone));
    return UI.card('', UI.table('sched', [
      { k: 'id', h: 'Schedule ID', r: (s) => `<b class="mono">${esc(s.id)}</b>` }, { k: 'zone', h: 'Zone', r: (s) => `<b class="mono">${esc(s.zone)}</b> <span class="small muted">${esc((Domain.zone(s.zone) || {}).name || '')}</span>` },
      { k: 'apu', h: 'APU / Dept', r: (s) => `${esc(Domain.apuName(s.apu))}<div class="small muted">${esc(s.dept)}</div>` }, { k: 'checksheet', h: 'Checksheet', r: (s) => { const c = Domain.activeChecksheet(s.checksheet); return esc(c ? c.name : s.checksheet); } },
      { k: 'frequency', h: 'Frequency', r: (s) => esc(s.frequency === 'Custom' ? `Every ${s.interval} days` : s.frequency) }, { k: 'auditType', h: 'Audit type' },
      { k: 'next', h: 'Next date', r: (s) => fmtDate(FS.occurrences(s, Domain.today, FS.addDays(Domain.today, 400))[0]), sortv: (s) => FS.occurrences(s, Domain.today, FS.addDays(Domain.today, 400))[0] },
      { k: 'time', h: 'Time', r: (s) => esc((s.time || '') + (s.endTime ? '–' + s.endTime : '')) }, { k: 'auditor', h: 'Auditor / Backup', r: (s) => `${esc(Domain.uname(s.auditor))}<div class="small muted">${esc(Domain.uname(s.backup))}</div>` },
      { k: 'priority', h: 'Priority', r: (s) => UI.badge(s.priority, s.priority === 'High' ? 'b-red' : s.priority === 'Medium' ? 'b-amber' : 'b-gray') }, { k: 'status', h: 'Status', r: (s) => UI.badge(s.status, s.status === 'Active' ? 'b-green' : 'b-gray') },
      canEdit ? { k: 'x', h: '', sortable: false, r: (s) => `<button class="btn sm" data-act="sch-edit" data-id="${esc(s.id)}">${icon('edit')}Edit</button>` } : null].filter(Boolean), list, { pageSize: 30 }));
  },
  scheduleFields(s, isNew) {
    const ms = Domain.masters(); const fams = uniq(Store.all('checksheets').map((c) => c.family)).map((f) => { const c = Domain.activeChecksheet(f) || Store.all('checksheets').find((x) => x.family === f); return [f, `${c.name} (v${c.version})`]; });
    const auds = UI.userOpts((u) => ['auditor', 'facilitator', 'admin', 'management'].includes(u.role));
    return [
      { name: 'zone', label: 'Zone', type: 'select', options: UI.zoneOpts(), required: true, disabled: !isNew },
      { name: 'checksheet', label: 'Checksheet', type: 'select', options: fams, required: true },
      { name: 'auditType', label: 'Audit type', type: 'select', options: ms.auditTypes || [], required: true },
      { name: 'frequency', label: 'Audit frequency', type: 'select', options: ms.frequencies || ['Weekly', 'Monthly', 'Custom'], required: true },
      { name: 'interval', label: 'Custom interval (days)', type: 'number', min: 1, help: 'Used only when frequency is Custom' },
      { name: 'priority', label: 'Priority', type: 'select', options: ms.priorities || ['High', 'Medium', 'Low'], required: true },
      { name: 'startDate', label: 'Planned date (first audit)', type: 'date', required: true, validate: (v) => (isNew && v < FS.addDays(Domain.today, -31) ? 'Choose a date within the last month or later' : '') },
      { name: 'endDate', label: 'Schedule ends', type: 'date', validate: (v, o) => (v && v < o.startDate ? 'End date is before the start date' : '') },
      { name: 'time', label: 'Planned start time', type: 'time' }, { name: 'endTime', label: 'Planned end time', type: 'time' },
      { name: 'auditor', label: 'Auditor', type: 'select', options: auds, required: true }, { name: 'backup', label: 'Backup auditor', type: 'select', options: auds, validate: (v, o) => (v && v === o.auditor ? 'Backup must differ from the auditor' : '') },
      { name: 'status', label: 'Status', type: 'select', options: ['Active', 'Paused', 'Cancelled'], required: true },
      { name: 'note', label: 'Notes', type: 'text', full: true },
    ];
  },
};
Object.assign(Acts, {
  'cal-nav'(el) { const v = Number(el.dataset.v); const view = App.ui.calView || 'month'; const a = App.ui.calDate || Domain.today; App.ui.calDate = v === 0 ? Domain.today : view === 'month' || view === 'list' ? FS.addMonths(a.slice(0, 7) + '-01', v) : FS.addDays(a, v * (view === 'week' ? 7 : 1)); App.render(); },
  'cal-day'(el) { App.ui.calDate = el.dataset.d; App.ui.calView = 'day'; App.render(); },
  'cal-ev'(el) { if (el.dataset.kind === 'wo') return App.go('wo', { id: el.dataset.id }); const s = Store.get('schedules', el.dataset.id); UI.modal({ title: `Planned audit · ${esc(s.zone)}`, sub: fmtDate(el.dataset.d), body: UI.kv([['Schedule', `<span class="mono">${esc(s.id)}</span>`], ['Zone', esc((Domain.zone(s.zone) || {}).name)], ['Auditor', esc(Domain.uname(s.auditor))], ['Backup', esc(Domain.uname(s.backup))], ['Audit type', esc(s.auditType)], ['Frequency', esc(s.frequency)], ['Time', esc((s.time || '') + '–' + (s.endTime || ''))], ['Work order', `Created ${(Domain.settings().woTrigger || {})[s.frequency] ?? 7} days before the planned date`]]), actions: Domain.can('Audit Planner', 'edit') ? [{ label: 'Close' }, { label: 'Edit schedule', cls: 'primary', onClick: () => { setTimeout(() => Acts['sch-edit']({ dataset: { id: s.id } }), 10); } }] : [{ label: 'Close' }] }); },
  async 'gen-wo'() { const n = await Domain.generateDueWorkOrders(true); UI.toast(n ? `${n} work order${n > 1 ? 's' : ''} generated.` : 'All due work orders already exist.', n ? 'good' : ''); },
  'sch-edit'(el) {
    const id = el.dataset && el.dataset.id; const s0 = id ? Store.get('schedules', id) : null; const isNew = !s0;
    const fields = Pages.planner.scheduleFields(s0, isNew);
    const vals = s0 || { frequency: 'Monthly', auditType: 'Monthly Audit', priority: 'Medium', status: 'Active', startDate: FS.addDays(Domain.today, 7), time: '10:00', endTime: '11:00' };
    UI.modal({ title: isNew ? 'New audit schedule' : 'Edit schedule ' + esc(id), size: 'wide', body: UI.form(fields, vals, 'three'),
      onMount: (m) => { const z = $('[name=zone]', m); if (z && isNew) z.addEventListener('change', () => { const zz = Domain.zone(z.value); if (zz) { $('[name=checksheet]', m).value = zz.checksheet; $('[name=frequency]', m).value = zz.frequency || 'Monthly'; $('[name=priority]', m).value = zz.risk === 'High' ? 'High' : 'Medium'; } }); },
      actions: [{ label: 'Cancel' }, { label: isNew ? 'Create schedule' : 'Save changes', cls: 'primary', onClick: async (m) => {
        const v = UI.readForm(m, fields); if (!v) return false; if (!isNew) v.zone = s0.zone;
        if (v.frequency === 'Custom' && !v.interval) { UI.toast('Enter the custom interval in days', 'bad'); return false; }
        const z = Domain.zone(v.zone);
        const doc = Object.assign({}, s0 || {}, v, { plant: z.plant, apu: z.apu, dept: z.dept });
        let sid = id;
        if (isNew) { const n = Store.all('schedules').map((x) => Number(String(x.id).replace(/\D/g, '')) || 0); sid = 'SCH-' + FS.pad(Math.max(0, ...n) + 1, 4); Object.assign(doc, { createdBy: App.user.id, createdAt: nowISO() }); }
        else { doc.updatedBy = App.user.id; doc.updatedAt = nowISO(); }
        await Store.put('schedules', sid, doc);
        const changed = s0 ? Object.keys(v).filter((k) => String(v[k] ?? '') !== String(s0[k] ?? '')).map((k) => `${k}: ${s0[k] ?? ''} → ${v[k] ?? ''}`).join('; ') : '';
        Domain.log('Audit Planner', sid, isNew ? 'Schedule created' : 'Schedule changed', s0 ? changed.split(';').map((x) => x.split('→')[0]).join(';') : '', isNew ? `${v.frequency}, ${v.zone}, ${v.startDate}` : changed);
        if (s0 && s0.auditor !== v.auditor) { for (const w of Store.all('workorders').filter((w) => w.scheduleId === sid && FS.WO_OPEN.includes(w.status) && w.auditor === s0.auditor)) { await Store.patch('workorders', w.id, { auditor: v.auditor, history: (w.history || []).concat([{ at: nowISO(), by: App.user.id, status: w.status, note: `Auditor reassigned from ${Domain.uname(s0.auditor)}` }]) }); Domain.notify('Audit assigned', 'Audit assigned: ' + w.no, `Zone ${w.zone}, planned ${fmtDate(w.plannedDate)}`, [v.auditor], { page: 'wo', id: w.id }); Domain.log('Work Orders', w.no, 'Auditor assigned', s0.auditor, v.auditor); } }
        UI.toast(isNew ? 'Schedule created' : 'Schedule saved', 'good');
        Domain.generateDueWorkOrders(false).then((n) => n && UI.toast(`${n} work order${n > 1 ? 's' : ''} generated`));
      } }] });
  },
});
