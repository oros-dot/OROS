// OROS Service Worker — cache offline
// Bump CACHE_VERSION ad ogni deploy per forzare l'aggiornamento
var CACHE_VERSION = 'oros-v1';
var CORE_ASSETS = [
  './',
  './index.html'
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_VERSION).then(function(cache) {
      return cache.addAll(CORE_ASSETS);
    }).then(function() { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.map(function(k) {
        if (k !== CACHE_VERSION) return caches.delete(k);
      }));
    }).then(function() { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  // Solo same-origin: CDN, Firebase, TradingView passano sempre dalla rete
  if (url.origin !== self.location.origin) return;

  // Network-first per index.html (sempre fresco se online), cache come fallback
  if (req.mode === 'navigate' || url.pathname.endsWith('index.html') || url.pathname.endsWith('/')) {
    e.respondWith(
      fetch(req).then(function(res) {
        var copy = res.clone();
        caches.open(CACHE_VERSION).then(function(c) { c.put(req, copy); });
        return res;
      }).catch(function() {
        return caches.match(req).then(function(r) { return r || caches.match('./index.html'); });
      })
    );
    return;
  }

  // Cache-first per il resto dei file same-origin
  e.respondWith(
    caches.match(req).then(function(cached) {
      return cached || fetch(req).then(function(res) {
        var copy = res.clone();
        caches.open(CACHE_VERSION).then(function(c) { c.put(req, copy); });
        return res;
      });
    })
  );
});
