// Service worker: l'intera app è in cache, funziona offline al 100%.
// Quando cambi un file, incrementa VERSION per far scaricare la nuova versione.
const VERSION = 'mymoney-v16';
const ASSETS = [
  './', 'index.html', 'manifest.json', 'css/style.css',
  'js/app.js', 'js/ctx.js', 'js/calc.js', 'js/importcode.js', 'js/cardpick.js', 'js/gate.js', 'js/chart.js', 'js/db.js', 'js/entry.js', 'js/forms.js', 'js/migrate.js', 'js/money.js', 'js/period.js', 'js/store.js', 'js/ui.js',
  'js/views/dashboard.js', 'js/views/fixed.js', 'js/views/movements.js', 'js/views/prospetto.js', 'js/views/setup.js', 'js/views/settings.js',
  'icons/icon-192-v2.png', 'icons/icon-512-v2.png', 'icons/icon-maskable-512-v2.png', 'icons/apple-touch-icon-v2.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request).catch(() => caches.match('index.html'))));
});
