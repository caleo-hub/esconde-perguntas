const CACHE_NAME = 'esconde-perguntas-v19';
const APP_FILES = ['./', './index.html', './css/style.css?v=14', './js/app.js?v=17', './js/marketplace.js?v=4', './js/firebase-config.js', './js/firebase-cloud.js?v=17', './vendor/firebase/firebase-app-compat.js', './vendor/firebase/firebase-auth-compat.js', './vendor/firebase/firebase-firestore-compat.js', './vendor/firebase/firebase-app-check-compat.js', './manifest.json', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))),
    self.clients.claim()
  ]));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
    }
    return response;
  }).catch(() => caches.match(event.request).then(cached => cached || (event.request.mode === 'navigate' ? caches.match('./index.html') : Response.error()))));
});
