const CACHE = 'rem-v46';
const FILES = ['./', './index.html', './beta.html', './manifest.json', './icon-180.png', './icon-192.png', './icon-512.png',
  './css/app.css', './css/sections.css', './css/ui2.css', ...['core', 'look', 'help', 'calendar', 'charts', 'sections', 'tasks', 'habits', 'finance', 'goals', 'pages', 'timer', 'ui2', 'layout', 'tour', 'input', 'share', 'cloud', 'notify', 'main'].map(n => './js/' + n + '.js')];
// cache:'reload' / 'no-cache' — мимо кэша браузера: GitHub Pages разрешает хранить файлы 10 минут, и без этого новая версия приходила с опозданием
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(u => new Request(u, { cache:'reload' })))).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
// Сначала сеть (свежая версия), при отсутствии интернета — кэш.
// Страницу просим с redirect:'manual': если сайт переехал на новый адрес (свой домен), браузер сам перейдёт туда,
// а не застрянет на старом адресе со старой копией из кэша. В кэш кладём только обычные ответы 200.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  const nav = e.request.mode === 'navigate';
  e.respondWith(fetch(new Request(e.request.url, { cache:'no-cache', credentials:'same-origin', redirect: nav ? 'manual' : 'follow' })).then(r => {
    if (r.ok && !r.redirected) { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); }
    return r;
  }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html'))));
});
self.addEventListener('push', e => {
  let d = { title: 'Parsimony', body: 'Уведомление' };
  try { if (e.data) d = e.data.json(); } catch (x) {}
  e.waitUntil(self.registration.showNotification(d.title, { body: d.body, icon: 'icon-192.png', data: { url: d.url || './index.html' } }));
});
self.addEventListener('notificationclick', e => { e.notification.close(); e.waitUntil(clients.openWindow(e.notification.data.url)); });
