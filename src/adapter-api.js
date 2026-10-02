/* ===== REST API adapter (server edition): same Store contract as the shared-db adapter ===== */
window.ApiAdapter = function () {
  let rev = 0, timer = null, inflight = 0, lastWrite = 0, polling = false, photoQ = null;
  const H = { 'X-Requested-With': 'fives' };
  const codeFor = (status) => (status === 401 ? 'unavailable' : status === 403 || status === 423 ? 'forbidden' : status === 404 || status === 409 || status === 413 || status === 422 || status === 400 ? 'invalid_argument' : 'unavailable');

  async function http(method, url, body) {
    let r;
    try { r = await fetch(url, { method, credentials: 'same-origin', headers: Object.assign({}, H, body !== undefined ? { 'Content-Type': 'application/json' } : {}), body: body !== undefined ? JSON.stringify(body) : undefined }); }
    catch (e) { const er = new Error('Network unavailable'); er.code = 'unavailable'; er.network = true; throw er; }
    let data = null; try { data = await r.json(); } catch (e) { /* no body */ }
    if (!r.ok) {
      const er = new Error((data && data.error && data.error.message) || 'Request failed (' + r.status + ')');
      er.status = r.status; er.code = codeFor(r.status); er.details = data && data.error && data.error.details;
      if (r.status === 401 && App.user && !/auth\/login/.test(url)) sessionExpired();
      throw er;
    }
    return data;
  }
  function sessionExpired() {
    if (A._expired) return; A._expired = true;
    UI.toast('Your session has expired. Sign in again; unsent changes are kept on this device.', 'bad');
    stopPoll(); App.user = null; LS.del('session'); App.stack = []; $('#app').innerHTML = ''; App.render();
  }

  async function fullLoad() {
    const by = {}; COLLS.forEach((c) => (by[c] = [])); let since = 0;
    for (let i = 0; i < 200; i++) {
      const r = await http('GET', '/api/sync?since=' + since + '&limit=800');
      r.docs.forEach((d) => { if (d.doc && by[d.c]) by[d.c].push(d.doc); });
      since = r.rev; if (!r.more) break;
    }
    rev = since; Store.applyAll(by);
  }
  async function poll() {
    if (polling || !App.user || !navigator.onLine || document.hidden) return;
    if (inflight > 0 || Date.now() - lastWrite < 2000) return;
    polling = true;
    try {
      const r = await http('GET', '/api/sync?since=' + rev + '&limit=500');
      if (inflight > 0) return;
      const pending = new Set(Store.outbox.map((w) => w.c + '/' + w.id));
      r.docs.forEach((d) => { if (pending.has(d.c + '/' + d.id)) return; Store._setLocal(d.c, d.id, d.doc); });
      if (r.docs.length && App.ui.execId && typeof Exec !== 'undefined' && Object.keys(Exec.pending).length) Store._applyOp({ op: 'update', c: 'workorders', id: App.ui.execId, doc: { responses: Exec.pending } });
      rev = r.rev; if (r.more) setTimeout(poll, 50);
    } catch (e) { /* offline or expired: next tick */ } finally { polling = false; }
  }
  function startPoll() { stopPoll(); timer = setInterval(poll, 5000); }
  function stopPoll() { if (timer) clearInterval(timer); timer = null; }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
  window.addEventListener('online', () => { A.flushPhotos(); poll(); });

  async function queue() { if (!photoQ) photoQ = (await IDB.get('photoQueue')) || []; return photoQ; }

  const A = {
    kind: 'api',
    async start() {
      this._expired = false;
      try { const b = await http('GET', '/api/branding'); if (!Store.get('cfg', 'settings')) Store._setLocal('cfg', 'settings', b); } catch (e) { /* login page falls back to defaults */ }
      let me = null; try { me = (await http('GET', '/api/auth/me')).user; } catch (e) { me = null; }
      if (!me) return;
      await fullLoad();
      const u = Store.get('users', me.id) || me;
      if (u.status === 'Active') {
        App.user = u; App.plant = LS.get('plant', 'all'); if (u.plants && u.plants.length === 1) App.plant = u.plants[0];
        App.route = { page: u.role === 'auditor' ? 'wos' : u.role === 'member' ? 'car' : 'dashboard', params: {} }; if (u.role === 'auditor') App.ui.wosTab = 'mine';
        startPoll(); this.flushPhotos();
      }
    },
    async login(id, pw) {
      const r = await http('POST', '/api/auth/login', { username: id, password: pw });
      this._expired = false;
      await fullLoad(); startPoll();
      return Store.get('users', r.user.id) || r.user;
    },
    async logout() {
      stopPoll(); try { await http('POST', '/api/auth/logout'); } catch (e) { /* offline logout: cookie expires on its own */ }
      Store.data = {}; Store.arrays = {}; Store.loaded = new Set(); await IDB.set('snapshot', null); rev = 0;
    },
    remoteHas() { return false; },
    async write(w) {
      inflight++;
      try {
        const url = '/api/docs/' + w.c + '/' + encodeURIComponent(w.id);
        for (let attempt = 0; ; attempt++) {
          try {
            if (w.op === 'set') return await http('PUT', url, w.doc);
            if (w.op === 'update') return await http('PATCH', url, w.doc);
            return await http('DELETE', url);
          } catch (e) {
            if (e.status === 409 && attempt < 3) { await sleep(400 * (attempt + 1)); continue; }       // parent record still being written
            if (['forbidden', 'invalid_argument'].includes(e.code) && !(e.status === 404 && w.op === 'update')) this._revert(w);
            throw e;
          }
        }
      } finally { inflight--; lastWrite = Date.now(); }
    },
    async _revert(w) {           // the server refused the change: show the authoritative copy again
      try { const d = await http('GET', '/api/docs/' + w.c + '/' + encodeURIComponent(w.id)); Store._setLocal(w.c, w.id, d); }
      catch (e) { if (e.status === 404) Store._setLocal(w.c, w.id, null); }
    },
    async nextNumber(kind) { const r = await http('POST', '/api/numbers/' + kind); return r.n; },
    async savePhoto(id, p) {
      const body = { id, full: p.full, name: p.name, woId: p.woId, qid: p.qid, findingId: p.findingId, actionId: p.actionId, improvementId: p.improvementId };
      try { const r = await http('POST', '/api/files', body); return { id: r.id, url: r.url }; }
      catch (e) {
        if (!e.network && e.code !== 'unavailable') throw e;
        const q = await queue(); q.push(body); await IDB.set('photoQueue', q); App.refreshChrome(); return { id };   // uploaded when the connection returns
      }
    },
    async flushPhotos() {
      if (!navigator.onLine || !App.user) return; const q = await queue();
      while (q.length) { try { await http('POST', '/api/files', q[0]); q.shift(); await IDB.set('photoQueue', q); } catch (e) { if (e.network || e.code === 'unavailable') break; q.shift(); await IDB.set('photoQueue', q); } }
    },
    async getPhoto(id) { return '/api/files/' + encodeURIComponent(id); },
    async saveUser(doc, password) {
      const d = Object.assign({}, doc); delete d.pwd; delete d.password;
      await http('PUT', '/api/users/' + encodeURIComponent(doc.id), { user: d, password: password || undefined });
      Store._setLocal('users', doc.id, d);
    },
    async resetPassword(id, tmp) { await http('POST', '/api/users/' + encodeURIComponent(id) + '/reset-password', { password: tmp }); },
    async changePassword(cur, n) { try { await http('POST', '/api/auth/change-password', { current: cur, password: n }); } catch (e) { UI.toast(e.message, 'bad'); throw e; } },
    async forgot(id) { await http('POST', '/api/auth/forgot', { id }); },
    async generate(manual) { if (!manual) return 0; const r = await http('POST', '/api/admin/generate-work-orders'); await poll(); return r.created; },     // automatic generation runs in the server scheduler
    pendingPhotos() { return photoQ ? photoQ.length : 0; },
  };
  return A;
};
