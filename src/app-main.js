/* ===== Boot ===== */
(function () {
  const baseApply = Store.applySnapshot.bind(Store);
  Store.applySnapshot = function (c, docs) {
    baseApply(c, docs);
    if (c === 'workorders' && App.ui.execId && Object.keys(Exec.pending).length) Store._applyOp({ op: 'update', c, id: App.ui.execId, doc: { responses: Exec.pending } });
  };
  let generated = false;
  function tryRestore() {
    if (App.user) return;
    const sess = LS.get('session');
    if (sess && Store.get('users', sess.id) && Store.get('users', sess.id).status === 'Active') {
      App.user = Store.get('users', sess.id); App.plant = LS.get('plant', 'all');
      if (App.user.plants && App.user.plants.length === 1) App.plant = App.user.plants[0];
      if (App.user.role === 'auditor') { App.route = { page: 'wos', params: {} }; App.ui.wosTab = 'mine'; } else if (App.user.role === 'member') App.route = { page: 'car', params: {} };
      $('#app').innerHTML = ''; App.render();
    }
  }
  function maybeGenerate() {
    if (generated || !App.user || Store.mode !== 'db' && Store.mode !== 'api') return;
    if (!['workorders', 'schedules', 'cfg', 'zones', 'checksheets'].every((c) => Store.loaded.has(c))) return;
    generated = true;
    setTimeout(() => Domain.generateDueWorkOrders(false).then((n) => n && UI.toast(`${n} audit work order${n > 1 ? 's were' : ' was'} generated from the schedule.`)), 800);
  }
  Store.on((changed) => { tryRestore(); App.onData(changed); maybeGenerate(); });

  async function boot() {
    wire();
    $('#app').innerHTML = `<div style="min-height:100vh;display:grid;place-items:center;padding:40px"><div class="stack" style="align-items:center"><div class="brand-mark" style="width:54px;height:54px;font-size:22px">5S</div><div class="tape" style="width:160px;border-radius:2px"></div><div class="muted">Loading 5S Management System…</div></div></div>`;
    const cached = await Store.loadCache();
    if (cached) { Store.mode = 'cache'; tryRestore(); if (!App.user) App.render(); }
    if (window.FIVES_MODE === 'api' && window.ApiAdapter) {
      App.blobDownload = true; Store.adapter = window.ApiAdapter(); Store.mode = 'api';
      try { await Store.adapter.start(); } catch (e) { console.warn(e); if (!cached) Store.mode = 'none'; }
      App.render(); Store.flush(); return;
    }
    if (window.claude && typeof window.claude.use === 'function') {
      const [db, dl] = await Promise.all([window.claude.use('db').catch(() => null), window.claude.use('downloads').catch(() => null)]);
      App.downloads = dl;
      if (db) { Store.adapter = DbAdapter(db); Store.mode = 'db'; Store.adapter.start(); }
      else Store.mode = cached ? 'cache' : 'none';
    } else { Store.mode = cached ? 'cache' : 'none'; App.blobDownload = true; }
    if (!App.user) App.render();
    Store.flush();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
