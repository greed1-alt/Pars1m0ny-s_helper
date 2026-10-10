// ---- Уведомления и напоминания по времени ----
// Напоминания шлёт сервер (функция reminders, раз в минуту) на устройства, где человек нажал «Включить напоминания».
// Подписка устройства привязана к аккаунту: rpc push_register / push_unregister (supabase/sql/reminders.sql).
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const PUSH_LS = 'remapp_push';   // { uid, endpoint, at } — устройство подписано на напоминания этого аккаунта
let notif = { state:'', text:'Проверяю…', short:'проверяю…', on:false };
const swReady = () => Promise.race([navigator.serviceWorker.ready, new Promise((_, rej) => setTimeout(() => rej(new Error('service worker не запустился')), 4000))]);
const pushSupported = () => 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
const pushSub = async () => { try { const reg = await swReady(); return reg.pushManager ? await reg.pushManager.getSubscription() : null; } catch (x) { return null; } };
const pushMine = sub => { const p = lsGet(PUSH_LS); return !!(sub && p && signedIn() && p.uid === auth.uid && p.endpoint === sub.endpoint); };
async function checkNotif() {
  const set = (state, text, short, on) => { notif = { state, text, short, on: !!on }; };
  if (!pushSupported()) set('off', 'Этот браузер не умеет показывать напоминания', 'нет поддержки');
  else if (isIOS && navigator.standalone !== true) set('off', 'На iPhone напоминания работают в приложении с экрана «Домой», а не в Safari', 'откройте с «Домой»');
  else if (Notification.permission === 'denied') set('off', 'Уведомления запрещены в настройках телефона или браузера', 'запрещены');
  else if (!signedIn()) set('off', 'Войдите в аккаунт — напоминания приходят на устройства, где вы вошли', 'нужен вход');
  else if (Notification.permission !== 'granted') set('off', 'Выключены на этом устройстве', 'выключены');
  else { const mine = pushMine(await pushSub()); mine ? set('on', 'Включены на этом устройстве', 'включены', true) : set('warn', 'Разрешены, но это устройство ещё не подписано', 'не подписано'); }
  const ns = $('#nstat_t'); if (ns && ns.textContent !== notif.text && sec === 'settings') render();
}
const plog = t => { const l = $('#plog'); if (l) l.textContent += (l.textContent ? '\n' : '') + t; else toast(t); };
const b64 = v => { const raw = atob((v + '='.repeat((4 - v.length % 4) % 4)).replace(/-/g,'+').replace(/_/g,'/')); return Uint8Array.from([...raw].map(c => c.charCodeAt(0))); };
// Отправить подписку устройства на сервер (тихо — при входе и запуске, если разрешение уже есть)
async function pushRegister(sub) {
  const j = sub.toJSON();
  await api('/rest/v1/rpc/push_register', { method:'POST', user:true, body:{ p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_ua: navigator.userAgent.slice(0, 200) } });
  lsSet(PUSH_LS, { uid: auth.uid, endpoint: j.endpoint, at: Date.now() });
}
async function enablePush() {
  if (!signedIn()) { toast('Сначала войдите в аккаунт'); return openLogin(); }
  if (isIOS && navigator.standalone !== true) return plog('Откройте приложение с экрана «Домой», а не из Safari.');
  if (!pushSupported()) return plog('Этот браузер не умеет показывать напоминания.');
  try {
    // Разрешение спрашиваем сразу по нажатию: iPhone не покажет вопрос, если перед ним было ожидание
    if (Notification.permission !== 'granted' && await Notification.requestPermission() !== 'granted') { checkNotif(); return plog('Разрешение на уведомления не выдано. Его можно включить в настройках телефона или браузера.'); }
    const reg = await swReady();
    const sub = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({ userVisibleOnly:true, applicationServerKey:b64(VAPID_PUBLIC) });
    await pushRegister(sub);
    toast('Напоминания включены на этом устройстве');
  } catch (e) { plog('Не получилось: ' + (e instanceof CloudErr ? cloudErrText(e) : e.message)); }
  checkNotif();
}
// Выключить на этом устройстве. quiet — при выходе из аккаунта: без сообщений, ошибки сети не мешают выйти
async function disablePush(quiet) {
  const sub = await pushSub();
  try { if (sub && signedIn()) await api('/rest/v1/rpc/push_unregister', { method:'POST', user:true, body:{ p_endpoint: sub.endpoint } }); } catch (e) { if (!quiet) return plog('Не получилось: ' + cloudErrText(e)); }
  try { if (sub) await sub.unsubscribe(); } catch (e) {}
  lsSet(PUSH_LS, null);
  if (!quiet) { toast('Напоминания на этом устройстве выключены'); checkNotif(); }
}
// При входе и запуске: если разрешение уже есть, привязать устройство к текущему аккаунту (раз в сутки — обновить)
async function pushSync() {
  if (!signedIn() || !pushSupported() || Notification.permission !== 'granted') return;
  const sub = await pushSub(), p = lsGet(PUSH_LS);
  if (!sub || !p) return;   // человек сам не включал — не подписываем молча
  if (p.uid === auth.uid && p.endpoint === sub.endpoint && Date.now() - (p.at || 0) < 864e5) return;
  try { await pushRegister(sub); } catch (e) {}
  checkNotif();
}
// «Проверить»: подписанное устройство — уведомление идёт через сервер, как настоящее напоминание; иначе — показываем прямо здесь
async function testNotif() {
  try {
    if (!('Notification' in window)) return plog('Этот браузер не умеет показывать уведомления.');
    if (isIOS && navigator.standalone !== true) return plog('Откройте приложение с экрана «Домой», а не из Safari.');
    if (notif.on) {
      const r = await fetch(SUPABASE_URL + '/functions/v1/reminders', { method:'POST', cache:'no-store',
        headers:{ 'Content-Type':'application/json', apikey: SUPABASE_KEY, Authorization: 'Bearer ' + await accessToken() }, body:'{"test":true}' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return plog('Сервер напоминаний не ответил (' + r.status + '). Попробуйте позже.');
      if (j.error === 'rate') return toast('Проверка уже отправлена — подождите минуту');
      if (!j.devices) { lsSet(PUSH_LS, null); checkNotif(); return plog('Сервер не знает это устройство — нажмите «Включить напоминания» ещё раз.'); }
      toast(j.ok ? `Отправили на ${plural(j.ok, ['устройство', 'устройства', 'устройств'])} — уведомление придёт через несколько секунд` : 'Сервер не смог отправить уведомление — включите напоминания заново');
    } else {
      if (Notification.permission !== 'granted' && await Notification.requestPermission() !== 'granted') { checkNotif(); return plog('Разрешение на уведомления не выдано.'); }
      const reg = await swReady();
      await reg.showNotification(APP_NAME, { body:'Тестовое уведомление — на этом устройстве показываются ✓', icon:'icon-192.png', tag:'test' });
      toast('Тестовое уведомление показано');
    }
    S.settings.lastTest = Date.now(); save();
    if (sec === 'settings') render();
  } catch (e) { plog('Ошибка: ' + (e instanceof CloudErr ? cloudErrText(e) : e.message)); }
  checkNotif();
}
// ---- Сводки: утром — план на день, вечером — «запишите задачи на завтра». Шлёт сервер (функция reminders) по S.settings.digest ----
const HM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
onMigrate(() => { const d = S.settings.digest && typeof S.settings.digest === 'object' ? S.settings.digest : {};
  S.settings.digest = { am: d.am !== false, amT: HM_RE.test(d.amT || '') ? d.amT : '09:00', pm: d.pm !== false, pmT: HM_RE.test(d.pmT || '') ? d.pmT : '22:00' }; });
const digestRow = (k, label, hint) => { const d = S.settings.digest;
  return `<div class="set-row dg-row"><span>${label}<small>${hint}</small></span><span class="dg-r"><input class="fin dg-t" type="time" data-dg="${k}T" value="${esc(d[k + 'T'])}" aria-label="Время"${d[k] ? '' : ' disabled'}><input class="sw" type="checkbox" data-dg="${k}" aria-label="${label}"${d[k] ? ' checked' : ''}></span></div>`; };
const digestHTML = () => `<div class="set-sub">Сводки</div>
  ${digestRow('am', 'Утром — план на день', 'дела на сегодня и пропущенные')}
  ${digestRow('pm', 'Вечером — «запишите задачи на завтра»', 'что уже есть на завтра')}`;
document.addEventListener('change', e => {
  const t = e.target, k = t.dataset && t.dataset.dg; if (!k) return;
  const d = S.settings.digest;
  if (k === 'am' || k === 'pm') d[k] = t.checked;
  else if (HM_RE.test(t.value)) d[k] = t.value; else { t.value = d[k]; return; }
  save(); render();
  toast(k === 'am' || k === 'pm' ? (t.checked ? 'Сводка включена' : 'Сводка выключена') : 'Время сводки: ' + t.value);
});
// Нажали на уведомление о напоминании — открываем этот день в календаре (#d=2026-10-12 или сообщение от service worker)
function openDay(k) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(k || '')) return;
  sel = k; view = 'day'; syncMini(); monthAnchor = pd(k); monthAnchor.setDate(1);
  if (typeof closeSheet === 'function') closeSheet();
  setSec('cal');
}
// Утренняя сводка открывает Главную (#s=home), напоминание и вечерняя — день в календаре (#d=…)
const openSecFromPush = s => { if (s === 'home' && SEC.home) { if (typeof closeSheet === 'function') closeSheet(); setSec('home'); } };
function checkDayHash() {
  const m = location.hash.match(/^#(d|s)=([\w-]{1,20})$/); if (!m) return;
  history.replaceState(null, '', location.pathname + location.search);
  m[1] === 'd' ? openDay(m[2]) : openSecFromPush(m[2]);
}
addEventListener('hashchange', checkDayHash);
if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', e => { const d = e.data || {}; if (d.open) openDay(d.open); else if (d.sec) openSecFromPush(d.sec); });
// Часовой пояс устройства — по нему сервер считает время напоминаний
try { const tz = Intl.DateTimeFormat().resolvedOptions().timeZone; if (tz && S.settings.tz !== tz) S.settings.tz = tz; } catch (e) {}

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
