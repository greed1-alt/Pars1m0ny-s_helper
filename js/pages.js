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

const initials = n => (n || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
// Аватар: своё фото, эмодзи или буквы имени на цветном кружке
const okImg = s => /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(s || '');
function avatarHTML(size) {
  const a = S.settings.avatar || {}, n = initials(S.settings.name), c = /^#[0-9a-f]{3,8}$/i.test(a.c || '') ? a.c : '#6366f1';
  if (okImg(a.img)) return `<span class="ava img" style="--c:${c};--s:${size}px;background-image:url(${a.img})" aria-hidden="true"></span>`;
  return `<span class="ava${a.e ? ' em' : ''}" style="--c:${c};--s:${size}px" aria-hidden="true">${a.e ? esc(a.e) : n ? esc(n) : I(IC.user, Math.round(size * .55))}</span>`;
}
// Картинка с устройства → квадрат или полоса нужного размера (обрезка по центру), JPEG — чтобы влезло в память браузера
function loadImageFile(file, w, h) {
  return new Promise((ok, fail) => {
    if (!file || !/^image\//.test(file.type)) return fail(new Error('это не картинка'));
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const k = Math.max(w / img.naturalWidth, h / img.naturalHeight), sw = w / k, sh = h / k;
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, 0, 0, w, h);
      URL.revokeObjectURL(url);
      let q = .85, d = cv.toDataURL('image/jpeg', q);
      while (d.length > 450000 && q > .4) { q -= .15; d = cv.toDataURL('image/jpeg', q); }
      ok(d);
    };
    img.onerror = () => { URL.revokeObjectURL(url); fail(new Error('не получилось открыть картинку')); };
    img.src = url;
  });
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
// На Главной в карточке не больше нескольких пунктов, остальное — ссылкой в раздел
const HM_MAX = { tasks:5, habits:6, events:5, bio:6 };
const hmMore = (n, forms, s) => n > 0 ? `<button class="hm-more" data-act="sec" data-s="${s}">Ещё ${plural(n, forms)} →</button>` : '';

function homeHTML() {
  const t = todayK(), d = pd(t), name = (S.settings.name || '').trim(), nm = nowMin();
  const tasks = dayTasks(t), tDone = tasks.filter(e => e.done).length;
  const habs = hByKind('daily').filter(h => t >= hStart(h) && hDow(h, t)), hDone = habs.filter(h => h.log[t]).length;
  const total = tasks.length + habs.length, done = tDone + hDone, pct = total ? done / total : 0;
  const hero = `<div class="card hm-hero">
    <div class="hm-hi">
      <div class="hm-date">${DOWF[dowIdx(t)]}, ${d.getDate()} ${MONG[d.getMonth()]}</div>
      <h2 class="hm-greet">${greet()}${name ? ', ' + esc(name) : ''}</h2>
      <p class="hm-line">${esc(DAY_LINES[dnum(t) % DAY_LINES.length])}</p>
      <div class="hm-quick">${QUICK.map(([k, ic, n]) => `<button class="btn" data-act="hmnew" data-k="${k}">${I(ic, 16)} ${n}</button>`).join('')}<button class="btn hm-tm" data-act="sec" data-s="timer">${I(IC.timer, 16)} Таймер<span class="tm-mini"></span></button></div>
      ${name ? '' : `<button class="hm-ask" data-act="sec" data-s="profile">${I(IC.user, 14)} Как вас зовут? Заполните профиль</button>`}
    </div>
    <div class="hm-ring">${ringSVG(pct, 120, 'var(--good)', total ? Math.round(pct * 100) + '%' : '—', 'день')}<small>${total ? `${done} из ${total} — задачи и привычки` : 'Дел на сегодня нет'}</small></div>
  </div>`;

  const tomorrowN = dayTasks(addDays(t, 1)).length;
  const tShow = [...tasks.filter(e => !e.done), ...tasks.filter(e => e.done)].slice(0, HM_MAX.tasks);   // сначала невыполненные
  const taskCard = `<div class="card hm-card"><div class="card-h"><b>${I(IC.tasks, 17)} Задачи на сегодня</b><small>${tasks.length ? tDone + ' из ' + tasks.length : ''}</small></div>
    <div class="hm-list">${tShow.map(e => `<div class="tw-row${e.done ? ' done' : ''}" style="--c:${cat(e.cat).color}"><button class="chk" data-act="toggle" data-id="${e.id}" data-d="${t}" aria-label="Выполнено">${e.done ? I(IC.check, 13) : ''}</button><button class="tw-t" data-act="edit" data-id="${e.id}" data-d="${t}">${esc(e.title)}${e.time ? ` <small>${esc(e.time)}</small>` : ''}</button>${prioOf(e) === 'urgent' || prioOf(e) === 'high' ? `<i class="tw-p" style="--c:${PRIO[prioOf(e)].c}" title="${PRIO[prioOf(e)].n}"></i>` : ''}</div>`).join('') || '<p class="hm-empty">На сегодня задач нет — напишите первую ниже.</p>'}${hmMore(tasks.length - tShow.length, ['задача', 'задачи', 'задач'], 'tasks')}</div>
    <input class="tw-add" data-d="${t}" type="text" placeholder="+ задача, например «позвонить в 18»" autocomplete="off" aria-label="Новая задача на сегодня">
    <div class="hm-foot"><span>${tomorrowN ? 'Завтра: ' + plural(tomorrowN, ['задача', 'задачи', 'задач']) : 'На завтра пока пусто'}</span><button data-act="sec" data-s="tasks">Все задачи →</button></div></div>`;

  const sk = habitStreaks(), hShow = [...habs.filter(h => !h.log[t]), ...habs.filter(h => h.log[t])].slice(0, HM_MAX.habits);
  const habCard = `<div class="card hm-card"><div class="card-h"><b>${I(IC.habit, 17)} Привычки сегодня</b><small>${habs.length ? hDone + ' из ' + habs.length : ''}</small></div>
    ${habs.length ? `<div class="hm-habs">${hShow.map(h => { const on = !!h.log[t]; return `<button class="hm-hab${on ? ' on' : ''}" data-act="hmark" data-id="${h.id}" data-k="${t}" aria-pressed="${on}"><span class="em">${esc(h.emoji || '•')}</span><span class="nm">${esc(h.name)}</span><i>${on ? I(IC.check, 14) : ''}</i></button>`; }).join('')}${hmMore(habs.length - hShow.length, ['привычка', 'привычки', 'привычек'], 'habits')}</div>`
      : `<div class="hm-list"><p class="hm-empty">Привычек пока нет. Начните с одной — например, «2 литра воды».</p><button class="btn" data-act="hmnew" data-k="habit" style="align-self:flex-start">${I(IC.plus, 15)} Добавить привычку</button></div>`}
    <div class="hm-foot"><span>${sk.cur > 1 ? `🔥 ${plural(sk.cur, NDAY)} подряд` : sk.best > 1 ? `Лучшая серия: ${plural(sk.best, NDAY)}` : ''}</span><button data-act="sec" data-s="habits">Трекер →</button></div></div>`;

  const evAll = evOn(t).filter(e => !e.task), nx = nextUp(t);
  const evEnd = e => timeMin(e.time2) != null && timeMin(e.time2) > timeMin(e.time) ? timeMin(e.time2) : timeMin(e.time) + 60;
  const evs = [...evAll.filter(e => !e.time || evEnd(e) > nm), ...evAll.filter(e => e.time && evEnd(e) <= nm)].slice(0, HM_MAX.events);   // сначала предстоящие
  const calCard = `<div class="card hm-card"><div class="card-h"><b>${I(IC.cal, 17)} Сегодня в календаре</b><small>${evAll.length ? plural(evAll.length, NEV) : ''}</small></div>
    <div class="hm-evs">${evs.map(e => { const past = e.time && evEnd(e) <= nm, next = nx && nx.e.id === e.id;
      return `<button class="hm-ev${past ? ' past' : ''}${next ? ' next' : ''}" data-act="edit" data-id="${e.id}" data-d="${t}" style="--c:${cat(e.cat).color}"><span class="t">${e.time ? timeRange(e) : 'весь день'}</span><i></i><span class="n">${esc(e.title)}${next ? `<small>${esc(nx.label)}</small>` : ''}</span></button>`; }).join('') || '<p class="hm-empty">Событий нет — свободный день.</p>'}${hmMore(evAll.length - evs.length, NEV, 'cal')}</div>
    <div class="hm-foot"><button data-act="hmnew" data-k="event">+ Событие</button><button data-act="sec" data-s="cal">Календарь →</button></div></div>`;

  const ym = ymOf(t), st = finStat(ym), lim = dailyLimit(st, ym);
  const ops = st.ops.filter(o => o.date === t).sort((a, b) => b.id.localeCompare(a.id));
  const spent = ops.filter(o => FG_OUT.includes(fcat(o.cat).g)).reduce((a, o) => a + o.amt, 0);
  const finCard = `<div class="card hm-card"><div class="card-h"><b>${I(IC.wallet, 17)} Деньги сегодня</b></div>
    <div class="hm-money${lim && lim.left < 0 ? ' neg' : ''}"><small>${lim ? 'Можно потратить сегодня' : 'Потрачено сегодня'}</small><b>${lim ? rub0(Math.max(0, lim.left)) : rub0(spent)}</b><span>${lim ? (lim.left >= 0 ? `лимит ${rub0(lim.limit)} · потрачено ${rub0(lim.today)}` : `лимит превышен на ${rub0(-lim.left)}`) : 'Задайте бюджет «Трат» в Финансах — появится дневной лимит'}</span></div>
    <div class="fq"><input id="hm_fq" class="fin" type="text" placeholder="«кафе 450», «+ зарплата 60 000»" autocomplete="off" aria-label="Записать трату"><button class="btn pri" data-act="hmfq">Записать</button></div><div id="hm_fq_hint" class="nlhint"></div>
    ${ops.length ? `<div class="hm-ops">${ops.slice(0, 4).map(o => { const c = fcat(o.cat), plus = c.g === 'inc'; return `<button class="hm-op" data-act="opedit" data-id="${o.id}"><span class="em">${esc(c.emoji || '•')}</span><span class="n">${esc(o.note || c.name)}</span><b class="${plus ? 'plus' : ''}">${plus ? '+' : '−'}${rub0(o.amt)}</b></button>`; }).join('')}</div>` : '<div class="hm-list"></div>'}
    <div class="hm-foot"><span>Расходы за месяц: ${rub0(st.spent)}</span><button data-act="sec" data-s="fin">Финансы →</button></div></div>`;

  const M = S.bio.metrics.slice(0, HM_MAX.bio), filled = M.filter(m => bioVal(t, m.id) != null).length;
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
// Достижения: получено ли и насколько близко к цели
const achState = s => ACH.map(([e, n, dsc, f, goal]) => { const v = f(s); return { e, n, dsc, v, goal, ok: v >= goal, p: Math.min(1, v / goal) }; });
const achSorted = l => [...l.filter(a => a.ok), ...l.filter(a => !a.ok).sort((a, b) => b.p - a.p)];   // сначала полученные, потом самые близкие
const achHTML = a => `<div class="ach-i${a.ok ? '' : ' lock'}"><span class="ach-e" aria-hidden="true">${a.e}</span><span class="ach-t"><b>${esc(a.n)}</b><small>${esc(a.dsc)}</small>${a.ok ? '<em>Получено</em>' : `<span class="ach-p"><span class="ds-bar"><i style="width:${Math.round(a.p * 100)}%"></i></span><small>${a.goal >= 1000 ? rub0(a.v) + ' / ' + rub0(a.goal) : NF0.format(Math.min(a.v, a.goal)) + ' / ' + NF0.format(a.goal)}</small></span>`}</span></div>`;
function openAchievements() {
  const l = achState(profileStats());
  sheet(`<div class="sh-head"><h3>Достижения · ${l.filter(a => a.ok).length} из ${ACH.length}</h3><button class="ic" data-act="close" aria-label="Закрыть">${I(IC.x, 18)}</button></div>
  <div class="ach ach-all">${achSorted(l).map(achHTML).join('')}</div>`);
}
ACT.achall = openAchievements;
// «Пригласить друга»: пока просто ссылка на приложение; друзья появятся вместе с аккаунтами
ACT.invite = () => {
  const url = location.origin + location.pathname, text = `Попробуй ${APP_NAME} — календарь, задачи, привычки и финансы в одном месте.`;
  if (navigator.share) navigator.share({ title:APP_NAME, text, url }).catch(() => {}); else copyText(text + ' ' + url, 'Ссылка скопирована — отправьте её другу');
};
// Обложки профиля: градиенты с мягкими бликами (или своё фото)
const COVERS = {
  dusk:'linear-gradient(120deg,#3a1c71 0%,#d76d77 55%,#ffaf7b 100%)', ocean:'linear-gradient(120deg,#0f2027 0%,#2c5364 50%,#4ca1af 100%)',
  aurora:'linear-gradient(120deg,#0b486b 0%,#3b8686 45%,#79bd9a 100%)', lavender:'linear-gradient(120deg,#a18cd1 0%,#fbc2eb 100%)',
  forest:'linear-gradient(120deg,#134e5e 0%,#71b280 100%)', sand:'linear-gradient(120deg,#c79081 0%,#dfa579 100%)',
  night:'linear-gradient(120deg,#141e30 0%,#243b55 100%)', peach:'linear-gradient(120deg,#ffecd2 0%,#fcb69f 100%)',
  sky:'linear-gradient(120deg,#89f7fe 0%,#66a6ff 100%)', rose:'linear-gradient(120deg,#ee9ca7 0%,#ffdde1 100%)',
  mint:'linear-gradient(120deg,#d4fc79 0%,#96e6a1 100%)', mono:'linear-gradient(120deg,#232526 0%,#414345 100%)',
};
const COVER_GLOW = 'radial-gradient(circle at 15% 125%,rgba(255,255,255,.32),transparent 45%),radial-gradient(circle at 88% -30%,rgba(255,255,255,.26),transparent 42%)';
const coverCSS = () => { const c = S.settings.cover || {}; return okImg(c.img) ? `background-image:url(${c.img})` : `background-image:${COVER_GLOW},${COVERS[c.p] || COVERS.dusk}`; };
// Ссылки на соцсети: только http(s), без «https://» пользователь может не писать
const safeUrl = u => { u = String(u || '').trim(); if (!u) return ''; if (!/^https?:\/\//i.test(u)) u = 'https://' + u; try { const x = new URL(u); return /^https?:$/.test(x.protocol) && x.hostname.includes('.') ? x.href : ''; } catch (e) { return ''; } };
const hostOf = u => { try { return new URL(safeUrl(u)).hostname.replace(/^www\./, ''); } catch (e) { return ''; } };
function bdayInfo(b) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b || '')) return null;
  const t = todayK(), y = Number(t.slice(0, 4)); let next = y + b.slice(4); if (next < t) next = (y + 1) + b.slice(4);
  return { d: pd(b), days: dayDiff(t, next), age: Number(next.slice(0, 4)) - Number(b.slice(0, 4)) };
}

function profileHTML() {
  const st = S.settings, s = profileStats(), ach = achState(s), got = ach.filter(a => a.ok).length, name = (st.name || '').trim(), sd = pd(st.since || todayK()), bd = bdayInfo(st.birthday);
  const place = [st.city, st.country].filter(Boolean).join(', '), soc = (st.socials || []).filter(x => x && safeUrl(x.url));
  const tile = (label, val, sub) => `<div class="ft-t"><span>${label}</span><b>${val}</b><small>${sub}</small></div>`;
  const det = [
    bd ? `<li>${I(IC.gift, 16)}<span>День рождения — ${bd.d.getDate()} ${MONG[bd.d.getMonth()]}${bd.days === 0 ? ' · сегодня! 🎉' : bd.days <= 30 ? ' · через ' + plural(bd.days, NDAY) : ''}</span></li>` : '',
    place ? `<li>${I(IC.globe, 16)}<span>${esc(place)}</span></li>` : '',
    `<li>${I(IC.cal, 16)}<span>С ${APP_NAME} с ${sd.getDate()} ${MONG[sd.getMonth()]} ${sd.getFullYear()} · ${plural(s.days, NDAY)}</span></li>`,
  ].join('');
  return `<div class="card pf-card">
    <div class="pf-cover" style="${coverCSS()}"><button class="pf-cover-edit" data-act="pe" data-tab="look">${I(IC.edit, 14)} Обложка</button></div>
    <div class="pf-bar">
      <button class="pf-ava" data-act="pe" data-tab="look" aria-label="Сменить аватар" title="Сменить аватар">${avatarHTML(104)}<span class="pf-edit">${I(IC.edit, 14)}</span></button>
      <div class="pf-who">
        <h2 class="pf-nm">${name ? esc(name) : '<span class="ph">Как вас зовут?</span>'}</h2>
        ${st.nick || st.motto ? `<div class="pf-tags">${st.nick ? `<span class="pf-nick">@${esc(st.nick)}</span>` : ''}${st.motto ? `<span class="pf-motto-t">${esc(st.motto)}</span>` : ''}</div>` : ''}
      </div>
      <div class="pf-acts"><button class="btn pri" data-act="pe" data-tab="main">${I(IC.edit, 15)} Редактировать профиль</button><button class="btn pf-more" data-act="pfmenu" aria-label="Ещё" title="Ещё">${I(IC.more, 18)}</button></div>
    </div>
  </div>
  <div class="pf-cols">
    <div class="card pf-about"><div class="card-h"><b>Обо мне</b><button class="pill sm" data-act="pe" data-tab="main">${I(IC.edit, 13)} Изменить</button></div>
      ${st.about ? `<p class="pf-about-t">${esc(st.about)}</p>` : '<p class="hm-empty">Расскажите о себе: чем занимаетесь, что для вас важно, к чему стремитесь.</p>'}
      <ul class="pf-det">${det}</ul>
      ${soc.length ? `<div class="pf-soc">${soc.map(x => `<a href="${esc(safeUrl(x.url))}" target="_blank" rel="noopener noreferrer">${I(IC.link, 14)} ${esc((x.title || '').trim() || hostOf(x.url))}</a>`).join('')}</div>` : ''}
    </div>
    <div class="pf-stats">
      ${tile('Задач выполнено', NF0.format(s.tasksDone), 'за всё время')}
      ${tile('Серия привычек', plural(s.cur, NDAY), 'лучшая — ' + plural(s.best, NDAY))}
      ${tile('Отметок привычек', NF0.format(s.marks), 'за всё время')}
      ${tile('Отложено', rub0(s.saved), 'раздел «Накопления»')}
      ${tile('Записей о деньгах', NF0.format(s.ops), 'доходы и траты')}
      ${tile('Заметок', NF0.format(s.notes), 'в архиве')}
    </div>
  </div>
  <div class="card"><div class="card-h"><b>${I(IC.trophy, 17)} Достижения</b><span class="card-h-r"><small>${got} из ${ACH.length}</small><button class="pill sm" data-act="achall">Все достижения →</button></span></div>
    <div class="ach ach4">${achSorted(ach).slice(0, 4).map(achHTML).join('')}</div></div>
  <div class="pf-two">
    <div class="card pf-friends"><div class="card-h"><b>${I(IC.users, 17)} Друзья</b><span class="soon">Скоро</span></div>
      <div class="fr-ghost" aria-hidden="true">${[0, 1, 2, 3, 4].map(i => `<span style="--i:${i}"></span>`).join('')}</div>
      <p class="hm-empty">Добавляйте друзей, смотрите их календари и соревнуйтесь в привычках. Появится вместе с аккаунтами.</p>
      <div class="hm-foot"><button class="btn" data-act="invite">${I(IC.share, 15)} Пригласить друга</button></div>
    </div>
    <div class="card pf-plans"><div class="card-h"><b>${I(IC.spark, 17)} Тарифы</b><span class="soon">Скоро</span></div>
      <div class="plans"><div class="plan cur"><small>Сейчас</small><b>Базовый</b><span>бесплатно</span></div><div class="plan pro"><small>Скоро</small><b>Премиум</b><span>стоимость — позже</span></div></div>
      <ul class="plan-perks"><li>${I(IC.spark, 14)} Переливающееся имя в профиле и на Главной</li><li>${I(IC.check, 14)} Синхронизация iPhone и компьютера</li><li>${I(IC.check, 14)} Друзья и общие календари</li></ul>
      <p class="set-note" style="margin-top:6px">Здесь будут тарифы, их возможности и цены.</p>
    </div>
  </div>`;
}
// Меню «⋯» рядом с «Редактировать профиль»
ACT.pfmenu = el => {
  const qc = $('#qc');
  qc.innerHTML = `<div class="pmenu"><button data-act="pfshare">${I(IC.share, 16)} Поделиться профилем</button><button data-act="pe" data-tab="main">${I(IC.edit, 16)} Редактировать</button><button data-act="pe" data-tab="look">${I(IC.spark, 16)} Аватар и обложка</button><button data-act="sec" data-s="settings">${I(IC.gear, 16)} Настройки</button></div>`;
  qc.classList.add('show', 'menu');
  const r = el.getBoundingClientRect(), w = qc.offsetWidth;
  qc.style.left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8)) + 'px'; qc.style.top = (r.bottom + 6) + 'px';
};
ACT.pfshare = () => {
  closeQuick();
  const st = S.settings, s = profileStats(), got = achState(s).filter(a => a.ok).length, url = location.origin + location.pathname;
  const text = `${(st.name || '').trim() || 'Я'} в ${APP_NAME}: выполнено задач — ${s.tasksDone}, серия привычек — ${plural(s.cur, NDAY)}, достижений — ${got} из ${ACH.length}.`;
  if (navigator.share) navigator.share({ title:APP_NAME, text, url }).catch(() => {}); else copyText(text + ' ' + url, 'Скопировано — можно вставить в мессенджер');
};
ACT.pe = el => { peTab = el.dataset.tab || 'main'; closeQuick(); if (sec === 'profedit') render(); else setSec('profedit'); };
function openAvatar() {
  const a = S.settings.avatar || {};
  sheet(`<div class="sh-head"><h3>Аватар</h3><button class="ic" data-act="close" aria-label="Закрыть">${I(IC.x, 18)}</button></div>
  <div class="ava-pv">${avatarHTML(96)}</div>
  <div class="set-sec">Значок</div>
  <div class="emj"><button type="button" class="emb ava-ini${a.e || okImg(a.img) ? '' : ' on'}" data-act="pfemoji" data-e="" title="Буквы имени">${esc(initials(S.settings.name) || 'Аа')}</button>${AVA_EMOJI.map(e => `<button type="button" class="emb${a.e === e && !okImg(a.img) ? ' on' : ''}" data-act="pfemoji" data-e="${e}" aria-label="${e}">${e}</button>`).join('')}</div>
  <div class="set-sec">Цвет</div>
  <div class="cpal" style="padding:0">${PALETTE.map(c => `<button class="cdot${(a.c || '').toLowerCase() === c ? ' on' : ''}" data-act="pfcolor" data-c="${c}" style="--c:${c}" aria-label="${c}"></button>`).join('')}</div>
  <button class="btn" style="width:100%;margin-top:18px" data-act="upava">${I(IC.up, 16)} Загрузить своё фото</button>
  <button class="btn pri" style="width:100%;margin-top:8px" data-act="close">Готово</button>`, true);
}
const profTouch = () => { S.settings.profUpd = Date.now(); save(); $('#side').innerHTML = sideHTML(); const h = $('.hdr-ava'); if (h) h.innerHTML = avatarHTML(28); const u = $('#pe_upd'); if (u) u.textContent = 'Обновлён: только что'; };
ACT.pfava = openAvatar;
ACT.pfemoji = el => { S.settings.avatar = Object.assign({}, S.settings.avatar, { e: el.dataset.e, img: '' }); profTouch(); render(); openAvatar(); };
ACT.pfcolor = el => { S.settings.avatar = Object.assign({}, S.settings.avatar, { c: el.dataset.c }); profTouch(); render(); if (sheetOpen()) openAvatar(); };

SEC.profile = { name:'Профиль', icon:IC.user, noNav:true, title: () => 'Профиль', html: profileHTML, move: () => {} };

// ---- Редактирование профиля: личные данные, оформление, аккаунт ----
let peTab = 'main', peUpload = null;
const PE_TABS = [['main', IC.user, 'Личные данные'], ['look', IC.spark, 'Аватар и обложка'], ['acc', IC.key, 'Аккаунт']];
const COUNTRIES = ['Россия', 'Беларусь', 'Казахстан', 'Украина', 'Узбекистан', 'Кыргызстан', 'Таджикистан', 'Армения', 'Азербайджан', 'Грузия', 'Молдова', 'Латвия', 'Литва', 'Эстония', 'Германия', 'Польша', 'Сербия', 'Турция', 'Израиль', 'ОАЭ', 'США'];
const ago = ts => {
  if (!ts) return 'ещё не менялся';
  const m = Math.round((Date.now() - ts) / 60000);
  return m < 1 ? 'только что' : m < 60 ? plural(m, ['минуту', 'минуты', 'минут']) + ' назад' : m < 1440 ? plural(Math.round(m / 60), ['час', 'часа', 'часов']) + ' назад'
    : m < 43200 ? plural(Math.round(m / 1440), NDAY) + ' назад' : plural(Math.round(m / 43200), ['месяц', 'месяца', 'месяцев']) + ' назад';
};
function profEditHTML() {
  const st = S.settings, a = st.avatar || {}, cv = st.cover || {}, v = k => esc(st[k] || '');
  let body;
  if (peTab === 'look') body = `<div class="card"><div class="pe-sec">Аватар</div>
      <div class="pe-ava">${avatarHTML(88)}<div class="pe-btns"><button class="btn" data-act="upava">${I(IC.up, 15)} Загрузить фото</button><button class="btn" data-act="pfava">Эмодзи или буквы</button>${okImg(a.img) ? `<button class="btn dng" data-act="rmava">Убрать фото</button>` : ''}</div></div>
      <div class="pe-sec">Цвет аватара</div>
      <div class="cpal" style="padding:0">${PALETTE.map(c => `<button class="cdot${(a.c || '').toLowerCase() === c ? ' on' : ''}" data-act="pfcolor" data-c="${c}" style="--c:${c}" aria-label="${c}"></button>`).join('')}</div></div>
    <div class="card"><div class="pe-sec">Обложка профиля</div>
      <div class="pe-cover" style="${coverCSS()}"></div>
      <div class="pe-covers">${Object.keys(COVERS).map(k => `<button class="pe-cv${!okImg(cv.img) && (cv.p || 'dusk') === k ? ' on' : ''}" data-act="pecover" data-p="${k}" style="background-image:${COVER_GLOW},${COVERS[k]}" aria-label="Обложка ${k}"></button>`).join('')}</div>
      <div class="pe-btns"><button class="btn" data-act="upcover">${I(IC.up, 15)} Загрузить своё фото</button>${okImg(cv.img) ? '<button class="btn dng" data-act="rmcover">Убрать фото</button>' : ''}</div>
      <p class="set-note">Лучше всего подходит широкая картинка. Фото хранится только на этом устройстве.</p></div>`;
  else if (peTab === 'acc') body = `<div class="card"><div class="pe-sec">Аккаунт</div>
      <div class="acc-row"><span class="acc-t"><b>Данные на этом устройстве</b><small>Всё хранится в браузере. Делайте копию, чтобы ничего не потерять.</small></span><div class="pe-btns"><button class="btn" data-act="export">${I(IC.down, 15)} Скачать копию</button><button class="btn" data-act="import">${I(IC.up, 15)} Загрузить</button></div></div>
      <div class="acc-row"><span class="acc-t"><b>Вход и синхронизация</b><small>Один аккаунт для iPhone и компьютера — события и задачи будут везде одинаковые.</small></span><span class="soon">Скоро</span></div>
      <div class="acc-row"><span class="acc-t"><b>Ссылка на профиль</b><small>Своя страница по нику${st.nick ? ` <b>@${esc(st.nick)}</b>` : ''} — чтобы делиться ей с друзьями.</small></span><span class="soon">Скоро</span></div>
      <div class="acc-row"><span class="acc-t"><b>Друзья</b><small>Добавлять друзей, смотреть их календарь и соревноваться в привычках.</small></span><span class="soon">Скоро</span></div></div>`;
  else body = `<div class="card"><div class="pe-sec">Личные данные</div>
      <div class="pe-grid">
        <label class="pe-f"><span>Имя или никнейм</span><input class="fin" data-pf="name" value="${v('name')}" maxlength="40" placeholder="Как вас называть" autocomplete="nickname"></label>
        <label class="pe-f"><span>Пол</span><select class="fin" data-pf="gender"><option value="">Не указан</option><option value="m"${st.gender === 'm' ? ' selected' : ''}>Мужской</option><option value="f"${st.gender === 'f' ? ' selected' : ''}>Женский</option></select></label>
        <label class="pe-f full"><span>Девиз</span><input class="fin" data-pf="motto" value="${v('motto')}" maxlength="90" placeholder="Каждый день — шаг к мечте" autocomplete="off"></label>
        <label class="pe-f full"><span>Обо мне</span><textarea class="fin hn-text" data-pf="about" maxlength="2048" placeholder="Напишите что-нибудь о себе…">${v('about')}</textarea><em class="pe-cnt" id="pe_cnt">${(st.about || '').length}/2048</em></label>
        <label class="pe-f"><span>День рождения</span><input class="fin" type="date" data-pf="birthday" value="${v('birthday')}" max="${todayK()}"></label>
        <label class="pe-f"><span>Страна</span><input class="fin" data-pf="country" value="${v('country')}" list="pe_countries" placeholder="Ваша страна" autocomplete="country-name"><datalist id="pe_countries">${COUNTRIES.map(c => `<option value="${c}">`).join('')}</datalist></label>
        <label class="pe-f"><span>Город</span><input class="fin" data-pf="city" value="${v('city')}" placeholder="Ваш город" autocomplete="address-level2"></label>
        <label class="pe-f"><span>Ник</span><input class="fin" data-pf="nick" value="${v('nick')}" maxlength="24" placeholder="Ваш ник" autocomplete="off"></label>
      </div></div>
    <div class="card"><div class="pe-sec">Я в социальных сетях<small>Покажите, где вас ещё найти — ссылки появятся в профиле</small></div>
      ${(st.socials || []).map((x, i) => `<div class="pe-soc"><input class="fin" data-soc="${i}" data-f="url" value="${esc(x.url || '')}" placeholder="https://" inputmode="url" autocomplete="off" aria-label="Ссылка"><input class="fin" data-soc="${i}" data-f="title" value="${esc(x.title || '')}" placeholder="Я в соцсети" autocomplete="off" aria-label="Заголовок"><button class="cdel" data-act="socdel" data-i="${i}" aria-label="Удалить ссылку">${I(IC.trash)}</button></div>`).join('')}
      <button class="btn" data-act="socadd">${I(IC.plus, 15)} Добавить</button>
      <p class="set-note">Изменения сохраняются сами.</p></div>`;
  return `<div class="pe-head"><button class="ic pe-back" data-act="sec" data-s="profile" aria-label="Назад к профилю" title="Назад к профилю">${I(IC.left, 20)}</button><div><h2>Редактирование профиля</h2><small id="pe_upd">Обновлён: ${ago(st.profUpd)}</small></div></div>
  <div class="pe-wrap"><nav class="pe-nav">${PE_TABS.map(([k, ic, n]) => `<button class="${peTab === k ? 'on' : ''}" data-act="petab" data-tab="${k}">${I(ic, 16)} ${n}</button>`).join('')}</nav><div class="pe-body">${body}</div></div>
  <input type="file" id="pe_file" accept="image/*" hidden>`;
}
ACT.petab = el => { peTab = el.dataset.tab; render(); };
ACT.socadd = () => { S.settings.socials = [...(S.settings.socials || []), { url:'', title:'' }].slice(0, 12); save(); render(); const l = $$('.pe-soc input[data-f="url"]').pop(); if (l) l.focus(); };
ACT.socdel = el => { const l = [...(S.settings.socials || [])]; l.splice(+el.dataset.i, 1); S.settings.socials = l; profTouch(); render(); };
ACT.pecover = el => { S.settings.cover = { p: el.dataset.p, img:'' }; profTouch(); render(); };
ACT.rmcover = () => { S.settings.cover = Object.assign({}, S.settings.cover, { img:'' }); profTouch(); render(); };
ACT.rmava = () => { S.settings.avatar = Object.assign({}, S.settings.avatar, { img:'' }); profTouch(); render(); };
const pickImage = kind => { peUpload = kind; let f = $('#pe_file'); if (!f) { f = document.createElement('input'); f.type = 'file'; f.accept = 'image/*'; f.id = 'pe_file'; f.hidden = true; document.body.appendChild(f); } f.value = ''; f.click(); };
ACT.upava = () => pickImage('ava');
ACT.upcover = () => pickImage('cover');
document.addEventListener('change', async e => {
  const t = e.target;
  if (t.id === 'pe_file') {
    const file = t.files && t.files[0], kind = peUpload; if (!file || !kind) return;
    try {
      const img = await loadImageFile(file, kind === 'ava' ? 256 : 1500, kind === 'ava' ? 256 : 420);
      const key = kind === 'ava' ? 'avatar' : 'cover', old = S.settings[key];
      S.settings[key] = Object.assign({}, old, { img });
      try { localStorage.setItem(LS, JSON.stringify(S)); } catch (x) { S.settings[key] = old; return toast('Не хватило места в памяти браузера — выберите картинку поменьше'); }
      profTouch(); if (sheetOpen()) closeSheet(); render(); toast(kind === 'ava' ? 'Фото профиля обновлено' : 'Обложка обновлена');
    } catch (x) { toast('Не получилось: ' + x.message); }
    return;
  }
  if (t.dataset.pf) {
    const f = t.dataset.pf; let val = t.value.trim();
    if (f === 'nick') { val = val.toLowerCase().replace(/^@/, '').replace(/[^a-z0-9_.]/g, '').slice(0, 24); t.value = val; }
    if (f === 'birthday' && val && (!isDayKey(val) || val > todayK())) { t.value = S.settings.birthday || ''; return toast('Проверьте дату рождения'); }
    if (val) S.settings[f] = val; else delete S.settings[f];
    profTouch();
  } else if (t.dataset.soc != null) {
    const l = S.settings.socials || [], x = l[+t.dataset.soc]; if (!x) return;
    x[t.dataset.f] = t.value.trim().slice(0, 300);
    if (t.dataset.f === 'url' && x.url && !safeUrl(x.url)) toast('Похоже, это не ссылка — проверьте адрес');
    profTouch();
  }
});
document.addEventListener('input', e => { if (e.target.dataset && e.target.dataset.pf === 'about') { const c = $('#pe_cnt'); if (c) c.textContent = e.target.value.length + '/2048'; } });
SEC.profedit = { name:'Редактирование профиля', icon:IC.user, noNav:true, title: () => 'Профиль', html: profEditHTML, move: () => {} };

// ---- Настройки: карточки по темам ----
function settingsHTML() {
  const b = settingsBlocks(), st = S.settings, name = (st.name || '').trim();
  const secs = `<div class="set-sec">Разделы</div>
    <div class="set-row"><span>При запуске открывать</span><div class="seg2"><button class="${st.startSec !== 'last' ? 'on' : ''}" data-act="ststart" data-v="home">Главную</button><button class="${st.startSec === 'last' ? 'on' : ''}" data-act="ststart" data-v="last">Последний раздел</button></div></div>
    <div class="set-row"><span>Отмечать привычки задним числом</span><input id="s_hpast" class="sw" type="checkbox"${st.habitPast ? ' checked' : ''}></div>
    <div class="set-row"><span>Показатели самочувствия</span><button class="btn" data-act="bioedit">${I(IC.gear, 15)} Настроить</button></div>`;
  const about = `<div class="set-sec">О приложении</div>
    <div class="st-about"><span class="wordmark">${APP_NAME}</span><small>Календарь, задачи, привычки и финансы — в одном месте.</small></div>
    <button class="btn" style="width:100%" data-act="help">${I(IC.key, 16)} Горячие клавиши</button>
    ${ui2() ? `<button class="btn" style="width:100%;margin-top:8px" data-act="onbshow">${I(IC.spark, 16)} Знакомство с приложением</button>` : ""}`;
  return `<button class="card st-prof" data-act="pe" data-tab="main">${avatarHTML(48)}<span><b>${esc(name || 'Ваш профиль')}</b><small>${name ? 'Личные данные, аватар и обложка' : 'Укажите имя, выберите аватар и обложку'}</small></span>${I(IC.right, 18)}</button>
  <div class="st-grid"><div class="card">${b.look}</div><div class="card">${b.cal}</div><div class="card">${b.cats}</div><div class="card">${secs}</div><div class="card">${b.notif}</div><div class="card">${b.data}</div><div class="card">${about}</div></div>`;
}
ACT.ststart = el => { S.settings.startSec = el.dataset.v === 'last' ? 'last' : 'home'; save(); render(); };
SEC.settings = { name:'Настройки', icon:IC.gear, noNav:true, title: () => 'Настройки', html: settingsHTML, move: () => {} };
