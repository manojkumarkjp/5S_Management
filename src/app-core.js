/* ===== 5S app core: utilities, icons, data store, domain helpers ===== */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const attr = (o) => esc(JSON.stringify(o));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
const uid = (p = '') => p + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 7);
const SESSION = uid('s');
const sum = (a) => a.reduce((x, y) => x + (Number(y) || 0), 0);
const avg = (a) => { const v = a.filter((x) => x !== null && x !== undefined && !isNaN(x)); return v.length ? sum(v) / v.length : null; };
const round1 = (v) => (v === null || v === undefined || isNaN(v) ? null : Math.round(v * 10) / 10);
const groupBy = (arr, fn) => arr.reduce((m, x) => { const k = fn(x); (m[k] = m[k] || []).push(x); return m; }, {});
const uniq = (a) => [...new Set(a)];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const nowISO = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
function todayISO() { const d = new Date(); return d.getFullYear() + '-' + FS.pad(d.getMonth() + 1) + '-' + FS.pad(d.getDate()); }
function fmtDate(s) { if (!s) return '—'; const d = String(s).slice(0, 10).split('-'); if (d.length < 3) return s; return `${d[2]}\u2011${MON[Number(d[1]) - 1]}\u2011${d[0]}`; }
function fmtDT(s) { if (!s) return '—'; const d = new Date(s); if (isNaN(d)) return fmtDate(s); return fmtDate(d.getFullYear() + '-' + FS.pad(d.getMonth() + 1) + '-' + FS.pad(d.getDate())) + ' ' + FS.pad(d.getHours()) + ':' + FS.pad(d.getMinutes()); }
function fmtMonth(k) { const [y, m] = k.split('-'); return MON[Number(m) - 1] + ' ' + y; }
function fmtPct(v, d = 0) { return v === null || v === undefined || isNaN(v) ? '—' : (d ? Number(v).toFixed(d) : Math.round(v)) + '%'; }
function relDays(s) { const n = FS.diffDays(s, todayISO()); if (n === 0) return 'today'; if (n === 1) return 'tomorrow'; if (n === -1) return 'yesterday'; return n > 0 ? `in ${n} days` : `${-n} days ago`; }
function deviceInfo() { const u = navigator.userAgent; const b = /Edg\//.test(u) ? 'Edge' : /Chrome\//.test(u) ? 'Chrome' : /Safari\//.test(u) ? 'Safari' : /Firefox\//.test(u) ? 'Firefox' : 'Browser'; const o = /Android/.test(u) ? 'Android' : /iPhone|iPad/.test(u) ? 'iOS' : /Windows/.test(u) ? 'Windows' : /Mac/.test(u) ? 'macOS' : 'Linux'; return b + ' / ' + o; }
async function sha256(t) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join(''); }
const pwdHash = (id, p) => sha256('5s-demo:' + id + ':' + p);
function deepMerge(base, part) { const out = clone(base) || {}; Object.entries(part || {}).forEach(([k, v]) => { if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) out[k] = deepMerge(out[k], v); else out[k] = clone(v); }); return out; }

/* ---------- icons (stroke, 24 grid) ---------- */
const ICONS = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  org: '<rect x="9" y="2" width="6" height="5" rx="1"/><rect x="2" y="17" width="6" height="5" rx="1"/><rect x="16" y="17" width="6" height="5" rx="1"/><path d="M12 7v5M5 17v-3h14v3"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
  wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  chart: '<path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5M12 7v5l4 2"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4M12 17h.01"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
  play: '<polygon points="6 3 20 12 6 21 6 3"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5M12 3v12"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  unlock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  filter: '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>',
  left: '<path d="m15 18-6-6 6-6"/>', right: '<path d="m9 18 6-6-6-6"/>', down: '<path d="m6 9 6 6 6-6"/>',
  bulb: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5M9 18h6M10 22h4"/>',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  map: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  layers: '<path d="m12 2 10 5-10 5L2 7Z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
  wifioff: '<path d="M12 20h.01M8.5 16.43a5 5 0 0 1 7 0M2 8.82a15 15 0 0 1 4.17-2.65M10.66 5c4.01-.36 8.14.9 11.34 3.76M16.85 11.25a10 10 0 0 1 2.22 1.68M5 13a10 10 0 0 1 5.24-2.76M2 2l20 20"/>',
  repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  award: '<circle cx="12" cy="8" r="6"/><path d="M15.48 12.89 17 22l-5-3-5 3 1.52-9.11"/>',
  pen: '<path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.59 7.59"/><circle cx="11" cy="11" r="2"/>',
  user: '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  zone: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><rect x="7" y="7" width="10" height="10" rx="1"/>',
};
const icon = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ''}</svg>`;

/* ---------- IndexedDB key/value (offline cache + outbox) ---------- */
const IDB = {
  db: null,
  async open() { if (this.db) return this.db; return (this.db = await new Promise((res) => { try { const r = indexedDB.open('fives-cache', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => res(null); } catch (e) { res(null); } })); },
  async get(k) { const db = await this.open(); if (!db) return null; return new Promise((res) => { try { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result ?? null); q.onerror = () => res(null); } catch (e) { res(null); } }); },
  async set(k, v) { const db = await this.open(); if (!db) return; return new Promise((res) => { try { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => res(); t.onerror = () => res(); } catch (e) { res(); } }); },
};
const LS = { get(k, d = null) { try { const v = localStorage.getItem('fives:' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('fives:' + k, JSON.stringify(v)); } catch (e) {} }, del(k) { try { localStorage.removeItem('fives:' + k); } catch (e) {} } };

/* ---------- data store ---------- */
const COLLS = ['cfg', 'users', 'zones', 'checksheets', 'schedules', 'workorders', 'findings', 'actions', 'improvements', 'notifications', 'logs'];
const Store = {
  data: {}, arrays: {}, listeners: new Set(), mode: 'loading', readOnly: false, outbox: [], adapter: null, loaded: new Set(), _dirty: new Set(), _t: null, _chains: {}, photoCache: new Map(),
  all(c) { if (!this.arrays[c]) this.arrays[c] = [...(this.data[c] || new Map()).values()]; return this.arrays[c]; },
  get(c, id) { return (this.data[c] || new Map()).get(id); },
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
  _changed(c) { this._dirty.add(c); delete this.arrays[c]; clearTimeout(this._t); this._t = setTimeout(() => { const d = new Set(this._dirty); this._dirty.clear(); this.listeners.forEach((fn) => fn(d)); this._persist(); }, 40); },
  _setLocal(c, id, doc) { if (!this.data[c]) this.data[c] = new Map(); if (doc === null) this.data[c].delete(id); else this.data[c].set(id, Object.assign({}, doc, { id })); this._changed(c); },
  _applyOp(w) { if (w.op === 'set') this._setLocal(w.c, w.id, w.doc); else if (w.op === 'update') this._setLocal(w.c, w.id, deepMerge(this.get(w.c, w.id) || {}, w.doc)); else if (w.op === 'delete') this._setLocal(w.c, w.id, null); },
  applySnapshot(c, docs) {
    const m = new Map(); docs.forEach((d) => m.set(d.id, d)); this.data[c] = m; this.loaded.add(c);
    this.outbox.filter((w) => w.c === c).forEach((w) => this._applyOp(w));
    this._changed(c);
  },
  applyAll(obj) { Object.entries(obj || {}).forEach(([c, docs]) => this.applySnapshot(c, docs)); },
  async put(c, id, doc) { const d = clone(doc); delete d.id; this._setLocal(c, id, d); return this._send({ op: 'set', c, id, doc: d }); },
  async patch(c, id, part) { const p = clone(part); this._applyOp({ op: 'update', c, id, doc: p }); return this._send({ op: 'update', c, id, doc: p }); },
  async remove(c, id) { this._setLocal(c, id, null); return this._send({ op: 'delete', c, id }); },
  _send(w) {
    if (this.readOnly) { UI.toast('You have view-only access. Changes are not saved to the shared data.', 'bad'); return Promise.resolve(false); }
    const key = w.c + '/' + w.id;
    const run = async () => {
      if (!this.adapter || !navigator.onLine) { this._queue(w); return false; }
      try { await this.adapter.write(w); return true; }
      catch (e) {
        const code = e && e.code;
        if (code === 'invalid_argument' && w.op === 'update' && !this.adapter.remoteHas?.(w.c, w.id)) { try { await this.adapter.write({ op: 'set', c: w.c, id: w.id, doc: this.get(w.c, w.id) }); return true; } catch (e2) { /* fallthrough */ } }
        if (code === 'invalid_argument' || code === 'not_granted' || code === 'forbidden') { this.readOnly = this.adapter.kind === 'db'; UI.toast(this.readOnly ? 'Your access to this page is view-only, so changes are not saved.' : 'The server refused this change: ' + (e.message || code), 'bad'); App.refreshChrome(); return false; }
        if (code === 'quota_exceeded') { UI.toast('The shared database is full. Ask the administrator to archive old records.', 'bad'); return false; }
        this._queue(w); return false;
      }
    };
    const p = (this._chains[key] || Promise.resolve()).then(run, run); this._chains[key] = p; return p;
  },
  _queue(w) { this.outbox.push(w); IDB.set('outbox', this.outbox); App.refreshChrome(); },
  async flush() {
    if (!this.adapter || !navigator.onLine || !this.outbox.length || this._flushing) return;
    this._flushing = true;
    try {
      while (this.outbox.length && navigator.onLine) {
        const w = this.outbox[0];
        try { await this.adapter.write(w.op === 'update' ? { op: 'set', c: w.c, id: w.id, doc: this.get(w.c, w.id) || w.doc } : w); this.outbox.shift(); await IDB.set('outbox', this.outbox); }
        catch (e) { if (e && (e.code === 'invalid_argument' || e.code === 'forbidden')) { this.outbox.shift(); continue; } break; }
      }
      // queued submissions (offline audit submit)
      const pend = LS.get('pendingSubmits', []);
      for (const id of pend) { try { await Domain.submitAudit(id, { fromQueue: true }); } catch (e) { break; } }
    } finally { this._flushing = false; App.refreshChrome(); }
  },
  _persistT: null,
  _persist() { clearTimeout(this._persistT); this._persistT = setTimeout(() => { const snap = {}; COLLS.forEach((c) => { if (this.data[c]) snap[c] = this.all(c); }); IDB.set('snapshot', { at: Date.now(), data: snap }); }, 2500); },
  async loadCache() { const s = await IDB.get('snapshot'); this.outbox = (await IDB.get('outbox')) || []; if (s && s.data) { Object.entries(s.data).forEach(([c, docs]) => { const m = new Map(); docs.forEach((d) => m.set(d.id, d)); this.data[c] = m; delete this.arrays[c]; }); return true; } return false; },
  async nextNo(kind) {
    const n = await this.adapter.nextNumber(kind);
    const st = Domain.settings(); const y = new Date().getFullYear();
    return { n, no: FS.formatNo((st.numbering || {})[kind], kind, y, n), id: kind + '-' + FS.pad(n, 6) };
  },
  async savePhoto(p) { // p: {full, thumb, ...meta}
    const id = uid('PH-'); const meta = Object.assign({}, p); delete meta.full;
    this.photoCache.set(id, p.full);
    if (this.adapter && this.adapter.savePhoto) { try { const r = await this.adapter.savePhoto(id, p); if (r && r.id) return Object.assign(meta, { id: r.id, url: r.url }); } catch (e) { /* fall back to queued doc */ } }
    return Object.assign(meta, { id });
  },
  async photoFull(ref) {
    if (!ref) return ''; if (ref.inline) return ref.thumb; if (ref.url) return ref.url;
    if (this.photoCache.has(ref.id)) return this.photoCache.get(ref.id);
    try { const f = this.adapter && (await this.adapter.getPhoto(ref.id)); if (f) { this.photoCache.set(ref.id, f); return f; } } catch (e) {}
    return ref.thumb;
  },
};

/* ---------- adapter: claude.ai shared db ---------- */
function DbAdapter(db) {
  const unsubs = [];
  return {
    kind: 'db',
    start() {
      COLLS.forEach((c) => unsubs.push(db.collection(c).onSnapshot((snap) => Store.applySnapshot(c, snap.docs.map((d) => Object.assign({}, d.data(), { id: d.id }))), (e) => { console.warn('snapshot error', c, e); if (e && e.code === 'unavailable') setTimeout(() => location.reload(), 8000); })));
    },
    remoteHas(c, id) { return false; },
    async write(w) {
      const ref = db.doc(w.c + '/' + w.id);
      if (w.op === 'set') return ref.set(w.doc);
      if (w.op === 'update') return ref.update(w.doc);
      if (w.op === 'delete') return ref.delete();
    },
    async nextNumber(kind) {
      const ref = db.doc('cfg/counters');
      for (let i = 0; i < 25; i++) {
        let r; try { r = await ref.acquire({ holder: SESSION, ttlMs: 1500 }); } catch (e) { r = { acquired: false }; }
        if (r.acquired) {
          const s = await ref.get(); const cur = Number(((s.exists && s.data()) || {})[kind] || 0); const n = cur + 1;
          if (s.exists) await ref.update({ [kind]: n }); else await ref.set({ [kind]: n });
          return n;
        }
        await sleep(200 + Math.random() * 300);
      }
      throw { code: 'unavailable', message: 'Numbering service busy, try again.' };
    },
    async savePhoto(id, p) { await db.doc('photos/' + id).set({ full: p.full, thumb: p.thumb, name: p.name || '', at: nowISO(), by: p.by || '' }); return { id }; },
    async getPhoto(id) { const s = await db.doc('photos/' + id).get(); return s.exists ? s.data().full : null; },
    async acquire(path, ttl) { try { const r = await db.doc(path).acquire({ holder: SESSION, ttlMs: ttl || 20000 }); return r.acquired; } catch (e) { return false; } },
  };
}

/* ---------- domain helpers ---------- */
const ROLE_LABEL = { admin: 'System Administrator', facilitator: '5S Facilitator', auditor: 'Auditor', leader: 'Zone Leader', member: 'Zone Member', management: 'Management' };
const WO_BADGE = { Draft: 'b-gray', Assigned: 'b-blue', Accepted: 'b-blue', Due: 'b-amber', 'In Progress': 'b-indigo', Submitted: 'b-teal', 'Under Review': 'b-teal', Approved: 'b-green', Closed: 'b-gray', Cancelled: 'b-gray', Overdue: 'b-red', Planned: 'b-outline', Completed: 'b-green' };
const ACT_BADGE = { Open: 'b-blue', 'In Progress': 'b-indigo', Completed: 'b-teal', 'Submitted for Verification': 'b-amber', Verified: 'b-green', Rejected: 'b-red', Overdue: 'b-red', Closed: 'b-gray' };
const F_BADGE = { Open: 'b-blue', 'In Progress': 'b-indigo', Closed: 'b-gray' };
const AV_COLORS = ['#1d5d90', '#7a4fb5', '#0f7d83', '#b4462c', '#5f7d1f', '#9c5a14', '#3b56b8', '#a03a6e', '#2f8f5b', '#6b6f2a'];

const Domain = {
  today: todayISO(),
  settings() { return (Store.get('cfg', 'settings') || {}); },
  masters() { return (Store.get('cfg', 'masters') || { plants: [], apus: [], departments: [], sections: [], severities: [] }); },
  sName(s) { const n = (this.settings().sNames || {})[s]; return n ? n.name : s; },
  user(id) { return Store.get('users', id); },
  uname(id) { if (!id) return '—'; if (id === 'SYSTEM') return 'System'; const u = this.user(id); return u ? u.name : id; },
  zone(id) { return Store.get('zones', id); },
  apu(id) { return (this.masters().apus || []).find((a) => a.id === id); },
  apuName(id) { const a = this.apu(id); return a ? a.name : id || '—'; },
  plantName(id) { const p = (this.masters().plants || []).find((x) => x.id === id); return p ? p.name : id || '—'; },
  sevColor(s) { const x = (this.masters().severities || []).find((v) => v.name === s); return x ? x.color : '#888'; },
  band(p) { return FS.band(p, this.settings().bands || []); },
  bandColor(p) { const b = this.band(p); return b ? b.color : 'var(--ink-3)'; },
  initials(name) { return String(name || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase(); },
  avColor(id) { let h = 0; String(id).split('').forEach((c) => (h = (h * 31 + c.charCodeAt(0)) >>> 0)); return AV_COLORS[h % AV_COLORS.length]; },
  woStatus(w) { return FS.woDisplayStatus(w, this.today); },
  actStatus(a) { return FS.actionDisplayStatus(a, this.today); },
  findSt(f) { return FS.findingStatus(f, Store.all('actions')); },
  isActOpen(a) { return !FS.ACT_CLOSED.includes(a.status); },
  checksheet(id) { return Store.get('checksheets', id); },
  questionsOf(wo) { const cs = this.checksheet(wo.checksheetId); return (cs && cs.questions) || wo.questions || []; },
  activeChecksheet(family) { return Store.all('checksheets').filter((c) => c.family === family && c.status === 'Active').sort((a, b) => Number(b.version) - Number(a.version))[0]; },
  isDone(w) { return FS.WO_DONE.includes(w.status); },

  /* permissions & scope */
  perm(func) { const u = App.user; if (!u) return 'none'; const p = (this.settings().permissions || {})[u.role] || {}; return p[func] || 'none'; },
  can(func, level = 'view') { const order = { none: 0, limited: 1, view: 1, edit: 2 }; return (order[this.perm(func)] || 0) >= (order[level] || 1); },
  myZoneIds() {
    const u = App.user; if (!u) return [];
    const zs = Store.all('zones');
    if (u.role === 'admin') return zs.map((z) => z.id);
    if (u.role === 'leader') return zs.filter((z) => z.leader === u.id || z.backup === u.id).map((z) => z.id);
    if (u.role === 'member') return zs.filter((z) => (z.members || []).includes(u.id)).map((z) => z.id);
    return zs.filter((z) => (!u.apus || !u.apus.length || u.apus.includes(z.apu)) && (!u.plants || !u.plants.length || u.plants.includes(z.plant))).map((z) => z.id);
  },
  scopeZones() { const ids = new Set(this.myZoneIds()); return Store.all('zones').filter((z) => ids.has(z.id) && (App.plant === 'all' || z.plant === App.plant)); },
  inScope(rec) { if (!rec) return false; const u = App.user; if (u && u.role === 'auditor' && rec.auditor === u.id) return true; return this._scopeSet().has(rec.zone || rec.id); },
  _scopeSet() { if (!this._ss || this._ssv !== Store.arrays.zones || this._ssp !== App.plant + (App.user && App.user.id)) { this._ss = new Set(this.scopeZones().map((z) => z.id)); this._ssv = Store.arrays.zones; this._ssp = App.plant + (App.user && App.user.id); } return this._ss; },
  wos() { return Store.all('workorders').filter((w) => this.inScope(w)); },
  findings() { return Store.all('findings').filter((f) => this.inScope(f)); },
  actions() { const u = App.user; return Store.all('actions').filter((a) => this.inScope(a) || (u && a.responsible === u.id)); },

  /* periods */
  periodRange(p) {
    const st = this.settings(); const fy = st.fiscalYearStart || 4;
    if (!p || p.type === 'all') return ['0000-01-01', '9999-12-31'];
    if (p.type === 'month') { const s = p.value + '-01'; return [s, FS.addDays(FS.addMonths(s, 1), -1)]; }
    if (p.type === 'quarter') { const [y, q] = p.value.split('-Q').map(Number); const s = FS.addMonths(`${y}-${FS.pad(fy)}-01`, (q - 1) * 3); return [s, FS.addDays(FS.addMonths(s, 3), -1)]; }
    if (p.type === 'year') { const s = `${p.value}-${FS.pad(fy)}-01`; return [s, FS.addDays(FS.addMonths(s, 12), -1)]; }
    if (p.type === 'range') return [p.from, p.to];
    return ['0000-01-01', '9999-12-31'];
  },
  auditDate(w) { return (w.startedAt || w.plannedDate || '').slice(0, 10); },
  completedWOs(filter) { return this.applyFilter(this.wos(), filter, 'wo').filter((w) => this.isDone(w) && w.score && w.score.overall && w.score.overall.pct !== null); },
  applyFilter(list, f, kind) {
    if (!f) return list;
    const [a, b] = this.periodRange(f.period);
    return list.filter((r) => {
      if (f.apu && r.apu !== f.apu) return false;
      if (f.dept && r.dept !== f.dept) return false;
      if (f.zone && r.zone !== f.zone) return false;
      if (f.auditor && kind === 'wo' && r.auditor !== f.auditor) return false;
      if (f.auditType && kind === 'wo' && r.auditType !== f.auditType) return false;
      if (f.section && kind !== 'none') { const z = this.zone(r.zone); if (!z || z.section !== f.section) return false; }
      const d = kind === 'wo' ? (this.isDone(r) ? this.auditDate(r) : r.plannedDate) : kind === 'finding' ? r.auditDate || (r.createdAt || '').slice(0, 10) : (r.createdAt || '').slice(0, 10);
      return !(d < a || d > b);
    });
  },
  latestAudit(zoneId, before) { const l = Store.all('workorders').filter((w) => w.zone === zoneId && this.isDone(w) && w.score && (!before || this.auditDate(w) < before)).sort((a, b) => this.auditDate(b).localeCompare(this.auditDate(a))); return l[0] || null; },
  prevAudit(wo) { return Store.all('workorders').filter((w) => w.zone === wo.zone && w.id !== wo.id && this.isDone(w) && w.score && this.auditDate(w) < this.auditDate(wo)).sort((a, b) => this.auditDate(b).localeCompare(this.auditDate(a)))[0] || null; },
  nextAudit(zoneId) { const t = this.today; const w = Store.all('workorders').filter((x) => x.zone === zoneId && FS.WO_OPEN.includes(x.status)).sort((a, b) => a.plannedDate.localeCompare(b.plannedDate))[0]; if (w) return w.plannedDate; let best = null; Store.all('schedules').filter((s) => s.zone === zoneId && s.status === 'Active').forEach((s) => { const o = FS.occurrences(s, t, FS.addDays(t, 120))[0]; if (o && (!best || o < best)) best = o; }); return best; },
  zoneOpenActions(zoneId) { return Store.all('actions').filter((a) => a.zone === zoneId && this.isActOpen(a)); },

  /* repeat findings: same zone + question across distinct audits */
  repeatGroups(list) {
    const fs = list || this.findings();
    const g = groupBy(fs, (f) => f.zone + '|' + f.qid);
    const out = [];
    Object.values(g).forEach((arr) => {
      const audits = uniq(arr.map((f) => f.woId)); if (audits.length < 2) return;
      const sorted = arr.slice().sort((a, b) => (a.auditDate || '').localeCompare(b.auditDate || ''));
      const zoneAudits = Store.all('workorders').filter((w) => w.zone === sorted[0].zone && this.isDone(w)).sort((a, b) => this.auditDate(a).localeCompare(this.auditDate(b))).map((w) => w.id);
      const hit = new Set(audits); let run = 0, best = 0; zoneAudits.forEach((id) => { if (hit.has(id)) { run++; best = Math.max(best, run); } else run = 0; });
      const lastF = sorted[sorted.length - 1]; const prevF = sorted[sorted.length - 2];
      const prevActs = Store.all('actions').filter((a) => a.findingId === prevF.id);
      const effective = prevActs.length && prevActs.every((a) => FS.ACT_CLOSED.includes(a.status)) ? 'Not effective – recurred after closure' : prevActs.length ? 'Previous action still open' : 'No action on previous occurrence';
      out.push({ key: sorted[0].zone + '|' + sorted[0].qid, zone: sorted[0].zone, s: sorted[0].s, qid: sorted[0].qid, question: sorted[0].question, desc: lastF.desc, count: audits.length, consecutive: best, first: sorted[0].auditDate, last: lastF.auditDate, findings: sorted, prevAction: prevActs.map((a) => a.desc).join('; '), responsible: lastF.responsible, effectiveness: effective, severity: lastF.severity });
    });
    return out.sort((a, b) => b.consecutive - a.consecutive || b.count - a.count);
  },
  recurringThemes(list) {
    const fs = list || this.findings(); const groups = [];
    fs.forEach((f) => { let g = groups.find((x) => x.s === f.s && FS.similarity(x.label, f.desc) >= 0.34); if (!g) { g = { label: f.desc, s: f.s, n: 0, zones: new Set(), items: [] }; groups.push(g); } g.n++; g.zones.add(f.zone); g.items.push(f); });
    return groups.filter((g) => g.n > 1).sort((a, b) => b.n - a.n).map((g) => Object.assign(g, { zones: [...g.zones] }));
  },

  /* KPIs */
  kpis(f) {
    const wosP = this.applyFilter(this.wos().filter((w) => w.status !== 'Cancelled'), f, 'wo');
    const planned = wosP.length; const done = wosP.filter((w) => this.isDone(w));
    const scores = done.map((w) => w.score && w.score.overall.pct).filter((v) => v !== null && v !== undefined);
    const fs = this.applyFilter(this.findings(), f, 'finding');
    const fsOpen = fs.filter((x) => this.findSt(x) !== 'Closed');
    const acts = this.applyFilter(this.actions(), Object.assign({}, f, { period: { type: 'all' } }), 'action');
    const actsP = this.applyFilter(this.actions(), f, 'action');
    const open = acts.filter((a) => this.isActOpen(a)); const overdue = open.filter((a) => this.actStatus(a) === 'Overdue');
    const zones = this.scopeZones().filter((z) => z.status === 'Active' && (!f.apu || z.apu === f.apu) && (!f.dept || z.dept === f.dept) && (!f.zone || z.id === f.zone));
    const zScores = zones.map((z) => { const w = done.filter((x) => x.zone === z.id).sort((a, b) => this.auditDate(b).localeCompare(this.auditDate(a)))[0]; return { z, pct: w ? w.score.overall.pct : null, w }; }).filter((x) => x.pct !== null).sort((a, b) => b.pct - a.pct);
    const reps = this.repeatGroups(fs);
    return {
      zones: zones.length, planned, completed: done.length, completion: planned ? (done.length / planned) * 100 : null,
      avgScore: round1(avg(scores)), findings: fs.length, findingsOpen: fsOpen.length, findingsClosed: fs.length - fsOpen.length,
      critical: fs.filter((x) => x.severity === 'Critical').length, criticalOpen: fsOpen.filter((x) => x.severity === 'Critical').length,
      openActions: open.length, overdue: overdue.length, overduePct: open.length ? (overdue.length / open.length) * 100 : null,
      actionClosure: actsP.length ? (actsP.filter((a) => !this.isActOpen(a)).length / actsP.length) * 100 : null,
      findingRate: done.length ? fs.length / done.length : null, repeatRate: fs.length ? (sum(reps.map((r) => r.findings.filter((x) => fs.includes(x)).length - 1)) / fs.length) * 100 : null,
      best: zScores[0] || null, worst: zScores[zScores.length - 1] || null, zScores, done, fs, acts, open, overdueList: overdue,
    };
  },
  sAverages(done) { const o = {}; FS.S_KEYS.forEach((s) => (o[s] = round1(avg(done.map((w) => w.score[s] && w.score[s].pct))))); return o; },
  monthlyTrend(f, months) {
    return months.map((m) => { const ff = Object.assign({}, f, { period: { type: 'month', value: m } }); const d = this.completedWOs(ff); const o = { m, overall: round1(avg(d.map((w) => w.score.overall.pct))), n: d.length }; FS.S_KEYS.forEach((s) => (o[s] = round1(avg(d.map((w) => w.score[s].pct))))); return o; });
  },
  fyMonths(endMonth) { const st = this.settings(); const fy = st.fiscalYearStart || 4; const y = FS.fiscalYear(endMonth + '-01', fy); const out = []; let d = `${y}-${FS.pad(fy)}-01`; for (let i = 0; i < 12; i++) { out.push(d.slice(0, 7)); d = FS.addMonths(d, 1); } return out; },
  lastDataMonth() { const d = Store.all('workorders').filter((w) => this.isDone(w)).map((w) => this.auditDate(w).slice(0, 7)).sort(); const t = this.today.slice(0, 7); const prior = d.filter((m) => m <= t); return prior[prior.length - 1] || t; },

  /* smart alerts */
  alerts(f) {
    const st = this.settings(); const t = this.today; const out = [];
    const wos = this.wos().filter((w) => !f || !f.apu || w.apu === f.apu);
    wos.filter((w) => this.woStatus(w) === 'Overdue').forEach((w) => out.push({ lvl: 'crit', icon: 'clock', text: `Audit ${w.no} for zone ${w.zone} is overdue (due ${fmtDate(w.dueDate)}).`, go: ['wo', w.id] }));
    wos.filter((w) => FS.WO_OPEN.includes(w.status) && w.plannedDate > t && FS.diffDays(w.plannedDate, t) <= (st.auditDueSoonDays || 2)).forEach((w) => out.push({ lvl: 'info', icon: 'calendar', text: `Audit for ${w.zone} is due ${relDays(w.plannedDate)} – auditor ${this.uname(w.auditor)}.`, go: ['wo', w.id] }));
    const acts = this.actions().filter((a) => this.isActOpen(a) && (!f || !f.apu || a.apu === f.apu));
    const od = acts.filter((a) => this.actStatus(a) === 'Overdue');
    const odCrit = od.filter((a) => { const fi = Store.get('findings', a.findingId); return fi && ['Critical', 'Major'].includes(fi.severity); });
    Object.entries(groupBy(odCrit, (a) => a.dept)).forEach(([d, l]) => out.push({ lvl: 'crit', icon: 'alert', text: `${l.length} critical/major action${l.length > 1 ? 's are' : ' is'} overdue in ${d}.`, go: ['car', { tab: 'actions', status: 'Overdue', dept: d }] }));
    if (od.length - odCrit.length > 0) out.push({ lvl: 'warn', icon: 'clock', text: `${od.length - odCrit.length} other actions are past their target date.`, go: ['car', { tab: 'actions', status: 'Overdue' }] });
    const soon = acts.filter((a) => ['Open', 'In Progress'].includes(a.status) && (a.revisedTarget || a.target) >= t && FS.diffDays(a.revisedTarget || a.target, t) <= (st.actionDueSoonDays || 3));
    if (soon.length) out.push({ lvl: 'info', icon: 'clock', text: `${soon.length} action${soon.length > 1 ? 's are' : ' is'} due within ${st.actionDueSoonDays || 3} days.`, go: ['car', { tab: 'actions', status: 'due-soon' }] });
    this.scopeZones().filter((z) => !f || !f.apu || z.apu === f.apu).forEach((z) => {
      const l = Store.all('workorders').filter((w) => w.zone === z.id && this.isDone(w) && w.score && w.auditType === 'Monthly Audit').sort((a, b) => this.auditDate(a).localeCompare(this.auditDate(b)));
      if (l.length >= 2) { const a = l[l.length - 2].score.overall.pct, b = l[l.length - 1].score.overall.pct; if (a - b >= (st.scoreDropAlert || 10)) out.push({ lvl: 'crit', icon: 'chart', text: `Zone ${z.code} 5S score dropped from ${Math.round(a)}% to ${Math.round(b)}%.`, go: ['zone', z.id] }); else if (b < (st.alertScoreThreshold || 70)) out.push({ lvl: 'warn', icon: 'chart', text: `Zone ${z.code} is below the ${st.alertScoreThreshold || 70}% threshold at ${Math.round(b)}%.`, go: ['zone', z.id] }); }
      if (l.length >= 4) { const s5 = l.slice(-4).map((w) => w.score.S5.pct); if (s5[0] > s5[1] && s5[1] > s5[2] && s5[2] > s5[3]) out.push({ lvl: 'warn', icon: 'repeat', text: `S5 Sustain in ${z.code} has declined for 3 audits in a row (${s5.map(Math.round).join(' → ')}%).`, go: ['zone', z.id] }); }
    });
    this.findings().filter((x) => x.severity === 'Critical' && this.findSt(x) !== 'Closed' && (!f || !f.apu || x.apu === f.apu)).forEach((x) => out.push({ lvl: 'crit', icon: 'flag', text: `Open critical finding in ${x.zone}: ${x.desc}`, go: ['finding', x.id] }));
    this.repeatGroups().filter((r) => r.consecutive >= 3 && (!f || !f.apu || (this.zone(r.zone) || {}).apu === f.apu)).forEach((r) => out.push({ lvl: 'warn', icon: 'repeat', text: `Repeat finding in ${r.zone} (${r.s} – ${this.sName(r.s)}): "${r.desc}" in ${r.consecutive} consecutive audits.`, go: ['car', { tab: 'repeat' }] }));
    const m = this.lastDataMonth(); const k = this.kpis(Object.assign({}, f || {}, { period: { type: 'month', value: m } }));
    if (k.completion !== null && k.completion < (st.completionTarget || 95)) out.push({ lvl: 'warn', icon: 'clipboard', text: `Audit completion for ${fmtMonth(m)} is ${Math.round(k.completion)}% against a ${st.completionTarget || 95}% target.`, go: ['wos', { tab: 'overdue' }] });
    const order = { crit: 0, warn: 1, info: 2 };
    return out.sort((a, b) => order[a.lvl] - order[b.lvl]);
  },

  /* audit trail + notifications */
  _logDoc: null,
  async log(module, record, action, prev = '', next = '') {
    const u = App.user; const id = 'L-' + this.today.replace(/-/g, '') + '-' + SESSION;
    const e = { at: nowISO(), user: u ? u.id : 'anonymous', module, record: String(record || ''), action, prev: typeof prev === 'object' ? JSON.stringify(prev) : String(prev ?? ''), next: typeof next === 'object' ? JSON.stringify(next) : String(next ?? ''), device: deviceInfo() };
    const cur = Store.get('logs', id); const entries = (cur ? cur.entries : []).concat([e]);
    return Store.put('logs', id, { date: this.today, session: SESSION, entries });
  },
  ruleFor(event) { return ((this.settings().notificationRules || []).find((r) => r.event === event)) || { inapp: true }; },
  async notify(type, title, body, to, link) {
    const r = this.ruleFor(type); if (r.inapp === false) return;
    const ids = uniq((to || []).filter(Boolean)); if (!ids.length) return;
    const id = uid('N-');
    const channels = ['In-app'].concat(r.email ? ['Email'] : [], r.msg ? ['Messaging'] : []);
    return Store.put('notifications', id, { at: nowISO(), type, title, body: body || '', to: ids, link: link || null, readBy: [], channels, by: App.user ? App.user.id : 'SYSTEM' });
  },
  facilitatorOf(apu) { const a = this.apu(apu); return a ? a.facilitator : null; },

  /* work-order generation from schedules */
  async generateDueWorkOrders(manual) {
    if (Store.readOnly || !Store.adapter) return 0;
    if (Store.adapter.generate) return Store.adapter.generate(manual);      // server edition: the scheduler runs on the server
    const st = this.settings(); const t = this.today; let created = 0;
    if (Store.adapter.acquire && !(await Store.adapter.acquire('cfg/genlock', 30000))) { if (manual) UI.toast('Another user is generating work orders right now. Try again in a moment.'); return 0; }
    const existing = new Set(Store.all('workorders').map((w) => w.scheduleId + '|' + w.plannedDate));
    for (const s of Store.all('schedules').filter((x) => x.status === 'Active')) {
      const trig = (st.woTrigger || {})[s.frequency] ?? 7; const grace = (st.woGrace || {})[s.frequency] ?? 3;
      const z = this.zone(s.zone); if (!z || z.status !== 'Active') continue;
      for (const d of FS.occurrences(s, FS.addDays(t, -grace), FS.addDays(t, trig))) {
        if (existing.has(s.id + '|' + d)) continue;
        const cs = this.activeChecksheet(s.checksheet) || this.checksheet(s.checksheet); if (!cs) continue;
        const num = await Store.nextNo('AUD');
        const wo = { no: num.no, scheduleId: s.id, zone: z.id, plant: z.plant, apu: z.apu, dept: z.dept, leader: z.leader, auditor: s.auditor, backupAuditor: s.backup || '', checksheetId: cs.id, csName: cs.name, csVersion: cs.version, auditType: s.auditType, plannedDate: d, plannedTime: s.time || '', dueDate: FS.addDays(d, grace), priority: s.priority || 'Medium', status: 'Assigned', createdAt: nowISO(), createdBy: 'SYSTEM', responses: {}, score: null, approvals: ((st.approvals || {})[s.auditType] || []).map((level) => ({ level, status: 'Pending' })), locked: false, reopens: [], history: [{ at: nowISO(), by: 'SYSTEM', status: 'Assigned', note: 'Auto-generated from ' + s.id + (manual ? ' (manual run)' : '') }] };
        await Store.put('workorders', num.id, wo); existing.add(s.id + '|' + d); created++;
        this.notify('Audit assigned', 'Audit assigned: ' + num.no, `Zone ${z.code} – ${z.name}, planned ${fmtDate(d)}`, [s.auditor], { page: 'wo', id: num.id });
        this.log('Work Orders', num.no, 'Work order generated', '', `${s.id} → ${d}`);
      }
    }
    return created;
  },

  /* audit submission (idempotent, safe to retry from the offline queue) */
  async submitAudit(woId, opts = {}) {
    const wo0 = Store.get('workorders', woId); if (!wo0) return;
    if (this.isDone(wo0)) { this._dequeue(woId); return { already: true }; }
    if (!navigator.onLine || !Store.adapter) { const q = LS.get('pendingSubmits', []); if (!q.includes(woId)) q.push(woId); LS.set('pendingSubmits', q); await Store.patch('workorders', woId, { syncState: 'Submit pending sync' }); return { queued: true }; }
    const st = this.settings(); const qs = this.questionsOf(wo0); const z = this.zone(wo0.zone);
    const responses = clone(wo0.responses || {});
    for (const q of qs) {
      const r = responses[q.qid]; if (!r || !r.finding || r.findingId) continue;
      const fd = r.finding; const num = await Store.nextNo('FND');
      const doc = { no: num.no, woId, woNo: wo0.no, zone: wo0.zone, plant: wo0.plant, apu: wo0.apu, dept: wo0.dept, s: q.s, qid: q.qid, question: q.text, desc: fd.desc, category: fd.category || '', severity: fd.severity, score: r.v === 'NA' ? null : FS.responseValue(q, r.v), responsible: fd.responsible || (z && z.leader), due: fd.due, immediate: fd.immediate || '', rootCause: '', ca: '', pa: '', status: 'Open', photos: r.photos || [], createdAt: nowISO(), createdBy: wo0.auditor, auditDate: this.auditDate(wo0) };
      await Store.put('findings', num.id, doc);
      responses[q.qid].findingId = num.id;
      await Store.patch('workorders', woId, { responses: { [q.qid]: { findingId: num.id } } });
      this.log('Findings', num.no, 'Finding created', '', `${wo0.zone} ${q.qid} ${fd.severity}`);
      if (fd.severity === 'Critical') this.notify('Critical finding created', 'Critical finding in ' + wo0.zone, fd.desc, [doc.responsible, z && z.leader, this.facilitatorOf(wo0.apu)].concat(Store.all('users').filter((u) => u.role === 'management' && u.status === 'Active').map((u) => u.id)), { page: 'finding', id: num.id });
      if (fd.caRequired && fd.action) {
        const an = await Store.nextNo('ACT');
        await Store.put('actions', an.id, { no: an.no, findingId: num.id, findingNo: num.no, woId, zone: wo0.zone, plant: wo0.plant, apu: wo0.apu, dept: wo0.dept, desc: fd.action, type: 'Corrective', responsible: doc.responsible, target: fd.due, priority: ['Critical', 'Major'].includes(fd.severity) ? 'High' : 'Medium', status: 'Open', rootCause: '', ca: '', pa: '', evidence: [], createdAt: nowISO(), createdBy: wo0.auditor, history: [{ at: nowISO(), by: wo0.auditor, from: '', to: 'Open', note: 'Assigned during audit' }] });
        this.notify('Action assigned', 'Action assigned: ' + an.no, fd.action, [doc.responsible], { page: 'action', id: an.id });
      }
    }
    const wo = Store.get('workorders', woId);
    const score = FS.scoreAudit(qs, wo.responses, st);
    const end = nowISO(); const from = wo.resumedAt || wo.startedAt; const dur = from ? Math.max(1, (wo.activeMin || 0) + Math.round((new Date(end) - new Date(from)) / 60000)) : null;
    const approvals = ((st.approvals || {})[wo.auditType] || []).map((level) => ({ level, status: 'Pending' }));
    const status = approvals.length ? 'Submitted' : 'Approved';
    await Store.patch('workorders', woId, { status, score, endedAt: end, submittedAt: end, duration: dur, approvals, locked: true, syncState: null, originalScore: wo.originalScore || score.overall.pct, history: (wo.history || []).concat([{ at: end, by: App.user ? App.user.id : wo.auditor, status: 'Submitted', note: opts.fromQueue ? 'Synchronised from offline queue' : '' }]) });
    this._dequeue(woId);
    this.log('Work Orders', wo.no, 'Audit submitted', wo.status, `${status} – ${score.overall.pct}%`);
    this.notify('Audit completed', `Audit submitted: ${wo.zone} scored ${score.overall.pct}%`, wo.no, [wo.leader, this.facilitatorOf(wo.apu)], { page: 'wo', id: woId });
    return { ok: true, score };
  },
  _dequeue(id) { const q = LS.get('pendingSubmits', []).filter((x) => x !== id); LS.set('pendingSubmits', q); },
};
