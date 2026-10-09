// Field Lite offline cache.
//  - Online: every file is fetched fresh (revalidated with the server, bypassing the browser's own 10-minute
//    HTTP cache that GitHub Pages sets), so a new version shows on the first open after it is published.
//  - Slow (> 2.5 s) or offline: the saved copy is used, so the app still works with no signal.
const CACHE = 'fieldlite-v9';
const FILES = ['./', 'index.html', 'sheet.js', 'sheet-1.png', 'manifest.json', 'icon.svg', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(async c => {
    // cache:'reload' skips the HTTP cache, so a new install never stores an old copy of a file
    await c.addAll(FILES.map(u => new Request(u, {cache: 'reload'})));
    // PDF library lives in the main app's vendor folder; cache it too, but don't fail install without it.
    try { await c.add(new Request('../vendor/html2pdf.bundle.min.js', {cache: 'reload'})); } catch (_) {}
  }).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const net = fetch(e.request, {cache: 'no-cache'}).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; });
    net.catch(() => {});
    try {
      return await Promise.race([net, new Promise((_, rej) => setTimeout(rej, 2500))]);
    } catch (_) {
      return (await c.match(e.request, {ignoreSearch: true})) || net;
    }
  })());
});
