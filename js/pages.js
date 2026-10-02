// ---- Страницы: Главная, Профиль, Настройки ----
const AVA_EMOJI = ['🦊','🐼','🦁','🐯','🐨','🐸','🦉','🐺','🐻','🦄','🐙','🐝','🌻','🌙','⭐','🔥','🚀','🎯','💎','🍀','🌊','🎧','📚','☕'];
onMigrate(() => {
  const st = S.settings;
  if (!st.startSec) st.startSec = 'home';
  if (!st.avatar || typeof st.avatar !== 'object') st.avatar = { e:'', c:'#6366f1' };
  // «С нами с»: самая ранняя дата из данных (события — не старше года), иначе сегодня
  if (!st.since) {
    const t = todayK(), yearAgo = addDays(t, -365), ds = [t];
    S.events.forEach(e => { if (e.date >= yearAgo && e.date < t) ds.push(e.date); });
    (S.habits || []).forEach(h => ds.push(h.from));
    ((S.fin || {}).ops || []).forEach(o => ds.push(o.date));
    (S.notes || []).forEach(n => ds.push(n.date));
    st.since = ds.filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d || '')).sort()[0];
  }
});

// Аватар: эмодзи или буквы имени на цветном кружке
const initials = n => (n || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
function avatarHTML(size) {
  const a = S.settings.avatar || {}, n = initials(S.settings.name), c = /^#[0-9a-f]{3,8}$/i.test(a.c || '') ? a.c : '#6366f1';
  return `<span class="ava${a.e ? ' em' : ''}" style="--c:${c};--s:${size}px" aria-hidden="true">${a.e ? esc(a.e) : n ? esc(n) : I(IC.user, Math.round(size * .55))}</span>`;
}

// ---- Главная: всё на сегодня в одном месте ----
const greet = () => { const h = new Date().getHours(); return h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 17 ? 'Добрый день' : h < 23 ? 'Добрый вечер' : 'Доброй ночи'; };
const DAY_LINES = [
  'Маленькие шаги каждый день дают большие перемены через год.',
  'Что записано — то уже наполовину сделано.',
  'Сегодня — хороший день, чтобы начать то, что откладывали.',
  'Порядок в делах — порядок в голове.',
  'Не обязательно делать много. Важно делать каждый день.',
  'Деньги любят счёт, а цели — сроки.',
  'Одна отмеченная привычка сегодня — подарок себе завтрашнему.',
  'Самое трудное — начать. Дальше работает привычка.',
  'Спланируйте день, иначе его спланирует кто-то другой.',
  'Сон, вода, движение — фундамент любой продуктивности.',
  'Цель без плана — просто желание.',
  'Пропустить один день — нормально. Два подряд — уже новая привычка.',
  'Одно законченное дело приятнее десяти начатых.',
  'Сначала самое важное, потом всё остальное.',
  'Если сегодня сделали хоть что-то — вы ближе к цели, чем вчера.',
  'Отмечайте прогресс: мозгу нравится видеть результат.',
  'Каждая сэкономленная сотня — кирпичик в большую мечту.',
  'Дисциплина — это помнить, чего вы хотите на самом деле.',
  'Свободный вечер начинается с закрытого списка дел.',
  'Лучшее время посадить дерево было двадцать лет назад. Следующее — сейчас.',
];
const QUICK = [['event', IC.cal, 'Событие'], ['task', IC.tasks, 'Задача'], ['habit', IC.habit, 'Привычка'], ['op', IC.wallet, 'Расход'], ['note', IC.note, 'Заметка']];
let hmNoteDraft = '';

function homeHTML() {
  const t = todayK(), d = pd(t), name = (S.settings.name || '').trim(), nm = nowMin();
  const tasks = dayTasks(t), tDone = tasks.filter(e => e.done).length;
  const habs = hByKind('daily').filter(h => t >= hStart(h) && hDow(h, t)), hDone = habs.filter(h => h.log[t]).length;
  const total = tasks.length + habs.length, done = tDone + hDone, pct = total ? done / total : 0;
  const hero = `<div class="card hm-hero">
    <div class="hm-hi">
      <div class="hm-date">${DOWF[dowIdx(t)]}, ${d.getDate()} ${MONG[d.getMonth()]}</div>
      <h2 class="hm-greet">${greet()}${name ? `, <span>${esc(name)}</span>` : ''}</h2>
      <p class="hm-line">${esc(DAY_LINES[dnum(t) % DAY_LINES.length])}</p>
      <div class="hm-quick">${QUICK.map(([k, ic, n]) => `<button class="btn" data-act="hmnew" data-k="${k}">${I(ic, 16)} ${n}</button>`).join('')}</div>
      ${name ? '' : `<button class="hm-ask" data-act="sec" data-s="profile">${I(IC.user, 14)} Как вас зовут? Заполните профиль</button>`}
    </div>
    <div class="hm-ring">${ringSVG(pct, 120, 'var(--good)', total ? Math.round(pct * 100) + '%' : '—', 'день')}<small>${total ? `${done} из ${total} — задачи и привычки` : 'Дел на сегодня нет'}</small></div>
  </div>`;

  const tomorrowN = dayTasks(addDays(t, 1)).length;
  const taskCard = `<div class="card hm-card"><div class="card-h"><b>${I(IC.tasks, 17)} Задачи на сегодня</b><small>${tasks.length ? tDone + ' из ' + tasks.length : ''}</small></div>
    <div class="hm-list">${tasks.map(e => `<div class="tw-row${e.done ? ' done' : ''}" style="--c:${cat(e.cat).color}"><button class="chk" data-act="toggle" data-id="${e.id}" data-d="${t}" aria-label="Выполнено">${e.done ? I(IC.check, 13) : ''}</button><button class="tw-t" data-act="edit" data-id="${e.id}" data-d="${t}">${esc(e.title)}${e.time ? ` <small>${esc(e.time)}</small>` : ''}</button>${prioOf(e) === 'urgent' || prioOf(e) === 'high' ? `<i class="tw-p" style="--c:${PRIO[prioOf(e)].c}" title="${PRIO[prioOf(e)].n}"></i>` : ''}</div>`).join('') || '<p class="hm-empty">На сегодня задач нет — напишите первую ниже.</p>'}</div>
    <input class="tw-add" data-d="${t}" type="text" placeholder="+ задача, например «позвонить в 18»" autocomplete="off" aria-label="Новая задача на сегодня">
    <div class="hm-foot"><span>${tomorrowN ? 'Завтра: ' + plural(tomorrowN, ['задача', 'задачи', 'задач']) : 'На завтра пока пусто'}</span><button data-act="sec" data-s="tasks">Все задачи →</button></div></div>`;

  const sk = habitStreaks();
  const habCard = `<div class="card hm-card"><div class="card-h"><b>${I(IC.habit, 17)} Привычки сегодня</b><small>${habs.length ? hDone + ' из ' + habs.length : ''}</small></div>
    ${habs.length ? `<div class="hm-habs">${habs.map(h => { const on = !!h.log[t]; return `<button class="hm-hab${on ? ' on' : ''}" data-act="hmark" data-id="${h.id}" data-k="${t}" aria-pressed="${on}"><span class="em">${esc(h.emoji || '•')}</span><span class="nm">${esc(h.name)}</span><i>${on ? I(IC.check, 14) : ''}</i></button>`; }).join('')}</div>`
      : `<div class="hm-list"><p class="hm-empty">Привычек пока нет. Начните с одной — например, «2 литра воды».</p><button class="btn" data-act="hmnew" data-k="habit" style="align-self:flex-start">${I(IC.plus, 15)} Добавить привычку</button></div>`}
    <div class="hm-foot"><span>${sk.cur > 1 ? `🔥 ${plural(sk.cur, NDAY)} подряд` : sk.best > 1 ? `Лучшая серия: ${plural(sk.best, NDAY)}` : ''}</span><button data-act="sec" data-s="habits">Трекер →</button></div></div>`;

  const evs = evOn(t).filter(e => !e.task), nx = nextUp(t);
  const calCard = `<div class="card hm-card"><div class="card-h"><b>${I(IC.cal, 17)} Сегодня в календаре</b><small>${evs.length ? plural(evs.length, NEV) : ''}</small></div>
    <div class="hm-evs">${evs.map(e => { const end = timeMin(e.time2) != null && timeMin(e.time2) > timeMin(e.time) ? timeMin(e.time2) : timeMin(e.time) + 60, past = e.time && end <= nm, next = nx && nx.e.id === e.id;
      return `<button class="hm-ev${past ? ' past' : ''}${next ? ' next' : ''}" data-act="edit" data-id="${e.id}" data-d="${t}" style="--c:${cat(e.cat).color}"><span class="t">${e.time ? timeRange(e) : 'весь день'}</span><i></i><span class="n">${esc(e.title)}${next ? `<small>${esc(nx.label)}</small>` : ''}</span></button>`; }).join('') || '<p class="hm-empty">Событий нет — свободный день.</p>'}</div>
    <div class="hm-foot"><button data-act="hmnew" data-k="event">+ Событие</button><button data-act="sec" data-s="cal">Календарь →</button></div></div>`;

  const ym = ymOf(t), st = finStat(ym), lim = dailyLimit(st, ym);
  const ops = st.ops.filter(o => o.date === t).sort((a, b) => b.id.localeCompare(a.id));
  const spent = ops.filter(o => FG_OUT.includes(fcat(o.cat).g)).reduce((a, o) => a + o.amt, 0);
  const finCard = `<div class="card hm-card"><div class="card-h"><b>${I(IC.wallet, 17)} Деньги сегодня</b></div>
    <div class="hm-money${lim && lim.left < 0 ? ' neg' : ''}"><small>${lim ? 'Можно потратить сегодня' : 'Потрачено сегодня'}</small><b>${lim ? rub0(Math.max(0, lim.left)) : rub0(spent)}</b><span>${lim ? (lim.left >= 0 ? `лимит ${rub0(lim.limit)} · потрачено ${rub0(lim.today)}` : `лимит превышен на ${rub0(-lim.left)}`) : 'Задайте бюджет «Трат» в Финансах — появится дневной лимит'}</span></div>
    <div class="fq"><input id="hm_fq" class="fin" type="text" placeholder="«кафе 450», «+ зарплата 60 000»" autocomplete="off" aria-label="Записать трату"><button class="btn pri" data-act="hmfq">Записать</button></div><div id="hm_fq_hint" class="nlhint"></div>
    ${ops.length ? `<div class="hm-ops">${ops.slice(0, 4).map(o => { const c = fcat(o.cat), plus = c.g === 'inc'; return `<button class="hm-op" data-act="opedit" data-id="${o.id}"><span class="em">${esc(c.emoji || '•')}</span><span class="n">${esc(o.note || c.name)}</span><b class="${plus ? 'plus' : ''}">${plus ? '+' : '−'}${rub0(o.amt)}</b></button>`; }).join('')}</div>` : '<div class="hm-list"></div>'}
    <div class="hm-foot"><span>Расходы за месяц: ${rub0(st.spent)}</span><button data-act="sec" data-s="fin">Финансы →</button></div></div>`;

  const M = S.bio.metrics, filled = M.filter(m => bioVal(t, m.id) != null).length;
  const bioCard = `<div class="card hm-card"><div class="card-h"><b>${I(IC.spark, 17)} Самочувствие</b><small>${filled ? filled + ' из ' + M.length : 'как вы сегодня?'}</small></div>
    <div class="hm-bio">${M.map(m => { const v = bioVal(t, m.id), opts = m.type === 'hours' ? [5, 6, 7, 8, 9, 10] : [1, 2, 3, 4, 5];
      return `<div class="hm-bm"><span class="nm">${esc(m.emoji || '')} ${esc(m.name)}${v != null && !opts.includes(v) ? ` <small>${fmtNum(v)}</small>` : ''}</span><div class="hm-sc">${opts.map(o => `<button class="${v === o ? 'on' : ''}" data-act="hmbio" data-m="${m.id}" data-v="${o}" aria-label="${esc(m.name)}: ${o}" aria-pressed="${v === o}">${o}</button>`).join('')}</div></div>`; }).join('')}</div>
    <div class="hm-foot"><span>${M.some(m => m.type === 'hours') ? 'Сон — в часах, остальное — от 1 до 5' : 'от 1 до 5'}</span><button data-act="sec" data-s="habits">Подробнее →</button></div></div>`;

  const fm = S.focus[ym] || { title:'', items:[] }, yr = t.slice(0, 4), yg = S.ygoal[yr] || { title:'', items:[] };
  const gl = (label, g, ph) => { const n = g.items.length, dn = g.items.filter(i => i.done).length;
    return `<button class="hm-goal" data-act="hmgoal"><small>${label}</small><b>${g.title ? esc(g.title) : `<span class="ph">${ph}</span>`}</b>${n ? `<div class="ds-bar"><i style="width:${Math.round(dn / n * 100)}%"></i></div><span>${dn} из ${n} шагов</span>` : ''}</button>`; };
  const goalsCard = `<div class="card hm-card"><div class="card-h"><b>${I(IC.trophy, 17)} Цели</b></div>
    <div class="hm-list">${gl('Фокус месяца · ' + MON[d.getMonth()].toLowerCase(), fm, '+ Поставить цель на месяц')}${gl('Цель на ' + yr, yg, '+ Поставить главную цель года')}</div>
    <div class="hm-foot"><span>${yr === todayK().slice(0, 4) ? 'До конца года ' + plural(dayDiff(t, yr + '-12-31'), NDAY) : ''}</span><button data-act="hmgoal">Цели →</button></div></div>`;

  const last = notesOf('')[0];
  const noteCard = `<div class="card hm-card"><div class="card-h"><b>${I(IC.note, 17)} Мысли дня</b><button class="pill sm" data-act="ntall">Все заметки${S.notes.length ? ' · ' + S.notes.length : ''}</button></div>
    <textarea id="hm_note" class="fin hn-text" placeholder="Что сегодня получилось? Что мешало? О чём подумать завтра?" aria-label="Заметка">${esc(hmNoteDraft)}</textarea>
    <div class="nt-bar"><small>${last ? 'Последняя заметка: ' + esc(fmtLong(last.date)) : 'Заметка сохранится в архив с сегодняшней датой'}</small><button class="btn pri" data-act="hmnote">Сохранить</button></div></div>`;

  return `${hero}${missedBar(true)}<div class="hm-grid">${taskCard}${habCard}${calCard}${finCard}${bioCard}${goalsCard}</div>${noteCard}`;
}

// Окно «Что добавить?» — кнопка «Создать» и клавиша N на Главной
function openAddMenu() {
  sheet(`<div class="sh-head"><h3>Что добавить?</h3><button class="ic" data-act="close" aria-label="Закрыть">${I(IC.x, 18)}</button></div>
  <div class="addm">${QUICK.map(([k, ic, n]) => `<button data-act="hmnew" data-k="${k}">${I(ic, 22)}<b>${n}</b><small>${{ event:'встреча, дело со временем', task:'дело на день', habit:'то, что делаете регулярно', op:'трата или доход', note:'мысль, вывод, идея' }[k]}</small></button>`).join('')}</div>`);
}
function openQuickNote() {
  sheet(`<div class="sh-head"><h3>Заметка</h3><button class="ic" data-act="close" aria-label="Закрыть">${I(IC.x, 18)}</button></div>
  <textarea id="qn_text" class="fin hn-text" style="min-height:160px" placeholder="Мысли, выводы, идеи…" aria-label="Текст заметки"></textarea>
  <div class="sh-foot"><button class="btn pri grow" data-act="qnsave">Сохранить</button></div>`);
  setTimeout(() => { const i = $('#qn_text'); if (i) i.focus(); }, 60);
}
const addNoteToday = text => { snap(); S.notes.push({ id:'n' + uid(), date: todayK(), text }); save(); };
ACT.hmnew = el => {
  const k = el.dataset.k;
  if (sheetOpen()) closeSheet();
  if (k === 'event') openEvent(null, { date: todayK() });
  else if (k === 'task') newTask(todayK());
  else if (k === 'habit') openHabit();
  else if (k === 'op') openOp(null, { date: todayK() });
  else if (k === 'note') openQuickNote();
};
ACT.qnsave = () => { const v = $('#qn_text').value.trim(); if (!v) return $('#qn_text').focus(); addNoteToday(v); closeSheet(); render(); toast('Заметка сохранена', true); };
ACT.hmnote = () => { const ta = $('#hm_note'), v = (ta ? ta.value : hmNoteDraft).trim(); if (!v) { if (ta) ta.focus(); return toast('Напишите заметку'); } addNoteToday(v); hmNoteDraft = ''; render(); toast('Заметка сохранена', true); };
ACT.hmbio = el => { const t = todayK(), v = Number(el.dataset.v); setBio(el.dataset.m, t, bioVal(t, el.dataset.m) === v ? '' : v); };
ACT.hmgoal = () => { sel = todayK(); syncMini(); setSec('tasks'); setTimeout(() => { const g = $('.tk-goals'); if (g) g.scrollIntoView({ block:'center', behavior:'smooth' }); }, 60); };
function homeMoney() {
  const i = $('#hm_fq'); if (!i) return;
  const p = parseMoney(i.value); if (!p.ok) { i.focus(); return toast('Напишите сумму, например «кафе 450»'); }
  addOp({ amt:p.amt, cat:p.cat, note:p.note, date: todayK() });
  const n = $('#hm_fq'); if (n) n.focus();
}
ACT.hmfq = homeMoney;
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || e.isComposing) return;
  if (e.target.id === 'hm_fq') { e.preventDefault(); homeMoney(); }
  else if ((e.target.id === 'hm_note' || e.target.id === 'qn_text') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); (e.target.id === 'hm_note' ? ACT.hmnote : ACT.qnsave)(); }
});
document.addEventListener('input', e => {
  if (e.target.id === 'hm_note') hmNoteDraft = e.target.value;
  else if (e.target.id === 'hm_fq') {
    const el = $('#hm_fq_hint'), p = e.target.value.trim() ? parseMoney(e.target.value) : { ok:false };
    if (el) el.innerHTML = p.ok ? `${I(IC.spark, 13)} Запишу: <b>${esc(fcat(p.cat).name)}</b><b>${rub(p.amt)}</b>${p.note ? `<b>${esc(p.note)}</b>` : ''}` : '';
  }
});

SEC.home = {
  name:'Главная', icon:IC.home, newLabel:'Создать', noNav:true,
  title: () => innerWidth >= 900 ? `Главная<span class="sub">${esc(fmtLong(todayK()))}</span>` : `<span class="wordmark">${APP_NAME}</span>`,
  html: homeHTML, move: () => {}, create: openAddMenu,
};

// ---- Профиль: имя, аватар, статистика, достижения ----
// Серия: дни подряд, когда выполнены все запланированные ежедневные привычки (сегодня серию не обрывает)
function habitStreaks() {
  const hs = hByKind('daily'), t = todayK(); if (!hs.length) return { cur:0, best:0 };
  let k = hs.reduce((m, h) => { const s = hStart(h); return s < m ? s : m; }, t), run = 0, best = 0;
  if (k < addDays(t, -730)) k = addDays(t, -730);
  for (; k <= t; k = addDays(k, 1)) {
    const d = dayStat(k);
    if (d.plan && d.done === d.plan) { run++; best = Math.max(best, run); }
    else if (d.plan && k !== t) run = 0;
  }
  return { cur: run, best };
}
function profileStats() {
  const t = todayK(), yg = S.ygoal[t.slice(0, 4)];
  return {
    days: Math.max(1, dayDiff(S.settings.since || t, t) + 1),
    tasksDone: S.events.filter(e => e.task).reduce((a, e) => a + (isRec(e) ? (e.doneDates || []).length : e.done ? 1 : 0), 0),
    marks: S.habits.reduce((a, h) => a + Object.keys(h.log).length, 0),
    bioDays: Object.keys(S.bio.log).length,
    ops: S.fin.ops.length,
    saved: S.fin.ops.filter(o => fcat(o.cat).g === 'sav').reduce((a, o) => a + o.amt, 0),
    notes: S.notes.length,
    ygSet: !!(yg && (yg.title || yg.items.length)),
    ...habitStreaks(),
  };
}
// Достижения — заготовка для будущей геймификации: [значок, название, условие, значение, цель]
const ACH = [
  ['🌱', 'Первый шаг', 'Выполнить первую задачу', s => s.tasksDone, 1],
  ['✅', 'Деловой человек', 'Выполнить 50 задач', s => s.tasksDone, 50],
  ['🏆', 'Машина продуктивности', 'Выполнить 300 задач', s => s.tasksDone, 300],
  ['🔥', 'Неделя огня', '7 дней подряд — все привычки', s => s.best, 7],
  ['💎', 'Железная воля', '30 дней подряд — все привычки', s => s.best, 30],
  ['💯', 'Сотня', '100 отметок привычек', s => s.marks, 100],
  ['🧘', 'Самопознание', '30 дней отмечать самочувствие', s => s.bioDays, 30],
  ['💰', 'Деньги любят счёт', '50 записей в финансах', s => s.ops, 50],
  ['🐷', 'Копилка', 'Отложить 10 000 ₽', s => s.saved, 10000],
  ['📝', 'Летописец', 'Написать 10 заметок', s => s.notes, 10],
  ['🎯', 'Большая мечта', 'Поставить цель на год', s => s.ygSet ? 1 : 0, 1],
  ['🗓️', 'Месяц вместе', `30 дней с ${APP_NAME}`, s => s.days, 30],
];
function profileHTML() {
  const st = S.settings, s = profileStats(), sd = pd(st.since || todayK());
  const got = ACH.filter(a => a[3](s) >= a[4]).length;
  const tile = (label, val, sub) => `<div class="ft-t"><span>${label}</span><b>${val}</b><small>${sub}</small></div>`;
  return `<div class="card pf-head">
    <button class="pf-ava" data-act="pfava" aria-label="Выбрать аватар" title="Выбрать аватар">${avatarHTML(84)}<span class="pf-edit">${I(IC.edit, 14)}</span></button>
    <div class="pf-id">
      <input id="pf_name" class="pf-name" type="text" value="${esc(st.name || '')}" placeholder="Как вас зовут?" maxlength="40" autocomplete="name" aria-label="Имя">
      <input id="pf_motto" class="pf-motto" type="text" value="${esc(st.motto || '')}" placeholder="Девиз или главная мечта — будет мотивировать" maxlength="90" autocomplete="off" aria-label="Девиз">
      <small>С ${APP_NAME} с ${sd.getDate()} ${MONG[sd.getMonth()]} ${sd.getFullYear()} · ${plural(s.days, NDAY)}</small>
    </div>
  </div>
  <div class="pf-stats">
    ${tile('Задач выполнено', NF0.format(s.tasksDone), 'за всё время')}
    ${tile('Серия привычек', plural(s.cur, NDAY), 'лучшая — ' + plural(s.best, NDAY))}
    ${tile('Отметок привычек', NF0.format(s.marks), 'за всё время')}
    ${tile('Отложено', rub0(s.saved), 'раздел «Накопления»')}
    ${tile('Записей о деньгах', NF0.format(s.ops), 'доходы и траты')}
    ${tile('Заметок', NF0.format(s.notes), 'в архиве')}
  </div>
  <div class="card"><div class="card-h"><b>${I(IC.trophy, 17)} Достижения</b><small>${got} из ${ACH.length}</small></div>
    <div class="ach">${ACH.map(([e, n, dsc, f, goal]) => { const v = f(s), ok = v >= goal;
      return `<div class="ach-i${ok ? '' : ' lock'}"><span class="ach-e" aria-hidden="true">${e}</span><span class="ach-t"><b>${esc(n)}</b><small>${esc(dsc)}</small>${ok ? '<em>Получено</em>' : `<span class="ach-p"><span class="ds-bar"><i style="width:${Math.min(100, Math.round(v / goal * 100))}%"></i></span><small>${goal >= 1000 ? rub0(v) + ' / ' + rub0(goal) : NF0.format(Math.min(v, goal)) + ' / ' + NF0.format(goal)}</small></span>`}</span></div>`; }).join('')}</div></div>
  <div class="card"><div class="card-h"><b>${I(IC.user, 17)} Аккаунт</b></div>
    <div class="acc-row"><span class="acc-t"><b>Данные на этом устройстве</b><small>Всё хранится в браузере. Делайте копию, чтобы ничего не потерять.</small></span><button class="btn" data-act="export">${I(IC.down, 15)} Скачать копию</button></div>
    <div class="acc-row"><span class="acc-t"><b>Вход и синхронизация</b><small>Один аккаунт для iPhone и компьютера — события и задачи будут везде одинаковые.</small></span><span class="soon">Скоро</span></div>
    <div class="acc-row"><span class="acc-t"><b>Друзья</b><small>Добавлять друзей, смотреть их календарь и соревноваться в привычках.</small></span><span class="soon">Скоро</span></div>
  </div>`;
}
function openAvatar() {
  const a = S.settings.avatar || {};
  sheet(`<div class="sh-head"><h3>Аватар</h3><button class="ic" data-act="close" aria-label="Закрыть">${I(IC.x, 18)}</button></div>
  <div class="ava-pv">${avatarHTML(96)}</div>
  <div class="set-sec">Значок</div>
  <div class="emj"><button type="button" class="emb ava-ini${a.e ? '' : ' on'}" data-act="pfemoji" data-e="" title="Буквы имени">${esc(initials(S.settings.name) || 'Аа')}</button>${AVA_EMOJI.map(e => `<button type="button" class="emb${a.e === e ? ' on' : ''}" data-act="pfemoji" data-e="${e}" aria-label="${e}">${e}</button>`).join('')}</div>
  <div class="set-sec">Цвет</div>
  <div class="cpal" style="padding:0">${PALETTE.map(c => `<button class="cdot${(a.c || '').toLowerCase() === c ? ' on' : ''}" data-act="pfcolor" data-c="${c}" style="--c:${c}" aria-label="${c}"></button>`).join('')}</div>
  <button class="btn pri" style="width:100%;margin-top:20px" data-act="close">Готово</button>`, true);
}
ACT.pfava = openAvatar;
ACT.pfemoji = el => { S.settings.avatar = Object.assign({}, S.settings.avatar, { e: el.dataset.e }); save(); render(); openAvatar(); };
ACT.pfcolor = el => { S.settings.avatar = Object.assign({}, S.settings.avatar, { c: el.dataset.c }); save(); render(); openAvatar(); };
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'pf_name') { S.settings.name = t.value.trim().slice(0, 40); save(); $('#side').innerHTML = sideHTML(); const a = $('.pf-ava'); if (a) a.innerHTML = avatarHTML(84) + `<span class="pf-edit">${I(IC.edit, 14)}</span>`; }
  else if (t.id === 'pf_motto') { S.settings.motto = t.value.trim().slice(0, 90); save(); }
});
document.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.target.id === 'pf_name' || e.target.id === 'pf_motto')) { e.preventDefault(); e.target.blur(); } });

SEC.profile = { name:'Профиль', icon:IC.user, noNav:true, title: () => 'Профиль', html: profileHTML, move: () => {} };

// ---- Настройки: карточки по темам ----
function settingsHTML() {
  const b = settingsBlocks(), st = S.settings, name = (st.name || '').trim();
  const secs = `<div class="set-sec">Разделы</div>
    <div class="set-row"><span>При запуске открывать</span><div class="seg2"><button class="${st.startSec !== 'last' ? 'on' : ''}" data-act="ststart" data-v="home">Главную</button><button class="${st.startSec === 'last' ? 'on' : ''}" data-act="ststart" data-v="last">Последний раздел</button></div></div>
    <div class="set-row"><span>Отмечать привычки задним числом</span><input id="s_hpast" class="sw" type="checkbox"${st.habitPast ? ' checked' : ''}></div>
    <div class="set-row"><span>Показатели самочувствия</span><button class="btn" data-act="bioedit">${I(IC.gear, 15)} Настроить</button></div>`;
  const about = `<div class="set-sec">О приложении</div>
    <div class="st-about"><span class="wordmark">${APP_NAME}</span><small>Календарь, задачи, привычки и финансы — в одном месте.</small></div>
    <button class="btn" style="width:100%" data-act="help">${I(IC.key, 16)} Горячие клавиши</button>`;
  return `<button class="card st-prof" data-act="sec" data-s="profile">${avatarHTML(48)}<span><b>${esc(name || 'Ваш профиль')}</b><small>${name ? 'Имя, аватар, статистика и достижения' : 'Укажите имя и выберите аватар'}</small></span>${I(IC.right, 18)}</button>
  <div class="st-grid"><div class="card">${b.look}</div><div class="card">${b.cal}</div><div class="card">${b.cats}</div><div class="card">${secs}</div><div class="card">${b.notif}</div><div class="card">${b.data}</div><div class="card">${about}</div></div>`;
}
ACT.ststart = el => { S.settings.startSec = el.dataset.v === 'last' ? 'last' : 'home'; save(); render(); };
SEC.settings = { name:'Настройки', icon:IC.gear, noNav:true, title: () => 'Настройки', html: settingsHTML, move: () => {} };
