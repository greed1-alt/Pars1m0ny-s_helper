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

function weekBoard() {
  const t = todayK();
  return `<div class="tw">${taskWeek().map(k => {
    const list = dayTasks(k), done = list.filter(e => e.done).length, n = list.length, d = pd(k);
    const rows = list.map(e => `<div class="tw-row${e.done ? ' done' : ''}" style="--c:${cat(e.cat).color}"><button class="chk" data-act="toggle" data-id="${e.id}" data-d="${k}" aria-label="Выполнено">${e.done ? I(IC.check, 13) : ''}</button><button class="tw-t" data-act="edit" data-id="${e.id}" data-d="${k}">${esc(e.title)}${e.time ? ` <small>${esc(e.time)}</small>` : ''}</button>${prioOf(e) === 'urgent' || prioOf(e) === 'high' ? `<i class="tw-p" style="--c:${PRIO[prioOf(e)].c}" title="${PRIO[prioOf(e)].n}"></i>` : ''}</div>`).join('');
    return `<div class="tw-day${k === t ? ' is-today' : ''}${k < t ? ' past' : ''}">
      <div class="tw-h"><span>${d.getDate()} ${MONS[d.getMonth()]}</span><b>${DOWF[dowIdx(k)]}</b></div>
      <div class="tw-list">${rows || '<p class="tw-empty">Пусто</p>'}</div>
      <input class="tw-add" data-d="${k}" type="text" placeholder="+ задача" autocomplete="off" aria-label="Новая задача на ${esc(fmtLong(k))}">
      <div class="tw-ring">${ringSVG(n ? done / n : 0, 58, 'var(--good)', n ? Math.round(done / n * 100) + '%' : '—', n ? done + ' из ' + n : '')}</div>
    </div>`;
  }).join('')}</div>`;
}

function taskSummary() {
  const act = tasksAll().map(e => ({ e, k: isRec(e) ? nextOcc(e) : e.date })).filter(x => !isDone(x.e, x.k));
  const cnt = p => act.filter(x => prioOf(x.e) === p).length;
  const segs = PRIO_ORDER.map(p => ({ name:PRIO[p].n, val:cnt(p), color:PRIO[p].c, tip:`${PRIO[p].n}\n${plural(cnt(p), ['задача', 'задачи', 'задач'])}` }));
  const byCat = S.cats.map(c => ({ c, n: act.filter(x => x.e.cat === c.id).length })).filter(x => x.n);
  const wk = taskWeek(), wl = wk.flatMap(k => dayTasks(k)), wd = wl.filter(e => e.done).length;
  return `<div class="card tk-sum">
    <div class="card-h"><b>Сводка</b><small>активные задачи</small></div>
    <div class="tk-sum-top">${donutSVG(segs, 128, String(act.length), act.length === 1 ? 'задача' : 'задач')}
      <div class="tk-prios">${PRIO_ORDER.map(p => `<button class="tk-pr${tPrio === p ? ' on' : ''}" data-act="tprio" data-p="${p}" style="--c:${PRIO[p].c}"><i></i>${PRIO[p].n}<b>${cnt(p)}</b></button>`).join('')}</div></div>
    ${byCat.length ? `<div class="tk-cats">${byCat.map(x => `<span style="--c:${x.c.color}"><i></i>${esc(x.c.name)} <b>${x.n}</b></span>`).join('')}</div>` : ''}
    <div class="tk-week-stat"><span>Выполнено за неделю</span><b>${wd} из ${wl.length}</b></div>
    <div class="ds-bar"><i style="width:${wl.length ? Math.round(wd / wl.length * 100) : 0}%"></i></div>
  </div>`;
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

function taskDynamics() {
  const ym = ymOf(sel), days = ymDays(ym), t = todayK();
  const plan = days.map(k => { const n = dayTasks(k).length; return k > t && !n ? null : n; }), done = days.map((k, i) => k <= t ? dayTasks(k).filter(e => e.done).length : null);
  const top = Math.max(4, Math.ceil(Math.max(0, ...plan.filter(v => v != null)) / 2) * 2);
  return `<div class="card dyn-card">
    <div class="card-h"><b>Динамика</b><small>${ymTitle(ym)}</small></div>
    ${legendHTML([{ name:'Поставлено', color:'var(--mut)' }, { name:'Выполнено', color:'var(--c-blue)' }])}
    ${chartBox({ kind:'line', xs: days.map(k => String(+k.slice(8))), max:top, yTicks:[0, top / 2, top], tipTitle: i => fmtLong(days[i]),
      series:[{ name:'поставлено', color:'var(--mut)', vals:plan, dim:true }, { name:'выполнено', color:'var(--c-blue)', vals:done }] }, 170, 'Поставлено и выполнено задач по дням')}
  </div>`;
}

SEC.tasks = {
  name:'Задачи', icon:IC.tasks, newLabel:'Задача',
  title: () => { const wk = taskWeek(), a = pd(wk[0]), b = pd(wk[6]); const r = a.getMonth() === b.getMonth() ? `${a.getDate()}–${b.getDate()} ${MONS[b.getMonth()]}` : `${a.getDate()} ${MONS[a.getMonth()]} – ${b.getDate()} ${MONS[b.getMonth()]}`; return innerWidth >= 900 ? `Задачи<span class="sub">неделя ${isoWeek(wk[0])} · ${r}</span>` : r; },
  html: () => tasksHTML(),
  move: n => { sel = addDays(sel, 7 * n); syncMini(); },
  create: () => newTask(),
  side: () => `<div class="sb-sec"><div class="sb-h">Важные задачи</div>${importantHTML()}</div>`,

  demo: on => {
    if (!on) { S.events = S.events.filter(e => !e.demo || e.goal); return; }
    const wk = taskWeek(), t = todayK(), c = i => S.cats[i % S.cats.length].id;
    const L = [[0, 'Составить план на неделю', 'high', 0, 1], [0, 'Ответить на письма', 'mid', 0, 1], [1, '10 000 шагов', 'mid', 2, 1], [1, 'Отчёт для руководителя', 'urgent', 0, 1],
      [2, 'Позвонить маме', 'high', 1, 0], [2, 'Прочитать 20 страниц', 'low', 3, 1], [3, 'Подготовить презентацию', 'urgent', 0, 0], [3, 'Медитация 10 минут', 'low', 1, 1],
      [4, 'Оплатить интернет', 'mid', 1, 0], [4, 'Встреча с командой', 'high', 0, 0], [5, 'Уборка в квартире', 'mid', 1, 0], [5, 'Спортзал', 'mid', 2, 0], [6, 'Отдых без телефона', 'low', 1, 0], [6, 'Задачи на следующую неделю', 'high', 0, 0]];
    L.forEach(([d, title, prio, ci, done]) => { const k = wk[d]; S.events.push({ id:uid(), demo:true, task:true, prio, title, date:k, time:'', time2:'', cat:c(ci), note:'', loc:'', repeat:{ type:'none' }, reminder:{ enabled:false, offset:15, repeat:'none', days:[] }, done: !!done && k <= t, doneDates:[], skip:[] }); });
  },
};

// Ввод с клавиатуры: Enter в колонке дня («Доска недели»)
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || e.isComposing) return;
  const t = e.target;
  if (t.classList && t.classList.contains('tw-add')) {
    e.preventDefault(); const d = t.dataset.d; addTaskQuick(t.value, d);
    const i = $(`.tw-add[data-d="${d}"]`); if (i) i.focus();
  }
});
ACT.tfilter = el => { tFilter = el.dataset.f; render(); };
ACT.tprio = el => { tPrio = tPrio === el.dataset.p ? '' : el.dataset.p; if (tPrio && tFilter === 'done') tFilter = 'active'; render(); };
