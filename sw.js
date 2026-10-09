const CACHE = 'rem-v48';
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
// Напоминание с сервера (функция reminders): { title, body, tag, url, k }. Одинаковый tag — новое заменяет прежнее («за час» → «за 15 минут»)
self.addEventListener('push', e => {
  let d = { title: 'Parsimony', body: 'Напоминание' };
  try { if (e.data) d = Object.assign(d, e.data.json()); } catch (x) {}
  e.waitUntil(self.registration.showNotification(String(d.title), { body: String(d.body), icon: 'icon-192.png', badge: 'icon-192.png',
    tag: d.tag || undefined, renotify: !!d.tag, data: { url: d.url || './', k: d.k || '' } }));
});
// Нажатие: открытое приложение — показать в нём нужный день; закрытое — открыть сразу на этом дне
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const d = e.notification.data || {}, url = new URL(d.url || './', self.registration.scope).href;
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const c = list.find(w => w.url.startsWith(self.registration.scope));
    if (c) { if (d.k) c.postMessage({ open: d.k }); return c.focus(); }
    return clients.openWindow(url);
  }));
});
