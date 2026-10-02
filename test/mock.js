// Minimal in-memory stand-in for the artifact db + downloads capabilities (local testing only).
(function(){
  const DATA = window.__SEED__; const store = new Map(); const listeners = {};
  Object.entries(DATA).forEach(([c, m]) => Object.entries(m).forEach(([id, b]) => store.set(c + '/' + id, JSON.parse(JSON.stringify(b)))));
  const snap = (c) => ({ docs: [...store.entries()].filter(([k]) => k.split('/').length === 2 && k.startsWith(c + '/')).map(([k, v]) => ({ id: k.split('/')[1], exists: true, data: () => v })) });
  const notify = (c) => setTimeout(() => (listeners[c] || []).forEach((fn) => fn(snap(c))), 5);
  const merge = (a, b) => { const o = Object.assign({}, a); Object.entries(b).forEach(([k, v]) => { if (v && typeof v === 'object' && !Array.isArray(v) && o[k] && typeof o[k] === 'object' && !Array.isArray(o[k])) o[k] = merge(o[k], v); else o[k] = v; }); return o; };
  const db = {
    collection(c) { return { onSnapshot(next) { (listeners[c] = listeners[c] || []).push(next); setTimeout(() => next(snap(c)), 20); return () => {}; }, doc: (id) => db.doc(c + '/' + id) }; },
    doc(p) { const c = p.split('/')[0]; return {
      async get() { const v = store.get(p); return { id: p.split('/')[1], exists: !!v, data: () => v }; },
      async set(d) { store.set(p, JSON.parse(JSON.stringify(d))); notify(c); },
      async update(d) { if (!store.has(p)) throw { code: 'invalid_argument', message: 'missing' }; store.set(p, merge(store.get(p), JSON.parse(JSON.stringify(d)))); notify(c); },
      async delete() { store.delete(p); notify(c); },
      async acquire() { return { acquired: true }; } }; },
  };
  window.__saved = [];
  window.claude = { use: async (n) => n === 'db' ? db : n === 'downloads' ? { save: async (r) => { let d = r.data; if (d instanceof ArrayBuffer) d = new Uint8Array(d); if (typeof d === 'string') d = new TextEncoder().encode(d); let bin=''; for (let i=0;i<d.length;i++) bin += String.fromCharCode(d[i]); window.__saved.push({name: r.filename, b64: btoa(bin)}); return { status: 'saved' }; } } : null };
})();
