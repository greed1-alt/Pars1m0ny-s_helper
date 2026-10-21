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
  return { v: 1, at: t, cs, ev: ev.slice(0, 600), wk: frWeekStats(), me, tot: { t: s.tasksDone, h: s.marks, b: s.best, d: s.days, s: isDate(st.since) ? st.since : '' }, ach: got.map(a => a.n), a: got.length, an: ACH.length };
}
// Имя и значок — из профиля; фото не уходит (оно хранится только на устройстве)
const frBody = () => { const st = S.settings, a = st.avatar || {}; const cv = st.cover || {};
  return { name: (st.name || '').trim().slice(0, 40), ava: { e: a.e || '', c: safeColor(a.c || '#6366f1'), cv: okImg(cv.img) ? '' : cv.p || '' }, feed: frFeed() }; };

// ---- Сервер ----
const frNickErr = e => /nick_bad/.test(e && e.message || '') ? 'bad' : e && e.code === '23505' && /nick/.test(e.message || '') ? 'taken' : '';   // занят именно ник, а не строка
const FR_NICK_MSG = { bad: 'Такой ник недоступен', taken: 'Этот ник уже занят — придумайте другой' };
const frNoSql = e => e && (e.status === 404 || e.code === 'PGRST202' || e.code === '42P01' || e.code === 'PGRST205');
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
// Значок — только из набора профиля (AVA_EMOJI): другого приложение не позволяет выбрать
const frAvaOk = a => ({ e: a && AVA_EMOJI.includes(a.e) ? a.e : '', c: safeColor(a && a.c), cv: a && typeof a.cv === 'string' && Object.hasOwn(COVERS, a.cv) ? a.cv : '' });   // обложка — только из набора
const frRow = r => r && /^[0-9a-f-]{36}$/i.test(r.uid || '') && ['ok', 'in', 'out'].includes(r.state) ? {
  uid: r.uid, nick: FR_NICK.test(r.nick || '') ? r.nick : '', name: String(r.name || '').slice(0, 40),
  ava: frAvaOk(r.ava),
  state: r.state, feed: r.state === 'ok' ? frClean(r.feed) : null, at: Date.parse(r.updated_at || '') || 0, since: Date.parse(r.since || '') || 0 } : null;
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
  return { at: isDate(f.at) ? f.at : '', cs, ev, wk: { w: isDate(wk.w) ? wk.w : '', t: num(wk.t), h: num(wk.h), s: num(wk.s) },
    me: { m: str(me.m, 90), ab: str(me.ab, 600), bd: /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(me.bd || '') ? me.bd : '', city: str(me.city, 80) },
    // s — с какого дня в приложении; в карточках до 21 октября его нет — считаем по числу дней от даты ленты
    tot: { t: num(tot.t, 999999), h: num(tot.h, 999999), b: num(tot.b), d: num(tot.d, 99999), s: isDate(tot.s) ? tot.s : isDate(f.at) && num(tot.d, 99999) ? addDays(f.at, 1 - num(tot.d, 99999)) : '' },
    ach: (Array.isArray(f.ach) ? f.ach : []).filter(n => typeof n === 'string' && ACH.some(a => a[1] === n)).slice(0, ACH.length), a: num(f.a), an: num(f.an) };
}
async function frLoad(quiet) {
  if (!signedIn()) return;
  try {
    const j = await api('/rest/v1/rpc/friends_list', { method: 'POST', user: true, body: {} });
    fr.list = (Array.isArray(j) ? j : []).map(frRow).filter(Boolean); fr.at = Date.now(); if (fr.err === 'nosql') fr.err = '';
    frSave(); frNotify();
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
// Запуск и вход: админ ли, список друзей, своя карточка, отложенное приглашение
function frStart() {
  if (!signedIn()) return;
  setTimeout(() => { frAdmin(); frLoad(true); frSoon(1500); if (fr.code) frInviteGo(); }, 2000);
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
  const a = f.ava || {}, n = initials(f.name);
  return `<span class="ava${a.e ? ' em' : ''}" style="--c:${safeColor(a.c)};--s:${size}px" aria-hidden="true">${a.e ? esc(a.e) : n ? esc(n) : I(IC.user, Math.round(size * .55))}</span>`;
}
const frMe = () => ({ me: true, name: S.settings.name || 'Вы', ava: { e: (S.settings.avatar || {}).e, c: (S.settings.avatar || {}).c }, wk: frWeekStats() });
// Числа друга за эту неделю: лента не обновлялась с прошлой недели — нули; серия — если заходил вчера или сегодня
function frWk(f) {
  const t = todayK(), w = f.feed && f.feed.wk || {}, cur = w.w === frMonday(t), live = f.feed && f.feed.at >= addDays(t, -1);
  return { t: cur ? w.t : 0, h: cur ? w.h : 0, s: live ? w.s : 0 };
}
const frScore = w => w.t + w.h;
function frBoard(ok) { return [frMe(), ...ok.map(f => Object.assign({ wk: frWk(f) }, f))].sort((a, b) => frScore(b.wk) - frScore(a.wk) || b.wk.s - a.wk.s || (a.me ? -1 : b.me ? 1 : 0)); }
// ---- Лидеры (просьба пользователя: «добавь список лидеров и сделай все более привлекательным») ----
// Вкладки: неделя (очки = задачи + отметки привычек), задачи, привычки, серия, за всё время. Трое первых — на пьедестале, остальные — списком с полоской
const FR_PTS = ['очко', 'очка', 'очков'], FR_TSK = ['задача', 'задачи', 'задач'], FR_MRK = ['отметка', 'отметки', 'отметок'];
const FR_BOARDS = [
  ['week', 'Неделя', r => frScore(r.wk), FR_PTS, 'Очки с понедельника: выполненные задачи и отметки привычек'],
  ['tasks', 'Задачи', r => r.wk.t, FR_TSK, 'Выполненные задачи с понедельника'],
  ['habits', 'Привычки', r => r.wk.h, FR_MRK, 'Отметки привычек с понедельника'],
  ['streak', 'Серия', r => r.wk.s, NDAY, 'Дни подряд, когда выполнены все ежедневные привычки'],
  ['all', 'За всё время', r => r.tot.t + r.tot.h, FR_PTS, 'Все выполненные задачи и отметки привычек'],
];
let frLb = 'week';
function frRank(key) {
  const b = FR_BOARDS.find(x => x[0] === key) || FR_BOARDS[0], s = profileStats();
  const all = [Object.assign(frMe(), { tot: { t: s.tasksDone, h: s.marks } }),
    ...fr.list.filter(f => f.state === 'ok').map(f => Object.assign({ wk: frWk(f), tot: f.feed ? f.feed.tot : { t: 0, h: 0 } }, f))];
  return all.map(p => Object.assign({ v: b[2](p) }, p)).sort((a, c) => c.v - a.v || (a.me ? -1 : c.me ? 1 : 0));
}
const frWho = r => r.me ? (S.settings.name || '').trim() || 'Вы' : frName(r);
const FR_MEDAL = ['👑', '🥈', '🥉'];
function frPodium(rows, unit, small) {
  const top = rows.slice(0, 3);
  return `<div class="frl-pod${small ? ' sm' : ''}">${[1, 0, 2].filter(i => top[i]).map(i => {
    const r = top[i], inner = `<span class="frl-medal" aria-hidden="true">${FR_MEDAL[i]}</span><span class="frl-ring">${frAva(r, i ? (small ? 44 : 56) : (small ? 56 : 72))}</span><b>${esc(frWho(r))}</b>${r.me ? '<em class="frl-you">вы</em>' : ''}<small>${plural(r.v, unit)}</small>`;
    return `<div class="frl-p p${i + 1}">${r.me ? `<div class="frl-pc">${inner}</div>` : `<button class="frl-pc" data-act="fropen" data-u="${r.uid}">${inner}</button>`}<div class="frl-step" aria-hidden="true">${i + 1}</div></div>`;
  }).join('')}</div>`;
}
function frLeadersHTML() {
  const b = FR_BOARDS.find(x => x[0] === frLb) || FR_BOARDS[0], rows = frRank(b[0]), mi = rows.findIndex(r => r.me), max = Math.max(1, ...rows.map(r => r.v));
  const left = 6 - dowIdx(todayK()), back = `<button class="ic pe-back" data-act="sec" data-s="profile" aria-label="Назад к профилю" title="Назад к профилю">${I(IC.left, 20)}</button>`;
  const goal = rows.length < 2 ? '' : mi === 0 ? (rows[0].v ? 'Вы на первом месте — так держать!' : 'Пока у всех поровну — сделайте первый шаг') : `До ${mi}-го места — ${plural(rows[mi - 1].v - rows[mi].v + 1, b[3])}`;
  return `<div class="pe-head">${back}<div><h2>Лидеры</h2><small>Вы и ${plural(rows.length - 1, ['друг', 'друга', 'друзей'])}</small></div></div>
  <div class="frl-tabs" role="group" aria-label="Что сравнивать">${FR_BOARDS.map(([k, n]) => `<button class="${k === b[0] ? 'on' : ''}" aria-pressed="${k === b[0]}" data-act="frlb" data-k="${k}">${n}</button>`).join('')}</div>
  <div class="card frl-card">
    <p class="frl-what">${b[4]}${b[0] === 'all' ? '' : ' · ' + (left ? 'до конца недели ' + plural(left, NDAY) : 'последний день недели')}</p>
    ${rows.length < 2 ? `<div class="frl-empty"><span aria-hidden="true">🏆</span><b>Соревноваться пока не с кем</b><p>Позовите друзей — и здесь появится пьедестал.</p><div class="fr-acts"><button class="btn pri" data-act="fradd">${I(IC.plus, 15)} Добавить по нику</button><button class="btn" data-act="invite">${I(IC.share, 15)} Пригласить по ссылке</button></div></div>`
      : frPodium(rows, b[3]) + `<p class="frl-goal">${goal}</p>`}
    ${rows.length > 3 ? `<ol class="frl-list" start="4">${rows.slice(3).map((r, i) => `<li class="${r.me ? 'me' : ''}">${r.me ? '<div class="frl-row">' : `<button class="frl-row" data-act="fropen" data-u="${r.uid}">`}<span class="frl-n">${i + 4}</span>${frAva(r, 36)}<span class="frl-who"><b>${esc(frWho(r))}${r.me ? '<em>вы</em>' : ''}</b><span class="frl-bar" aria-hidden="true"><i style="width:${Math.round(r.v / max * 100)}%"></i></span></span><span class="frl-v">${plural(r.v, b[3])}</span>${r.me ? '</div>' : '</button>'}</li>`).join('')}</ol>` : ''}
  </div>`;
}
SEC.leaders = { name: 'Лидеры', icon: IC.trophy, noNav: true, title: () => 'Лидеры', html: frLeadersHTML, move: () => {} };
ACT.frleaders = () => { setSec('leaders'); frLoad(true); };
ACT.frlb = el => { frLb = el.dataset.k; render(); };

const frWhoHTML = f => `${frAva(f, 36)}<span class="fr-who-t"><b>${esc(frName(f))}</b>${f.nick ? `<small>@${esc(f.nick)}</small>` : ''}</span>`;
function frCardHTML() {
  const head = r => `<div class="card-h"><b>${I(IC.users, 17)} Друзья</b>${r || ''}</div>`, ghost = `<div class="fr-ghost" aria-hidden="true">${[0, 1, 2, 3, 4].map(i => `<span style="--i:${i}"></span>`).join('')}</div>`;
  if (!signedIn()) return `<div class="card pf-friends">${head()}<div class="fr-emptyb">${ghost}<b>Вместе — интереснее</b><p>Добавляйте друзей, смотрите их календари и соревнуйтесь за неделю. Для этого нужно войти в аккаунт.</p></div>
    <div class="fr-acts"><button class="btn pri" data-act="login">Войти</button><button class="btn" data-act="invite">${I(IC.share, 15)} Пригласить в ${APP_NAME}</button></div></div>`;
  if (!S.settings.fr) return `<div class="card pf-friends">${head()}<div class="fr-emptyb">${ghost}<b>Вместе — интереснее</b><p>Создайте карточку — по ней друзья найдут вас по нику или по ссылке. Что видят друзья, решаете вы: у каждого календаря — «Скрыт», «Только занят» или «Всё».</p></div>
    <div class="fr-acts"><button class="btn pri" data-act="frset">${I(IC.plus, 15)} Создать карточку</button></div></div>`;
  const L = fr.list, inc = L.filter(f => f.state === 'in'), out = L.filter(f => f.state === 'out'), ok = L.filter(f => f.state === 'ok');
  const note = fr.err === 'nosql' ? 'Друзья ещё не включены на сервере — скоро заработают.' : fr.err ? fr.err : fr.nameOff ? 'Друзья не видят ваше имя: оно недоступно. Поменяйте его в профиле.' : !fr.nick ? 'У вас нет ника — найти вас можно только по ссылке-приглашению.' : '';
  const rows = frRank('week'), onPod = new Set(rows.slice(0, 3).map(r => r.uid)), rest = ok.filter(f => !onPod.has(f.uid));
  return `<div class="card pf-friends">${head(`<span class="card-h-r">${fr.nick ? `<small>@${esc(fr.nick)}</small>` : ''}<button class="pill sm" data-act="frset">${I(IC.gear, 13)} Настройки</button></span>`)}
    ${note ? `<p class="set-note fr-note">${esc(note)}</p>` : ''}
    ${inc.length ? `<div class="fr-inbox"><div class="fr-sec">Вас зовут в друзья</div>${inc.map(f => `<div class="fr-row">${frWhoHTML(f)}<span class="fr-btns"><button class="btn pri sm" data-act="fracc" data-u="${f.uid}">Принять</button><button class="btn sm" data-act="frrm" data-u="${f.uid}">Отклонить</button></span></div>`).join('')}</div>` : ''}
    ${ok.length ? `<div class="fr-sec">Лидеры недели ${hint('Очки с понедельника: выполненные задачи и отметки привычек. Друзья видят только эти числа — не сами задачи и привычки.', 'Как считаются очки')}</div>
      ${frPodium(rows, FR_PTS, true)}
      <button class="btn frl-all" data-act="frleaders">${I(IC.trophy, 15)} Все лидеры</button>
      ${rest.length ? `<div class="fr-sec">Ещё друзья</div><div class="fr-strip">${rest.map(f => `<button class="fr-chip" data-act="fropen" data-u="${f.uid}">${frAva(f, 48)}<span>${esc(frName(f))}</span></button>`).join('')}</div>` : ''}`
      : `<div class="fr-emptyb">${ghost}<b>Пока здесь только вы</b><p>Добавьте друга по нику или отправьте ему ссылку-приглашение — и начнётся соревнование.</p></div>`}
    ${out.length ? `<div class="fr-sec">Ждут ответа</div>${out.map(f => `<div class="fr-row">${frWhoHTML(f)}<span class="fr-btns"><button class="btn sm" data-act="frrm" data-u="${f.uid}">Отозвать</button></span></div>`).join('')}` : ''}
    <div class="fr-acts"><button class="btn" data-act="fradd">${I(IC.plus, 15)} Добавить по нику</button><button class="btn" data-act="invite">${I(IC.share, 15)} Пригласить по ссылке</button></div></div>`;
}

// ---- Страница друга ----
function frDayRows(f, k) {
  const cs = new Map(f.feed.cs.map(c => [c.i, c]));
  return f.feed.ev.filter(e => occurs(e, k)).sort((a, b) => (a.time || '').localeCompare(b.time || '')).map(e => {
    const c = cs.get(e.cat) || {}, when = e.time ? e.time + (e.time2 ? '–' + e.time2 : '') : 'Весь день';
    return `<li class="fr-ev${e.title ? '' : ' busy'}"><span class="fr-t">${when}</span><i style="--c:${c.c}"></i><span class="fr-ev-t"><b>${e.title ? esc(e.title) : 'Занят'}</b>${c.n ? `<small>${esc(c.n)}</small>` : ''}</span></li>`;
  }).join('');
}
function frPageHTML() {
  const f = fr.list.find(x => x.uid === fr.cur && x.state === 'ok');
  if (!f) return `<div class="pe-head"><button class="ic pe-back" data-act="sec" data-s="profile" aria-label="Назад к профилю" title="Назад к профилю">${I(IC.left, 20)}</button><div><h2>Друг</h2></div></div><div class="card"><p class="hm-empty">Этого человека больше нет в списке друзей.</p></div>`;
  const t = todayK(), w = frWk(f), board = frBoard(fr.list.filter(x => x.state === 'ok')), place = board.findIndex(r => r.uid === f.uid) + 1, fd = f.feed;
  const note = frNote(f.uid), rel = FR_REL.find(r => r[0] === note.r), since = f.since ? new Date(f.since) : null;
  let days = '';
  if (fd && fd.cs.length) for (let i = 0; i < FR_DAYN; i++) { const k = addDays(t, i), rows = frDayRows(f, k); if (rows) days += `<div class="fr-day"><div class="fr-dh">${i < 2 ? relDay(k)[0].toUpperCase() + relDay(k).slice(1) + ', ' : ''}${fmtLong(k)}</div><ul class="fr-evs">${rows}</ul></div>`; }
  const st = (label, val, sub, c, ic) => `<div class="frp-t" style="--c:${c}"><span class="frp-ic" aria-hidden="true">${ic}</span><span><b>${val}</b><span>${label}</span><small>${sub}</small></span></div>`;
  const me = fd ? fd.me : null, bd = me && me.bd ? bdayInfo('2000-' + me.bd) : null;
  const about = me && (me.m || me.ab || bd || me.city) ? `<div class="card frp-about"><div class="card-h"><b>Обо мне</b></div>
    ${me.m ? `<p class="frp-motto">${esc(me.m)}</p>` : ''}${me.ab ? `<p class="pf-about-t">${esc(me.ab)}</p>` : ''}
    <ul class="pf-det">${bd ? `<li>${I(IC.gift, 16)}<span>День рождения — ${bd.d.getDate()} ${MONG[bd.d.getMonth()]}${bd.days === 0 ? ' · сегодня! 🎉' : bd.days <= 30 ? ' · через ' + plural(bd.days, NDAY) : ''}</span></li>` : ''}${me.city ? `<li>${I(IC.globe, 16)}<span>${esc(me.city)}</span></li>` : ''}</ul></div>` : '';
  const tot = fd && fd.tot, row = (n, v) => `<li><span>${n}</span><b>${v}</b></li>`;
  const ach = fd ? ACH.filter(a => fd.ach.includes(a[1])) : [];
  return `<div class="card pf-card frp-card">
    <div class="pf-cover" style="background-image:${COVER_GLOW},${COVERS[f.ava.cv] || COVERS.dusk}"><button class="frp-back" data-act="sec" data-s="profile" aria-label="Назад к профилю" title="Назад к профилю">${I(IC.left, 18)}</button></div>
    <div class="pf-bar">
      <span class="pf-ava">${frAva(f, 104)}</span>
      <div class="pf-who"><h2 class="pf-nm">${esc(frName(f))}</h2>
        <div class="pf-tags">${note.n ? `<span class="pf-nick">${esc(frReal(f))}</span>` : ''}${f.nick && (!note.n || f.name) ? `<span class="pf-nick">@${esc(f.nick)}</span>` : ''}${rel ? `<span class="frp-rel">${rel[1]} ${rel[2]}</span>` : ''}</div>
        <small class="frp-since">${since ? 'В друзьях с ' + since.getDate() + ' ' + MONG[since.getMonth()] + ' ' + since.getFullYear() : 'В друзьях'}${f.at ? ' · обновлено ' + ago(f.at) : ''}</small>
      </div>
      <div class="pf-acts"><span class="frp-ok">${I(IC.check, 15)} В друзьях</span><button class="btn" data-act="frnotes" data-u="${f.uid}">${I(IC.edit, 15)} Пометки</button><button class="btn pf-more" data-act="frmenu" data-u="${f.uid}" aria-label="Ещё" title="Ещё">${I(IC.more, 18)}</button></div>
    </div>
  </div>
  ${!fd ? '<div class="card"><p class="hm-empty">Пока пусто — числа и календарь появятся, когда друг откроет приложение.</p></div>' : `<div class="frp-cols">
    <div class="frp-col">
      <div class="card frp-week"><div class="card-h"><b>Эта неделя ${hint('С понедельника: выполненные задачи и отметки привычек. Серия — дни подряд, когда выполнены все ежедневные привычки. Место — в таблице недели среди ваших друзей.', 'Как считается неделя')}</b></div>
        <div class="frp-st">${st('Задачи', w.t, 'выполнено', 'var(--c-blue)', I(IC.check, 18))}${st('Привычки', w.h, 'отметок', 'var(--c-green)', I(IC.spark, 18))}${st('Серия', w.s ? plural(w.s, NDAY) : '—', 'привычки подряд', 'var(--c-orange)', '🔥')}${st('Место', place + ' из ' + board.length, 'среди друзей', 'var(--c-violet)', I(IC.trophy, 18))}</div></div>
      <div class="card frp-cal"><div class="card-h"><b>${I(IC.cal, 17)} Календарь на две недели</b></div>
        ${!fd.cs.length ? '<p class="hm-empty">Друг пока не открыл вам ни одного календаря.</p>' : days || '<p class="hm-empty">На ближайшие две недели ничего не запланировано.</p>'}
        ${fd.cs.length ? `<p class="set-note">«Занят» — календарь, у которого друг показывает только время. Календари: ${fd.cs.map(c => `<span class="fr-cal"><i style="--c:${c.c}"></i>${c.n ? esc(c.n) : 'без названия'}</span>`).join(' ')}</p>` : ''}
      </div>
    </div>
    <div class="frp-col">
      ${note.t ? `<div class="card frp-mine"><div class="card-h"><b>${I(IC.lock, 16)} Не забыть</b><button class="pill sm" data-act="frnotes" data-u="${f.uid}">${I(IC.edit, 13)} Изменить</button></div><p class="pf-about-t">${esc(note.t)}</p><small class="frp-lock">Видите только вы</small></div>` : ''}
      ${about}
      <div class="card frp-tot-c"><div class="card-h"><b>За всё время</b></div>
        <ul class="frp-tot">${row('Задач выполнено', NF0.format(tot.t))}${row('Отметок привычек', NF0.format(tot.h))}${row('Лучшая серия', tot.b ? plural(tot.b, NDAY) : '—')}${row('В ' + APP_NAME + ' с', tot.s ? pd(tot.s).getDate() + ' ' + MONG[pd(tot.s).getMonth()] + ' ' + tot.s.slice(0, 4) : '—')}</ul></div>
      <div class="card frp-ach-c"><div class="card-h"><b>${I(IC.trophy, 17)} Достижения</b><span class="card-h-r"><small>${ach.length} из ${ACH.length}</small>${ach.length ? `<button class="pill sm" data-act="frach" data-u="${f.uid}">Все →</button>` : ''}</span></div>
        ${ach.length ? `<div class="frp-ach">${ach.map(a => `<span class="frp-b" title="${esc(a[1])}" role="img" aria-label="${esc(a[1])}">${a[0]}</span>`).join('')}</div>` : '<p class="hm-empty">Пока ни одного — всё впереди.</p>'}</div>
    </div>
  </div>`}`;
}
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
  ${frFound ? r ? `<div class="fr-found"><div class="fr-row">${frWhoHTML({ name: r.name, nick: r.nick, ava: frAvaOk(r.ava) })}</div>
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
function frHash() { const c = frCode(location.hash); if (!c) return; history.replaceState(null, '', location.pathname + location.search); frOpenCode(c); }
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
  if (!frSet) frSet = { nick: fr.nick || S.settings.nick || '', lv: Object.fromEntries(S.cats.map(c => [c.id, frLvl(c)])), err: '', inv: !!invite, first: !S.settings.fr, show: Object.assign({}, S.settings.frShow) };
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
  <p class="set-note">Ещё друзья видят только числа: задачи и отметки привычек за неделю и за всё время, серию и полученные достижения.</p>
  <p class="fr-err" id="fr_err" aria-live="polite">${esc(st.err)}</p>
  ${first ? '' : `<div class="fr-more"><button class="btn" data-act="frinvnew">Новая ссылка-приглашение</button><button class="btn dng" data-act="froff">Удалить карточку</button></div>`}
  <div class="sh-foot"><button class="btn pri" data-act="frsave"${st.busy ? ' disabled' : ''}>${st.busy ? 'Сохраняю…' : first ? 'Создать карточку' : 'Сохранить'}</button></div>`, true);
}
ACT.frset = () => { frSet = null; openFrSet(); };
const frSetRead = () => { const i = $('#fr_nick'); if (i) frSet.nick = i.value; FR_SHOW.forEach(([k]) => { const c = $('#frsh_' + k); if (c) frSet.show[k] = c.checked; }); };
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
  const sh = {}; FR_SHOW.forEach(([k]) => { if (st.show[k]) sh[k] = 1; }); if (Object.keys(sh).length) S.settings.frShow = sh; else delete S.settings.frShow;
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
