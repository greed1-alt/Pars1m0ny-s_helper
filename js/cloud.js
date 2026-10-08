// ---- Аккаунт и синхронизация (бета, 7 октября 2026) ----
// Вход — по коду из письма (Supabase Auth, без паролей). Данные — одна строка в таблице user_data: весь S в JSON, кроме настроек устройства.
// Приложение по-прежнему работает без интернета: всё сохраняется на устройстве, а при связи уходит на сервер и приходит с него.
// Два устройства не затирают друг друга: сервер ведёт номер версии (rev), при расхождении изменения объединяются (merge3).
// Весь код работы с сервером — здесь: переезд на российский сервер = замена SUPABASE_URL / SUPABASE_KEY (решение пользователя 7 октября 2026).
// Таблица и правила доступа — supabase/sql/user_data.sql. Бета закрытая: в Supabase выключена регистрация, войти могут только добавленные почты.
const LG_LS = 'remapp_login', AUTH_LS = 'remapp_auth', SYNC_LS = 'remapp_sync', BASE_LS = 'remapp_v1_base', SAFE_LS = 'remapp_v1_safety';
const DEVICE_ONLY = ['dev', 'sec', 'lastTest'];   // настройки устройства — не синхронизируются
const lsGet = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch (e) {} };
let auth = lsGet(AUTH_LS);
const SYNC0 = () => ({ rev:0, owner:'', at:0, err:'' });
let sync = Object.assign(SYNC0(), lsGet(SYNC_LS) || {});
const saveAuth = () => lsSet(AUTH_LS, auth);
const saveSync = () => lsSet(SYNC_LS, sync);
const signedIn = () => !!(auth && auth.rt && auth.uid);

// ---- Запросы к серверу ----
class CloudErr extends Error { constructor(msg, status, code) { super(msg); this.status = status; this.code = code || ''; } }
async function api(path, o) {
  o = o || {};
  const h = Object.assign({ apikey: SUPABASE_KEY }, o.headers || {});
  if (o.body !== undefined) h['Content-Type'] = 'application/json';
  if (o.user) h.Authorization = 'Bearer ' + await accessToken();
  let r;
  try { r = await fetch(SUPABASE_URL + path, { method: o.method || 'GET', headers: h, body: o.body === undefined ? undefined : JSON.stringify(o.body), cache: 'no-store' }); }
  catch (e) { throw new CloudErr('offline', 0); }
  const txt = await r.text(); let j = null; try { j = txt ? JSON.parse(txt) : null; } catch (e) {}
  if (!r.ok) throw new CloudErr(String((j && (j.msg || j.message || j.error_description || j.error)) || 'HTTP ' + r.status), r.status, j && (j.error_code || j.code));
  return j;
}
const setSession = j => {
  const u = j.user || {};
  auth = { at: j.access_token, rt: j.refresh_token, exp: Math.floor(Date.now() / 1000) + (Number(j.expires_in) || 3600),
    uid: /^[0-9a-f-]{36}$/i.test(u.id || '') ? u.id : auth && auth.uid, email: String(u.email || auth && auth.email || '').slice(0, 200) };
  saveAuth();
};
let refreshing = null;
async function accessToken() {
  if (!signedIn()) throw new CloudErr('signed out', 401);
  if (auth.at && auth.exp - 60 > Date.now() / 1000) return auth.at;
  if (!refreshing) refreshing = (async () => {
    try { setSession(await api('/auth/v1/token?grant_type=refresh_token', { method:'POST', body:{ refresh_token: auth.rt } })); }
    catch (e) { if (e.status >= 400 && e.status < 500) sessionLost(); throw e; }
    finally { refreshing = null; }
  })();
  await refreshing; return auth.at;
}
// Вход закончился на сервере (вышли на другом устройстве, аккаунт удалён) — данные на устройстве не трогаем, просим войти снова
function sessionLost() { auth = null; saveAuth(); sync.err = 'relogin'; saveSync(); syncUI(); }

const rowGet = async cols => { const j = await api(`/rest/v1/user_data?select=${cols}&user_id=eq.${auth.uid}`, { user:true }); return j && j[0] || null; };
const rowInsert = async data => (await api('/rest/v1/user_data?select=rev', { method:'POST', user:true, body:{ user_id:auth.uid, data }, headers:{ Prefer:'return=representation' } }))[0];
// Записать, только если на сервере всё ещё наша версия rev; иначе null — значит, другое устройство успело раньше
const rowUpdate = async (data, rev) => { const j = await api(`/rest/v1/user_data?user_id=eq.${auth.uid}&rev=eq.${Number(rev)}&select=rev`, { method:'PATCH', user:true, body:{ data }, headers:{ Prefer:'return=representation' } }); return j && j[0] || null; };

// ---- Данные: что отправляем и как объединяем ----
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const canon = v => JSON.stringify(v === undefined ? null : v, (k, x) => isObj(x) ? Object.keys(x).sort().reduce((o, key) => { o[key] = x[key]; return o; }, {}) : x);
const same = (a, b) => canon(a) === canon(b);
const packS = () => { const d = JSON.parse(JSON.stringify(S)); if (d.settings) DEVICE_ONLY.forEach(k => delete d.settings[k]); return d; };
const readBase = () => { const b = lsGet(BASE_LS); return b && sync.rev ? b : null; };
const writeBase = (data, rev) => { lsSet(BASE_LS, canon(data)); sync.rev = Number(rev) || 0; sync.owner = auth.uid; sync.at = Date.now(); sync.err = ''; saveSync(); };
// Трёхстороннее объединение: base — последняя общая версия, loc — это устройство, rem — сервер.
// Списки с id объединяются по записям (новое с обеих сторон остаётся, удалённое удаляется), списки дат и чисел — как множества,
// в остальном при споре побеждает это устройство.
function merge3(base, loc, rem) {
  if (same(loc, base)) return rem;
  if (same(rem, base)) return loc;
  if (isObj(loc) && isObj(rem)) {
    const b = isObj(base) ? base : {}, out = {};
    new Set([...Object.keys(rem), ...Object.keys(loc)]).forEach(k => { const v = merge3(b[k], loc[k], rem[k]); if (v !== undefined) out[k] = v; });
    return out;
  }
  if (Array.isArray(loc) && Array.isArray(rem)) {
    const withId = a => a.every(x => isObj(x) && typeof x.id === 'string');
    if (withId(loc) && withId(rem) && (loc.length || rem.length)) {
      const bm = new Map((Array.isArray(base) ? base : []).filter(isObj).map(x => [x.id, x])), lm = new Map(loc.map(x => [x.id, x])), rm = new Map(rem.map(x => [x.id, x]));
      const out = [];
      [...rm.keys(), ...[...lm.keys()].filter(id => !rm.has(id))].forEach(id => { const v = merge3(bm.get(id), lm.get(id), rm.get(id)); if (v !== undefined) out.push(v); });
      return out;
    }
    if (loc.every(x => typeof x !== 'object') && rem.every(x => typeof x !== 'object')) {
      const b = new Set(Array.isArray(base) ? base : []), l = new Set(loc), r = new Set(rem);
      return [...new Set([...rem.filter(x => !(b.has(x) && !l.has(x))), ...loc.filter(x => !b.has(x) && !r.has(x))])];
    }
  }
  return loc;
}
// Данные с сервера → на устройство (проверка cleanTree из share.js, настройки устройства остаются свои)
let applying = false;
function applyData(d) {
  const keep = {}; DEVICE_ONLY.forEach(k => { if (S.settings[k] !== undefined) keep[k] = S.settings[k]; });
  const fresh = Object.assign(structuredClone(DEF), cleanTree(d || {}, ''));
  fresh.settings = Object.assign({}, DEF.settings, fresh.settings, keep);
  applying = true;
  try { Object.keys(S).forEach(k => delete S[k]); Object.assign(S, fresh); migrate(); save(); } finally { applying = false; }
  render();
}
const hasLocalData = () => ['events', 'habits', 'notes', 'goals'].some(k => Array.isArray(S[k]) && S[k].some(x => !x.demo)) || (S.fin && S.fin.ops || []).some(o => !o.demo);
const safetyCopy = () => lsSet(SAFE_LS, { at: Date.now(), data: packS() });

// ---- Синхронизация ----
let syncBusy = false, syncAgain = false, syncTimer = 0;
SAVE_HOOKS.push(() => { if (!applying && signedIn()) syncSoon(); });
function syncSoon(ms) { clearTimeout(syncTimer); syncTimer = setTimeout(syncNow, ms == null ? 1500 : ms); }
const typing = () => { const a = document.activeElement; return !!a && /^(INPUT|TEXTAREA)$/.test(a.tagName) && !!a.closest('#main, #sh'); };
async function syncNow() {
  if (!signedIn()) return;
  if (syncBusy) { syncAgain = true; return; }
  syncBusy = true; syncUI('busy');
  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      const base = readBase(), local = packS(), changed = !base || !same(local, base);
      const head = await rowGet('rev');
      if (!head) { const r = await rowInsert(local); writeBase(local, r.rev); break; }
      if (base && head.rev === sync.rev) {
        if (!changed) { sync.at = Date.now(); sync.err = ''; break; }
        const r = await rowUpdate(local, sync.rev);
        if (r) { writeBase(local, r.rev); break; }
        continue;   // другое устройство успело записать — заберём его версию и объединим
      }
      // На сервере новее: забираем; если и здесь есть изменения — объединяем. Пока человек печатает, не перерисовываем
      if (typing()) { syncAgain = true; break; }
      const row = await rowGet('data,rev'); if (!row) continue;
      const remote = cleanTree(row.data || {}, ''), merged = changed ? merge3(base || {}, local, remote) : remote;
      applyData(merged);
      if (same(packS(), remote)) { writeBase(remote, row.rev); break; }
      const r = await rowUpdate(packS(), row.rev);
      if (r) { writeBase(packS(), r.rev); break; }
    }
  } catch (e) {
    sync.err = e.status === 0 ? 'offline' : e.status === 401 || !signedIn() ? 'relogin' : e.message;
  } finally {
    syncBusy = false; saveSync(); syncUI();
    if (syncAgain) { syncAgain = false; syncSoon(4000); }
  }
}
function cloudStart() {
  // iPhone мог перезапустить приложение, пока человек ходил в почту за кодом, — сразу снова открываем ввод кода (15 минут)
  const pend = lsGet(LG_LS);
  if (!signedIn() && pend && EMAIL_RE.test(pend.email || '') && Date.now() - pend.sentAt < 15 * 60000) { lg = { step:'code', email: pend.email, sentAt: pend.sentAt, err:'' }; setTimeout(() => openLogin(), 400); }
  else lsSet(LG_LS, null);
  if (signedIn()) syncNow();
  document.addEventListener('visibilitychange', () => { if (!signedIn()) return; document.hidden ? syncSoon(0) : syncNow(); });
  addEventListener('online', () => { if (signedIn()) syncNow(); });
  setInterval(() => { if (signedIn() && !document.hidden) syncNow(); }, 60000);   // раз в минуту — проверить, не изменилось ли на другом устройстве
}

// ---- Вход, выход, удаление ----
async function afterLogin() {
  // Данные на устройстве принадлежат другому аккаунту — не смешиваем чужое
  if (sync.owner && sync.owner !== auth.uid) { safetyCopy(); lsSet(BASE_LS, null); sync = SYNC0(); applyData({ settings: lookOnly() }); }
  const row = await rowGet('data,rev');
  if (!row) { const local = packS(); const r = await rowInsert(local); writeBase(local, r.rev); toast('Вы вошли. Ваши записи теперь хранятся в аккаунте'); }
  else if (sync.owner === auth.uid && readBase()) { await syncNow(); toast('С возвращением! Записи обновлены'); }
  else if (hasLocalData()) { cloudPending = row; openMergeAsk(); return; }
  else { const remote = cleanTree(row.data || {}, ''); applyData(remote); writeBase(remote, row.rev); toast('Вы вошли — записи загружены из аккаунта'); }
  syncUI(); render();
}
let cloudPending = null;
function openMergeAsk() {
  sheet(`<div class="sh-head"><h3>Записи есть и там, и тут</h3></div>
  <p class="set-note" style="margin:0 0 14px">В аккаунте уже есть записи, и на этом устройстве тоже. Что сделать?</p>
  <button class="lg-choice" data-act="cmerge">${I(IC.copy, 20)}<span><b>Объединить</b><small>Оставить и те, и другие — совпадающие записи не задвоятся</small></span></button>
  <button class="lg-choice" data-act="creplace">${I(IC.down, 20)}<span><b>Взять только из аккаунта</b><small>Записи этого устройства уберутся, но копия останется — её можно вернуть в Настройках</small></span></button>`);
}
async function cloudResolve(merge) {
  const row = cloudPending; cloudPending = null; if (!row || !signedIn()) return closeSheet();
  closeSheet();
  try {
    const remote = cleanTree(row.data || {}, '');
    if (merge) { const m = merge3({}, packS(), remote); applyData(m); const r = await rowUpdate(packS(), row.rev); if (r) writeBase(packS(), r.rev); else { writeBase(remote, row.rev); syncNow(); } toast('Готово — записи объединены'); }
    else { safetyCopy(); applyData(remote); writeBase(remote, row.rev); toast('Записи загружены из аккаунта'); }
  } catch (e) { toast(cloudErrText(e)); }
  syncUI();
}
ACT.cmerge = () => cloudResolve(true);
ACT.creplace = () => cloudResolve(false);
// После выхода на устройстве остаются только оформление и «знакомство пройдено»
const lookOnly = () => { const s = S.settings, o = { onboarded: 1 }; ['theme', 'pal', 'contrast', 'card', 'round', 'evc', 'density', 'dev'].forEach(k => { if (s[k] !== undefined) o[k] = s[k]; }); return o; };
function wipeDevice() {
  lsSet(BASE_LS, null); lsSet(SYNC_LS, null); lsSet(LS, { settings: lookOnly() });
  location.reload();
}
async function cloudLogout(force) {
  if (!force) {
    await syncNow();
    const b = readBase();
    if (!b || !same(packS(), b)) return openLogoutAsk(true);
  }
  // Выход только на этом устройстве (без scope Supabase выходит со всех устройств сразу)
  try { await api('/auth/v1/logout?scope=local', { method:'POST', user:true }); } catch (e) {}
  auth = null; saveAuth(); wipeDevice();
}
function openLogoutAsk(unsaved) {
  sheet(`<div class="sh-head"><h3>Выйти из аккаунта?</h3><button class="ic" data-act="close" aria-label="Закрыть">${I(IC.x, 18)}</button></div>
  <p class="set-note" style="margin:0 0 14px">${unsaved ? '<b style="color:var(--dng)">Последние изменения ещё не сохранены в аккаунте — нет связи с сервером.</b> Если выйти сейчас, они пропадут. Лучше подождать, пока появится интернет.' : 'Записи останутся в аккаунте, а с этого устройства будут удалены. Чтобы вернуть их, просто войдите снова.'}</p>
  <div class="lo-foot"><button class="btn" data-act="close">Отмена</button><button class="btn ${unsaved ? 'dngf' : 'pri'} grow" data-act="${unsaved ? 'logoutforce' : 'logoutgo'}">${unsaved ? 'Всё равно выйти' : 'Выйти'}</button></div>`);
}
ACT.logout = () => openLogoutAsk(false);
ACT.logoutgo = () => { closeSheet(); toast('Выхожу…'); cloudLogout(false); };
ACT.logoutforce = () => { closeSheet(); cloudLogout(true); };
ACT.accdel = () => sheet(`<div class="sh-head"><h3>Удалить аккаунт?</h3><button class="ic" data-act="close" aria-label="Закрыть">${I(IC.x, 18)}</button></div>
  <p class="set-note" style="margin:0 0 10px">Аккаунт и все записи в нём удалятся с сервера навсегда, а с этого устройства — тоже. Отменить это нельзя. Если хотите сохранить записи, сначала нажмите «Скачать копию».</p>
  <label class="lg-l" for="del_ok">Чтобы подтвердить, напишите слово <b>удалить</b></label>
  <input id="del_ok" class="fin" type="text" autocomplete="off" autocapitalize="off">
  <div class="lo-foot"><button class="btn" data-act="close">Отмена</button><button class="btn dngf grow" data-act="accdelgo">Удалить навсегда</button></div>`);
ACT.accdelgo = async () => {
  const i = $('#del_ok'); if (!i || i.value.trim().toLowerCase() !== 'удалить') { if (i) i.focus(); return toast('Напишите слово «удалить»'); }
  try { await api('/rest/v1/rpc/delete_my_account', { method:'POST', user:true, body:{} }); auth = null; saveAuth(); closeSheet(); wipeDevice(); }
  catch (e) { toast(cloudErrText(e)); }
};
// Вернуть записи, которые были на устройстве до входа (копия при «Взять только из аккаунта» или при входе в другой аккаунт)
ACT.safeback = () => { const s = lsGet(SAFE_LS); if (!s || !s.data) return; snap(); applyData(merge3({}, packS(), cleanTree(s.data, ''))); lsSet(SAFE_LS, null); toast('Записи с устройства возвращены', true); if (signedIn()) syncSoon(0); };

// ---- Окно входа: почта → код из письма ----
let lg = null;   // { step:'email'|'code', email, sentAt, err }
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;
function cloudErrText(e) {
  const m = String(e && e.message || ''), c = e && e.code || '';
  if (!e || e.status === 0) return 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.';
  if (/signups? not allowed|otp_disabled|signup_disabled/i.test(m + c)) return 'Этой почты нет в списке бета-тестеров. Попросите приглашение у автора Parsimony.';
  if (e.status === 429 || /rate limit/i.test(m)) return 'Слишком много попыток. Подождите несколько минут и попробуйте снова.';
  if (/expired|invalid/i.test(m + c) && lg && lg.step === 'code') return 'Код неверный или устарел. Проверьте его или отправьте новый.';
  if (e.status === 401 || e.status === 403) return 'Вход закончился — войдите снова.';
  return 'Не получилось: ' + m;
}
function openLogin(keep) {
  if (!lg) lg = { step:'email', email:'', sentAt:0, err:'' };
  const wait = Math.max(0, 60 - Math.round((Date.now() - lg.sentAt) / 1000));
  sheet(`<div class="sh-head"><h3>Вход</h3><button class="ic" data-act="close" aria-label="Закрыть">${I(IC.x, 18)}</button></div>
  ${lg.step === 'email' ? `<p class="set-note" style="margin:0 0 12px">Введите почту — пришлём код. Пароль не нужен.</p>
    <label class="lg-l" for="lg_email">Почта</label>
    <input id="lg_email" class="fin lg-in" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" maxlength="200" value="${esc(lg.email)}" placeholder="name@mail.ru">
    <div id="lg_err" class="lg-err">${esc(lg.err)}</div>
    <button class="btn pri lg-go" data-act="lgsend">Получить код</button>`
  : `<p class="set-note" style="margin:0 0 12px">Отправили код на <b style="color:var(--tx)">${esc(lg.email)}</b>. Письмо приходит за минуту; если его нет — загляните в «Спам».</p>
    <label class="lg-l" for="lg_code">Код из письма</label>
    <input id="lg_code" class="fin lg-in lg-code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="123456">
    <div id="lg_err" class="lg-err">${esc(lg.err)}</div>
    <button class="btn pri lg-go" data-act="lgverify">Войти</button>
    <div class="lg-row"><button class="lnk" data-act="lgback">Другая почта</button><button class="lnk" data-act="lgresend" id="lg_resend"${wait ? ' disabled' : ''}>${wait ? `Новый код — через ${wait} с` : 'Отправить код ещё раз'}</button></div>`}
  <p class="set-note lg-beta">${I(IC.alert, 14)} Бета-версия: войти могут только приглашённые. Записи хранятся на сервере Supabase за пределами России.</p>`, keep);
  const i = $(lg.step === 'email' ? '#lg_email' : '#lg_code'); if (i) setTimeout(() => i.focus(), 60);
  clearInterval(openLogin.t);
  if (lg.step === 'code' && wait) openLogin.t = setInterval(() => { const b = $('#lg_resend'); if (!b) return clearInterval(openLogin.t); const w = Math.max(0, 60 - Math.round((Date.now() - lg.sentAt) / 1000)); b.disabled = !!w; b.textContent = w ? `Новый код — через ${w} с` : 'Отправить код ещё раз'; if (!w) clearInterval(openLogin.t); }, 1000);
}
const lgErr = t => { lg.err = t; const e = $('#lg_err'); if (e) e.textContent = t; };
const lgBusy = (on, txt) => { const b = $('.lg-go'); if (b) { b.disabled = on; if (txt) b.textContent = txt; } };
async function lgSend() {
  const i = $('#lg_email'), email = (i ? i.value : lg.email).trim().toLowerCase();
  if (!EMAIL_RE.test(email)) { if (i) i.focus(); return lgErr('Проверьте почту — похоже, в ней ошибка'); }
  lg.email = email; lgErr(''); lgBusy(true, 'Отправляю…');
  try { await api('/auth/v1/otp', { method:'POST', body:{ email, create_user:false } }); lg.step = 'code'; lg.sentAt = Date.now(); lsSet(LG_LS, { email, sentAt: lg.sentAt }); openLogin(true); }
  catch (e) { lgBusy(false, 'Получить код'); lgErr(cloudErrText(e)); }
}
async function lgVerify() {
  const i = $('#lg_code'), code = (i ? i.value : '').replace(/\D/g, '');
  if (code.length < 6) { if (i) i.focus(); return lgErr('Введите код из письма — 6 цифр'); }
  lgErr(''); lgBusy(true, 'Проверяю…');
  try { setSession(await api('/auth/v1/verify', { method:'POST', body:{ type:'email', email: lg.email, token: code } })); }
  catch (e) { lgBusy(false, 'Войти'); return lgErr(cloudErrText(e)); }
  lg = null; lsSet(LG_LS, null); closeSheet();
  try { await afterLogin(); } catch (e) { toast(cloudErrText(e)); syncUI(); }
}
ACT.login = () => { lg = null; openLogin(); };
ACT.lgsend = lgSend;
ACT.lgverify = lgVerify;
ACT.lgresend = () => { if (lg) { lg.step = 'email'; lgSend(); } };
ACT.lgback = () => { lsSet(LG_LS, null); if (lg) { lg.step = 'email'; lg.err = ''; openLogin(true); } };
ACT.syncnow = () => syncNow();
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || e.isComposing || !lg) return;
  if (e.target.id === 'lg_email') { e.preventDefault(); lgSend(); }
  else if (e.target.id === 'lg_code') { e.preventDefault(); lgVerify(); }
});
// Код вставили из письма целиком — входим сразу
document.addEventListener('input', e => { if (e.target.id === 'lg_code' && e.target.value.replace(/\D/g, '').length === 6 && lg && lg.step === 'code') lgVerify(); });

// ---- Блок «Аккаунт» в Настройках и в профиле ----
function syncText() {
  if (syncBusy) return 'Сохраняю…';
  if (sync.err === 'offline') return 'Нет связи — сохраню, когда появится интернет';
  if (sync.err === 'relogin') return 'Вход закончился — войдите снова';
  if (sync.err) return 'Не получилось сохранить: ' + sync.err;
  if (!sync.at) return 'Ещё не сохранялось';
  const m = Math.round((Date.now() - sync.at) / 60000);
  return 'Сохранено в аккаунте ' + (m < 1 ? 'только что' : m < 60 ? m + ' мин назад' : new Date(sync.at).toLocaleString('ru-RU', { day:'numeric', month:'long', hour:'2-digit', minute:'2-digit' }));
}
function syncUI(state) { $$('.acc-sync').forEach(el => { el.textContent = state === 'busy' ? 'Сохраняю…' : syncText(); el.classList.toggle('bad', !!sync.err && state !== 'busy'); }); }
function accountHTML() {
  const safe = lsGet(SAFE_LS) && lsGet(SAFE_LS).data ? `<button class="btn" style="width:100%;margin-top:8px" data-act="safeback">${I(IC.undo, 16)} Вернуть записи, которые были на устройстве до входа</button>` : '';
  if (!signedIn()) return `<div class="acc-box"><div class="acc-st">${I(IC.user, 20)}<span><b>${sync.err === 'relogin' ? 'Вход закончился' : 'Вы не вошли'}</b><small>${sync.err === 'relogin' ? 'Записи на этом устройстве сохранены — войдите снова, чтобы продолжить синхронизацию.' : 'Записи хранятся только на этом устройстве.'}</small></span></div>
    <button class="btn pri" style="width:100%" data-act="login">Войти по почте</button>${safe}
    <p class="set-note">С аккаунтом записи хранятся на сервере: они одинаковые на телефоне и компьютере и не пропадут вместе с устройством. Бета-версия — войти могут только приглашённые.</p></div>`;
  return `<div class="acc-box"><div class="acc-st on">${I(IC.check, 20)}<span><b>${esc(auth.email)}</b><small class="acc-sync${sync.err ? ' bad' : ''}">${esc(syncText())}</small></span></div>
    <div class="lo-foot" style="margin-top:0"><button class="btn grow" data-act="syncnow">${I(IC.rep, 16)} Синхронизировать</button><button class="btn grow" data-act="logout">Выйти</button></div>${safe}
    <button class="lnk acc-del" data-act="accdel">Удалить аккаунт</button></div>`;
}

// ---- Отзыв бета-тестера (8 октября 2026) ----
// Кнопка «Отзыв» внизу Главной и страниц, в Настройках → «О приложении», в боковой панели ПК и в меню команд.
// Отзыв уходит в таблицу feedback (supabase/sql/feedback.sql): отправить может только вошедший человек, читает — владелец в панели Supabase.
// Вместе с текстом — на каком экране был человек, размер экрана, версия приложения: так проще понять, где он запутался.
const FB_KINDS = [['unclear', 'Непонятно'], ['inconvenient', 'Неудобно'], ['bug', 'Ошибка'], ['idea', 'Идея']];
let fb = null;   // { kind, text, screen }
const VIEW_N = { month:'месяц', week:'неделя', day:'день', list:'список' }, TVIEW_N = { today:'сегодня', week:'неделя', all:'все', goals:'цели' };
function fbScreen() {
  const s = SEC[sec] ? SEC[sec].name : sec;
  let w = sec === 'cal' ? s + ' · ' + VIEW_N[view] : sec === 'tasks' ? s + ' · ' + TVIEW_N[tView] : s;
  const h = sheetOpen() && $('#sh h3'); if (h && !/^Отзыв$/.test(h.textContent)) w += ' · окно «' + h.textContent.trim().slice(0, 60) + '»';
  return w.slice(0, 200);
}
function openFeedback(keep) {
  if (!fb) fb = { kind:'', text:'', screen: fbScreen() };
  if (!signedIn()) return sheet(`<div class="sh-head"><h3>Отзыв</h3><button class="ic" data-act="close" aria-label="Закрыть">${I(IC.x, 18)}</button></div>
    <p class="set-note" style="margin:0 0 14px">Чтобы отправить отзыв, войдите в аккаунт — так понятно, от кого он и куда ответить.</p>
    <button class="btn pri lg-go" data-act="login">Войти по почте</button>`);
  sheet(`<div class="sh-head"><h3>Отзыв</h3><button class="ic" data-act="close" aria-label="Закрыть">${I(IC.x, 18)}</button></div>
  <p class="set-note" style="margin:0 0 12px">Что непонятно, неудобно или сломалось? Чего не хватает? Пишите как есть — каждый отзыв читает автор приложения.</p>
  <div class="chips fb-kinds" role="group" aria-label="О чём отзыв">${FB_KINDS.map(([k, n]) => `<button type="button" class="chip${fb.kind === k ? ' on' : ''}" data-act="fbkind" data-k="${k}" aria-pressed="${fb.kind === k}">${n}</button>`).join('')}</div>
  <textarea id="fb_text" class="fin fb-text" maxlength="4000" placeholder="Например: «не понял, где поменять порядок вкладок» или «хочу видеть траты по неделям»">${esc(fb.text)}</textarea>
  <p class="set-note fb-meta">${I(IC.alert, 13)} Вместе с отзывом отправится экран «${esc(fb.screen)}», размер экрана и версия приложения.</p>
  <button class="btn pri lg-go" data-act="fbsend">Отправить</button>`, keep);
  setTimeout(() => { const t = $('#fb_text'); if (t) t.focus(); }, 60);
}
async function fbSend() {
  const t = $('#fb_text'); if (t) fb.text = t.value;
  const body = fb.text.trim();
  if (!body) { if (t) t.focus(); return toast('Напишите пару слов'); }
  const b = $('[data-act="fbsend"]'); if (b) { b.disabled = true; b.textContent = 'Отправляю…'; }
  let ver = ''; try { ver = (await caches.keys()).find(k => /^rem-v\d+$/.test(k)) || ''; } catch (e) {}
  const meta = { ver, w: innerWidth, h: innerHeight, app: !!(matchMedia('(display-mode: standalone)').matches || navigator.standalone), theme: S.settings.theme, pal: S.settings.pal, ua: navigator.userAgent.slice(0, 200) };
  try {
    await api('/rest/v1/feedback', { method:'POST', user:true, body:{ kind: fb.kind || null, screen: fb.screen, body: body.slice(0, 4000), meta }, headers:{ Prefer:'return=minimal' } });
    fb = null; closeSheet(); toast('Спасибо! Отзыв отправлен');
  } catch (e) { if (b) { b.disabled = false; b.textContent = 'Отправить'; } toast(e.status === 0 ? 'Нет связи — отзыв сохранится в окне, попробуйте позже' : cloudErrText(e)); }
}
ACT.feedback = () => { fb = null; openFeedback(); };
ACT.fbkind = el => { const t = $('#fb_text'); if (t) fb.text = t.value; fb.kind = fb.kind === el.dataset.k ? '' : el.dataset.k; openFeedback(true); };
ACT.fbsend = fbSend;
document.addEventListener('input', e => { if (e.target.id === 'fb_text' && fb) fb.text = e.target.value; });
