// ---- Другие календари (25 ноября 2026, пользователь: «можно ли сделать синхронизацию с другими календарями?» → «давай делать») ----
// 1) «Parsimony в других календарях» — ссылка-подписка: ключ cal_feeds (supabase/sql/calendar.sql: cal_feed_new / cal_feed_get / cal_feed_off),
//    адрес — функция calendar (supabase/functions/calendar): SUPABASE_URL/functions/v1/calendar?t=<ключ>. Какие календари — S.settings.feed.cats
//    (пусто — все), заметки — feed.notes. Менять события — здесь, в Google / Яндексе / iPhone они обновятся сами.
// 2) «Другие календари в Parsimony» — S.settings.subs = [{ id, url, name, color, off }] (синхронизируются между устройствами). События —
//    только на устройстве (remapp_subs: { [id]: { at, n, err, events } }); их забирает функция calendar (POST { url, tz }) — раз в 30 минут,
//    при запуске и по «Обновить». В приложении — только для просмотра: свой календарь «sub:<id>» (cat в core.js), evOn показывает (extOn),
//    нажатие — карточка без правки (openExt); друзьям, в напоминания и помощнику на правку не уходят.
const SUB_LS = 'remapp_subs', SUB_TTL = 30 * 60e3, SUB_MAX = 8;
const SUB_COLORS = ['#0ea5e9', '#f97316', '#22c55e', '#a855f7', '#ec4899', '#eab308', '#14b8a6', '#64748b'];
let subCache = (() => { const c = lsGet(SUB_LS); return c && typeof c === 'object' && !Array.isArray(c) ? c : {}; })();
let subIdx = null, subBusy = {}, feedTok, feedBusy = false;   // feedTok: undefined — ещё не знаем, null — ссылки нет
const subList = () => (Array.isArray(S.settings.subs) ? S.settings.subs : []).filter(s => s && typeof s.id === 'string' && typeof s.url === 'string');
const subOn = () => subList().filter(s => !s.off);
const subCat = id => { const s = subList().find(x => x.id === id); return s ? { id: 'sub:' + id, name: s.name || 'Календарь', color: safeColor(s.color) || '#64748b', ro: true } : null; };
const subSave = () => { lsSet(SUB_LS, subCache); subIdx = null; };
const TM_OK = t => typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t), D_OK = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
// Повтор из присланного — только то, что умеет occurs, и только чистые значения (данные чужие)
function subRep(r) {
  if (!r || typeof r !== 'object' || !['daily', 'weekdays', 'weekly', 'monthly', 'yearly'].includes(r.type)) return { type: 'none' };
  return { type: r.type, days: Array.isArray(r.days) ? r.days.filter(i => Number.isInteger(i) && i >= 0 && i < 7).slice(0, 7) : [], ...(r.every === 2 ? { every: 2 } : {}), until: D_OK(r.until) ? r.until : null };
}
// Указатель: разовые — по дням, повторы — списком (иначе месяц на 42 дня × тысячи событий считался бы долго)
function subBuild() {
  const byDay = new Map(), rec = [];
  for (const s of subOn()) {
    const c = subCache[s.id]; if (!c || !Array.isArray(c.events)) continue;
    for (const x of c.events.slice(0, 5000)) {
      if (!x || typeof x !== 'object' || !D_OK(x.d) || typeof x.t !== 'string') continue;
      const e = { id: 'x:' + s.id + ':' + String(x.id || '').replace(/[^\w-]/g, '').slice(0, 40), title: x.t.slice(0, 200), date: x.d, time: TM_OK(x.tm) ? x.tm : '',
        time2: TM_OK(x.tm) && TM_OK(x.tm2) && x.tm2 > x.tm ? x.tm2 : '', loc: typeof x.loc === 'string' ? x.loc.slice(0, 200) : '', cat: 'sub:' + s.id,
        repeat: subRep(x.r), skip: Array.isArray(x.sk) ? x.sk.filter(D_OK).slice(0, 400) : [], ro: true };
      if (isRec(e)) rec.push(e); else (byDay.get(e.date) || byDay.set(e.date, []).get(e.date)).push(e);
    }
  }
  return subIdx = { byDay, rec };
}
// События других календарей в день k (их показывает evOn в core.js)
function extOn(k) {
  if (!subList().length) return [];
  const ix = subIdx || subBuild();
  return [...(ix.byDay.get(k) || []), ...ix.rec.filter(e => occurs(e, k))];
}
// Забрать календарь по ссылке (функция calendar); ok — сколько событий
async function subFetch(s, quiet) {
  if (!signedIn() || subBusy[s.id]) return;
  subBusy[s.id] = true;
  try {
    const j = await api('/functions/v1/calendar', { method: 'POST', user: true, body: { url: s.url, tz: S.settings.tz || Intl.DateTimeFormat().resolvedOptions().timeZone } });
    const ev = j && Array.isArray(j.events) ? j.events : [];
    subCache[s.id] = { at: Date.now(), n: ev.length, events: ev }; subSave();
    if (j && j.name && !s.named) { s.name = String(j.name).slice(0, 40); s.named = true; save(); }
    return ev.length;
  } catch (e) {
    const code = e && e.message, why = { url: 'ссылка не подходит', gone: 'календаря по ссылке больше нет', denied: 'нет доступа — ссылка закрыта', notics: 'по ссылке не календарь',
      big: 'календарь слишком большой', limit: 'слишком часто — попробуйте через час', auth: 'нужен вход' }[code] || (e && e.status === 0 ? 'нет интернета' : 'не загрузился');
    subCache[s.id] = Object.assign(subCache[s.id] || { events: [] }, { err: why, at: Date.now() }); subSave();
    if (!quiet) toast('Календарь «' + (s.name || 'по ссылке') + '»: ' + why);
    return -1;
  } finally { delete subBusy[s.id]; }
}
// Раз в 30 минут — при запуске, при возвращении в приложение и при открытии календаря
async function subTick(force) {
  if (!signedIn()) return;
  let any = false;
  for (const s of subOn()) { const c = subCache[s.id]; if (force || !c || Date.now() - (c.at || 0) > SUB_TTL) { const r = await subFetch(s, true); if (r != null) any = true; } }
  if (any) render();
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') setTimeout(() => subTick(), 1500); });
setTimeout(() => subTick(), 4000);

// ---- Карточка события из другого календаря: только посмотреть ----
function openExt(id, k) {
  const sid = String(id).split(':')[1], s = subList().find(x => x.id === sid), list = k ? extOn(k) : [];
  const e = list.find(x => x.id === id) || (subIdx && [...subIdx.byDay.values()].flat().concat(subIdx.rec).find(x => x.id === id)); if (!e) return;
  const c = subCat(sid) || { name: 'Календарь', color: '#64748b' }, when = fmtLong(k || e.date) + (e.time ? ', ' + e.time + (e.time2 ? '–' + e.time2 : '') : ', весь день');
  const ya = e.loc && typeof yaMapUrl === 'function' ? yaMapUrl(null, e.loc) : '';
  sheet(`<div class="sh-head"><h3>${esc(e.title)}</h3><button class="ic" data-act="close" aria-label="Закрыть">${I(IC.x, 18)}</button></div>
    <div class="ext-ev" style="--c:${c.color}">
      <div class="set-row"><span>Когда</span><b>${esc(when)}</b></div>
      ${isRec(e) ? `<div class="set-row"><span>Повтор</span><b>повторяется</b></div>` : ''}
      ${e.loc ? `<div class="set-row"><span>Место</span><b>${esc(e.loc)}</b></div>` : ''}
      <div class="set-row"><span>Календарь</span><b><i class="ext-dot"></i>${esc(c.name)}</b></div>
      ${ya ? `<a class="pill sm" href="${esc(ya)}" target="_blank" rel="noopener">${I(IC.pin, 14)} Открыть в Яндекс Картах</a>` : ''}
      <p class="set-note">Это событие из другого календаря${s ? ' — «' + esc(s.name || '') + '»' : ''}. Изменить его можно там: сюда изменения придут сами (раз в полчаса).</p>
    </div>`);
}

// ---- Ссылка-подписка на свои события ----
const feedLink = (t, web) => (web ? SUPABASE_URL.replace(/^https:/, 'webcal:') : SUPABASE_URL) + '/functions/v1/calendar?t=' + t;
async function feedLoad() {
  if (!signedIn() || feedBusy) return; feedBusy = true;
  try { const t = await api('/rest/v1/rpc/cal_feed_get', { method: 'POST', user: true, body: {} }); feedTok = typeof t === 'string' && /^[a-f0-9]{48}$/.test(t) ? t : null; }
  catch (e) { feedTok = e && (e.code === 'PGRST202' || e.status === 404) ? 'nosql' : null; }
  feedBusy = false; if (sec === 'settings') render();
}
ACT.feednew = async el => {
  if (!signedIn()) return ACT.login();
  if (feedTok && !el.dataset.sure) { el.dataset.sure = '1'; el.textContent = 'Точно? Старая ссылка перестанет работать'; return; }
  try { const t = await api('/rest/v1/rpc/cal_feed_new', { method: 'POST', user: true, body: {} }); feedTok = t; render(); toast(el.dataset.sure ? 'Новая ссылка готова — старая больше не работает' : 'Ссылка готова'); }
  catch (e) { toast('Не получилось создать ссылку — попробуйте ещё раз'); }
};
ACT.feedoff = async el => {
  if (!el.dataset.sure) { el.dataset.sure = '1'; el.textContent = 'Точно выключить? Календари перестанут обновляться'; return; }
  try { await api('/rest/v1/rpc/cal_feed_off', { method: 'POST', user: true, body: {} }); feedTok = null; render(); toast('Ссылка выключена'); }
  catch (e) { toast('Не получилось — попробуйте ещё раз'); }
};
ACT.feedcopy = () => { if (feedTok) copyText(feedLink(feedTok), 'Ссылка скопирована — вставьте её в другой календарь'); };
ACT.feedcat = el => {
  const f = S.settings.feed = Object.assign({ cats: [], notes: false }, S.settings.feed), id = el.dataset.id;
  let l = f.cats.length ? f.cats.filter(x => S.cats.some(c => c.id === x)) : S.cats.map(c => c.id);
  l = l.includes(id) ? l.filter(x => x !== id) : [...l, id];
  if (!l.length) return toast('Хотя бы один календарь');
  f.cats = l.length === S.cats.length ? [] : l; save(); render();
};
document.addEventListener('focusin', e => { if (e.target.id === 'feed_url') e.target.select(); });   // нажали на ссылку — выделена целиком
document.addEventListener('change', e => { if (e.target.id === 's_feednotes') { S.settings.feed = Object.assign({ cats: [] }, S.settings.feed, { notes: e.target.checked }); save(); } });

// ---- Подписки на чужие календари ----
ACT.subadd = async () => {
  const i = $('#sub_url'), raw = i ? i.value.trim() : '', url = ((raw.match(/(?:webcals?|https?):\/\/[^\s"'<>«»]+/i) || [raw])[0]).replace(/[.,;)]+$/, '');
  if (!signedIn()) return ACT.login();
  if (!url) { toast('Вставьте ссылку на календарь'); return i && i.focus(); }
  if (!/^(https|webcal):\/\//i.test(url)) return toast('Нужна ссылка, которая начинается с https:// или webcal://');
  if (subList().length >= SUB_MAX) return toast('Не больше ' + SUB_MAX + ' календарей');
  if (subList().some(s => s.url === url)) return toast('Этот календарь уже добавлен');
  const used = subList().map(s => s.color), s = { id: 's' + uid().slice(-8), url: url.slice(0, 2000), name: 'Календарь ' + (subList().length + 1), color: SUB_COLORS.find(c => !used.includes(c)) || SUB_COLORS[0] };
  const b = $('[data-act="subadd"]'); if (b) { b.disabled = true; b.textContent = 'Загружаю…'; }
  const n = await subFetch(s, false);
  if (n == null || n < 0) { if (b) { b.disabled = false; b.textContent = 'Добавить'; } delete subCache[s.id]; subSave(); return; }
  S.settings.subs = [...subList(), s]; save(); subIdx = null; render();
  toast(`Календарь «${s.name}» добавлен: ${plural(n, ['событие', 'события', 'событий'])}`);
};
ACT.subupd = async el => { const s = subList().find(x => x.id === el.dataset.id); if (!s) return; el.disabled = true; const n = await subFetch(s, false); render(); if (n >= 0) toast('Обновлено: ' + plural(n, ['событие', 'события', 'событий'])); };
ACT.subtog = el => { const s = subList().find(x => x.id === el.dataset.id); if (!s) return; s.off = !s.off; save(); subIdx = null; render(); if (!s.off) subTick(); };
ACT.subdel = el => {
  if (!el.dataset.sure) { el.dataset.sure = '1'; el.textContent = 'Точно убрать?'; return; }
  const id = el.dataset.id; S.settings.subs = subList().filter(x => x.id !== id); delete subCache[id]; subSave(); save(); render(); toast('Календарь убран — в исходном он остался');
};
document.addEventListener('change', e => { if (e.target.classList && e.target.classList.contains('sub-name')) { const s = subList().find(x => x.id === e.target.dataset.id); if (s) { s.name = e.target.value.trim().slice(0, 40) || s.name; s.named = true; save(); render(); } } });

// Раздел настроек «Другие календари» (переделано 25 ноября 2026: «мне всё ещё не понятно, как импортировать, с айфона так уж точно»):
// сверху — «Показать здесь» / «Отправить туда», дальше — где календарь (iPhone / Google / Яндекс / Outlook) и шаги для телефона или ПК
const SYNC_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
let syncTab = 'in', syncSrc = SYNC_IOS ? 'ios' : 'google';
const SYNC_SRC = [['ios', 'iPhone'], ['google', 'Google'], ['yandex', 'Яндекс'], ['outlook', 'Outlook']];
ACT.syntab = el => { syncTab = el.dataset.k; render(); };
ACT.synsrc = el => { syncSrc = el.dataset.k; render(); };
ACT.subpaste = async () => {
  const i = $('#sub_url'); if (!i) return;
  try { const t = ((navigator.clipboard && await navigator.clipboard.readText()) || '').trim(); if (!t) return toast('В буфере пусто — сначала скопируйте ссылку'); i.value = t; toast('Ссылка вставлена — нажмите «Добавить»'); }
  catch (e) { i.focus(); toast('Не получилось — нажмите на поле и выберите «Вставить»'); }
};
// Шаги: in — откуда взять ссылку, out — куда вставить свою. ph — телефон (там Google, Яндекс и Outlook — только через «версию для ПК» в браузере)
function syncSteps(k, dir, ph) {
  const pcv = ph ? ['В адресной строке нажмите «аА» → «Запросить настольный веб-сайт» (на Android — «⋮» → «Версия для ПК»).'] : [];
  const back = ph ? 'Вернитесь в Parsimony → «Вставить» → «Добавить».' : 'Вставьте ссылку в поле ниже → «Добавить».';
  const open = (site, app) => ph ? `Откройте ${site} в Safari или Chrome${app ? ' (в приложении ' + app + ' этой настройки нет)' : ''} и войдите.` : `Откройте ${site}.`;
  if (dir === 'in') return {
    ios: { li: [ph ? 'Откройте приложение «Календарь» и внизу нажмите «Календари».' : 'На iPhone откройте приложение «Календарь» и внизу нажмите «Календари».',
        'Нажмите ⓘ справа от нужного календаря (в списке iCloud).', 'Пролистайте вниз и включите «Публичный календарь».', 'Нажмите «Готово», подождите несколько секунд и снова откройте ⓘ — под переключателем появится «Поделиться ссылкой…» → «Скопировать».',
        ph ? back : 'Перешлите ссылку себе на компьютер или откройте Parsimony на iPhone → «Вставить» → «Добавить».'],
      note: 'Нет «Публичного календаря»? Значит, календарь не из iCloud. Видите там почту …@gmail.com — это календарь Google: нажмите «Google» выше; календари «На iPhone» поделиться не дают. Ссылку никто не угадает, но тот, у кого она есть, видит события.' },
    google: { li: [open('calendar.google.com', 'Google Календарь'), ...pcv,
        ph ? 'Шестерёнка ⚙ вверху → «Настройки» → слева, в «Настройки моих календарей», выберите календарь.' : 'Слева, в «Мои календари», наведите на календарь → «⋮» → «Настройки и общий доступ».',
        'Внизу, в «Интеграция календаря», скопируйте «Секретный адрес в формате iCal».', back],
      note: 'Нужен именно «Секретный адрес» — «Общедоступный» работает, только если календарь открыт всем.' },
    yandex: { li: [open('calendar.yandex.ru', 'Яндекс Календарь'), ...pcv,
        'Слева наведите на нужный календарь (на телефоне — нажмите на него) → шестерёнка «Настроить».', 'Найдите «Экспорт», выберите формат iCal → «Скопировать».', back] },
    outlook: { li: [open('outlook.live.com', 'Outlook'), ...pcv, 'Шестерёнка ⚙ → «Календарь» → «Общие календари».',
        'В «Опубликовать календарь» выберите календарь и «Может просматривать все сведения» → «Опубликовать».', 'Скопируйте ссылку ICS.', back] } }[k];
  const copy = 'Нажмите «Скопировать» выше.';
  return {
    ios: { li: [ph ? 'Нажмите кнопку «Календарь iPhone» выше.' : 'Откройте эту страницу на iPhone и нажмите «Календарь iPhone» выше.', 'iPhone спросит «Подписаться на календарь?» → «Подписаться» → «Готово».', 'События появятся в Календаре iPhone отдельным календарём.'],
      note: 'Кнопка не сработала? Скопируйте ссылку → Настройки iPhone → «Календарь» → «Учётные записи» → «Новая учётная запись» → «Другое» → «Подписной календарь» → вставьте ссылку.' },
    google: { li: [copy, open('calendar.google.com', 'Google Календарь'), ...pcv, 'Слева у «Другие календари» нажмите «+» → «Добавить по URL».', 'Вставьте ссылку → «Добавить календарь».'],
      note: 'Календарь появится и в приложении Google на телефоне. Google обновляет его сам раз в несколько часов.' },
    yandex: { li: [copy, open('calendar.yandex.ru', 'Яндекс Календарь'), ...pcv, 'Слева нажмите «Новая подписка».', 'Вставьте ссылку, выберите цвет → «Создать».'] },
    outlook: { li: [copy, open('outlook.live.com', 'Outlook'), ...pcv, 'В календаре нажмите «Добавить календарь» → «Подписаться из Интернета».', 'Вставьте ссылку, придумайте название → «Импорт».'] } }[k];
}
function syncHowHTML(dir) {
  const ph = SYNC_IOS || innerWidth < 900, st = syncSteps(syncSrc, dir, ph);
  return `<div class="set-sec sm">${dir === 'in' ? 'Где сейчас ваш календарь?' : 'Куда отправить?'}</div>
    <div class="seg2 sync-src" role="group" aria-label="Календарь">${SYNC_SRC.map(([k, n]) => `<button class="${syncSrc === k ? 'on' : ''}" data-act="synsrc" data-k="${k}" aria-pressed="${syncSrc === k}">${n}</button>`).join('')}</div>
    <ol class="sync-steps">${st.li.map(x => `<li>${esc(x)}</li>`).join('')}</ol>${st.note ? `<p class="set-note">${esc(st.note)}</p>` : ''}`;
}
function syncSetHTML() {
  if (!signedIn()) return `<div class="set-sec">Другие календари</div><p class="set-note">Связь с Google, Яндексом и iPhone работает с аккаунтом — войдите по почте.</p><button class="btn pri" style="width:100%" data-act="login">${I(IC.user, 16)} Войти</button>`;
  if (feedTok === undefined) feedLoad();
  const tabs = `<div class="set-sec">Другие календари</div>
    <div class="seg2 sync-tab" role="group" aria-label="Что сделать">${[['in', 'Показать здесь'], ['out', 'Отправить туда']].map(([k, n]) => `<button class="${syncTab === k ? 'on' : ''}" data-act="syntab" data-k="${k}" aria-pressed="${syncTab === k}">${n}</button>`).join('')}</div>`;
  if (syncTab === 'in') {
    const subs = subList(), ago = at => { const m = Math.round((Date.now() - at) / 60000); return m < 1 ? 'только что' : m < 60 ? plural(m, ['минуту', 'минуты', 'минут']) + ' назад' : m < 1440 ? plural(Math.round(m / 60), ['час', 'часа', 'часов']) + ' назад' : 'давно'; };
    const rows = subs.map(s => { const c = subCache[s.id] || {};
      return `<div class="sub-row" style="--c:${safeColor(s.color)}"><i class="ext-dot"></i><div class="sub-t"><input class="sub-name" data-id="${esc(s.id)}" value="${esc(s.name || '')}" maxlength="40" aria-label="Название календаря">
        <small>${c.err ? '⚠ ' + esc(c.err) : c.at ? plural(c.n || 0, ['событие', 'события', 'событий']) + ' · ' + ago(c.at) : 'ещё не загружен'}</small></div>
        <input class="sw" type="checkbox" data-act="subtog" data-id="${esc(s.id)}"${s.off ? '' : ' checked'} aria-label="Показывать «${esc(s.name || '')}»">
        <button class="ic" data-act="subupd" data-id="${esc(s.id)}" title="Обновить" aria-label="Обновить «${esc(s.name || '')}»">${I(IC.undo, 16)}</button>
        <button class="ic dng" data-act="subdel" data-id="${esc(s.id)}" title="Убрать" aria-label="Убрать «${esc(s.name || '')}»">${I(IC.trash, 16)}</button></div>`; }).join('');
    return tabs + `<p class="set-note">Встречи из календаря iPhone, Google, Яндекса или Outlook появятся в Parsimony отдельным цветом — только посмотреть, обновляются сами раз в полчаса.</p>
      ${rows}
      ${subs.length < SUB_MAX ? syncHowHTML('in') + `<div class="sub-add"><input id="sub_url" class="fin" type="url" inputmode="url" placeholder="Ссылка на календарь" aria-label="Ссылка на календарь" autocomplete="off"><button class="btn" data-act="subpaste">${I(IC.copy, 15)} Вставить</button></div>
        <button class="btn pri sub-go" data-act="subadd">Добавить</button>` : '<p class="set-note">Добавлено ' + SUB_MAX + ' календарей — больше нельзя.</p>'}`;
  }
  const f = S.settings.feed || {}, inFeed = id => !(f.cats && f.cats.length) || f.cats.includes(id);
  const feed = feedTok === 'nosql' ? '<p class="set-note">Ссылки ещё не включены на сервере — скоро заработают.</p>'
    : feedTok === undefined ? '<p class="set-note">Проверяю…</p>'
    : !feedTok ? `<p class="set-note">Сначала создайте ссылку на ваш календарь — её вы добавите в другой календарь.</p><button class="btn pri" style="width:100%" data-act="feednew">${I(IC.link, 16)} Создать ссылку</button>`
    : `<div class="feed-link"><input class="fin" readonly value="${esc(feedLink(feedTok))}" aria-label="Ссылка на ваш календарь" id="feed_url"></div>
      <div class="feed-btns"><button class="btn pri" data-act="feedcopy">${I(IC.copy, 15)} Скопировать</button><a class="btn" href="${esc(feedLink(feedTok, true))}">${I(IC.cal, 15)} Календарь iPhone</a></div>
      ${syncHowHTML('out')}
      <p class="set-note">Ссылка секретная: у кого она есть, тот видит ваши события. Утекла — «Новая ссылка».</p>
      <div class="set-sec sm">Какие календари попадают</div>
      <div class="chips">${S.cats.map(c => `<button type="button" class="chip${inFeed(c.id) ? ' on' : ''}" data-act="feedcat" data-id="${esc(c.id)}" aria-pressed="${inFeed(c.id)}" style="--c:${safeColor(c.color)}"><i class="ext-dot"></i>${esc(c.name)}</button>`).join('')}</div>
      <div class="set-row"><span>С заметками<small>видят все, у кого есть ссылка</small></span><input id="s_feednotes" class="sw" type="checkbox"${f.notes ? ' checked' : ''}></div>
      <div class="feed-btns"><button class="btn" data-act="feednew">Новая ссылка</button><button class="btn dng" data-act="feedoff">Выключить</button></div>`;
  return tabs + `<p class="set-note">Ваши события из Parsimony будут видны в календаре iPhone, Google, Яндекса или Outlook. Меняйте их здесь — там они обновятся сами.</p>${feed}`;
}
