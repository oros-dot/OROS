// OROS Service Worker — cache offline
// ─────────────────────────────────────────────────────────────────────
// IMPORTANTE: alzare CACHE_VERSION a ogni deploy, altrimenti il
// dispositivo continua a servire la copia salvata in precedenza.
// ─────────────────────────────────────────────────────────────────────
var CACHE_PREFIX  = 'oros-';
var CACHE_VERSION = CACHE_PREFIX + 'v9';

var CORE_ASSETS = [
  './',
  './index.html'
];

// ── Installazione ──────────────────────────────────────────────────
// cache:'reload' obbliga a scaricare dalla rete. Senza, il browser può
// consegnare la copia ancora valida nella sua cache HTTP e finirebbe in
// archivio una index.html vecchia proprio subito dopo un deploy.
// I file si aggiungono uno alla volta: con addAll un singolo errore di
// rete annullava l'intera installazione e il dispositivo restava senza
// alcuna copia offline.
self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      return Promise.all(CORE_ASSETS.map(function (u) {
        return cache.add(new Request(u, { cache: 'reload' })).catch(function (err) {
          console.warn('[SW] precache non riuscito:', u, err);
        });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

// ── Attivazione ────────────────────────────────────────────────────
// Si cancellano solo le cache che iniziano per 'oros-'. CacheStorage è
// per origine, non per cartella: su GitHub Pages tutti i progetti dello
// stesso account vivono su username.github.io. Senza il filtro sul
// prefisso questo Service Worker cancellava anche le cache degli altri
// siti ospitati sullo stesso dominio.
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k.indexOf(CACHE_PREFIX) === 0 && k !== CACHE_VERSION) return caches.delete(k);
        return null;
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

// ── Scrittura in cache ─────────────────────────────────────────────
// Legata al ciclo di vita dell'evento tramite waitUntil: senza, il
// Service Worker può essere spento appena consegnata la risposta e la
// scrittura non arriva mai a termine. Su iOS succede di frequente.
// Si accetta solo lo stato 200: su una 206 Partial Content put() fallisce.
function cachePut(e, req, res) {
  if (!res || res.status !== 200) return;
  var copy = res.clone();
  e.waitUntil(
    caches.open(CACHE_VERSION)
      .then(function (c) { return c.put(req, copy); })
      .catch(function (err) { console.warn('[SW] scrittura in cache non riuscita:', err); })
  );
}

// ── Lettura dalla cache ────────────────────────────────────────────
// Limitata alla cache di questa versione: caches.match() senza cacheName
// interroga TUTTE le cache dell'origine e può restituire la risposta di
// una versione precedente o addirittura di un altro progetto.
// ignoreVary evita che un header Vary del server faccia mancare la
// corrispondenza proprio quando serve, cioè da offline.
function fromCache(req) {
  return caches.match(req, { cacheName: CACHE_VERSION, ignoreVary: true });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (err) { return; }

  // Solo same-origin: CDN, Firebase e TradingView passano sempre dalla rete
  if (url.origin !== self.location.origin) return;

  // Network-first per la pagina: online sempre fresca, offline la copia salvata
  if (req.mode === 'navigate' || url.pathname.endsWith('index.html') || url.pathname.endsWith('/')) {
    e.respondWith(
      fetch(req).then(function (res) {
        cachePut(e, req, res);
        return res;
      }).catch(function () {
        return fromCache(req).then(function (r) {
          return r || fromCache('./index.html');
        }).then(function (r) {
          if (r) return r;
          // Prima qui si restituiva undefined: il browser mostrava il proprio
          // errore di rete generico. Se preferisci quel comportamento, togli
          // questo blocco e lascia solo "return r;".
          return new Response(
            '<!doctype html><meta charset="utf-8"><title>OROS</title>' +
            '<body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;' +
            'background:#0a0e1a;color:#d1d4dc;font-family:sans-serif;text-align:center">' +
            '<div>OROS non è ancora stato salvato su questo dispositivo.<br>Riconnettiti e riapri l\u2019app.</div>',
            { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        });
      })
    );
    return;
  }

  // Cache-first per gli altri file same-origin: cambiando CACHE_VERSION a
  // ogni deploy la copia vecchia viene comunque eliminata in attivazione.
  e.respondWith(
    fromCache(req).then(function (cached) {
      if (cached) return cached;
      return fetch(req).then(function (res) {
        cachePut(e, req, res);
        return res;
      });
    })
  );
});
