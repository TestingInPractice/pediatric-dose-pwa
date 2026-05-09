const CACHE_NAME = 'dose-calc-v3';
const BASE = self.location.pathname.replace(/service-worker\.js$/, '');
const ASSETS = [
  BASE,
  BASE + 'index.html',
  BASE + 'manifest.json',
  BASE + 'css/style.css',
  BASE + 'js/calculator.js',
  BASE + 'js/level2_rules.js',
  BASE + 'js/level4_images.js',
  BASE + 'js/db.js',
  BASE + 'js/store.js',
  BASE + 'js/ui.js',
  BASE + 'js/diary.js',
  BASE + 'js/report.js',
  BASE + 'js/growth_data.js',
  BASE + 'js/growth_charts.js',
  BASE + 'js/updater.js',
  BASE + 'js/app.js',
  BASE + 'icons/icon-192x192.png',
  BASE + 'icons/icon-512x512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;

  if (url.pathname.startsWith(BASE + 'data/')) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      if (clientList.length > 0) {
        clientList[0].focus();
      } else {
        clients.openWindow(BASE);
      }
    })
  );
});
