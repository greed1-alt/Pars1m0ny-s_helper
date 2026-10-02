// ---- Уведомления ----
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
let notif = { state:'', text:'Проверяю…', short:'проверяю…' };
const swReady = () => Promise.race([navigator.serviceWorker.ready, new Promise((_, rej) => setTimeout(() => rej(new Error('service worker не запустился')), 4000))]);
async function checkNotif() {
  const set = (state, text, short) => { notif = { state, text, short }; };
  if (!('Notification' in window) || !('serviceWorker' in navigator)) set('off', 'Этот браузер не поддерживает уведомления', 'нет поддержки');
  else if (isIOS && navigator.standalone !== true) set('off', 'Откройте приложение с экрана «Домой», а не из Safari', 'откройте с «Домой»');
  else if (Notification.permission === 'denied') set('off', 'Запрещены в настройках телефона или браузера', 'запрещены');
  else if (Notification.permission !== 'granted') set('off', 'Выключены — нажмите «Включить уведомления»', 'выключены');
  else {
    let sub = null; try { const reg = await swReady(); sub = reg.pushManager ? await reg.pushManager.getSubscription() : null; } catch (x) {}
    sub ? set('on', 'Включены, устройство подписано', 'включены') : set('warn', 'Разрешены, но устройство ещё не подписано — нажмите «Включить»', 'не подписано');
  }
  const sl = $('.sb-link .ndot'); if (sl) $('#side').innerHTML = sideHTML();
  const ns = $('#nstat_t'); if (ns) { ns.textContent = notif.text; ns.previousElementSibling.className = 'ndot ' + notif.state; }
}
const plog = t => { const l = $('#plog'); if (l) l.textContent += (l.textContent ? '\n' : '') + t; else toast(t); };
const b64 = v => { const raw = atob((v + '='.repeat((4 - v.length % 4) % 4)).replace(/-/g,'+').replace(/_/g,'/')); return Uint8Array.from([...raw].map(c => c.charCodeAt(0))); };
async function enablePush() {
  try {
    if (isIOS && navigator.standalone !== true) return plog('Откройте приложение с экрана «Домой», а не из Safari.');
    if (!('PushManager' in window)) return plog('Уведомления не поддерживаются.');
    const reg = await swReady();
    if (await Notification.requestPermission() !== 'granted') { checkNotif(); return plog('Разрешение на уведомления не выдано.'); }
    const sub = await reg.pushManager.subscribe({ userVisibleOnly:true, applicationServerKey:b64(VAPID_PUBLIC) });
    const j = sub.toJSON();
    const r = await fetch(SUPABASE_URL + '/rest/v1/push_subscriptions', { method:'POST',
      headers:{ 'Content-Type':'application/json', apikey:SUPABASE_KEY, Authorization:'Bearer ' + SUPABASE_KEY },
      body: JSON.stringify({ endpoint:j.endpoint, p256dh:j.keys.p256dh, auth:j.keys.auth }) });
    plog(r.ok || r.status === 409 ? 'Уведомления включены.' : 'Ошибка сохранения: ' + r.status);
  } catch (e) { plog('Ошибка: ' + e.message); }
  checkNotif();
}
async function testNotif() {
  try {
    if (!('Notification' in window)) return plog('Этот браузер не поддерживает уведомления.');
    if (isIOS && navigator.standalone !== true) return plog('Откройте приложение с экрана «Домой», а не из Safari.');
    if (Notification.permission !== 'granted' && await Notification.requestPermission() !== 'granted') { checkNotif(); return plog('Разрешение на уведомления не выдано.'); }
    const reg = await swReady();
    await reg.showNotification(APP_NAME, { body:'Тестовое уведомление — всё работает ✓', icon:'icon-192.png', tag:'test' });
    S.settings.lastTest = Date.now(); save();
    toast('Тестовое уведомление отправлено');
    if (sheetOpen() && $('#nstat_t')) openSettings(true);
  } catch (e) { plog('Ошибка: ' + e.message); }
  checkNotif();
}

// ---- Обновление «сейчас» раз в 30 секунд ----
function tick() {
  if (document.hidden) return;
  const ae = document.activeElement, busy = drag || mk || quickOpen() || sheetOpen() || cmdOpen() || (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName));
  if (!busy) render();
}
let lastDay = todayK(), lastWide = innerWidth >= 900, lastW = innerWidth, rsT;
// Наступил новый день, а открыт был «сегодня» — переходим на новый день
const rollDay = () => { const t = todayK(); if (t === lastDay) return false; if (sel === lastDay) { sel = t; syncMini(); monthAnchor = pd(t); monthAnchor.setDate(1); } if (secYM === ymOf(lastDay)) secYM = ymOf(t); lastDay = t; return true; };
// В разделах «сейчас» не рисуется — перерисовываем их только при смене дня
setInterval(() => { if (rollDay() || sec === 'cal') tick(); }, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { if (rollDay() || sec === 'cal') tick(); checkNotif(); } });
addEventListener('resize', () => { clearTimeout(rsT); rsT = setTimeout(() => {
  const wide = innerWidth >= 900, wChanged = innerWidth !== lastW; lastW = innerWidth;
  if (wide !== lastWide) { lastWide = wide; lastGridView = null; }
  // На телефоне клавиатура меняет только высоту окна — разделы не трогаем, чтобы поле ввода не теряло фокус
  if (sec !== 'cal' && !wChanged) return;
  if (!drag && !mk && !quickOpen()) render(); }, 150); });
