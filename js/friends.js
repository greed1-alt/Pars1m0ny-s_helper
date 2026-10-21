// ---- Друзья (21 октября 2026, просьба пользователя: «делаем друзей») ----
// Решения пользователя: друга добавляют по нику (он принимает заявку) или ссылкой-приглашением (кто прислал ссылку, уже согласен —
// друзья сразу); у каждого календаря свой выбор, что видят друзья: «Скрыт» / «Только занят» / «Всё» (по умолчанию «Только занят»);
// таблица недели — задачи и отметки привычек с понедельника, серия привычек.
// Сервер — supabase/sql/friends.sql: свою карточку (profiles) пишет сам человек, чужие видны только через функции и только друзьям.
// На сервер карточка уходит, только когда человек сам её создал (S.settings.fr). В «ленте» — выбранные календари на FR_DAYS дней
// вперёд (у «Только занят» — без названий) и числа недели. Задач без времени, заметок, мест, денег, самочувствия и фото там нет.
const FR_LS = 'remapp_fr', FR_DAYS = 60, FR_SHOW = 14, FR_NICK = /^[a-z0-9_.]{3,24}$/;
const FR_LVL = [['hide', 'Скрыт'], ['busy', 'Только занят'], ['all', 'Всё']];
// На устройстве (не синхронизируется): список друзей с их лентами, что уже отправлено, код приглашения, открытый друг
let fr = Object.assign({ list: [], at: 0, pub: '', nick: '', invite: '', nameOff: false, cur: '', code: '', seen: [], err: '' }, lsGet(FR_LS) || {});
const frSave = () => lsSet(FR_LS, fr);
const frLvl = c => c && (c.fr === 'hide' || c.fr === 'all') ? c.fr : 'busy';
const frOn = () => signedIn() && !!S.settings.fr;
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
  const ach = achState(profileStats());
  return { v: 1, at: t, cs, ev: ev.slice(0, 600), wk: frWeekStats(), a: ach.filter(a => a.ok).length, an: ach.length };
}
// Имя и значок — из профиля; фото не уходит (оно хранится только на устройстве)
const frBody = () => { const st = S.settings, a = st.avatar || {}; return { name: (st.name || '').trim().slice(0, 40), ava: { e: a.e || '', c: safeColor(a.c || '#6366f1') }, feed: frFeed() }; };

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
const frAvaOk = a => ({ e: a && AVA_EMOJI.includes(a.e) ? a.e : '', c: safeColor(a && a.c) });
const frRow = r => r && /^[0-9a-f-]{36}$/i.test(r.uid || '') && ['ok', 'in', 'out'].includes(r.state) ? {
  uid: r.uid, nick: FR_NICK.test(r.nick || '') ? r.nick : '', name: String(r.name || '').slice(0, 40),
  ava: frAvaOk(r.ava),
  state: r.state, feed: r.state === 'ok' ? frClean(r.feed) : null, at: Date.parse(r.updated_at || '') || 0 } : null;
// Лента друга пришла извне — всё проверяем, как присланное по ссылке (fromShared в share.js)
function frClean(f) {
  if (!f || typeof f !== 'object' || f.v !== 1) return null;
  const num = v => Math.max(0, Math.min(9999, Math.round(Number(v) || 0)));
  const cs = (Array.isArray(f.cs) ? f.cs : []).slice(0, 60).filter(c => c && typeof c === 'object')
    .map(c => ({ i: String(c.i || '').slice(0, 80), n: c.l === 'all' ? String(c.n || '').slice(0, 60) : '', c: safeColor(c.c), l: c.l === 'all' ? 'all' : 'busy' })).filter(c => c.i);
  const ids = new Map(cs.map(c => [c.i, c]));
  const ev = (Array.isArray(f.ev) ? f.ev : []).slice(0, 800).map(o => {
    const c = o && typeof o === 'object' && ids.get(String(o.c)); if (!c || !isDate(o.d)) return null;
    const e = fromShared({ t: o.t, d: o.d, s: o.s, e: o.e, r: o.r && typeof o.r === 'object' ? o.r : undefined, k: o.k });
    return { title: c.l === 'all' ? e.title : '', date: e.date, time: e.time, time2: e.time2, repeat: e.repeat, skip: e.skip, cat: c.i };
  }).filter(Boolean);
  const wk = f.wk && typeof f.wk === 'object' ? f.wk : {};
  return { at: isDate(f.at) ? f.at : '', cs, ev, wk: { w: isDate(wk.w) ? wk.w : '', t: num(wk.t), h: num(wk.h), s: num(wk.s) }, a: num(f.a), an: num(f.an) };
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
// Запуск и вход: список друзей, своя карточка, отложенное приглашение
function frStart() {
  if (!signedIn()) return;
  setTimeout(() => { frLoad(true); frSoon(1500); if (fr.code) frInviteGo(); }, 2000);
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
const frName = f => (f.name || '').trim() || (f.nick ? '@' + f.nick : 'Без имени');
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
const FR_PLACE = ['🥇', '🥈', '🥉'];
function frBoardHTML(ok) {
  const rows = frBoard(ok);
  return `<div class="fr-sec">Таблица недели ${hint('Место — по сумме за эту неделю (с понедельника): выполненные задачи и отметки привычек. Серия — дни подряд, когда выполнены все ежедневные привычки. Друзья видят только эти числа — не сами задачи и привычки.', 'Как считается таблица')}</div>
  <table class="fr-tbl"><thead><tr><th scope="col"><span class="fr-sr">Место</span></th><th scope="col">Кто</th><th scope="col">Задачи</th><th scope="col">Привычки</th><th scope="col">Серия</th></tr></thead><tbody>
  ${rows.map((r, i) => `<tr class="${r.me ? 'me' : ''}"><td class="fr-pl">${frScore(r.wk) ? FR_PLACE[i] || i + 1 : i + 1}</td>
    <th scope="row">${r.me ? `<span class="fr-who">${frAva(r, 28)}<b>${esc(r.name)}</b><small>это вы</small></span>`
      : `<button class="fr-who" data-act="fropen" data-u="${r.uid}">${frAva(r, 28)}<b>${esc(frName(r))}</b>${r.nick ? `<small>@${esc(r.nick)}</small>` : ''}</button>`}</th>
    <td>${r.wk.t}</td><td>${r.wk.h}</td><td>${r.wk.s ? plural(r.wk.s, NDAY) : '—'}</td></tr>`).join('')}
  </tbody></table>`;
}
const frWhoHTML = f => `${frAva(f, 36)}<span class="fr-who-t"><b>${esc(frName(f))}</b>${f.nick ? `<small>@${esc(f.nick)}</small>` : ''}</span>`;
function frCardHTML() {
  const head = r => `<div class="card-h"><b>${I(IC.users, 17)} Друзья</b>${r || ''}</div>`, ghost = `<div class="fr-ghost" aria-hidden="true">${[0, 1, 2, 3, 4].map(i => `<span style="--i:${i}"></span>`).join('')}</div>`;
  if (!signedIn()) return `<div class="card pf-friends">${head()}${ghost}
    <p class="hm-empty">Добавляйте друзей, смотрите их календари и соревнуйтесь за неделю. Для этого нужно войти в аккаунт.</p>
    <div class="hm-foot fr-acts"><button class="btn pri" data-act="login">Войти</button><button class="btn" data-act="invite">${I(IC.share, 15)} Пригласить в ${APP_NAME}</button></div></div>`;
  if (!S.settings.fr) return `<div class="card pf-friends">${head()}${ghost}
    <p class="hm-empty">Создайте карточку — по ней друзья найдут вас по нику или по ссылке. Что видят друзья, решаете вы: у каждого календаря — «Скрыт», «Только занят» или «Всё».</p>
    <div class="hm-foot fr-acts"><button class="btn pri" data-act="frset">${I(IC.plus, 15)} Создать карточку</button></div></div>`;
  const L = fr.list, inc = L.filter(f => f.state === 'in'), out = L.filter(f => f.state === 'out'), ok = L.filter(f => f.state === 'ok');
  const note = fr.err === 'nosql' ? 'Друзья ещё не включены на сервере — скоро заработают.' : fr.err ? fr.err : fr.nameOff ? 'Друзья не видят ваше имя: оно недоступно. Поменяйте его в профиле.' : !fr.nick ? 'У вас нет ника — найти вас можно только по ссылке-приглашению.' : '';
  return `<div class="card pf-friends">${head(`<span class="card-h-r">${fr.nick ? `<small>@${esc(fr.nick)}</small>` : ''}<button class="pill sm" data-act="frset">${I(IC.gear, 13)} Настройки</button></span>`)}
    ${note ? `<p class="set-note fr-note">${esc(note)}</p>` : ''}
    ${inc.length ? `<div class="fr-sec">Зовут в друзья</div>${inc.map(f => `<div class="fr-row">${frWhoHTML(f)}<span class="fr-btns"><button class="btn pri sm" data-act="fracc" data-u="${f.uid}">Принять</button><button class="btn sm" data-act="frrm" data-u="${f.uid}">Отклонить</button></span></div>`).join('')}` : ''}
    ${frBoardHTML(ok)}
    ${ok.length ? '' : '<p class="hm-empty">Пока здесь только вы. Добавьте друга по нику или отправьте ему ссылку-приглашение.</p>'}
    ${out.length ? `<div class="fr-sec">Ждут ответа</div>${out.map(f => `<div class="fr-row">${frWhoHTML(f)}<span class="fr-btns"><button class="btn sm" data-act="frrm" data-u="${f.uid}">Отозвать</button></span></div>`).join('')}` : ''}
    <div class="hm-foot fr-acts"><button class="btn" data-act="fradd">${I(IC.plus, 15)} Добавить по нику</button><button class="btn" data-act="invite">${I(IC.share, 15)} Пригласить по ссылке</button></div></div>`;
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
  const back = `<button class="ic pe-back" data-act="sec" data-s="profile" aria-label="Назад к профилю" title="Назад к профилю">${I(IC.left, 20)}</button>`;
  if (!f) return `<div class="pe-head">${back}<div><h2>Друг</h2></div></div><div class="card"><p class="hm-empty">Этого человека больше нет в списке друзей.</p></div>`;
  const t = todayK(), w = frWk(f), board = frBoard(fr.list.filter(x => x.state === 'ok')), place = board.findIndex(r => r.uid === f.uid) + 1, fd = f.feed;
  let days = '';
  if (fd && fd.cs.length) for (let i = 0; i < FR_SHOW; i++) { const k = addDays(t, i), rows = frDayRows(f, k); if (rows) days += `<div class="fr-day"><div class="fr-dh">${i < 2 ? relDay(k)[0].toUpperCase() + relDay(k).slice(1) + ', ' : ''}${fmtLong(k)}</div><ul class="fr-evs">${rows}</ul></div>`; }
  const tile = (label, val, sub) => `<div class="ft-t"><span>${label}</span><b>${val}</b><small>${sub}</small></div>`;
  return `<div class="pe-head">${back}<span class="fr-head">${frAva(f, 48)}<span><h2>${esc(frName(f))}</h2><small>${f.nick ? '@' + esc(f.nick) + ' · ' : ''}${f.at ? 'обновлено ' + ago(f.at) : 'ещё ничего не прислал'}</small></span></span>
    <button class="btn pf-more" data-act="frmenu" data-u="${f.uid}" aria-label="Ещё" title="Ещё">${I(IC.more, 18)}</button></div>
  <div class="pf-stats fr-stats">
    ${tile('Задачи', w.t, 'за эту неделю')}${tile('Привычки', w.h, 'отметок за неделю')}${tile('Серия', w.s ? plural(w.s, NDAY) : '—', 'привычки подряд')}${tile('Место', place + ' из ' + board.length, 'в таблице недели')}
    ${fd && fd.an ? tile('Достижения', fd.a + ' из ' + fd.an, 'получено') : ''}
  </div>
  <div class="card"><div class="card-h"><b>${I(IC.cal, 17)} Календарь на две недели</b></div>
    ${!fd || !fd.cs.length ? '<p class="hm-empty">Друг пока не открыл вам ни одного календаря.</p>' : days || '<p class="hm-empty">На ближайшие две недели ничего не запланировано.</p>'}
    ${fd && fd.cs.length ? `<p class="set-note">«Занят» — календарь, у которого друг показывает только время. Календари: ${fd.cs.map(c => `<span class="fr-cal"><i style="--c:${c.c}"></i>${c.n ? esc(c.n) : 'без названия'}</span>`).join(' ')}</p>` : ''}
  </div>`;
}
SEC.friend = { name: 'Друг', icon: IC.users, noNav: true, title: () => 'Друзья', html: frPageHTML, move: () => {} };
ACT.fropen = el => { fr.cur = el.dataset.u; frSave(); if (sec === 'friend') render(); else setSec('friend'); frLoad(true); };
ACT.frmenu = el => {
  const qc = $('#qc'), f = fr.list.find(x => x.uid === el.dataset.u); if (!f) return;
  qc.innerHTML = `<div class="pmenu"><button data-act="frrm" data-u="${f.uid}">${I(IC.x, 16)} Убрать из друзей</button><button data-act="frreload">${I(IC.down, 16)} Обновить</button></div>`;
  qc.classList.add('show', 'menu');
  const r = el.getBoundingClientRect(), w = qc.offsetWidth;
  qc.style.left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8)) + 'px'; qc.style.top = (r.bottom + 6) + 'px';
};
ACT.frreload = () => { closeQuick(); frLoad(); };

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
  if (!frSet) frSet = { nick: fr.nick || S.settings.nick || '', lv: Object.fromEntries(S.cats.map(c => [c.id, frLvl(c)])), err: '', inv: !!invite, first: !S.settings.fr };
  const st = frSet, first = st.first;
  sheet(`<div class="sh-head"><h3>${first ? 'Карточка для друзей' : 'Друзья: настройки'}</h3><button class="ic" data-act="close" aria-label="Закрыть">${I(IC.x, 18)}</button></div>
  ${st.inv ? '<p class="set-note">Вас позвали в друзья. Создайте карточку — и приглашение откроется само.</p>' : ''}
  <div class="fr-row fr-mecard">${frAva({ name: S.settings.name, ava: S.settings.avatar || {} }, 40)}<span class="fr-who-t"><b>${esc((S.settings.name || '').trim() || 'Без имени')}</b><small>Имя и значок — из профиля; фото друзья не видят</small></span></div>
  <div class="frow"><span class="fl">Ник</span><input id="fr_nick" class="fin" data-nchk="nick" value="${esc(st.nick)}" placeholder="например, anna.k" maxlength="24" autocapitalize="off" autocomplete="off" spellcheck="false"></div>
  <p class="set-note">По нику друзья найдут вас в приложении. Латинские буквы, цифры, точка и _, от 3 знаков. Без ника — только по ссылке-приглашению.</p>
  <div class="set-sec">Что видят друзья ${hint('«Скрыт» — календаря друзья не видят совсем. «Только занят» — видят, когда вы заняты, без названий. «Всё» — названия и время. Показываются события на 2 месяца вперёд; задачи без времени, заметки, места, деньги и самочувствие друзья не видят никогда.', 'Что видят друзья')}</div>
  ${S.cats.map(c => `<div class="fr-lv"><span class="fr-lv-n"><i style="--c:${safeColor(c.color)}"></i>${esc(c.name)}</span><div class="seg2" role="group" aria-label="${esc(c.name)}: что видят друзья">${FR_LVL.map(([v, n]) => `<button class="${st.lv[c.id] === v ? 'on' : ''}" data-act="frlv" data-c="${esc(c.id)}" data-v="${v}" aria-pressed="${st.lv[c.id] === v}">${n}</button>`).join('')}</div></div>`).join('')}
  <p class="set-note">В таблицу недели уходят только числа: сколько задач выполнено и сколько отметок привычек.</p>
  <p class="fr-err" id="fr_err" aria-live="polite">${esc(st.err)}</p>
  ${first ? '' : `<div class="fr-more"><button class="btn" data-act="frinvnew">Новая ссылка-приглашение</button><button class="btn dng" data-act="froff">Удалить карточку</button></div>`}
  <div class="sh-foot"><button class="btn pri" data-act="frsave"${st.busy ? ' disabled' : ''}>${st.busy ? 'Сохраняю…' : first ? 'Создать карточку' : 'Сохранить'}</button></div>`, true);
}
ACT.frset = () => { frSet = null; openFrSet(); };
ACT.frlv = el => { const i = $('#fr_nick'); if (i) frSet.nick = i.value; frSet.lv[el.dataset.c] = el.dataset.v; shDirty = true; openFrSet(); };
ACT.frsave = async () => {
  const st = frSet; if (!st || st.busy) return;
  const i = $('#fr_nick'), nick = (i ? i.value : st.nick).trim().replace(/^@/, '').toLowerCase();
  st.nick = nick; st.err = '';
  if (nick && !FR_NICK.test(nick)) st.err = 'Ник — от 3 до 24 знаков: латинские буквы, цифры, точка и _';
  else if (nick && nameBad(nick)) st.err = nameBadMsg(nick, true);
  if (st.err) return openFrSet();
  const was = !st.first;
  snap(); S.cats.forEach(c => { const v = st.lv[c.id]; if (v === 'busy') delete c.fr; else if (v) c.fr = v; });
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
