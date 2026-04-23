// Laura's Food — Service Worker
// Strategy:
//   - HTML (navigation requests): network-only with offline fallback,
//     never cached. This prevents stale HTML on installed PWAs (esp. iOS).
//   - Static assets (CSS, fonts, images, JS, manifest): network-first
//     with cache fallback for offline use.
//   - Supabase + AI APIs: pass through, never touched.

const CACHE_VERSION = 'lauras-food-v5';
const STATIC_ASSETS = [
  './manifest.json',
  './icon.svg',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Pass-through: never cache live API calls
  if (url.hostname.includes('supabase.co') ||
      url.hostname.includes('openai.com') ||
      url.hostname.includes('anthropic.com')) {
    return;
  }

  // Navigation requests = HTML page loads. ALWAYS network, never cache.
  // This is the critical fix that prevents stale index.html on PWAs.
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(
      fetch(req, { cache: 'no-store' }).catch(() =>
        new Response(
          '<h1>Offline</h1><p>You are offline. Reconnect and refresh.</p>',
          { status: 200, headers: { 'Content-Type': 'text/html' } }
        )
      )
    );
    return;
  }

  // Static assets: network-first, cache fallback
  event.respondWith(
    fetch(req).then((response) => {
      if (response && response.status === 200 && response.type === 'basic') {
        const clone = response.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(req, clone));
      }
      return response;
    }).catch(() => caches.match(req))
  );
});
