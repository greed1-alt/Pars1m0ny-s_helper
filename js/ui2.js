// ---- Интерфейс (с 3 октября 2026): единая строка ввода, сворачиваемые блоки, экраны Главной / Задач / Финансов / Привычек, знакомство за 3 шага ----
// Прежний вид с переключателем убран 6 октября 2026 (решение пользователя). Полный откат — git-тег before-ui2.
onMigrate(() => {
  const st = S.settings;
  delete st.ui2;
  if (!st.folds || typeof st.folds !== 'object' || Array.isArray(st.folds)) st.folds = {};

});
const isWide = () => innerWidth >= 900;

// ---- Сворачиваемый блок: заголовок со сводкой, содержимое рисуется только в открытом виде ----
// def — открыт ли по умолчанию (true/false или функция, например isWide: на ПК открыт, на телефоне свёрнут).
// card: true — блок сам карточка (Главная); иначе заголовок-строка, а под ним обычные карточки раздела.
const foldIsOpen = (k, def) => { const v = S.settings.folds[k]; return v == null ? !!(typeof def === 'function' ? def() : def) : v; };
function foldHTML(k, title, sum, body, def, opt) {
  const o = opt || {}, open = foldIsOpen(k, def);
  return `<section class="fold${o.card ? ' fc' : ''}${o.cls ? ' ' + o.cls : ''}${open ? ' open' : ''}" data-fold="${k}">
    <button class="fold-h" data-act="fold" data-k="${k}" aria-expanded="${open}">${o.ic ? I(o.ic, 18) : ''}<span class="fold-tt"><b>${title}</b>${sum ? `<small>${sum}</small>` : ''}</span><i class="fold-chev">${I(IC.right, 17)}</i></button>
    ${open ? `<div class="fold-b">${typeof body === 'function' ? body() : body}</div>` : ''}</section>`;
}
ACT.fold = el => { const k = el.dataset.k; S.settings.folds[k] = el.getAttribute('aria-expanded') !== 'true'; save(); render(); };
const foldOpenGo = k => { S.settings.folds[k] = true; save(); render(); setTimeout(() => { const f = $(`[data-fold="${k}"]`); if (f) f.scrollIntoView({ block:'start', behavior: smoothB() }); }, 60); };

// ---- Единая строка ввода: дела, встречи, траты, привычки и заметки обычной фразой ----
const OM_T = {
  task:{ n:'Задача', ic:IC.tasks, ph:'Задача: «отчёт в пятницу !!», «купить хлеб»' },
  event:{ n:'Событие', ic:IC.cal, ph:'Событие: «встреча завтра в 15:00 #работа»' },
  money:{ n:'Деньги', ic:IC.wallet, ph:'Деньги: «кафе 450», «+ зарплата 60 000»' },
  habit:{ n:'Привычка', ic:IC.habit, ph:'Привычка: «2 литра воды», «зарядка»' },
  goal:{ n:'Цель', ic:IC.goal, ph:'Цель: «выучить английский до 1 июня»' },
  note:{ n:'Заметка', ic:IC.note, ph:'Заметка: мысль, идея, вывод дня' },
};
const OM_ORDER = ['task', 'event', 'money', 'habit', 'goal', 'note'];
const OM_PH = { home:'Что добавить? «кафе 450», «встреча завтра в 15»', tasks:'Новая задача: «отчёт в пятницу #работа !!»', cal:'«Встреча завтра в 15:00 #работа»' };
const OM_EX = {
  home:['купить хлеб', 'встреча завтра в 15 #работа', 'кафе 450', '+ зарплата 60 000', 'привычка: 2 литра воды', 'заметка: идея для подарка'],
  cal:['созвон завтра в 11', 'тренировка в пятницу с 19 до 20', 'кино в субботу в 20:30', 'день рождения 12 ноября'],
  tasks:['позвонить маме', 'отчёт в пятницу !!', 'оплатить интернет завтра', 'прочитать 20 страниц !низкий'],
};
const OM = {};   // состояние каждой строки: ctx — где стоит, force — вид, выбранный вручную, cat/prio — выбранные нажатием, v — текст
const omSt = id => OM[id] || (OM[id] = { ctx:'home', force:null, cat:null, prio:null, v:'' });
const omReset = st => { st.v = ''; st.force = null; st.cat = null; st.prio = null; };

// Категория по смыслу: сначала по названию календаря («работа» → «Работа»), потом по словам-подсказкам
const CAT_KW = [[/^работ/i, /работ|встреч|созвон|отч[её]т|проект|клиент|офис|совещан|дедлайн|презентац|письм|почт/i],
  [/^уч[её]б/i, /уч[её]б|экзам|урок|курс|лекци|домашк|семинар|зач[её]т|англ/i], [/^отдых/i, /отдых|кино|сериал|игр|друз|вечеринк|отпуск|концерт|театр/i],
  [/^прогул/i, /прогул|парк|гулять|пешком/i], [/^(личн|дом|семь)/i, /мам|пап|семь|дом|уборк|ремонт|врач|позвонить/i], [/^(спорт|здоров)/i, /спорт|зал\b|трениров|бег|йог|бассейн/i]];
function guessCat(title) {
  const low = title.toLowerCase(), words = low.split(/[\s,.;:!?«»"]+/).filter(w => w.length >= 4);
  let c = S.cats.find(c => { const n = c.name.toLowerCase(); return n.length >= 4 && words.some(w => n.startsWith(w.slice(0, 5)) || w.startsWith(n.slice(0, 5))); });
  if (!c) c = S.cats.find(c => CAT_KW.some(([nr, tr]) => nr.test(c.name) && tr.test(low)));
  return c ? c.id : null;
}
const HB_GUESS = [[/вод/, '💧'], [/бег|пробеж|шаг|ходьб|прогул/, '🏃'], [/чита|книг|страниц/, '📚'], [/медит|дыхан/, '🧘'], [/зарядк|спорт|трениров|отжим|присед|планк/, '💪'],
  [/сон|спать|лечь|подъ[её]м/, '😴'], [/овощ|фрукт|салат|питан|сахар/, '🥗'], [/дневник|запис|писать/, '📝'], [/кур/, '🚭'], [/витамин|таблет/, '💊'], [/англ|язык|учить/, '🧠'],
  [/зуб/, '🦷'], [/уборк|убрать/, '🧹'], [/телефон|соцсет/, '📵'], [/деньг|копи|отлож/, '💰']];
// Похоже на деньги: слово из словаря трат или название финансовой категории целиком
const finHit = low => FIN_KW.some(([re]) => re.test(low)) || S.fin.cats.some(c => { const n = c.name.toLowerCase(); return low.split(/[\s,.;:!?]+/).some(w => w.length >= 3 && (w === n || n.split(' ')[0] === w || (w.length >= 5 && n.startsWith(w)))); });
const HAB_RE = /(^|\s)(каждый день|ежедневно|каждое утро|каждый вечер|по утрам|по вечерам)(?=\s|$)/i;
const OM_PRE = { заметка:'note', мысль:'note', идея:'note', привычка:'habit', цель:'goal', задача:'task', событие:'event', трата:'money', расход:'money', доход:'money' };

// Разбор фразы: что это (задача / событие / деньги / привычка / заметка) и все поля для записи
// Вид записи доступен, только если включён его раздел (js/layout.js): деньги — «Финансы», привычка — «Привычки», цель — «Задачи»
const OM_SEC = { money:'fin', habit:'habits', goal:'tasks' };
const omOn = t => !OM_SEC[t] || secOn(OM_SEC[t]);
// raw — без замены выключенного вида на задачу (чтобы отобрать примеры)
function omniParse(raw, ctx, force, st, rawType) {
  let s = String(raw || '').trim(); if (!s) return null;
  let type = force || null, prio = null, plus = false;
  // «заметка: …», «привычка …», «доход 5000» — явное начало
  const pm = s.match(/^(заметка|мысль|идея|привычка|цель|задача|событие|трата|расход|доход)(\s*[:\-–—]\s*|\s+)/i);
  if (pm) {
    const w = pm[1].toLowerCase(), t = OM_PRE[w], colon = /[:\-–—]/.test(pm[2]);
    if ((colon || !['мысль', 'идея'].includes(w)) && (!type || type === t)) { type = t; s = s.slice(pm[0].length).trim(); if (w === 'доход') plus = true; }
  }
  // Приоритет: «!» высокий, «!!» срочно, «!низкий», слово «срочно»
  s = s.replace(/(^|\s)(!{1,3})(срочн\S*|высок\S*|средн\S*|низк\S*)?(?=\s|$)/i, (m0, a, ex, w) => {
    const W = (w || '').toLowerCase(); prio = W ? (W.startsWith('сро') ? 'urgent' : W.startsWith('выс') ? 'high' : W.startsWith('низ') ? 'low' : 'mid') : ex.length >= 2 ? 'urgent' : 'high'; return a; });
  s = s.replace(/(^|\s)срочно(?=\s|$)/i, (m0, a) => { prio = prio || 'urgent'; return a; }).replace(/\s+/g, ' ').trim();
  if (!s) return null;
  const t = todayK(), yest = /(^|\s)вчера(?=\s|$)/i.test(s), sm = s.replace(/(^|\s)вчера(?=\s|$)/i, ' ').trim();
  // Время без даты («в 16») — на выбранный день строки (st.base), а не на сегодня
  const nl = parseNL(s, (st && st.base) || t), mo = parseMoney(plus ? '+ ' + sm : sm);
  if (!type) {
    if (mo.ok && !nl.time && ctx !== 'tasks') {
      const plusM = plus || /^\+/.test(sm), cur = /\d\s*(₽|р\.?(?=\s|$)|руб|к(?=\s|$)|k(?=\s|$)|тыс)/i.test(sm);
      const hit = finHit(sm.toLowerCase()), end = /\d\s*(₽|р\.?|руб\S*|к|k|тыс\.?)?$/i.test(sm);
      if (plusM || cur || hit || (end && mo.amt >= 50)) type = 'money';
    } else if (mo.ok && ctx === 'tasks' && (/^\+/.test(sm) || /\d\s*(₽|руб)/i.test(sm))) type = 'money';
    if (!type) type = HAB_RE.test(s) && !nl.time ? 'habit' : nl.time && ctx !== 'tasks' ? 'event' : 'task';
  }
  if (!rawType && !omOn(type)) type = nl.time && ctx !== 'tasks' ? 'event' : 'task';
  const S_ = st || {};
  if (type === 'money') {
    const date = yest ? addDays(t, -1) : nl.date && nl.date <= t ? nl.date : t;
    return { type, amt: mo.ok ? mo.amt : 0, fcat: mo.ok ? mo.cat : kindDefaultCat(plus ? 'inc' : 'out').id, note: mo.ok ? mo.note : '', title: mo.ok ? mo.note : sm, date };
  }
  if (type === 'habit') { const name = s.replace(HAB_RE, ' ').replace(/\s+/g, ' ').trim(), low = name.toLowerCase(); const g = HB_GUESS.find(([re]) => re.test(low));
    return { type, title: name.charAt(0).toUpperCase() + name.slice(1), emoji: g ? g[1] : '🎯' }; }
  if (type === 'note') return { type, title: s.charAt(0).toUpperCase() + s.slice(1) };
  // Цель: «выучить английский до 1 июня» — срок из фразы, иначе конец года
  if (type === 'goal') { const g = parseNL(s.replace(/(^|\s)до(?=\s+\d|\s+(конца|понедельника|вторника|среды|четверга|пятницы|субботы|воскресенья))/i, '$1'), t), title = g.found && g.title ? g.title : s;
    return { type, title: title.charAt(0).toUpperCase() + title.slice(1), due: g.date || t.slice(0, 4) + '-12-31' }; }
  const title = nl.found && nl.title ? nl.title : s, guessed = nl.cat || guessCat(title);
  const catId = S_.cat || guessed || validCat(null);
  return { type, title: title.charAt(0).toUpperCase() + title.slice(1), date: nl.date || S_.base || t, time: nl.time || '', time2: nl.time2 || '', cat: catId, catDflt: !S_.cat && !guessed, prio: S_.prio || prio || (ctx === 'tasks' && tPrio) || 'mid' };
}

// Что получится — «таблетками»: вид, название, дата, время, категория, приоритет (категорию и приоритет можно сменить нажатием)
function omPrevHTML(p, id, demo) {
  if (!p) return '';
  const chip = (html, cls, st) => `<span class="om-c${cls ? ' ' + cls : ''}"${st ? ` style="${st}"` : ''}>${html}</span>`;
  const btn = (act, html, cls, st, tip) => demo ? chip(html, cls, st) : `<button class="om-c om-keep${cls ? ' ' + cls : ''}" data-act="${act}" data-om="${id}"${st ? ` style="${st}"` : ''} title="${tip}">${html}</button>`;
  let kind = OM_T[p.type].n, title = p.title, parts = [];
  if (p.type === 'money') {
    if (!p.amt) return `<span class="om-warn">${I(IC.wallet, 14)} Добавьте сумму: «кафе 450», «+ зарплата 60 000»</span>`;
    const c = fcat(p.fcat), g = c.g; kind = g === 'inc' ? 'Доход' : g === 'sav' ? 'Накопление' : 'Расход';
    parts = [chip((g === 'inc' ? '+' : g === 'sav' ? '' : '−') + rub(p.amt), 'om-amt' + (g === 'inc' ? ' plus' : '')), chip(esc(c.emoji || '•') + ' ' + esc(c.name)), chip(I(IC.cal, 13) + esc(relDay(p.date)))];
  } else if (p.type === 'task' || p.type === 'event') {
    const c = cat(p.cat);
    parts = [chip(I(IC.cal, 13) + esc(relDay(p.date)))];
    if (p.time) parts.push(chip(I(IC.clock, 13) + esc(p.time + (p.time2 ? '–' + p.time2 : ''))));
    parts.push(btn('omcat', `<i></i>${esc(c.name)}`, 'ctag om-cat' + (p.catDflt ? ' dflt' : ''), `--c:${c.color}`, 'Сменить категорию'));
    if (p.type === 'task') parts.push(btn('omprio', esc(PRIO[p.prio].n), 'pbadge om-prio', `--c:${PRIO[p.prio].c}`, 'Сменить приоритет'));
  } else if (p.type === 'habit') parts = [chip(esc(p.emoji) + ' каждый день')];
  else if (p.type === 'goal') parts = [chip(I(IC.cal, 13) + 'до ' + esc(shortDate(p.due))), chip('шаги добавите в карточке цели')];
  else parts = [chip(I(IC.note, 13) + 'в журнал заметок · сегодня')];
  return `<span class="om-kind">${I(OM_T[p.type].ic, 14)}${kind}</span>${title ? `<b class="om-ttl">${esc(title)}</b>` : ''}${parts.join('')}${demo ? '' : `<button class="om-more om-keep" data-act="omfull" data-om="${id}">Подробнее…</button>`}`;
}
const omHint = st => `<span class="om-hint">${withHint(st.force ? 'Напишите и нажмите Enter' : st.ctx === 'tasks' ? 'Дата, время, <b>#категория</b> и <b>!</b> приоритет — прямо в тексте' : 'Пишите как говорите — Parsimony сам поймёт, что это: дело, встреча, трата или привычка', 'omni')}</span>`;

// Месяц, День, Задачи (не Главная и не окно «Добавить»): в покое — одна строка, кнопки вида записи и подсказка — по нажатию
// (аудит 18 октября 2026: строка с подсказкой занимала ~190 px на четырёх экранах, сетка «Дня» уходила ниже экрана).
// На Главной строка прежняя — пользователь 12 октября 2026 вернул её после пробы такой же «спокойной» строки
const omCalm = (id, ctx) => id !== 'oms' && (ctx === 'cal' || ctx === 'tasks');
function omniHTML(id, ctx) {
  const st = omSt(id); st.ctx = ctx;
  return `<div class="om${omCalm(id, ctx) ? ' calm' : ''}${omCalm(id, ctx) && (st.v || st.force) ? ' open' : ''}" data-om="${id}">
    <div class="om-box">${I(IC.spark, 19)}<input id="${id}" class="om-in" type="text" value="${esc(st.v)}" placeholder="${esc(st.force ? OM_T[st.force].ph : st.ph || OM_PH[ctx] || OM_PH.home)}" autocomplete="off" autocapitalize="sentences" enterkeyhint="done" aria-label="Быстрое добавление"><button class="om-go om-keep" data-act="omgo" data-om="${id}" aria-label="Добавить">${I(IC.plus, 20)}</button></div>
    <div class="om-types" role="group" aria-label="Что добавить"><button class="om-t om-ai om-keep" data-act="aiopen" data-om="${id}" title="Помощник: разложит сообщение по разделам">${I(IC.spark, 15)}Помощник</button>${OM_ORDER.filter(t => (ctx === 'home' || t === 'task' || t === 'event') && omOn(t)).map(t => `<button class="om-t om-keep" data-act="omtype" data-om="${id}" data-t="${t}" aria-pressed="false">${I(OM_T[t].ic, 15)}${OM_T[t].n}</button>`).join('')}</div>
    <div class="om-prev" id="${id}_prev" aria-live="polite"></div>
  </div>`;
}
function omUpdate(id) {
  const i = $('#' + id); if (!i) return;
  const st = omSt(id); st.v = i.value;
  if (!i.value.trim()) { st.cat = null; st.prio = null; }
  const p = omniParse(i.value, st.ctx, st.force, st), box = i.closest('.om'), prev = $('#' + id + '_prev');
  if (prev) prev.innerHTML = p ? omPrevHTML(p, id) : omHint(st);
  if (box) {
    box.classList.toggle('has', !!p);
    if (i.value || st.force) box.classList.add('open');   // «спокойная» строка: пишут — кнопки и разбор видны (даже если фокус пришёл без focusin)
    box.querySelectorAll('.om-t').forEach(b => { const on = p ? b.dataset.t === p.type : b.dataset.t === st.force; b.classList.toggle('on', on); b.classList.toggle('auto', on && !st.force); b.setAttribute('aria-pressed', on); });
  }
  i.placeholder = st.force ? OM_T[st.force].ph : st.ph || OM_PH[st.ctx] || OM_PH.home;
}
const omRefresh = () => $$('.om-in').forEach(i => omUpdate(i.id));
// Нажатие на «таблетку» не должно убирать курсор из строки (на ПК); на телефоне возвращаем фокус сами
let omFocusAt = 0, omFocusId = '';
document.addEventListener('focusout', e => { if (e.target.classList && e.target.classList.contains('om-in')) { omFocusAt = Date.now(); omFocusId = e.target.id; } });
document.addEventListener('mousedown', e => { if (e.target.closest && e.target.closest('.om-keep')) e.preventDefault(); });
const omRefocus = id => { const i = $('#' + id); if (i && document.activeElement !== i && (omFocusId === id && Date.now() - omFocusAt < 600 || isWide())) i.focus(); };

function omCreate(p) {
  if (p.type === 'task' || p.type === 'event') quickCreate(p.title, p.date, p.time, p.time2, p.cat, { task: p.type === 'task', prio: p.prio });
  else if (p.type === 'money') addOp({ amt:p.amt, cat:p.fcat, note:p.note, date:p.date });
  else if (p.type === 'habit') { snap(); S.habits.push({ id:'h' + uid(), name:p.title, emoji:p.emoji, kind:'daily', days:[], from:todayK(), log:{} }); save(); render(); toast('Привычка добавлена: ' + p.title, true); }
  else if (p.type === 'goal') { snap(); S.goals.push({ id:'g' + uid(), title:p.title, emoji:'🎯', due:p.due, created:todayK(), why:'', done:false, steps:[] }); save(); render(); toast(`Цель «${p.title}» создана — добавьте шаги в разделе «Цели»`, true); }
  else { addNoteToday(p.title); render(); toast('Заметка сохранена в журнал', true); }
}
function omGo(id) {
  const i = $('#' + id); if (!i) return;
  const st = omSt(id), p = omniParse(i.value, st.ctx, st.force, st);
  if (!p) { i.focus(); return toast('Напишите, что добавить'); }
  if (p.type === 'money' && !p.amt) { i.focus(); return toast('Добавьте сумму, например «кафе 450»'); }
  const inSheet = !!i.closest('#sh'), was = document.activeElement === i;
  omReset(st); i.value = '';
  if (inSheet) closeSheet();
  omCreate(p);
  if (!inSheet && was) { const n = $('#' + id); if (n) n.focus(); }
}
ACT.omgo = el => omGo(el.dataset.om);
ACT.omtype = el => { const id = el.dataset.om, st = omSt(id), t = el.dataset.t, i = $('#' + id);
  st.force = st.force === t ? null : t;
  omUpdate(id); omRefocus(id); if (i && !i.value) i.focus(); };
ACT.omcat = el => { const id = el.dataset.om, st = omSt(id), i = $('#' + id), p = i && omniParse(i.value, st.ctx, st.force, st); if (!p || !S.cats.length) return;
  const ix = S.cats.findIndex(c => c.id === p.cat); st.cat = S.cats[(ix + 1) % S.cats.length].id; omUpdate(id); omRefocus(id); };
ACT.omprio = el => { const id = el.dataset.om, st = omSt(id), i = $('#' + id), p = i && omniParse(i.value, st.ctx, st.force, st); if (!p) return;
  st.prio = PRIO_ORDER[(PRIO_ORDER.indexOf(p.prio) + 1) % PRIO_ORDER.length]; omUpdate(id); omRefocus(id); };
ACT.omex = el => { const id = el.dataset.om, i = $('#' + id); if (!i) return; i.value = el.dataset.v; omUpdate(id); i.focus(); };
// «Подробнее…» — та же запись, но в полной форме (повтор, напоминание, место, заметка)
ACT.omfull = el => {
  const id = el.dataset.om, st = omSt(id), i = $('#' + id), p = i && omniParse(i.value, st.ctx, st.force, st); if (!p) return;
  omReset(st); i.value = '';
  if (sheetOpen()) closeSheet();
  if (p.type === 'task' || p.type === 'event') openEvent(null, { title:p.title, date:p.date, time:p.time, time2:p.time2, cat:p.cat, task: p.type === 'task', prio:p.prio });
  else if (p.type === 'money') openOp(null, { cat:p.fcat, amt:p.amt, note:p.note, date:p.date });
  else if (p.type === 'habit') { openHabit(); hbForm.name = p.title; hbForm.emoji = HB_EMOJI.includes(p.emoji) ? p.emoji : hbForm.emoji; drawHabit(true); }
  else if (p.type === 'goal') openGoal(null, { title:p.title, due:p.due });
  else { openQuickNote(); const t = $('#qn_text'); if (t) t.value = p.title; }
};
document.addEventListener('input', e => { if (e.target.classList && e.target.classList.contains('om-in')) omUpdate(e.target.id); });
// «Спокойная» строка раскрывается при нажатии и сворачивается, если ушли с пустым полем (пауза — чтобы успело сработать нажатие на кнопку вида)
document.addEventListener('focusin', e => { const o = e.target.closest && e.target.closest('.om.calm'); if (o) o.classList.add('open'); });
document.addEventListener('focusout', e => { const o = e.target.closest && e.target.closest('.om.calm'); if (!o) return;
  setTimeout(() => { const i = o.querySelector('.om-in'), st = i && omSt(i.id); if (o.contains(document.activeElement) || !i || i.value.trim() || (st && st.force)) return; o.classList.remove('open'); }, 700); });
document.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing && e.target.classList && e.target.classList.contains('om-in')) { e.preventDefault(); omGo(e.target.id); } });

// Окно «Добавить» (кнопка «Создать», клавиша N): та же строка + примеры + полные формы
function openOmni(ctx) {
  const id = 'oms', st = omSt(id); omReset(st); st.ctx = ctx === 'cal' || ctx === 'tasks' ? ctx : 'home';
  sheet(`<div class="sh-head"><h3>Добавить</h3><button class="ic" data-act="close" aria-label="Закрыть">${I(IC.x, 18)}</button></div>
  ${omniHTML(id, st.ctx)}
  <div class="om-ex"><small>Например — нажмите, чтобы попробовать</small><div>${(OM_EX[st.ctx] || OM_EX.home).filter(x => { const p = omniParse(x, st.ctx, null, null, true); return p && omOn(p.type); }).map(x => `<button class="om-exb" data-act="omex" data-om="${id}" data-v="${esc(x)}">${esc(x)}</button>`).join('')}</div></div>
  <div class="om-ex"><small>Или заполните форму</small><div class="om-forms">${QUICK.map(([k, ic, n]) => `<button data-act="hmnew" data-k="${k}">${I(ic, 16)}${n}</button>`).join('')}</div></div>`);
  omUpdate(id);
  const i = $('#' + id); if (i) i.focus();
}

// ---- Главная: приветствие, строка ввода, затем блоки в порядке пользователя (js/layout.js: S.settings.home) ----
// Каждый блок — «открыт» (карточка), «свёрнут» (одна строка, открывается нажатием) или «скрыт».
const AREAS = [['tasks', IC.tasks, 'Дела и задачи'], ['cal', IC.cal, 'Календарь'], ['habits', IC.habit, 'Привычки'], ['fin', IC.wallet, 'Деньги']];
const pbadge = p => `<span class="pbadge" style="--c:${PRIO[p].c}">${PRIO[p].n}</span>`;
const habTile = (h, key, act) => { const on = !!h.log[key]; return `<button class="h2-hab${on ? ' on' : ''}" data-act="${act}" data-id="${h.id}" ${act === 'hmark' ? 'data-k' : 'data-key'}="${key}" aria-pressed="${on}"><span class="em">${esc(h.emoji || '•')}</span><span class="nm">${esc(h.name)}</span><i>${on ? I(IC.check, 14) : ''}</i></button>`; };
// Привычка на Главной — «таблетка»: значок и название, нажатие отмечает. Шесть привычек — две-три строки вместо пол-экрана
const habChip = (h, key, act = 'hmark') => { const on = !!h.log[key]; return `<button class="h2-hc${on ? ' on' : ''}" data-act="${act}" data-id="${h.id}" ${act === 'hmark' ? 'data-k' : 'data-key'}="${key}" aria-pressed="${on}"><span class="em">${esc(h.emoji || '•')}</span><span class="nm">${esc(h.name)}</span>${on ? I(IC.check, 13) : ''}</button>`; };
const secLink = (s, n) => secOn(s) ? `<button data-act="sec" data-s="${s}">${n} →</button>` : '';
const todayHabs = t => secOn('habits') ? hByKind('daily').filter(h => t >= hStart(h) && hDow(h, t)) : [];

// Содержимое блоков (без заголовка — его рисует homeBlock)
// Строка дела дня в «Плане на сегодня»
const evEndMin = e => timeMin(e.time2) != null && timeMin(e.time2) > timeMin(e.time) ? timeMin(e.time2) : timeMin(e.time) + 60;
function planRow(e, t, nx, nm) {
  const past = e.time && evEndMin(e) <= nm, pr = e.task ? prioOf(e) : '', next = nx && nx.k === t && nx.e.id === e.id;
  return `<div class="pl-row${e.time ? '' : ' nt'}${e.done ? ' done' : ''}${past && !e.done ? ' past' : ''}${next ? ' next' : ''}" style="--c:${cat(e.cat).color}">
      <span class="pl-tm">${e.time ? `<b>${esc(e.time)}</b>${e.time2 ? `<small>${esc(e.time2)}</small>` : ''}` : ''}</span>
      <button class="chk" data-act="toggle" data-id="${e.id}" data-d="${t}" aria-label="Выполнено">${e.done ? I(IC.check, 14) : ''}</button>
      <button class="pl-main" data-act="edit" data-id="${e.id}" data-d="${t}"><span class="pl-t">${esc(e.title)}</span><span class="pl-m">${next ? `<em class="pl-next">${esc(nx.label)}</em>` : ''}${catTag(e.cat)}${goalTag(e)}${pr === 'urgent' || pr === 'high' ? pbadge(pr) : ''}${e.rec ? '<span class="pl-rep" title="Повторяется">↻</span>' : ''}${e.loc ? `<span class="pl-loc">${esc(e.loc)}</span>` : ''}</span></button></div>`;
}
function homePlan(t) {
  const all = evOn(t), nm = nowMin(), nx = nextUp(t);
  const timed = all.filter(e => e.time).sort((a, b) => a.time.localeCompare(b.time));
  const untimed = all.filter(e => !e.time).sort((a, b) => a.done - b.done || prioRank(a) - prioRank(b));
  const MAX = 8, tShow = timed.slice(0, MAX), uShow = untimed.slice(0, Math.max(3, MAX - tShow.length)), rest = all.length - tShow.length - uShow.length;
  const row = e => planRow(e, t, nx, nm);
  const tm = evOn(addDays(t, 1)).length;
  return `${all.length ? `${tShow.length && uShow.length ? '<div class="pl-sub">По времени</div>' : ''}${tShow.map(row).join('')}
      ${uShow.length && tShow.length ? '<div class="pl-sub">Без времени</div>' : ''}${uShow.map(row).join('')}${rest > 0 ? `<button class="hm-more" data-act="pick" data-d="${t}">Ещё ${plural(rest, NEV)} →</button>` : ''}`
      : '<p class="h2-empty">На сегодня пусто. Напишите в строке выше — например, «позвонить маме в 18» или «купить продукты».</p>'}
    <div class="hm-foot"><span>${tm ? 'Завтра: ' + plural(tm, NEV) : 'На завтра пока пусто'}</span><span>${secLink('tasks', 'Задачи')}${secLink('cal', 'Календарь')}</span></div>`;
}
function homeHabits(t) {
  const habs = todayHabs(t), sk = habitStreaks(), show = habs.slice(0, 12);
  return `${habs.length ? `<div class="h2-hchips">${show.map(h => habChip(h, t)).join('')}${habs.length > show.length ? `<button class="h2-hc more" data-act="sec" data-s="habits">ещё ${habs.length - show.length} →</button>` : ''}</div>`
      : `<p class="h2-empty">Привычек пока нет. Начните с одной — напишите выше «привычка: 2 литра воды».</p>`}
    <div class="hm-foot"><span>${sk.cur > 1 ? `🔥 ${plural(sk.cur, NDAY)} подряд` : sk.best > 1 ? `Лучшая серия: ${plural(sk.best, NDAY)}` : ''}</span>${secLink('habits', 'Трекер')}</div>`;
}
function homeMoney(t) {
  const ym = ymOf(t), st = finStat(ym), lim = dailyLimit(st, ym);
  const ops = st.ops.filter(o => o.date === t).sort((a, b) => b.id.localeCompare(a.id));
  const spent = ops.filter(o => FG_OUT.includes(fcat(o.cat).g)).reduce((a, o) => a + o.amt, 0);
  const bar = st.spentPlan ? `<div class="f2-bar"><div class="ds-bar${st.spent > st.spentPlan ? ' over' : ''}"><i style="width:${Math.min(100, Math.round(st.spent / st.spentPlan * 100))}%"></i></div><span>Расходы за месяц: ${rub0(st.spent)} из ${rub0(st.spentPlan)}</span></div>` : '';
  return `<div class="h2-big${lim && lim.left < 0 ? ' neg' : ''}"><small>${lim ? withHint('Можно потратить сегодня', 'limit') : 'Потрачено сегодня'}</small><b>${lim ? rub0(Math.max(0, lim.left)) : rub0(spent)}</b>
      <span>${lim ? (lim.left >= 0 ? `лимит ${rub0(lim.limit)} в день · сегодня ${rub0(lim.today)}` : `лимит превышен на ${rub0(-lim.left)}`) : '<button class="lnk" data-act="finbudget">Задайте бюджет — появится дневной лимит</button>'}</span></div>
    ${bar}
    ${ops.length ? `<div class="hm-ops">${ops.slice(0, 3).map(o => { const c = fcat(o.cat), plus = c.g === 'inc'; return `<button class="hm-op" data-act="opedit" data-id="${o.id}"><span class="em">${esc(c.emoji || '•')}</span><span class="n">${esc(o.note || c.name)}</span><b class="${plus ? 'plus' : ''}">${plus ? '+' : '−'}${rub0(o.amt)}</b></button>`; }).join('')}</div>` : ''}
    <div class="hm-foot"><span>${ops.length ? '' : 'Трату можно записать в строке выше: «кафе 450»'}</span>${secLink('fin', 'Финансы')}</div>`;
}
// Часы — 6…9 и «…»: своё число (2 часа, 5,5…) в окне выбора; оно же и показывается на «…» (правка бета-тестеров 17 октября 2026)
const homeBio = t => { const M = S.bio.metrics; return `<div class="hm-bio">${M.map(m => { const v = bioVal(t, m.id), hrs = m.type === 'hours', opts = hrs ? [6, 7, 8, 9] : [1, 2, 3, 4, 5], own = v != null && !opts.includes(v);
    return `<div class="hm-bm"><span class="nm">${esc(m.emoji || '')} ${esc(m.name)}</span><div class="hm-sc">${opts.map(o => `<button class="${v === o ? 'on' : ''}" data-act="hmbio" data-m="${m.id}" data-v="${o}" aria-label="${esc(m.name)}: ${o}" aria-pressed="${v === o}">${o}</button>`).join('')}${hrs ? `<button class="hm-own${own ? ' on' : ''}" data-act="bioset" data-m="${m.id}" data-k="${t}" aria-label="${esc(m.name)}: своё число" title="Своё число">${own ? fmtNum(v) : '…'}</button>` : ''}</div></div>`; }).join('')}</div>
    <div class="hm-foot"><button data-act="bioedit">Настроить</button>${secLink('habits', 'Подробнее')}</div>`; };
const homeGoals = () => `${goalsMiniHTML(3)}<div class="hm-foot"><button data-act="gnewh">+ Цель</button><button data-act="gall">Все цели →</button></div>`;
const homeNotes = () => { const last = notesOf('')[0]; return `<textarea id="hm_note" class="fin hn-text" placeholder="Что сегодня получилось? Что мешало? О чём подумать завтра?" aria-label="Заметка">${esc(hmNoteDraft)}</textarea>
    <div class="nt-bar"><small>${last ? 'Последняя: ' + esc(fmtLong(last.date)) : 'Сохранится в журнал с сегодняшней датой'}</small><span><button class="pill sm" data-act="ntall">Все заметки</button> <button class="btn pri" data-act="hmnote">Сохранить</button></span></div>`; };

// Блок Главной: сводка для заголовка и содержимое. def — открыт ли свёрнутый блок по умолчанию (цели — когда они есть)
function homeBlockDef(k, t) {
  if (k === 'plan') { const all = evOn(t), dn = all.filter(e => e.done).length; return { sum: all.length ? dn + ' из ' + all.length : 'пусто', body: () => homePlan(t) }; }
  if (k === 'habits') { const h = todayHabs(t); return { sum: h.length ? h.filter(x => x.log[t]).length + ' из ' + h.length : 'нет привычек', body: () => homeHabits(t) }; }
  if (k === 'money') { const ym = ymOf(t), st = finStat(ym), lim = dailyLimit(st, ym); return { sum: lim ? 'можно ' + rub0(Math.max(0, lim.left)) : 'за месяц ' + rub0(st.spent), body: () => homeMoney(t) }; }
  if (k === 'bio') { const M = S.bio.metrics, f = M.filter(m => bioVal(t, m.id) != null).length; return { sum: f ? `сегодня ${f} из ${M.length}` : 'как вы сегодня?', body: () => homeBio(t) }; }
  if (k === 'goals') { const ga = activeGoals(), late = ga.reduce((n, g) => n + goalStat(g).late.length, 0);
    return { sum: ga.length ? `${plural(ga.length, ['активная', 'активные', 'активных'])}${late ? ` · просрочено шагов: ${late}` : ''}` : 'пока нет', body: homeGoals, def: () => ga.length > 0 }; }
  return { sum: S.notes.length ? plural(S.notes.length, ['заметка', 'заметки', 'заметок']) : 'журнал пуст', body: homeNotes };
}
// В открытой карточке сводка не повторяет то, что видно внутри: у «Денег» — месяц (сумма и так крупно), у пустого плана — ничего
const homeCardSum = (k, d, t) => k === 'money' ? MON[Number(t.slice(5, 7)) - 1].toLowerCase() : k === 'plan' && !evOn(t).length ? '' : d.sum;
function homeBlock(x, t) {
  const b = HOME_BL[x.k], d = homeBlockDef(x.k, t);
  if (x.m === 'fold') return foldHTML('h-' + x.k, b.n, d.sum, d.body, d.def || false, { card:true, ic:b.ic, cls:'h2-blk' });
  return `<div class="card h2-card h2-blk" data-blk="${x.k}"><div class="h2-h"><b>${I(b.ic, 18)}${b.n}</b><small>${homeCardSum(x.k, d, t)}</small></div>${d.body()}</div>`;
}
// Варианты Б «Лента дня» и В «Плитки» сравнивали 12 октября 2026 (коммит 7d28a30); выбран А, их код убран
onMigrate(() => { delete S.settings.homeView; });
// Внизу Главной — «Настроить Главную» и «Отзыв»
const homeCustHTML = () => `<div class="h2-cust"><button class="lnk" data-act="blkcust" data-p="home">${I(IC.grid, 15)} Настроить Главную</button><button class="lnk" data-act="feedback">${I(IC.msg, 15)} Отзыв</button></div>`;

// Приветствие с кольцом
function homeHeroHTML(t) {
  const d = pd(t), name = (S.settings.name || '').trim();
  const tasks = secOn('tasks') || secOn('cal') ? dayTasks(t) : [], habs = todayHabs(t);
  const total = tasks.length + habs.length, done = tasks.filter(e => e.done).length + habs.filter(h => h.log[t]).length, pct = total ? done / total : 0;
  return `<div class="h2-hero">
    <div class="h2-hi"><div class="h2-date">${DOWF[dowIdx(t)]}, ${d.getDate()} ${MONG[d.getMonth()]}</div>
      <h2 class="h2-greet">${greet()}${name ? ', ' + esc(name) : ''}</h2><p class="h2-line">${esc(DAY_LINES[dnum(t) % DAY_LINES.length])}</p></div>
    <div class="h2-ring" title="Задачи и привычки на сегодня">${ringSVG(pct, 64, 'var(--good)', total ? Math.round(pct * 100) + '%' : '—', '')}<small>${withHint(total ? 'дела и привычки' : 'пока пусто', 'ring')}</small></div></div>`;
}

// ---- Вид Главной на телефоне (проба 20 октября 2026, «Главная короче»: сейчас ~2,4 экрана) ----
// «Как было» — блоки подряд; «Вкладки» (вариант В) — один блок за раз, вкладки в порядке «Настроить Главную», свайп листает вкладки.
// Дальше — «Плотнее» (вариант А). На ПК — всегда две колонки
const HOME_LAY = [['blocks', 'Как было'], ['tabs', 'Вкладки']];
const homeLay = () => innerWidth < 900 && HOME_LAY.some(x => x[0] === S.settings.homeLay) ? S.settings.homeLay : 'blocks';
onMigrate(() => { if (S.settings.homeLay === undefined && IS_BETA) S.settings.homeLay = 'tabs'; });   // на бете проба видна сразу
const HOME_TAB_N = { plan:'План', habits:'Привычки', money:'Деньги', goals:'Цели', bio:'Самочувствие', notes:'Мысли дня' };
const homeTab = () => { const l = homeOrder(); return (l.find(x => x.k === S.settings.homeTab) || l[0] || {}).k; };
function homeTabsHTML(t) {
  const list = homeOrder(), k = homeTab(); if (!k) return '';
  const d = homeBlockDef(k, t), sum = k === 'money' ? '' : homeCardSum(k, d, t);   // у «Денег» сумма и так крупно
  return `<div class="seg2 h2-tabs" role="tablist" aria-label="Что показать">${list.map(x => `<button class="${x.k === k ? 'on' : ''}" data-act="htab" data-k="${x.k}" role="tab" aria-selected="${x.k === k}">${HOME_TAB_N[x.k]}</button>`).join('')}</div>
    <div class="card h2-card h2-blk h2-tab" data-blk="${k}" role="tabpanel" aria-label="${HOME_BL[k].n}">${sum ? `<div class="h2-tsum">${esc(sum)}</div>` : ''}${d.body()}</div>`;
}
ACT.htab = el => { S.settings.homeTab = el.dataset.k; save(); render(); const b = $(`.h2-tabs [data-k="${el.dataset.k}"]`); if (b) b.scrollIntoView({ block:'nearest', inline:'nearest' }); };
ACT.homelay = el => { S.settings.homeLay = el.dataset.v; save(); render(); };
// Переключатель вида — внизу Главной на телефоне, пока идёт проба
const homeLayHTML = () => innerWidth < 900 ? `<div class="h2-lay"><span>Вид Главной</span><div class="seg2">${HOME_LAY.map(([v, n]) => `<button class="${homeLay() === v ? 'on' : ''}" data-act="homelay" data-v="${v}" aria-pressed="${homeLay() === v}">${n}</button>`).join('')}</div></div>` : '';

function homeHTML() {
  // Главная — середина между прежней и вариантом А (12 октября 2026): привычки «таблетками», строка ввода и деньги как раньше
  const t = todayK(), hero = homeHeroHTML(t), tabs = homeLay() === 'tabs';
  const omni = `<div class="card h2-omni">${omniHTML('om', 'home')}</div>`;
  const miss = secOn('tasks') || secOn('cal') ? missedBar(!tabs, tabs) : '';   // во вкладках — тонкой строкой
  const blocks = tabs ? homeTabsHTML(t) : homeOrder().map(x => homeBlock(x, t)).join('');
  return `${hero}<div class="h2-cols"><div class="h2-col">${omni}${miss}${blocks}</div><div class="h2-col"></div></div>
  ${homeCustHTML()}${homeLayHTML()}`;
}


// ---- Задачи (12 октября 2026, шаг 3 редизайна). Выбор пользователя: на ПК — список по срокам (вариант А),
// на телефоне — полоска недели и задачи выбранного дня (вариант Б). Статистика и доска недели — блоками ниже / справа.
// Вкладки: «По срокам» (ПК) или «Неделя» (телефон) · «Все» (фильтры) · «Цели» ----
let tView = 'main';
// Строка задачи: кружок цвета важности (срочно — красный, высокий — фиолетовый, остальные — серый), точка календаря, название, справа время или дата.
// Без второй строки меток — список вдвое ниже
const t3Ring = p => p === 'urgent' || p === 'high' ? PRIO[p].c : 'var(--mut)';
function t3Row(e, k, meta, metaCls) {
  const done = isDone(e, k), pr = prioOf(e), c = cat(e.cat);
  return `<div class="t3-row${done ? ' done' : ''}${pr === 'urgent' || pr === 'high' ? ' p-' + pr : ''}">
    <button class="t3-ck" data-act="toggle" data-id="${e.id}" data-d="${k}" style="--pc:${t3Ring(pr)}" aria-label="${done ? 'Снять отметку' : 'Выполнено'} · важность: ${PRIO[pr].n}" title="Важность: ${PRIO[pr].n}">${done ? I(IC.check, 12) : ''}</button>
    <button class="t3-main" data-act="edit" data-id="${e.id}" data-d="${k}"><i class="t3-dot" style="background:${c.color}" title="${esc(c.name)}"></i><span class="t3-t">${esc(e.title)}</span>${isRec(e) ? '<i class="t3-rep" title="Повторяется">↻</i>' : ''}${goalTag(e)}</button>
    ${meta ? `<span class="t3-meta${metaCls ? ' ' + metaCls : ''}">${meta}</span>` : ''}</div>`;
}
const daySort = l => [...l].sort((a, b) => a.done - b.done || prioRank(a) - prioRank(b) || (a.time || '99').localeCompare(b.time || '99'));
const t3Head = (n, sum, cls, btn) => `<div class="t3-gh${cls ? ' ' + cls : ''}"><b>${n}</b>${sum ? `<small>${sum}</small>` : ''}${btn || ''}</div>`;

ACT.t3latetoday = () => { const t = todayK(), l = missedList().filter(e => e.task); if (!l.length) return;
  snap(); l.forEach(e => { e.date = t; }); save(); render(); toast(`Перенесено на сегодня: ${plural(l.length, ['задача', 'задачи', 'задач'])}`, true); };

// Телефон: полоска недели (неделя — по выбранному дню sel; стрелки в шапке листают недели, свайп — дни) и задачи выбранного дня
function tasksWeekStrip() {
  const t = todayK();
  return `<div class="t3-strip" role="tablist" aria-label="Дни недели">${taskWeek().map(k => { const l = dayTasks(k), left = l.filter(e => !e.done).length, d = pd(k);
    const marks = !l.length ? '' : !left ? I(IC.check, 11) : '<i></i>'.repeat(Math.min(3, left));
    return `<button class="t3-day${k === sel ? ' on' : ''}${k === t ? ' today' : ''}${k < t ? ' past' : ''}" data-act="t3day" data-d="${k}" role="tab" aria-selected="${k === sel}" aria-label="${esc(fmtLong(k))}: ${l.length ? left ? 'осталось ' + left : 'всё сделано' : 'задач нет'}"><small>${DOW[dowIdx(k)].toLowerCase()}</small><b>${d.getDate()}</b><span class="t3-marks${l.length && !left ? ' ok' : ''}">${marks}</span></button>`; }).join('')}</div>`;
}
function tasksDayList(k) {
  const t = todayK(), l = daySort(dayTasks(k)), dn = l.filter(e => e.done).length, d = pd(k);
  const ttl = `${DOWF[dowIdx(k)]}, ${d.getDate()} ${MONG[d.getMonth()]}${k === t ? ' · сегодня' : k === addDays(t, 1) ? ' · завтра' : ''}`;
  return `${t3Head(withHint(ttl, 'taskDay'), l.length ? `${dn} из ${l.length}` : '')}${l.length ? l.map(e => t3Row(e, k, e.time ? esc(e.time) : '')).join('')
    : `<p class="t3-empty">${k < t ? 'В этот день задач не было.' : 'Свободный день — задачу можно добавить выше.'}</p>`}`;
}
ACT.t3day = el => { sel = el.dataset.d; syncMini(); render(); };

// ---- ПК, вариант В «Фокус дня» (15 октября 2026; пользователь: «на компьютере интерфейс задач неудобный и не привлекает глаз»).
// Слева — выбранный день (по умолчанию сегодня) крупно: прогресс, строка ввода, несделанное цветными карточками, сделанное строками;
// под ним «Дальше» — ближайшие дни с задачами. Справа — неделя столбиками (нажатие выбирает день), просроченное и цели; статистика — ниже на всю ширину.
// Решение пользователя 15 октября 2026: оставить В. Список «по срокам» (вариант А от 12 октября) и «Три панели» (вариант Б, коммит b31405b) убраны ----
onMigrate(() => { delete S.settings.tLay; });   // настройка вида из пробы «Трёх панелей»
function t4Card(e, k) {
  const c = cat(e.cat), pr = prioOf(e), hot = pr === 'urgent' || pr === 'high';
  return `<div class="t4-card" style="--c:${c.color}">
    <button class="t4-ck" data-act="toggle" data-id="${e.id}" data-d="${k}" aria-label="Выполнено: ${esc(e.title)}"></button>
    <button class="t4-main" data-act="edit" data-id="${e.id}" data-d="${k}">
      <span class="t4-top">${hot ? `<em class="t4-pr" style="--pc:${PRIO[pr].c}">${PRIO[pr].n.toLowerCase()}</em>` : ''}${e.time ? `<span>${timeRange(e)}</span>` : ''}${isRec(e) ? '<span title="Повторяется">↻</span>' : ''}</span>
      <b class="t4-t">${esc(e.title)}</b>
      <span class="t4-sub"><i></i>${esc(c.name)}${goalTag(e)}</span>
    </button></div>`;
}
function t4Hero(k) {
  const t = todayK(), l = dayTasks(k), open = daySort(l.filter(e => !e.done)), done = l.filter(e => e.done), d = pd(k);
  const rd = relDay(k), when = /^[а-я]+$/.test(rd) ? rd : '';   // вчера, сегодня, завтра, послезавтра
  return `<div class="card t4-hero">
    <div class="t4-head"><h2>${DOWF[dowIdx(k)]}, ${d.getDate()} ${MONG[d.getMonth()]}</h2>${when ? `<span class="t4-when${k === t ? ' today' : ''}">${when}</span>` : ''}${k !== t ? '<button class="lnk t4-back" data-act="today">← к сегодня</button>' : ''}
      <span class="t4-cnt">${l.length ? withHint(`${done.length} из ${l.length} сделано`, 'focusDay') : hintK('focusDay')}</span></div>
    ${l.length ? `<div class="ds-bar t4-prog"><i style="width:${Math.round(done.length / l.length * 100)}%"></i></div>` : ''}
    ${omniHTML('omt', 'tasks')}
    ${open.length ? `<div class="t4-cards">${open.map(e => t4Card(e, k)).join('')}</div>`
      : `<p class="t4-empty">${l.length ? 'Всё на этот день сделано. Можно взять что-нибудь из «Дальше».' : k < t ? 'В этот день задач не было.' : 'На этот день задач нет — напишите в строке выше.'}</p>`}
    ${done.length ? `${t3Head('Сделано', String(done.length))}${done.map(e => t3Row(e, k, e.time ? esc(e.time) : '')).join('')}` : ''}
  </div>`;
}
// Ближайшие дни после выбранного, в которых есть несделанные задачи (до четырёх дней за две недели)
function t4Next(from) {
  const t = todayK(), cols = [];
  for (let i = 1; i <= 14 && cols.length < 4; i++) { const k = addDays(from, i), l = daySort(dayTasks(k).filter(e => !e.done)); if (l.length) cols.push([k, l]); }
  const nm = k => { const d = pd(k); return k === addDays(t, 1) ? 'Завтра' : `${DOW[dowIdx(k)]}, ${d.getDate()} ${MONS[d.getMonth()]}`; };
  return `<div class="card t3-list t4-next"><div class="h2-h"><b>${I(IC.right, 18)}${withHint('Дальше', 'nextDays')}</b><small></small></div>
    ${cols.length ? `<div class="t4-ncols">${cols.map(([k, l]) => `<div class="t4-ncol"><button class="t4-nh" data-act="t3day" data-d="${k}" title="Показать этот день крупно"><b>${nm(k)}</b><small>${l.length}</small></button>
      ${l.slice(0, 5).map(e => t3Row(e, k, e.time ? esc(e.time) : '')).join('')}${l.length > 5 ? `<button class="t3-more" data-act="t3day" data-d="${k}">ещё ${l.length - 5}</button>` : ''}</div>`).join('')}</div>`
      : '<p class="t3-empty">В ближайшие две недели задач нет.</p>'}
    <div class="hm-foot"><span></span><button data-act="tview" data-v="all">Все задачи →</button></div></div>`;
}
// Неделя столбиками: высота — сколько задач, зелёное — сколько сделано; нажатие показывает день слева
function t4Week() {
  const t = todayK(), data = taskWeek().map(k => { const l = dayTasks(k); return { k, n: l.length, d: l.filter(e => e.done).length }; });
  const max = Math.max(3, ...data.map(x => x.n)), tot = data.reduce((a, x) => a + x.n, 0), dn = data.reduce((a, x) => a + x.d, 0);
  return `<div class="card t4-week"><div class="h2-h"><b>${I(IC.cal, 18)}${withHint('Неделя', 'weekBars')}</b><small>${tot ? `${dn} из ${tot}` : ''}</small></div>
    <div class="t4-bars">${data.map(x => { const h = x.n ? Math.max(14, Math.round(x.n / max * 100)) : 6;
      return `<button class="t4-bar${x.k === sel ? ' on' : ''}${x.k === t ? ' today' : ''}${x.k < t ? ' past' : ''}" data-act="t3day" data-d="${x.k}" aria-label="${esc(fmtLong(x.k))}: ${x.n ? `сделано ${x.d} из ${x.n}` : 'задач нет'}"><span class="t4-col"><u style="height:${h}%"></u><i style="height:${x.n ? Math.round(h * x.d / x.n) : 0}%"></i></span><small>${DOW[dowIdx(x.k)].toLowerCase()} ${pd(x.k).getDate()}</small><b>${x.n ? `${x.d}/${x.n}` : '—'}</b></button>`; }).join('')}</div></div>`;
}
function t4Late() {
  const l = missedList().filter(e => e.task); if (!l.length) return '';
  return `<div class="card t3-list t4-late"><div class="h2-h"><b>${I(IC.alert, 18)}${withHint('Просрочено', 'missed')}</b><small>${plural(l.length, ['задача', 'задачи', 'задач'])}</small></div>
    ${l.slice(0, 6).map(e => t3Row(e, e.date, esc(shortDate(e.date)), 'late')).join('')}${l.length > 6 ? `<button class="t3-more" data-act="tview" data-v="all">ещё ${l.length - 6} → все задачи</button>` : ''}
    <div class="hm-foot"><span></span><button data-act="t3latetoday">Все на сегодня</button></div></div>`;
}

function tasksHTML() {
  const t = todayK(), wide = isWide(), hasAny = S.events.some(e => e.task), demo = S.events.some(e => e.demo);
  const gLate = activeGoals().reduce((n, g) => n + goalStat(g).late.length, 0), lateN = missedList().filter(e => e.task).length;
  // «План» на телефоне: день по часам и задачи дня — в Календаре, здесь только «Все» и «Цели»
  if (planOn() && tView === 'main') tView = 'all';
  const views = [['main', wide ? 'Фокус дня' + (lateN ? ` <em class="late">${lateN}</em>` : '') : 'Неделя'], ['all', 'Все'], ['goals', 'Цели' + (gLate ? ` <em class="late">${gLate}</em>` : '')]];
  const tabs = `<div class="seg2 t2-seg" role="tablist" aria-label="Что показать">${views.filter(([v]) => !(planOn() && v === 'main')).map(([v, n]) => `<button class="${tView === v ? 'on' : ''}" data-act="tview" data-v="${v}" role="tab" aria-selected="${tView === v}">${n}</button>`).join('')}</div>`;
  // Вкладка «Цели» — та же страница целей (js/goals.js), что и раньше была отдельным разделом
  if (tView === 'goals') return `${missedBar(false, true)}${tabs}${goalsHTML()}`;
  // Строка ввода на телефоне добавляет задачу на выбранный день; стоит между полоской дней и списком (правка пользователя 15 октября 2026)
  // На ПК («Фокус дня») — на день, который показан крупно
  const st = omSt('omt'); st.base = tView === 'main' && sel !== t ? sel : null;
  st.ph = st.base ? `Задача на ${relDay(st.base)}…` : null;
  const omni = `<div class="card h2-omni">${omniHTML('omt', 'tasks')}</div>`;
  let list;
  if (tView === 'all') {
    const rows = taskRows(), fl = [['active', 'Активные'], ['done', 'Выполненные'], ['all', 'Все']];
    list = `${omni}<div class="card t3-list"><div class="t2-flt"><div class="seg2">${fl.map(([v, n]) => `<button class="${tFilter === v ? 'on' : ''}" data-act="tfilter" data-f="${v}">${n}</button>`).join('')}</div>
      <div class="t2-prios">${PRIO_ORDER.map(p => `<button class="tk-pr${tPrio === p ? ' on' : ''}" data-act="tprio" data-p="${p}" style="--c:${PRIO[p].c}" aria-pressed="${tPrio === p}"><i></i>${PRIO[p].n}</button>`).join('')}${hintK('taskRing')}</div></div>
      ${rows.slice(0, 80).map(({ e, k, done }) => { const [lt, lc] = leftTxt(k, done); return t3Row(e, k, esc(shortDate(k)) + (lt && !done && lc ? ' · ' + lt : ''), lc); }).join('') || `<p class="t3-empty">${tFilter === 'done' ? 'Выполненных задач пока нет.' : 'Задач нет — напишите первую в строке выше.'}</p>`}
      ${rows.length > 80 ? `<p class="t3-empty">Показаны первые 80 из ${rows.length}</p>` : ''}</div>`;
  } else list = wide ? '' : `${tasksWeekStrip()}${omni}<div class="card t3-list">${tasksDayList(sel)}</div>`;
  const act = tasksAll().map(e => ({ e, k: isRec(e) ? nextOcc(e) : e.date })).filter(x => !isDone(x.e, x.k)), urg = act.filter(x => prioOf(x.e) === 'urgent').length;
  const wk = taskWeek();
  // Доска недели на телефоне в «Неделе» не нужна — её заменяет полоска дней, на ПК в «Фокусе дня» — столбики недели и «Дальше».
  // На ПК доска — на всю ширину под двумя колонками: в узкой правой колонке семи дням тесно (правка пользователя 12 октября 2026).
  // Статистика на ПК тоже на всю ширину — и в «Фокусе дня», и во «Все» (правки 15 октября: «слишком зажата», «на „Все“ кривовато»).
  // В правой колонке остаются только цели
  const blk = () => pageBlocks('tasks', {   // порядок блоков — js/layout.js
    list:{ skip:true },
    board:{ fk:'t-board', sum:`неделя ${isoWeek(wk[0])}`, body: () => `<div class="card tw-card">${weekBoard()}</div>`, def:isWide, skip: tView === 'main' },
    stats:{ fk:'t-stats', sum:`${plural(act.length, ['активная', 'активные', 'активных'])}${urg ? ` · ${urg} срочн.` : ''}`, body: () => `<div class="tk-stats"><div class="tk-mid2">${taskSummary()}${taskDynamics()}</div></div>` } }, { noCust:true });
  const blocks = wide ? '' : blk();   // на ПК доска и статистика идут под колонками
  const empty = !hasAny ? emptyCard('tasks', 'Задачи', 'Пишите задачи обычной фразой в строке ввода: «позвонить маме», «отчёт в пятницу #работа !!». Задача с датой видна и в календаре.') : '';
  // На ПК пропущенное — в самом списке («Просрочено»), отдельная плашка не повторяет его
  const miss = wide && tView === 'main' ? '' : missedBar(false, true);
  const goalsCard = secOn('tasks') && activeGoals().length ? `<div class="card t3-goals"><div class="h2-h"><b>${I(IC.goal, 18)}Цели</b><small>${gLate ? `<span class="late">просрочено шагов: ${gLate}</span>` : ''}</small></div>${goalsMiniHTML(3)}<div class="hm-foot"><span></span><button data-act="gall">Все цели →</button></div></div>` : '';
  // ПК, «Фокус дня»: доски недели нет — её заменяют столбики недели и «Дальше»
  if (wide && tView === 'main') return `${demoBar('tasks', demo)}${empty}${tabs}
    <div class="t4-grid"><div class="t4-l">${t4Hero(sel)}${t4Next(sel)}</div><div class="t4-r">${t4Week()}${t4Late()}${goalsCard}</div></div>${blk()}${pageCust('tasks')}`;
  if (wide) return `${miss}${demoBar('tasks', demo)}${empty}${tabs}
    <div class="t3-cols${goalsCard ? '' : ' one'}"><div class="t3-col">${list}</div>${goalsCard ? `<div class="t3-col">${goalsCard}</div>` : ''}</div>${blk()}${pageCust('tasks')}`;
  return `${miss}${demoBar('tasks', demo)}${empty}${tabs}${list}${blocks}${pageCust('tasks')}`;
}
ACT.tview = el => { tView = el.dataset.v; render(); };
// На вкладке «Цели» шапка, «Создать» и подсказка в шапке — про цели, стрелок недели нет
const tasksGoals = () => sec === 'tasks' && tView === 'goals';
const useOmni = () => sec === 'home' || sec === 'cal' || (sec === 'tasks' && tView !== 'goals');
Object.defineProperty(SEC.tasks, 'newLabel', { get: () => tasksGoals() ? 'Цель' : 'Задача', configurable: true });
Object.defineProperty(SEC.tasks, 'noNav', { get: () => tasksGoals() || planOn(), configurable: true });   // в «Плане» задачи не зависят от недели
{ const T = SEC.tasks, title = T.title, create = T.create;
  T.title = () => tasksGoals() ? SEC.goals.title() : planOn() ? 'Задачи' : title();
  T.create = () => tasksGoals() ? openGoal() : create();
  // «Важные задачи» в боковой панели повторяли бы «Фокус дня» (срочное — карточками, цели — справа)
  const side = T.side; T.side = () => tView === 'main' ? '' : side();
  // Свайп на телефоне в «Неделе» листает дни (стрелки в шапке — недели)
  T.swipe = n => { if (planOn()) return; if (!isWide() && tView === 'main') { sel = addDays(sel, n); syncMini(); render(); } else move(n); }; }

// ---- Финансы: крупно — сколько можно потратить, строка записи, последние записи; графики и таблицы — свёрнуты ----
const f2Row = o => { const c = fcat(o.cat), plus = c.g === 'inc', t = todayK();
  return `<div class="fh-row"><button class="fh-main" data-act="opedit" data-id="${o.id}"><span class="em">${esc(c.emoji || '•')}</span><span class="fh-t"><b>${esc(o.note || c.name)}</b><small>${esc(dayDiff(t, o.date) >= -1 && o.date <= t ? relDay(o.date) : shortDate(o.date))} · ${esc(o.note ? c.name : FG[c.g].n)}</small></span><b class="fh-a${plus ? ' plus' : ''}">${plus ? '+' : c.g === 'sav' ? '' : '−'}${rub(o.amt)}</b></button></div>`; };
function financeHTML() {
  const ym = secYM, st = finStat(ym), lim = dailyLimit(st, ym), demo = S.fin.ops.some(o => o.demo), noPlans = !S.fin.cats.some(c => c.plan);
  const t = todayK(), cur = ymOf(t) === ym, mon = MONG[Number(ym.slice(5)) - 1];
  const big = lim ? { l:'Можно потратить сегодня', v: rub0(Math.max(0, lim.left)), s: lim.left >= 0 ? `лимит ${rub0(lim.limit)} в день · сегодня потрачено ${rub0(lim.today)}` : `лимит превышен на ${rub0(-lim.left)}`, neg: lim.left < 0 }
    : { l: cur ? 'Потрачено в этом месяце' : 'Потрачено за месяц', v: rub0(st.spent), s: noPlans ? '<button class="lnk" data-act="finbudget">Задайте бюджет — появится дневной лимит</button>' : '' };
  const bar = st.spentPlan ? `<div class="f2-bar"><div class="ds-bar${st.spent > st.spentPlan ? ' over' : ''}"><i style="width:${Math.min(100, Math.round(st.spent / st.spentPlan * 100))}%"></i></div><span><span>Расходы ${rub0(st.spent)} из ${rub0(st.spentPlan)}</span><span>${cur ? 'до конца месяца ' + plural(ymDays(ym).filter(k => k >= t).length, NDAY) : ''}</span></span></div>` : '';
  const hero = `<div class="card f2-hero${big.neg ? ' neg' : ''}"><div class="f2-top"><small class="f2-l">${lim ? withHint(big.l, 'limit') : big.l}</small><button class="pill sm" data-act="finbudget">${I(IC.wallet, 14)} Бюджет</button></div><b class="f2-big">${big.v}</b><span class="f2-s">${big.s}</span>${bar}
    <div class="f2-mini"><div><small>Доходы</small><b class="plus">${rub0(st.g.inc.fact)}</b></div><div><small>Накопления</small><b>${rub0(st.g.sav.fact)}</b></div><div class="${st.left < 0 ? 'neg' : ''}"><small>Осталось</small><b>${rub0(st.left)}</b></div></div></div>`;
  const input = `<div class="card fq-card f2-in">
    <div class="f2-kh"><div class="seg2 fq-kind" role="group" aria-label="Что записать">${OP_KINDS.map(([k, n]) => `<button class="${finKind === k ? 'on' : ''}" data-act="fqkind" data-k="${k}" aria-pressed="${finKind === k}">${n}</button>`).join('')}</div>${hintK('finKind')}</div>
    <div class="om-box">${I(IC.spark, 19)}<input id="fq_in" class="om-in-fin" type="text" placeholder="${FIN_PH[finKind]}" autocomplete="off" enterkeyhint="done" aria-label="Быстрая запись"><button class="om-go" data-act="fqadd" aria-label="Записать">${I(IC.plus, 20)}</button></div>
    <div id="fq_hint" class="nlhint"></div><button class="f2-more" data-act="opnew">Подробная форма…</button></div>`;
  const ops = [...st.ops].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const recent = `<div class="card"><div class="h2-h"><b>Последние записи</b><small>${ops.length ? plural(ops.length, ['запись', 'записи', 'записей']) + ' за месяц' : ''}</small></div>
    ${ops.slice(0, 6).map(f2Row).join('') || `<p class="h2-empty">Записей за ${mon} нет. Напишите трату в строке выше — например, «продукты 1200».</p>`}
    ${ops.length > 6 ? `<button class="hm-more" data-act="f2hist">Вся история →</button>` : ''}</div>`;
  const top = topBuys(ym, 1)[0];
  return `${demoBar('fin', demo)}
  ${!S.fin.ops.length && noPlans ? emptyCard('fin', 'Финансы', 'Записывайте каждую трату: «кафе 450», «такси 380». Задайте бюджет — приложение посчитает остаток и дневной лимит до конца месяца.') : ''}
  ${pageBlocks('fin', {   // порядок блоков — js/layout.js
    main:{ body: () => `<div class="f2-grid"><div class="f2-col">${input}${hero}</div>${recent}</div>` },
    charts:{ fk:'f-charts', sum:`расходы ${rub0(st.spent)}`, body: () => `<div class="f2-tiles">${finTiles(st, null)}</div><div class="fc3">${finBullets(st)}${finDonut(st)}${finDaily(st, ym)}</div>`, def:isWide },
    cats:{ fk:'f-cats', sum: plural(S.fin.cats.length, ['категория', 'категории', 'категорий']), body: () => `<div class="fg-grid">${FG_ORDER.map(k => finGroup(k, st)).join('')}</div>`, def:isWide },
    top:{ fk:'f-top', sum: top ? `${esc(top.note || fcat(top.cat).name)} · ${rub0(top.amt)}` : 'пока пусто', body: () => `<div class="card">${topBuysHTML(ym)}</div>` },
    hist:{ fk:'f-hist', sum: plural(ops.length, ['запись', 'записи', 'записей']), body: () => finHistory(st) } })}`;
}
ACT.f2hist = () => foldOpenGo('f-hist');

// ---- Привычки: сегодня — плитками (на телефоне «таблетками»), таблица месяца, прогресс, самочувствие и заметки — блоками ----
function habitsHTML() {
  const ym = secYM, t = todayK(), cur = ymOf(t) === ym, demo = S.habits.some(h => h.demo), none = !S.habits.length, hst = habitStats(ym);
  const ms = monthStat(ym), pm = monthStat(ymAdd(ym, -1)), prevName = MON[Number(ymAdd(ym, -1).slice(5)) - 1].toLowerCase();
  // «Сегодня»: открытым — карточка со своим заголовком, свёрнутым — без него (заголовок у самого блока)
  let todayIn = '', todaySum = '';
  if (cur && !none) {
    const habs = hByKind('daily').filter(h => t >= hStart(h) && hDow(h, t)), dn = habs.filter(h => h.log[t]).length;
    const wkKey = ym + ':w' + (wkOf(t) + 1), per = [...hByKind('weekly').map(h => [h, wkKey]), ...hByKind('monthly').map(h => [h, ym])];
    todaySum = habs.length ? dn + ' из ' + habs.length : '';
    // На телефоне — компактными «таблетками», как на Главной (просьба пользователя 16 октября 2026); на ПК — плитками
    const wide = isWide(), box = wide ? 'h2-habs' : 'h2-hchips', tile = wide ? habTile : habChip;
    todayIn = `${habs.length ? `<div class="${box}">${habs.map(h => tile(h, t, 'hmark')).join('')}</div>` : '<p class="h2-empty">На сегодня привычек нет.</p>'}
      ${per.length ? `<div class="pl-sub">На этой неделе и в этом месяце</div><div class="${box}">${per.map(([h, k]) => tile(h, k, 'hmarkp')).join('')}</div>` : ''}
      <div class="hm-foot"><span>${ms.pct != null ? withHint('За месяц: ' + pctTxt(ms.pct), 'habitPct') : ''}</span><button data-act="hnew" data-k="daily">+ Привычка</button></div>`;
  }
  const dl = ms.pct != null && pm.pct != null ? Math.round((ms.pct - pm.pct) * 100) : null;
  const M = S.bio.metrics, filled = M.filter(m => bioVal(t, m.id) != null).length, nWM = hByKind('weekly').length + hByKind('monthly').length, nNotes = notesOf(ym).length;
  const bioToday = cur ? `<div class="card"><div class="h2-h"><b>Как вы сегодня?</b><small>${filled} из ${M.length}</small></div><div class="hm-bio">${M.map(m => { const v = bioVal(t, m.id), opts = m.type === 'hours' ? [5, 6, 7, 8, 9, 10] : [1, 2, 3, 4, 5];
    return `<div class="hm-bm"><span class="nm">${esc(m.emoji || '')} ${esc(m.name)}${v != null && !opts.includes(v) ? ` <small>${fmtNum(v)}</small>` : ''}</span><div class="hm-sc">${opts.map(o => `<button class="${v === o ? 'on' : ''}" data-act="hmbio" data-m="${m.id}" data-v="${o}" aria-label="${esc(m.name)}: ${o}" aria-pressed="${v === o}">${o}</button>`).join('')}</div></div>`; }).join('')}</div></div>` : '';
  return `${demoBar('habits', demo)}
  ${none ? emptyCard('habits', 'Привычки', 'Добавьте привычки — «2 литра воды», «Зарядка», «Чтение 30 страниц» — и отмечайте их каждый день. Здесь будет процент по каждой и сравнение с прошлым месяцем.') : ''}
  ${pageBlocks('habits', {   // порядок блоков — js/layout.js
    today:{ own:true, skip:!todayIn, fk:'h-today', sum:todaySum, def:true, body: () => `<div class="card h2-card"><div class="h2-h"><b>Сегодня</b><small>${todaySum}</small></div>${todayIn}</div>`, foldBody: () => `<div class="card h2-card">${todayIn}</div>` },
    grid:{ fk:'h-grid', sum: plural(S.habits.length, ['привычка', 'привычки', 'привычек']), def:true, body: () => `<div class="card">${S.settings.habitPast ? '' : '<p class="set-note" style="margin:0 0 8px">Отмечать можно только сегодняшний день</p>'}${habitGrid(ym)}</div>` },
    prog:{ fk:'h-prog', sum: dl == null ? 'появится с отметками' : `${dl >= 0 ? '+' : '−'}${Math.abs(dl)}% к ${prevName.replace(/ь$/, 'ю').replace(/й$/, 'ю').replace(/т$/, 'ту')}`, def:isWide, body: () => `<div class="hb-two">${habitWave(ym)}${hst.progress}</div>${hst.stable}` },
    per:{ fk:'h-per', sum: nWM ? plural(nWM, ['привычка', 'привычки', 'привычек']) : 'пока нет', def: () => nWM > 0 && isWide(), body: () => `<div class="hb-two">${periodicCard('weekly', ym)}${periodicCard('monthly', ym)}</div>` },
    bio:{ fk:'h-bio', sum: cur ? (filled ? `сегодня ${filled} из ${M.length}` : 'сегодня не отмечено') : 'за месяц', body: () => `${bioToday}${bioCard(ym)}` },
    notes:{ fk:'h-notes', sum: nNotes ? plural(nNotes, ['заметка', 'заметки', 'заметок']) + ' за месяц' : 'за месяц пока нет', body: () => notesCard(ym) } })}`;
}

// ---- Знакомство при первом запуске: 3 шага ----
let onbStep = 0, onbT = null, onbAreas = null, onbName = '';
const ONB_PH = ['встреча завтра в 15:00', 'кафе 450', 'сдать отчёт в пятницу !!', '+ зарплата 60 000', '2 литра воды каждый день'];
const onbIsOpen = () => { const o = $('#onb'); return !!(o && o.classList.contains('show')); };
function onbOpen() {
  onbStep = 0; onbAreas = new Set(AREAS.map(a => a[0]).filter(secOn)); onbName = S.settings.name || '';
  if (!onbAreas.size) AREAS.forEach(a => onbAreas.add(a[0]));
  let el = $('#onb');
  if (!el) { el = document.createElement('div'); el.id = 'onb'; el.className = 'onb'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Знакомство с ' + APP_NAME); document.body.appendChild(el); }
  onbDraw(); requestAnimationFrame(() => el.classList.add('show'));
}
function onbClose() { clearTimeout(onbT); const el = $('#onb'); if (!el) return; el.classList.remove('show'); setTimeout(() => { if (!el.classList.contains('show')) el.remove(); }, 300); }
function onbMock() {
  return `<div class="onb-mock" aria-hidden="true">
    <div class="mk-top"><div><small>${DOWF[dowIdx(todayK())]}</small><b>${greet()}${S.settings.name ? ', ' + esc(S.settings.name) : ''}</b></div>${ringSVG(.62, 52, 'var(--good)', '62%', '')}</div>
    <div class="mk-card"><small>План на сегодня</small>
      <div class="mk-row done"><span class="mk-chk">${I(IC.check, 11)}</span><span class="mk-t">Зарядка</span></div>
      <div class="mk-row"><em>10:00</em><span class="mk-t">Встреча с командой</span><span class="ctag" style="--c:#ef4444"><i></i>Работа</span></div>
      <div class="mk-row"><span class="mk-chk"></span><span class="mk-t">Купить продукты</span><span class="pbadge" style="--c:var(--c-violet)">Высокий</span></div></div>
    <div class="mk-two"><div class="mk-card"><small>Привычки</small><div class="mk-habs"><span class="on">💧</span><span>🏃</span><span class="on">📚</span><span>🧘</span></div></div>
      <div class="mk-card"><small>Можно сегодня</small><b>1 240 ₽</b><div class="ds-bar"><i style="width:58%"></i></div></div></div>
    <div class="mk-fold"><span>Самочувствие · Цели · Мысли дня</span>${I(IC.right, 14)}</div></div>`;
}
function onbDraw() {
  const el = $('#onb'); if (!el) return; clearTimeout(onbT);
  const steps = [
    { art:`<div class="onb-demo"><div class="om-box">${I(IC.spark, 19)}<span class="onb-typed"></span><i class="onb-caret"></i></div><div class="om-prev onb-prev"></div></div>`,
      h:'Пишите как говорите', p:'Одна строка для всего: дела, встречи, траты, привычки и заметки. Parsimony сам поймёт, что это, и разложит по местам — без длинных форм.' },
    { art: onbMock(), h:'Весь день — на одном экране', p:'Главная собирает план, привычки и деньги на сегодня. Отмечайте одним касанием — процент дня считается сам, а остальное ждёт в свёрнутых блоках.' },
    { art:`<div class="onb-form"><label for="onb_name">Как вас зовут?</label><input id="onb_name" class="fin" data-nchk="name" value="${esc(onbName)}" placeholder="Имя, до ${NAME_MAX} знаков" maxlength="${NAME_MAX}" autocomplete="given-name">
      <label>Что будете использовать?</label><div class="onb-areas">${AREAS.map(([k, ic, n]) => `<button class="onb-a${onbAreas.has(k) ? ' on' : ''}" data-act="onbarea" data-k="${k}" aria-pressed="${onbAreas.has(k)}">${I(ic, 20)}<span>${n}</span><i>${onbAreas.has(k) ? I(IC.check, 13) : ''}</i></button>`).join('')}</div>
      <p class="set-note">Остальное спрячем, чтобы не мешало. Включить можно в любой момент: Настройки → «Расположение».</p></div>`,
      h:'Сделаем Parsimony вашим', p:'' },
  ];
  const s = steps[onbStep], last = onbStep === steps.length - 1;
  el.innerHTML = `<div class="onb-box">
    <div class="onb-top"><span class="wordmark">${APP_NAME}</span>${last ? '' : '<button class="onb-skip" data-act="onbskip">Пропустить</button>'}</div>
    ${last ? '' : `<div class="onb-art">${s.art}</div>`}
    <div class="onb-txt"><small>Шаг ${onbStep + 1} из ${steps.length}</small><h2>${s.h}</h2>${s.p ? `<p>${s.p}</p>` : ''}</div>
    ${last ? s.art : ''}
    ${last ? `<div class="onb-foot last"><button class="btn pri" data-act="onbdone">Начать</button><button class="btn" data-act="onbtour">${I(IC.spark, 16)} Начать и показать, где что находится</button>
      <div class="onb-sub"><button data-act="onbback">← Назад</button><button data-act="onbdemo" title="Заполнить разделы примером">Посмотреть на примере</button></div></div>`
    : `<div class="onb-foot"><div class="onb-dots">${steps.map((_, i) => `<i class="${i === onbStep ? 'on' : ''}"></i>`).join('')}</div>
      ${onbStep ? '<button class="btn" data-act="onbback">Назад</button>' : ''}<button class="btn pri" data-act="onbnext">Далее</button></div>`}</div>`;
  if (onbStep === 0) onbType(0);
}
// Строка «печатает» сама: фраза → что получилось
function onbType(i) {
  const tx = $('.onb-typed'), pv = $('.onb-prev'); if (!tx || !pv) return;
  const phrase = ONB_PH[i % ONB_PH.length]; let n = 0;
  pv.classList.remove('show'); tx.textContent = '';
  const step = () => {
    if (!$('.onb-typed')) return;
    tx.textContent = phrase.slice(0, ++n);
    if (n < phrase.length) onbT = setTimeout(step, 45 + Math.random() * 55);
    else onbT = setTimeout(() => { pv.innerHTML = omPrevHTML(omniParse(phrase, 'home', null), '', true); pv.classList.add('show'); onbT = setTimeout(() => onbType(i + 1), 2300); }, 250);
  };
  onbT = setTimeout(step, 500);
}
function onbFinish(demo, thenTour) {
  const n = $('#onb_name'); if (n) onbName = n.value;
  const bad = onbName.trim() && nameBadMsg(onbName);   // недоступное имя (js/names.js): остаёмся на шаге с полем, а без поля — без имени
  if (bad) { if (n) { nameNote(n, bad); n.focus(); return; } onbName = ''; }
  if (onbName.trim()) S.settings.name = onbName.trim().slice(0, NAME_MAX).trim();
  if (onbAreas && onbAreas.size) S.settings.secs.forEach(x => { if (AREAS.some(a => a[0] === x.k)) x.on = onbAreas.has(x.k); });
  S.settings.onboarded = 1;
  if (demo) { if (!S.events.some(e => e.demo && !e.goal)) SEC.tasks.demo(true); if (!S.goals.some(g => g.demo)) SEC.goals.demo(true); if (!S.habits.some(h => h.demo)) SEC.habits.demo(true); if (!S.fin.ops.some(o => o.demo)) SEC.fin.demo(true); }
  save(); onbClose();
  if (sec !== 'home') setSec('home'); else render();
  if (thenTour) return setTimeout(() => tourStart('all'), 350);
  toast(demo ? 'Добавлен пример — в каждом разделе его можно убрать одной кнопкой' : 'Готово! Напишите первую запись в строке на Главной');
  const o = $('.h2-omni'); if (o) { o.classList.add('pulse'); setTimeout(() => o.classList.remove('pulse'), 2600); }
}
ACT.onbnext = () => { onbStep = Math.min(2, onbStep + 1); onbDraw(); };
ACT.onbback = () => { const n = $('#onb_name'); if (n) onbName = n.value; onbStep = Math.max(0, onbStep - 1); onbDraw(); };
ACT.onbskip = () => { S.settings.onboarded = 1; save(); onbClose(); };
ACT.onbdone = () => onbFinish(false);
ACT.onbtour = () => onbFinish(false, true);
ACT.onbdemo = () => onbFinish(true);
ACT.onbarea = el => { const n = $('#onb_name'); if (n) onbName = n.value; const k = el.dataset.k; onbAreas.has(k) ? onbAreas.size > 1 && onbAreas.delete(k) : onbAreas.add(k); onbDraw(); };
ACT.onbshow = () => onbOpen();
// Пока открыто знакомство, горячие клавиши приложения не работают: Enter — дальше, Esc — пропустить
document.addEventListener('keydown', e => {
  if (!onbIsOpen()) return;
  e.stopImmediatePropagation();
  if (e.key === 'Escape') { e.preventDefault(); ACT.onbskip(); }
  else if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); onbStep < 2 ? ACT.onbnext() : onbFinish(false); }
  else if (e.key === 'ArrowRight' && e.target.tagName !== 'INPUT' && onbStep < 2) ACT.onbnext();
  else if (e.key === 'ArrowLeft' && e.target.tagName !== 'INPUT' && onbStep > 0) ACT.onbback();
}, true);

// Главная на ПК: блоки встают в две колонки в порядке пользователя — первый слева под строкой ввода, каждый следующий в ту колонку, что короче.
// Колонка блока зависит только от блоков выше него, поэтому открытый или свёрнутый блок сам не прыгает — сдвинуться могут только те, что ниже. На телефоне — одна колонка по порядку.
function balanceHome() {
  const cols = $$('.h2-col'); if (innerWidth < 900 || cols.length !== 2) return;
  const bl = $$('.h2-col > .h2-blk'); bl.forEach(x => x.remove());
  const h = cols.map(c => c.getBoundingClientRect().height);
  bl.forEach((x, i) => { const c = i === 0 || h[0] <= h[1] ? 0 : 1; cols[c].appendChild(x);
    h[c] += x.getBoundingClientRect().height + 14; });
}
SEC.home.after = () => { omRefresh(); balanceHome(); };
SEC.tasks.after = omRefresh;
SEC.cal.after = omRefresh;   // строка добавления под выбранным днём (js/calendar.js: calDayHTML)
// Знакомство — когда загружены все скрипты: onbOpen нужен secOn из layout.js (он ниже). Раньше был таймер 350 мс, и на медленном
// интернете знакомство падало (ReferenceError: secOn) — нашёл Lighthouse 18 октября 2026
if (!S.settings.onboarded) { const go = () => setTimeout(onbOpen, 350); document.readyState === 'loading' ? addEventListener('DOMContentLoaded', go) : go(); }
