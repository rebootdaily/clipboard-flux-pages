// Field Lite offline cache. Serves the saved copy instantly (works with no
// signal), and refreshes it in the background whenever the network is up.
const CACHE = 'fieldlite-test-v10';
const FILES = ['./', 'index.html', 'sheet.js', 'sheet-1.png', 'manifest.json', 'icon.svg', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(async c => {
    await c.addAll(FILES);
    // PDF library lives in the main app's vendor folder; cache it too, but don't fail install without it.
    try { await c.add('../vendor/html2pdf.bundle.min.js'); } catch (_) {}
  }).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('fieldlite-test') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(e.request, {ignoreSearch: true});
    const net = fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});
