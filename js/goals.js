// ---- Цели: срок, шаги, прогресс и темп, подначки за пропуски и похвалы за успехи ----
// S.goals = [{ id, title, emoji, due, created, why, done, doneAt, steps:[{ id, t, done }] }]
// Шаг без даты лежит в goal.steps. Шаг со сроком — обычная задача календаря (task:true) с полем goal = id цели:
// он виден в «Задачах», «Календаре» и плане дня, а пропущенный попадает в «Вы пропустили».
const GOAL_EMOJI = ['🎯', '🏆', '🏠', '💰', '📚', '💪', '✈️', '🚗', '💼', '🎓', '❤️', '🧘', '🎨', '🌍', '🚀', '⭐'];
onMigrate(() => {
  // Один раз: «Фокус месяца» и «Цель на год» превращаются в цели со сроком (старые данные S.focus / S.ygoal не трогаем)
  if (!Array.isArray(S.goals)) {
    S.goals = [];
    const add = (o, due, created, emoji, def) => {
      if (!o || typeof o !== 'object' || (!o.title && !(o.items || []).length)) return;
      const steps = (o.items || []).map((it, i) => ({ id: 's' + uid() + i, t: String(it.t || ''), done: !!it.done }));
      S.goals.push(Object.assign({ id: 'g' + uid() + S.goals.length, title: o.title || def, emoji, due, created, why: '', done: false, steps }, o.demo ? { demo: true } : {}));
    };
    Object.entries(S.focus || {}).forEach(([ym, o]) => { if (/^\d{4}-\d{2}$/.test(ym)) add(o, ymDays(ym).slice(-1)[0], ym + '-01', '🎯', 'Фокус месяца'); });
    Object.entries(S.ygoal || {}).forEach(([y, o]) => { if (/^\d{4}$/.test(y)) add(o, y + '-12-31', y + '-01-01', '🏆', 'Цель на ' + y); });
  }
  S.goals = S.goals.filter(g => g && g.id);
  S.goals.forEach(g => {
    if (!Array.isArray(g.steps)) g.steps = [];
    if (!isDayKey(g.due || '')) g.due = todayK().slice(0, 4) + '-12-31';
    if (!isDayKey(g.created || '')) g.created = todayK();
    if (!g.emoji) g.emoji = '🎯';
  });
  // Шаг-задача, у которой цели больше нет, остаётся обычной задачей
  S.events.forEach(e => { if (e.goal && !S.goals.some(g => g.id === e.goal)) delete e.goal; });
  const st = S.settings;
  if (!st.phr || typeof st.phr !== 'object') st.phr = { taunts: true, praise: true, custom: [] };
  if (!Array.isArray(st.phr.custom)) st.phr.custom = [];
});

const goalById = id => S.goals.find(g => g.id === id);
const activeGoals = () => S.goals.filter(g => !g.done).sort((a, b) => a.due.localeCompare(b.due));
const stepDone = e => isRec(e) ? (e.doneDates || []).length > 0 : !!e.done;
// Все шаги цели: сначала невыполненные (со сроком — по дате, потом без срока), затем выполненные
function goalSteps(g) {
  const dated = S.events.filter(e => e.goal === g.id).map(e => ({ kind: 't', id: e.id, t: e.title, date: isRec(e) ? nextOcc(e) : e.date, done: stepDone(e), e }));
  const free = g.steps.map(s => ({ kind: 'f', id: s.id, t: s.t, date: '', done: !!s.done, s }));
  return [...dated, ...free].sort((a, b) => a.done - b.done || (a.date || '9999').localeCompare(b.date || '9999'));
}
function goalStat(g) {
  const t = todayK(), st = goalSteps(g), n = st.length, d = st.filter(x => x.done).length;
  const late = st.filter(x => !x.done && x.date && x.date < t), next = st.find(x => !x.done) || null, left = dayDiff(t, g.due);
  const span = Math.max(1, dayDiff(g.created, g.due)), passed = Math.min(1, Math.max(0, dayDiff(g.created, t) / span));
  const pct = n ? d / n : g.done ? 1 : 0;
  // Темп: сколько шагов сделано относительно того, сколько прошло времени до срока
  const pace = g.done || !n ? '' : left < 0 ? 'late' : late.length || pct + .15 < passed ? 'behind' : pct > passed + .1 ? 'ahead' : 'ok';
  return { st, n, d, pct, late, next, left, pace, overdue: !g.done && left < 0 };
}
const PACE = { ahead: 'с опережением', ok: 'в графике', behind: 'отстаёте', late: 'срок прошёл' };
const dueTxt = g => { const n = dayDiff(todayK(), g.due); return n < 0 ? `срок прошёл ${plural(-n, NDAY)} назад` : n === 0 ? 'срок — сегодня' : `до ${shortDate(g.due)} · ${plural(n, NDAY)}`; };

// ---- Подначки и похвалы ----
// Тон — жёсткий сарказм без мата (решение пользователя). {goal} — цель, {step} — шаг, {left} — сколько шагов осталось.
const TAUNTS = [
  '«{step}» сам себя не сделает. Удивительно, правда?',
  'Цель «{goal}» скучает. Вы, судя по всему, нет.',
  'Ещё один день без шага к «{goal}». Мечта терпеливая, но не бесконечно.',
  'Дедлайн не двигается сам. В отличие от ваших оправданий.',
  'Вчера вы собирались. Сегодня снова собираетесь. Классика.',
  '«Начну с понедельника» — самая популярная цель в мире. Не будьте как все.',
  'Если откладывать дальше, «{goal}» станет целью на следующий год. Или на следующую жизнь.',
  'Шаг «{step}» всё ещё ждёт. Он вежливый, но уже нервничает.',
  'Время идёт. Прогресс — нет.',
  'Мотивация не придёт. Придёт только дедлайн.',
  'Вы обещали себе. Себе! Неловко получилось.',
  'Даже улитка уже доползла бы. А «{step}» всё ещё не сделан.',
  'Пропустить один раз — случайность. Два — уже новая привычка. Плохая.',
  'Будущий вы смотрит на это с грустью.',
  'Мечтать приятно. Делать — эффективно. Попробуйте второе.',
  '«Потом» — это не дата.',
  'Прогресс-бар цели «{goal}» выглядит одиноко.',
  'Список шагов есть. Шагов нет.',
  'Самое время перестать планировать и начать делать.',
  'Цели без действий называются мечтами. А мечты — это для сна.',
  'Вы же не для красоты записали «{goal}»?',
  'Где-то сейчас кто-то делает ваш шаг «{step}». Только для своей цели.',
  'Отложенное дело весит больше сделанного. Проверено.',
  'Это ваша самая грандиозная цель, вы же не будете жалеть потом?)',
];
const PRAISE = [
  'Вы молодец!',
  'Вы на шаг ближе к цели «{goal}».',
  'Шаг сделан — «{goal}» стала ближе.',
  'Отлично! Осталось шагов: {left}.',
  'Так держать — маленькие шаги дают большой результат.',
  'Ещё один шаг позади. Будущий вы уже благодарен.',
  'Есть! Продолжайте в том же темпе.',
  'Минус одно дело, плюс одна победа.',
];
const phrList = kind => [...(kind === 'taunt' ? TAUNTS : PRAISE), ...S.settings.phr.custom.filter(p => p.kind === kind).map(p => p.t)];
const phrFill = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => v[k] != null ? v[k] : '');
const hashStr = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0; return h; };
// Подначка одна и та же весь день для одной цели — не меняется при каждой перерисовке
function goalTaunt(g, step) {
  if (!S.settings.phr.taunts) return '';
  const l = phrList('taunt'); return phrFill(l[hashStr(todayK() + g.id) % l.length], { goal: g.title, step: step || g.title });
}
function goalPraise(g) {
  if (!S.settings.phr.praise) return '';
  const s = goalStat(g), l = phrList('praise');
  return phrFill(l[Math.floor(Math.random() * l.length)], { goal: g.title, left: Math.max(0, s.n - s.d) });
}
// После отметки шага: похвала, а если все шаги сделаны — подсказка отметить цель достигнутой
function goalStepDone(gid) {
  const g = goalById(gid); if (!g || g.done) return;
  const s = goalStat(g);
  if (s.n && s.d === s.n) toast(`Все шаги цели «${g.title}» сделаны! Отметьте её достигнутой 🏆`);
  else { const p = goalPraise(g); if (p) toast(p); }
}

// ---- Страница «Цели» ----
const goalTag = e => { const g = e.goal && goalById(e.goal); return g ? `<span class="gtag" title="Шаг цели">${esc(g.emoji)} ${esc(g.title)}</span>` : ''; };
function goalCardHTML(g) {
  const s = goalStat(g), late = s.late[0];
  return `<div class="gl-card${s.overdue ? ' over' : ''}" data-act="gopen" data-id="${g.id}" role="button" tabindex="0">
    <div class="gl-top"><span class="gl-em">${esc(g.emoji)}</span><b>${esc(g.title)}</b></div>
    <div class="gl-due${s.overdue ? ' late' : ''}">${esc(dueTxt(g))}</div>
    <div class="gl-bar pace-${s.pace || 'none'}"><i style="width:${Math.round(s.pct * 100)}%"></i></div>
    <div class="gl-meta"><span>${s.n ? `${s.d} из ${plural(s.n, ['шага', 'шагов', 'шагов'])}` : 'шагов пока нет'}</span>${s.pace ? `<span class="pace ${s.pace}">${PACE[s.pace]}</span>` : ''}</div>
    ${s.next ? `<div class="gl-next">Дальше: <b>${esc(s.next.t)}</b>${s.next.date ? ` · ${esc(s.next.date < todayK() ? 'просрочено' : relDay(s.next.date))}` : ''}</div>` : s.n ? '' : '<div class="gl-next">Добавьте шаги — так цель станет планом</div>'}
    ${late || s.overdue ? `<div class="gl-taunt">${I(IC.alert, 15)}<span>${esc(goalTaunt(g, late ? late.t : '')) || (late ? `Просрочен шаг «${esc(late.t)}»` : 'Срок цели прошёл')}</span></div>
      <div class="gl-acts">${late ? `<button class="btn" data-act="glate" data-id="${g.id}">Перенести на завтра${s.late.length > 1 ? ` (${s.late.length})` : ''}</button>` : ''}${s.overdue ? `<button class="btn" data-act="gext" data-id="${g.id}" data-n="7">+ неделя</button><button class="btn" data-act="gext" data-id="${g.id}" data-n="30">+ месяц</button>` : ''}</div>` : ''}
  </div>`;
}
// Краткий список целей — на Главной, в «Задачах»
function goalsMiniHTML(max) {
  // Сначала цели, где есть просрочка, потом — по ближайшему сроку
  const warn = g => { const s = goalStat(g); return s.overdue || s.late.length ? 0 : 1; };
  const l = activeGoals().sort((a, b) => warn(a) - warn(b)).slice(0, max || 3);
  return l.length ? `<div class="gm-list">${l.map(g => { const s = goalStat(g); return `<button class="gm-row" data-act="gopen" data-id="${g.id}"><span class="gm-em">${esc(g.emoji)}</span><span class="gm-t"><b>${esc(g.title)}</b><small${s.overdue || s.late.length ? ' class="late"' : ''}>${s.late.length ? 'просрочен шаг · ' : ''}${esc(dueTxt(g))}</small><span class="gl-bar pace-${s.pace || 'none'}"><i style="width:${Math.round(s.pct * 100)}%"></i></span></span><em>${s.n ? s.d + '/' + s.n : ''}</em></button>`; }).join('')}</div>`
    : `<p class="h2-empty">Целей пока нет. Поставьте первую — со сроком и шагами.</p>`;
}
// Ближайшие шаги всех целей — боковая панель и «Важные задачи»
function goalNextSteps(max) {
  const out = [];
  activeGoals().forEach(g => goalSteps(g).filter(x => !x.done).forEach(x => out.push(Object.assign({ g }, x))));
  return out.sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999')).slice(0, max);
}
const stepRowSide = x => x.kind === 't'
  ? `<div class="sbl"><button class="chk" data-act="toggle" data-id="${x.id}" data-d="${x.date}" aria-label="Выполнено"></button><button class="sbl-t" data-act="edit" data-id="${x.id}" data-d="${x.date}">${esc(x.t)}</button><small class="${x.date < todayK() ? 'late' : ''}">${esc(dueShort(x.date))}</small></div>`
  : `<div class="sbl"><button class="chk" data-act="gfree" data-g="${x.g.id}" data-s="${x.id}" aria-label="Выполнено"></button><button class="sbl-t" data-act="gopen" data-id="${x.g.id}">${esc(x.t)}</button><small>${esc(x.g.emoji)}</small></div>`;

let gDraft = '';
function goalsHTML() {
  const act = activeGoals(), done = S.goals.filter(g => g.done).sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || '')), demo = S.goals.some(g => g.demo), t = todayK();
  const lateAll = act.flatMap(g => goalStat(g).late.map(x => ({ g, x })));
  const doneToday = S.events.filter(e => e.goal && !isRec(e) && e.done && e.date === t).length;
  const nudge = lateAll.length && S.settings.phr.taunts
    ? `<div class="card g-nudge"><div class="g-nudge-h">${I(IC.alert, 18)}<b>${esc(goalTaunt(lateAll[0].g, lateAll[0].x.t))}</b></div>
      <div class="g-late">${lateAll.slice(0, 4).map(({ g, x }) => `<div class="g-late-row"><span>${esc(g.emoji)} ${esc(x.t)}<small>${esc(relDay(x.date))}</small></span><button class="btn" data-act="gstepto" data-id="${x.id}" data-d="${addDays(t, 1)}">Завтра</button><button class="btn" data-act="toggle" data-id="${x.id}" data-d="${x.date}">${I(IC.check, 15)}</button></div>`).join('')}</div></div>`
    : doneToday && S.settings.phr.praise ? `<div class="card g-praise">${I(IC.spark, 18)}<b>Сегодня сделано шагов к целям: ${doneToday}. ${esc((l => l[hashStr(t) % l.length])(PRAISE.filter(p => !p.includes('{'))))}</b></div>` : '';
  const P = S.settings.phr;
  const phrBody = () => `<div class="card"><div class="set-row"><span>Подначки за пропущенные шаги</span><input id="s_taunts" class="sw" type="checkbox"${P.taunts ? ' checked' : ''}></div>
    <div class="set-row"><span>Похвалы за сделанные шаги</span><input id="s_praise" class="sw" type="checkbox"${P.praise ? ' checked' : ''}></div>
    <div class="pe-sec" style="margin-top:14px">Свои фразы</div>
    ${P.custom.map(p => `<div class="ph-row"><span class="ph-k ${p.kind}">${p.kind === 'taunt' ? 'подначка' : 'похвала'}</span><span class="ph-t">${esc(p.t)}</span><button class="fz-x" data-act="phrdel" data-id="${p.id}" aria-label="Удалить фразу">${I(IC.x, 14)}</button></div>`).join('') || '<p class="set-note" style="margin:4px 0 8px">Своих фраз пока нет. В тексте можно писать {goal} — название цели, {step} — шаг.</p>'}
    <div class="ph-add"><select id="ph_k" class="fin" aria-label="Вид фразы"><option value="taunt">Подначка</option><option value="praise">Похвала</option></select><input id="ph_t" class="fin" type="text" maxlength="160" placeholder="Например: «{goal} сама себя не достигнет»" aria-label="Своя фраза"><button class="btn" data-act="phradd">Добавить</button></div>
    <details class="ph-all"><summary>Встроенные фразы: ${TAUNTS.length} подначек и ${PRAISE.length} похвал</summary><ul>${[...TAUNTS, ...PRAISE].map(x => `<li>${esc(x)}</li>`).join('')}</ul></details></div>`;
  return `${demoBar('goals', demo)}
  ${!S.goals.length ? emptyCard('goals', 'Цели', 'Большие цели со сроком и шагами: «накопить на отпуск к июлю», «выучить английский до B1». Шаги со сроком появятся в задачах и календаре, а за пропуски Parsimony будет язвить — по-доброму, но не очень.') : ''}
  <div class="card h2-omni g-add"><div class="om-box">${I(IC.goal, 19)}<input id="g_new" type="text" value="${esc(gDraft)}" placeholder="Новая цель: «выучить английский до 1 июня»" autocomplete="off" enterkeyhint="done" aria-label="Новая цель"><button class="om-go" data-act="gnew" aria-label="Создать цель" style="opacity:1">${I(IC.plus, 20)}</button></div>
    <p class="om-hint" style="margin:10px 0 0">Срок можно написать прямо в тексте: «до 31 декабря», «через неделю». Шаги добавите в карточке цели.</p></div>
  ${nudge}
  ${act.length ? `<div class="gl-grid">${act.map(goalCardHTML).join('')}</div>` : ''}
  ${done.length ? foldHTML('g-done', 'Достигнутые', plural(done.length, ['цель', 'цели', 'целей']), () => `<div class="gl-grid">${done.map(g => `<div class="gl-card done" data-act="gopen" data-id="${g.id}" role="button" tabindex="0"><div class="gl-top"><span class="gl-em">${esc(g.emoji)}</span><b>${esc(g.title)}</b></div><div class="gl-due">достигнута ${g.doneAt ? esc(fmtLong(g.doneAt)) : ''} 🏆</div></div>`).join('')}</div>`, false, { ic: IC.trophy }) : ''}
  ${foldHTML('g-phr', 'Подначки и похвалы', `${P.taunts ? 'подначки вкл.' : 'подначки выкл.'} · ${P.praise ? 'похвалы вкл.' : 'похвалы выкл.'}${P.custom.length ? ' · своих ' + P.custom.length : ''}`, phrBody, false, { ic: IC.spark })}`;
}

// ---- Окно цели: название, значок, срок, прогресс, шаги, «зачем мне это» ----
let gForm = null;
const endOfMonth = () => ymDays(ymOf(todayK())).slice(-1)[0];
const plusMonths = n => { const d = pd(todayK()); d.setMonth(d.getMonth() + n); return ds(d); };
const DUE_PRESETS = () => [['Конец месяца', endOfMonth()], ['Через 3 месяца', plusMonths(3)], ['Конец года', todayK().slice(0, 4) + '-12-31'], ['Через год', plusMonths(12)]];
function openGoal(id, preset) {
  const g = id ? goalById(id) : null; if (id && !g) return;
  const p = preset || {};
  gForm = { id, title: g ? g.title : p.title || '', emoji: g ? g.emoji : '🎯', due: g ? g.due : p.due || todayK().slice(0, 4) + '-12-31', why: g ? g.why || '' : '', dateFor: null, ask: false };
  if (sheetOpen()) closeSheet();
  drawGoal();
  if (!id) { const i = $('#g_t'); if (i) i.focus(); }
}
const gKeep = () => { if (!gForm) return; const t = $('#g_t'), d = $('#g_due'), w = $('#g_why'); if (t) gForm.title = t.value; if (d && d.value) gForm.due = d.value; if (w) gForm.why = w.value; };
function drawGoal(keep) {
  const f = gForm, g = f.id ? goalById(f.id) : null, s = g ? goalStat(g) : null, t = todayK();
  const stepRow = x => {
    const key = x.kind + ':' + x.id, ed = f.dateFor === key;
    return `<div class="gs-row${x.done ? ' done' : ''}"><button class="chk" data-act="gstep" data-k="${key}" aria-label="Выполнено">${x.done ? I(IC.check, 13) : ''}</button>
      <span class="gs-t">${esc(x.t)}</span>
      ${ed ? `<input class="fin gs-date" type="date" data-k="${key}" value="${x.date || ''}" aria-label="Срок шага">`
        : x.done && !x.date ? '' : `<button class="gs-d${x.date && x.date < t && !x.done ? ' late' : ''}${x.date ? '' : ' none'}" data-act="gstepdate" data-k="${key}" title="${x.date ? 'Изменить срок' : 'Задать срок — шаг появится в задачах и календаре'}">${x.date ? esc(dueShort(x.date)) : '+ срок'}</button>`}
      <button class="fz-x" data-act="gstepdel" data-k="${key}" aria-label="Удалить шаг">${I(IC.x, 14)}</button></div>`;
  };
  const late = s && s.late[0];
  sheet(`<div class="sh-head"><h3>${g ? (g.done ? 'Достигнутая цель' : 'Цель') : 'Новая цель'}</h3>${g ? `<button class="ic" data-act="gdel" title="Удалить" aria-label="Удалить цель" style="color:var(--dng)">${I(IC.trash, 17)}</button>` : ''}<button class="ic" data-act="close" aria-label="Закрыть">${I(IC.x, 18)}</button></div>
  <div class="g-head"><span class="g-em">${esc(f.emoji)}</span><input id="g_t" class="f-title" placeholder="Например: «Накопить на отпуск»" value="${esc(f.title)}" autocomplete="off" maxlength="80"></div>
  <div class="emj g-emj">${GOAL_EMOJI.map(e => `<button type="button" class="emb${e === f.emoji ? ' on' : ''}" data-act="gemoji" data-e="${e}" aria-label="${e}">${e}</button>`).join('')}</div>
  <div class="frow"><span class="fl">Срок</span><div><input id="g_due" class="fin" type="date" value="${f.due}" style="max-width:180px">
    <div class="chips" style="margin-top:8px">${DUE_PRESETS().map(([n, d]) => `<button type="button" class="chip${f.due === d ? ' on' : ''}" data-act="gdue" data-d="${d}">${n}</button>`).join('')}</div>
    <p class="set-note">${dayDiff(t, f.due) >= 0 ? 'Осталось ' + plural(dayDiff(t, f.due), NDAY) : 'Срок уже прошёл — продлите или отметьте цель достигнутой'}</p></div></div>
  ${g ? `<div class="g-prog"><div class="gl-bar pace-${s.pace || 'none'}"><i style="width:${Math.round(s.pct * 100)}%"></i></div><div class="gl-meta"><span>${s.n ? `Сделано ${s.d} из ${s.n}` : 'Шагов пока нет'}</span>${s.pace ? `<span class="pace ${s.pace}">${PACE[s.pace]}</span>` : ''}</div></div>
    ${(late || s.overdue) && !g.done && S.settings.phr.taunts ? `<div class="gl-taunt">${I(IC.alert, 15)}<span>${esc(goalTaunt(g, late ? late.t : ''))}</span></div>` : ''}
    <div class="pe-sec">Шаги</div>
    <div class="gs-list">${s.st.map(stepRow).join('') || '<p class="set-note" style="margin:2px 0 6px">Разбейте цель на шаги. Шаг со сроком появится в задачах и календаре.</p>'}</div>
    <input id="g_step" class="fin gs-add" type="text" placeholder="+ шаг, например «записаться на курс в пятницу»" autocomplete="off" enterkeyhint="done" aria-label="Новый шаг">
    <div id="g_step_hint" class="nlhint"></div>` : ''}
  <div class="frow"><span class="fl">Зачем</span><textarea id="g_why" class="fin" rows="2" placeholder="Зачем мне это? Перечитаю, когда захочется бросить" maxlength="500">${esc(f.why)}</textarea></div>
  <div class="sh-foot">${g ? (g.done ? `<button class="btn grow" data-act="gundone">Вернуть в работу</button>` : `<button class="btn pri grow" data-act="gdone">${I(IC.trophy, 16)} Цель достигнута</button>`) : `<button class="btn pri grow" data-act="gsave">Создать цель</button>`}</div>
  ${f.ask ? `<div class="ask"><b>Удалить цель «${esc(g.title)}»?</b>${S.events.some(e => e.goal === g.id) ? `<p class="set-note">У неё есть шаги-задачи в календаре.</p>` : ''}<div class="row">${S.events.some(e => e.goal === g.id) ? `<button class="btn dngf" data-act="gdelyes" data-all="1">Удалить вместе с задачами</button><button class="btn" data-act="gdelyes">Только цель</button>` : `<button class="btn dngf" data-act="gdelyes">Удалить</button>`}<button class="btn" data-act="gdelno">Отмена</button></div></div>` : ''}`, keep);
}
// Изменения уже созданной цели сохраняются сразу
function gApply() {
  const g = gForm && gForm.id && goalById(gForm.id); if (!g) return;
  gKeep(); const title = gForm.title.trim();
  if (title) g.title = title; g.emoji = gForm.emoji; if (isDayKey(gForm.due)) g.due = gForm.due; g.why = gForm.why.trim();
  save(); render();
}
function saveGoal() {
  gKeep(); const title = gForm.title.trim(); if (!title) { const i = $('#g_t'); if (i) i.focus(); return toast('Напишите, какая цель'); }
  snap();
  const g = { id: 'g' + uid(), title, emoji: gForm.emoji, due: isDayKey(gForm.due) ? gForm.due : todayK().slice(0, 4) + '-12-31', created: todayK(), why: gForm.why.trim(), done: false, steps: [] };
  S.goals.push(g); save(); render();
  gForm.id = g.id; drawGoal(true);
  const i = $('#g_step'); if (i) i.focus();
  toast('Цель создана — теперь разбейте её на шаги', true);
}
const findStep = (g, key) => { const [k, id] = key.split(':'); return k === 't' ? { k, e: S.events.find(e => e.id === id && e.goal === g.id) } : { k, s: g.steps.find(s => s.id === id) }; };
function addGoalStep(g, raw) {
  raw = raw.trim(); if (!raw) return;
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const p = parseNL(raw, todayK()), title = cap(p.found && p.title ? p.title : raw);
  raw = cap(raw);
  snap();
  if (p.date) S.events.push({ id: uid(), done: false, doneDates: [], skip: [], title, date: p.date, time: p.time || '', time2: p.time2 || '', cat: validCat(p.cat), note: '', loc: '', repeat: { type: 'none' }, reminder: { enabled: false, offset: 15, repeat: 'none', days: [] }, task: true, prio: 'mid', goal: g.id });
  else g.steps.push({ id: 's' + uid(), t: raw, done: false });
  save(); render(); drawGoal(true);
  const i = $('#g_step'); if (i) i.focus();
}
function setStepDate(g, key, d) {
  const x = findStep(g, key); if (!isDayKey(d || '')) return;
  snap();
  if (x.e) x.e.date = d;
  else if (x.s) { g.steps = g.steps.filter(s => s !== x.s); S.events.push({ id: uid(), done: x.s.done, doneDates: [], skip: [], title: x.s.t, date: d, time: '', time2: '', cat: validCat(null), note: '', loc: '', repeat: { type: 'none' }, reminder: { enabled: false, offset: 15, repeat: 'none', days: [] }, task: true, prio: 'mid', goal: g.id }); }
  gForm.dateFor = null; save(); render(); drawGoal(true);
  toast(`Шаг на ${relDay(d)} — он есть в задачах и календаре`, true);
}
const curGoal = () => gForm && gForm.id && goalById(gForm.id);
ACT.gopen = el => openGoal(el.dataset.id);
ACT.gemoji = el => { gKeep(); gForm.emoji = el.dataset.e; if (curGoal()) gApply(); drawGoal(true); };
ACT.gdue = el => { gKeep(); gForm.due = el.dataset.d; if (curGoal()) gApply(); drawGoal(true); };
ACT.gsave = saveGoal;
ACT.gstepdate = el => { gKeep(); gForm.dateFor = el.dataset.k; drawGoal(true); const i = $('.gs-date'); if (i) { i.focus(); try { i.showPicker(); } catch (x) {} } };
ACT.gstep = el => {
  const g = curGoal(); if (!g) return; const x = findStep(g, el.dataset.k);
  if (x.e) { toggleDone(x.e.id, isRec(x.e) ? nextOcc(x.e) : x.e.date); drawGoal(true); return; }
  if (!x.s) return; x.s.done = !x.s.done; save(); render(); drawGoal(true); if (x.s.done) goalStepDone(g.id);
};
ACT.gfree = el => { const g = goalById(el.dataset.g), s = g && g.steps.find(x => x.id === el.dataset.s); if (!s) return; s.done = !s.done; save(); render(); if (s.done) goalStepDone(g.id); };
ACT.gstepdel = el => {
  const g = curGoal(); if (!g) return; const x = findStep(g, el.dataset.k);
  snap(); if (x.e) S.events = S.events.filter(e => e !== x.e); else if (x.s) g.steps = g.steps.filter(s => s !== x.s);
  save(); render(); drawGoal(true); toast('Шаг удалён', true);
};
ACT.gstepto = el => { const e = S.events.find(x => x.id === el.dataset.id); if (!e) return; snap(); e.date = el.dataset.d; save(); render(); toast(`«${e.title}» перенесено на ${relDay(e.date)}`, true); };
ACT.glate = el => { const g = goalById(el.dataset.id); if (!g) return; const l = goalStat(g).late, d = addDays(todayK(), 1); snap(); l.forEach(x => { x.e.date = d; }); save(); render(); toast(`Перенесено на завтра: ${plural(l.length, ['шаг', 'шага', 'шагов'])}`, true); };
ACT.gext = el => { const g = goalById(el.dataset.id); if (!g) return; snap(); g.due = addDays(todayK(), Number(el.dataset.n)); save(); render(); toast(`Новый срок: ${shortDate(g.due)}. Последний шанс? Шучу. Почти.`, true); };
ACT.gdone = () => { const g = curGoal(); if (!g) return; gApply(); snap(); g.done = true; g.doneAt = todayK(); save(); closeSheet(); render(); toast(`Цель «${g.title}» достигнута! Это было непросто — и вы справились 🏆`, true); };
ACT.gundone = () => { const g = curGoal(); if (!g) return; snap(); g.done = false; delete g.doneAt; save(); render(); drawGoal(true); };
ACT.gdel = () => { gKeep(); gForm.ask = true; drawGoal(true); };
ACT.gdelno = () => { gForm.ask = false; drawGoal(true); };
ACT.gdelyes = el => { const g = curGoal(); if (!g) return; snap(); S.goals = S.goals.filter(x => x !== g); if (el.dataset.all) S.events = S.events.filter(e => e.goal !== g.id); else S.events.forEach(e => { if (e.goal === g.id) delete e.goal; }); save(); closeSheet(); render(); toast('Цель удалена', true); };
ACT.gnew = () => { const i = $('#g_new'), raw = (i ? i.value : gDraft).trim(); if (!raw) { if (i) i.focus(); return toast('Напишите, какая цель'); }
  const p = parseNL(raw.replace(/(^|\s)до(?=\s+\d|\s+(конца|понедельника|вторника|среды|четверга|пятницы|субботы|воскресенья))/i, '$1'), todayK());
  const title = p.found && p.title ? p.title : raw; gDraft = '';
  openGoal(null, { title: title.charAt(0).toUpperCase() + title.slice(1), due: p.date || '' }); };
ACT.phradd = () => { const t = $('#ph_t'), k = $('#ph_k'); const v = t ? t.value.trim() : ''; if (!v) { if (t) t.focus(); return; } S.settings.phr.custom.push({ id: 'p' + uid(), kind: k ? k.value : 'taunt', t: v }); save(); render(); toast('Фраза добавлена'); };
ACT.phrdel = el => { S.settings.phr.custom = S.settings.phr.custom.filter(p => p.id !== el.dataset.id); save(); render(); };
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || e.isComposing) return;
  if (e.target.id === 'g_new') { e.preventDefault(); ACT.gnew(); }
  else if (e.target.id === 'g_t' && !curGoal()) { e.preventDefault(); saveGoal(); }
  else if (e.target.id === 'g_t') { e.preventDefault(); e.target.blur(); }
  else if (e.target.id === 'g_step') { e.preventDefault(); const g = curGoal(); if (g) addGoalStep(g, e.target.value); }
  else if (e.target.id === 'ph_t') { e.preventDefault(); ACT.phradd(); }
});
document.addEventListener('input', e => {
  if (e.target.id === 'g_new') gDraft = e.target.value;
  else if (e.target.id === 'g_step') nlHint(e.target.value.trim() ? parseNL(e.target.value, todayK()) : null, '#g_step_hint');
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'g_due' && gForm) { gForm.due = t.value; if (curGoal()) gApply(); drawGoal(true); }
  else if ((t.id === 'g_t' || t.id === 'g_why') && curGoal()) gApply();
  else if (t.classList.contains('gs-date')) { const g = curGoal(); if (g) setStepDate(g, t.dataset.k, t.value); }
  else if (t.id === 's_taunts') { S.settings.phr.taunts = t.checked; save(); render(); }
  else if (t.id === 's_praise') { S.settings.phr.praise = t.checked; save(); render(); }
});

SEC.goals = {
  name: 'Цели', icon: IC.goal, newLabel: 'Цель', noNav: true,
  title: () => { const n = activeGoals().length; return innerWidth >= 900 ? `Цели<span class="sub">${n ? plural(n, ['активная', 'активные', 'активных']) : 'пока нет'}</span>` : 'Цели'; },
  html: goalsHTML, move: () => {},
  create: () => openGoal(),
  side: () => { const l = goalNextSteps(6); return `<div class="sb-sec"><div class="sb-h">Ближайшие шаги</div>${l.length ? l.map(stepRowSide).join('') : '<p class="sbl-empty">Добавьте шаги к целям</p>'}</div>`; },
  info: () => { const a = activeGoals(), late = a.reduce((n, g) => n + goalStat(g).late.length, 0); return a.length ? `Целей: <b>${a.length}</b>${late ? ` · просрочено шагов: <b>${late}</b>` : ''}` : 'Целей пока нет'; },
  demo: on => {
    if (!on) { S.goals = S.goals.filter(g => !g.demo); S.events = S.events.filter(e => !(e.demo && e.goal)); S.events.forEach(e => { if (e.goal && !goalById(e.goal)) delete e.goal; }); return; }
    const t = todayK(), c = addDays(t, -30), task = (gid, title, d, done) => S.events.push({ id: uid(), demo: true, task: true, prio: 'mid', title, date: addDays(t, d), time: '', time2: '', cat: validCat(null), note: '', loc: '', repeat: { type: 'none' }, reminder: { enabled: false, offset: 15, repeat: 'none', days: [] }, done: !!done, doneDates: [], skip: [], goal: gid });
    const G = (emoji, title, due, steps) => { const g = { id: 'g' + uid() + S.goals.length, demo: true, emoji, title, due, created: c, why: '', done: false, steps: steps.map(([s, d], i) => ({ id: 's' + uid() + i, t: s, done: !!d })) }; S.goals.push(g); return g.id; };
    const a = G('🏠', 'Накопить на первый взнос', t.slice(0, 4) + '-12-31', [['Открыть накопительный счёт', 1], ['Откладывать 20% зарплаты', 1]]);
    task(a, 'Сравнить ипотечные программы', -2); task(a, 'Выбрать район', 4);
    const b = G('📚', 'Выучить английский до B1', plusMonths(4), [['Заниматься 20 минут в день', 0]]);
    task(b, 'Пройти тест на уровень', -10, 1); task(b, 'Записаться в разговорный клуб', 7);
    const d = G('💪', 'Пробежать 10 км', plusMonths(2), [['Купить кроссовки', 1], ['Бегать 3 раза в неделю', 0]]);
    task(d, 'Пробежать 5 км без остановки', 14);
  },
};
