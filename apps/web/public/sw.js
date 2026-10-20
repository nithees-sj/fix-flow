/* FixFlow service worker — app-shell offline support.
 *
 *  - /_next/static/*   cache-first (content-hashed, immutable)
 *  - page navigations  network-first, falling back to the last cached copy of that page, then
 *                      to the cached technician workspace (/my-work)
 *  - /api/*            never cached here: private data lives only in the scoped IndexedDB store,
 *                      which is wiped on sign-out.
 */
const VERSION = 'fixflow-v1';
const STATIC = `${VERSION}-static`;
const PAGES = `${VERSION}-pages`;
const OFFLINE_FALLBACK = '/my-work';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(PAGES).then((c) => c.addAll([OFFLINE_FALLBACK]).catch(() => undefined)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'clear-caches') event.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))));
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.open(STATIC).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(PAGES);
        try {
          const res = await fetch(req);
          if (res.ok && res.type === 'basic') cache.put(req, res.clone());
          return res;
        } catch {
          return (await cache.match(req)) || (await cache.match(OFFLINE_FALLBACK)) || Response.error();
        }
      })(),
    );
  }
});
