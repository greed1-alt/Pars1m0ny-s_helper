// ---- Разделы: Календарь, Задачи, Привычки, Финансы ----
// Каждый раздел регистрирует себя в SEC: name, icon, title(), html(), move(n), today(), create(), newLabel
const SEC = {};
// Какие разделы во вкладках телефона и в боковой панели ПК и в каком порядке — выбирает пользователь (js/layout.js: navSecs()).
// «Профиль» и «Настройки» — внизу панели и в шапке. «Цели» — вкладка внутри «Задач» (решение пользователя 4 октября 2026);
// SEC.goals — только заголовок, пример и боковой блок для этой вкладки.
const SEC_ALL = ['home', 'cal', 'tasks', 'habits', 'fin', 'timer', 'profile', 'profedit', 'settings'];
// При запуске — «Главная» (или последний раздел, если так выбрано в настройках)
let sec = S.settings.startSec === 'last' && SEC_ALL.includes(S.settings.sec) ? S.settings.sec : 'home';
SEC.cal = { name:'Календарь', icon:IC.cal, newLabel:'Создать' };

function setSec(s) {
  if (!SEC[s] || s === sec) return;
  if (s === 'settings') { stOpen = null; stQ = ''; }   // Настройки всегда открываются со списка разделов и без поиска (pages.js)
  sec = s; S.settings.sec = s; save();
  if (s === 'habits' || s === 'fin') miniAnchor = pd(secYM + '-01'); else syncMini();
  closeQuick(); if (sheetOpen()) closeSheet();
  window.scrollTo(0, 0);
  render(2);
}
ACT.sec = el => setSec(el.dataset.s);

// ---- История страниц: «назад» смахиванием от левого края (телефон; просьба пользователя 23 октября 2026: «если человек зашел не на ту
// страницу ему не приходилось лезть через весь экран, а нужно было просто смахнуть рукой»; выбор — «Назад от края», «Страница едет за пальцем»).
// Каждая новая страница запоминает прошлую (navStack: раздел, вид, вкладка, раздел настроек, друг, прокрутка; на телефоне — снимок экрана
// для анимации, у последних NAV_SNAPS). «Назад» — на прошлую, а если возвращаться некуда — на Главную. Вернулись туда, откуда пришли
// (вкладкой, «‹ Все настройки»), — это шаг назад, а не новый. Жест — js/input.js; на Android «Назад» системы делает то же (шаг в истории браузера)
const NAV_MAX = 20, NAV_SNAPS = 5;
let navStack = [], navCur = null, navRestoring = false, navHist = false, navPend = false;
// Одна страница — раздел (Календарь и Задачи при «Плане» — одна), раздел настроек на телефоне, друг; вид и вкладка внутри — та же страница
const navKey = () => (planOn() && (sec === 'cal' || sec === 'tasks') ? 'plan' : sec) + '|' + (sec === 'settings' && stPhone() ? stOpen || '' : '') + '|' + (sec === 'friend' ? fr.cur || '' : '');
const navLoc = () => ({ s: sec, v: view, t: tView, st: stOpen, fr: fr.cur, pe: peTab, y: scrollY });
const navCanBack = () => navStack.length > 0 || sec !== 'home';
const navOk = s => !!SEC[s] && secOn(s);   // раздел с тех пор выключили — туда не возвращаемся
addEventListener('scroll', () => { if (navCur) navCur.loc.y = scrollY; }, { passive: true });
// Снимок страницы для жеста: копия .app; шапка зависит от страницы (body[data-…]) — то, что в ней видно сейчас, переносим прямо в копию
function navSnap() {
  const app = $('.app'); if (!app) return null;
  const c = app.cloneNode(true), lh = app.querySelector('header'), ch = c.querySelector('header');
  if (lh && ch) { const L = [lh, ...lh.querySelectorAll('*')], C = [ch, ...ch.querySelectorAll('*')];
    L.forEach((el, i) => { const s = getComputedStyle(el), x = C[i]; if (!x) return; x.style.setProperty('display', s.display, 'important');
      if (el.id === 'ttl') { x.style.textAlign = s.textAlign; x.style.paddingLeft = s.paddingLeft; } }); }
  return c;
}
// render() в начале: открылась другая страница — прошлая уходит в историю
function navTrack() {
  const k = navKey();
  if (!navCur || k === navCur.k) { navCur = { k, loc: navLoc() }; if (!navStack.length) navGuard(); return; }
  if (!navRestoring) {
    const top = navStack[navStack.length - 1];
    if (top && top.k === k) navStack.pop();
    else {
      navStack.push({ k: navCur.k, loc: navCur.loc, snap: innerWidth < 900 ? navSnap() : null });
      if (navStack.length > NAV_MAX) navStack.shift();
      navStack.slice(0, -NAV_SNAPS).forEach(x => { x.snap = null; });
    }
  }
  navCur = { k, loc: navLoc() };
  if (!navRestoring) navGuard();
}
// Назад: прошлая страница целиком, как её оставили (вид, вкладка, прокрутка); anim — страница въезжает слева («Назад» Android)
function navBack(anim) {
  let it = navStack.pop(); while (it && !navOk(it.loc.s)) it = navStack.pop();
  const L = it ? it.loc : sec !== 'home' ? { s: 'home', y: 0 } : null;
  if (!L) return false;
  navRestoring = true;
  try {
    if (L.v) view = L.v; if (L.t) tView = L.t; if (L.fr) fr.cur = L.fr; if (L.pe) peTab = L.pe;
    if (L.s !== sec) { sec = L.s; S.settings.sec = sec; save(); if (sec === 'habits' || sec === 'fin') miniAnchor = pd(secYM + '-01'); else syncMini(); }
    if (sec === 'settings') stOpen = L.st || null;
    closeQuick(); if (sheetOpen()) closeSheet();
    render(anim ? -1 : 0);
  } finally { navRestoring = false; }
  window.scrollTo(0, L.y || 0); if (navCur) navCur.loc.y = L.y || 0;
  navGuard();
  return true;
}
// Android: «Назад» системы — шаг в истории браузера. Пока есть куда вернуться, в истории лежит один свой шаг (как у окон — shHistOpen)
function navGuard() {
  if (navHist || !navCanBack()) return;
  if (shBack) { navPend = true; return; }   // окно ещё закрывается и его шаг назад не дошёл — свой шаг добавим после (calendar.js, popstate)
  navPend = false; navHist = true; try { history.pushState({ pnav: 1 }, ''); } catch (e) {}
}
const navPop = () => { navHist = false; navBack(true); };

// Месяц как строка «2026-10»
const ymOf = k => k.slice(0, 7);
const ymAdd = (ym, n) => { const [y, m] = ym.split('-').map(Number), d = new Date(y, m - 1 + n, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
const ymDays = ym => { const [y, m] = ym.split('-').map(Number), n = new Date(y, m, 0).getDate(); return [...Array(n)].map((_, i) => ym + '-' + String(i + 1).padStart(2, '0')); };
const ymTitle = ym => { const [y, m] = ym.split('-').map(Number); return MON[m - 1] + ' ' + y; };
// В шапке телефона мало места: текущий год не пишем
// На телефоне в шапке мало места: текущий год не пишем, другой — с коротким месяцем («Сен 2025»)
const ymHead = ym => innerWidth >= 900 ? ymTitle(ym) : ym.slice(0, 4) !== todayK().slice(0, 4) ? MON[Number(ym.slice(5)) - 1].slice(0, 3) + ' ' + ym.slice(0, 4) : MON[Number(ym.slice(5)) - 1];
const ymGen = ym => { const [y, m] = ym.split('-').map(Number); return MONG[m - 1]; };
let secYM = ymOf(todayK());   // месяц, открытый в «Привычках» и «Финансах»

// Навигация: боковая панель на ПК и вкладки внизу на телефоне
const navHTML = () => `<nav class="sb-nav">${navSecs().map(s => `<button class="sb-nv${s === sec ? ' on' : ''}" data-act="sec" data-s="${s}">${I(SEC[s].icon, 17)}${SEC[s].name}${SEC[s].beta ? '<em class="beta" title="Экспериментальный раздел">β</em>' : ''}${s === 'timer' ? '<span class="tm-mini"></span>' : ''}</button>`).join('')}</nav>`;
let planLast = 'cal';
function tabbarRender() {
  const tb = $('#tabbar'); if (!tb) return;
  // «План» (телефон): одна кнопка на месте первого из Календаря и Задач; открывает тот из них, что был последним
  const all = navSecs(), plan = planOn(), P = s => plan && (s === 'cal' || s === 'tasks');
  if (P(sec)) planLast = sec;
  const L = plan ? all.filter(s => s !== (all.indexOf('cal') < all.indexOf('tasks') ? 'tasks' : 'cal')) : all; tb.dataset.n = L.length;
  tb.innerHTML = L.map(s => { const p = P(s), on = p ? P(sec) : s === sec, go = p ? planLast : s, nm = p ? 'План' : SEC[s].name;
    return `<button class="tb-b${on ? ' on' : ''}" data-act="sec" data-s="${go}" aria-label="${nm}"${on ? ' aria-current="page"' : ''}>${I(p ? IC.cal : SEC[s].icon, 22)}<span>${nm}</span></button>`; }).join('');
}

// ---- «Вы пропустили»: разовые дела прошлых дней без галочки ----
// Повторяющийся распорядок (работа, обед) сюда не попадает — иначе он был бы здесь каждый день.
const missedList = () => {
  const t = todayK(), from = addDays(t, -30);
  return S.events.filter(e => !isRec(e) && !e.done && e.date < t && e.date >= from)
    .sort((a, b) => b.date.localeCompare(a.date) || (a.time || '').localeCompare(b.time || ''));
};
// thin — тонкая строка «Пропущено: N · Разобрать» в Плане и Задачах; целиком плашка только на Главной (аудит 18 октября 2026: была на четырёх экранах)
function missedBar(full, thin) {
  const l = missedList(); if (!l.length) return '';
  if (thin) return `<button class="missbar thin" data-act="missopen">${I(IC.alert, 16)}<span><b>Пропущено: ${plural(l.length, ['дело', 'дела', 'дел'])}</b></span><em>Разобрать</em></button>`;
  const names = l.slice(0, full ? 3 : 2).map(e => esc(e.title)).join(', ') + (l.length > (full ? 3 : 2) ? '…' : '');
  return `<button class="missbar" data-act="missopen">${I(IC.alert, 18)}<span><b>Вы пропустили: ${plural(l.length, ['дело', 'дела', 'дел'])}</b><small>${names}</small></span><em>Разобрать</em></button>`;
}
let missMove = null;   // у какого дела открыт выбор новой даты
// Среди пропущенного есть шаг цели — подначка сверху (js/goals.js)
const missedTaunt = l => { const e = l.find(x => x.goal && goalById(x.goal)), tx = e ? goalTaunt(goalById(e.goal), e.title) : '';
  return tx ? `<div class="gl-taunt" style="margin-bottom:10px">${I(IC.alert, 15)}<span>${esc(tx)}</span></div>` : ''; };
function openMissed(keep) {
  const l = missedList();
  if (!l.length) { closeSheet(); render(); return toast('Пропущенных дел нет 👍'); }
  sheet(`<div class="sh-head"><h3>Вы пропустили</h3><button class="ic" data-act="close" aria-label="Закрыть">${I(IC.x, 18)}</button></div>
  <p class="set-note" style="margin:0 0 10px">Разовые дела за последние 30 дней, которые не отмечены выполненными. Перенесите их или отметьте.</p>
  ${missedTaunt(l)}
  <div class="mslist">${l.map(e => `<div class="msrow" style="--c:${cat(e.cat).color}">
    <div class="ms-top"><i></i><div class="ms-t"><b>${esc(e.title)}</b><small>${esc(relDay(e.date))}${e.time ? ', ' + esc(e.time) : ''} · ${esc(cat(e.cat).name)}${e.goal && goalById(e.goal) ? ' · ' + esc(goalById(e.goal).emoji + ' ' + goalById(e.goal).title) : ''}</small></div></div>
    <div class="ms-btns">${missMove === e.id
      ? `<button class="btn" data-act="missto" data-id="${e.id}" data-d="${todayK()}">Сегодня</button><button class="btn" data-act="missto" data-id="${e.id}" data-d="${addDays(todayK(), 1)}">Завтра</button><input class="fin ms-date" type="date" data-id="${e.id}" min="${todayK()}" aria-label="Другая дата">`
      : `<button class="btn" data-act="missmove" data-id="${e.id}">${I(IC.cal, 15)} Перенести</button><button class="btn" data-act="missdone" data-id="${e.id}">${I(IC.check, 15)} Выполнено</button>`}</div></div>`).join('')}</div>
  ${l.length > 1 ? `<button class="btn" style="width:100%;margin-top:12px" data-act="missalldone">Отметить все выполненными</button>` : ''}`, keep);
}
function missedMoveTo(id, d) {
  const e = S.events.find(x => x.id === id); if (!e || !d) return;
  snap(); e.date = d; missMove = null; save(); render(); openMissed(true);
  toast(`«${e.title}» перенесено на ${relDay(d)}`, true);
}
ACT.missopen = () => { missMove = null; openMissed(); };
ACT.missmove = el => { missMove = el.dataset.id; openMissed(true); };
ACT.missto = el => missedMoveTo(el.dataset.id, el.dataset.d);
ACT.missdone = el => { const e = S.events.find(x => x.id === el.dataset.id); if (!e) return; snap(); e.done = true; save(); render(); openMissed(true); toast('Отмечено выполненным', true); };
ACT.missalldone = () => { const l = missedList(); snap(); l.forEach(e => e.done = true); save(); closeSheet(); render(); toast(`Отмечено выполненными: ${l.length}`, true); };
document.addEventListener('change', e => { if (e.target.classList.contains('ms-date')) missedMoveTo(e.target.dataset.id, e.target.value); });

// ---- Пример для пробы: заполнить раздел, чтобы увидеть, как он выглядит; потом убрать одной кнопкой ----
const demoBar = (key, on) => on
  ? `<div class="demobar">${I(IC.spark, 16)}<span>Это <b>пример</b> — не ваши записи</span><button class="btn" data-act="demooff" data-s="${key}">Убрать</button></div>`   // одной строкой (было ~90 px на каждой странице)
  : '';
const emptyCard = (key, title, text) => `<div class="card empty-card"><b>${title}</b><p>${text}</p><div class="row"><button class="btn pri" data-act="add">${I(IC.plus, 16)} ${SEC[key].newLabel}</button><button class="btn" data-act="demoon" data-s="${key}">${I(IC.spark, 16)} Показать на примере</button></div></div>`;
ACT.demoon = el => { const s = SEC[el.dataset.s]; if (!s || !s.demo) return; s.demo(true); save(); render(); toast('Добавлен пример — посмотрите, как всё выглядит'); };
ACT.demooff = el => { const s = SEC[el.dataset.s]; if (!s || !s.demo) return; s.demo(false); save(); render(); toast('Пример убран'); };

// Горизонтальная прокрутка таблиц сохраняется между перерисовками; при первом показе — к сегодняшнему дню
const hsKeep = {};
function hsSave() { $$('[data-hs]').forEach(e => { hsKeep[e.dataset.hs] = e.scrollLeft; }); }
function hsRestore() {
  $$('[data-hs]').forEach(e => {
    const k = e.dataset.hs;
    if (k in hsKeep) { e.scrollLeft = hsKeep[k]; return; }
    const t = e.querySelector('.is-today');
    if (t) { const pad = (e.querySelector('.sticky-col') || {}).offsetWidth || 0; e.scrollLeft = Math.max(0, t.offsetLeft - pad - (e.clientWidth - pad) / 2); }
  });
}

// Деньги: «12 345 ₽»
const NF = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 });
const NF0 = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const rub = v => NF.format(Math.round((v || 0) * 100) / 100) + ' ₽';
const rub0 = v => NF0.format(Math.round(v || 0)) + ' ₽';
const pctTxt = p => p == null ? '—' : Math.round(p * 100) + '%';
