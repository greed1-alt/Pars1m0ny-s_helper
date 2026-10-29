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
// Аватар: своё фото, эмодзи или буквы имени на цветном кружке; рамка — из магазина (S.settings.frame, shop.js), fm — показать другую
const okImg = s => /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(s || '');
function avatarHTML(size, fm) {
  const a = S.settings.avatar || {}, n = initials(S.settings.name), c = /^#[0-9a-f]{3,8}$/i.test(a.c || '') ? a.c : '#6366f1', f = frameAttr(fm === undefined ? S.settings.frame : fm);
  if (okImg(a.img)) return `<span class="ava img${f.c}" style="--c:${c};--s:${size}px;background-image:url(${a.img})${f.s}" aria-hidden="true"></span>`;
  return `<span class="ava${a.e ? ' em' : ''}${f.c}" style="--c:${c};--s:${size}px${f.s}" aria-hidden="true">${a.e ? esc(a.e) : n ? esc(n) : I(IC.user, Math.round(size * .55))}</span>`;
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
ACT.hmgoal = goGoals;
ACT.gnewh = () => openGoal();
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || e.isComposing) return;
  if ((e.target.id === 'hm_note' || e.target.id === 'qn_text') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); (e.target.id === 'hm_note' ? ACT.hmnote : ACT.qnsave)(); }
});
document.addEventListener('input', e => {
  if (e.target.id === 'hm_note') hmNoteDraft = e.target.value;
});

SEC.home = {
  name:'Главная', icon:IC.home, newLabel:'Создать', noNav:true,
  title: () => innerWidth >= 900 ? 'Главная' : `<span class="wordmark">${APP_NAME}</span>${BETA_PILL}`,   // дата — в приветствии, в шапке не повторяем
  html: () => homeHTML(), move: () => {},
};

// ---- Профиль: имя, аватар, статистика, достижения ----
// Серия: дни подряд, когда выполнены все запланированные ежедневные привычки (сегодня и замороженный день — S.frz, shop.js — серию не обрывают)
function habitStreaks() {
  const hs = hByKind('daily'), t = todayK(), fz = new Set(Array.isArray(S.frz) ? S.frz : []); if (!hs.length) return { cur:0, best:0 };
  let k = hs.reduce((m, h) => { const s = hStart(h); return s < m ? s : m; }, t), run = 0, best = 0;
  if (k < addDays(t, -730)) k = addDays(t, -730);
  for (; k <= t; k = addDays(k, 1)) {
    const d = dayStat(k);
    if (d.plan && d.done === d.plan) { run++; best = Math.max(best, run); }
    else if (d.plan && k !== t && !fz.has(k)) run = 0;
  }
  return { cur: run, best };
}
function profileStats() {
  const t = todayK();
  return {
    days: Math.max(1, dayDiff(S.settings.since || t, t) + 1),
    tasksDone: S.events.filter(e => e.task).reduce((a, e) => a + (isRec(e) ? (e.doneDates || []).length : e.done ? 1 : 0), 0),
    marks: S.habits.reduce((a, h) => a + Object.keys(h.log).length, 0),
    bioDays: Object.keys(S.bio.log).length,
    ops: S.fin.ops.length,
    saved: S.fin.ops.filter(o => fcat(o.cat).g === 'sav').reduce((a, o) => a + o.amt, 0),
    notes: S.notes.length,
    goalsSet: S.goals.length,
    ...habitStreaks(),
  };
}
// Достижения: [значок, название, условие, значение, цель, ключ]; ключ — для награды в ParsiCoins (shop.js, coins.sql), не менять
const ACH = [
  ['🌱', 'Первый шаг', 'Выполнить первую задачу', s => s.tasksDone, 1, 'first'],
  ['✅', 'Деловой человек', 'Выполнить 50 задач', s => s.tasksDone, 50, 't50'],
  ['🏆', 'Машина продуктивности', 'Выполнить 300 задач', s => s.tasksDone, 300, 't300'],
  ['🔥', 'Неделя огня', '7 дней подряд — все привычки', s => s.best, 7, 'w7'],
  ['💎', 'Железная воля', '30 дней подряд — все привычки', s => s.best, 30, 'w30'],
  ['💯', 'Сотня', '100 отметок привычек', s => s.marks, 100, 'm100'],
  ['🧘', 'Самопознание', '30 дней отмечать самочувствие', s => s.bioDays, 30, 'bio30'],
  ['💰', 'Деньги любят счёт', '50 записей в финансах', s => s.ops, 50, 'ops50'],
  ['🐷', 'Копилка', 'Отложить 10 000 ₽', s => s.saved, 10000, 'save10k'],
  ['📝', 'Летописец', 'Написать 10 заметок', s => s.notes, 10, 'notes10'],
  ['🎯', 'Большая мечта', 'Поставить первую цель', s => s.goalsSet ? 1 : 0, 1, 'goal1'],
  ['🗓️', 'Месяц вместе', `30 дней с ${APP_NAME}`, s => s.days, 30, 'days30'],
];
// Достижения: получено ли и насколько близко к цели
const achState = s => ACH.map(([e, n, dsc, f, goal, id]) => { const v = f(s); return { e, n, dsc, v, goal, id, ok: v >= goal, p: Math.min(1, v / goal) }; });
const achSorted = l => [...l.filter(a => a.ok), ...l.filter(a => !a.ok).sort((a, b) => b.p - a.p)];   // сначала полученные, потом самые близкие
const achHTML = a => `<div class="ach-i${a.ok ? '' : ' lock'}"><span class="ach-e" aria-hidden="true">${a.e}</span><span class="ach-t"><b>${esc(a.n)}</b><small>${esc(a.dsc)}</small>${a.ok ? '<em>Получено</em>' : `<span class="ach-p"><span class="ds-bar"><i style="width:${Math.round(a.p * 100)}%"></i></span><small>${a.goal >= 1000 ? rub0(a.v) + ' / ' + rub0(a.goal) : NF0.format(Math.min(a.v, a.goal)) + ' / ' + NF0.format(a.goal)}</small></span>`}</span></div>`;
function openAchievements() {
  const l = achState(profileStats());
  sheet(`<div class="sh-head"><h3>Достижения · ${l.filter(a => a.ok).length} из ${ACH.length}</h3><button class="ic" data-act="close" aria-label="Закрыть">${I(IC.x, 18)}</button></div>
  <div class="ach ach-all">${achSorted(l).map(achHTML).join('')}</div>`);
}
ACT.achall = openAchievements;
// «Пригласить»: есть карточка друзей — ссылка-приглашение в друзья (friends.js), иначе просто ссылка на приложение
ACT.invite = () => {
  if (frCanInvite()) return frInvite();
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
  // Из магазина за ParsiCoins (COVER_SHOP, shop.js)
  boreal:'linear-gradient(115deg,#0b1d3a 0%,#1e5f74 35%,#2ee59d 65%,#a96bff 100%)', neon:'linear-gradient(120deg,#12002f 0%,#6a00f4 40%,#ff00c8 75%,#ffd319 100%)',
  gold:'linear-gradient(120deg,#3d2c05 0%,#b8860b 40%,#f7d774 70%,#fff3b0 100%)', seaset:'linear-gradient(180deg,#ff7e5f 0%,#feb47b 42%,#3a6073 58%,#16222a 100%)',
  cosmos:'radial-gradient(circle at 12% 30%,#fff 0 1px,transparent 1.6px),radial-gradient(circle at 38% 70%,#fff 0 1px,transparent 1.6px),radial-gradient(circle at 63% 22%,#fff 0 1.3px,transparent 2px),radial-gradient(circle at 82% 64%,#fff 0 1px,transparent 1.6px),radial-gradient(circle at 92% 18%,#fff 0 .8px,transparent 1.4px),radial-gradient(ellipse at 70% 120%,#7b2ff7 0%,transparent 55%),linear-gradient(160deg,#000428 0%,#0b1a4a 60%,#1b0f3d 100%)',
  berry:'linear-gradient(120deg,#8e2de2 0%,#4a00e0 50%,#ff6a88 100%)',
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
  ${frCardHTML()}
  ${coinsOn() && coins ? `<div class="card pf-coins"><div class="card-h"><b>${coinI(17)} ${COIN}</b><button class="pill sm" data-act="shopopen" data-tab="shop">Магазин →</button></div>
    <div class="pf-cn"><b>${NF0.format(coins.bal)}</b><span>${coinsReady().length ? 'Можно забрать наград: ' + coinsReady().length : 'Задания дня и недели, награды за достижения и серию'}</span>
      <button class="btn${coinsReady().length ? ' pri' : ''}" data-act="shopopen" data-tab="tasks">Задания</button></div></div>` : ''}
    ${plansOn() ? `<div class="card pf-plans"><div class="card-h"><b>${I(IC.spark, 17)} Тарифы</b></div><p class="pf-plan-now">${planNow() === 'free' ? 'Сейчас — бесплатный тариф' : 'У вас ' + esc(planLine())}</p>
      <button class="btn pri" data-act="plansopen">Смотреть тарифы</button></div>` : `<div class="card pf-plans"><div class="card-h"><b>${I(IC.spark, 17)} Тарифы</b><span class="soon">Скоро</span></div>
      <div class="plans"><div class="plan cur"><small>Сейчас</small><b>Базовый</b><span>бесплатно</span></div><div class="plan pro"><small>Скоро</small><b>Премиум</b><span>стоимость — позже</span></div></div>
      <ul class="plan-perks"><li>${I(IC.spark, 14)} Переливающееся имя в профиле и на Главной</li><li>${I(IC.check, 14)} Синхронизация iPhone и компьютера</li><li>${I(IC.check, 14)} Друзья и общие календари</li></ul>
      <p class="set-note" style="margin-top:6px">Здесь будут тарифы, их возможности и цены.</p>
    </div>`}`;
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
// Кнопка профиля в шапке: имя и аватар. Аватар — всегда у правого края на одном месте, имя растёт влево целиком (не длиннее NAME_MAX знаков).
// Имя — только на ПК: на телефоне в шапке мало места
const hdrAvaHTML = () => `<span class="hdr-name">${esc((S.settings.name || '').trim() || 'Профиль')}</span>${avatarHTML(28)}${frDot() || coinDot()}`;   // точка — новая заявка в друзья или награда в ParsiCoins
const profTouch = () => { S.settings.profUpd = Date.now(); save(); $('#side').innerHTML = sideHTML(); const h = $('.hdr-ava'); if (h) h.innerHTML = hdrAvaHTML(); const u = $('#pe_upd'); if (u) u.textContent = 'Обновлён: только что'; };
ACT.pfava = openAvatar;

// ---- Меню профиля по нажатию на имя и аватар в шапке (просьба пользователя 22 октября 2026: «добавь подобную плашку из файла при нажатии на имя») ----
// Пример — меню сайта с уровнем, валютой, магазином и карточками; у нас: кто вы, серия и очки недели, Премиум (скоро), разделы профиля,
// внизу — Настройки, светлая / тёмная тема и выход. Уровня нет — решение пользователя
ACT.accmenu = el => {
  const qc = $('#qc');
  if (quickOpen() && qc.classList.contains('acc')) return closeQuick();
  const st = S.settings, name = (st.name || '').trim(), on = signedIn(), wk = frWeekStats(), inc = on ? frIncoming().length : 0, dark = darkNow();
  const cn = coinsOn() && coins, cnN = cn ? coinsReady().length : 0;   // ParsiCoins (shop.js): пока нет тарифов — вместо баннера Премиума, с ними — строкой меню
  qc.innerHTML = `<div class="accm" role="menu" aria-label="Меню профиля">
    <button class="accm-me" data-act="accgo" data-s="profile" role="menuitem">${avatarHTML(44)}<span class="accm-who"><b>${esc(name || 'Профиль')}</b><small>${fr.nick ? '@' + esc(fr.nick) : 'Открыть профиль'}</small></span>${I(IC.right, 18)}</button>
    <div class="accm-chips"><span class="accm-chip c1"><span aria-hidden="true">🔥</span><b>${wk.s ? plural(wk.s, NDAY) : '—'}</b><small>серия</small></span><span class="accm-chip c2"><span aria-hidden="true">⭐</span><b>${plural(frScore(wk), FR_PTS)}</b><small>за неделю</small></span></div>
    ${plansOn() ? `<button class="accm-prem" data-act="plansopen" role="menuitem">${I(IC.spark, 24)}<span><b>${planNow() === 'free' ? APP_NAME + ' Плюс и Премиум' : 'Ваш тариф — ' + PLAN_NAME[planNow()]}</b><small>${planNow() === 'free' ? 'Больше помощника, тем и возможностей' : esc(planLine())}</small></span></button>`
      : cn ? `<button class="accm-prem accm-shop" data-act="shopopen" role="menuitem">${coinI(28)}<span><b>${NF0.format(coins.bal)} ${COIN}</b><small>${cnN ? 'Можно забрать наград: ' + cnN : 'Задания, награды и магазин'}</small></span>${cnN ? `<em class="accm-badge" aria-hidden="true">${cnN}</em>` : ''}</button>`
      : `<button class="accm-prem" data-act="accgo" data-s="profile" data-to="pf-plans" role="menuitem">${I(IC.spark, 24)}<span><b>${APP_NAME} Премиум</b><small>Переливающееся имя и другие привилегии — скоро</small></span></button>`}
    <div class="accm-list">
      ${msgOn() ? `<button data-act="accmsg" role="menuitem">${I(IC.chat, 18)}<span>Сообщения</span>${msgUnread ? `<em class="accm-badge" aria-label="Новых: ${msgUnread}">${msgUnread > 99 ? '99+' : msgUnread}</em>` : ''}</button>` : ''}
      <button data-act="accgo" data-s="profile" data-to="pf-friends" role="menuitem">${I(IC.users, 18)}<span>Друзья</span>${inc ? `<em class="accm-badge" aria-label="Новых заявок: ${inc}">${inc}</em>` : ''}</button>
      <button data-act="accgo" data-s="leaders" role="menuitem">${I(IC.trophy, 18)}<span>Лидеры</span></button>
      <button data-act="accach" role="menuitem">${I(IC.check, 18)}<span>Достижения</span></button>
      ${cn && plansOn() ? `<button data-act="shopopen" role="menuitem">${coinI(18)}<span>${COIN} · ${NF0.format(coins.bal)}</span>${cnN ? `<em class="accm-badge" aria-label="Можно забрать: ${cnN}">${cnN}</em>` : ''}</button>` : ''}
      <button data-act="accgo" data-s="profedit" role="menuitem">${I(IC.edit, 18)}<span>Редактировать профиль</span></button>
      ${NAME_ADMIN && on ? `<button data-act="admopen" role="menuitem">${I(IC.lock, 18)}<span>Админка</span></button>` : ''}
      <button data-act="accinv" role="menuitem">${I(IC.share, 18)}<span>Пригласить друга</span></button>
    </div>
    <div class="accm-foot"><button class="accm-set" data-act="accset" role="menuitem">${I(IC.gear, 18)}<span>Настройки</span></button>
      <button class="ic" data-act="acctheme" role="menuitem" aria-label="${dark ? 'Светлая тема' : 'Тёмная тема'}" title="${dark ? 'Светлая тема' : 'Тёмная тема'}">${I(dark ? IC.sun : IC.moon, 18)}</button>
      ${on ? `<button class="ic accm-out" data-act="accout" role="menuitem" aria-label="Выйти из аккаунта" title="Выйти из аккаунта">${I(IC.logout, 18)}</button>` : `<button class="ic" data-act="accin" role="menuitem" aria-label="Войти в аккаунт" title="Войти в аккаунт">${I(IC.user, 18)}</button>`}</div>
  </div>`;
  qc.classList.add('show', 'menu', 'acc');
  const r = el.getBoundingClientRect(), w = qc.offsetWidth;
  qc.style.left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8)) + 'px'; qc.style.top = (r.bottom + 8) + 'px';
  el.setAttribute('aria-expanded', 'true');
  if (a11yKbd) { const b = qc.querySelector('button'); if (b) b.focus(); }   // с клавиатуры — фокус в меню
};
ACT.accgo = el => {
  closeQuick(); const s = el.dataset.s, to = el.dataset.to;
  if (s === 'profedit') peTab = 'main';
  if (s === 'leaders') return ACT.frleaders();
  if (sec === s) render(); else setSec(s);
  if (to) setTimeout(() => { const c = $('.' + to); if (c) c.scrollIntoView({ block: 'start', behavior: smoothB() }); }, 60);
};
ACT.accach = () => { closeQuick(); openAchievements(); };
ACT.accmsg = () => { closeQuick(); openMsgs(); };   // переписка с друзьями (chat.js)
ACT.accinv = () => { closeQuick(); ACT.invite(); };
ACT.accset = () => { closeQuick(); openSettings(); };
ACT.acctheme = () => { closeQuick(); setTheme(darkNow() ? 'light' : 'dark'); };
ACT.accout = () => { closeQuick(); ACT.logout(); };
ACT.accin = () => { closeQuick(); ACT.login(); };
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
      <div class="pe-covers">${Object.keys(COVERS).map(k => `<button class="pe-cv${!okImg(cv.img) && (cv.p || 'dusk') === k ? ' on' : ''}${cvOk(k) ? '' : ' lock'}" data-act="pecover" data-p="${k}" style="background-image:${COVER_GLOW},${COVERS[k]}" aria-label="Обложка ${COVER_SHOP[k] || k}${cvOk(k) ? '' : ' — в магазине'}">${cvOk(k) ? '' : coinI(14)}</button>`).join('')}</div>
      <div class="pe-btns"><button class="btn" data-act="upcover">${I(IC.up, 15)} Загрузить своё фото</button>${okImg(cv.img) ? '<button class="btn dng" data-act="rmcover">Убрать фото</button>' : ''}</div>
      <p class="set-note">Лучше всего подходит широкая картинка. Фото хранится только на этом устройстве.</p></div>
    <div class="card"><div class="pe-sec">Рамка аватара</div>
      <div class="pe-frames"><button class="pe-fm${st.frame ? '' : ' on'}" data-act="peframe" data-k="" aria-pressed="${!st.frame}">${avatarHTML(44, '')}<small>Без рамки</small></button>${Object.keys(FRAMES).map(k => `<button class="pe-fm${st.frame === k ? ' on' : ''}" data-act="peframe" data-k="${k}" aria-pressed="${st.frame === k}">${avatarHTML(44, k)}<small>${coinOwn('fm:' + k) ? esc(FRAMES[k].n) : coinI(12) + ' ' + FRAMES[k].p}</small></button>`).join('')}</div>
      <p class="set-note">Рамки — в магазине за ${COIN}. Её видят и друзья.</p></div>`;
  else if (peTab === 'acc') body = `<div class="card"><div class="pe-sec">Аккаунт</div>
      ${accountHTML()}
      <div class="acc-row"><span class="acc-t"><b>Копия в файл</b><small>На всякий случай — например, перед переездом на другое устройство.</small></span><div class="pe-btns"><button class="btn" data-act="export">${I(IC.down, 15)} Скачать копию</button><button class="btn" data-act="import">${I(IC.up, 15)} Загрузить</button></div></div>

      <div class="acc-row"><span class="acc-t"><b>Ссылка на профиль</b><small>Своя страница по нику${st.nick ? ` <b>@${esc(st.nick)}</b>` : ''} — чтобы делиться ей с друзьями.</small></span><span class="soon">Скоро</span></div>
      <div class="acc-row"><span class="acc-t"><b>Друзья</b><small>Ник, что видят друзья, ссылка-приглашение.</small></span><button class="btn" data-act="frset">Настроить</button></div></div>`;
  else body = `<div class="card"><div class="pe-sec">Личные данные</div>
      <div class="pe-grid">
        <label class="pe-f"><span>Имя или никнейм · до ${NAME_MAX} знаков</span><input class="fin" data-pf="name" data-nchk="name" value="${v('name')}" maxlength="${NAME_MAX}" placeholder="Как вас называть" autocomplete="nickname"></label>
        <label class="pe-f"><span>Пол</span><select class="fin" data-pf="gender"><option value="">Не указан</option><option value="m"${st.gender === 'm' ? ' selected' : ''}>Мужской</option><option value="f"${st.gender === 'f' ? ' selected' : ''}>Женский</option></select></label>
        <label class="pe-f full"><span>Девиз</span><input class="fin" data-pf="motto" value="${v('motto')}" maxlength="90" placeholder="Каждый день — шаг к мечте" autocomplete="off"></label>
        <label class="pe-f full"><span>Обо мне</span><textarea class="fin hn-text" data-pf="about" maxlength="2048" placeholder="Напишите что-нибудь о себе…">${v('about')}</textarea><em class="pe-cnt" id="pe_cnt">${(st.about || '').length}/2048</em></label>
        <label class="pe-f"><span>День рождения</span><input class="fin" type="date" data-pf="birthday" value="${v('birthday')}" max="${todayK()}"></label>
        <label class="pe-f"><span>Страна</span><input class="fin" data-pf="country" value="${v('country')}" list="pe_countries" placeholder="Ваша страна" autocomplete="country-name"><datalist id="pe_countries">${COUNTRIES.map(c => `<option value="${c}">`).join('')}</datalist></label>
        <label class="pe-f"><span>Город</span><input class="fin" data-pf="city" value="${v('city')}" placeholder="Ваш город" autocomplete="address-level2"></label>
        <label class="pe-f"><span>Ник</span><input class="fin" data-pf="nick" data-nchk="nick" value="${v('nick')}" maxlength="24" placeholder="Ваш ник" autocomplete="off"></label>
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
ACT.pecover = el => { const k = el.dataset.p; if (!cvOk(k)) return openShopItem('cv:' + k); S.settings.cover = { p: k, img:'' }; profTouch(); render(); };
ACT.peframe = el => { const k = el.dataset.k; if (k && !coinOwn('fm:' + k)) return openShopItem('fm:' + k); if (k) S.settings.frame = k; else delete S.settings.frame; profTouch(); render(); };
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
    // мат, оскорбления и служебные имена (admin, Parsimony) — недоступны: остаётся прежнее (js/names.js)
    if (f === 'name' || f === 'nick') { const bad = nameBadMsg(t.value, f === 'nick'); if (bad) { t.value = S.settings[f] || ''; nameNote(t, ''); return toast(bad); } }
    if (f === 'name') { val = val.slice(0, NAME_MAX).trim(); t.value = val; }
    if (f === 'nick') { val = val.toLowerCase().replace(/^@/, '').replace(/[^a-z0-9_.]/g, '').slice(0, 24); t.value = val; }
    if (f === 'birthday' && val && (!isDayKey(val) || val > todayK())) { t.value = S.settings.birthday || ''; return toast('Проверьте дату рождения'); }
    if (val) S.settings[f] = val; else delete S.settings[f];
    profTouch();
    if (f === 'nick') frNickChanged(val, t);   // есть карточка друзей — сервер проверит, свободен ли ник
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
  const secs = `<div class="set-sec">Главная и разделы</div>
    ${layoutSetHTML()}
    <div class="set-row"><span>При запуске открывать</span><div class="seg2"><button class="${st.startSec !== 'last' ? 'on' : ''}" data-act="ststart" data-v="home">Главную</button><button class="${st.startSec === 'last' ? 'on' : ''}" data-act="ststart" data-v="last">Последний раздел</button></div></div>`;
  // Раньше «задним числом» и самочувствие лежали в «Расположении → Разное», а часы и «пишет сам» помощника — в «Календаре» и «Напоминаниях» (30 октября 2026)
  const habits = `<div class="set-sec">Привычки и самочувствие</div>
    <div class="set-row"><span>${withHint('Отмечать привычки задним числом', 'habitPast')}</span><input id="s_hpast" class="sw" type="checkbox"${st.habitPast ? ' checked' : ''}></div>
    <div class="set-row"><span>Показатели самочувствия<small>что отмечаете: сон, энергия, настроение…</small></span><button class="btn" data-act="bioedit">${I(IC.gear, 15)} Настроить</button></div>
    <div class="set-row"><span>Подначки и похвалы целей<small>во вкладке «Цели»</small></span><button class="btn" data-act="stphr">Открыть</button></div>`;
  const ai = `<div class="set-sec">Помощник</div>
    <div class="set-row"><span>${withHint('Помощник пишет сам', 'nudge')}<small>до 3 раз в день, только по делу, ночью тихо</small></span><input id="s_nudge" class="sw" type="checkbox"${st.nudge ? ' checked' : ''}></div>
    ${aiFreeHTML()}`;
  const friends = `<div class="set-sec">Друзья и приватность</div>
    ${!signedIn() ? `<p class="set-note">Друзья работают с аккаунтом — войдите по почте.</p><button class="btn pri" style="width:100%" data-act="login">${I(IC.user, 16)} Войти</button>`
      : `<p class="set-note">${st.fr ? 'Ник, что друзья видят в каждом календаре и в профиле, уведомления о заявках и сообщениях.' : 'Создайте карточку — друзья найдут вас по нику, увидят, когда вы заняты, и смогут писать вам.'}</p>
      <button class="btn${st.fr ? '' : ' pri'}" style="width:100%" data-act="frset">${I(IC.users, 16)} ${st.fr ? 'Что видят друзья и уведомления' : 'Создать карточку для друзей'}</button>
      <button class="btn" style="width:100%;margin-top:8px" data-act="accgo" data-s="profile" data-to="pf-friends">${I(IC.user, 16)} Мои друзья и заявки</button>`}`;
  const about = `<div class="set-sec">О приложении</div>
    <div class="st-about"><span class="wordmark">${APP_NAME}</span><small>Календарь, задачи, привычки и финансы — в одном месте.</small><small class="st-ver">${appVerText()}</small></div>
    <button class="btn" style="width:100%" data-act="help">${I(IC.key, 16)} Горячие клавиши</button>
    <button class="btn" style="width:100%;margin-top:8px" data-act="tourmenu">${I(IC.spark, 16)} Знакомство с приложением</button>
    <button class="btn" style="width:100%;margin-top:8px" data-act="feedback">${I(IC.msg, 16)} Написать отзыв</button>
    <a class="btn" style="width:100%;margin-top:8px" href="beta.html" target="_blank" rel="noopener">${I(IC.note, 16)} Памятка бета-тестера</a>
    ${legalOn() ? `<p class="set-note st-legal"><a href="terms.html" target="_blank" rel="noopener">Пользовательское соглашение</a> · <a href="privacy.html" target="_blank" rel="noopener">Политика конфиденциальности</a> · <a href="consent.html" target="_blank" rel="noopener">Согласие на обработку данных</a></p>` : ''}`;
  const prof = `<button class="card st-prof" data-act="pe" data-tab="main">${avatarHTML(48)}<span><b>${esc(name || 'Ваш профиль')}</b><small>${name ? 'Личные данные, аватар и обложка' : 'Укажите имя, выберите аватар и обложку'}</small></span>${I(IC.right, 18)}</button>`;
  const cards = { data: b.data, friends, look: b.look, secs, cal: b.cal, cats: b.cats, habits, ai, notif: b.notif, about };
  const search = `<label class="st-search">${I(IC.search, 18)}<input id="st_q" type="search" value="${esc(stQ)}" placeholder="Найти настройку" autocomplete="off" aria-label="Найти настройку"></label>`;
  const none = `<p class="st-none"${ST_SEC.some(s => stMatch(s)) ? ' hidden' : ''}>Ничего не нашлось — попробуйте другое слово</p>`;
  const hid = s => stMatch(s) ? '' : ' hidden', kw = s => ` data-kw="${esc(stKw(s))}"`;
  // id карточек — для оглавления, списка разделов и кнопок помощника «Открыть…» (stJump)
  const grid = `<div class="st-grid">${ST_SEC.map(s => `<div class="card" id="st-${s[0]}"${kw(s)}${hid(s)}>${cards[s[0]]}</div>`).join('')}</div>`;
  if (!stPhone()) return prof + search + grid + none;
  if (stOpen && cards[stOpen]) return `<button class="st-back" data-act="stback">${I(IC.left, 18)} Все настройки</button><div class="st-one"><div class="card" id="st-${stOpen}">${cards[stOpen]}</div></div>`;
  const stat = s => { const r = s[3](); return `<small${r.warn ? ' class="warn"' : ''}>${esc(r.t)}</small>`; };
  // Вид А — список по группам, как в настройках iPhone; вид Б — плитки (проба 30 октября 2026, переключатель внизу)
  const body = stTiles()
    ? `<div class="st-tiles">${ST_SEC.map(s => `<button class="card st-tile" data-act="stjump" data-k="${s[0]}"${kw(s)}${hid(s)}>${I(s[1], 22)}<b>${s[2]}</b>${stat(s)}</button>`).join('')}</div>`
    : Object.keys(ST_GRP).map(g => { const l = ST_SEC.filter(s => s[4] === g);
      return `<div class="st-g"${l.some(s => stMatch(s)) ? '' : ' hidden'}><div class="st-gh">${ST_GRP[g]}</div><div class="card st-list">${l.map(s => `<button class="st-item" data-act="stjump" data-k="${s[0]}"${kw(s)}${hid(s)}>${I(s[1], 20)}<span><b>${s[2]}</b>${stat(s)}</span>${I(IC.right, 16)}</button>`).join('')}</div></div>`; }).join('');
  const view = `<div class="st-view"><span>Вид настроек</span><div class="seg2" role="group" aria-label="Вид настроек"><button class="${stTiles() ? '' : 'on'}" aria-pressed="${!stTiles()}" data-act="stlook" data-v="list">Список</button><button class="${stTiles() ? 'on' : ''}" aria-pressed="${stTiles()}" data-act="stlook" data-v="tiles">Плитки</button></div></div>`;
  return prof + search + body + none + view;
}

// ---- Настройки на телефоне — список разделов, как в настройках iPhone (18 октября 2026; раньше — одна лента карточек на 4,5 экрана).
// У каждого раздела — состояние («Напоминания — выключены» красным); нажатие открывает только этот раздел («‹ Все настройки» — назад).
// Пробовали и оглавление плитками над лентой (вид А) — пользователь выбрал список. На ПК — карточки в две колонки, как раньше ----
// Версия на этом устройстве — из названия кэша service worker (sw.js: CACHE = 'rem-vN'): это то, что реально установлено, а не то, что лежит
// на сайте (просьба пользователя 19 октября 2026: «показать в настройках, какая версия установлена на устройстве»). Её же шлёт «Отзыв»
let appVer = 0;
async function appVerLoad() {
  try { const v = Math.max(0, ...(await caches.keys()).map(k => +((/^rem-v(\d+)$/.exec(k) || [])[1] || 0)));
    if (v && v !== appVer) { appVer = v; if (sec === 'settings') render(); } } catch (e) {}
  return appVer;
}
const appVerText = () => { if (!appVer) appVerLoad(); return appVer ? 'Версия ' + appVer + (IS_BETA ? ' · бета' : '') : 'Версия: проверяю…'; };
const stPhone = () => innerWidth < 900;
let stOpen = null;   // открытый раздел
onMigrate(() => { delete S.settings.stView; });   // переключатель вида пробы А / Б
// Разделы: [ключ, значок, название, состояние, группа, слова для поиска]. Группы и названия — 30 октября 2026 («настройки на телефоне — непонятно что где
// делать»): «Календарь» / «Календари» путались — теперь «Вид календаря» / «Мои календари»; у помощника, привычек и друзей — свои разделы
const ST_GRP = { me: 'Вы', view: 'Вид', plan: 'Планирование', help: 'Помощь', app: 'Приложение' };
const ST_SEC = [
  ['data', IC.user, 'Аккаунт и данные', () => signedIn() ? { t: (auth && auth.email) || 'Вход выполнен' } : { t: 'Вход не выполнен', warn: true }, 'me', 'аккаунт почта вход войти выход выйти копия файл скачать загрузить удалить данные'],
  ['friends', IC.users, 'Друзья и приватность', () => !signedIn() ? { t: 'нужен вход' } : S.settings.fr ? { t: fr.nick ? '@' + fr.nick : 'карточка создана' } : { t: 'карточки пока нет' }, 'me', 'друзья ник карточка приватность видят занят приглашение заявки сообщения переписка лидеры'],
  ['look', IC.sun, 'Оформление', () => ({ t: [(PAL[S.settings.pal] || {}).n, ((THEME_N.find(x => x[0] === S.settings.theme) || [])[1] || '').toLowerCase()].filter(Boolean).join(', ') }), 'view', 'оформление тема тёмная светлая чёрная палитра цвет контраст карточки углы цвет событий'],
  ['secs', IC.grid, 'Главная и разделы', () => ({ t: 'вкладки, блоки, запуск' }), 'view', 'главная разделы вкладки блоки порядок расположение запуск скрыть выключить'],
  ['cal', IC.cal, 'Вид календаря', () => ({ t: 'неделя с ' + (S.settings.weekStart === 0 ? 'воскресенья' : 'понедельника') }), 'plan', 'календарь неделя выходные сетка размер час начало номер недели прошедшие пустые часы горячие клавиши'],
  ['cats', IC.list, 'Мои календари', () => ({ t: plural(S.cats.length, ['календарь', 'календаря', 'календарей']) }), 'plan', 'календари категории цвет поделиться добавить удалить'],
  ['habits', IC.habit, 'Привычки и самочувствие', () => ({ t: plural((S.bio.metrics || []).length, ['показатель', 'показателя', 'показателей']) + ' самочувствия' }), 'plan', 'привычки задним числом самочувствие сон настроение энергия стресс показатели цели подначки похвалы'],
  ['ai', IC.spark, 'Помощник', () => { const h = aiFreeHrs(); return { t: `будни ${h.wd[0]}–${h.wd[1]} · ${S.settings.nudge ? 'пишет сам' : 'не пишет сам'}` }; }, 'help', 'помощник свободное время часы пишет сам сообщения нейросеть'],
  ['notif', IC.bell, 'Уведомления', () => ({ t: notif.short ? notif.short[0].toUpperCase() + notif.short.slice(1) : 'Проверяю…', warn: !notif.on }), 'help', 'уведомления напоминания пуш сводки утро вечер новости проверить'],
  ['about', IC.note, 'О приложении', () => ({ t: appVerText() }), 'app', 'о приложении версия знакомство тур отзыв памятка горячие клавиши документы политика соглашение'],
];
// Поиск: слова запроса — по началу (без окончаний, ё = е), во всех словах раздела
let stQ = '';
const stNorm = s => String(s).toLowerCase().replace(/ё/g, 'е');
const stKw = s => stNorm(s[2] + ' ' + s[5]);
const stMatch = s => { const k = stKw(s).split(/\s+/); return stNorm(stQ).split(/\s+/).filter(Boolean).every(w => { const p = w.length > 5 ? w.slice(0, -2) : w; return k.some(x => x.startsWith(p)); }); };
document.addEventListener('input', e => {
  if (e.target.id !== 'st_q') return;
  stQ = e.target.value; let any = false;
  document.querySelectorAll('[data-kw]').forEach(el => { const s = ST_SEC.find(x => stKw(x) === el.dataset.kw); const ok = !s || stMatch(s); el.hidden = !ok; if (ok) any = true; });
  document.querySelectorAll('.st-g').forEach(g => { g.hidden = !g.querySelector('[data-kw]:not([hidden])'); });
  const n = $('.st-none'); if (n) n.hidden = any;
});
const stTiles = () => S.settings.stLook === 'tiles';
ACT.stlook = el => { S.settings.stLook = el.dataset.v === 'tiles' ? 'tiles' : 'list'; save(); render(); };
// Подначки и похвалы — во вкладке «Цели» (goals.js): открыть её с раскрытым блоком
ACT.stphr = () => { S.settings.folds['g-phr'] = true; save(); goGoals(); setTimeout(() => { const f = $('[data-fold="g-phr"]'); if (f) f.scrollIntoView({ block: 'start', behavior: smoothB() }); }, 80); };
// Перейти к разделу настроек: на телефоне — открыть его, на ПК — прокрутить к карточке и подсветить (так же — кнопки помощника)
function stJump(k) {
  if (sec !== 'settings') setSec('settings');
  if (stPhone()) { stOpen = k; render(); window.scrollTo(0, 0); return; }
  setTimeout(() => { const c = $('#st-' + k); if (!c) return; c.scrollIntoView({ block: 'start', behavior: smoothB() }); c.classList.add('ai-flash'); setTimeout(() => c.classList.remove('ai-flash'), 1800); }, 30);   // после перерисовки
}
ACT.stjump = el => stJump(el.dataset.k);
ACT.stback = () => { stOpen = null; render(); window.scrollTo(0, 0); };
onMigrate(() => { if (S.settings.stLook !== 'tiles') delete S.settings.stLook; });

ACT.ststart = el => { S.settings.startSec = el.dataset.v === 'last' ? 'last' : 'home'; save(); render(); };
SEC.settings = { name:'Настройки', icon:IC.gear, noNav:true, title: () => { const s = stOpen && stPhone() && ST_SEC.find(x => x[0] === stOpen); return s ? s[2] : 'Настройки'; }, html: settingsHTML, move: () => {} };
