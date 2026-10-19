/* Service worker for the workout log PWA.
   - The app's own files: network first (so an update shows up as soon as you are online), falling back to the
     saved copy after 4 seconds or when offline. Every successful load refreshes the saved copy.
   - Chart.js, Font Awesome and the Excel library from cdnjs: saved the first time and then served from the
     saved copy, because those files never change for a given version.
   - Everything else (Google sign-in, Drive) goes straight to the network and is never touched.
   There is no version number to bump when you edit your files. Only edit APP_FILES if you add or rename one. */
const APP_CACHE = 'workout-app-v1';
const CDN_CACHE = 'workout-cdn-v2'; // v2: only Font Awesome 6.5.1 is kept now
const NETWORK_TIMEOUT_MS = 4000;

const APP_FILES = [
  './', 'index.html', 'workout-log-standalone.html', 'workout-graph.html', 'workout-log-style.css',
  'workout-shared.js', 'workout-log.js', 'workout-graph.js', 'workout-tools.js', 'workout-extras.js', 'workout-library.js',
  'workout-library.json', 'workout-routines.js', 'workout-profile.js', 'workout-backup.js', 'workout-variations.js', 'workout-pwa.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-64.png'
];
const CDN_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css'
];
const CDN_HOST = 'cdnjs.cloudflare.com';

async function cacheCdnAsset(cache, url) {
  const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
  if (!res.ok) throw new Error('bad status ' + res.status);
  await cache.put(url, res.clone());
  if (/\.css(\?|$)/.test(url)) {
    // the icon font files are named inside the stylesheet; save the modern one so icons work offline
    const css = await res.clone().text();
    const fonts = [...css.matchAll(/url\(([^)]+\.woff2[^)]*)\)/g)].map(m => new URL(m[1].replace(/['"]/g, ''), url).href);
    await Promise.allSettled(fonts.map(async f => {
      const r = await fetch(f, { mode: 'cors', credentials: 'omit' });
      if (r.ok) await cache.put(f, r);
    }));
  }
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const app = await caches.open(APP_CACHE);
    await Promise.allSettled(APP_FILES.map(f => app.add(new Request(f, { cache: 'reload' }))));
    const cdn = await caches.open(CDN_CACHE);
    await Promise.allSettled(CDN_ASSETS.map(u => cacheCdnAsset(cdn, u)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keep = [APP_CACHE, CDN_CACHE];
    for (const k of await caches.keys()) { if (!keep.includes(k)) await caches.delete(k); }
    await self.clients.claim();
  })());
});

function networkFirst(event) {
  const req = event.request;
  // 'no-cache' = ask the server whether the file changed (a tiny 'not modified' reply when it hasn't), so an update
  // is never hidden behind the browser's own HTTP cache.
  const net = fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then(res => {
    if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(APP_CACHE).then(c => c.put(req, copy)); }
    return res;
  });
  event.waitUntil(net.catch(() => {}));            // let the cache refresh finish even if we already answered
  const timer = new Promise(r => setTimeout(() => r(null), NETWORK_TIMEOUT_MS));
  return Promise.race([net.catch(() => null), timer]).then(async res => {
    if (res) return res;
    const cached = await caches.match(req, { ignoreSearch: true });
    if (cached) return cached;
    if (req.mode === 'navigate') {
      const fallback = await caches.match('workout-log-standalone.html');
      if (fallback) return fallback;
    }
    return net;                                    // nothing saved: wait for the network
  });
}

async function cdnCacheFirst(event) {
  const req = event.request;
  const cache = await caches.open(CDN_CACHE);
  const hit = await cache.match(req.url);
  if (hit) return hit;
  const res = await fetch(req.url, { mode: 'cors', credentials: 'omit' });
  if (res.ok) cache.put(req.url, res.clone());
  return res;
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) { event.respondWith(networkFirst(event)); return; }
  if (url.hostname === CDN_HOST) { event.respondWith(cdnCacheFirst(event)); return; }
});
