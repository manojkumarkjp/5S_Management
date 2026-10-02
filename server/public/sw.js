/* 5S service worker: app shell works offline; API calls always go to the network
   (offline audit data lives in IndexedDB, managed by the app). */
const VER = 'fives-shell-v1';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VER).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VER).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const r = e.request; const u = new URL(r.url);
  if (r.method !== 'GET' || u.pathname.startsWith('/api/')) return;
  if (r.mode === 'navigate') { e.respondWith(fetch(r).then((res) => { const cp = res.clone(); caches.open(VER).then((c) => c.put('/index.html', cp)); return res; }).catch(() => caches.match('/index.html'))); return; }
  if (u.origin === location.origin || /fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) {
    e.respondWith(caches.match(r).then((hit) => { const net = fetch(r).then((res) => { if (res.ok) { const cp = res.clone(); caches.open(VER).then((c) => c.put(r, cp)); } return res; }).catch(() => hit); return hit || net; }));
  }
});
