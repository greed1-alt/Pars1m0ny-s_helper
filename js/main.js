// ---- Запуск ----
// Иконки в статичной шапке
$$('[data-act=prev]').forEach(b => b.innerHTML = I(IC.left, 20));
$$('[data-act=next]').forEach(b => b.innerHTML = I(IC.right, 20));
$('[data-act=settings]').innerHTML = I(IC.gear, 19);
$('.hdr-ai').innerHTML = I(IC.spark, 19) + '<span>Помощник</span>';   // чат помощника (js/assistant.js); подпись — только на ПК
$('.hdr-sr').innerHTML = I(IC.search, 19);   // поиск по всему — в шапке телефона на всех страницах (на ПК — в боковой панели)
$('.btn-new').innerHTML = I(IC.plus, 17) + 'Создать';

if (IS_BETA) { document.title = APP_TITLE; document.documentElement.classList.add('is-beta'); }

save();   // сохранить то, что добавила проверка данных разделов

// ---- Новая версия (rem-v95) ----
// sw.js отдаёт приложение сразу из кэша, а новую версию скачивает в фоне и забирает страницу (controllerchange). Тогда перезагружаемся:
// сразу, если человек ничего не делает, иначе — когда вернётся в приложение. Раздел, вид и день переживают перезагрузку (sessionStorage)
const UPD_KEY = 'remapp_upd';
let swReg = null, swHad = false, swPending = false, swChecked = Date.now(), swJustUpd = false;
const swBusy = () => { const ae = document.activeElement; return sheetOpen() || cmdOpen() || quickOpen() || !!drag || document.documentElement.classList.contains('touring') || !!(ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) && ae.value); };
function swUpdated() {
  if (swBusy()) { swPending = true; return; }
  try { sessionStorage.setItem(UPD_KEY, JSON.stringify({ sec, view, sel, secYM, tView })); } catch (e) {}
  location.reload();
}
try {
  const u = JSON.parse(sessionStorage.getItem(UPD_KEY) || 'null'); sessionStorage.removeItem(UPD_KEY);
  if (u) { swJustUpd = true;
    if (SEC_ALL.includes(u.sec)) sec = u.sec;
    if (['month', 'week', 'day', 'list'].includes(u.view)) view = u.view;
    if (isDayKey(u.sel)) { sel = u.sel; monthAnchor = pd(sel); monthAnchor.setDate(1); }
    if (/^\d{4}-\d{2}$/.test(u.secYM)) secYM = u.secYM;
    if (['main', 'all', 'goals'].includes(u.tView)) tView = u.tView; }
} catch (e) {}
if ('serviceWorker' in navigator) {
  swHad = !!navigator.serviceWorker.controller;   // первая установка тоже «забирает» страницу — тогда перезагружать не нужно
  navigator.serviceWorker.register('sw.js').then(r => { swReg = r; }).catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (swHad) swUpdated(); swHad = true; });
  navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.moved) location.reload(); });   // сайт переехал — sw.js стёр кэш, браузер перейдёт сам
  // Вернулись в приложение (на iPhone оно при этом не перезапускается): отложенное обновление — сейчас; заодно проверить, не вышла ли новая версия
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    if (swPending) { swPending = false; swUpdated(); return; }
    if (swReg && Date.now() - swChecked > 60000) { swChecked = Date.now(); swReg.update().catch(() => {}); }
  });
}
render();
if (swJustUpd) appVerLoad().then(v => toast('Приложение обновлено' + (v ? ' — версия ' + v : '')));
cloudStart();   // аккаунт: забрать свежие записи с сервера (js/cloud.js)
frStart();      // друзья: список и своя карточка (js/friends.js)
checkNotif();
checkShareHash();
frHash();   // открыли ссылку-приглашение в друзья
checkDayHash();   // открыли по нажатию на напоминание — показать этот день
