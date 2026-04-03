const CACHE_NAME = 'protocole-horizon-v1';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './main.js',
  './manifest.webmanifest',
  'https://fonts.googleapis.com/css2?family=Outfit:wght@300;500;700;900&display=swap'
];

// Install: Cache resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('SW: Caching assets');
      return cache.addAll(ASSETS);
    })
  );
});

// Activate: Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
});

// Fetch: Serve from cache, then fallback to network
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return cachedResponse || fetch(event.request);
    })
  );
});
