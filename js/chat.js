// ---- Переписка с друзьями (23 октября 2026; просьба пользователя: «добавь пожалуйста возможность вести переписку с друзьями») ----
// Выбор пользователя: текст, событие из календаря (друг добавляет его к себе одним нажатием) и реакции; пуш о новом — сразу (с 27 октября 2026: база вызывает функцию reminders при записи в очередь, supabase/sql/push_now.sql; раньше — до минуты)
// (функция reminders); кнопка в шапке с числом новых; хранится всегда, своё можно удалить у обоих. Сервер — supabase/sql/messages.sql
// (функции msg_*: писать можно только другу, переписку видят только двое). Окно — как чат помощника (на телефоне на весь экран):
// список переписок → переписка с другом. Пока переписка открыта, новое подтягивается раз в 4 с, список — раз в 15 с;
// число новых в шапке — раз в минуту и при возвращении в приложение (новое от друга вне окна — тост)
const MSG_MAX = 2000, MSG_REACT = ['❤️', '👍', '😂', '😮', '🔥'], MSG_POLL = 4000, MSG_LIST_POLL = 15000, MSG_PAGE = 50;
let mc = null, mcT = 0, msgUnread = 0, msgThreads = null, msgErr = '', msgWant = '';   // mc — открытое окно; msgWant — открыть, когда загрузятся друзья
const msgFriends = () => fr.list.filter(f => f.state === 'ok');
const msgOn = () => signedIn() && msgFriends().length > 0 && msgErr !== 'nosql';
const msgPeer = () => mc && mc.peer ? msgFriends().find(f => f.uid === mc.peer) : null;
const MSG_UID = /^[0-9a-f-]{36}$/i, MSG_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const msgHM = at => { const d = new Date(at); return isNaN(d) ? '' : String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
const msgDay = at => { const d = new Date(at); return isNaN(d) ? todayK() : ds(d); };
const msgWhen = at => { const k = msgDay(at), t = todayK(); return k === t ? msgHM(at) : k === addDays(t, -1) ? 'вчера' : shortDate(k); };
const msgErrText = e => { const m = String(e && e.message || '');
  return m === 'rate' ? 'Слишком часто — подождите минуту' : m === 'notfriend' ? 'Вы больше не друзья — написать нельзя' : m === 'long' ? 'Сообщение длиннее 2000 знаков'
    : frNoSql(e) ? 'Переписка ещё не включена на сервере' : cloudErrText(e); };

// ---- Присланное с сервера проверяем, как всё чужое: только известные поля, строки обрезаны, дата и время — настоящие ----
function msgEv(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const s = (x, n) => typeof x === 'string' ? x.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n) : '';
  const title = s(v.title, 200); if (!title) return null;
  return { title, date: isDate(v.date) ? v.date : '', time: MSG_TIME.test(v.time || '') ? v.time : '', time2: MSG_TIME.test(v.time2 || '') ? v.time2 : '', loc: s(v.loc, 120), task: v.task === true,
    cat: s(v.cat, 60), cc: /^#[0-9a-f]{6}$/i.test(v.cc || '') ? v.cc : '' };   // cat, cc — календарь отправителя (тег: «Работа», «Прогулка»…) и его цвет
}
// Тот же календарь у меня — по названию (у каждого свои календари, общее у них только название)
const msgMyCat = e => { const n = (e && e.cat || '').trim().toLowerCase(); return n ? S.cats.find(c => String(c.name || '').trim().toLowerCase() === n) : null; };
const msgCatHTML = e => { if (!e.cat) return ''; const c = msgMyCat(e); return `<i class="mc-cat" style="--c:${safeColor(c ? c.color : e.cc || '')}">${esc(e.cat)}</i>`; };
const msgRe = v => { const o = {}; if (v && typeof v === 'object' && !Array.isArray(v)) Object.keys(v).forEach(k => { if (MSG_UID.test(k) && MSG_REACT.includes(v[k])) o[k] = v[k]; }); return o; };
const msgRow = r => r && Number.isFinite(+r.id) ? { id: +r.id, mine: r.mine === true, body: typeof r.body === 'string' ? r.body.slice(0, MSG_MAX) : '', ev: msgEv(r.ev), re: msgRe(r.re), at: String(r.at || ''), read: !!r.read_at } : null;

// ---- Кнопка в шапке и число новых ----
let msgHdrN = 0;
function msgHdr() {
  const b = $('.hdr-msg'); if (!b) return;
  const on = msgOn(); b.hidden = !on; if (!on) return;
  const n = msgUnread, up = n > msgHdrN; msgHdrN = n;
  b.innerHTML = I(IC.chat, 19) + (n ? `<em class="msg-badge" aria-hidden="true">${n > 9 ? '9+' : n}</em>` : '');
  b.setAttribute('aria-label', n ? 'Сообщения, новых: ' + n : 'Сообщения');
  if (up) { b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); setTimeout(() => b.classList.remove('bump'), 900); }   // новое — значок качнулся, число подпрыгнуло
}
// Переписки: последнее сообщение и сколько новых. Новое от друга, пока окно с ним не открыто, — тост с началом сообщения
async function msgThreadsLoad() {
  if (!signedIn() || !msgFriends().length) { msgUnread = 0; return msgHdr(); }
  try {
    const j = await frRpc('msg_threads', {}), was = msgThreads;
    msgThreads = (Array.isArray(j) ? j : []).map(t => ({ peer: String(t.peer || '').toLowerCase(), mine: t.mine === true, body: typeof t.body === 'string' ? t.body.slice(0, 120) : '', ev: t.ev === true, at: String(t.at || ''), unread: Math.max(0, +t.unread || 0) }))
      .filter(t => MSG_UID.test(t.peer) && msgFriends().some(f => f.uid === t.peer));
    msgUnread = msgThreads.reduce((s, t) => s + t.unread, 0); msgErr = '';
    if (was) msgThreads.forEach(t => { const o = was.find(x => x.peer === t.peer), f = msgFriends().find(x => x.uid === t.peer);
      if (f && t.unread > (o ? o.unread : 0) && !(mc && mc.peer === t.peer && $('.mchat'))) toast(`${frName(f)}: ${t.body || '📅 Событие'}`); });
  } catch (e) { if (frNoSql(e)) msgErr = 'nosql'; }
  msgHdr();
  const l = $('#mc_log'); if (mc && !mc.peer && l) l.innerHTML = msgListHTML();
}
// Друзья загрузились (js/friends.js: frLoad): кнопка в шапке, переписки; ждали друга (нажали на пуш до загрузки) — открываем
function msgSync() {
  msgHdr();
  if (msgWant && msgFriends().some(f => f.uid === msgWant)) { const u = msgWant; msgWant = ''; return openMsgs(u); }
  if (mc && mc.peer && !msgPeer() && $('.mchat')) { mc.peer = null; msgDraw(); }   // этого друга больше нет
  msgThreadsLoad();
}
setInterval(() => { if (!document.hidden && msgOn() && !(mc && $('.mchat'))) msgThreadsLoad(); }, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && msgOn()) msgThreadsLoad(); });

// ---- Окно ----
function openMsgs(peer) {
  if (!signedIn()) return ACT.login();
  peer = MSG_UID.test(peer || '') ? peer.toLowerCase() : '';
  if (peer && !msgFriends().some(f => f.uid === peer) && !fr.at) msgWant = peer;   // друзья ещё не загрузились — откроем, когда загрузятся
  if (!mc) mc = { peer: null, list: [], more: false, act: 0, del: 0, pick: false, err: '', draft: {}, sig: '' };
  mc.peer = peer && msgFriends().some(f => f.uid === peer) ? peer : null;
  Object.assign(mc, { list: [], more: false, act: 0, del: 0, pick: false, err: '', sig: '', loading: !!mc.peer, seen: null, fx: new Map() });
  msgDraw();
  if (mc.peer) msgPull(true); else msgThreadsLoad();
  msgPoll();
}
function msgDraw() {
  if (!mc) return;
  const f = msgPeer(), ph = innerWidth < 900;
  if (mc.peer && !f) mc.peer = null;
  const top = f ? `<button class="ic ai-x" data-act="msgback" aria-label="Все переписки" title="Все переписки">${I(IC.left, 20)}</button>
      <button class="mc-who" data-act="fropen" data-u="${f.uid}" title="Страница друга">${frAva(f, 34)}<span class="ai-tt"><h3>${esc(frName(f))}</h3><small>${f.nick ? '@' + esc(f.nick) : 'Друг'}</small></span></button>
      ${ph ? '' : `<button class="ic ai-x" data-act="close" aria-label="Закрыть" title="Закрыть">${I(IC.x, 18)}</button>`}`
    : `<button class="ic ai-x" data-act="close" aria-label="Закрыть" title="Закрыть">${I(ph ? IC.left : IC.x, 20)}</button><span class="ai-tt"><h3>Сообщения</h3><small>${plural(msgFriends().length, ['друг', 'друга', 'друзей'])}</small></span>`;
  const dock = !f ? '' : mc.pick ? `<div class="ai-dock mc-pkf"><button class="btn" data-act="msgpickx">Отмена</button></div>`
    : `<div class="ai-dock"><div class="ai-in has mc-in">
        <button class="ai-ib" data-act="msgpick" title="Отправить встречу или дело из календаря" aria-label="Отправить событие из календаря">${I(IC.cal, 20)}</button>
        <textarea id="mc_text" rows="1" maxlength="${MSG_MAX}" placeholder="Сообщение" aria-label="Сообщение для: ${esc(frName(f))}">${esc(mc.draft[f.uid] || '')}</textarea>
        <button class="ai-ib ai-send" data-act="msgsend" title="Отправить" aria-label="Отправить">${I(IC.send, 18)}</button>
      </div></div>`;
  sheet(`<div class="ai-chat mchat"><div class="ai-top">${top}</div>
    <div class="ai-log mc-log${f && !mc.pick ? ' conv' : ''}" id="mc_log" role="log" aria-live="polite" aria-label="${f ? 'Переписка' : 'Список переписок'}">${f ? (mc.pick ? msgPickHTML() : msgConvHTML(f)) : msgListHTML()}</div>
    ${dock}</div>`);
  msgGrow(); msgSeen();
  const l = $('#mc_log'); if (l && f && !mc.pick) l.scrollTop = l.scrollHeight;
  const ta = $('#mc_text'); if (ta && !matchMedia('(pointer: coarse)').matches) ta.focus();   // на телефоне клавиатура не выскакивает сама
}
const msgGrow = () => { const t = $('#mc_text'); if (!t) return; t.style.height = 'auto'; const h = t.scrollHeight; t.style.height = Math.min(h, 140) + 'px'; t.style.overflowY = h > 140 ? 'auto' : 'hidden'; };
// Перерисовать только ленту (окно, поле и клавиатура не трогаются); была прокручена вниз — остаётся внизу
function msgLog(stick) {
  const l = $('#mc_log'), f = msgPeer(); if (!l || !mc) return;
  const bottom = stick || l.scrollHeight - l.scrollTop - l.clientHeight < 80;
  l.innerHTML = !f ? msgListHTML() : mc.pick ? msgPickHTML() : msgConvHTML(f);
  if (bottom && f && !mc.pick) l.scrollTop = l.scrollHeight;
  msgSeen();
}
// Что уже показано: при следующей перерисовке анимируется только новое (первая загрузка — без анимации)
const msgSeen = () => { if (mc && mc.peer && !mc.loading) mc.seen = new Set(mc.list.map(m => m.id)); };

function msgListHTML() {
  const F = msgFriends(); if (!F.length) return `<p class="mc-empty">Добавьте друзей в профиле — и переписывайтесь здесь.</p>`;
  const by = new Map((msgThreads || []).map(t => [t.peer, t]));
  const rows = F.map(f => ({ f, t: by.get(f.uid) })).sort((x, y) => (y.t ? Date.parse(y.t.at) || 0 : 0) - (x.t ? Date.parse(x.t.at) || 0 : 0) || frName(x.f).localeCompare(frName(y.f), 'ru'));
  return `<ul class="mc-th">${rows.map(({ f, t }) => `<li><button class="mc-row" data-act="msgto" data-u="${f.uid}">${frAva(f, 46)}
    <span class="mc-rt"><b>${esc(frName(f))}</b><small>${t ? (t.mine ? 'Вы: ' : '') + esc(t.body || '📅 Событие') : 'Начните переписку'}</small></span>
    <span class="mc-rm">${t ? `<time>${msgWhen(t.at)}</time>` : ''}${t && t.unread ? `<em class="msg-badge" aria-label="Новых: ${t.unread}">${t.unread > 99 ? '99+' : t.unread}</em>` : ''}</span></button></li>`).join('')}</ul>`;
}
const msgEvWhen = e => [e.date ? fmtLong(e.date) : '', e.time ? e.time + (e.time2 ? '–' + e.time2 : '') : ''].filter(Boolean).join(' · ');
function msgItem(m, readMark) {
  const me = auth && auth.uid, cnt = {}; Object.values(m.re).forEach(e => { cnt[e] = (cnt[e] || 0) + 1; });
  // Пришло только что — въезжает (у входящего ещё вспышка). Когда показали впервые — fx; перерисовали раньше, чем анимация кончилась, —
  // новая продолжает с того же места (--ad — отрицательная задержка), а не обрывается и не начинается заново
  let t0 = mc.fx.get(m.id); if (!t0 && mc.seen && !mc.seen.has(m.id)) { t0 = Date.now(); mc.fx.set(m.id, t0); }
  const my = m.re[me] || '', open = mc.act === m.id && m.id > 0, age = t0 ? Date.now() - t0 : Infinity, fresh = age < 1600;
  const re = Object.keys(cnt).length ? `<span class="mc-re">${MSG_REACT.filter(e => cnt[e]).map(e => `<button class="mc-rb${my === e ? ' on' : ''}" data-act="msgreact" data-id="${m.id}" data-e="${e}" aria-label="Реакция ${e}${cnt[e] > 1 ? ', ' + cnt[e] : ''}" aria-pressed="${my === e}">${e}${cnt[e] > 1 ? `<small>${cnt[e]}</small>` : ''}</button>`).join('')}</span>` : '';
  // Событие — карточкой внутри сообщения; «В календарь» — под ним (кнопку нельзя класть внутрь нажимаемого сообщения)
  const ev = m.ev ? `<span class="mc-ev"><span class="mc-evi" aria-hidden="true">${I(m.ev.task ? IC.check : IC.cal, 18)}</span><span class="mc-evt"><b>${esc(m.ev.title)}</b><small>${msgCatHTML(m.ev)}${esc(msgEvWhen(m.ev) || 'без даты')}${m.ev.loc ? ' · ' + esc(m.ev.loc) : ''}</small></span></span>` : '';
  const add = m.ev && !m.mine ? `<button class="btn sm pri mc-evadd" data-act="msgevadd" data-id="${m.id}">${I(IC.plus, 15)} В мой календарь</button>` : '';
  const acts = !open ? '' : `<div class="mc-acts" role="group" aria-label="Реакции и действия">${MSG_REACT.map(e => `<button class="mc-ra${my === e ? ' on' : ''}" data-act="msgreact" data-id="${m.id}" data-e="${e}" aria-label="Реакция ${e}" aria-pressed="${my === e}">${e}</button>`).join('')}${m.body ? `<button class="mc-ab" data-act="msgcopy" data-id="${m.id}">${I(IC.copy, 15)}<span>Копировать</span></button>` : ''}${m.mine ? `<button class="mc-ab dng" data-act="msgdel" data-id="${m.id}">${I(IC.trash, 15)}<span>${mc.del === m.id ? 'Удалить у обоих?' : 'Удалить'}</span></button>` : ''}</div>`;
  return `<div class="mc-m ${m.mine ? 'me' : 'them'}${m.wait ? ' wait' : ''}${fresh ? ` new" style="--ad:-${age}ms` : ''}">
    <div class="mc-b${open ? ' on' : ''}" role="button" tabindex="0" data-act="msgact" data-id="${m.id}" aria-expanded="${open}" title="Реакции и действия">${m.body ? `<p>${esc(m.body)}</p>` : ''}${ev}<time>${m.wait ? 'отправляю…' : msgHM(m.at)}</time></div>
    ${add}${re}${acts}${readMark ? '<small class="mc-read">Прочитано</small>' : ''}</div>`;
}
function msgConvHTML(f) {
  const L = mc.list;
  if (!L.length) return mc.err ? `<div class="ai-err"><span>${esc(mc.err)}</span><button class="btn" data-act="msgretry">${I(IC.rep, 15)} Повторить</button></div>`
    : mc.loading ? `<p class="mc-empty"><span class="ai-shim" role="status">Загружаю…</span></p>`
    : `<div class="mc-hi">${frAva(f, 64)}<b>${esc(frName(f))}</b><p>Напишите первым — или отправьте встречу из календаря: друг добавит её к себе одним нажатием.</p></div>`;
  const lastMine = [...L].reverse().find(m => m.mine && m.id > 0);
  let out = mc.more ? `<button class="btn sm mc-moreb" data-act="msgmore">Показать раньше</button>` : '', day = '';
  L.forEach(m => { const k = msgDay(m.at); if (k !== day) { day = k; const d = relDay(k); out += `<div class="ai-day">${d[0].toUpperCase() + d.slice(1)}</div>`; } out += msgItem(m, m === lastMine && m.read); });
  return out;
}
// Выбор события из своего календаря: две недели вперёд, без сделанного
function msgPickHTML() {
  const t = todayK(); let out = '';
  for (let i = 0; i < 14; i++) {
    const k = addDays(t, i), L = evOn(k).filter(e => !e.done); if (!L.length) continue;
    const d = relDay(k);
    out += `<div class="ai-day">${d[0].toUpperCase() + d.slice(1)}</div>` + L.map(e => `<button class="mc-pk" data-act="msgpicked" data-id="${esc(e.id)}" data-d="${k}"><span class="mc-pkt">${e.time ? esc(e.time + (e.time2 ? '–' + e.time2 : '')) : 'весь день'}</span><b>${esc(e.title)}</b>${e.task ? '<small>дело</small>' : ''}</button>`).join('');
  }
  return `<p class="mc-empty">Что отправить? Друг увидит карточку и сможет добавить её к себе в календарь.</p>${out || '<p class="mc-empty">На две недели вперёд ничего нет.</p>'}`;
}

// ---- Сервер ----
async function msgPull(first) {
  const peer = mc && mc.peer; if (!peer) return;
  let rows;
  try { rows = await frRpc('msg_list', { p_peer: peer, p_limit: MSG_PAGE }); }
  catch (e) { if (mc && mc.peer === peer && first) { mc.loading = false; mc.err = msgErrText(e); msgLog(); } return; }
  if (!mc || mc.peer !== peer) return;
  const fresh = (Array.isArray(rows) ? rows : []).map(msgRow).filter(Boolean).reverse();
  const min = fresh.length ? fresh[0].id : Infinity, older = first ? [] : mc.list.filter(m => m.id > 0 && m.id < min), wait = mc.list.filter(m => m.wait);
  const next = [...older, ...fresh, ...wait], sig = JSON.stringify(next);
  if (first) { mc.loading = false; mc.err = ''; mc.more = fresh.length >= MSG_PAGE; mc.seen = null; }
  else if (mc.seen && fresh.some(m => !m.mine && !mc.seen.has(m.id)) && navigator.vibrate) navigator.vibrate(12);   // пришло новое, пока окно открыто, — лёгкая отдача (Android)
  if (first || sig !== mc.sig) { mc.sig = sig; mc.list = next; msgLog(first); }
  if (fresh.some(m => !m.mine && !m.read) && !document.hidden) frRpc('msg_read', { p_peer: peer }).then(() => msgThreadsLoad(), () => {});   // открыли — прочитано
}
function msgPoll() {
  clearTimeout(mcT);
  mcT = setTimeout(async () => {
    if (!mc || !sheetOpen() || !$('.mchat')) return;   // окно закрыли (или открыли другое) — не тянем
    if (!document.hidden) { if (mc.peer) await msgPull(); else await msgThreadsLoad(); }
    msgPoll();
  }, mc && mc.peer ? MSG_POLL : MSG_LIST_POLL);
}
// Отправить: сразу видно в ленте («отправляю…»), не ушло — пропадает, текст возвращается в поле
async function msgSend(ev) {
  if (!mc || !mc.peer) return;
  const ta = $('#mc_text'), text = ev ? '' : String(ta ? ta.value : '').trim().slice(0, MSG_MAX);
  if (!text && !ev) { if (ta) ta.focus(); return; }
  const peer = mc.peer, tmp = { id: -Date.now(), mine: true, body: text, ev: ev ? msgEv(ev) : null, re: {}, at: new Date().toISOString(), read: false, wait: 1 };
  mc.list.push(tmp); mc.act = 0;
  if (!ev && ta) { ta.value = ''; mc.draft[peer] = ''; msgGrow(); }
  msgLog(true);
  try { const r = await frRpc('msg_send', { p_to: peer, p_body: text, p_ev: ev || null }), was = tmp.id; tmp.id = +(r && r.id) || tmp.id; tmp.at = (r && r.at) || tmp.at; delete tmp.wait;
    if (mc && mc.seen) mc.seen.add(tmp.id); if (mc && mc.fx.has(was)) mc.fx.set(tmp.id, mc.fx.get(was)); }   // уже въезжает — продолжает, а не начинает заново
  catch (e) {
    if (mc) mc.list = mc.list.filter(m => m !== tmp);
    const t2 = $('#mc_text'); if (!ev && t2 && !t2.value) { t2.value = text; if (mc) mc.draft[peer] = text; msgGrow(); }
    toast(msgErrText(e));
  }
  if (mc && mc.peer === peer) { msgLog(true); msgPull(); }
}

// ---- Действия ----
ACT.msgs = () => openMsgs();
ACT.msgto = el => openMsgs(el.dataset.u);
ACT.msgback = () => { if (!mc) return; mc.peer = null; mc.pick = false; mc.act = 0; msgDraw(); msgThreadsLoad(); msgPoll(); };
ACT.msgsend = () => msgSend();
ACT.msgretry = () => { if (!mc) return; mc.err = ''; mc.loading = true; msgLog(); msgPull(true); };
ACT.msgpick = () => { if (!mc) return; mc.pick = true; msgDraw(); };
ACT.msgpickx = () => { if (!mc) return; mc.pick = false; msgDraw(); };
ACT.msgpicked = el => { const e = S.events.find(x => x.id === el.dataset.id); if (!e || !mc) return; mc.pick = false; msgDraw();
  const c = S.cats.find(x => x.id === e.cat);
  msgSend({ title: String(e.title || '').slice(0, 200), date: el.dataset.d, time: e.time || '', time2: e.time2 || '', loc: String(e.loc || '').slice(0, 120), task: !!e.task,
    cat: c ? String(c.name || '').slice(0, 60) : '', cc: c && /^#[0-9a-f]{6}$/i.test(c.color || '') ? c.color : '' }); };
// Нажатие на сообщение — реакции, «Копировать», «Удалить» (своё); ещё раз — спрятать
ACT.msgact = el => { const id = +el.dataset.id; if (!mc || !(id > 0)) return; mc.act = mc.act === id ? 0 : id; mc.del = 0; msgLog(); };
ACT.msgreact = async el => {
  const id = +el.dataset.id, e = el.dataset.e, m = mc && mc.list.find(x => x.id === id), me = auth && auth.uid; if (!m || !me || !MSG_REACT.includes(e)) return;
  const v = m.re[me] === e ? '' : e; if (v) m.re[me] = v; else delete m.re[me];
  mc.act = 0; msgLog();
  try { await frRpc('msg_react', { p_id: id, p_emoji: v }); } catch (x) { toast(msgErrText(x)); }
  msgPull();
};
ACT.msgcopy = el => { const m = mc && mc.list.find(x => x.id === +el.dataset.id); if (!m) return;
  (navigator.clipboard ? navigator.clipboard.writeText(m.body) : Promise.reject()).then(() => toast('Скопировано'), () => toast('Не получилось скопировать'));
  mc.act = 0; msgLog(); };
ACT.msgdel = async el => {
  const id = +el.dataset.id; if (!mc) return;
  if (mc.del !== id) { mc.del = id; return msgLog(); }   // первое нажатие — «Удалить у обоих?», второе — удаляет
  mc.del = 0; mc.act = 0; mc.list = mc.list.filter(x => x.id !== id); msgLog();
  try { await frRpc('msg_delete', { p_id: id }); } catch (x) { toast(msgErrText(x)); }
  msgPull();
};
ACT.msgmore = async () => {
  if (!mc || !mc.peer || !mc.list.length) return;
  const peer = mc.peer, min = Math.min(...mc.list.filter(m => m.id > 0).map(m => m.id));
  try {
    const rows = await frRpc('msg_list', { p_peer: peer, p_before: min, p_limit: MSG_PAGE }), old = (Array.isArray(rows) ? rows : []).map(msgRow).filter(Boolean).reverse();
    if (!mc || mc.peer !== peer) return;
    const l = $('#mc_log'), h0 = l ? l.scrollHeight - l.scrollTop : 0;
    mc.list = [...old, ...mc.list]; mc.more = old.length >= MSG_PAGE; mc.sig = '';
    msgLog(); if (l) l.scrollTop = l.scrollHeight - h0;   // лента остаётся на том же месте
  } catch (e) { toast(msgErrText(e)); }
};
// Событие из сообщения — в свой календарь: открывается карточка события с заполненными полями (календарь и напоминание — на выбор)
// Окно события сменяет окно переписки, не закрывая его: закрыть и сразу открыть — два шага в истории браузера, «Сохранить» уводило с сайта
// (жалоба пользователя 23 октября 2026). Календарь — мой с тем же названием («Работа», «Прогулка»); такого нет — подсказка, выбрать в карточке
ACT.msgevadd = el => { const m = mc && mc.list.find(x => x.id === +el.dataset.id); if (!m || !m.ev) return; const e = m.ev, c = msgMyCat(e);
  openEvent(null, { title: e.title, date: e.date || todayK(), time: e.time, time2: e.time2, loc: e.loc, task: e.task, cat: c ? c.id : undefined });
  if (e.cat && !c) toast(`Календаря «${e.cat}» у вас нет — выберите свой в карточке`); };
document.addEventListener('input', e => { if (e.target.id === 'mc_text' && mc && mc.peer) { mc.draft[mc.peer] = e.target.value; msgGrow(); } });
// Enter — отправить (на ПК; Shift+Enter — новая строка). На телефоне Enter — новая строка, отправка — кнопкой
document.addEventListener('keydown', e => { if (e.target.id === 'mc_text' && e.key === 'Enter' && !e.shiftKey && !e.isComposing && !matchMedia('(pointer: coarse)').matches) { e.preventDefault(); msgSend(); } });
