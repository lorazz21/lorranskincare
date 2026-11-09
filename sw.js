// Service worker: guarda os arquivos do app para abrir offline.
// A cada publicação, aumente VERSION para o iPhone baixar a versão nova.

const VERSION = 'v4';
const CACHE = `skincare-${VERSION}`;

const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/app.js',
  'js/actions.js',
  'js/dates.js',
  'js/files.js',
  'js/ics.js',
  'js/images.js',
  'js/photos.js',
  'js/routine.js',
  'js/seed.js',
  'js/stock.js',
  'js/store.js',
  'js/ui.js',
  'js/views/checklist.js',
  'js/views/today.js',
  'js/views/history.js',
  'js/views/photos.js',
  'js/views/products.js',
  'js/views/settings.js',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

// No computador (localhost), busca sempre a versão mais nova; no iPhone, usa o cache.
const DEV = ['localhost', '127.0.0.1'].includes(self.location.hostname);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith('skincare-') && key !== CACHE)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(DEV ? networkFirst(request) : cacheFirst(request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) return cached;
  try {
    return await fetchAndStore(request);
  } catch (err) {
    if (request.mode === 'navigate') return caches.match('index.html');
    throw err;
  }
}

async function networkFirst(request) {
  try {
    return await fetchAndStore(request);
  } catch {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (request.mode === 'navigate') return caches.match('index.html');
    return Response.error();
  }
}

async function fetchAndStore(request) {
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE);
    cache.put(request, response.clone());
  }
  return response;
}
