/* DropBazaar service worker: makes the app open offline.
   If you ever change app files, bump the version number below so phones pick up the update. */
const VERSION = 'v2';
const SHELL_CACHE = 'dropbazaar-shell-' + VERSION;
const IMAGE_CACHE = 'dropbazaar-images-' + VERSION;
const MAX_IMAGES = 400;

const SHELL = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== SHELL_CACHE && k !== IMAGE_CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

async function trimImages() {
  const cache = await caches.open(IMAGE_CACHE);
  const keys = await cache.keys();
  if (keys.length > MAX_IMAGES) {
    await Promise.all(keys.slice(0, keys.length - MAX_IMAGES).map((k) => cache.delete(k)));
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Shop data: always go to the network (the app keeps its own saved copy for offline use)
  if (url.hostname === 'fortnite-api.com' && url.pathname.startsWith('/v2/shop')) return;

  // Our own files: show the cached copy fast, update it in the background
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.open(SHELL_CACHE).then(async (cache) => {
        const cached = await cache.match(req, { ignoreSearch: true });
        const network = fetch(req).then((res) => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        }).catch(() => null);
        if (cached) return cached;
        const res = await network;
        if (res) return res;
        if (req.mode === 'navigate') return cache.match('index.html');
        return new Response('', { status: 504 });
      })
    );
    return;
  }

  // Pictures from other sites (item images): use saved copy first, otherwise download and save
  if (req.destination === 'image') {
    event.respondWith(
      caches.open(IMAGE_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        try {
          const res = await fetch(req);
          if (res && (res.ok || res.type === 'opaque')) {
            cache.put(req, res.clone()).then(trimImages).catch(() => {});
          }
          return res;
        } catch (e) {
          return new Response('', { status: 504 });
        }
      })
    );
  }
});
