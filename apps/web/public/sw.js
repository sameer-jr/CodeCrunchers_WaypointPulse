const BUILD_ID = 'development';
const PRECACHE = ['/index.html', '/manifest.webmanifest', '/assets/logo-mark.png'];
const CACHE_NAME = `waypoint-shell-${BUILD_ID}`;
const STATIC_PATHS = new Set(PRECACHE);
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE.map(path => new Request(path, { credentials: 'omit', cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('waypoint-shell-') && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => (await caches.open(CACHE_NAME)).match('/index.html')));
    return;
  }
  if (STATIC_PATHS.has(url.pathname)) {
    event.respondWith(caches.open(CACHE_NAME).then(async cache => (await cache.match(url.pathname)) || fetch(request)));
  }
});
