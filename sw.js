const CACHE = 'rem-v19';
const FILES = ['./', './index.html', './manifest.json', './icon-180.png', './icon-192.png', './icon-512.png',
  './css/app.css', './css/sections.css', ...['core', 'calendar', 'charts', 'sections', 'tasks', 'habits', 'finance', 'input', 'share', 'notify', 'main'].map(n => './js/' + n + '.js')];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
// Сначала сеть (свежая версия), при отсутствии интернета — кэш
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return r; })
    .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html'))));
});
self.addEventListener('push', e => {
  let d = { title: 'Parsimony', body: 'Уведомление' };
  try { if (e.data) d = e.data.json(); } catch (x) {}
  e.waitUntil(self.registration.showNotification(d.title, { body: d.body, icon: 'icon-192.png', data: { url: d.url || './index.html' } }));
});
self.addEventListener('notificationclick', e => { e.notification.close(); e.waitUntil(clients.openWindow(e.notification.data.url)); });
