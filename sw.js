// ZAVOD service worker: the headset app (and any browser) loads the game from local storage instead of the network.
// - Install: downloads every file in precache.json (all six maps as the headset loads them, ~70 MB; qa/vr-maps-test.mjs --precache
//   writes the list) in the background, so the first launch already fills the cache and the next ones start from disk.
// - assets/, assets-m/, icons/ (textures, models, sounds: big, rarely change): cache first, then each one is re-checked once per worker
//   lifetime, REVALIDATE_DELAY_MS after the game started, with an ETag request (unchanged: a few hundred bytes; changed: replaced for
//   the next launch). ASSETS_REV drops the whole set at once (the old cache is deleted on activate).
// - the page, src/ and vendor/ (the code: one coherent version per deploy): network first, the cache only when offline or the network
//   is slow (CODE_TIMEOUT_MS), so a deploy shows up on the next launch and code from two deploys never mixes on a good connection.
// Same-origin GETs only; the multiplayer broker and CDNs go straight to the network.
const ASSETS_REV = 1;
const ASSETS = `zavod-assets-${ASSETS_REV}`, CODE = 'zavod-code';
const STATIC = /^\/(assets|assets-m|icons)\//, CODE_TIMEOUT_MS = 4000, PRECACHE_PARALLEL = 6, REVALIDATE_DELAY_MS = 20000;

self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(precache()); });
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== ASSETS && k !== CODE) await caches.delete(k);
  await self.clients.claim();
})()));

async function precache() {
  let list = []; try { list = await (await fetch('/precache.json', { cache: 'no-store' })).json(); } catch { return; }
  const assets = await caches.open(ASSETS), code = await caches.open(CODE); let i = 0;
  const worker = async () => { while (i < list.length) { const path = list[i++]; const cache = STATIC.test(path) ? assets : code;
    try { if (await cache.match(path)) continue; const res = await fetch(path); if (res.ok) await cache.put(path, res); } catch { /* one missing file doesn't stop the rest */ } } };
  await Promise.all(Array.from({ length: PRECACHE_PARALLEL }, worker));
}

self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || req.headers.has('range')) return;
  e.respondWith(STATIC.test(url.pathname) ? cacheFirst(req, e) : networkFirst(req));
});

const checked = new Set();
async function cacheFirst(req, e) {
  const cache = await caches.open(ASSETS), hit = await cache.match(req);
  if (hit) { if (!checked.has(req.url)) { checked.add(req.url); e.waitUntil(revalidate(cache, req, hit)); } return hit; }
  const res = await fetch(req); if (res.ok) cache.put(req, res.clone()); return res;
}
async function revalidate(cache, req, hit) {
  await new Promise((r) => setTimeout(r, REVALIDATE_DELAY_MS));
  try { const tag = hit.headers.get('etag'), res = await fetch(req.url, { cache: 'no-cache', headers: tag ? { 'If-None-Match': tag } : {} });
    if (res.ok && res.status !== 304 && (!tag || res.headers.get('etag') !== tag)) await cache.put(req, res); } catch { /* offline: keep what we have */ }
}
async function networkFirst(req) {
  const cache = await caches.open(CODE), nav = req.mode === 'navigate';
  const net = fetch(req).then((res) => { if (res.ok) cache.put(nav ? '/' : req, res.clone()); return res; });
  const slow = new Promise((r) => setTimeout(r, CODE_TIMEOUT_MS));
  try { const res = await Promise.race([net, slow]); if (res) return res; } catch { /* offline */ }
  const hit = await cache.match(nav ? '/' : req, { ignoreSearch: nav }); if (hit) return hit;
  return net;
}
