// Offline support: serve from cache immediately, refresh the cache in the background.
// Bump CACHE when the file list changes.
const CACHE = 'll-v7';
const ASSETS = [
  './', './index.html', './manifest.webmanifest', './icon.svg', './css/app.css',
  './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png', './icons/apple-touch-icon.png',
  './js/app.js', './js/fsrs.js', './js/store.js', './js/tts.js', './js/ui.js', './js/drill.js',
  './lang/index.js', './lang/ko/index.js', './lang/ko/hangul.js', './lang/ko/phrases.js', './lang/ko/contrasts.js',
];

self.addEventListener('install', e => {
  // cache: 'reload' bypasses the HTTP cache so a new version never caches stale files.
  const requests = ASSETS.map(u => new Request(u, { cache: 'reload' }));
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(requests)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(req, { ignoreSearch: true });
    const fresh = fetch(req).then(res => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    }).catch(() => cached);
    return cached || fresh;
  }));
});
