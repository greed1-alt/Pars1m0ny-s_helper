// ---- Интерфейс (с 3 октября 2026): единая строка ввода, сворачиваемые блоки, экраны Главной / Задач / Финансов / Привычек, знакомство за 3 шага ----
// Прежний вид с переключателем убран 6 октября 2026 (решение пользователя). Полный откат — git-тег before-ui2.
onMigrate(() => {
  const st = S.settings;
  delete st.ui2;
  if (!st.folds || typeof st.folds !== 'object' || Array.isArray(st.folds)) st.folds = {};
  if (!Array.isArray(st.areas) || !st.areas.length) st.areas = ['tasks', 'cal', 'habits', 'fin'];
});
const isWide = () => innerWidth >= 900;

// ---- Сворачиваемый блок: заголовок со сводкой, содержимое рисуется только в открытом виде ----
// def — открыт ли по умолчанию (true/false или функция, например isWide: на ПК открыт, на телефоне свёрнут).
// card: true — блок сам карточка (Главная); иначе заголовок-строка, а под ним обычные карточки раздела.
const foldIsOpen = (k, def) => { const v = S.settings.folds[k]; return v == null ? !!(typeof def === 'function' ? def() : def) : v; };
function foldHTML(k, title, sum, body, def, opt) {
  const o = opt || {}, open = foldIsOpen(k, def);
  return `<section class="fold${o.card ? ' fc' : ''}${open ? ' open' : ''}" data-fold="${k}">
    <button class="fold-h" data-act="fold" data-k="${k}" aria-expanded="${open}">${o.ic ? I(o.ic, 18) : ''}<span class="fold-tt"><b>${title}</b>${sum ? `<small>${sum}</small>` : ''}</span><i class="fold-chev">${I(IC.right, 17)}</i></button>
    ${open ? `<div class="fold-b">${typeof body === 'function' ? body() : body}</div>` : ''}</section>`;
}
ACT.fold = el => { const k = el.dataset.k; S.settings.folds[k] = el.getAttribute('aria-expanded') !== 'true'; save(); render(); };
const foldOpenGo = k => { S.settings.folds[k] = true; save(); render(); setTimeout(() => { const f = $(`[data-fold="${k}"]`); if (f) f.scrollIntoView({ block:'start', behavior:'smooth' }); }, 60); };

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
function omniParse(raw, ctx, force, st) {
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
  const nl = parseNL(s, t), mo = parseMoney(plus ? '+ ' + sm : sm);
  if (!type) {
    if (mo.ok && !nl.time && ctx !== 'tasks') {
      const plusM = plus || /^\+/.test(sm), cur = /\d\s*(₽|р\.?(?=\s|$)|руб|к(?=\s|$)|k(?=\s|$)|тыс)/i.test(sm);
      const hit = finHit(sm.toLowerCase()), end = /\d\s*(₽|р\.?|руб\S*|к|k|тыс\.?)?$/i.test(sm);
      if (plusM || cur || hit || (end && mo.amt >= 50)) type = 'money';
    } else if (mo.ok && ctx === 'tasks' && (/^\+/.test(sm) || /\d\s*(₽|руб)/i.test(sm))) type = 'money';
    if (!type) type = HAB_RE.test(s) && !nl.time ? 'habit' : nl.time && ctx !== 'tasks' ? 'event' : 'task';
  }
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
  return { type, title: title.charAt(0).toUpperCase() + title.slice(1), date: nl.date || t, time: nl.time || '', time2: nl.time2 || '', cat: catId, catDflt: !S_.cat && !guessed, prio: S_.prio || prio || (ctx === 'tasks' && tPrio) || 'mid' };
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
const omHint = st => `<span class="om-hint">${st.force ? 'Напишите и нажмите Enter' : st.ctx === 'tasks' ? 'Дата, время, <b>#категория</b> и <b>!</b> приоритет — прямо в тексте' : 'Пишите как говорите — Parsimony сам поймёт, что это: дело, встреча, трата или привычка'}${hintK('omni')}</span>`;

function omniHTML(id, ctx) {
  const st = omSt(id); st.ctx = ctx;
  return `<div class="om" data-om="${id}">
    <div class="om-box">${I(IC.spark, 19)}<input id="${id}" class="om-in" type="text" value="${esc(st.v)}" placeholder="${esc(st.force ? OM_T[st.force].ph : OM_PH[ctx] || OM_PH.home)}" autocomplete="off" autocapitalize="sentences" enterkeyhint="done" aria-label="Быстрое добавление"><button class="om-go om-keep" data-act="omgo" data-om="${id}" aria-label="Добавить">${I(IC.plus, 20)}</button></div>
    <div class="om-types" role="group" aria-label="Что добавить">${OM_ORDER.filter(t => ctx !== 'tasks' || t === 'task' || t === 'event').map(t => `<button class="om-t om-keep" data-act="omtype" data-om="${id}" data-t="${t}" aria-pressed="false">${I(OM_T[t].ic, 15)}${OM_T[t].n}</button>`).join('')}</div>
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
    box.querySelectorAll('.om-t').forEach(b => { const on = p ? b.dataset.t === p.type : b.dataset.t === st.force; b.classList.toggle('on', on); b.classList.toggle('auto', on && !st.force); b.setAttribute('aria-pressed', on); });
  }
  i.placeholder = st.force ? OM_T[st.force].ph : OM_PH[st.ctx] || OM_PH.home;
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
document.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing && e.target.classList && e.target.classList.contains('om-in')) { e.preventDefault(); omGo(e.target.id); } });

// Окно «Добавить» (кнопка «Создать», клавиша N): та же строка + примеры + полные формы
function openOmni(ctx) {
  const id = 'oms', st = omSt(id); omReset(st); st.ctx = ctx === 'cal' || ctx === 'tasks' ? ctx : 'home';
  sheet(`<div class="sh-head"><h3>Добавить</h3><button class="ic" data-act="close" aria-label="Закрыть">${I(IC.x, 18)}</button></div>
  ${omniHTML(id, st.ctx)}
  <div class="om-ex"><small>Например — нажмите, чтобы попробовать</small><div>${(OM_EX[st.ctx] || OM_EX.home).map(x => `<button class="om-exb" data-act="omex" data-om="${id}" data-v="${esc(x)}">${esc(x)}</button>`).join('')}</div></div>
  <div class="om-ex"><small>Или заполните форму</small><div class="om-forms">${QUICK.map(([k, ic, n]) => `<button data-act="hmnew" data-k="${k}">${I(ic, 16)}${n}</button>`).join('')}</div></div>`);
  omUpdate(id);
  const i = $('#' + id); if (i) i.focus();
}

// ---- Главная: приветствие, строка ввода, план дня, привычки, деньги; остальное — в свёрнутых блоках ----
const AREAS = [['tasks', IC.tasks, 'Дела и задачи'], ['cal', IC.cal, 'Календарь'], ['habits', IC.habit, 'Привычки'], ['fin', IC.wallet, 'Деньги']];
const pbadge = p => `<span class="pbadge" style="--c:${PRIO[p].c}">${PRIO[p].n}</span>`;
const habTile = (h, key, act) => { const on = !!h.log[key]; return `<button class="h2-hab${on ? ' on' : ''}" data-act="${act}" data-id="${h.id}" ${act === 'hmark' ? 'data-k' : 'data-key'}="${key}" aria-pressed="${on}"><span class="em">${esc(h.emoji || '•')}</span><span class="nm">${esc(h.name)}</span><i>${on ? I(IC.check, 14) : ''}</i></button>`; };

function homePlan(t) {
  const all = evOn(t), nm = nowMin(), nx = nextUp(t);
  const evEnd = e => timeMin(e.time2) != null && timeMin(e.time2) > timeMin(e.time) ? timeMin(e.time2) : timeMin(e.time) + 60;
  const timed = all.filter(e => e.time).sort((a, b) => a.time.localeCompare(b.time));
  const untimed = all.filter(e => !e.time).sort((a, b) => a.done - b.done || prioRank(a) - prioRank(b));
  const MAX = 8, tShow = timed.slice(0, MAX), uShow = untimed.slice(0, Math.max(3, MAX - tShow.length)), rest = all.length - tShow.length - uShow.length;
  const row = e => { const past = e.time && evEnd(e) <= nm, pr = e.task ? prioOf(e) : '', next = nx && nx.k === t && nx.e.id === e.id;
    return `<div class="pl-row${e.time ? '' : ' nt'}${e.done ? ' done' : ''}${past && !e.done ? ' past' : ''}${next ? ' next' : ''}" style="--c:${cat(e.cat).color}">
      <span class="pl-tm">${e.time ? `<b>${esc(e.time)}</b>${e.time2 ? `<small>${esc(e.time2)}</small>` : ''}` : ''}</span>
      <button class="chk" data-act="toggle" data-id="${e.id}" data-d="${t}" aria-label="Выполнено">${e.done ? I(IC.check, 14) : ''}</button>
      <button class="pl-main" data-act="edit" data-id="${e.id}" data-d="${t}"><span class="pl-t">${esc(e.title)}</span><span class="pl-m">${next ? `<em class="pl-next">${esc(nx.label)}</em>` : ''}${catTag(e.cat)}${goalTag(e)}${pr === 'urgent' || pr === 'high' ? pbadge(pr) : ''}${e.rec ? '<span class="pl-rep" title="Повторяется">↻</span>' : ''}</span></button></div>`; };
  const done = all.filter(e => e.done).length, tm = evOn(addDays(t, 1)).length;
  return `<div class="card h2-card h2-plan"><div class="h2-h"><b>${I(IC.list, 18)}План на сегодня</b><small>${all.length ? done + ' из ' + all.length : ''}</small></div>
    ${all.length ? `${tShow.length && uShow.length ? '<div class="pl-sub">По времени</div>' : ''}${tShow.map(row).join('')}
      ${uShow.length && tShow.length ? '<div class="pl-sub">Без времени</div>' : ''}${uShow.map(row).join('')}${rest > 0 ? `<button class="hm-more" data-act="pick" data-d="${t}">Ещё ${plural(rest, NEV)} →</button>` : ''}`
      : '<p class="h2-empty">На сегодня пусто. Напишите в строке выше — например, «позвонить маме в 18» или «купить продукты».</p>'}
    <div class="hm-foot"><span>${tm ? 'Завтра: ' + plural(tm, NEV) : 'На завтра пока пусто'}</span><span><button data-act="sec" data-s="tasks">Задачи →</button><button data-act="sec" data-s="cal">Календарь →</button></span></div></div>`;
}
function homeHabits(t) {
  const habs = hByKind('daily').filter(h => t >= hStart(h) && hDow(h, t)), dn = habs.filter(h => h.log[t]).length, sk = habitStreaks(), show = habs.slice(0, 6);
  return `<div class="card h2-card"><div class="h2-h"><b>${I(IC.habit, 18)}Привычки</b><small>${habs.length ? dn + ' из ' + habs.length : ''}</small></div>
    ${habs.length ? `<div class="h2-habs">${show.map(h => habTile(h, t, 'hmark')).join('')}${habs.length > show.length ? `<button class="h2-hab more" data-act="sec" data-s="habits"><span class="nm">Ещё ${plural(habs.length - show.length, ['привычка', 'привычки', 'привычек'])} →</span></button>` : ''}</div>`
      : `<p class="h2-empty">Привычек пока нет. Начните с одной — напишите выше «привычка: 2 литра воды».</p>`}
    <div class="hm-foot"><span>${sk.cur > 1 ? `🔥 ${plural(sk.cur, NDAY)} подряд` : sk.best > 1 ? `Лучшая серия: ${plural(sk.best, NDAY)}` : ''}</span><button data-act="sec" data-s="habits">Трекер →</button></div></div>`;
}
function homeMoney(t) {
  const ym = ymOf(t), st = finStat(ym), lim = dailyLimit(st, ym);
  const ops = st.ops.filter(o => o.date === t).sort((a, b) => b.id.localeCompare(a.id));
  const spent = ops.filter(o => FG_OUT.includes(fcat(o.cat).g)).reduce((a, o) => a + o.amt, 0);
  const bar = st.spentPlan ? `<div class="f2-bar"><div class="ds-bar${st.spent > st.spentPlan ? ' over' : ''}"><i style="width:${Math.min(100, Math.round(st.spent / st.spentPlan * 100))}%"></i></div><span>Расходы за месяц: ${rub0(st.spent)} из ${rub0(st.spentPlan)}</span></div>` : '';
  return `<div class="card h2-card"><div class="h2-h"><b>${I(IC.wallet, 18)}Деньги</b><small>${MON[Number(ym.slice(5)) - 1].toLowerCase()}</small></div>
    <div class="h2-big${lim && lim.left < 0 ? ' neg' : ''}"><small>${lim ? 'Можно потратить сегодня' + hintK('limit') : 'Потрачено сегодня'}</small><b>${lim ? rub0(Math.max(0, lim.left)) : rub0(spent)}</b>
      <span>${lim ? (lim.left >= 0 ? `лимит ${rub0(lim.limit)} в день · сегодня ${rub0(lim.today)}` : `лимит превышен на ${rub0(-lim.left)}`) : '<button class="lnk" data-act="finbudget">Задайте бюджет — появится дневной лимит</button>'}</span></div>
    ${bar}
    ${ops.length ? `<div class="hm-ops">${ops.slice(0, 3).map(o => { const c = fcat(o.cat), plus = c.g === 'inc'; return `<button class="hm-op" data-act="opedit" data-id="${o.id}"><span class="em">${esc(c.emoji || '•')}</span><span class="n">${esc(o.note || c.name)}</span><b class="${plus ? 'plus' : ''}">${plus ? '+' : '−'}${rub0(o.amt)}</b></button>`; }).join('')}</div>` : ''}
    <div class="hm-foot"><span>${ops.length ? '' : 'Трату можно записать в строке выше: «кафе 450»'}</span><button data-act="sec" data-s="fin">Финансы →</button></div></div>`;
}
function homeHTML() {
  const t = todayK(), d = pd(t), name = (S.settings.name || '').trim();
  const tasks = dayTasks(t), habs = hByKind('daily').filter(h => t >= hStart(h) && hDow(h, t));
  const total = tasks.length + habs.length, done = tasks.filter(e => e.done).length + habs.filter(h => h.log[t]).length, pct = total ? done / total : 0;
  const hero = `<div class="h2-hero">
    <div class="h2-hi"><div class="h2-date">${DOWF[dowIdx(t)]}, ${d.getDate()} ${MONG[d.getMonth()]}</div>
      <h2 class="h2-greet">${greet()}${name ? ', ' + esc(name) : ''}</h2><p class="h2-line">${esc(DAY_LINES[dnum(t) % DAY_LINES.length])}</p></div>
    <div class="h2-ring" title="Задачи и привычки на сегодня">${ringSVG(pct, 72, 'var(--good)', total ? Math.round(pct * 100) + '%' : '—', '')}<small>${total ? done + ' из ' + total : 'пока пусто'}${hintK('ring')}</small></div></div>`;
  const omni = `<div class="card h2-omni">${omniHTML('om', 'home')}</div>`;
  // Порядок карточек — по ответу «что для вас главное» из знакомства; невыбранное — свёрнутыми блоками внизу
  const A = S.settings.areas, has = k => A.includes(k);
  const AIC = { plan:IC.list, habits:IC.habit, money:IC.wallet };
  const cards = [['plan', has('tasks') || has('cal'), 'План на сегодня', () => homePlan(t), () => { const n = evOn(t).length; return n ? plural(n, NEV) : 'пусто'; }],
    ['habits', has('habits'), 'Привычки', () => homeHabits(t), () => { const n = habs.length; return n ? habs.filter(h => h.log[t]).length + ' из ' + n : 'нет'; }],
    ['money', has('fin'), 'Деньги', () => homeMoney(t), () => { const st = finStat(ymOf(t)), lim = dailyLimit(st, ymOf(t)); return lim ? 'можно ' + rub0(Math.max(0, lim.left)) : 'за месяц ' + rub0(st.spent); }]];
  const rank = c => c[1] ? 0 : 1, order = [...cards].sort((a, b) => rank(a) - rank(b));
  const main = order.filter(c => c[1]).map(c => c[3]()), extra = order.filter(c => !c[1]).map(c => foldHTML('h-' + c[0], c[2], c[4](), c[3], false, { ic:AIC[c[0]] }));
  const M = S.bio.metrics, filled = M.filter(m => bioVal(t, m.id) != null).length;
  const bio = foldHTML('h-bio', 'Самочувствие', filled ? `сегодня ${filled} из ${M.length}` : 'как вы сегодня?', () => `<div class="hm-bio">${M.map(m => { const v = bioVal(t, m.id), opts = m.type === 'hours' ? [5, 6, 7, 8, 9, 10] : [1, 2, 3, 4, 5];
    return `<div class="hm-bm"><span class="nm">${esc(m.emoji || '')} ${esc(m.name)}${v != null && !opts.includes(v) ? ` <small>${fmtNum(v)}</small>` : ''}</span><div class="hm-sc">${opts.map(o => `<button class="${v === o ? 'on' : ''}" data-act="hmbio" data-m="${m.id}" data-v="${o}" aria-label="${esc(m.name)}: ${o}" aria-pressed="${v === o}">${o}</button>`).join('')}</div></div>`; }).join('')}</div>
    <div class="hm-foot"><span>Сон — в часах, остальное — от 1 до 5</span><button data-act="sec" data-s="habits">Подробнее →</button></div>`, false, { card:true, ic:IC.spark });
  // Цели: открыт по умолчанию, когда цели есть («каждое утро — список целей»)
  const ga = activeGoals(), gLate = ga.reduce((n, g) => n + goalStat(g).late.length, 0);
  const goals = foldHTML('h-goals', 'Цели', ga.length ? `${plural(ga.length, ['активная', 'активные', 'активных'])}${gLate ? ` · просрочено шагов: ${gLate}` : ''}` : 'пока нет',
    () => `${goalsMiniHTML(3)}<div class="hm-foot"><button data-act="gnewh">+ Цель</button><button data-act="gall">Все цели →</button></div>`, () => ga.length > 0, { card:true, ic:IC.goal });
  const last = notesOf('')[0];
  const notes = foldHTML('h-notes', 'Мысли дня', S.notes.length ? plural(S.notes.length, ['заметка', 'заметки', 'заметок']) : 'журнал пуст', () => `<textarea id="hm_note" class="fin hn-text" placeholder="Что сегодня получилось? Что мешало? О чём подумать завтра?" aria-label="Заметка">${esc(hmNoteDraft)}</textarea>
    <div class="nt-bar"><small>${last ? 'Последняя: ' + esc(fmtLong(last.date)) : 'Сохранится в журнал с сегодняшней датой'}</small><span><button class="pill sm" data-act="ntall">Все заметки</button> <button class="btn pri" data-act="hmnote">Сохранить</button></span></div>`, false, { card:true, ic:IC.note });
  return `${hero}<div class="h2-cols"><div class="h2-col">${omni}${missedBar(true)}${main[0] || ''}</div><div class="h2-col">${main.slice(1).join('')}${extra.join('')}${bio}${goals}${notes}</div></div>`;
}


// ---- Задачи: строка ввода и один список (Сегодня / Неделя / Все); цели и статистика — в свёрнутых блоках ----
let tView = 'today';
const t2Row = (e, k, done, due) => { const pr = prioOf(e), [lt, lc] = due ? leftTxt(k, done) : ['', ''];
  return `<div class="t2-row${done ? ' done' : ''}" style="--c:${cat(e.cat).color}"><button class="chk" data-act="toggle" data-id="${e.id}" data-d="${k}" aria-label="Выполнено">${done ? I(IC.check, 14) : ''}</button>
  <button class="t2-main" data-act="edit" data-id="${e.id}" data-d="${k}"><span class="t2-t">${esc(e.title)}${isRec(e) ? ' <i class="tk-rep" title="Повторяется">↻</i>' : ''}</span>
  <span class="t2-m">${due ? `<span class="t2-due ${lc}">${esc(shortDate(k))}${lt && !done && lc ? ' · ' + lt : ''}</span>` : ''}${e.time ? `<span class="t2-tm">${I(IC.clock, 12)}${esc(e.time)}</span>` : ''}${catTag(e.cat)}${goalTag(e)}${pr === 'urgent' || pr === 'high' ? pbadge(pr) : ''}</span></button></div>`; };
const daySort = l => [...l].sort((a, b) => a.done - b.done || prioRank(a) - prioRank(b) || (a.time || '99').localeCompare(b.time || '99'));
function tasksHTML() {
  const t = todayK(), hasAny = S.events.some(e => e.task), demo = S.events.some(e => e.demo);
  const tl = dayTasks(t), tdn = tl.filter(e => e.done).length, left = tl.length - tdn;
  const gLate = activeGoals().reduce((n, g) => n + goalStat(g).late.length, 0);
  const views = [['today', 'Сегодня' + (left ? ` <em>${left}</em>` : '')], ['week', 'Неделя'], ['all', 'Все'], ['goals', 'Цели' + (gLate ? ` <em class="late">${gLate}</em>` : '')]];
  const tabs = `<div class="seg2 t2-seg" role="tablist" aria-label="Что показать">${views.map(([v, n]) => `<button class="${tView === v ? 'on' : ''}" data-act="tview" data-v="${v}" role="tab" aria-selected="${tView === v}">${n}</button>`).join('')}</div>`;
  // Вкладка «Цели» — та же страница целей (js/goals.js), что и раньше была отдельным разделом
  if (tView === 'goals') return `${missedBar(true)}${tabs}${goalsHTML()}`;
  let body = '';
  if (tView === 'today') {
    const tm = dayTasks(addDays(t, 1)).length;
    body = `${tl.length ? `<div class="t2-prog"><div class="ds-bar"><i style="width:${Math.round(tdn / tl.length * 100)}%"></i></div><span>${tdn} из ${tl.length}</span></div>` : ''}
      ${daySort(tl).map(e => t2Row(e, t, e.done, false)).join('') || '<p class="h2-empty">На сегодня задач нет. Напишите первую в строке выше — Enter, и готово.</p>'}
      <div class="t2-foot"><button data-act="tview" data-v="week">Завтра: ${tm ? plural(tm, ['задача', 'задачи', 'задач']) : 'пусто'} · вся неделя →</button></div>`;
  } else if (tView === 'week') {
    const wk = taskWeek();
    body = wk.map(k => { const l = daySort(dayTasks(k)), dn = l.filter(e => e.done).length, d = pd(k);
      return `<div class="t2-day${k === t ? ' is-today' : ''}${k < t ? ' past' : ''}${l.length ? '' : ' free'}">
        <div class="t2-dh"><b>${DOWF[dowIdx(k)]}</b><span>${d.getDate()} ${MONS[d.getMonth()]}${k === t ? ' · сегодня' : ''}</span><small>${l.length ? dn + ' из ' + l.length : 'свободно'}</small><button class="t2-dadd" data-act="t2add" data-d="${k}" aria-label="Задача на ${esc(fmtLong(k))}">${I(IC.plus, 17)}</button></div>
        ${l.map(e => t2Row(e, k, e.done, false)).join('')}</div>`; }).join('');
  } else {
    const rows = taskRows(), fl = [['active', 'Активные'], ['done', 'Выполненные'], ['all', 'Все']];
    body = `<div class="t2-flt"><div class="seg2">${fl.map(([v, n]) => `<button class="${tFilter === v ? 'on' : ''}" data-act="tfilter" data-f="${v}">${n}</button>`).join('')}</div>
      <div class="t2-prios">${PRIO_ORDER.map(p => `<button class="tk-pr${tPrio === p ? ' on' : ''}" data-act="tprio" data-p="${p}" style="--c:${PRIO[p].c}" aria-pressed="${tPrio === p}"><i></i>${PRIO[p].n}</button>`).join('')}</div></div>
      ${rows.slice(0, 80).map(({ e, k, done }) => t2Row(e, k, done, true)).join('') || `<p class="h2-empty">${tFilter === 'done' ? 'Выполненных задач пока нет.' : 'Задач нет — напишите первую в строке выше.'}</p>`}
      ${rows.length > 80 ? `<p class="h2-empty">Показаны первые 80 из ${rows.length}</p>` : ''}`;
  }
  const act = tasksAll().map(e => ({ e, k: isRec(e) ? nextOcc(e) : e.date })).filter(x => !isDone(x.e, x.k)), urg = act.filter(x => prioOf(x.e) === 'urgent').length;
  const wk = taskWeek();
  return `${missedBar(true)}${demoBar('tasks', demo)}
  ${!hasAny ? emptyCard('tasks', 'Задачи', 'Пишите задачи обычной фразой в строке ниже: «позвонить маме», «отчёт в пятницу #работа !!». Задача с датой видна и в календаре.') : ''}
  ${tabs}
  <div class="card h2-omni">${omniHTML('omt', 'tasks')}</div>
  <div class="card t2-list">${body}</div>
  ${foldHTML('t-board', 'Доска недели', `неделя ${isoWeek(wk[0])}`, () => `<div class="card tw-card">${weekBoard()}</div>`, isWide, { ic:IC.cal })}
  ${foldHTML('t-stats', 'Статистика', `${plural(act.length, ['активная', 'активные', 'активных'])}${urg ? ` · ${urg} срочн.` : ''}`, () => `<div class="tk-mid2">${taskSummary()}${taskDynamics()}</div>`, false, { ic:IC.spark })}`;
}
ACT.tview = el => { tView = el.dataset.v; render(); };
// На вкладке «Цели» шапка, «Создать» и подсказка в шапке — про цели, стрелок недели нет
const tasksGoals = () => sec === 'tasks' && tView === 'goals';
const useOmni = () => sec === 'home' || sec === 'cal' || (sec === 'tasks' && tView !== 'goals');
Object.defineProperty(SEC.tasks, 'newLabel', { get: () => tasksGoals() ? 'Цель' : 'Задача', configurable: true });
Object.defineProperty(SEC.tasks, 'noNav', { get: () => tasksGoals(), configurable: true });
{ const T = SEC.tasks, title = T.title, info = T.info, create = T.create;
  T.title = () => tasksGoals() ? SEC.goals.title() : title();
  T.info = () => tasksGoals() ? SEC.goals.info() : info();
  T.create = () => tasksGoals() ? openGoal() : create(); }
ACT.t2add = el => newTask(el.dataset.d);

// ---- Финансы: крупно — сколько можно потратить, строка записи, последние записи; графики и таблицы — свёрнуты ----
const f2Row = o => { const c = fcat(o.cat), plus = c.g === 'inc', t = todayK();
  return `<div class="fh-row"><button class="fh-main" data-act="opedit" data-id="${o.id}"><span class="em">${esc(c.emoji || '•')}</span><span class="fh-t"><b>${esc(o.note || c.name)}</b><small>${esc(dayDiff(t, o.date) >= -1 && o.date <= t ? relDay(o.date) : shortDate(o.date))} · ${esc(o.note ? c.name : FG[c.g].n)}</small></span><b class="fh-a${plus ? ' plus' : ''}">${plus ? '+' : c.g === 'sav' ? '' : '−'}${rub(o.amt)}</b></button></div>`; };
function financeHTML() {
  const ym = secYM, st = finStat(ym), lim = dailyLimit(st, ym), demo = S.fin.ops.some(o => o.demo), noPlans = !S.fin.cats.some(c => c.plan);
  const t = todayK(), cur = ymOf(t) === ym, mon = MONG[Number(ym.slice(5)) - 1];
  const big = lim ? { l:'Можно потратить сегодня', v: rub0(Math.max(0, lim.left)), s: lim.left >= 0 ? `лимит ${rub0(lim.limit)} в день · сегодня потрачено ${rub0(lim.today)}` : `лимит превышен на ${rub0(-lim.left)}`, neg: lim.left < 0 }
    : { l: cur ? 'Потрачено в этом месяце' : 'Потрачено за ' + ymTitle(ym).toLowerCase(), v: rub0(st.spent), s: noPlans ? '<button class="lnk" data-act="finbudget">Задайте бюджет — появится дневной лимит</button>' : '' };
  const bar = st.spentPlan ? `<div class="f2-bar"><div class="ds-bar${st.spent > st.spentPlan ? ' over' : ''}"><i style="width:${Math.min(100, Math.round(st.spent / st.spentPlan * 100))}%"></i></div><span><span>Расходы ${rub0(st.spent)} из ${rub0(st.spentPlan)}</span><span>${cur ? 'до конца месяца ' + plural(ymDays(ym).filter(k => k >= t).length, NDAY) : ''}</span></span></div>` : '';
  const hero = `<div class="card f2-hero${big.neg ? ' neg' : ''}"><div class="f2-top"><small class="f2-l">${big.l}${lim ? hintK('limit') : ''}</small><button class="pill sm" data-act="finbudget">${I(IC.wallet, 14)} Бюджет</button></div><b class="f2-big">${big.v}</b><span class="f2-s">${big.s}</span>${bar}
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
  <div class="f2-grid"><div class="f2-col">${input}${hero}</div>${recent}</div>
  ${foldHTML('f-charts', 'Графики', `расходы ${rub0(st.spent)}`, () => `<div class="f2-tiles">${finTiles(st, null)}</div><div class="fc3">${finBullets(st)}${finDonut(st)}${finDaily(st, ym)}</div>`, isWide, { ic:IC.spark })}
  ${foldHTML('f-cats', 'Категории и бюджет', `${plural(S.fin.cats.length, ['категория', 'категории', 'категорий'])}`, () => `<div class="fg-grid">${FG_ORDER.map(k => finGroup(k, st)).join('')}</div>`, isWide, { ic:IC.wallet })}
  ${foldHTML('f-top', 'Топ покупок', top ? `${esc(top.note || fcat(top.cat).name)} · ${rub0(top.amt)}` : 'пока пусто', () => `<div class="card">${topBuysHTML(ym)}</div>`, false, { ic:IC.trophy })}
  ${foldHTML('f-hist', 'Вся история', plural(ops.length, ['запись', 'записи', 'записей']), () => finHistory(st), false, { ic:IC.list })}`;
}
ACT.f2hist = () => foldOpenGo('f-hist');

// ---- Привычки: сегодня — крупными плитками, таблица месяца, прогресс, самочувствие и заметки — блоками ----
function habitsHTML() {
  const ym = secYM, t = todayK(), cur = ymOf(t) === ym, demo = S.habits.some(h => h.demo), none = !S.habits.length, hst = habitStats(ym);
  const ms = monthStat(ym), pm = monthStat(ymAdd(ym, -1)), prevName = MON[Number(ymAdd(ym, -1).slice(5)) - 1].toLowerCase();
  let today = '';
  if (cur && !none) {
    const habs = hByKind('daily').filter(h => t >= hStart(h) && hDow(h, t)), dn = habs.filter(h => h.log[t]).length;
    const wkKey = ym + ':w' + (wkOf(t) + 1), per = [...hByKind('weekly').map(h => [h, wkKey]), ...hByKind('monthly').map(h => [h, ym])];
    today = `<div class="card h2-card"><div class="h2-h"><b>Сегодня</b><small>${habs.length ? dn + ' из ' + habs.length : ''}</small></div>
      ${habs.length ? `<div class="h2-habs">${habs.map(h => habTile(h, t, 'hmark')).join('')}</div>` : '<p class="h2-empty">На сегодня привычек нет.</p>'}
      ${per.length ? `<div class="pl-sub">На этой неделе и в этом месяце</div><div class="h2-habs">${per.map(([h, k]) => habTile(h, k, 'hmarkp')).join('')}</div>` : ''}
      <div class="hm-foot"><span>${ms.pct != null ? 'За месяц: ' + pctTxt(ms.pct) + hintK('habitPct') : ''}</span><button data-act="hnew" data-k="daily">+ Привычка</button></div></div>`;
  }
  const dl = ms.pct != null && pm.pct != null ? Math.round((ms.pct - pm.pct) * 100) : null;
  const M = S.bio.metrics, filled = M.filter(m => bioVal(t, m.id) != null).length, nWM = hByKind('weekly').length + hByKind('monthly').length, nNotes = notesOf(ym).length;
  const bioToday = cur ? `<div class="card"><div class="h2-h"><b>Как вы сегодня?</b><small>${filled} из ${M.length}</small></div><div class="hm-bio">${M.map(m => { const v = bioVal(t, m.id), opts = m.type === 'hours' ? [5, 6, 7, 8, 9, 10] : [1, 2, 3, 4, 5];
    return `<div class="hm-bm"><span class="nm">${esc(m.emoji || '')} ${esc(m.name)}${v != null && !opts.includes(v) ? ` <small>${fmtNum(v)}</small>` : ''}</span><div class="hm-sc">${opts.map(o => `<button class="${v === o ? 'on' : ''}" data-act="hmbio" data-m="${m.id}" data-v="${o}" aria-label="${esc(m.name)}: ${o}" aria-pressed="${v === o}">${o}</button>`).join('')}</div></div>`; }).join('')}</div></div>` : '';
  return `${demoBar('habits', demo)}
  ${none ? emptyCard('habits', 'Привычки', 'Добавьте привычки — «2 литра воды», «Зарядка», «Чтение 30 страниц» — и отмечайте их каждый день. Здесь будет процент по каждой и сравнение с прошлым месяцем.') : ''}
  ${today}
  ${foldHTML('h-grid', 'Таблица месяца', `${pctTxt(ms.pct)} · ${ymTitle(ym).toLowerCase()}`, () => `<div class="card"><div class="card-h"><b>Трекер привычек</b><small>${ymTitle(ym)}${S.settings.habitPast ? '' : ' · отмечать можно только сегодня'}</small></div>${habitGrid(ym)}</div>`, true, { ic:IC.habit })}
  ${foldHTML('h-prog', 'Прогресс и сравнение', dl == null ? 'появится с отметками' : `${dl >= 0 ? '+' : '−'}${Math.abs(dl)}% к ${prevName.replace(/ь$/, 'ю').replace(/й$/, 'ю').replace(/т$/, 'ту')}`, () => `<div class="hb-two">${habitWave(ym)}${hst.progress}</div>${hst.stable}`, isWide, { ic:IC.trophy })}
  ${foldHTML('h-per', 'Раз в неделю и раз в месяц', nWM ? plural(nWM, ['привычка', 'привычки', 'привычек']) : 'пока нет', () => `<div class="hb-two">${periodicCard('weekly', ym)}${periodicCard('monthly', ym)}</div>`, () => nWM > 0 && isWide(), { ic:IC.cal })}
  ${foldHTML('h-bio', 'Самочувствие', cur ? (filled ? `сегодня ${filled} из ${M.length}` : 'сегодня не отмечено') : ymTitle(ym).toLowerCase(), () => `${bioToday}${bioCard(ym)}`, false, { ic:IC.spark })}
  ${foldHTML('h-notes', 'Заметки', nNotes ? plural(nNotes, ['заметка', 'заметки', 'заметок']) + ' за месяц' : 'за месяц пока нет', () => notesCard(ym), false, { ic:IC.note })}`;
}

// ---- Знакомство при первом запуске: 3 шага ----
let onbStep = 0, onbT = null, onbAreas = null, onbName = '';
const ONB_PH = ['встреча завтра в 15:00', 'кафе 450', 'сдать отчёт в пятницу !!', '+ зарплата 60 000', '2 литра воды каждый день'];
const onbIsOpen = () => { const o = $('#onb'); return !!(o && o.classList.contains('show')); };
function onbOpen() {
  onbStep = 0; onbAreas = new Set(S.settings.areas); onbName = S.settings.name || '';
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
    { art:`<div class="onb-form"><label for="onb_name">Как вас зовут?</label><input id="onb_name" class="fin" value="${esc(onbName)}" placeholder="Имя" maxlength="40" autocomplete="given-name">
      <label>Что для вас главное?</label><div class="onb-areas">${AREAS.map(([k, ic, n]) => `<button class="onb-a${onbAreas.has(k) ? ' on' : ''}" data-act="onbarea" data-k="${k}" aria-pressed="${onbAreas.has(k)}">${I(ic, 20)}<span>${n}</span><i>${onbAreas.has(k) ? I(IC.check, 13) : ''}</i></button>`).join('')}</div>
      <p class="set-note">Выбранное — первым на Главной, остальное — в свёрнутых блоках. Всё меняется в любой момент.</p></div>`,
      h:'Сделаем Parsimony вашим', p:'' },
  ];
  const s = steps[onbStep], last = onbStep === steps.length - 1;
  el.innerHTML = `<div class="onb-box">
    <div class="onb-top"><span class="wordmark">${APP_NAME}</span>${last ? '' : '<button class="onb-skip" data-act="onbskip">Пропустить</button>'}</div>
    ${last ? '' : `<div class="onb-art">${s.art}</div>`}
    <div class="onb-txt"><small>Шаг ${onbStep + 1} из ${steps.length}</small><h2>${s.h}</h2>${s.p ? `<p>${s.p}</p>` : ''}</div>
    ${last ? s.art : ''}
    ${last ? `<div class="onb-foot last"><button class="btn pri" data-act="onbdone">Начать</button>
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
function onbFinish(demo) {
  const n = $('#onb_name'); if (n) onbName = n.value;
  if (onbName.trim()) S.settings.name = onbName.trim().slice(0, 40);
  if (onbAreas && onbAreas.size) S.settings.areas = AREAS.map(a => a[0]).filter(k => onbAreas.has(k));
  S.settings.onboarded = 1;
  if (demo) { if (!S.events.some(e => e.demo && !e.goal)) SEC.tasks.demo(true); if (!S.goals.some(g => g.demo)) SEC.goals.demo(true); if (!S.habits.some(h => h.demo)) SEC.habits.demo(true); if (!S.fin.ops.some(o => o.demo)) SEC.fin.demo(true); }
  save(); onbClose();
  if (sec !== 'home') setSec('home'); else render();
  toast(demo ? 'Добавлен пример — в каждом разделе его можно убрать одной кнопкой' : 'Готово! Напишите первую запись в строке на Главной');
  const o = $('.h2-omni'); if (o) { o.classList.add('pulse'); setTimeout(() => o.classList.remove('pulse'), 2600); }
}
ACT.onbnext = () => { onbStep = Math.min(2, onbStep + 1); onbDraw(); };
ACT.onbback = () => { const n = $('#onb_name'); if (n) onbName = n.value; onbStep = Math.max(0, onbStep - 1); onbDraw(); };
ACT.onbskip = () => { S.settings.onboarded = 1; save(); onbClose(); };
ACT.onbdone = () => onbFinish(false);
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

// Главная на ПК: свёрнутые блоки (Самочувствие, Цели, Мысли дня…) встают в ту колонку, что короче, — без пустот.
// Место считается по свёрнутой высоте, поэтому блок не прыгает в другую колонку, когда его открывают. На телефоне порядок как в разметке.
function balanceHome() {
  const cols = $$('.h2-col'); if (innerWidth < 900 || cols.length !== 2) return;
  const folds = $$('.h2-col > .fold'); folds.forEach(f => f.remove());
  const h = cols.map(c => c.getBoundingClientRect().height);
  folds.forEach(f => { const i = h[0] <= h[1] ? 0 : 1; cols[i].appendChild(f); h[i] += 66; });
}
SEC.home.after = () => { omRefresh(); balanceHome(); };
SEC.tasks.after = omRefresh;
if (!S.settings.onboarded) setTimeout(onbOpen, 350);
