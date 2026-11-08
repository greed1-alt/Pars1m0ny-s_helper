// ---- Друзья (21 октября 2026, просьба пользователя: «делаем друзей») ----
// Решения пользователя: друга добавляют по нику (он принимает заявку) или ссылкой-приглашением (кто прислал ссылку, уже согласен —
// друзья сразу); у каждого календаря свой выбор, что видят друзья: «Скрыт» / «Только занят» / «Всё» (по умолчанию «Только занят»);
// таблица недели — задачи и отметки привычек с понедельника, серия привычек.
// Сервер — supabase/sql/friends.sql: свою карточку (profiles) пишет сам человек, чужие видны только через функции и только друзьям.
// На сервер карточка уходит, только когда человек сам её создал (S.settings.fr). В «ленте» — выбранные календари на FR_DAYS дней
// вперёд (у «Только занят» — без названий) и числа недели. Задач без времени, заметок, мест, денег, самочувствия и фото там нет.
const FR_LS = 'remapp_fr', FR_DAYS = 60, FR_DAYN = 14, FR_NICK = /^[a-z0-9_.]{3,24}$/;
const FR_LVL = [['hide', 'Скрыт'], ['busy', 'Только занят'], ['all', 'Всё']];
// На устройстве (не синхронизируется): список друзей с их лентами, что уже отправлено, код приглашения, открытый друг
let fr = Object.assign({ list: [], at: 0, pub: '', nick: '', invite: '', nameOff: false, cur: '', code: '', seen: [], err: '' }, lsGet(FR_LS) || {});
const frSave = () => lsSet(FR_LS, fr);
NAME_ADMIN = !!fr.admin;   // админ — служебные ники можно (names.js); проверяет сервер
const frLvl = c => c && (c.fr === 'hide' || c.fr === 'all') ? c.fr : 'busy';
const frOn = () => signedIn() && !!S.settings.fr;
// Пометки о друге — только у вас (S.frNotes = { uid: { n, r, t } }): как подписать, кто это для вас, «не забыть».
// Свои, не как в примере пользователя (просьба: «сделай заметки не такими же»); «Пометки» — потому что «Заметки» в приложении уже есть (журнал)
const FR_REL = [['close', '💛', 'Близкий друг'], ['love', '💞', 'Любимый человек'], ['family', '🏡', 'Семья'], ['work', '💼', 'Работа'], ['study', '📚', 'Учёба'], ['hobby', '⚽', 'Спорт и хобби']];
const FR_REL_OLD = { best: 'close', pair: 'love', buddy: 'hobby' };   // первая проба (21 октября) — те же смыслы
const frNote = uid => (uid && S.frNotes && S.frNotes[uid]) || {};
onMigrate(() => {
  if (!S.frNotes || typeof S.frNotes !== 'object' || Array.isArray(S.frNotes)) S.frNotes = {};
  Object.keys(S.frNotes).forEach(k => { const x = S.frNotes[k]; if (!/^[0-9a-f-]{36}$/i.test(k) || !x || typeof x !== 'object') return delete S.frNotes[k];
    x.n = String(x.n || '').slice(0, NAME_MAX); x.t = String(x.t || '').slice(0, 500); if (FR_REL_OLD[x.r]) x.r = FR_REL_OLD[x.r];
    if (!FR_REL.some(r => r[0] === x.r)) delete x.r; if (!x.n) delete x.n; if (!x.t) delete x.t; if (!x.n && !x.r && !x.t) delete S.frNotes[k]; });
});
const FR_SHOW = [['about', 'Девиз и «Обо мне»'], ['bd', 'День рождения — без года'], ['city', 'Город и страна']];   // что из профиля видят друзья (S.settings.frShow)
onMigrate(() => { S.cats.forEach(c => { if (c.fr !== undefined && c.fr !== 'hide' && c.fr !== 'all' && c.fr !== 'busy') delete c.fr; }); });

// ---- Что видят друзья ----
const frMonday = k => addDays(k, -dowIdx(k));   // неделя игры — всегда с понедельника, у всех одинаково
function frWeekStats() {
  const t = todayK(), w = frMonday(t), inW = k => k >= w && k <= t;
  let tk = 0, hm = 0;
  S.events.forEach(e => { if (!e.task || e.demo) return; if (isRec(e)) tk += (e.doneDates || []).filter(inW).length; else if (e.done && inW(e.date)) tk++; });
  S.habits.forEach(h => { if (h.demo) return; Object.keys(h.log || {}).forEach(k => { if (h.log[k] && isDate(k) && inW(k)) hm++; }); });
  return { w, t: tk, h: hm, s: habitStreaks().cur };
}
function frFeed() {
  const t = todayK(), end = addDays(t, FR_DAYS), lv = {}, cs = [];
  S.cats.forEach(c => { const l = frLvl(c); if (l === 'hide') return; lv[c.id] = l; cs.push(l === 'all' ? { i: c.id, n: c.name, c: c.color, l } : { i: c.id, c: c.color, l }); });
  const ev = [];
  S.events.forEach(e => {
    const l = lv[e.cat]; if (!l || e.demo || e.src || (e.task && !e.time)) return;   // копии чужих событий и дела без времени — не показываем
    if (isRec(e) ? e.date > end || (e.repeat.until && e.repeat.until < t) : e.date < t || e.date > end) return;
    const o = { c: e.cat, d: e.date };
    if (l === 'all') o.t = String(e.title || '').slice(0, 200);
    if (e.time) { o.s = e.time; if (e.time2) o.e = e.time2; }
    if (isRec(e)) {
      o.r = { type: e.repeat.type }; if (e.repeat.until) o.r.until = e.repeat.until; if (e.repeat.days && e.repeat.days.length) o.r.days = e.repeat.days;
      const k = (e.skip || []).filter(x => x >= t && x <= end); if (k.length) o.k = k;
    }
    ev.push(o);
  });
  // Из профиля — только то, что человек сам открыл (по умолчанию ничего); за всё время и достижения — только числа и названия
  const s = profileStats(), got = achState(s).filter(a => a.ok), st = S.settings, sh = st.frShow || {}, me = {};
  if (sh.about) { if (st.motto) me.m = String(st.motto).slice(0, 90); if (st.about) me.ab = String(st.about).slice(0, 600); }
  if (sh.bd && isDate(st.birthday)) me.bd = st.birthday.slice(5);
  if (sh.city) { const c = [st.city, st.country].filter(Boolean).join(', '); if (c) me.city = c.slice(0, 80); }
  return { v: 1, at: t, cs, ev: ev.slice(0, 600), wk: frWeekStats(), me, tot: { t: s.tasksDone, h: s.marks, b: s.best, d: s.days, s: isDate(st.since) ? st.since : '' }, ach: got.map(a => a.n), a: got.length, an: ACH.length, hrs: frHrsList(), pub: frPubOut() };
}
// Имя и значок — из профиля; фото не уходит (оно хранится только на устройстве)
const frBody = () => { const st = S.settings, a = st.avatar || {}; const cv = st.cover || {};
  const b = { name: (st.name || '').trim().slice(0, 40), ava: { e: a.e || '', c: safeColor(a.c || '#6366f1'), cv: okImg(cv.img) ? '' : cv.p || '', fm: FRAMES[st.frame] ? st.frame : '' }, feed: frFeed() };
  if (st.frRank !== undefined) b.rank = !!st.frRank;   // общий список — только если человек сам его включал или выключал (до нового SQL столбца rank нет)
  return b; };

// ---- Сервер ----
const frNickErr = e => /nick_bad/.test(e && e.message || '') ? 'bad' : e && e.code === '23505' && /nick/.test(e.message || '') ? 'taken' : '';   // занят именно ник, а не строка
const FR_NICK_MSG = { bad: 'Такой ник недоступен', taken: 'Этот ник уже занят — придумайте другой' };
const frNoSql = e => e && (e.status === 404 || e.code === 'PGRST202' || e.code === '42P01' || e.code === 'PGRST205' || e.code === 'PGRST204');   // 204 — нет столбца (SQL ещё старый)
// Записать свою карточку. nick передаётся только когда человек сам его меняет: иначе другое устройство вернуло бы старый ник
async function frWrite(b) {
  const sel = 'select=nick,name,invite';
  let j = await api(`/rest/v1/profiles?user_id=eq.${auth.uid}&${sel}`, { method: 'PATCH', user: true, body: b, headers: { Prefer: 'return=representation' } });
  if (!j || !j.length) j = await api('/rest/v1/profiles?' + sel, { method: 'POST', user: true, body: Object.assign({ user_id: auth.uid }, b), headers: { Prefer: 'return=representation' } });
  const r = j && j[0] || {};
  fr.nick = FR_NICK.test(r.nick || '') ? r.nick : ''; fr.invite = /^[0-9a-f]{32}$/.test(r.invite || '') ? r.invite : fr.invite;
  fr.nameOff = !!b.name && !r.name; fr.err = '';
  return r;
}
let frTimer = 0, frChain = Promise.resolve();
function frSoon(ms) { if (!frOn()) return; clearTimeout(frTimer); frTimer = setTimeout(() => frPublish(), ms == null ? 4000 : ms); }
SAVE_HOOKS.push(() => frSoon());
// Отправить карточку, если она изменилась (или nick — новый ник). Ответ: '' — готово, 'bad' / 'taken' — ник не подошёл, иначе текст ошибки.
// Строго по очереди: иначе две отправки разом (таймер и смена ника) обе создавали бы карточку
function frPublish(nick) { const p = frChain.then(() => frPublishNow(nick)); frChain = p.catch(() => {}); return p; }
async function frPublishNow(nick) {
  if (!frOn()) return '';
  const body = frBody(), key = canon(body);
  if (nick === undefined && key === fr.pub) return '';
  const b = nick === undefined ? body : Object.assign({ nick: nick || null }, body);
  let res = '';
  try { await frWrite(b); fr.pub = key; }
  catch (e) {
    res = frNickErr(e);
    if (res) { try { await frWrite(body); fr.pub = key; } catch (x) {} }   // ник не подошёл — остальное всё равно обновим
    else { res = frNoSql(e) ? 'nosql' : cloudErrText(e); fr.err = res; if (e.status === 0) frSoon(60000); }
  } finally { frSave(); }
  return res;
}
// Числа, которые посчитал сервер из записей друга (friends.sql: fr_calc) — честные; нет — берём присланные приложением (неделя ≤ 500)
const frSt = s => {
  if (!s || typeof s !== 'object' || !isDate(s.w) || !isDate(s.at)) return null;
  const n = (v, max) => Math.max(0, Math.min(max, Math.round(Number(v) || 0)));
  return { w: s.w, at: s.at, t: n(s.t, 99999), h: n(s.h, 99999), s: n(s.s, 99999), b: n(s.b, 99999), tt: n(s.tt, 9999999), th: n(s.th, 9999999) };
};
const frTot = f => f.st ? { t: f.st.tt, h: f.st.th, b: f.st.b } : f.feed ? f.feed.tot : { t: 0, h: 0, b: 0 };
// Значок — только из набора профиля (AVA_EMOJI): другого приложение не позволяет выбрать
const frAvaOk = a => ({ e: a && AVA_EMOJI.includes(a.e) ? a.e : '', c: safeColor(a && a.c), cv: a && typeof a.cv === 'string' && Object.hasOwn(COVERS, a.cv) ? a.cv : '',
  fm: a && typeof a.fm === 'string' && Object.hasOwn(FRAMES, a.fm) ? a.fm : '' });   // обложка и рамка (shop.js) — только из набора
const frRow = r => r && /^[0-9a-f-]{36}$/i.test(r.uid || '') && ['ok', 'in', 'out'].includes(r.state) ? {
  uid: r.uid, nick: FR_NICK.test(r.nick || '') ? r.nick : '', name: String(r.name || '').slice(0, 40),
  ava: frAvaOk(r.ava),
  state: r.state, feed: r.state === 'ok' ? frClean(r.feed) : null, at: Date.parse(r.updated_at || '') || 0, since: Date.parse(r.since || '') || 0, st: r.state === 'ok' ? frSt(r.st) : null } : null;
// Лента друга пришла извне — всё проверяем, как присланное по ссылке (fromShared в share.js)
function frClean(f) {
  if (!f || typeof f !== 'object' || f.v !== 1) return null;
  const num = (v, max) => Math.max(0, Math.min(max || 9999, Math.round(Number(v) || 0))), str = (v, n) => typeof v === 'string' ? v.slice(0, n) : '';
  const cs = (Array.isArray(f.cs) ? f.cs : []).slice(0, 60).filter(c => c && typeof c === 'object')
    .map(c => ({ i: String(c.i || '').slice(0, 80), n: c.l === 'all' ? String(c.n || '').slice(0, 60) : '', c: safeColor(c.c), l: c.l === 'all' ? 'all' : 'busy' })).filter(c => c.i);
  const ids = new Map(cs.map(c => [c.i, c]));
  const ev = (Array.isArray(f.ev) ? f.ev : []).slice(0, 800).map(o => {
    const c = o && typeof o === 'object' && ids.get(String(o.c)); if (!c || !isDate(o.d)) return null;
    const e = fromShared({ t: o.t, d: o.d, s: o.s, e: o.e, r: o.r && typeof o.r === 'object' ? o.r : undefined, k: o.k });
    return { title: c.l === 'all' ? e.title : '', date: e.date, time: e.time, time2: e.time2, repeat: e.repeat, skip: e.skip, cat: c.i };
  }).filter(Boolean);
  const obj = v => v && typeof v === 'object' && !Array.isArray(v) ? v : {}, wk = obj(f.wk), me = obj(f.me), tot = obj(f.tot);
  return { at: isDate(f.at) ? f.at : '', cs, ev, wk: { w: isDate(wk.w) ? wk.w : '', t: num(wk.t, 500), h: num(wk.h, 500), s: num(wk.s, 3650) },   // числа присылает сам человек — за неделю больше 500 не бывает
    me: { m: str(me.m, 90), ab: str(me.ab, 600), bd: /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(me.bd || '') ? me.bd : '', city: str(me.city, 80) },
    // s — с какого дня в приложении; в карточках до 21 октября его нет — считаем по числу дней от даты ленты
    tot: { t: num(tot.t, 999999), h: num(tot.h, 999999), b: num(tot.b), d: num(tot.d, 99999), s: isDate(tot.s) ? tot.s : isDate(f.at) && num(tot.d, 99999) ? addDays(f.at, 1 - num(tot.d, 99999)) : '' },
    ach: (Array.isArray(f.ach) ? f.ach : []).filter(n => typeof n === 'string' && ACH.some(a => a[1] === n)).slice(0, ACH.length), a: num(f.a), an: num(f.an),
    hrs: frHrsClean(f.hrs) };   // «Когда я занят для друзей» (6 ноября 2026); у карточек со старых версий их нет — пусто
}
async function frLoad(quiet) {
  if (!signedIn()) return;
  try {
    const j = await api('/rest/v1/rpc/friends_list', { method: 'POST', user: true, body: {} });
    fr.list = (Array.isArray(j) ? j : []).map(frRow).filter(Boolean); fr.at = Date.now(); if (fr.err === 'nosql') fr.err = '';
    frSave(); frNotify(); msgSync(); frChLoad();   // js/chat.js: кнопка «Сообщения», переписки; вызовы на неделю
    if (sec === 'profile' || sec === 'friend') render();
  } catch (e) {
    if (frNoSql(e)) { fr.err = 'nosql'; frSave(); } else if (!quiet) toast(cloudErrText(e));
  }
}
const frRpc = (fn, body) => api('/rest/v1/rpc/' + fn, { method: 'POST', user: true, body });
// Своя карточка: ник и код приглашения (на этом устройстве их могло ещё не быть)
async function frMine() {
  const j = await api(`/rest/v1/profiles?user_id=eq.${auth.uid}&select=nick,invite`, { user: true });
  const r = j && j[0]; if (!r) return null;
  fr.nick = FR_NICK.test(r.nick || '') ? r.nick : ''; fr.invite = /^[0-9a-f]{32}$/.test(r.invite || '') ? r.invite : ''; frSave();
  return r;
}
// Админ ли я (таблица admins: каждый видит только свою строку)
async function frAdmin() {
  try { const j = await api(`/rest/v1/admins?select=user_id&user_id=eq.${auth.uid}`, { user: true }); fr.admin = Array.isArray(j) && j.length > 0; }
  catch (e) { if (!frNoSql(e)) return; fr.admin = false; }
  NAME_ADMIN = !!fr.admin; frSave();
}
// Запуск и вход: админ ли, список друзей, своя карточка, отложенное приглашение, тариф и монеты (раньше только при запуске: после входа магазина не было до перезапуска)
function frStart() {
  if (!signedIn()) return;
  setTimeout(() => { frAdmin(); frLoad(true); frSoon(1500); if (fr.code) frInviteGo(); }, 2000);
  setTimeout(planLoad, 3000); setTimeout(coinsLoad, 3500);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && signedIn() && Date.now() - fr.at > 3 * 60000) frLoad(true); });
// Новая заявка — тост один раз и точка на аватаре в шапке, пока не ответили
const frIncoming = () => fr.list.filter(f => f.state === 'in');
function frNotify() {
  const inc = frIncoming(), fresh = inc.filter(f => !fr.seen.includes(f.uid));
  fr.seen = inc.map(f => f.uid); frSave();
  if (fresh.length) toast(fresh.length === 1 ? `${frName(fresh[0])} зовёт вас в друзья — ответить можно в профиле` : `Вас зовут в друзья: ${fresh.length} — ответить можно в профиле`);
  const h = $('.hdr-ava'); if (h) h.innerHTML = hdrAvaHTML();
}
const frDot = () => frIncoming().length ? '<i class="fr-dot" aria-hidden="true"></i>' : '';

// ---- Вид ----
const frReal = f => (f.name || '').trim() || (f.nick ? '@' + f.nick : 'Без имени');
const frName = f => (frNote(f.uid).n || '').trim() || frReal(f);   // своё имя для друга (заметки) — вместо его имени
function frAva(f, size) {
  const a = f.ava || {}, n = initials(f.name), fm = frameAttr(a.fm);
  return `<span class="ava${a.e ? ' em' : ''}${fm.c}" style="--c:${safeColor(a.c)};--s:${size}px${fm.s}" aria-hidden="true">${a.e ? esc(a.e) : n ? esc(n) : I(IC.user, Math.round(size * .55))}</span>`;
}
const frMe = () => ({ me: true, name: S.settings.name || 'Вы', ava: { e: (S.settings.avatar || {}).e, c: (S.settings.avatar || {}).c, fm: S.settings.frame }, wk: frWeekStats() });
// Числа друга за эту неделю: лента не обновлялась с прошлой недели — нули; серия — если заходил вчера или сегодня
function frWk(f) {
  const t = todayK(), w = f.st || f.feed && f.feed.wk || {}, at = f.st ? f.st.at : f.feed && f.feed.at, cur = w.w === frMonday(t), live = at >= addDays(t, -1);
  return { t: cur ? w.t : 0, h: cur ? w.h : 0, s: live ? w.s : 0 };
}
const frScore = w => w.t + w.h;
function frBoard(ok) { return [frMe(), ...ok.map(f => Object.assign({ wk: frWk(f) }, f))].sort((a, b) => frScore(b.wk) - frScore(a.wk) || b.wk.s - a.wk.s || (a.me ? -1 : b.me ? 1 : 0)); }
// ---- Лидеры (просьбы пользователя: «добавь список лидеров…»; «не так, сделай лучше списком, так же сделай общий список пользователей в отдельной вкладочке») ----
// Две вкладки: «Друзья» и «Все» — общий список тех, кто сам включил «Участвовать» (S.settings.frRank → profiles.rank; видно только ник, имя,
// значок и очки). Показатели: неделя (очки = задачи + отметки привычек), задачи, привычки, серия, за всё время. Список: у первых трёх — медали
const FR_PTS = ['очко', 'очка', 'очков'], FR_TSK = ['задача', 'задачи', 'задач'], FR_MRK = ['отметка', 'отметки', 'отметок'];
const FR_BOARDS = [
  ['week', 'Неделя', r => frScore(r.wk), FR_PTS, 'Очки с понедельника: выполненные задачи и отметки привычек'],
  ['tasks', 'Задачи', r => r.wk.t, FR_TSK, 'Выполненные задачи с понедельника'],
  ['habits', 'Привычки', r => r.wk.h, FR_MRK, 'Отметки привычек с понедельника'],
  ['streak', 'Серия', r => r.wk.s, NDAY, 'Дни подряд, когда выполнены все ежедневные привычки'],
  ['all', 'За всё время', r => r.tot.t + r.tot.h, FR_PTS, 'Все выполненные задачи и отметки привычек'],
];
let frLb = 'week', frScope = 'friends', frAll = null, frAllErr = '';   // frAll — общий список с сервера { at, rows }, только в памяти
const frMeRow = () => { const s = profileStats(); return Object.assign(frMe(), { tot: { t: s.tasksDone, h: s.marks } }); };
// Строка общего списка — пришла извне: проверяем, как ленту друга
const frAllRow = r => {
  if (!r || typeof r !== 'object') return null;
  const fd = frClean({ v: 1, at: r.at, cs: [], ev: [], wk: r.wk, tot: r.tot }), st = frSt(r.st);
  return { me: r.me === true, uid: /^[0-9a-f-]{36}$/i.test(r.uid || '') ? r.uid : '', nick: FR_NICK.test(r.nick || '') ? r.nick : '', name: String(r.name || '').slice(0, 40),
    ava: frAvaOk(r.ava), rel: ['me', 'ok', 'in', 'out'].includes(r.rel) ? r.rel : '', wk: frWk({ st, feed: fd }), tot: st ? { t: st.tt, h: st.th } : fd.tot };
};
async function frLoadAll(force) {
  if (!signedIn() || (!force && frAll && Date.now() - frAll.at < 120000)) return;
  try { const j = await frRpc('leaders_all', {}); frAll = { at: Date.now(), rows: (Array.isArray(j) ? j : []).map(frAllRow).filter(Boolean) }; frAllErr = ''; }
  catch (e) { frAllErr = frNoSql(e) ? 'nosql' : cloudErrText(e); if (!frAll) frAll = { at: 0, rows: [] }; }
  if (sec === 'leaders') render();
}
function frRank(key, scope) {
  const b = FR_BOARDS.find(x => x[0] === key) || FR_BOARDS[0], me = frMeRow();
  const all = scope === 'all' ? (frAll ? frAll.rows : []).map(r => r.me ? Object.assign(me, { nick: r.nick }) : r)   // себя — по свежим числам с устройства
    : [me, ...fr.list.filter(f => f.state === 'ok').map(f => Object.assign({ wk: frWk(f), tot: frTot(f) }, f))];
  return all.map(p => Object.assign({ v: b[2](p) }, p)).sort((a, c) => c.v - a.v || (a.me ? -1 : c.me ? 1 : 0));
}
const frWho = r => r.me ? (S.settings.name || '').trim() || 'Вы' : frName(r);
const FR_MEDALS = ['🥇', '🥈', '🥉'];
// Список: место (у первых трёх с очками — медаль), аватар, имя и @ник, полоска от лидера, значение. Друг — открыть страницу; чужой — позвать в друзья
function frRowsHTML(rows, unit, scope, max) {
  return `<ol class="frl-list">${rows.map((r, n) => {
    const medal = r.v > 0 && n < 3, place = medal ? `<span class="frl-n m" role="img" aria-label="${n + 1}-е место">${FR_MEDALS[n]}</span>` : `<span class="frl-n">${n + 1}</span>`;
    const body = `${place}${frAva(r, 38)}<span class="frl-who"><span class="frl-nm"><b>${esc(frWho(r))}</b>${r.me ? '<em>вы</em>' : r.nick ? `<small>@${esc(r.nick)}</small>` : ''}</span><span class="frl-bar" aria-hidden="true"><i style="width:${Math.round(r.v / max * 100)}%"></i></span></span><span class="frl-v">${plural(r.v, unit)}</span>`;
    const act = r.me ? '' : r.uid && (scope === 'friends' || r.rel === 'ok') ? `data-act="fropen" data-u="${r.uid}"` : r.nick ? `data-act="frpeek" data-n="${r.nick}"` : '';
    return `<li class="${r.me ? 'me' : ''}${medal ? ' top' : ''}">${act ? `<button class="frl-row" ${act}>${body}</button>` : `<div class="frl-row">${body}</div>`}</li>`;
  }).join('')}</ol>`;
}
function frLeadersHTML() {
  const b = FR_BOARDS.find(x => x[0] === frLb) || FR_BOARDS[0], all = frScope === 'all', rows = all && !frAll ? [] : frRank(b[0], frScope);
  const mi = rows.findIndex(r => r.me), max = Math.max(1, ...rows.map(r => r.v)), left = 6 - dowIdx(todayK());
  const back = `<button class="ic pe-back" data-act="sec" data-s="profile" aria-label="Назад к профилю" title="Назад к профилю">${I(IC.left, 20)}</button>`;
  const goal = mi < 0 || rows.length < 2 ? '' : mi === 0 ? (rows[0].v ? 'Вы на первом месте — так держать!' : 'Пока у всех поровну — сделайте первый шаг') : `До ${mi}-го места — ${plural(rows[mi - 1].v - rows[mi].v + 1, b[3])}`;
  const sub = all ? (frAll ? plural(rows.length, ['участник', 'участника', 'участников']) : 'Загружаю…') : 'Вы и ' + plural(rows.length - 1, ['друг', 'друга', 'друзей']);
  const join = all && frAll && !S.settings.frRank && !frAllErr ? `<div class="frl-join"><span><b>Вас нет в общем списке</b><small>Если участвовать, все пользователи ${APP_NAME} увидят ваши ник, имя, значок и очки — больше ничего.</small></span><button class="btn pri" data-act="frjoinall">Участвовать</button></div>` : '';
  const empty = all ? (frAll ? `<div class="frl-empty"><span aria-hidden="true">🌍</span><b>Пока никто не участвует</b><p>Станьте первым — нажмите «Участвовать».</p></div>` : '<p class="hm-empty">Загружаю…</p>')
    : `<div class="frl-empty"><span aria-hidden="true">🏆</span><b>Соревноваться пока не с кем</b><p>Позовите друзей — и здесь появится список.</p><div class="fr-acts"><button class="btn pri" data-act="fradd">${I(IC.plus, 15)} Добавить по нику</button><button class="btn" data-act="invite">${I(IC.share, 15)} Пригласить по ссылке</button></div></div>`;
  return `<div class="pe-head">${back}<div><h2>Лидеры</h2><small>${sub}</small></div></div>
  <div class="seg2 frl-scope" role="group" aria-label="Чей список"><button class="${all ? '' : 'on'}" aria-pressed="${!all}" data-act="frscope" data-k="friends">${I(IC.users, 15)} Друзья</button><button class="${all ? 'on' : ''}" aria-pressed="${all}" data-act="frscope" data-k="all">${I(IC.globe, 15)} Все</button></div>
  <div class="frl-tabs" role="group" aria-label="Что сравнивать">${FR_BOARDS.map(([k, n]) => `<button class="${k === b[0] ? 'on' : ''}" aria-pressed="${k === b[0]}" data-act="frlb" data-k="${k}">${n}</button>`).join('')}</div>
  <div class="card frl-card">
    <p class="frl-what">${b[4]}${b[0] === 'all' ? '' : ' · ' + (left ? 'до конца недели ' + plural(left, NDAY) : 'последний день недели')}</p>
    ${join}${all && frAllErr ? `<p class="set-note">${frAllErr === 'nosql' ? 'Общий список ещё не включён на сервере.' : esc(frAllErr)}</p>` : ''}
    ${goal ? `<p class="frl-goal">${goal}</p>` : ''}
    ${rows.length < (all ? 1 : 2) ? empty : frRowsHTML(rows, b[3], frScope, max)}
    ${all && S.settings.frRank ? '<button class="frl-leave" data-act="frleaveall">Не показывать меня в общем списке</button>' : ''}
  </div>`;
}
SEC.leaders = { name: 'Лидеры', icon: IC.trophy, noNav: true, title: () => 'Лидеры', html: frLeadersHTML, move: () => {} };
ACT.frleaders = () => { setSec('leaders'); frLoad(true); if (frScope === 'all') frLoadAll(true); };
ACT.frlb = el => { frLb = el.dataset.k; render(); };
ACT.frscope = el => { frScope = el.dataset.k; render(); if (frScope === 'all') frLoadAll(); };
// Чужой человек из общего списка — то же окно, что после поиска по нику: «Позвать в друзья» / «Заявка уже отправлена» / «Принять»
ACT.frpeek = el => openPerson(el.dataset.n);   // чужой в общем списке — его страница по нику (8 ноября 2026; раньше — окно «Добавить по нику»)
ACT.frjoinall = async () => {
  if (!S.settings.fr) return openFrSet();
  S.settings.frRank = 1; save(); const res = await frPublish();
  if (res) { S.settings.frRank = 0; save(); return toast(res === 'nosql' || /rank/.test(res) ? 'Общий список ещё не включён на сервере' : res); }
  toast('Теперь вы в общем списке'); frLoadAll(true);
};
ACT.frleaveall = async () => { S.settings.frRank = 0; save(); await frPublish(); toast('Вас больше нет в общем списке'); frLoadAll(true); };

const frWhoHTML = f => `${frAva(f, 36)}<span class="fr-who-t"><b>${esc(frName(f))}</b>${f.nick ? `<small>@${esc(f.nick)}</small>` : ''}</span>`;
function frCardHTML() {
  const head = r => `<div class="card-h"><b>${I(IC.users, 17)} Друзья</b>${r || ''}</div>`, ghost = `<div class="fr-ghost" aria-hidden="true">${[0, 1, 2, 3, 4].map(i => `<span style="--i:${i}"></span>`).join('')}</div>`;
  if (!signedIn()) return `<div class="card pf-friends">${head()}<div class="fr-emptyb">${ghost}<b>Вместе — интереснее</b><p>Добавляйте друзей, смотрите их календари и соревнуйтесь за неделю. Для этого нужно войти в аккаунт.</p></div>
    <div class="fr-acts"><button class="btn pri" data-act="login">Войти</button><button class="btn" data-act="invite">${I(IC.share, 15)} Пригласить в ${APP_NAME}</button></div></div>`;
  if (!S.settings.fr) return `<div class="card pf-friends">${head()}<div class="fr-emptyb">${ghost}<b>Вместе — интереснее</b><p>Создайте карточку — по ней друзья найдут вас по нику или по ссылке. Что видят друзья, решаете вы: у каждого календаря — «Скрыт», «Только занят» или «Всё».</p></div>
    <div class="fr-acts"><button class="btn pri" data-act="frset">${I(IC.plus, 15)} Создать карточку</button></div></div>`;
  const L = fr.list, inc = L.filter(f => f.state === 'in'), out = L.filter(f => f.state === 'out'), ok = L.filter(f => f.state === 'ok');
  const note = fr.err === 'nosql' ? 'Друзья ещё не включены на сервере — скоро заработают.' : fr.err ? fr.err : fr.nameOff ? 'Друзья не видят ваше имя: оно недоступно. Поменяйте его в профиле.' : !fr.nick ? 'У вас нет ника — найти вас можно только по ссылке-приглашению.' : '';
  const rows = frRank('week', 'friends'), top = rows.slice(0, 5), shown = new Set(top.map(r => r.uid)), rest = ok.filter(f => !shown.has(f.uid));
  return `<div class="card pf-friends">${head(`<span class="card-h-r">${fr.nick ? `<small>@${esc(fr.nick)}</small>` : ''}<button class="pill sm" data-act="frset">${I(IC.gear, 13)} Настройки</button></span>`)}
    ${note ? `<p class="set-note fr-note">${esc(note)}</p>` : ''}
    ${inc.length ? `<div class="fr-inbox"><div class="fr-sec">Вас зовут в друзья</div>${inc.map(f => `<div class="fr-row">${frWhoHTML(f)}<span class="fr-btns"><button class="btn pri sm" data-act="fracc" data-u="${f.uid}">Принять</button><button class="btn sm" data-act="frrm" data-u="${f.uid}">Отклонить</button></span></div>`).join('')}</div>` : ''}
    ${ok.length ? `<div class="fr-sec">Лидеры недели ${hint('Очки с понедельника: выполненные задачи и отметки привычек. Друзья видят только эти числа — не сами задачи и привычки.', 'Как считаются очки')}</div>
      ${frRowsHTML(top, FR_PTS, 'friends', Math.max(1, ...rows.map(r => r.v)))}
      <button class="btn frl-all" data-act="frleaders">${I(IC.trophy, 15)} Все лидеры</button>
      ${rest.length ? `<div class="fr-sec">Ещё друзья</div><div class="fr-strip">${rest.map(f => `<button class="fr-chip" data-act="fropen" data-u="${f.uid}">${frAva(f, 48)}<span>${esc(frName(f))}</span></button>`).join('')}</div>` : ''}`
      : `<div class="fr-emptyb">${ghost}<b>Пока здесь только вы</b><p>Добавьте друга по нику или отправьте ему ссылку-приглашение — и начнётся соревнование.</p></div>
      <button class="btn frl-all" data-act="frleaders">${I(IC.globe, 15)} Общий список лидеров</button>`}
    ${out.length ? `<div class="fr-sec">Ждут ответа</div>${out.map(f => `<div class="fr-row">${frWhoHTML(f)}<span class="fr-btns"><button class="btn sm" data-act="frrm" data-u="${f.uid}">Отозвать</button></span></div>`).join('')}` : ''}
    <div class="fr-acts"><button class="btn" data-act="fradd">${I(IC.plus, 15)} Добавить по нику</button><button class="btn" data-act="invite">${I(IC.share, 15)} Пригласить по ссылке</button></div></div>`;
}

// ---- Страница друга ----
// Вариант Б «Короткая лента» (выбор пользователя 6 ноября 2026; было ~4 экрана на телефоне, стало ~2): шапка с кнопками в одну строку;
// «Вы и Имя · неделя» — сравнение; «Ближайшее» — сегодня и завтра и первое общее свободное окно, весь календарь — окном (ACT.frcal);
// «О друге» — девиз, «Обо мне», день рождения, город и ваше «Не забыть»; «Достижения и итоги». ПК — две колонки.
const FR_NEAR = 4, FR_NWIN = ['окно', 'окна', 'окон'];
const frFirst = f => { const n = frName(f); return n.startsWith('@') ? n : n.split(/\s+/)[0] || n; };   // «Вы и Саша»: без склонений — именительный
// События друга в день k по времени (с календарём, чтобы взять цвет) и его часы «Занят для друзей» (h: 1 — это они, а не событие)
function frEvs(f, k) {
  const cs = new Map(f.feed.cs.map(c => [c.i, c])), d = dowIdx(k);
  const hrs = f.feed.hrs.filter(r => r.d.includes(d)).map(r => ({ e: { title: '', time: r.a, time2: r.b }, c: { c: FR_HRS_C }, h: 1 }));
  return [...hrs, ...f.feed.ev.filter(e => occurs(e, k)).map(e => ({ e, c: cs.get(e.cat) || {} }))].sort((a, b) => (a.e.time || '').localeCompare(b.e.time || ''));
}
const frWhen = e => e.time ? e.time + (e.time2 ? '–' + e.time2 : '') : 'Весь день';
const frEvLi = ({ e, c }, sub) => `<li class="frb-ev${e.title ? '' : ' busy'}"><span class="frb-tm">${frWhen(e)}</span><i style="--c:${c.c}"></i><span class="frb-et"><b>${e.title ? esc(e.title) : 'Занят'}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span></li>`;
const frDayH = (k, i) => i < 2 ? relDay(k)[0].toUpperCase() + relDay(k).slice(1) : dowName(k) + ', ' + pd(k).getDate() + ' ' + MONG[pd(k).getMonth()];
// Цвет части друга в полоске — цвет его значка; похож на цвет приложения (обе части слились бы) — серый
const frHexRGB = h => { const m = /^#?([0-9a-f]{6})$/i.exec(String(h || "").trim()); return m ? [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)) : null; };
function frBarC(f) {
  const c = safeColor(f.ava.c), a = frHexRGB(getComputedStyle(document.documentElement).getPropertyValue("--acc")), b = frHexRGB(c);
  return a && b && Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 90 ? "var(--mut)" : c;
}
// Сравнение недели: вы и друг (очки = задачи + отметки привычек, как в таблице лидеров)
function frVsHTML(f) {
  const me = frWeekStats(), w = frWk(f), nm = frFirst(f), board = frBoard(fr.list.filter(x => x.state === 'ok')), place = board.findIndex(r => r.uid === f.uid) + 1;
  const ch = frChOf(f.uid).cur, on = ch && ch.state === 'on' ? ch.kind : '';   // идёт вызов — его строка с флажком 🏁 (числа те же, не повторяем)
  const row = (label, a, b, fmt, k) => { const s = a + b, p = s ? Math.round(a / s * 100) : 50;
    return `<div class="frv-r${k && on === k ? ' ch' : ''}"><span class="frv-l">${k && on === k ? '🏁 ' : ''}${label}</span><b class="frv-a">${fmt ? fmt(a) : a}</b><span class="frv-bar" role="img" aria-label="${label}: вы — ${a}, ${esc(nm)} — ${b}"><i style="width:${p}%"></i></span><b class="frv-b">${fmt ? fmt(b) : b}</b></div>`; };
  const d = frScore(me) - frScore(w), lead = d > 0 ? 'Вы впереди на ' + plural(d, FR_PTS) : d < 0 ? esc(nm) + ' впереди на ' + plural(-d, FR_PTS) : 'Пока поровну';
  return `<div class="card frv" style="--fc:${frBarC(f)}"><div class="card-h"><b>Вы и ${esc(nm)} · неделя ${hint('С понедельника: выполненные задачи и отметки привычек. Очки — их сумма, как в таблице лидеров. Серия — дни подряд, когда выполнены все ежедневные привычки. Место — в таблице недели среди ваших друзей.', 'Как считается неделя')}</b></div>
    <div class="frv-r frv-h" aria-hidden="true"><span></span><b>Вы</b><b>${esc(nm)}</b></div>
    ${row('Задачи', me.t, w.t, null, 't')}${row('Привычки', me.h, w.h, null, 'h')}${row('Серия', me.s, w.s, v => v ? v + ' дн.' : '—')}
    <p class="frv-sum${on === 'p' ? ' ch' : ''}"><b>${on === 'p' ? '🏁 ' : ''}${lead}</b><span>${esc(nm)}: ${place}-е место из ${board.length}</span></p>${frChHTML(f)}${frCheerHTML(f)}</div>`;
}
// ---- Подбодрить и дни рождения (7 ноября 2026, «новые действия с другом») ----
// «Подбодрить» — короткое сообщение в переписку (уходит пушем, как обычное сообщение); каждому другу — раз в день (отметка — в кэше на устройстве, fr.cheer)
const FR_CHEER = [['💪', 'Так держать!', 'Keep it up!'], ['🔥', 'Ты в ударе!', "You're on fire!"], ['👏', 'Молодец!', 'Well done!'], ['❤️', 'Я в тебя верю!', 'I believe in you!']];
function frCheerHTML(f) {
  if (msgErr === 'nosql') return '';
  const c = fr.cheer && fr.cheer[f.uid];
  if (c && c.d === todayK()) return `<p class="frc frc-done">${esc(c.e)} Сегодня уже подбодрили — завтра можно снова</p>`;
  return `<div class="frc"><span class="frc-l">Подбодрить</span><span class="frc-b">${FR_CHEER.map(([e, ru], i) => `<button class="frc-e" data-act="frcheer" data-u="${f.uid}" data-i="${i}" aria-label="Подбодрить: ${ru}" title="${ru}">${e}</button>`).join('')}</span></div>`;
}
ACT.frcheer = async el => {
  const f = fr.list.find(x => x.uid === el.dataset.u && x.state === 'ok'), ch = FR_CHEER[+el.dataset.i]; if (!f || !ch) return;
  if (fr.cheer && fr.cheer[f.uid] && fr.cheer[f.uid].d === todayK()) return;
  const body = ch[0] + ' ' + (LANG === 'en' ? ch[2] : ch[1]);
  $$('.frc-e').forEach(b => { b.disabled = true; });
  try {
    await frRpc('msg_send', { p_to: f.uid, p_body: body, p_ev: null });
    const t = todayK(); fr.cheer = Object.fromEntries(Object.entries(fr.cheer || {}).filter(([, v]) => v && v.d === t)); fr.cheer[f.uid] = { d: t, e: ch[0] };
    frSave(); render(); toast(`${frFirst(f)} получит: ${body}`);
  } catch (e) { $$('.frc-e').forEach(b => { b.disabled = false; }); toast(msgErrText(e)); }
};
// Дни рождения друзей: сегодня или завтра — карточка на Главной (только у тех, кто сам открыл день рождения друзьям); «Поздравить» — переписка с готовым поздравлением.
// 29 февраля в невисокосный год — 28-го (так же считает пуш в функции reminders)
function frBdays() {
  if (!signedIn()) return [];
  const y = +todayK().slice(0, 4), leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0), out = [];
  for (const f of fr.list) {
    if (f.state !== 'ok' || !f.feed || !f.feed.me.bd) continue;
    const b = bdayInfo('2000-' + (f.feed.me.bd === '02-29' && !leap ? '02-28' : f.feed.me.bd));
    if (b && b.days <= 1) out.push({ f, days: b.days });
  }
  return out.sort((a, b) => a.days - b.days);
}
const frBdayHTML = () => frBdays().map(({ f, days }) => `<div class="card frbd"><span class="frbd-e" aria-hidden="true">🎂</span><span class="frbd-t"><b>${esc(frName(f))}</b><small>${days ? 'Завтра день рождения — не забудьте поздравить' : 'Сегодня день рождения!'}</small></span>${days ? '' : `<button class="btn pri" data-act="frbday" data-u="${f.uid}">Поздравить</button>`}</div>`).join('');
ACT.frbday = el => {
  const u = el.dataset.u; openMsgs(u);
  if (mc && mc.peer === u && !mc.draft[u]) { mc.draft[u] = LANG === 'en' ? 'Happy birthday! 🎉' : 'С днём рождения! 🎉'; msgDraw(); }
};
// ---- Вызов на неделю (7 ноября 2026; supabase/sql/challenges.sql) ----
// Кто больше задач, отметок привычек или очков до воскресенья. Числа и итог считает сервер (ch_list подводит итог прошлой недели: победителю — 25 ParsiCoins,
// при ничьей — по 10). Уведомление другу — обычное сообщение в переписку. SQL ещё не выполнен — вызова нет нигде (frChNo, только до перезапуска)
const FR_CH_K = { t: ['задач', 'Задачи', 'tasks'], h: ['отметок привычек', 'Привычки', 'habit check-ins'], p: ['очков', 'Очки: задачи + привычки', 'points'] };
let frChNo = false;
const frChRow = r => r && Number.isFinite(+r.id) && /^[0-9a-f-]{36}$/i.test(r.peer || '') && FR_CH_K[r.kind] && isDate(r.week) && ['sent', 'on', 'no', 'done'].includes(r.state)
  ? { id: +r.id, peer: r.peer.toLowerCase(), mine: r.mine === true, kind: r.kind, week: r.week, state: r.state, my: Math.max(0, +r.my || 0), their: Math.max(0, +r.their || 0), won: typeof r.won === 'boolean' ? r.won : null, coins: Math.max(0, +r.coins || 0) } : null;
async function frChLoad() {
  if (!signedIn() || frChNo) return;
  try {
    const j = await frRpc('ch_list', {});
    fr.ch = (Array.isArray(j) ? j : []).map(frChRow).filter(Boolean); frSave();
    // Итог прошлой недели — один раз тостом
    const seen = new Set(fr.chSeen || []), news = fr.ch.filter(c => c.state === 'done' && !seen.has(c.id));
    fr.chSeen = fr.ch.filter(c => c.state === 'done').map(c => c.id); frSave();
    const top = news.find(c => c.coins);
    if (top) { const f = fr.list.find(x => x.uid === top.peer); toast(`Вызов недели: ${top.won ? 'победа' : 'ничья'} ${top.my} : ${top.their}${f ? ' (соперник — ' + frFirst(f) + ')' : ''} · +${top.coins} ${COIN}`); }
    if (sec === 'friend' || sec === 'home') render();
  } catch (e) { if (frNoSql(e)) frChNo = true; }
}
// Вызов с другом: этой недели (cur) и итог прошлой (last)
const frChOf = uid => { const wk = frMonday(todayK()), l = (fr.ch || []).filter(c => c.peer === uid); return { cur: l.find(c => c.week >= wk), last: l.find(c => c.week < wk && c.state === 'done') }; };
const frChLeft = c => { const n = dayDiff(todayK(), addDays(c.week, 6)); return n <= 0 ? 'последний день' : 'осталось ' + plural(n, NDAY); };
function frChHTML(f) {
  if (frChNo || !fr.ch) return '';
  const { cur, last } = frChOf(f.uid), nm = esc(frFirst(f)), what = c => FR_CH_K[c.kind][0];
  let h = '';
  if (last) h += `<p class="frx frx-res">Итог прошлой недели — ${last.won ? 'победа' : last.won === false ? 'в этот раз не вышло' : 'ничья'}: вы ${last.my} : ${last.their} ${nm}${last.coins ? ` · +${last.coins} ${COIN}` : ''}</p>`;
  if (!cur) h += `<button class="btn frx-go" data-act="chpick" data-u="${f.uid}">🏁 Вызов на неделю</button>`;
  else if (cur.state === 'on') h += `<p class="frx frx-on"><b>🏁 Вызов недели: кто больше ${what(cur)}</b><span>${frChLeft(cur)} · победителю 25 ${COIN}</span></p>`;
  else if (cur.state === 'sent' && cur.mine) h += `<p class="frx">🏁 Вызов отправлен: кто больше ${what(cur)} до воскресенья — ждём ответа</p>`;
  else if (cur.state === 'sent') h += frChAsk(cur, f);
  else if (cur.state === 'no' && cur.mine) h += `<p class="frx">Вызов не принят — попробуйте на следующей неделе</p>`;
  return h;
}
const frChAsk = (c, f) => `<div class="frx frx-in"><b>🏁 ${esc(frFirst(f))} бросает вызов: кто больше ${FR_CH_K[c.kind][0]} до воскресенья</b><small>Победителю — 25 ${COIN}, при ничьей — по 10</small><span class="frx-btns"><button class="btn pri" data-act="chyes" data-id="${c.id}" data-u="${f.uid}">Принять</button><button class="btn" data-act="chno" data-id="${c.id}">Не сейчас</button></span></div>`;
// Главная: входящие вызовы этой недели — сразу с ответом
const frChHomeHTML = () => frChNo || !fr.ch ? '' : fr.ch.filter(c => c.state === 'sent' && !c.mine && c.week >= frMonday(todayK())).map(c => { const f = fr.list.find(x => x.uid === c.peer && x.state === 'ok'); return f ? `<div class="card frx-card">${frChAsk(c, f)}</div>` : ''; }).join('');
ACT.chpick = el => {
  const f = fr.list.find(x => x.uid === el.dataset.u && x.state === 'ok'); if (!f) return;
  sheet(`<div class="sh-head"><h3>Вызов на неделю · ${esc(frFirst(f))}</h3><button class="ic" data-act="close" aria-label="Закрыть">${I(IC.x, 18)}</button></div>
  <p class="set-note" style="margin:0 0 12px">Кто больше — до воскресенья? Числа считает сервер, те же, что в таблице лидеров. Победителю — 25 ${COIN}, при ничьей — по 10. С каждым другом — один вызов в неделю.</p>
  <div class="frx-kinds">${Object.entries(FR_CH_K).map(([k, v]) => `<button class="frx-k" data-act="chsend" data-u="${f.uid}" data-k="${k}"><b>${v[1]}</b><small>кто больше ${v[0]}</small></button>`).join('')}</div>`);
};
const FR_CH_ERR = { exists: 'С этим другом вызов на этой неделе уже есть', limit: 'На этой неделе вы уже бросили три вызова', notfriend: 'Этот человек больше не в друзьях', bad: 'Не вышло — попробуйте ещё раз' };
ACT.chsend = async el => {
  const f = fr.list.find(x => x.uid === el.dataset.u && x.state === 'ok'), k = el.dataset.k; if (!f || !FR_CH_K[k]) return;
  $$('.frx-k').forEach(b => { b.disabled = true; });
  try {
    const r = await frRpc('ch_send', { p_to: f.uid, p_kind: k });
    if (!r || !r.ok) { closeSheet(); return toast(FR_CH_ERR[r && r.err] || FR_CH_ERR.bad); }
    const body = LANG === 'en' ? `🏁 I challenge you this week: who gets more ${FR_CH_K[k][2]} by Sunday? Answer on my page in Parsimony or on Home.` : `🏁 Бросаю тебе вызов на неделю: кто больше ${FR_CH_K[k][0]} до воскресенья? Ответить можно на моей странице в Parsimony или на Главной.`;
    frRpc('msg_send', { p_to: f.uid, p_body: body, p_ev: null }).catch(() => {});   // уведомление другу; не дошло — вызов всё равно есть
    closeSheet(); toast(`Вызов отправлен — ${frFirst(f)} получит сообщение`);
    await frChLoad();
  } catch (e) { closeSheet(); toast(frNoSql(e) ? 'Вызовы ещё не включены на сервере' : cloudErrText(e)); if (frNoSql(e)) { frChNo = true; render(); } }
};
async function frChAnswer(el, yes) {
  $$('.frx-btns .btn').forEach(b => { b.disabled = true; });
  try {
    const okk = await frRpc('ch_answer', { p_id: +el.dataset.id, p_ok: yes });
    if (okk && yes && el.dataset.u) frRpc('msg_send', { p_to: el.dataset.u, p_body: LANG === 'en' ? "✅ Challenge accepted! Let's see who wins 💪" : '✅ Принимаю вызов! Посмотрим, кто кого 💪', p_ev: null }).catch(() => {});
    toast(!okk ? 'Этот вызов уже не ждёт ответа' : yes ? 'Вызов принят — до воскресенья!' : 'Хорошо, в другой раз');
  } catch (e) { toast(cloudErrText(e)); }
  await frChLoad(); render();
}
ACT.chyes = el => frChAnswer(el, true);
ACT.chno = el => frChAnswer(el, false);
// ---- Страница человека по нику (8 ноября 2026; supabase/sql/profile_page.sql) ----
// Решения пользователя: открыть может только вошедший; видно ник, имя, значок, рамку и обложку, остальное — только что человек сам открыл всем
// (карточка для друзей → «Видно всем по нику», S.settings.pub → feed.pub): достижения, итоги за всё время, девиз и «Обо мне». Ссылка — …/#u=ник.
// Друг — сразу его полная страница
const FR_PUB = [['ach', 'Достижения'], ['tot', 'Итоги за всё время'], ['about', 'Девиз и «Обо мне»']];
const frPubOut = () => { const p = S.settings.pub || {}; return Object.fromEntries(FR_PUB.filter(([k]) => p[k]).map(([k]) => [k, 1])); };
let pr = null;   // { nick, d — ответ сервера, busy, err }
const prClean = d => d && typeof d === 'object' && FR_NICK.test(d.nick || '') ? {
  nick: d.nick, name: String(d.name || '').slice(0, 40), ava: frAvaOk(d.ava), rel: ['me', 'ok', 'out', 'in', ''].includes(d.rel) ? d.rel : '',
  uid: /^[0-9a-f-]{36}$/i.test(d.uid || '') ? d.uid.toLowerCase() : '',
  ach: Array.isArray(d.ach) ? d.ach.filter(n => typeof n === 'string' && ACH.some(a => a[1] === n)) : null,
  tot: d.tot && typeof d.tot === 'object' ? { t: Math.max(0, +d.tot.t || 0), h: Math.max(0, +d.tot.h || 0), b: Math.max(0, +d.tot.b || 0), s: isDate(d.tot.s) ? d.tot.s : '' } : null,
  m: typeof d.m === 'string' ? d.m.slice(0, 90) : '', ab: typeof d.ab === 'string' ? d.ab.slice(0, 600) : '' } : null;
async function openPerson(nick) {
  nick = String(nick || '').trim().replace(/^@/, '').toLowerCase();
  if (!FR_NICK.test(nick)) return toast('Ник — от 3 знаков: латинские буквы, цифры, точка и _');
  if (sheetOpen()) closeSheet();
  const f = fr.list.find(x => x.nick === nick && x.state === 'ok');
  if (f) { fr.cur = f.uid; frSave(); setSec('friend'); return frLoad(true); }   // друг — его полная страница
  pr = { nick, d: null, busy: signedIn(), err: '' };
  setSec('person'); window.scrollTo(0, 0);
  if (!signedIn()) return;
  try { const j = await frRpc('profile_page', { p_nick: nick }); pr.d = prClean(j); if (!pr.d) pr.err = 'none'; }
  catch (e) { pr.err = frNoSql(e) ? 'Страницы по нику ещё не включены на сервере' : cloudErrText(e); }
  pr.busy = false; if (sec === 'person') render();
}
function prPageHTML() {
  if (!pr) return '<div class="card"><p class="hm-empty">Страница не выбрана.</p></div>';
  const head = t => `<div class="pe-head"><button class="ic pe-back" data-act="prback" aria-label="Назад" title="Назад">${I(IC.left, 20)}</button><div><h2>@${esc(pr.nick)}</h2></div></div><div class="card"><p class="hm-empty">${t}</p>`;
  if (!signedIn()) return head('Страницы людей в ' + APP_NAME + ' видят только те, кто вошёл в аккаунт.') + `<button class="btn pri" style="width:100%" data-act="login">Войти</button></div>`;
  if (!pr.d && !pr.busy && !pr.err) setTimeout(() => openPerson(pr.nick), 0);   // вошли, пока страница была открыта
  if (pr.busy || !pr.d && !pr.err) return head('Загружаю…') + '</div>';
  if (pr.err) return head(pr.err === 'none' ? `Человека с ником @${esc(pr.nick)} нет — проверьте написание.` : esc(pr.err)) + '</div>';
  const d = pr.d, nm = d.name || '@' + d.nick, f = d.uid && fr.list.find(x => x.uid === d.uid);
  const acts = d.rel === 'me' ? `<button class="btn pri" data-act="prlink">${I(IC.share, 15)} Ссылка на мою страницу</button><button class="btn" data-act="frset">Что видно всем</button>`
    : d.rel === 'ok' && d.uid ? `<button class="btn pri" data-act="fropen" data-u="${d.uid}">Страница друга</button>${msgErr !== 'nosql' ? `<button class="btn" data-act="msgto" data-u="${d.uid}">${I(IC.chat, 15)} Написать</button>` : ''}`
    : d.rel === 'out' ? '<span class="frp-rel">Заявка отправлена</span>'
    : `<button class="btn pri" data-act="prask">${d.rel === 'in' ? 'Принять заявку' : 'Позвать в друзья'}</button>`;
  const about = d.m || d.ab ? `<div class="card frb-about"><div class="card-h"><b>О себе</b></div>${d.m ? `<p class="frp-motto">${esc(d.m)}</p>` : ''}${d.ab ? `<p class="pf-about-t">${esc(d.ab)}</p>` : ''}</div>` : '';
  const ach = d.ach ? ACH.filter(a => d.ach.includes(a[1])) : null, tile = (l, v) => `<div class="frb-t"><small>${l}</small><b>${v}</b></div>`;
  const achC = ach ? `<div class="card frb-ach"><div class="card-h"><b>${I(IC.trophy, 17)} Достижения · ${ach.length} из ${ACH.length}</b></div>${ach.length ? `<div class="frp-ach">${ach.map(a => `<span class="frp-b" title="${esc(a[1])}" role="img" aria-label="${esc(a[1])}">${a[0]}</span>`).join('')}</div>` : '<p class="hm-empty">Достижений пока нет — всё впереди.</p>'}</div>` : '';
  const totC = d.tot ? `<div class="card"><div class="card-h"><b>Итоги за всё время</b></div><div class="frb-tot">${tile('Задач выполнено', NF0.format(d.tot.t))}${tile('Отметок привычек', NF0.format(d.tot.h))}${tile('Лучшая серия', d.tot.b ? plural(d.tot.b, NDAY) : '—')}${tile('В ' + APP_NAME + ' с', d.tot.s ? pd(d.tot.s).getDate() + ' ' + MONG[pd(d.tot.s).getMonth()] + ' ' + d.tot.s.slice(0, 4) : '—')}</div></div>` : '';
  const none = about || achC || totC ? '' : `<div class="card"><p class="hm-empty">${d.rel === 'me' ? 'Вы ещё ничего не открыли всем: остальные видят только ник, имя и значок. Достижения, итоги и «Обо мне» включаются в карточке для друзей → «Видно всем по нику».' : 'Больше ничего этот человек всем не открыл.'}</p></div>`;
  return `<div class="card pf-card frp-card frb-head">
    <div class="pf-cover" style="background-image:${COVER_GLOW},${COVERS[d.ava.cv] || COVERS.dusk}"><button class="frp-back" data-act="prback" aria-label="Назад" title="Назад">${I(IC.left, 18)}</button></div>
    <div class="pf-bar"><span class="pf-ava">${frAva(d, 104)}</span>
      <div class="pf-who"><h2 class="pf-nm">${esc(nm)}</h2><div class="pf-tags">${d.name ? `<span class="pf-nick">@${esc(d.nick)}</span>` : ''}${d.rel === 'ok' ? '<span class="frp-rel">В друзьях</span>' : d.rel === 'me' ? '<span class="frp-rel">Это вы · так видят все</span>' : ''}</div>
        ${f ? `<small class="frp-since">${esc(frName(f))}</small>` : ''}</div>
      <div class="pf-acts">${acts}</div></div></div>
  ${none}<div class="frb-cols"><div class="frb-col">${about}${totC}</div><div class="frb-col">${achC}</div></div>`;
}
SEC.person = { name: 'Человек', icon: IC.user, noNav: true, title: () => 'Друзья', html: prPageHTML, move: () => {} };
ACT.propen = el => openPerson(el.dataset.n);
ACT.prback = () => { if (!navBack()) setSec('profile'); };
ACT.prask = async () => {
  if (!pr || !pr.d) return;
  try { const r = await frRpc('friend_add', { p_nick: pr.d.nick }); toast(FR_ADD_MSG[r] || 'Готово'); frLoad(true); openPerson(pr.d.nick); }
  catch (e) { toast(cloudErrText(e)); }
};
ACT.prlink = () => {
  if (!fr.nick) return toast('Сначала задайте ник в карточке для друзей');
  const url = location.origin + location.pathname + '#u=' + fr.nick;
  if (navigator.share && innerWidth < 900) navigator.share({ title: APP_NAME, url }).catch(() => {}); else copyText(url, 'Ссылка на вашу страницу скопирована');
};
// Ближайшее: сегодня (что ещё не закончилось) и завтра; пусто — первый день с делами на две недели. Ниже — первое общее окно
function frNearHTML(f) {
  const fd = f.feed, open = fd.cs.length || fd.hrs.length, head = `<div class="card-h"><b>${I(IC.cal, 17)} Ближайшее</b>${open ? `<button class="pill sm" data-act="frcal" data-u="${f.uid}">Весь календарь →</button>` : ''}</div>`;
  if (!open) return `<div class="card frb-near">${head}<p class="hm-empty">Друг пока не открыл вам календари — ни дел, ни общего свободного времени не видно.</p></div>`;
  const t = todayK(), now = new Date(), hm = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  let out = '', n = 0;
  for (let i = 0; i < FR_DAYN && n < FR_NEAR && !(i >= 2 && n); i++) {
    const k = addDays(t, i), evs = frEvs(f, k).filter(x => i || !x.e.time || (x.e.time2 || x.e.time) > hm).slice(0, FR_NEAR - n);
    if (evs.length) { out += `<div class="frb-dh">${frDayH(k, i)}</div><ul class="frb-evs">${evs.map(x => frEvLi(x)).join('')}</ul>`; n += evs.length; }
  }
  const free = frFree(f), all = free.reduce((s, d) => s + d.wins.length, 0), w = free[0] && free[0].wins[0];
  const slot = w ? `<button class="frf-slot" data-act="frmeet" data-u="${f.uid}" data-k="${free[0].k}" data-a="${w[0]}" data-b="${w[1]}" aria-label="Встреча ${frDayLbl(free[0].k, dayDiff(t, free[0].k))}, ${frHM(w[0])}–${frHM(w[1])}">${frDayLbl(free[0].k, dayDiff(t, free[0].k))}, ${frHM(w[0])}–${frHM(w[1])}</button>` : '';
  return `<div class="card frb-near">${head}${out || '<p class="hm-empty">На две недели вперёд ничего не запланировано.</p>'}
    <div class="frb-free"><span class="frb-fl">${I(IC.users, 15)} Свободны вместе ${hint(FR_FREE_HINT, 'Как ищем свободное время')}</span>
      ${w ? slot + (all > 1 ? `<button class="frb-more" data-act="frcal" data-u="${f.uid}">ещё ${plural(all - 1, FR_NWIN)}</button>` : '') : '<span class="frb-none">на неделе общих окон нет</span>'}</div></div>`;
}
const FR_FREE_HINT = 'Ближайшие 7 дней с 9:00 до 22:00: окна от часа, когда нет ни ваших событий со временем, ни событий друга — по календарям, которые друг вам открыл, — и когда никто из вас не отметил «Занят для друзей». События на весь день не учитываются. Нажмите на окно — в вашем календаре появится встреча.';
// О друге: что друг сам открыл (девиз, «Обо мне», день рождения без года, город) и ваше «Не забыть» (видите только вы)
function frAboutHTML(f, note) {
  const me = f.feed ? f.feed.me : null, bd = me && me.bd ? bdayInfo('2000-' + me.bd) : null, li = [];
  if (bd) li.push(`<li>${I(IC.gift, 16)}<span>День рождения — ${bd.d.getDate()} ${MONG[bd.d.getMonth()]}${bd.days === 0 ? ' · сегодня! 🎉' : bd.days <= 30 ? ' · через ' + plural(bd.days, NDAY) : ''}</span></li>`);
  if (me && me.city) li.push(`<li>${I(IC.globe, 16)}<span>${esc(me.city)}</span></li>`);
  if (!(me && (me.m || me.ab)) && !li.length && !note.t) return '';
  return `<div class="card frb-about"><div class="card-h"><b>О друге</b></div>
    ${me && me.m ? `<p class="frp-motto">${esc(me.m)}</p>` : ''}${me && me.ab ? `<p class="pf-about-t">${esc(me.ab)}</p>` : ''}
    ${li.length ? `<ul class="pf-det">${li.join('')}</ul>` : ''}
    ${note.t ? `<div class="frb-mine"><div class="frb-mh"><span>${I(IC.lock, 14)} Не забыть <small>видите только вы</small></span><button class="pill sm" data-act="frnotes" data-u="${f.uid}">${I(IC.edit, 13)} Изменить</button></div><p class="pf-about-t">${esc(note.t)}</p></div>` : ''}</div>`;
}
// Достижения и итоги за всё время — одной карточкой
function frAchHTML(f) {
  const fd = f.feed, tot = Object.assign({}, fd.tot, f.st ? frTot(f) : {}), ach = ACH.filter(a => fd.ach.includes(a[1])), MAX = 8;
  const tile = (l, v) => `<div class="frb-t"><small>${l}</small><b>${v}</b></div>`;
  return `<div class="card frb-ach"><div class="card-h"><b>${I(IC.trophy, 17)} Достижения · ${ach.length} из ${ACH.length}</b>${ach.length ? `<button class="pill sm" data-act="frach" data-u="${f.uid}">Все →</button>` : ''}</div>
    ${ach.length ? `<div class="frp-ach">${ach.slice(0, MAX).map(a => `<span class="frp-b" title="${esc(a[1])}" role="img" aria-label="${esc(a[1])}">${a[0]}</span>`).join('')}${ach.length > MAX ? `<button class="frp-b frb-plus" data-act="frach" data-u="${f.uid}" aria-label="Все достижения">+${ach.length - MAX}</button>` : ''}</div>` : '<p class="hm-empty">Достижений пока нет — всё впереди.</p>'}
    <div class="frb-tot">${tile('Задач выполнено', NF0.format(tot.t))}${tile('Отметок привычек', NF0.format(tot.h))}${tile('Лучшая серия', tot.b ? plural(tot.b, NDAY) : '—')}${tile('В ' + APP_NAME + ' с', tot.s ? pd(tot.s).getDate() + ' ' + MONG[pd(tot.s).getMonth()] + ' ' + tot.s.slice(0, 4) : '—')}</div></div>`;
}
function frPageHTML() {
  const f = fr.list.find(x => x.uid === fr.cur && x.state === 'ok');
  if (!f) return `<div class="pe-head"><button class="ic pe-back" data-act="sec" data-s="profile" aria-label="Назад к профилю" title="Назад к профилю">${I(IC.left, 20)}</button><div><h2>Друг</h2></div></div><div class="card"><p class="hm-empty">Этого человека больше нет в списке друзей.</p></div>`;
  const fd = f.feed, note = frNote(f.uid), rel = FR_REL.find(r => r[0] === note.r), since = f.since ? new Date(f.since) : null;
  return `<div class="card pf-card frp-card frb-head">
    <div class="pf-cover" style="background-image:${COVER_GLOW},${COVERS[f.ava.cv] || COVERS.dusk}"><button class="frp-back" data-act="sec" data-s="profile" aria-label="Назад к профилю" title="Назад к профилю">${I(IC.left, 18)}</button></div>
    <div class="pf-bar">
      <span class="pf-ava">${frAva(f, 104)}</span>
      <div class="pf-who"><h2 class="pf-nm">${esc(frName(f))}</h2>
        <div class="pf-tags">${note.n ? `<span class="pf-nick">${esc(frReal(f))}</span>` : ''}${f.nick && (!note.n || f.name) ? `<span class="pf-nick">@${esc(f.nick)}</span>` : ''}${rel ? `<span class="frp-rel">${rel[1]} ${rel[2]}</span>` : ''}</div>
        <small class="frp-since">${since ? 'В друзьях с ' + since.getDate() + ' ' + MONG[since.getMonth()] + ' ' + since.getFullYear() : 'В друзьях'}${f.at ? ' · обновлено ' + ago(f.at) : ''}</small>
      </div>
      <div class="pf-acts">${msgErr !== 'nosql' ? `<button class="btn pri" data-act="msgto" data-u="${f.uid}">${I(IC.chat, 15)} Написать</button>` : ''}<button class="btn" data-act="frnotes" data-u="${f.uid}">${I(IC.edit, 15)} Пометки</button><button class="btn pf-more" data-act="frmenu" data-u="${f.uid}" aria-label="Ещё" title="Ещё">${I(IC.more, 18)}</button></div>
    </div>
  </div>
  ${!fd ? `<div class="card"><p class="hm-empty">Пока пусто — числа и календарь появятся, когда друг откроет приложение.</p></div>${frAboutHTML(f, note)}` : `<div class="frb-cols">
    <div class="frb-col">${frVsHTML(f)}${frNearHTML(f)}</div>
    <div class="frb-col">${frAboutHTML(f, note)}${frAchHTML(f)}</div>
  </div>`}`;
}
// Весь календарь друга окном: общие свободные окна на неделю, регулярные дела одной строкой каждое и разовые — по дням на две недели
ACT.frcal = el => {
  const f = fr.list.find(x => x.uid === el.dataset.u && x.state === 'ok'); if (!f || !f.feed) return;
  const fd = f.feed, t = todayK(), cs = new Map(fd.cs.map(c => [c.i, c])), seen = new Set(), rec = [];
  fd.ev.forEach(e => { if (!isRec(e)) return; const key = [e.title, e.time, e.time2, e.cat, canon(e.repeat)].join('|'); if (!seen.has(key)) { seen.add(key); rec.push(e); } });
  const reg = [...fd.hrs.map(r => frEvLi({ e: { title: '', time: r.a, time2: r.b }, c: { c: FR_HRS_C } }, frDaysTxt(r.d))),
    ...rec.sort((a, b) => (a.time || '').localeCompare(b.time || '')).map(e => frEvLi({ e, c: cs.get(e.cat) || {} }, repText(e)))];
  let days = '';
  for (let i = 0; i < FR_DAYN; i++) { const k = addDays(t, i), evs = frEvs(f, k).filter(x => !x.h && !isRec(x.e)); if (evs.length) days += `<div class="frb-dh">${frDayH(k, i)}</div><ul class="frb-evs">${evs.map(x => frEvLi(x)).join('')}</ul>`; }
  const free = frFree(f);
  sheet(`<div class="sh-head"><h3>Календарь · ${esc(frName(f))}</h3><button class="ic" data-act="close" title="Закрыть (Esc)" aria-label="Закрыть">${I(IC.x, 18)}</button></div>
  <div class="frb-sheet">
    <div class="set-sec">Свободны вместе ${hint(FR_FREE_HINT, 'Как ищем свободное время')}</div>
    ${free.length ? `<div class="frf-days">${free.map(d => `<div class="frf-day"><span class="frf-d">${frDayLbl(d.k, dayDiff(t, d.k))}</span><span class="frf-w">${d.wins.map(([a, b]) => `<button class="frf-slot" data-act="frmeet" data-u="${f.uid}" data-k="${d.k}" data-a="${a}" data-b="${b}" aria-label="Встреча ${frDayLbl(d.k, dayDiff(t, d.k))}, ${frHM(a)}–${frHM(b)}">${frHM(a)}–${frHM(b)}</button>`).join('')}</span></div>`).join('')}</div>` : '<p class="hm-empty">На этой неделе общих свободных окон нет.</p>'}
    ${reg.length ? `<div class="set-sec">Регулярно</div><ul class="frb-evs">${reg.join('')}</ul>` : ''}
    <div class="set-sec">Две недели</div>
    ${days || '<p class="hm-empty">Разовых дел на две недели нет.</p>'}
    ${fd.cs.length ? `<p class="set-note">«Занят» — календарь, у которого друг показывает только время. Календари: ${fd.cs.map(c => `<span class="fr-cal"><i style="--c:${c.c}"></i>${c.n ? esc(c.n) : 'без названия'}</span>`).join(' ')}</p>` : ''}
  </div>`);
};
// Достижения друга целиком: названия и за что
ACT.frach = el => {
  const f = fr.list.find(x => x.uid === el.dataset.u); if (!f || !f.feed) return;
  const l = ACH.filter(a => f.feed.ach.includes(a[1]));
  sheet(`<div class="sh-head"><h3>Достижения · ${esc(frName(f))}</h3><button class="ic" data-act="close" aria-label="Закрыть">${I(IC.x, 18)}</button></div>
  <div class="ach ach-all">${l.map(([e, n, dsc]) => `<div class="ach-i"><span class="ach-e" aria-hidden="true">${e}</span><span class="ach-t"><b>${esc(n)}</b><small>${esc(dsc)}</small><em>Получено</em></span></div>`).join('')}</div>`);
};
// Пометки о друге: как подписать, кто это для вас, «не забыть» — видите только вы
let frNoteEd = null;   // { uid, n, r, t }
function openFrNotes() {
  const st = frNoteEd, f = fr.list.find(x => x.uid === st.uid); if (!f) return;
  sheet(`<div class="sh-head"><h3>Пометки · ${esc(frReal(f))}</h3><button class="ic" data-act="close" aria-label="Закрыть">${I(IC.x, 18)}</button></div>
  <p class="frn-lock">${I(IC.lock, 14)} Видите только вы — другу это не показывается</p>
  <div class="frow"><span class="fl">Подпись</span><input id="frn_n" class="fin" value="${esc(st.n)}" maxlength="${NAME_MAX}" placeholder="Например, Саня с работы" autocomplete="off"></div>
  <div class="set-sec">Кто это для вас</div>
  <div class="frn-tiles" role="group" aria-label="Кто это для вас">${FR_REL.map(([k, e, n]) => `<button class="frn-tile${st.r === k ? ' on' : ''}" data-act="frnrel" data-k="${k}" aria-pressed="${st.r === k}"><span aria-hidden="true">${e}</span>${n}</button>`).join('')}</div>
  <div class="set-sec">Не забыть</div>
  <textarea id="frn_t" class="fin frn-t" maxlength="500" rows="3" aria-label="Не забыть" placeholder="Любимый кофе, идеи подарков, о чём договорились…">${esc(st.t)}</textarea>
  <div class="sh-foot"><button class="btn pri" data-act="frnsave">Сохранить</button></div>`, true);
}
const frNoteRead = () => { const n = $('#frn_n'), t = $('#frn_t'); if (n) frNoteEd.n = n.value; if (t) frNoteEd.t = t.value; };
ACT.frnotes = el => { closeQuick(); const n = frNote(el.dataset.u); frNoteEd = { uid: el.dataset.u, n: n.n || '', r: n.r || '', t: n.t || '' }; openFrNotes(); };
ACT.frnrel = el => { frNoteRead(); frNoteEd.r = frNoteEd.r === el.dataset.k ? '' : el.dataset.k; shDirty = true; openFrNotes(); };
ACT.frnsave = () => {
  const st = frNoteEd; if (!st) return; frNoteRead();
  const n = st.n.trim().slice(0, NAME_MAX), t = st.t.trim().slice(0, 500);
  snap(); if (n || st.r || t) S.frNotes[st.uid] = Object.assign({}, n ? { n } : {}, st.r ? { r: st.r } : {}, t ? { t } : {}); else delete S.frNotes[st.uid];
  save(); frNoteEd = null; shDirty = false; closeSheet(); render(); toast('Пометки сохранены', true);
};
// ---- Свободны вместе (просьба пользователя: «когда мы оба свободны») ----
// Ближайшие 7 дней с 9:00 до 22:00: окна от часа, когда нет ни ваших событий со временем, ни событий друга из календарей, которые он вам открыл.
// События на весь день не мешают (чаще это пометки: праздник, день рождения). Нажатие на окно — новое событие «Встреча: Имя» на час
const FR_FREE = [9 * 60, 22 * 60], FR_FREE_MIN = 60;
const frMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const frHM = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
const frBusy = (list, k) => list.filter(e => isTime(e.time) && occurs(e, k)).map(e => { const a = frMin(e.time), b = isTime(e.time2) ? frMin(e.time2) : 0; return [a, b > a ? b : a + 60]; });
function frFree(f) {
  const t = todayK(), now = new Date(), nowM = now.getHours() * 60 + now.getMinutes(), mine = S.events.filter(e => !e.demo), out = [];
  for (let i = 0; i < 7; i++) {
    const k = addDays(t, i), busy = [...frBusy(mine, k), ...frBusy(f.feed.ev, k), ...frHrsOn(frHrsList(), k), ...frHrsOn(f.feed.hrs, k)].sort((a, b) => a[0] - b[0]), wins = [];
    let from = i ? FR_FREE[0] : Math.max(FR_FREE[0], Math.ceil(nowM / 30) * 30);
    busy.forEach(([a, b]) => { if (a > from) wins.push([from, Math.min(a, FR_FREE[1])]); from = Math.max(from, b); });
    wins.push([from, FR_FREE[1]]);
    const ok = wins.filter(([a, b]) => b - a >= FR_FREE_MIN);
    if (ok.length) out.push({ k, wins: ok });
  }
  return out;
}
// ---- Когда я занят для друзей (просьба пользователя 6 ноября 2026: «указать время, в которое я буду занят для других, условно с 8 до 16») ----
// S.settings.frHrs = [{ d: [0..6], a: 'ЧЧ:ММ', b: 'ЧЧ:ММ' }] — дни (0 — понедельник, как dowIdx) и часы, до FR_HRS_MAX строк. Уходят в карточку (feed.hrs):
// у друзей на вашей странице — «Занят», в «Свободны вместе» эти часы не попадают — ни у них, ни у вас. Ваш календарь не меняется. Настройки → «Друзья и приватность»
const FR_HRS_MAX = 6, FR_HRS_C = '#94a3b8', FR_HRS_DEF = { d: [0, 1, 2, 3, 4], a: '09:00', b: '18:00' };
const frHrsOk = r => !!r && Array.isArray(r.d) && r.d.length > 0 && r.d.every(x => Number.isInteger(x) && x >= 0 && x <= 6) && HM_RE.test(r.a || '') && HM_RE.test(r.b || '') && timeMin(r.a) < timeMin(r.b);
const frHrsClean = v => (Array.isArray(v) ? v : []).slice(0, FR_HRS_MAX).map(r => r && typeof r === 'object' ? { d: [...new Set(Array.isArray(r.d) ? r.d : [])].filter(x => Number.isInteger(x) && x >= 0 && x <= 6).sort((x, y) => x - y), a: String(r.a || ''), b: String(r.b || '') } : null).filter(frHrsOk);
const frHrsList = () => frHrsClean(S.settings.frHrs);
const frHrsOn = (list, k) => { const d = dowIdx(k); return list.filter(r => r.d.includes(d)).map(r => [timeMin(r.a), timeMin(r.b)]); };
// «По будням», «Пн–Чт», «Пн, Ср, Пт»
const frDaysTxt = d => { const s = [...d].sort((x, y) => x - y), j = s.join('');
  if (j === '0123456') return 'Каждый день'; if (j === '01234') return 'По будням'; if (j === '56') return 'По выходным';
  return s.length >= 3 && s.every((x, i) => !i || x === s[i - 1] + 1) ? DOW[s[0]] + '–' + DOW[s[s.length - 1]] : s.map(i => DOW[i]).join(', '); };
function frHrsHTML() {
  const l = frHrsList();
  return `${l.length ? '' : '<p class="set-note">Не задано — друзья видят только события из календарей, которые вы им открыли.</p>'}
    ${l.map((r, i) => `<div class="frh-row"><div class="frh-days" role="group" aria-label="Дни недели">${DOW.map((n, d) => `<button class="frh-d${r.d.includes(d) ? ' on' : ''}" data-act="frhday" data-i="${i}" data-d="${d}" aria-pressed="${r.d.includes(d)}">${n}</button>`).join('')}</div>
      <span class="ai-fh"><input id="frh_${i}_a" class="fin" type="time" step="900" value="${r.a}" aria-label="Занят с"><span aria-hidden="true">–</span><input id="frh_${i}_b" class="fin" type="time" step="900" value="${r.b}" aria-label="Занят до"></span>
      <button class="ic frh-x" data-act="frhdel" data-i="${i}" aria-label="Убрать это время" title="Убрать">${I(IC.x, 16)}</button></div>`).join('')}
    ${l.length < FR_HRS_MAX ? `<button class="btn frh-add" data-act="frhadd">${I(IC.plus, 15)} ${l.length ? 'Добавить ещё время' : 'Указать, когда я занят'}</button>` : ''}`;
}
// Сохранить и обновить: карточка уйдёт друзьям сама (SAVE_HOOKS → frSoon)
const frHrsSet = (l, msg) => { S.settings.frHrs = l; save(); render(); if (msg) toast(msg); };
ACT.frhadd = () => { const l = frHrsList(); if (l.length >= FR_HRS_MAX) return; l.push(Object.assign({}, FR_HRS_DEF, { d: [...FR_HRS_DEF.d] })); frHrsSet(l); };
ACT.frhdel = el => { const l = frHrsList(); l.splice(+el.dataset.i, 1); frHrsSet(l, 'Время убрано — друзья больше не видят его'); };
ACT.frhday = el => {
  const l = frHrsList(), r = l[+el.dataset.i], d = +el.dataset.d; if (!r) return;
  if (r.d.includes(d)) { if (r.d.length === 1) return toast('Нужен хотя бы один день'); r.d = r.d.filter(x => x !== d); } else r.d = [...r.d, d].sort((x, y) => x - y);
  frHrsSet(l);
};
document.addEventListener('change', e => { const m = /^frh_(\d+)_([ab])$/.exec(e.target.id || ''); if (!m) return;
  const l = frHrsList(), r = l[+m[1]], v = e.target.value; if (!r) return;
  if (!HM_RE.test(v)) { e.target.value = r[m[2]]; return; }
  const n = Object.assign({}, r, { [m[2]]: v });
  if (timeMin(n.a) >= timeMin(n.b)) { e.target.value = r[m[2]]; return toast('Начало должно быть раньше конца'); }
  l[+m[1]] = n; frHrsSet(l, `Занят для друзей: ${frDaysTxt(n.d)}, ${n.a}–${n.b}`); });
const frDayLbl = (k, i) => i < 2 ? relDay(k)[0].toUpperCase() + relDay(k).slice(1) : dowName(k) + ', ' + pd(k).getDate() + ' ' + MONS[pd(k).getMonth()];
ACT.frmeet = el => {
  const f = fr.list.find(x => x.uid === el.dataset.u); if (!f) return;
  const a = +el.dataset.a, b = +el.dataset.b;
  openEvent(null, { title: 'Встреча: ' + frName(f), date: el.dataset.k, time: frHM(a), time2: frHM(Math.min(a + 60, b)) });
};

SEC.friend = { name: 'Друг', icon: IC.users, noNav: true, title: () => 'Друзья', html: frPageHTML, move: () => {} };
ACT.fropen = el => { fr.cur = el.dataset.u; frSave(); if (sec === 'friend') render(); else setSec('friend'); frLoad(true); };
ACT.frmenu = el => {
  const qc = $('#qc'), f = fr.list.find(x => x.uid === el.dataset.u); if (!f) return;
  qc.innerHTML = `<div class="pmenu">${f.nick ? `<button data-act="frcopy" data-u="${f.uid}">${I(IC.copy, 16)} Скопировать ник</button>` : ''}<button data-act="frnotes" data-u="${f.uid}">${I(IC.edit, 16)} Пометки</button><button data-act="frreload">${I(IC.down, 16)} Обновить</button><button class="dng" data-act="frrm" data-u="${f.uid}">${I(IC.x, 16)} Убрать из друзей</button></div>`;
  qc.classList.add('show', 'menu');
  const r = el.getBoundingClientRect(), w = qc.offsetWidth;
  qc.style.left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8)) + 'px'; qc.style.top = (r.bottom + 6) + 'px';
};
ACT.frreload = () => { closeQuick(); frLoad(); };
ACT.frcopy = el => { closeQuick(); const f = fr.list.find(x => x.uid === el.dataset.u); if (f && f.nick) copyText('@' + f.nick, 'Ник скопирован'); };

// ---- Заявки ----
ACT.fracc = async el => {
  try { await frRpc('friend_accept', { p_uid: el.dataset.u }); toast('Теперь вы друзья'); } catch (e) { toast(cloudErrText(e)); }
  frLoad(true);
};
ACT.frrm = el => {
  closeQuick();
  const f = fr.list.find(x => x.uid === el.dataset.u); if (!f) return;
  if (f.state !== 'ok') return frRemove(f);
  sheet(`<div class="sh-head"><h3>Убрать из друзей?</h3><button class="ic" data-act="close" aria-label="Закрыть">${I(IC.x, 18)}</button></div>
  <div class="fr-row">${frWhoHTML(f)}</div>
  <p class="set-note">Вы перестанете видеть календари и числа недели друг друга. Снова подружиться можно по нику или ссылке.</p>
  <div class="sh-foot"><button class="btn" data-act="close">Отмена</button><button class="btn dng" data-act="frrmgo" data-u="${f.uid}">Убрать</button></div>`);
};
ACT.frrmgo = el => { closeSheet(); const f = fr.list.find(x => x.uid === el.dataset.u); if (f) frRemove(f); };
async function frRemove(f) {
  try {
    await frRpc('friend_remove', { p_uid: f.uid });
    toast(f.state === 'in' ? 'Заявка отклонена' : f.state === 'out' ? 'Заявка отозвана' : `${frName(f)} больше не в друзьях`);
    if (f.state === 'ok' && sec === 'friend' && fr.cur === f.uid) setSec('profile');
  } catch (e) { toast(cloudErrText(e)); }
  frLoad(true);
}

// ---- Добавить по нику ----
let frFound = null;   // { q, row } — последний поиск
function openFrAdd() {
  if (!S.settings.fr) return openFrSet();
  const r = frFound && frFound.row, q = frFound ? frFound.q : '';
  const rel = r && ({ me: 'Это вы', ok: 'Уже в друзьях', out: 'Заявка уже отправлена — ждём ответа', in: '' })[r.rel];
  sheet(`<div class="sh-head"><h3>Добавить друга</h3><button class="ic" data-act="close" aria-label="Закрыть">${I(IC.x, 18)}</button></div>
  <div class="frow"><span class="fl">Ник друга</span><input id="fr_q" class="fin" value="${esc(q)}" placeholder="@ник" maxlength="25" autocapitalize="off" autocomplete="off" spellcheck="false" enterkeyhint="search"></div>
  <button class="btn pri" style="width:100%;margin-top:10px" data-act="frfind">Найти</button>
  ${frFound ? r ? `<div class="fr-found"><div class="fr-row">${frWhoHTML({ name: r.name, nick: r.nick, ava: frAvaOk(r.ava) })}<button class="btn sm" data-act="propen" data-n="${esc(r.nick)}">Страница</button></div>
      ${r.rel === 'in' ? `<p class="set-note">Этот человек уже зовёт вас в друзья.</p><button class="btn pri" style="width:100%" data-act="frask">Принять</button>`
        : rel ? `<p class="set-note">${rel}</p>` : `<button class="btn pri" style="width:100%" data-act="frask">Позвать в друзья</button><p class="set-note">Друг увидит заявку у себя в профиле. Пока он не примет её, никто ничего не видит.</p>`}</div>`
    : `<p class="set-note fr-found">Никого с ником «${esc(q)}». Проверьте написание — или отправьте другу ссылку-приглашение.</p><button class="btn" style="width:100%" data-act="invite">${I(IC.share, 15)} Пригласить по ссылке</button>` : ''}`);
  setTimeout(() => { const i = $('#fr_q'); if (i && !frFound) i.focus(); }, 60);
}
ACT.fradd = () => { frFound = null; openFrAdd(); };
ACT.frfind = async () => {
  const i = $('#fr_q'), q = (i ? i.value : '').trim().replace(/^@/, '').toLowerCase();
  if (!FR_NICK.test(q)) return toast('Ник — от 3 знаков: латинские буквы, цифры, точка и _');
  try { const j = await frRpc('friend_find', { p_nick: q }); frFound = { q, row: Array.isArray(j) && j[0] ? Object.assign({}, j[0], { nick: FR_NICK.test(j[0].nick || '') ? j[0].nick : '', name: String(j[0].name || '').slice(0, 40) }) : null }; openFrAdd(); }
  catch (e) { toast(frNoSql(e) ? 'Друзья ещё не включены на сервере' : cloudErrText(e)); }
};
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'fr_q') { e.preventDefault(); ACT.frfind(); } });
const FR_ADD_MSG = { sent: 'Заявка отправлена', accepted: 'Теперь вы друзья', already: 'Вы уже друзья или заявка уже есть', notfound: 'Такого ника больше нет', self: 'Это вы', limit: 'Слишком много заявок без ответа — подождите, пока их примут', noprofile: 'Сначала создайте свою карточку' };
ACT.frask = async () => {
  if (!frFound || !frFound.row) return;
  try { const r = await frRpc('friend_add', { p_nick: frFound.row.nick }); closeSheet(); toast(FR_ADD_MSG[r] || 'Готово'); frFound = null; frLoad(true); }
  catch (e) { toast(cloudErrText(e)); }
};

// ---- Ссылка-приглашение ----
const frCode = s => { const m = String(s || '').match(/#friend=([0-9a-f]{32})\b/); return m ? m[1] : ''; };
const frCanInvite = () => frOn();
async function frInvite() {
  if (!fr.invite) { try { await frMine(); } catch (e) { return toast(cloudErrText(e)); } }
  if (!fr.invite) return toast('Сначала сохраните карточку');
  const url = location.origin + location.pathname + '#friend=' + fr.invite, who = (S.settings.name || '').trim();
  const text = `${who ? who + ' зовёт' : 'Зову'} тебя в друзья в ${APP_NAME}. Если ссылка откроется в браузере, а не в приложении, — скопируй её и вставь в поиск ${APP_NAME}.`;
  if (navigator.share) navigator.share({ title: APP_NAME, text, url }).catch(() => {}); else copyText(text + ' ' + url, 'Ссылка скопирована — отправьте её другу');
}
function frHash() {
  const u = /^#u=@?([a-z0-9_.]{3,24})$/i.exec(location.hash || '');   // страница человека по нику (openPerson)
  if (u) { history.replaceState(null, '', location.pathname + location.search); return openPerson(u[1]); }
  const c = frCode(location.hash); if (!c) return; history.replaceState(null, '', location.pathname + location.search); frOpenCode(c); }
addEventListener('hashchange', frHash);
function frOpenCode(c) { fr.code = c; frSave(); frInviteGo(); }
async function frInviteGo() {
  const c = fr.code; if (!c) return;
  if (!signedIn()) return sheet(`<div class="sh-head"><h3>Приглашение в друзья</h3><button class="ic" data-act="close" aria-label="Закрыть">${I(IC.x, 18)}</button></div>
    <p class="set-note">Вас позвали в друзья в ${APP_NAME}. Войдите в аккаунт — и приглашение откроется само.</p>
    <button class="btn pri" style="width:100%" data-act="login">Войти</button>`);
  if (!S.settings.fr) return openFrSet(true);
  let r;
  try { const j = await frRpc('friend_invite_peek', { p_code: c }); r = Array.isArray(j) && j[0]; }
  catch (e) { return toast(frNoSql(e) ? 'Друзья ещё не включены на сервере' : cloudErrText(e)); }
  if (!r || r.rel === 'me' || r.rel === 'ok') { fr.code = ''; frSave(); return toast(!r ? 'Приглашение больше не действует — попросите у друга новую ссылку' : r.rel === 'me' ? 'Это ваша ссылка — отправьте её другу' : 'Вы уже друзья'); }
  const f = { name: String(r.name || '').slice(0, 40), nick: FR_NICK.test(r.nick || '') ? r.nick : '', ava: frAvaOk(r.ava) };
  sheet(`<div class="sh-head"><h3>Добавить в друзья?</h3><button class="ic" data-act="frnot" aria-label="Закрыть">${I(IC.x, 18)}</button></div>
  <div class="fr-row">${frWhoHTML(f)}</div>
  <p class="set-note">Вы будете видеть календари друг друга (то, что каждый разрешил) и соревноваться в таблице недели.</p>
  <div class="sh-foot"><button class="btn" data-act="frnot">Не сейчас</button><button class="btn pri" data-act="frjoin">Добавить</button></div>`);
}
ACT.frnot = () => { fr.code = ''; frSave(); closeSheet(); };
ACT.frjoin = async () => {
  const c = fr.code; fr.code = ''; frSave(); closeSheet();
  try { const r = await frRpc('friend_invite_use', { p_code: c }); toast(FR_ADD_MSG[r] || 'Готово'); } catch (e) { toast(cloudErrText(e)); }
  frLoad(true);
};

// ---- Своя карточка и что видят друзья ----
let frSet = null;   // { nick, lv: { id календаря: уровень }, err, busy, inv, first — карточки ещё не было }
function openFrSet(invite) {
  if (!signedIn()) return ACT.login();
  if (!frSet) frSet = { nick: fr.nick || S.settings.nick || '', lv: Object.fromEntries(S.cats.map(c => [c.id, frLvl(c)])), err: '', inv: !!invite, first: !S.settings.fr, show: Object.assign({}, S.settings.frShow), pub: Object.assign({}, S.settings.pub), push: S.settings.frPush !== false, mpush: S.settings.msgPush !== false, bpush: S.settings.bdPush !== false };
  const st = frSet, first = st.first;
  sheet(`<div class="sh-head"><h3>${first ? 'Карточка для друзей' : 'Друзья: настройки'}</h3><button class="ic" data-act="close" aria-label="Закрыть">${I(IC.x, 18)}</button></div>
  ${st.inv ? '<p class="set-note">Вас позвали в друзья. Создайте карточку — и приглашение откроется само.</p>' : ''}
  <div class="fr-row fr-mecard">${frAva({ name: S.settings.name, ava: S.settings.avatar || {} }, 40)}<span class="fr-who-t"><b>${esc((S.settings.name || '').trim() || 'Без имени')}</b><small>Имя и значок — из профиля; фото друзья не видят</small></span></div>
  <div class="frow"><span class="fl">Ник</span><input id="fr_nick" class="fin" data-nchk="nick" value="${esc(st.nick)}" placeholder="например, anna.k" maxlength="24" autocapitalize="off" autocomplete="off" spellcheck="false"></div>
  <p class="set-note">По нику друзья найдут вас в приложении. Латинские буквы, цифры, точка и _, от 3 знаков. Без ника — только по ссылке-приглашению.</p>
  <div class="set-sec">Что видят друзья ${hint('«Скрыт» — календаря друзья не видят совсем. «Только занят» — видят, когда вы заняты, без названий. «Всё» — названия и время. Показываются события на 2 месяца вперёд; задачи без времени, заметки, места, деньги и самочувствие друзья не видят никогда.', 'Что видят друзья')}</div>
  ${S.cats.map(c => `<div class="fr-lv"><span class="fr-lv-n"><i style="--c:${safeColor(c.color)}"></i>${esc(c.name)}</span><div class="seg2" role="group" aria-label="${esc(c.name)}: что видят друзья">${FR_LVL.map(([v, n]) => `<button class="${st.lv[c.id] === v ? 'on' : ''}" data-act="frlv" data-c="${esc(c.id)}" data-v="${v}" aria-pressed="${st.lv[c.id] === v}">${n}</button>`).join('')}</div></div>`).join('')}
  <div class="set-sec">Из профиля</div>
  ${FR_SHOW.map(([k, n]) => `<div class="set-row"><span>${n}</span><input id="frsh_${k}" class="sw" type="checkbox"${st.show[k] ? ' checked' : ''}></div>`).join('')}
  <div class="set-sec">Видно всем по нику ${hint('Кто вошёл в ' + APP_NAME + ' и найдёт вас по нику или откроет ссылку на вашу страницу, всегда видит ник, имя, значок, рамку и обложку. Отмеченное ниже — тоже. Календарь, день рождения и город всем не показываются никогда.', 'Что видно всем')}</div>
  ${FR_PUB.map(([k, n]) => `<div class="set-row"><span>${n}${k === 'about' ? '<small>откроется и друзьям</small>' : ''}</span><input id="frpub_${k}" class="sw" type="checkbox"${st.pub[k] ? ' checked' : ''}></div>`).join('')}
  <div class="set-sec">Уведомления</div>
  <div class="set-row"><span>Пуш о заявках в друзья</span><input id="frpush" class="sw" type="checkbox"${st.push ? ' checked' : ''}></div>
  <div class="set-row"><span>Пуш о сообщениях друзей</span><input id="msgpush" class="sw" type="checkbox"${st.mpush ? ' checked' : ''}></div>
  <div class="set-row"><span>Пуш о днях рождения друзей<small>утром в день рождения, если друг открыл его друзьям</small></span><input id="bdpush" class="sw" type="checkbox"${st.bpush ? ' checked' : ''}></div>
  <p class="set-note">Ещё друзья видят только числа: задачи и отметки привычек за неделю и за всё время, серию и полученные достижения.</p>
  <p class="fr-err" id="fr_err" aria-live="polite">${esc(st.err)}</p>
  ${first ? '' : `<div class="fr-more"><button class="btn" data-act="frinvnew">Новая ссылка-приглашение</button><button class="btn dng" data-act="froff">Удалить карточку</button></div>`}
  <div class="sh-foot"><button class="btn pri" data-act="frsave"${st.busy ? ' disabled' : ''}>${st.busy ? 'Сохраняю…' : first ? 'Создать карточку' : 'Сохранить'}</button></div>`, true);
}
ACT.frset = () => { frSet = null; openFrSet(); };
const frSetRead = () => { const i = $('#fr_nick'), p = $('#frpush'), mp = $('#msgpush'), bp = $('#bdpush'); if (i) frSet.nick = i.value; if (p) frSet.push = p.checked; if (mp) frSet.mpush = mp.checked; if (bp) frSet.bpush = bp.checked; FR_SHOW.forEach(([k]) => { const c = $('#frsh_' + k); if (c) frSet.show[k] = c.checked; }); FR_PUB.forEach(([k]) => { const c = $('#frpub_' + k); if (c) frSet.pub[k] = c.checked; }); };
ACT.frlv = el => { frSetRead(); frSet.lv[el.dataset.c] = el.dataset.v; shDirty = true; openFrSet(); };
ACT.frsave = async () => {
  const st = frSet; if (!st || st.busy) return;
  frSetRead();
  const i = $('#fr_nick'), nick = (i ? i.value : st.nick).trim().replace(/^@/, '').toLowerCase();
  st.nick = nick; st.err = '';
  if (nick && !FR_NICK.test(nick)) st.err = 'Ник — от 3 до 24 знаков: латинские буквы, цифры, точка и _';
  else if (nick && nameBadMsg(nick, true)) st.err = nameBadMsg(nick, true);
  if (st.err) return openFrSet();
  const was = !st.first;
  snap(); S.cats.forEach(c => { const v = st.lv[c.id]; if (v === 'busy') delete c.fr; else if (v) c.fr = v; });
  if (st.pub.about) st.show.about = true;   // «Обо мне» всем — значит, и друзьям
  const pb = {}; FR_PUB.forEach(([k]) => { if (st.pub[k]) pb[k] = 1; }); if (Object.keys(pb).length) S.settings.pub = pb; else delete S.settings.pub;
  const sh = {}; FR_SHOW.forEach(([k]) => { if (st.show[k]) sh[k] = 1; }); if (Object.keys(sh).length) S.settings.frShow = sh; else delete S.settings.frShow;
  if (st.push) delete S.settings.frPush; else S.settings.frPush = false;   // пуш о заявках — по умолчанию включён (сервер: reminders)
  if (st.mpush) delete S.settings.msgPush; else S.settings.msgPush = false;   // пуш о сообщениях друзей — тоже (reminders: msgPushes)
  if (st.bpush) delete S.settings.bdPush; else S.settings.bdPush = false;   // пуш о днях рождения друзей — тоже (reminders: bdayPushes)
  S.settings.fr = 1; save();
  st.busy = true; openFrSet();
  const res = await frPublish(nick);
  st.busy = false;
  if (res === 'bad' || res === 'taken') { st.err = FR_NICK_MSG[res]; return openFrSet(); }
  if (res) { st.err = res === 'nosql' ? 'Друзья ещё не включены на сервере — попробуйте позже.' : res; if (!was) { S.settings.fr = 0; save(); } return openFrSet(); }
  if (nick) S.settings.nick = nick; save();
  frSet = null; shDirty = false; closeSheet(); render();
  toast(was ? 'Сохранено' : 'Карточка создана — теперь можно звать друзей');
  frLoad(true); if (fr.code) frInviteGo();
};
ACT.frinvnew = async () => {
  try { const j = await frRpc('invite_new', {}); if (/^[0-9a-f]{32}$/.test(j || '')) { fr.invite = j; frSave(); } toast('Готово: старая ссылка больше не работает'); }
  catch (e) { toast(cloudErrText(e)); }
};
ACT.froff = () => sheet(`<div class="sh-head"><h3>Удалить карточку?</h3><button class="ic" data-act="close" aria-label="Закрыть">${I(IC.x, 18)}</button></div>
  <p class="set-note">Друзья перестанут видеть ваши календари и числа недели, вас нельзя будет найти по нику. Список друзей останется: создадите карточку снова — всё вернётся.</p>
  <div class="sh-foot"><button class="btn" data-act="close">Отмена</button><button class="btn dng" data-act="froffgo">Удалить</button></div>`);
ACT.froffgo = async () => {
  try { await api(`/rest/v1/profiles?user_id=eq.${auth.uid}`, { method: 'DELETE', user: true }); } catch (e) { return toast(cloudErrText(e)); }
  S.settings.fr = 0; save(); fr.pub = ''; fr.nick = ''; fr.invite = ''; frSave(); frSet = null; closeSheet(); render(); toast('Карточка удалена');
};
// Ник поменяли в профиле: если карточка есть — сервер проверит, свободен ли он; не подошёл — возвращаем прежний
async function frNickChanged(nick, input) {
  if (!frOn() || nick === fr.nick) return;
  const res = await frPublish(nick);
  if (res === 'bad' || res === 'taken') { if (fr.nick) S.settings.nick = fr.nick; else delete S.settings.nick; save(); if (input) input.value = fr.nick; toast(FR_NICK_MSG[res]); }
}
