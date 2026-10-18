const CACHE = 'rem-v95';
const FILES = ['./', './index.html', './beta.html', './manifest.json', './icon-180.png', './icon-192.png', './icon-512.png', './favicon.png',
  './css/app.css', './css/sections.css', './css/ui2.css', ...['core', 'names', 'look', 'help', 'calendar', 'charts', 'sections', 'tasks', 'habits', 'finance', 'goals', 'pages', 'timer', 'ui2', 'layout', 'tour', 'input', 'share', 'cloud', 'notify', 'assistant', 'map', 'main'].map(n => './js/' + n + '.js')];
// cache:'reload' / 'no-cache' — мимо кэша браузера: GitHub Pages разрешает хранить файлы 10 минут, и без этого новая версия приходила с опозданием
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(u => new Request(u, { cache:'reload' })))).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
// Скорость (rem-v95): файлы приложения — сразу из кэша этой версии, без ожидания сети (раньше каждый запуск ждал ответа сервера
// по всем ~30 файлам — при слабой связи это секунды). Кэш одной версии целиком: index.html, стили и скрипты всегда из одного выпуска.
// Новая версия: браузер при запуске сам сверяет sw.js; изменился CACHE — новый service worker скачивает FILES в фоне (install),
// забирает страницу (claim), а страница перезагружается сама, когда человек ничего не делает (js/main.js, swUpdated).
// Остальное (карта vendor/leaflet и т. п.) — из сети с запасной копией в кэше, как раньше.
const fresh = (url, nav) => fetch(new Request(url, { cache:'no-cache', credentials:'same-origin', redirect: nav ? 'manual' : 'follow' }));
const keep = (req, r) => { if (r.ok && !r.redirected && r.type === 'basic') { const c = r.clone(); caches.open(CACHE).then(x => x.put(req, c)); } return r; };
// Переезд на другой адрес: старый отвечает «переехал» (301) — тогда стираем кэш и просим страницы перезагрузиться: следующий запуск пойдёт
// в сеть, и браузер сам перейдёт на новый адрес вместе с #share=… (иначе приложение навсегда застряло бы на старом адресе со старой копией)
const movedCheck = url => fresh(url, true).then(r => { if (r.type !== 'opaqueredirect') return;
  return caches.keys().then(ks => Promise.all(ks.map(k => caches.delete(k)))).then(() => self.clients.matchAll({ type:'window' })).then(l => l.forEach(c => c.postMessage({ moved:1 }))); }).catch(() => {});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  const nav = e.request.mode === 'navigate', u = new URL(e.request.url), home = u.pathname === new URL('./', self.registration.scope).pathname || u.pathname.endsWith('/index.html');
  if (nav) e.waitUntil(movedCheck(e.request.url));   // в фоне, страница не ждёт
  e.respondWith(caches.open(CACHE).then(c => (nav && home ? c.match('./index.html') : c.match(e.request, { ignoreSearch: nav })).then(hit => {
    if (hit) return hit;
    return fresh(e.request.url, nav).then(r => keep(e.request, r)).catch(() => c.match(e.request).then(r => r || (nav ? c.match('./index.html') : Response.error())));
  })));
});
// Напоминание с сервера (функция reminders): { title, body, tag, url, k }. Одинаковый tag — новое заменяет прежнее («за час» → «за 15 минут»)
self.addEventListener('push', e => {
  let d = { title: 'Parsimony', body: 'Напоминание' };
  try { if (e.data) d = Object.assign(d, e.data.json()); } catch (x) {}
  e.waitUntil(self.registration.showNotification(String(d.title), { body: String(d.body), icon: 'icon-192.png', badge: 'icon-192.png',
    tag: d.tag || undefined, renotify: !!d.tag, data: { url: d.url || './', k: d.k || '', s: d.s || '' } }));
});
// Нажатие: открытое приложение — показать в нём нужный день; закрытое — открыть сразу на этом дне
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const d = e.notification.data || {}, url = new URL(d.url || './', self.registration.scope).href;
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const c = list.find(w => w.url.startsWith(self.registration.scope));
    if (c) { if (d.k) c.postMessage({ open: d.k }); else if (d.s) c.postMessage({ sec: d.s }); return c.focus(); }
    return clients.openWindow(url);
  }));
});
