// Service Worker: Runtime caching to make repeat visits near-instantaneous and support offline access.
//
// Uses runtime caching rather than precaching manifests: build outputs have content hashes (main-<hash>.js),
// and textures/ephemeris/DEM use ?v=<sha256> query params.
//
// Strategy:
//   · Navigation requests (HTML): Network first, falling back to cache for offline support.
//   · Same-origin static assets (GET): Cache first, fetching and caching on miss.
//   · Others (APIs, cross-origin): Network only, un-cached.

const VERSION = 'sw-v1';
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;
const MAX_ASSETS = 3200;

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['./', './index.html'])).catch(() => {}));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => !n.startsWith(VERSION)).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

/** Approximate LRU cache trimming */
async function trimCache(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  if (keys.length <= max) return;
  await Promise.all(keys.slice(0, keys.length - max).map((k) => cache.delete(k)));
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // Do not intercept cross-origin
  if (req.headers.has('range')) return;              // Delegate Range requests to network

  // HTML navigation: Network first, cache fallback on failure
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res && res.ok) {
          const c = await caches.open(SHELL);
          c.put(req, res.clone());
        }
        return res;
      } catch {
        const hit = await caches.match(req) || await caches.match('./index.html');
        return hit ?? Response.error();
      }
    })());
    return;
  }

  // Static assets: Cache first
  e.respondWith((async () => {
    const hit = await caches.match(req);
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res && res.ok && res.type === 'basic') {
        const c = await caches.open(ASSETS);
        c.put(req, res.clone()).then(() => trimCache(ASSETS, MAX_ASSETS)).catch(() => {});
      }
      return res;
    } catch (err) {
      return new Response('', { status: 504, statusText: 'Offline and not cached' });
    }
  })());
});
