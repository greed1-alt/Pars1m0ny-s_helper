const CACHE = 'rem-v148';
const NUDGE_C = 'rem-nudge', NUDGE_URL = new URL('nudge', self.registration.scope).href;   // помощник пишет сам: текст пуша до открытия чата (aiNudgeOpen в assistant.js)
const FILES = ['./', './index.html', './beta.html', './privacy.html', './consent.html', './terms.html', './manifest.json', './icon-180.png', './icon-192.png', './icon-512.png', './favicon.png',
  './css/fonts.css', './css/app.css', './css/sections.css', './css/ui2.css',
  ...['inter-cyrillic', 'inter-latin', 'inter-latin-ext', 'inter-greek', 'josefin-sans-300-latin'].map(n => './fonts/' + n + '.woff2'),   // свои шрифты (css/fonts.css) — работают и без интернета
  ...['core', 'names', 'a11y', 'look', 'help', 'calendar', 'charts', 'sections', 'tasks', 'habits', 'finance', 'goals', 'pages', 'timer', 'ui2', 'layout', 'tour', 'input', 'share', 'cloud', 'friends', 'chat', 'admin', 'plans', 'shop', 'notify', 'assistant', 'map', 'main'].map(n => './js/' + n + '.js')];
// cache:'reload' / 'no-cache' — мимо кэша браузера: GitHub Pages разрешает хранить файлы 10 минут, и без этого новая версия приходила с опозданием
// С меткой версии в адресе (?v=rem-vN): сразу после выпуска сервер GitHub (CDN) ещё может отдавать старые копии по обычным адресам,
// а кэш теперь — единственный источник файлов до следующей версии, поэтому в него должны попасть именно файлы этого выпуска. Хранятся под обычным адресом
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => Promise.all(FILES.map(u =>
  fetch(new Request(u + '?v=' + CACHE, { cache:'reload' })).then(r => { if (!r.ok) throw new Error(u + ': ' + r.status); return c.put(u, r); }))))
  .then(() => self.skipWaiting(), err => caches.delete(CACHE).then(() => { throw err; }))));   // не скачалось — без половинчатого кэша, попытка при следующем запуске
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== NUDGE_C).map(k => caches.delete(k)))).then(() => self.clients.claim())));
// Скорость (rem-v95): файлы приложения — сразу из кэша этой версии, без ожидания сети (раньше каждый запуск ждал ответа сервера
// по всем ~30 файлам — при слабой связи это секунды). Кэш одной версии целиком: index.html, стили и скрипты всегда из одного выпуска.
// Новая версия: браузер при запуске сам сверяет sw.js; изменился CACHE — новый service worker скачивает FILES в фоне (install),
// забирает страницу (claim), а страница перезагружается сама, когда человек ничего не делает (js/main.js, swUpdated).
// Остальное (карта vendor/leaflet и т. п.) — из сети с запасной копией в кэше, как раньше.
const DEV = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const fresh = (url, nav) => fetch(new Request(url, { cache:'no-cache', credentials:'same-origin', redirect: nav ? 'manual' : 'follow' }));
const keep = (req, r) => { if (r.ok && !r.redirected && r.type === 'basic') { const c = r.clone(); caches.open(CACHE).then(x => x.put(req, c)); } return r; };
// Переезд на другой адрес: старый отвечает «переехал» (301) — тогда стираем кэш и просим страницы перезагрузиться: следующий запуск пойдёт
// в сеть, и браузер сам перейдёт на новый адрес вместе с #share=… (иначе приложение навсегда застряло бы на старом адресе со старой копией)
const movedCheck = url => fresh(url, true).then(r => { if (r.type !== 'opaqueredirect') return;
  return caches.keys().then(ks => Promise.all(ks.map(k => caches.delete(k)))).then(() => self.clients.matchAll({ type:'window' })).then(l => l.forEach(c => c.postMessage({ moved:1 }))); }).catch(() => {});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  const nav = e.request.mode === 'navigate', u = new URL(e.request.url), home = u.pathname === new URL('./', self.registration.scope).pathname || u.pathname.endsWith('/index.html');
  // Локальная разработка (localhost): всегда свежие файлы из сети, кэш — только без сервера. На бете и у друзей — как ниже
  if (DEV) return e.respondWith(fresh(e.request.url, nav).catch(() => caches.open(CACHE).then(c => c.match(e.request, { ignoreSearch: nav }).then(r => r || c.match('./index.html')))));
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
    tag: d.tag || undefined, renotify: !!d.tag, data: { url: d.url || './', k: d.k || '', s: d.s || '', m: d.m || '', ai: d.ai ? String(d.ai).slice(0, 300) : '', act: d.act === 'week' ? 'week' : '' } }));
});
// Нажатие: открытое приложение — показать в нём нужный день; закрытое — открыть сразу на этом дне
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const d = e.notification.data || {}, url = new URL(d.url || './', self.registration.scope).href;
  e.waitUntil((d.ai ? caches.open(NUDGE_C).then(c => c.put(NUDGE_URL, new Response(JSON.stringify({ t: d.ai, a: d.act || '' })))).catch(() => {}) : Promise.resolve())   // ai — помощник пишет сам
    .then(() => clients.matchAll({ type: 'window', includeUncontrolled: true })).then(list => {
    const c = list.find(w => w.url.startsWith(self.registration.scope));
    if (c) { if (d.ai) c.postMessage({ ai: 1 }); else if (d.m) c.postMessage({ msg: d.m }); else if (d.k) c.postMessage({ open: d.k }); else if (d.s) c.postMessage({ sec: d.s }); return c.focus(); }   // m — сообщение друга (chat.js)
    return clients.openWindow(url);
  }));
});
