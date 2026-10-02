/* ===== 5S app UI kit: shell, router, modal, forms, tables, charts, photos ===== */
const Pages = {};
const Acts = {}; // click handlers: data-act="name"

const App = {
  user: null, plant: 'all', route: { page: 'dashboard', params: {} }, stack: [], ui: {}, stale: false, navOpen: false,
  go(page, params = {}, opts = {}) {
    if (!opts.replace && this.route) this.stack.push(this.route);
    if (this.stack.length > 40) this.stack.shift();
    this.route = { page, params };
    this.navOpen = false;
    this.render(); window.scrollTo(0, 0);
  },
  back() { const r = this.stack.pop(); if (r) { this.route = r; this.render(); } else this.go('dashboard', {}, { replace: true }); },
  st(key, def) { if (!this.ui[key]) this.ui[key] = clone(def) || {}; return this.ui[key]; },
  render() {
    const root = $('#app');
    if (!this.user) { root.innerHTML = Pages.login.render(); Pages.login.mount && Pages.login.mount(root); return; }
    if (!$('.app', root)) root.innerHTML = this.shell();
    this.refreshChrome();
    const pg = Pages[this.route.page] || Pages.dashboard;
    const main = $('#content');
    if (pg.perm && !Domain.can(pg.perm, 'view') && !(pg.perm2 && Domain.can(pg.perm2, 'view'))) { main.innerHTML = UI.empty('lock', 'You do not have access to this module.', 'Ask the System Administrator to update your role permissions.'); return; }
    let html; try { html = pg.render(this.route.params || {}); } catch (e) { console.error(e); html = UI.empty('alert', 'This page could not be displayed.', esc(e.message)); }
    main.innerHTML = html;
    try { pg.mount && pg.mount(main, this.route.params || {}); } catch (e) { console.error(e); }
    UI.drawCharts(main);
    this.stale = false;
  },
  onData(changed) {
    if (!this.user) { if (changed.has('users') || changed.has('cfg')) { const r = $('#app'); if (!$('.login', r) || !$('#login-id', r) || document.activeElement === document.body) this.render(); } return; }
    const fresh = Domain.user(this.user.id); if (fresh) this.user = fresh;
    const pg = Pages[this.route.page];
    if (pg && pg.live === false) { this.stale = true; this.refreshChrome(); return; }
    if (document.querySelector('.modal-back')) { this.stale = true; this.refreshChrome(); return; }
    const y = window.scrollY; this.render(); window.scrollTo(0, y);
  },
  shell() {
    return `<div class="app"><div class="scrim" data-act="nav-close"></div><aside class="side" id="side"></aside>
    <div class="main"><header class="top" id="top"></header><main class="content" id="content"></main></div></div><div class="toasts" id="toasts"></div>`;
  },
  navItems() {
    const it = [
      ['Overview'], ['dashboard', 'Dashboard', 'dashboard', 'Dashboard'], ['analytics', 'Analytics', 'chart', 'Analytics'], ['org', '5S Organization', 'org', '5S Organization'],
      ['Operations'], ['planner', 'Audit Planner', 'calendar', 'Audit Planner'], ['wos', 'Work Orders & Execution', 'clipboard', 'Work Orders', 'Execute Audit'], ['car', 'Corrective Action Register', 'wrench', 'Findings', 'Actions'],
      ['Output'], ['reports', 'Reports', 'file', 'Reports'],
      ['Administration'], ['master', 'Master', 'sliders', 'Master'], ['users', 'User Role', 'users', 'User Role'], ['trail', 'Audit Trail', 'history', 'Audit Trail'],
    ];
    return it.filter((x) => x.length === 1 || Domain.can(x[3]) || (x[4] && Domain.can(x[4])));
  },
  refreshChrome() {
    const side = $('#side'); if (!side || !this.user) return;
    const cur = this.route.page; const map = { zone: 'org', wo: 'wos', exec: 'wos', scorecard: 'wos', finding: 'car', action: 'car', improvement: 'car' };
    const active = map[cur] || cur;
    const me = this.user;
    const myDue = Domain.wos().filter((w) => (w.auditor === me.id) && ['Due', 'Overdue', 'In Progress'].includes(Domain.woStatus(w))).length;
    const myOver = Store.all('actions').filter((a) => a.responsible === me.id && Domain.actStatus(a) === 'Overdue').length + (['leader', 'facilitator', 'admin'].includes(me.role) ? Domain.actions().filter((a) => a.status === 'Submitted for Verification' && (me.role !== 'leader' || Domain.myZoneIds().includes(a.zone))).length : 0);
    const items = this.navItems(); const out = [];
    items.forEach((x, i) => { if (x.length === 1) { const next = items[i + 1]; if (next && next.length > 1) out.push(`<div class="nav-sec">${x[0]}</div>`); return; }
      const cnt = x[0] === 'wos' && myDue ? `<span class="count">${myDue}</span>` : x[0] === 'car' && myOver ? `<span class="count">${myOver}</span>` : '';
      out.push(`<a data-go="${x[0]}" class="${active === x[0] ? 'on' : ''}">${icon(x[2])}<span>${x[1]}</span>${cnt}</a>`); });
    const st = Domain.settings();
    side.innerHTML = `<div class="brand"><div class="brand-mark">5S</div><div><div class="brand-name">${esc(st.appTitle || '5S Management System')}</div></div></div><div class="tape"></div>
      <nav class="nav">${out.join('')}</nav>
      <div class="side-foot">Signed in as ${esc(ROLE_LABEL[me.role] || me.role)}<br>${Store.adapter && Store.adapter.kind === 'db' ? 'Shared demo database' : Store.adapter ? 'Server: ' + esc(location.host) : 'Offline copy'}</div>`;
    const plants = (Domain.masters().plants || []).filter((p) => !me.plants || !me.plants.length || me.plants.includes(p.id));
    const unread = Store.all('notifications').filter((n) => (n.to || []).includes(me.id) && !(n.readBy || []).includes(me.id)).length;
    const pend = Store.outbox.length + LS.get('pendingSubmits', []).length;
    const net = !navigator.onLine ? ['off', 'Offline'] : pend ? ['sync', `Sync pending (${pend})`] : Store.readOnly ? ['ro', 'View only'] : Store.mode === 'cache' ? ['sync', 'Connecting…'] : ['', 'Online'];
    const top = $('#top');
    const q = $('#gsearch') ? $('#gsearch').value : '';
    const hadFocus = document.activeElement && document.activeElement.id === 'gsearch';
    top.innerHTML = `<button class="iconbtn burger" data-act="nav-open" aria-label="Open menu">${icon('menu')}</button>
      <div class="search"><input id="gsearch" placeholder="Search audit no., zone, finding, action, employee…" autocomplete="off" value="${esc(q)}" aria-label="Global search">${icon('search')}<div id="gres"></div></div>
      ${plants.length > 1 ? `<select class="top-sel opt" id="plantSel" aria-label="Plant">${['<option value="all">All plants</option>'].concat(plants.map((p) => `<option value="${p.id}" ${this.plant === p.id ? 'selected' : ''}>${esc(p.name)}</option>`)).join('')}</select>` : ''}
      <span class="net ${net[0]}" title="Connection status"><i></i><span>${net[1]}</span></span>
      ${this.stale && this.route.page !== 'exec' ? `<button class="btn sm" data-act="refresh-view">${icon('refresh')}Updated</button>` : ''}
      <button class="iconbtn" data-act="notif" aria-label="Notifications">${icon('bell')}${unread ? `<span class="dot">${unread > 99 ? '99+' : unread}</span>` : ''}</button>
      <button class="me" data-act="me-menu">${UI.av(me.id)}<span class="who"><b>${esc(me.name)}</b><span>${esc(ROLE_LABEL[me.role])}</span></span></button>`;
    if (hadFocus) { const g = $('#gsearch'); g.focus(); g.setSelectionRange(g.value.length, g.value.length); }
    $('.app').classList.toggle('nav-open', this.navOpen);
  },
};

/* ---------- UI kit ---------- */
const UI = {
  _charts: {}, _cid: 0,
  av(id, cls = '') { const u = Domain.user(id); const n = u ? u.name : id; return `<span class="avatar ${cls}" style="background:${Domain.avColor(id)}" title="${esc(n)}">${esc(Domain.initials(n))}</span>`; },
  person(id, sub) { if (!id) return '<span class="faint">—</span>'; return `<span class="person">${UI.av(id, 'sm')}<span>${esc(Domain.uname(id))}${sub ? `<small class="faint"> · ${esc(sub)}</small>` : ''}</span></span>`; },
  badge(text, cls) { return `<span class="badge ${cls || 'b-gray'}">${esc(text)}</span>`; },
  woBadge(w) { const s = typeof w === 'string' ? w : Domain.woStatus(w); return UI.badge(s, WO_BADGE[s]); },
  actBadge(a) { const s = typeof a === 'string' ? a : Domain.actStatus(a); return UI.badge(s, ACT_BADGE[s]); },
  fBadge(f) { const s = Domain.findSt(f); return UI.badge(s, F_BADGE[s]); },
  sev(s) { return `<span class="sev"><i style="background:${Domain.sevColor(s)}"></i>${esc(s)}</span>`; },
  score(p, lg) { if (p === null || p === undefined) return '<span class="faint">—</span>'; return `<span class="score ${lg ? 'lg' : ''}" style="background:${Domain.bandColor(p)}" title="${esc((Domain.band(p) || {}).label || '')}">${Math.round(p)}%</span>`; },
  stag(s) { return `<span class="s-tag s-${s}" title="${esc(Domain.sName(s))}">${s}</span>`; },
  link(page, id, text, cls = 'mono') { return `<a class="${cls}" data-go="${page}" data-id="${esc(id)}" style="cursor:pointer;text-decoration:none">${esc(text)}</a>`; },
  empty(ic, title, sub = '', btn = '') { return `<div class="empty">${icon(ic)}<div><b>${title}</b></div>${sub ? `<div class="small">${sub}</div>` : ''}${btn}</div>`; },
  head(title, crumbs = [], actions = '', sub = '') {
    const cr = crumbs.length ? `<div class="crumbs">${crumbs.map((c) => (Array.isArray(c) ? `<a data-go="${c[1]}" ${c[2] ? `data-id="${esc(c[2])}"` : ''}>${esc(c[0])}</a>` : `<span>${esc(c)}</span>`)).join('<span>/</span>')}</div>` : '';
    return `<div class="pagehead"><div class="grow">${cr}<h1>${title}</h1>${sub ? `<div class="muted small" style="margin-top:4px">${sub}</div>` : ''}</div><div class="row">${actions}</div></div>`;
  },
  tabs(key, tabs, cur) { return `<div class="tabs" role="tablist">${tabs.map(([k, l, n]) => `<button role="tab" class="${cur === k ? 'on' : ''}" data-act="tab" data-key="${key}" data-v="${k}">${esc(l)}${n !== undefined && n !== null ? ` <span class="n">${n}</span>` : ''}</button>`).join('')}</div>`; },
  seg(key, opts, cur) { return `<div class="seg">${opts.map(([k, l]) => `<button class="${cur === k ? 'on' : ''}" data-act="tab" data-key="${key}" data-v="${k}">${esc(l)}</button>`).join('')}</div>`; },
  sel(key, opts, cur, label) { return `<select data-filter="${key}" aria-label="${esc(label || key)}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(cur ?? '') === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`; },
  card(title, body, opts = {}) { return `<section class="card ${opts.cls || ''}">${title ? `<div class="card-h"><div><h3>${title}</h3>${opts.sub ? `<div class="sub">${opts.sub}</div>` : ''}</div>${opts.right || ''}</div>` : ''}<div class="card-b">${body}</div></section>`; },
  kv(pairs) { return `<div class="kv">${pairs.filter(Boolean).map(([k, v]) => `<div><div class="k">${esc(k)}</div><div class="v">${v === undefined || v === null || v === '' ? '<span class="faint">—</span>' : v}</div></div>`).join('')}</div>`; },
  meter(p, color) { return `<div class="meter"><i style="width:${Math.max(0, Math.min(100, p || 0))}%;${color ? 'background:' + color : ''}"></i></div>`; },

  /* table with paging + sorting; state in App.ui[key] */
  table(key, cols, rows, opts = {}) {
    const s = App.st('t:' + key, { page: 0, sort: opts.sort || null, dir: opts.dir || 'asc' });
    let data = rows;
    if (s.sort) { const c = cols.find((x) => x.k === s.sort); if (c) { const f = c.sortv || ((r) => r[c.k]); data = rows.slice().sort((a, b) => { const x = f(a), y = f(b); const r = x === y ? 0 : x === undefined || x === null ? 1 : y === undefined || y === null ? -1 : x > y ? 1 : -1; return s.dir === 'asc' ? r : -r; }); } }
    const ps = opts.pageSize || 25; const pages = Math.max(1, Math.ceil(data.length / ps)); if (s.page >= pages) s.page = pages - 1;
    const slice = opts.noPage ? data : data.slice(s.page * ps, s.page * ps + ps);
    if (!rows.length) return opts.empty || UI.empty('layers', 'Nothing to show', 'Try changing the filters.');
    const th = cols.map((c) => `<th class="${c.num ? 'num' : ''}" ${c.k && c.sortable !== false ? `data-act="tsort" data-key="${key}" data-k="${c.k}" style="cursor:pointer"` : ''}>${esc(c.h)}${s.sort === c.k ? (s.dir === 'asc' ? ' ↑' : ' ↓') : ''}</th>`).join('');
    const tr = slice.map((r) => { const go = opts.go ? opts.go(r) : null; const cls = [go ? 'click' : '', opts.rowCls ? opts.rowCls(r) : ''].join(' '); return `<tr class="${cls}" ${go ? `data-go="${go[0]}" data-id="${esc(go[1])}"` : ''}>${cols.map((c) => `<td class="${c.num ? 'num' : ''} ${c.cls || ''}">${c.r ? c.r(r) : esc(r[c.k] ?? '')}</td>`).join('')}</tr>`; }).join('');
    const pager = opts.noPage || pages <= 1 ? `<div class="pager"><span>${data.length} record${data.length === 1 ? '' : 's'}</span></div>` : `<div class="pager"><span>${s.page * ps + 1}–${Math.min(data.length, s.page * ps + ps)} of ${data.length}</span><span class="row tight"><button class="btn sm" data-act="tpage" data-key="${key}" data-v="${s.page - 1}" ${s.page === 0 ? 'disabled' : ''}>${icon('left')}Prev</button><button class="btn sm" data-act="tpage" data-key="${key}" data-v="${s.page + 1}" ${s.page >= pages - 1 ? 'disabled' : ''}>Next${icon('right')}</button></span></div>`;
    return `<div class="tbl-wrap"><table class="tbl ${opts.cls || ''}"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>${pager}`;
  },

  /* toast + modal */
  toast(msg, kind = '') { const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = msg; const host = $('#toasts') || document.body; host.appendChild(t); setTimeout(() => t.remove(), kind === 'bad' ? 6000 : 3600); },
  modal({ title, sub = '', body, actions = [], size = '', onMount }) {
    UI.closeModal();
    const back = document.createElement('div'); back.className = 'modal-back';
    back.innerHTML = `<div class="modal ${size}" role="dialog" aria-modal="true"><div class="modal-h"><div><h2>${title}</h2>${sub ? `<div class="small muted" style="margin-top:3px">${sub}</div>` : ''}</div><button class="iconbtn" data-close aria-label="Close">${icon('x')}</button></div><div class="modal-b">${body}</div>${actions.length ? `<div class="modal-f">${actions.map((a, i) => `<button class="btn ${a.cls || ''}" data-mi="${i}">${a.icon ? icon(a.icon) : ''}${esc(a.label)}</button>`).join('')}</div>` : ''}</div>`;
    document.body.appendChild(back);
    back.addEventListener('click', async (e) => {
      if (e.target === back || e.target.closest('[data-close]')) { UI.closeModal(); return; }
      const b = e.target.closest('[data-mi]'); if (!b) return;
      const a = actions[Number(b.dataset.mi)]; if (!a.onClick) { UI.closeModal(); return; }
      b.disabled = true; try { const r = await a.onClick($('.modal', back)); if (r !== false) UI.closeModal(); } catch (err) { console.error(err); UI.toast(err.message || 'Something went wrong', 'bad'); } finally { b.disabled = false; }
    });
    UI.drawCharts(back);
    if (onMount) onMount($('.modal', back));
    const f = $('input:not([type=hidden]):not([type=checkbox]), select, textarea', back); if (f && window.innerWidth > 700) f.focus();
    return back;
  },
  closeModal() { $$('.modal-back').forEach((m) => m.remove()); if (App.stale && Pages[App.route.page] && Pages[App.route.page].live !== false) App.render(); },
  confirm(title, text, okLabel = 'Confirm', danger) { return new Promise((res) => UI.modal({ title, body: `<p>${text}</p>`, actions: [{ label: 'Cancel', onClick: () => { res(false); } }, { label: okLabel, cls: danger ? 'danger solid' : 'primary', onClick: () => { res(true); } }] })); },

  /* forms */
  field(f, v) {
    const id = 'f_' + f.name; const req = f.required ? ' <span class="req">*</span>' : '';
    const val = v ?? f.value ?? (f.type === 'multi' ? [] : '');
    const cls = 'field' + (f.full ? ' full' : '');
    let inp = '';
    const opts = (f.options || []).map((o) => (Array.isArray(o) ? o : [o, o]));
    if (f.type === 'select') inp = `<select id="${id}" name="${f.name}" ${f.disabled ? 'disabled' : ''}>${f.blank !== false ? `<option value="">${esc(f.blank || 'Select…')}</option>` : ''}${opts.map(([k, l]) => `<option value="${esc(k)}" ${String(val) === String(k) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    else if (f.type === 'textarea') inp = `<textarea id="${id}" name="${f.name}" ${f.disabled ? 'disabled' : ''} placeholder="${esc(f.ph || '')}">${esc(val)}</textarea>`;
    else if (f.type === 'checkbox') return `<div class="${cls}"><label class="check" style="margin-top:22px"><input type="checkbox" id="${id}" name="${f.name}" ${val ? 'checked' : ''} ${f.disabled ? 'disabled' : ''}> ${esc(f.label)}</label>${f.help ? `<div class="help">${esc(f.help)}</div>` : ''}</div>`;
    else if (f.type === 'multi') inp = `${opts.length > 8 ? `<input type="search" placeholder="Filter…" data-act-input="multi-filter" style="margin-bottom:4px">` : ''}<div class="checklist" data-multi="${f.name}">${opts.map(([k, l]) => `<label class="check"><input type="checkbox" value="${esc(k)}" ${(val || []).includes(k) ? 'checked' : ''}> ${esc(l)}</label>`).join('')}</div>`;
    else if (f.type === 'html') return `<div class="${cls}">${f.label ? `<label>${esc(f.label)}</label>` : ''}${f.html}</div>`;
    else inp = `<input id="${id}" name="${f.name}" type="${f.type || 'text'}" value="${esc(val)}" ${f.min !== undefined ? `min="${f.min}"` : ''} ${f.max !== undefined ? `max="${f.max}"` : ''} ${f.step ? `step="${f.step}"` : ''} ${f.disabled ? 'disabled' : ''} placeholder="${esc(f.ph || '')}" ${f.list ? `list="${id}_l"` : ''}>${f.list ? `<datalist id="${id}_l">${f.list.map((x) => `<option value="${esc(x)}">`).join('')}</datalist>` : ''}`;
    return `<div class="${cls}" data-field="${f.name}"><label for="${id}">${esc(f.label)}${req}</label>${inp}${f.help ? `<div class="help">${esc(f.help)}</div>` : ''}</div>`;
  },
  form(fields, vals = {}, cls = '') { return `<div class="form ${cls}">${fields.map((f) => UI.field(f, vals[f.name])).join('')}</div>`; },
  readForm(el, fields) {
    const o = {}; let ok = true;
    $$('.field', el).forEach((x) => { x.classList.remove('err'); const m = $('.errmsg', x); if (m) m.remove(); });
    (fields || []).forEach((f) => {
      if (f.type === 'html') return;
      if (f.type === 'multi') { o[f.name] = $$(`[data-multi="${f.name}"] input:checked`, el).map((i) => i.value); }
      else { const i = $(`[name="${f.name}"]`, el); if (!i) return; o[f.name] = f.type === 'checkbox' ? i.checked : f.type === 'number' ? (i.value === '' ? null : Number(i.value)) : i.value.trim(); }
      const empty = o[f.name] === '' || o[f.name] === null || (Array.isArray(o[f.name]) && !o[f.name].length);
      let err = f.required && empty ? 'Required' : f.validate ? f.validate(o[f.name], o) : '';
      if (err) { ok = false; const box = $(`[data-field="${f.name}"]`, el); if (box) { box.classList.add('err'); box.insertAdjacentHTML('beforeend', `<div class="errmsg">${esc(err)}</div>`); } }
    });
    if (!ok) { const first = $('.field.err', el); if (first) first.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    return ok ? o : null;
  },
  userOpts(filter) { return Store.all('users').filter((u) => u.status === 'Active' && (!filter || filter(u))).sort((a, b) => a.name.localeCompare(b.name)).map((u) => [u.id, `${u.name} (${u.id}) – ${ROLE_LABEL[u.role] || u.role}`]); },
  zoneOpts(list) { return (list || Domain.scopeZones()).slice().sort((a, b) => a.code.localeCompare(b.code)).map((z) => [z.id, `${z.code} – ${z.name}`]); },

  /* ---------- charts ---------- */
  chart(type, data, opts = {}) { const id = 'c' + ++UI._cid; UI._charts[id] = { type, data, opts }; return `<div class="chart" data-chart="${id}" style="height:${opts.h || 220}px"></div>`; },
  drawCharts(root) { $$('.chart[data-chart]', root || document).forEach((el) => { const c = UI._charts[el.dataset.chart]; if (!c) return; const w = Math.max(240, el.clientWidth || 600); el.innerHTML = UI['_' + c.type](c.data, Object.assign({ w, h: el.clientHeight || c.opts.h || 220 }, c.opts)); }); },
  _line(d, o) {
    const { w, h } = o; const L = 34, R = 30, T = 14, B = 26; const iw = w - L - R, ih = h - T - B;
    const vals = d.series.flatMap((s) => s.values).filter((v) => v !== null && v !== undefined);
    let lo = o.yMin ?? Math.max(0, Math.floor((Math.min(...vals, o.target ?? 100) - 5) / 10) * 10); const hi = o.yMax ?? 100; if (!vals.length) lo = 0;
    const n = d.labels.length; const x = (i) => L + (n <= 1 ? iw / 2 : (iw * i) / (n - 1)); const y = (v) => T + ih - ((v - lo) / (hi - lo || 1)) * ih;
    let g = ''; for (let t = lo; t <= hi; t += (hi - lo) / 4) { g += `<line x1="${L}" x2="${L + iw}" y1="${y(t)}" y2="${y(t)}" style="stroke:var(--line-2)"/><text x="${L - 6}" y="${y(t) + 4}" text-anchor="end">${Math.round(t)}</text>`; }
    const step = Math.ceil(n / Math.max(2, Math.floor(iw / 46)));
    d.labels.forEach((l, i) => { if (i % step === 0 || i === n - 1) g += `<text x="${x(i)}" y="${h - 6}" text-anchor="middle">${esc(l)}</text>`; });
    if (o.target) g += `<line x1="${L}" x2="${L + iw}" y1="${y(o.target)}" y2="${y(o.target)}" style="stroke:var(--ink-3)" stroke-dasharray="4 4"/><text x="${L + iw + 4}" y="${y(o.target) + 4}">${o.target}</text>`;
    d.series.forEach((s, si) => {
      const pts = s.values.map((v, i) => (v === null || v === undefined ? null : [x(i), y(v), v]));
      let path = ''; let pen = false; pts.forEach((p) => { if (!p) { pen = false; return; } path += (pen ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); pen = true; });
      if (s.area) { const v = pts.filter(Boolean); if (v.length > 1) g += `<path d="M${v[0][0]} ${T + ih} ${v.map((p) => 'L' + p[0] + ' ' + p[1]).join(' ')} L${v[v.length - 1][0]} ${T + ih}Z" style="fill:${s.color};opacity:.10"/>`; }
      g += `<path d="${path}" fill="none" style="stroke:${s.color}" stroke-width="${s.width || 2.2}" ${s.dash ? 'stroke-dasharray="5 4"' : ''} stroke-linejoin="round" stroke-linecap="round"/>`;
      const lastI = pts.map((p, i) => (p ? i : -1)).filter((i) => i >= 0).pop();
      pts.forEach((p, i) => { if (!p) return; const last = i === lastI; g += `<circle cx="${p[0]}" cy="${p[1]}" r="${last ? 4.5 : 2.8}" style="fill:${last ? s.color : 'var(--surface)'};stroke:${s.color}" stroke-width="2"><title>${esc(s.name)} · ${esc(d.labels[i])}: ${p[2]}${o.unit ?? '%'}</title></circle>`; if (last && (d.series.length === 1 || o.endLabels)) g += `<text x="${p[0] + 7}" y="${p[1] + 4}" class="lbl-strong">${Math.round(p[2])}</text>`; });
    });
    return `<svg width="${w}" height="${h}" role="img">${g}</svg>`;
  },
  _bars(d, o) {
    const { w, h } = o; const L = 34, R = 8, T = 16, B = o.rot ? 54 : 30; const iw = w - L - R, ih = h - T - B;
    const vals = d.series.flatMap((s) => s.values).filter((v) => v !== null); const hi = o.yMax ?? Math.max(1, Math.ceil(Math.max(...vals, 1) / (o.step || 5)) * (o.step || 5));
    const n = d.labels.length; const gw = iw / n; const bw = Math.max(4, Math.min(42, (gw * 0.74) / d.series.length));
    const y = (v) => T + ih - (v / hi) * ih; let g = '';
    for (let i = 0; i <= 4; i++) { const t = (hi * i) / 4; g += `<line x1="${L}" x2="${L + iw}" y1="${y(t)}" y2="${y(t)}" style="stroke:var(--line-2)"/><text x="${L - 6}" y="${y(t) + 4}" text-anchor="end">${Math.round(t)}</text>`; }
    if (o.target) g += `<line x1="${L}" x2="${L + iw}" y1="${y(o.target)}" y2="${y(o.target)}" style="stroke:var(--ink-3)" stroke-dasharray="4 4"/>`;
    d.labels.forEach((l, i) => {
      const cx = L + gw * i + gw / 2; const x0 = cx - (bw * d.series.length) / 2;
      d.series.forEach((s, si) => { const v = s.values[i]; if (v === null || v === undefined) return; const col = typeof s.color === 'function' ? s.color(v, i) : s.color; const bh = Math.max(1, ih - (y(v) - T)); const act = o.act ? `data-act="${o.act}" data-i="${i}" style="fill:${col};cursor:pointer"` : `style="fill:${col}"`;
        g += `<rect x="${x0 + bw * si + 1}" y="${y(v)}" width="${bw - 2}" height="${bh}" rx="2" ${act}><title>${esc(l)} · ${esc(s.name)}: ${v}${o.unit ?? ''}</title></rect>`;
        if (o.values !== false && bw >= 16) g += `<text x="${x0 + bw * si + bw / 2}" y="${y(v) - 4}" text-anchor="middle" class="lbl-strong" style="font-size:10.5px">${o.unit === '%' ? Math.round(v) : v}</text>`; });
      const lbl = esc(String(l).length > 14 ? String(l).slice(0, 13) + '…' : l);
      g += o.rot ? `<text transform="translate(${cx + 3} ${h - B + 12}) rotate(-38)" text-anchor="end">${lbl}</text>` : `<text x="${cx}" y="${h - 10}" text-anchor="middle">${lbl}</text>`;
    });
    return `<svg width="${w}" height="${h}" role="img">${g}</svg>`;
  },
  _donut(d, o) {
    const { w, h } = o; const r = Math.min(h / 2 - 6, 86); const cx = Math.min(w / 2, r + 10), cy = h / 2; const tot = sum(d.items.map((i) => i.value)) || 1;
    let a0 = -Math.PI / 2; let g = '';
    d.items.forEach((it) => { if (!it.value) return; const a1 = a0 + (it.value / tot) * Math.PI * 2; const large = a1 - a0 > Math.PI ? 1 : 0; const p = (a, rr) => [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]; const [x1, y1] = p(a0, r), [x2, y2] = p(a1, r), [x3, y3] = p(a1, r * 0.62), [x4, y4] = p(a0, r * 0.62);
      g += it.value === tot ? `<circle cx="${cx}" cy="${cy}" r="${r * 0.81}" fill="none" style="stroke:${it.color}" stroke-width="${r * 0.38}"/>` : `<path d="M${x1} ${y1}A${r} ${r} 0 ${large} 1 ${x2} ${y2}L${x3} ${y3}A${r * 0.62} ${r * 0.62} 0 ${large} 0 ${x4} ${y4}Z" style="fill:${it.color};stroke:var(--surface)" stroke-width="2"><title>${esc(it.label)}: ${it.value}</title></path>`; a0 = a1; });
    g += `<text x="${cx}" y="${cy + 2}" text-anchor="middle" class="lbl-strong" style="font:600 26px var(--f-display)">${d.center ?? tot}</text><text x="${cx}" y="${cy + 20}" text-anchor="middle">${esc(d.centerLabel || 'total')}</text>`;
    let ly = cy - (d.items.length * 22) / 2 + 12; const lx = cx + r + 22;
    d.items.forEach((it) => { g += `<rect x="${lx}" y="${ly - 9}" width="10" height="10" rx="2" style="fill:${it.color}"/><text x="${lx + 16}" y="${ly}" style="fill:var(--ink-2);font-size:12px">${esc(it.label.length > Math.max(6, Math.floor((w - lx - 44) / 6.6)) ? it.label.slice(0, Math.max(6, Math.floor((w - lx - 44) / 6.6)) - 1) + '…' : it.label)}<title>${esc(it.label)}</title></text><text x="${w - 4}" y="${ly}" text-anchor="end" class="lbl-strong" style="font:600 13px var(--f-display)">${it.value}</text>`; ly += 22; });
    return `<svg width="${w}" height="${h}" role="img">${g}</svg>`;
  },
  hbars(items, o = {}) {
    if (!items.length) return UI.empty('chart', 'No data for this selection');
    const max = o.max || Math.max(...items.map((i) => i.value || 0), 1);
    return `<div class="hbars">${items.map((it, i) => { const tag = it.go ? 'button' : 'div'; const goA = it.go ? `data-go="${it.go[0]}" data-id="${esc(typeof it.go[1] === 'object' ? JSON.stringify(it.go[1]) : it.go[1])}"` : it.act ? `data-act="${it.act}" data-v="${esc(it.v)}"` : '';
      return `<${tag} class="hbar" ${goA} ${it.act ? 'style="cursor:pointer"' : ''}><span class="hb-lbl">${o.rank ? `<span class="rank">${i + 1}</span>` : ''}${esc(it.label)}${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</span><span class="hb-track"><i style="width:${Math.max(0, Math.min(100, ((it.value || 0) / max) * 100))}%;background:${it.color || 'var(--accent)'}"></i>${o.target ? `<span class="tgt" style="left:${(o.target / max) * 100}%" title="Target ${o.target}"></span>` : ''}</span><span class="hb-val">${it.value === null || it.value === undefined ? '—' : (o.fmt ? o.fmt(it.value) : it.value)}</span></${tag}>`; }).join('')}</div>`;
  },
  stackbar(items) { const t = sum(items.map((i) => i.value)) || 1; return `<div class="stackbar">${items.map((i) => (i.value ? `<i style="width:${(i.value / t) * 100}%;background:${i.color}" title="${esc(i.label)}: ${i.value}"></i>` : '')).join('')}</div><div class="legend" style="margin-top:10px">${items.map((i) => `<span><i style="background:${i.color}"></i>${esc(i.label)} <b>${i.value}</b></span>`).join('')}</div>`; },
  ring(p, size = 120, label = 'Overall') { const r = size / 2 - 8; const c = 2 * Math.PI * r; const v = p ?? 0; return `<div class="ring" style="width:${size}px;height:${size}px"><svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" style="stroke:var(--surface-3)" stroke-width="10"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" style="stroke:${Domain.bandColor(p)}" stroke-width="10" stroke-dasharray="${(c * v) / 100} ${c}" transform="rotate(-90 ${size / 2} ${size / 2})" stroke-linecap="round"/></svg><div class="rv"><b>${p === null || p === undefined ? '—' : Math.round(p) + '%'}</b><span>${esc(label)}</span></div></div>`; },
  sBoxes(score, prev) { return `<div class="scorebox">${FS.S_KEYS.map((s) => { const c = score && score[s]; const p = c ? c.pct : null; const pp = prev && prev[s] ? prev[s].pct : null; const d = p !== null && pp !== null ? Math.round(p - pp) : null; return `<div class="sb"><div class="row between">${UI.stag(s)}<span class="small muted">${esc(Domain.sName(s))}</span></div><div class="row between"><span class="v">${fmtPct(p)}</span>${d !== null ? `<span class="delta ${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '+' : ''}${d}</span>` : ''}</div><div class="bar"><i style="width:${p || 0}%;background:var(--${s.toLowerCase()})"></i></div>${c && c.max ? `<span class="tiny faint">${c.got} / ${c.max} pts</span>` : ''}</div>`; }).join('')}</div>`; },

  /* ---------- photos ---------- */
  pickFiles(opts = {}) { return new Promise((res) => { const i = document.createElement('input'); i.type = 'file'; i.accept = opts.accept || 'image/*'; if (opts.multiple !== false) i.multiple = true; if (opts.capture) i.setAttribute('capture', 'environment'); i.style.display = 'none'; document.body.appendChild(i); i.onchange = () => { res([...i.files]); i.remove(); }; i.click(); setTimeout(() => { if (!i.files || !i.files.length) { /* user may cancel */ } }, 60000); }); },
  loadImg(src) { return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; }); },
  readURL(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); }); },
  async shrink(src, maxW, q, maxBytes) { const im = await UI.loadImg(src); let w = im.naturalWidth || im.width, h = im.naturalHeight || im.height; const k = Math.min(1, maxW / w); w = Math.round(w * k); h = Math.round(h * k); const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(im, 0, 0, w, h); let out = c.toDataURL('image/jpeg', q); while (maxBytes && out.length * 0.75 > maxBytes && q > 0.3) { q -= 0.1; out = c.toDataURL('image/jpeg', q); } return { url: out, w, h }; },
  async processPhoto(file, extra = {}) {
    if (!/^image\/(jpeg|png|webp|gif|heic|heif)$/i.test(file.type) && !/\.(jpe?g|png|webp|gif|heic)$/i.test(file.name)) throw new Error(file.name + ' is not a supported image type.');
    if (file.size > 25 * 1024 * 1024) throw new Error(file.name + ' is larger than 25 MB.');
    const src = await UI.readURL(file);
    const full = await UI.shrink(src, 1280, 0.72, 180000); const thumb = await UI.shrink(full.url, 260, 0.62, 16000);
    return Object.assign({ full: full.url, thumb: thumb.url, name: file.name, type: 'image/jpeg', size: Math.round(full.url.length * 0.75), w: full.w, h: full.h, by: App.user ? App.user.id : '', at: nowISO() }, extra);
  },
  async capture(extra, opts = {}) {
    const files = await UI.pickFiles({ capture: opts.capture, multiple: true }); const out = [];
    for (const f of files) { try { let p = await UI.processPhoto(f, extra); if (opts.annotate) { const a = await UI.annotate(p.full); if (a) { p.full = a; p.thumb = (await UI.shrink(a, 260, 0.62, 16000)).url; } } out.push(await Store.savePhoto(p)); } catch (e) { UI.toast(e.message || 'Photo could not be read', 'bad'); } }
    return out;
  },
  annotate(src) {
    return new Promise(async (res) => {
      const im = await UI.loadImg(src); let done = false;
      UI.modal({ title: 'Mark up photo', sub: 'Draw on the photo to highlight the problem area.', size: 'wide', body: `<div class="row" style="margin-bottom:8px"><span class="small muted">Pen</span><div class="seg" id="penc"><button class="on" data-c="#e11d1d">Red</button><button data-c="#f2b705">Yellow</button><button data-c="#ffffff">White</button></div><button class="btn sm" id="undo">Undo</button></div><div class="annot"><canvas id="acv"></canvas></div>`,
        actions: [{ label: 'Skip', onClick: () => { done = true; res(null); } }, { label: 'Save markup', cls: 'primary', onClick: () => { done = true; res($('#acv').toDataURL('image/jpeg', 0.8)); } }],
        onMount: (m) => {
          const cv = $('#acv', m); cv.width = im.naturalWidth; cv.height = im.naturalHeight; const x = cv.getContext('2d'); x.drawImage(im, 0, 0); let color = '#e11d1d'; const strokes = []; let curS = null;
          const redraw = () => { x.drawImage(im, 0, 0); strokes.forEach((s) => { x.strokeStyle = s.c; x.lineWidth = Math.max(4, cv.width / 160); x.lineCap = 'round'; x.lineJoin = 'round'; x.beginPath(); s.p.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); x.stroke(); }); };
          const pos = (e) => { const r = cv.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * cv.width, ((e.clientY - r.top) / r.height) * cv.height]; };
          cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); curS = { c: color, p: [pos(e)] }; strokes.push(curS); });
          cv.addEventListener('pointermove', (e) => { if (curS) { curS.p.push(pos(e)); redraw(); } });
          cv.addEventListener('pointerup', () => (curS = null));
          $('#penc', m).addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; color = b.dataset.c; $$('#penc button', m).forEach((z) => z.classList.toggle('on', z === b)); });
          $('#undo', m).addEventListener('click', () => { strokes.pop(); redraw(); });
          const obs = new MutationObserver(() => { if (!document.body.contains(m)) { obs.disconnect(); if (!done) res(null); } }); obs.observe(document.body, { childList: true });
        } });
    });
  },
  thumbs(refs, opts = {}) { if (!refs || !refs.length) return opts.empty || ''; return `<div class="thumbs">${refs.map((r, i) => `<span class="thumb ${opts.lg ? 'lg' : ''}" data-act="lightbox" data-ref="${attr(r)}" role="button" tabindex="0"><img src="${r.thumb}" alt="${esc(r.caption || 'Photo')}" loading="lazy">${opts.remove ? `<button class="x" data-act="${opts.remove}" data-i="${i}" data-k="${esc(opts.k || '')}" aria-label="Remove photo">×</button>` : ''}</span>`).join('')}</div>`; },
  async lightbox(ref, cap) {
    const lb = document.createElement('div'); lb.className = 'lightbox'; lb.innerHTML = `<div style="text-align:center"><img src="${ref.thumb}" alt=""><div class="lb-cap">${esc(cap || ref.caption || '')}${ref.by ? ' · ' + esc(Domain.uname(ref.by)) : ''}${ref.at ? ' · ' + fmtDT(ref.at) : ''}${ref.inline ? ' · illustration' : ''}</div></div>`;
    lb.addEventListener('click', () => lb.remove()); document.body.appendChild(lb);
    const full = await Store.photoFull(ref); const img = $('img', lb); if (img && full) img.src = full;
  },
};

/* ---------- global event wiring ---------- */
function wire() {
  document.addEventListener('click', async (e) => {
    const pop = $('.pop'); if (pop && !e.target.closest('.pop') && !e.target.closest('[data-act="notif"],[data-act="me-menu"]')) pop.remove();
    if (!e.target.closest('.search')) { const r = $('#gres'); if (r) r.innerHTML = ''; }
    const g = e.target.closest('[data-go]');
    if (g && !e.target.closest('[data-act]:not([data-go])')) { e.preventDefault(); let id = g.dataset.id; let params = {}; if (id && id.startsWith('{')) params = JSON.parse(id); else if (id) params = { id }; UI.closeModal(); App.go(g.dataset.go, params); return; }
    const a = e.target.closest('[data-act]');
    if (a && Acts[a.dataset.act]) { e.preventDefault(); try { await Acts[a.dataset.act](a, e); } catch (err) { console.error(err); UI.toast(err.message || 'Something went wrong', 'bad'); } }
  });
  document.addEventListener('change', (e) => {
    const f = e.target.closest('[data-filter]');
    if (f) { const [key, k] = f.dataset.filter.split(':'); if (k) { const s = App.st(key, {}); s[k] = f.value; const t = App.ui['t:' + key]; if (t) t.page = 0; } else App.ui[key] = f.value; App.render(); return; }
    if (e.target.id === 'plantSel') { App.plant = e.target.value; LS.set('plant', App.plant); Domain._ss = null; App.render(); }
    const h = e.target.closest('[data-change]'); if (h && Acts[h.dataset.change]) Acts[h.dataset.change](h, e);
  });
  document.addEventListener('input', (e) => {
    if (e.target.id === 'gsearch') Search.run(e.target.value);
    if (e.target.dataset.actInput === 'multi-filter') { const q = e.target.value.toLowerCase(); $$('label', e.target.nextElementSibling).forEach((l) => (l.style.display = l.textContent.toLowerCase().includes(q) ? '' : 'none')); }
    const h = e.target.closest('[data-input]'); if (h && Acts[h.dataset.input]) Acts[h.dataset.input](h, e);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if ($('.lightbox')) $('.lightbox').remove(); else if ($('.modal-back')) UI.closeModal(); else if ($('.pop')) $('.pop').remove(); }
    if (e.target.id === 'gsearch' && e.key === 'Enter') { const f = $('#gres a'); if (f) f.click(); }
    if (e.key === 'Enter' && e.target.matches('[role=button][data-act]')) e.target.click();
  });
  window.addEventListener('online', () => { App.refreshChrome(); Store.flush(); UI.toast('Back online. Synchronising…', 'good'); });
  window.addEventListener('offline', () => { App.refreshChrome(); UI.toast('You are offline. Audit responses are saved on this device and will sync later.'); });
  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => UI.drawCharts(), 150); });
  setInterval(() => { if (Store.outbox.length || LS.get('pendingSubmits', []).length) Store.flush(); const t = todayISO(); if (t !== Domain.today) { Domain.today = t; App.onData(new Set(['workorders'])); } }, 20000);
}

/* shell-level actions */
Object.assign(Acts, {
  'nav-open'() { App.navOpen = true; $('.app').classList.add('nav-open'); },
  'nav-close'() { App.navOpen = false; $('.app').classList.remove('nav-open'); },
  'refresh-view'() { App.render(); },
  back() { App.back(); },
  tab(el) { const key = el.dataset.key; if (key.includes(':')) { const [k, f] = key.split(':'); App.st(k, {})[f] = el.dataset.v; } else App.ui[key] = el.dataset.v; const t = App.ui['t:' + key]; if (t) t.page = 0; App.render(); },
  tsort(el) { const s = App.st('t:' + el.dataset.key, {}); if (s.sort === el.dataset.k) s.dir = s.dir === 'asc' ? 'desc' : 'asc'; else { s.sort = el.dataset.k; s.dir = 'asc'; } App.render(); },
  tpage(el) { App.st('t:' + el.dataset.key, {}).page = Number(el.dataset.v); App.render(); },
  lightbox(el) { UI.lightbox(JSON.parse(el.dataset.ref)); },
  notif(el) {
    if ($('.pop')) { $('.pop').remove(); return; }
    const me = App.user.id; const list = Store.all('notifications').filter((n) => (n.to || []).includes(me)).sort((a, b) => (b.at || '').localeCompare(a.at || '')).slice(0, 40);
    const icMap = { 'Audit assigned': ['clipboard', 'b-blue'], 'Audit completed': ['check', 'b-green'], 'Audit rejected': ['x', 'b-red'], 'Critical finding created': ['flag', 'b-red'], 'Action assigned': ['wrench', 'b-indigo'], 'Action submitted': ['send', 'b-amber'], 'Action rejected': ['x', 'b-red'], 'Action verified': ['check', 'b-green'], 'Action closed': ['check', 'b-gray'], 'Audit due': ['clock', 'b-amber'], 'Audit overdue': ['clock', 'b-red'] };
    const p = document.createElement('div'); p.className = 'pop';
    p.innerHTML = `<div class="pop-h"><h3>Notifications</h3><button class="btn sm ghost" data-act="notif-readall">Mark all read</button></div><div class="pop-b">${list.length ? list.map((n) => { const [ic, cl] = icMap[n.type] || ['bell', 'b-gray']; const unread = !(n.readBy || []).includes(me); return `<div class="note ${unread ? 'unread' : ''}" data-act="notif-open" data-id="${esc(n.id)}"><span class="ic badge plain ${cl}">${icon(ic)}</span><div class="grow"><div style="font-weight:${unread ? 600 : 500}">${esc(n.title)}</div><div class="small muted">${esc(n.body || '')}</div><div class="tiny faint">${fmtDT(n.at)} · ${esc((n.channels || ['In-app']).join(', '))}</div></div></div>`; }).join('') : UI.empty('bell', 'No notifications yet')}</div>`;
    $('#top').appendChild(p);
  },
  async 'notif-open'(el) { const n = Store.get('notifications', el.dataset.id); $('.pop') && $('.pop').remove(); if (!n) return; if (!(n.readBy || []).includes(App.user.id)) Store.patch('notifications', n.id, { readBy: (n.readBy || []).concat(App.user.id) }); if (n.link) App.go(n.link.page, { id: n.link.id }); },
  async 'notif-readall'() { const me = App.user.id; const list = Store.all('notifications').filter((n) => (n.to || []).includes(me) && !(n.readBy || []).includes(me)); $('.pop') && $('.pop').remove(); for (const n of list) await Store.patch('notifications', n.id, { readBy: (n.readBy || []).concat(me) }); },
  'me-menu'() {
    if ($('.pop')) { $('.pop').remove(); return; }
    const u = App.user; const p = document.createElement('div'); p.className = 'pop'; p.style.width = 'min(320px, calc(100vw - 16px))';
    p.innerHTML = `<div class="pop-h"><div class="row">${UI.av(u.id, 'lg')}<div><b>${esc(u.name)}</b><div class="small muted">${esc(u.designation || '')}</div><div class="tiny faint mono">${esc(u.id)} · ${esc(ROLE_LABEL[u.role])}</div></div></div></div><div class="pop-b" style="padding:8px"><button class="btn ghost block" style="justify-content:flex-start" data-act="change-pwd">${icon('lock')}Change password</button><button class="btn ghost block" style="justify-content:flex-start" data-act="switch-user">${icon('users')}Switch user</button><button class="btn ghost block" style="justify-content:flex-start" data-act="logout">${icon('logout')}Sign out</button></div>`;
    $('#top').appendChild(p);
  },
  logout() { Domain.log('Login', App.user.id, 'Signed out'); App.user = null; LS.del('session'); if (Store.adapter && Store.adapter.logout) Store.adapter.logout(); App.stack = []; App.route = { page: 'dashboard', params: {} }; $('#app').innerHTML = ''; App.render(); },
  'switch-user'() { Acts.logout(); },
  'change-pwd'() {
    const fields = [{ name: 'cur', label: 'Current password', type: 'password', required: true, full: true }, { name: 'n1', label: 'New password', type: 'password', required: true, full: true, validate: (v) => (v.length < 8 || !/\d/.test(v) || !/[A-Za-z]/.test(v) ? 'Use at least 8 characters with letters and numbers' : '') }, { name: 'n2', label: 'Repeat new password', type: 'password', required: true, full: true, validate: (v, o) => (v !== o.n1 ? 'Passwords do not match' : '') }];
    UI.modal({ title: 'Change password', body: UI.form(fields), actions: [{ label: 'Cancel' }, { label: 'Update password', cls: 'primary', onClick: async (m) => { const v = UI.readForm(m, fields); if (!v) return false; const u = App.user; if (Store.adapter && Store.adapter.changePassword) { await Store.adapter.changePassword(v.cur, v.n1); } else { if ((await pwdHash(u.id, v.cur)) !== u.pwd) { UI.toast('Current password is not correct', 'bad'); return false; } await Store.patch('users', u.id, { pwd: await pwdHash(u.id, v.n1), pwdChangedAt: nowISO() }); } Domain.log('User Role', u.id, 'Password changed'); UI.toast('Password updated', 'good'); } }] });
  },
});

/* ---------- global search ---------- */
const Search = {
  run(q) {
    const box = $('#gres'); if (!box) return; q = q.trim().toLowerCase(); if (q.length < 2) { box.innerHTML = ''; return; }
    const m = (s) => String(s || '').toLowerCase().includes(q); const res = [];
    Domain.wos().filter((w) => m(w.no) || m(w.zone) || m(w.plannedDate) || m(fmtDate(w.plannedDate).replace(/\u2011/g, '-'))).slice(0, 6).forEach((w) => res.push(['Audit work orders', 'wo', w.id, w.no, `${w.zone} · ${fmtDate(w.plannedDate)} · ${Domain.woStatus(w)}`]));
    Domain.scopeZones().filter((z) => m(z.code) || m(z.name) || m(z.dept)).slice(0, 5).forEach((z) => res.push(['Zones', 'zone', z.id, z.code, z.name + ' · ' + z.dept]));
    Domain.findings().filter((f) => m(f.no) || m(f.desc)).slice(0, 6).forEach((f) => res.push(['Findings', 'finding', f.id, f.no, f.zone + ' · ' + f.desc]));
    Domain.actions().filter((a) => m(a.no) || m(a.desc)).slice(0, 6).forEach((a) => res.push(['Actions', 'action', a.id, a.no, a.zone + ' · ' + a.desc]));
    if (Domain.can('User Role') || Domain.can('5S Organization')) Store.all('users').filter((u) => m(u.name) || m(u.id) || m(u.dept)).slice(0, 5).forEach((u) => res.push(['Employees', Domain.can('User Role') ? 'users' : 'org', Domain.can('User Role') ? JSON.stringify({ q: u.id }) : '', u.name, `${u.id} · ${u.dept} · ${ROLE_LABEL[u.role]}`]));
    if (!res.length) { box.innerHTML = `<div class="search-res"><div class="sr-h">No matches for “${esc(q)}”</div></div>`; return; }
    let last = ''; box.innerHTML = `<div class="search-res">${res.map(([g, p, id, t, s]) => { const h = g !== last ? `<div class="sr-h">${g}</div>` : ''; last = g; return `${h}<a data-go="${p}" data-id="${esc(id)}"><b class="mono">${esc(t)}</b><span class="small muted">${esc(s)}</span></a>`; }).join('')}</div>`;
  },
};
