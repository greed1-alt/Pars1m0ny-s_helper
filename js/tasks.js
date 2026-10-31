// ---- Задачи: неделя по дням, «Мои задачи», сводка по приоритетам, фокус месяца, динамика ----
// Задача — это обычное событие календаря с task:true и приоритетом prio, поэтому видна и в календаре.
const PRIO = { urgent:{ n:'Срочно', c:'var(--c-red)' }, high:{ n:'Высокий', c:'var(--c-violet)' }, mid:{ n:'Средний', c:'var(--c-yellow)' }, low:{ n:'Низкий', c:'var(--c-blue)' } };
const PRIO_ORDER = ['urgent', 'high', 'mid', 'low'];
const prioOf = e => PRIO[e.prio] ? e.prio : 'mid';
const prioRank = e => PRIO_ORDER.indexOf(prioOf(e));
const NDAY = ['день', 'дня', 'дней'];

onMigrate(() => {
  if (!S.focus || typeof S.focus !== 'object' || Array.isArray(S.focus)) S.focus = {};
  if (!S.ygoal || typeof S.ygoal !== 'object' || Array.isArray(S.ygoal)) S.ygoal = {};
  // Один раз: дела без времени и без повтора становятся задачами
  if (!S.settings.tasksMig) { S.events.forEach(e => { if (e.task == null && !e.time && !isRec(e)) { e.task = true; e.prio = 'mid'; } }); S.settings.tasksMig = 1; }
});

let tFilter = 'active', tPrio = '';
const tasksAll = () => S.events.filter(e => e.task && !hiddenCats.has(e.cat));
const dayTasks = k => evOn(k).filter(e => e.task);
const taskWeek = () => { const s = weekStartOf(sel); return [...Array(7)].map((_, i) => addDays(s, i)); };
const shortDate = k => { const d = pd(k); return d.getDate() + ' ' + MONS[d.getMonth()]; };
function newTask(date) {
  const wk = taskWeek(), d = date || (sec === 'tasks' && !wk.includes(todayK()) ? wk[0] : todayK());
  openEvent(null, { task:true, date:d, prio: tPrio || 'mid' });
}
function addTaskQuick(raw, d) {
  raw = raw.trim(); if (!raw) return;
  const p = parseNL(raw, d);
  quickCreate(p.found && p.title ? p.title : raw, p.date || d, p.time || '', p.time2 || '', p.cat, { task:true, prio: tPrio || 'mid' });
}

// Строки таблицы: у повторяющейся задачи — ближайшее повторение
function taskRows() {
  let list = tasksAll().map(e => { const k = isRec(e) ? nextOcc(e) : e.date; return { e, k, done: isDone(e, k) }; });
  if (tFilter === 'active') list = list.filter(x => !x.done); else if (tFilter === 'done') list = list.filter(x => x.done);
  if (tPrio) list = list.filter(x => prioOf(x.e) === tPrio);
  const dir = tFilter === 'done' ? -1 : 1;
  return list.sort((a, b) => a.done - b.done || dir * a.k.localeCompare(b.k) || prioRank(a.e) - prioRank(b.e) || (a.e.time || '').localeCompare(b.e.time || ''));
}
const leftTxt = (k, done) => {
  if (done) return ['—', ''];
  const n = dayDiff(todayK(), k);
  return n < 0 ? ['просрочено на ' + plural(-n, NDAY), 'late'] : n === 0 ? ['сегодня', 'now'] : n === 1 ? ['завтра', ''] : ['через ' + plural(n, NDAY), ''];
};

// Доска недели: день — строка, задачи — «таблетками» цвета календаря, пустой день — тонкая строка (31 октября 2026, вариант Б: «много пустого места» у колонок с кольцами).
// Поле новой задачи открывается кнопкой «+» только в своём дне: Enter добавляет и оставляет поле, Esc или уход из пустого поля закрывают
let twOpen = null;
function weekBoard() {
  const t = todayK();
  return `<div class="tw">${taskWeek().map(k => {
    const list = dayTasks(k), done = list.filter(e => e.done).length, n = list.length, open = twOpen === k;
    const rows = list.map(e => `<div class="tw-t${e.done ? ' done' : ''}" style="--c:${cat(e.cat).color}"><button class="chk" data-act="toggle" data-id="${e.id}" data-d="${k}" style="--c:${t3Ring(prioOf(e))}" aria-label="${e.done ? 'Снять отметку' : 'Выполнено'} · важность: ${PRIO[prioOf(e)].n}">${e.done ? I(IC.check, 12) : ''}</button><button class="tw-n" data-act="edit" data-id="${e.id}" data-d="${k}">${esc(e.title)}${e.time ? ` <small>${esc(e.time)}</small>` : ''}</button></div>`).join('');
    return `<div class="tw-day${k === t ? ' is-today' : ''}"><div class="tw-h"><b>${pd(k).getDate()}</b><span>${DOW[dowIdx(k)]}</span></div>
      <div class="tw-list">${rows || (open ? '' : '<span class="tw-e">свободно</span>')}${open ? `<input class="tw-add" data-d="${k}" type="text" placeholder="Новая задача" autocomplete="off" aria-label="Новая задача на ${esc(fmtLong(k))}">` : ''}</div>
      <div class="tw-r">${n ? `<span aria-label="Сделано ${done} из ${n}">${done}/${n}</span>` : ''}<button class="tw-plus${open ? ' on' : ''}" data-act="twadd" data-d="${k}" aria-label="Добавить задачу на ${esc(fmtLong(k))}" aria-expanded="${open}">${I(IC.plus, 15)}</button></div></div>`;
  }).join('')}</div>`;
}
ACT.twadd = el => { twOpen = twOpen === el.dataset.d ? null : el.dataset.d; render(); const i = $('.tw-add'); if (i) i.focus(); };
document.addEventListener('focusout', e => { const f = e.target; if (!f.classList || !f.classList.contains('tw-add') || f.value.trim()) return;
  setTimeout(() => { const a = document.activeElement; if (twOpen && !(a && a.classList.contains('tw-add'))) { twOpen = null; render(); } }, 150); });

// ---- Серия и статистика (31 октября 2026; вид выбрал пользователь из вариантов: итог недели, три числа, неделя столбиками, карта дней) ----
// Время отметки не хранится, поэтому сделанная задача считается за день, на который стоит. Серия — дни подряд, когда сделана хотя бы одна задача:
// день без задач и замороженный день (S.frz, shop.js) её не прерывают, сегодняшний — тоже, пока не закончился. Скрытые календари считаются
function taskLog() {
  if (evCache.has('tkLog')) return evCache.get('tkLog');
  const t = todayK(), lim = addDays(t, -730), done = {}, plan = {}, fz = new Set(Array.isArray(S.frz) ? S.frz : []), add = (m, k) => { m[k] = (m[k] || 0) + 1; };
  let first = t, cur = 0, best = 0;
  S.events.forEach(e => { if (!e.task) return;
    if (e.date < first) first = e.date;
    if (!isRec(e)) { add(plan, e.date); if (e.done) add(done, e.date); return; }
    (e.doneDates || []).forEach(k => add(done, k));
    for (let k = e.date < lim ? lim : e.date; k <= t; k = addDays(k, 1)) if (occurs(e, k)) add(plan, k);
  });
  for (let k = first < lim ? lim : first; k <= t; k = addDays(k, 1)) {
    if (done[k]) best = Math.max(best, ++cur);
    else if (plan[k] && k !== t && !fz.has(k)) cur = 0;
  }
  const r = { done, plan, cur, best }; evCache.set('tkLog', r); return r;
}
let flameN = 0;
const flameI = s => { const g = 'tfl' + (flameN++); return `<svg class="ts-fl" width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb547"/><stop offset="1" stop-color="#ff7a3d"/></linearGradient></defs><path fill="url(#${g})" d="M12.7 2.2c.5 3.3-1.2 4.9-2.9 6.6C8.1 10.5 6 12.4 6 15.3 6 19 8.8 22 12.3 22c3.6 0 6.2-2.9 6.2-6.3 0-2.8-1.5-4.8-2.9-6.3-.2 1.3-.8 2.3-1.7 2.9.3-3.6-.2-7.3-1.2-10.1Z"/><path fill="#fff" fill-opacity=".55" d="M12.3 20.3c-1.8 0-3.1-1.4-3.1-3.1 0-1.7 1.3-2.7 2.2-3.8.4 1 1.2 1.4 1.9 2 .8.6 1.4 1 1.4 2 0 1.7-1.4 2.9-2.4 2.9Z"/></svg>`; };
const plWord = (n, f) => plural(n, f).slice(String(n).length + 1);   // слово без числа: число стоит отдельно, крупно
// Итог недели и серия — наверху страницы («нужно чтобы серия была повыше, на видном месте»): число, сравнение с прошлой, линия за 8 недель. Скрыли статистику — нет и её
function taskHero() {
  if (!layOf('tasks').some(x => x.k === 'stats' && x.m !== 'off')) return '';
  const L = taskLog(), w0 = weekStartOf(todayK()), wk = [...Array(8)].map((_, i) => { const s = addDays(w0, 7 * (i - 7)); return [...Array(7)].reduce((a, _x, d) => a + (L.done[addDays(s, d)] || 0), 0); });
  const n = wk[7], p = wk[6], top = Math.max(4, ...wk) * 1.15, W = 400, H = 84, xs = wk.map((_, i) => i / 7 * W), ys = wk.map(v => H - 8 - v / top * (H - 14));
  let d = `M${xs[0]} ${ys[0].toFixed(1)}`; for (let i = 1; i < 8; i++) { const m = (xs[i - 1] + xs[i]) / 2; d += ` C${m} ${ys[i - 1].toFixed(1)},${m} ${ys[i].toFixed(1)},${xs[i]} ${ys[i].toFixed(1)}`; }
  const cmp = n > p ? ` · на ${n - p} больше прошлой` : !p ? '' : n < p ? ` · на прошлой — ${p}` : ' · столько же, сколько на прошлой';
  // Цвета — от палитры пользователя, белый текст на них читается в любой из них (не меньше 4,5:1)
  const acc = getComputedStyle(document.documentElement).getPropertyValue('--acc').trim(), dk = '#14122e', c1 = readableC(mixC(/^#[0-9a-f]{6}$/i.test(acc) ? acc : '#4b4fd1', dk, .38), dk, ['#ffffff'], 4.7), c2 = readableC(mixC(c1, '#a24bd6', .28), dk, ['#ffffff'], 4.6), c3 = mixC(c1, '#e0609f', .55);
  return `<div class="ts-hero" style="--c1:${c1};--c2:${c2};--c3:${c3}"><div class="ts-hp">${L.cur ? `${flameI(18)}<b>${plural(L.cur, NDAY)}</b>` : '<b>Серия не начата</b>'}${hintK('taskStreak')}</div>
    <div class="ts-big">${n}</div><p>${plWord(n, ['задача', 'задачи', 'задач'])} на этой неделе${cmp}</p>
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path d="${d} L${W} ${H} L0 ${H}Z" fill="rgba(255,255,255,.16)"/><path d="${d}" fill="none" stroke="#fff" stroke-width="2.5" vector-effect="non-scaling-stroke"/></svg></div>`;
}
// Карта дней: столбец — неделя, клетка — день, чем ярче, тем больше сделано. Недель столько, чтобы клетки были примерно одного размера на любом экране
function taskHeat(week) {
  const t = todayK(), L = taskLog(), n = innerWidth >= 900 ? Math.max(20, Math.min(53, Math.round((innerWidth - 320 - (week ? 330 : 0)) / 23))) : Math.max(14, Math.min(30, Math.floor((innerWidth - 64) / 17)));
  const s0 = addDays(weekStartOf(t), -7 * (n - 1)), lv = v => !v ? 0 : v < 2 ? 1 : v < 3 ? 2 : v < 5 ? 3 : 4;
  let cells = '', heads = '', last = -9, sum = 0;
  for (let w = 0; w < n; w++) {
    const days = [...Array(7)].map((_, i) => addDays(s0, w * 7 + i)), m = days.find(k => k.endsWith('-01')) || (w === 0 && +days[0].slice(8) < 15 ? days[0] : null);
    if (m && w - last >= 4 && n - w >= 3) { heads += `<span style="grid-column:${w + 1}/span ${Math.min(4, n - w)}">${MON[+m.slice(5, 7) - 1].toLowerCase()}</span>`; last = w; }
    days.forEach(k => { if (k > t) { cells += '<i class="f"></i>'; return; } const v = L.done[k] || 0, d = pd(k); sum += v;
      cells += `<i class="l${lv(v)}${k === t ? ' t' : ''}" title="${d.getDate()} ${MONG[d.getMonth()]}: ${v ? 'сделано ' + plural(v, ['задача', 'задачи', 'задач']) : 'ничего'}"></i>`; });
  }
  return `<div class="card ts-map"><div class="card-h"><b>Карта дней</b><small>сделано задач за ${plural(Math.round(n / 4.35), ['месяц', 'месяца', 'месяцев'])}</small></div>
    <div class="ts-mh" style="--n:${n}">${heads}</div><div class="ts-hm" style="--n:${n}" role="img" aria-label="Карта дней за ${plural(n, ['неделю', 'недели', 'недель'])}: сделано ${plural(sum, ['задача', 'задачи', 'задач'])}">${cells}</div>
    <div class="ts-lg">меньше <i class="l0"></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i> больше</div></div>`;
}
// week — показать «Неделю по дням»: в «Фокусе дня» на ПК она уже стоит справа наверху и не повторяется
function taskStatsHTML(actN, urg, week) {
  const t = todayK(), L = taskLog(), ym = ymOf(t); let p = 0, d = 0;
  ymDays(ym).forEach(k => { if (k <= t) { p += L.plan[k] || 0; d += L.done[k] || 0; } });
  const tile = (v, s) => `<div class="card ts-t"><b>${v}</b><span>${s}</span></div>`;
  return `<div class="ts"><div class="ts-tl">${tile(L.best, 'рекорд серии')}${tile(p ? Math.min(100, Math.round(d / p * 100)) + ' %' : '—', 'выполнено за ' + MON[+ym.slice(5) - 1].toLowerCase())}${tile(actN, plWord(actN, ['активная', 'активные', 'активных']) + (urg ? ', ' + plural(urg, ['срочная', 'срочные', 'срочных']) : ''))}</div>
    <div class="ts-low${week ? ' two' : ''}">${week ? t4Week() : ''}${taskHeat(week)}</div></div>`;
}

// «Важные задачи»: срочные (не выполненные) и ближайшие шаги целей — в боковой панели ПК и карточкой на телефоне
const dueShort = k => { const n = dayDiff(todayK(), k); return n < 0 ? 'просрочено' : n === 0 ? 'сегодня' : n === 1 ? 'завтра' : shortDate(k); };
function importantHTML() {
  const t = todayK();
  const urg = tasksAll().map(e => ({ e, k: isRec(e) ? nextOcc(e) : e.date })).filter(x => prioOf(x.e) === 'urgent' && !isDone(x.e, x.k)).sort((a, b) => a.k.localeCompare(b.k)).slice(0, 6);
  const steps = goalNextSteps(6);
  return `<div class="sbl-sub">Срочные</div>
    ${urg.length ? urg.map(({ e, k }) => `<button class="sbl" data-act="edit" data-id="${e.id}" data-d="${k}"><i class="sbl-dot" style="--c:${PRIO.urgent.c}"></i><span class="sbl-t">${esc(e.title)}</span><small class="${k < t ? 'late' : ''}">${dueShort(k)}</small></button>`).join('') : '<p class="sbl-empty">Срочных задач нет 👍</p>'}
    <div class="sbl-sub">Шаги к целям</div>
    ${steps.length ? steps.map(stepRowSide).join('') : `<p class="sbl-empty">${S.goals.some(g => !g.done) ? 'Все шаги сделаны 🎉' : 'Поставьте цель в разделе «Цели»'}</p>`}`;
}

SEC.tasks = {
  name:'Задачи', icon:IC.tasks, newLabel:'Задача',
  title: () => { const wk = taskWeek(), a = pd(wk[0]), b = pd(wk[6]); const r = a.getMonth() === b.getMonth() ? `${a.getDate()}–${b.getDate()} ${MONS[b.getMonth()]}` : `${a.getDate()} ${MONS[a.getMonth()]} – ${b.getDate()} ${MONS[b.getMonth()]}`; return innerWidth >= 900 ? `Задачи<span class="sub">неделя ${isoWeek(wk[0])} · ${r}</span>` : r; },
  html: () => tasksHTML(),
  move: n => { sel = addDays(sel, 7 * n); syncMini(); },
  create: () => newTask(),
  side: () => `<div class="sb-sec"><div class="sb-h">Важные задачи</div>${importantHTML()}</div>`,

  demo: on => {
    if (!on) return SEC.goals.demo(false);   // «Цели» — вкладка этой же страницы, пример убирается со всей страницы
    const wk = taskWeek(), t = todayK(), c = i => S.cats[i % S.cats.length].id;
    const L = [[0, 'Составить план на неделю', 'high', 0, 1], [0, 'Ответить на письма', 'mid', 0, 1], [1, '10 000 шагов', 'mid', 2, 1], [1, 'Отчёт для руководителя', 'urgent', 0, 1],
      [2, 'Позвонить маме', 'high', 1, 0], [2, 'Прочитать 20 страниц', 'low', 3, 1], [3, 'Подготовить презентацию', 'urgent', 0, 0], [3, 'Медитация 10 минут', 'low', 1, 1],
      [4, 'Оплатить интернет', 'mid', 1, 1], [4, 'Встреча с командой', 'high', 0, 0], [5, 'Уборка в квартире', 'mid', 1, 1], [5, 'Спортзал', 'mid', 2, 0], [6, 'Отдых без телефона', 'low', 1, 1], [6, 'Задачи на следующую неделю', 'high', 0, 0]];
    const task = (title, date, prio, ci, done) => S.events.push({ id:uid(), demo:true, task:true, prio, title, date, time:'', time2:'', cat:c(ci), note:'', loc:'', repeat:{ type:'none' }, reminder:{ enabled:false, offset:15, repeat:'none', days:[] }, done, doneDates:[], skip:[] });
    L.forEach(([d, title, prio, ci, done]) => task(title, wk[d], prio, ci, !!done && wk[d] <= t));
    // Прошлые 9 недель — чтобы серия, линия и карта дней в примере были заполнены
    const pst = ['Разобрать почту', 'Купить продукты', 'Позвонить клиенту', 'Тренировка', 'Прочитать главу', 'Оплатить счёт'], w0 = weekStartOf(t);
    for (let d = 1; d <= 63; d++) { const k = addDays(w0, -d), n = d < 10 ? 1 + d % 3 : [2, 0, 3, 1, 4, 2, 1, 0, 3, 2, 5][d % 11];
      if (d === 8 || d === 33) { task(d === 8 ? 'Записаться к стоматологу' : 'Продлить страховку', k, 'mid', 1, false); continue; }   // перерывы: серия и рекорд в примере — как в жизни
      for (let i = 0; i < n; i++) task(pst[(d + i) % pst.length], k, 'mid', d + i, true); }
  },
};

// Поле новой задачи на доске недели
document.addEventListener('keydown', e => {
  const t = e.target; if (e.isComposing || !t.classList || !t.classList.contains('tw-add')) return;
  if (e.key === 'Escape') { twOpen = null; render(); return; }
  if (e.key !== 'Enter') return;
  e.preventDefault(); const d = t.dataset.d; addTaskQuick(t.value, d);
  const i = $(`.tw-add[data-d="${d}"]`); if (i) i.focus();
});
ACT.tfilter = el => { tFilter = el.dataset.f; render(); };
ACT.tprio = el => { tPrio = tPrio === el.dataset.p ? '' : el.dataset.p; if (tPrio && tFilter === 'done') tFilter = 'active'; render(); };
