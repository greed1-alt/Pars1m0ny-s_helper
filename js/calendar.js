// ---- Состояние вида ----
let view = (window.innerWidth >= 900 ? 'week' : 'month'), sel = todayK(), monthAnchor = pd(sel);
monthAnchor.setDate(1);
let miniAnchor = new Date(monthAnchor);
const syncMini = () => { miniAnchor = pd(sel); miniAnchor.setDate(1); };
const weekDays = () => { const s = weekStartOf(sel); const d = [...Array(7)].map((_,i) => addDays(s, i)); return S.settings.weekends ? d : d.filter(k => !isWknd(k)); };

// Категория — отдельной меткой (цветная точка + название в «таблетке»), чтобы не путать её с названием события
const catTag = id => { const c = cat(id); return `<span class="ctag" style="--c:${c.color}"><i></i>${esc(c.name)}</span>`; };
function evHTML(e) {
  return `<div class="ev${e.done?' done':''}" style="--c:${cat(e.cat).color}"><button class="chk" data-act="toggle" data-id="${e.id}" data-d="${e.date}" aria-label="Выполнено">${e.done?I(IC.check,13):''}</button>
  <button class="evb" data-act="edit" data-id="${e.id}" data-d="${e.date}"><b>${esc(e.title)}</b><small>${e.time?`<span class="ev-tm">${timeRange(e)}</span>`:''}${catTag(e.cat)}${goalTag(e)}${e.rec?'<span>↻</span>':''}${remLabel(e) ? `<span>${remLabel(e).replace(/^ · /, '')}</span>` : ''}${e.loc?`<span>${esc(e.loc)}</span>`:''}</small>${e.note?`<p>${esc(e.note)}</p>`:''}</button></div>`;
}

function gridCells(anchor) {
  const d = new Date(anchor), off = S.settings.weekStart === 1 ? (d.getDay()+6)%7 : d.getDay();
  const n = Math.ceil((off + new Date(d.getFullYear(), d.getMonth()+1, 0).getDate()) / 7) * 7, out = [];
  for (let i = 0; i < n; i++) { const c = new Date(d); c.setDate(1 - off + i); out.push([c, c.getMonth() === d.getMonth()]); }
  return out;
}
const dowsOrdered = () => S.settings.weekStart === 1 ? DOW : [DOW[6], ...DOW.slice(0,6)];

function monthHTML() {
  const today = todayK(), cells = gridCells(monthAnchor), rows = cells.length / 7, pc = innerWidth >= 900, side = pc && wkSide(), dAct = side ? 'pick' : 'goday';
  const hh = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hh')) || 60;
  const maxChips = Math.max(1, Math.floor(((innerHeight - hh - 32) / rows - 32) / 20));
  const fk = cells.some(([c]) => ds(c) === sel) ? sel : ymOf(ds(monthAnchor)) + '-01';   // день, на который попадает Tab
  let h = `<div class="month" style="--rows:${rows}">` + dowsOrdered().map(x => `<div class="mdw" aria-hidden="true">${x}</div>`).join('');
  h += cells.map(([c, inMonth]) => {
    const k = ds(c), es = evOn(k), lim = es.length > maxChips ? maxChips - 1 : maxChips;
    const chips = pc ? es.slice(0, lim).map(e => `<button class="mchip${e.time?'':' all'}${e.done?' done':''}" data-act="edit" data-id="${e.id}" data-d="${k}" style="--c:${cat(e.cat).color}"><i></i>${e.time?`<span class="t">${esc(e.time)}</span>`:''}<span class="n">${esc(e.title)}</span></button>`).join('')
      + (es.length > lim ? `<button class="mmore" data-act="${dAct}" data-d="${k}">ещё ${es.length - lim}</button>` : '') : '';
    const dots = es.slice(0,4).map(e => `<u style="background:${cat(e.cat).color}"></u>`).join('');
    return `<div class="mc${inMonth?'':' oth'}${k===today?' today':''}${k===sel?' sel':''}${isWknd(k)?' wknd':''}" data-act="pick" data-d="${k}"><span class="mc-n"${pc?` data-act="${dAct}" data-d="${k}" title="${side ? 'Показать день справа' : 'Открыть день'}"`:''} data-k="${k}" role="button" tabindex="${k === fk ? 0 : -1}" aria-label="${esc(a11yDay(k, es.length))}${k === sel ? ', выбран' : ''}"${k === today ? ' aria-current="date"' : ''}>${c.getDate()}</span><span class="mdots">${dots}</span><div class="mchips">${chips}</div></div>`;
  }).join('');
  h += '</div>';
  if (side) return `<div class="wkview"><div class="wkgrid">${h}</div><aside class="wkside">${calDayHTML(sel, true)}</aside></div>`;
  return pc ? h : `<div class="cd-wrap">${missedBar(false, true)}${h}${calDayHTML(sel)}</div>`;
}

// ---- Календарь, вариант А (12 октября 2026): выбранный день списком — на телефоне под месяцем или полоской недели,
// на ПК панелью справа от недели. События по времени с чертой «сейчас», ниже дела без времени, внизу строка добавления на этот день ----
// Коротко, чтобы название не обрезалось: «идёт», «через 40 мин», «через 2 ч» (полностью — в подсказке)
const cdSoon = (e, nm) => { const m = timeMin(e.time) - nm; return m <= 0 ? 'идёт' : m < 60 ? `через ${m} мин` : `через ${Math.round(m / 60)} ч`; };
function cdRow(e, k, nx, nm) {
  const c = cat(e.cat), pr = e.task ? prioOf(e) : '', next = nx && nx.k === k && nx.e.id === e.id, t = todayK();
  const past = e.time && (k < t || (k === t && evEndMin(e) <= nm));
  const meta = next ? `<span class="t3-meta now" title="${esc(nx.label)}">${cdSoon(e, nm)}</span>` : e.loc ? `<span class="t3-meta cd-loc">${esc(e.loc)}</span>` : '';
  return `<div class="t3-row cd-row${e.done ? ' done' : ''}${next ? ' next' : ''}${past && !e.done ? ' past' : ''}${pr === 'urgent' || pr === 'high' ? ' p-' + pr : ''}" style="--c:${c.color}">
    ${e.time ? `<span class="cd-tm" title="${esc(c.name)}"><b>${esc(e.time)}</b>${e.time2 ? `<small>${esc(e.time2)}</small>` : ''}</span>` : ''}
    <button class="t3-ck" data-act="toggle" data-id="${e.id}" data-d="${k}" style="--pc:${pr ? t3Ring(pr) : 'var(--mut)'}" aria-label="${e.done ? 'Снять отметку' : 'Выполнено'}">${e.done ? I(IC.check, 12) : ''}</button>
    <button class="t3-main" data-act="edit" data-id="${e.id}" data-d="${k}">${e.time ? '' : `<i class="t3-dot" style="background:${c.color}" title="${esc(c.name)}"></i>`}<span class="t3-t">${esc(e.title)}</span>${e.rec ? '<i class="t3-rep" title="Повторяется">↻</i>' : ''}${goalTag(e)}</button>
    ${meta}</div>`;
}
function calDayHTML(k, side) {
  const t = todayK(), all = evOn(k), nm = nowMin(), nx = k === t ? nextUp(k) : null, d = pd(k);
  const timed = all.filter(e => e.time), untimed = daySort(all.filter(e => !e.time)), dn = all.filter(e => e.done).length;
  const line = `<div class="cd-now" aria-label="Сейчас ${fmtMin(nm)}"><span>${fmtMin(nm)}</span><i></i></div>`;
  const at = k === t && timed.length ? timed.findIndex(e => timeMin(e.time) > nm) : -2, rows = [];
  timed.forEach((e, i) => { if (i === at) rows.push(line); rows.push(cdRow(e, k, nx, nm)); });
  if (at === -1) rows.push(line);
  const ttl = `${DOW[dowIdx(k)]}, ${d.getDate()} ${MONG[d.getMonth()]}${k === t ? ' · сегодня' : k === addDays(t, 1) ? ' · завтра' : ''}`;
  const btn = `<button class="t3-gbtn" data-act="goday" data-d="${k}" title="Почасовая сетка этого дня">по часам${side ? ' →' : ''}</button>`;
  // Строка ввода добавляет на выбранный день, если дата не написана в тексте. Стоит над списком дня — как в «Задачах» (просьба пользователя 15 октября 2026)
  const st = omSt('omc'); st.base = k !== t ? k : null; st.ph = st.base ? `Добавить на ${relDay(k)}…` : null;
  return `<div class="card h2-omni cd-omni">${omniHTML('omc', 'cal')}</div>
  <div class="card t3-list cd-day">${t3Head(withHint(ttl, 'dayList'), all.length ? `${dn} из ${all.length}` : '', '', btn)}${rows.join('')}
    ${timed.length && untimed.length ? t3Head('Без времени') : ''}${untimed.map(e => cdRow(e, k, nx, nm)).join('')}
    ${all.length ? '' : `<p class="t3-empty">${k < t ? 'В этот день ничего не было.' : 'Свободный день — добавьте дело или встречу в строке выше.'}</p>`}</div>`;
}
// Телефон: полоска дней недели над «Днём» и «Лентой» (точки — цвета календарей несделанных дел, галочка — всё сделано)
function calWeekStrip() {
  const t = todayK();
  return `<div class="t3-strip cd-strip" role="tablist" aria-label="Дни недели">${taskWeek().map(k => { const l = evOn(k), open = l.filter(e => !e.done), d = pd(k);
    const marks = !l.length ? '' : !open.length ? I(IC.check, 11) : [...new Set(open.map(e => cat(e.cat).color))].slice(0, 3).map(cl => `<i style="background:${cl}"></i>`).join('');
    return `<button class="t3-day${k === sel ? ' on' : ''}${k === t ? ' today' : ''}${k < t ? ' past' : ''}" data-act="t3day" data-d="${k}" role="tab" aria-selected="${k === sel}" aria-label="${esc(fmtLong(k))}: ${l.length ? open.length ? 'осталось ' + open.length : 'всё сделано' : 'пусто'}"><small>${DOW[dowIdx(k)].toLowerCase()}</small><b>${d.getDate()}</b><span class="t3-marks${l.length && !open.length ? ' ok' : ''}">${marks}</span></button>`; }).join('')}</div>`;
}
// ПК, «Неделя»: справа — панель выбранного дня (на узком экране её нет). Число в шапке недели выбирает день, «по часам →» открывает его целиком
const wkSide = () => innerWidth >= 1100;
function weekHTML() {
  const g = gridHTML(weekDays());
  return wkSide() ? `<div class="wkview"><div class="wkgrid">${g}</div><aside class="wkside">${calDayHTML(sel, true)}</aside></div>` : g;
}

// ---- Календарь, вариант Б на телефоне (12 октября 2026): «Лента» — две недели подряд от выбранного дня одним списком.
// Сверху полоска недели и строка добавления; пустые дни сжаты в строку «свободно»; сегодня прошедшее (больше двух) свёрнуто,
// красная черта — «сейчас». Стрелки и свайп листают по неделе, «Следующие 2 недели» — дальше. На ПК вид «Список» прежний ----
const FEED_N = 14;
let feedPastOpen = false;
ACT.cdpast = () => { feedPastOpen = !feedPastOpen; render(); };
ACT.cdmore = () => { sel = addDays(sel, FEED_N); syncMini(); render(); window.scrollTo(0, 0); };
const feedLbl = k => { const t = todayK(), d = pd(k), dw = DOW[dowIdx(k)].toLowerCase();
  return k === t ? `Сегодня · ${dw} ${d.getDate()}` : k === addDays(t, 1) ? `Завтра · ${dw} ${d.getDate()}` : k === addDays(t, -1) ? `Вчера · ${dw} ${d.getDate()}` : `${dw} · ${d.getDate()} ${MONS[d.getMonth()]}`; };
function feedDay(k, all, nx, nm) {
  const t = todayK(), timed = all.filter(e => e.time), untimed = daySort(all.filter(e => !e.time)), dn = all.filter(e => e.done).length, rows = [];
  const line = `<div class="cd-now" aria-label="Сейчас ${fmtMin(nm)}"><span>${fmtMin(nm)}</span><i></i></div>`;
  let list = timed;
  if (k === t) {
    const past = timed.filter(e => evEndMin(e) <= nm);
    if (past.length > 2) {
      rows.push(`<button class="cf-past" data-act="cdpast" aria-expanded="${feedPastOpen}">${I(IC.clock, 15)}<span>Раньше: ${plural(past.length, NEV)}${past.some(e => e.done) ? ` · сделано ${past.filter(e => e.done).length}` : ''}</span><em>${feedPastOpen ? 'свернуть' : 'показать'}</em></button>`);
      if (!feedPastOpen) list = timed.filter(e => !past.includes(e));
    }
    const at = list.findIndex(e => timeMin(e.time) > nm);
    list.forEach((e, i) => { if (i === at) rows.push(line); rows.push(cdRow(e, k, nx, nm)); });
    if (timed.length && at === -1) rows.push(line);
  } else list.forEach(e => rows.push(cdRow(e, k, nx, nm)));
  untimed.forEach(e => rows.push(cdRow(e, k, nx, nm)));
  if (!all.length) rows.push('<p class="t3-empty">На сегодня пусто — добавьте дело в строке выше.</p>');
  return `<div class="t3-gh cf-gh${k === t ? ' today' : ''}"><b>${feedLbl(k)}</b>${all.length ? `<small>${dn} из ${all.length}</small>` : ''}<button class="t3-gbtn" data-act="goday" data-d="${k}" title="Почасовая сетка этого дня" aria-label="По часам: ${esc(fmtLong(k))}">по часам</button></div>${rows.join('')}`;
}
function feedHTML() {
  const t = todayK(), nm = nowMin(), nx = nextUp(t), out = []; let free = [];
  const flush = () => { if (!free.length) return; const a = free[0], b = free[free.length - 1], f = k => `${DOW[dowIdx(k)].toLowerCase()} ${pd(k).getDate()}`;
    out.push(`<div class="cf-free"><b>${f(a)}${b !== a ? ' – ' + f(b) : ''}</b><span>свободно</span></div>`); free = []; };
  for (let i = 0; i < FEED_N; i++) { const k = addDays(sel, i), all = evOn(k);
    if (!all.length && k !== t) { free.push(k); continue; }
    flush(); out.push(feedDay(k, all, nx, nm)); }
  flush();
  const st = omSt('omc'); st.base = sel !== t ? sel : null; st.ph = st.base ? `Добавить на ${relDay(sel)}…` : null;
  return `<div class="cd-wrap">${missedBar(false, true)}${calWeekStrip()}<div class="card h2-omni cd-omni">${omniHTML('omc', 'cal')}</div>
    <div class="card t3-list cd-feed">${out.join('')}<button class="t3-more" data-act="cdmore">Следующие 2 недели →</button></div></div>`;
}

function miniHTML() {
  const today = todayK(), wkStart = weekStartOf(sel), wkEnd = addDays(wkStart, 6);
  let h = '<div class="mgrid">' + dowsOrdered().map(x => `<i>${x.toLowerCase()}</i>`).join('');
  h += gridCells(miniAnchor).map(([c, inMonth], i) => {
    const k = ds(c), es = evOn(k), col = i % 7, inWk = (sec === 'tasks' || (sec === 'cal' && (view === 'week' || view === 'day'))) && k >= wkStart && k <= wkEnd;
    const dots = [...new Set(es.map(e => cat(e.cat).color))].slice(0,4).map(cl => `<u style="background:${cl}"></u>`).join('');
    return `<button class="mcell${inMonth?'':' oth'}${k===today?' today':''}${k===sel?' sel':''}${inWk?' wk':''}${col===0?' l':''}${col===6?' r':''}" data-act="pick" data-d="${k}"><span>${c.getDate()}</span><em class="md">${dots}</em></button>`;
  }).join('');
  return h + '</div>';
}

// Раскладка пересекающихся событий по колонкам
function layoutDay(list) {
  const items = list.map(e => { const s = timeMin(e.time), t2 = timeMin(e.time2); return { e, s, end: t2 != null && t2 > s ? t2 : s + 60 }; })
    .sort((a, b) => a.s - b.s || b.end - a.end);
  let group = [], groupEnd = -1;
  const flush = () => { const ends = []; group.forEach(it => { let c = ends.findIndex(x => x <= it.s); if (c < 0) { c = ends.length; ends.push(0); } ends[c] = it.end; it.col = c; }); group.forEach(it => it.cols = ends.length); group = []; };
  items.forEach(it => { if (group.length && it.s >= groupEnd) { flush(); groupEnd = -1; } group.push(it); groupEnd = Math.max(groupEnd, it.end); });
  if (group.length) flush();
  return items;
}

// ---- Ось времени сетки: минуты ↔ пиксели. В новом интерфейсе пустые часы сворачиваются в тонкую полоску ----
// Полоска появляется, если во всех днях недели подряд нет событий: ночью от 2 часов, днём от 3. Нажатие разворачивает её.
const FOLD_H = 30;
const foldOn = () => S.settings.fold !== false;
const wgOpen = new Set();   // полоски, развёрнутые вручную (час начала); сбрасываются при смене недели
let TA = { segs:[], H:0 }, taKey = '';
function buildAxis(days) {
  const SH = startH(), RH = rowH(), segs = []; let y = 0;
  const push = (a, b, fold) => { const h = fold ? FOLD_H : (b - a) / 60 * RH; segs.push({ a, b, y, h, fold }); y += h; };
  const key = days[0] + ':' + days.length; if (key !== taKey) { wgOpen.clear(); taKey = key; }
  if (!foldOn()) push(SH * 60, 1440, false);
  else {
    const busy = Array(24).fill(false);
    days.forEach(k => evOn(k).forEach(e => { const s = timeMin(e.time); if (s == null) return; const t2 = timeMin(e.time2), en = t2 != null && t2 > s ? t2 : s + 60;
      for (let h = Math.floor(s / 60); h < Math.min(24, Math.ceil(en / 60)); h++) busy[h] = true; }));
    if (days.includes(todayK())) busy[Math.floor(nowMin() / 60)] = true;
    for (let h = SH; h < 24;) {
      let e = h; while (e < 24 && busy[e] === busy[h]) e++;
      const n = e - h, fold = !busy[h] && !wgOpen.has(h) && (n >= 3 || (n >= 2 && (h === SH || e === 24)));
      push(h * 60, e * 60, fold); h = e;
    }
  }
  return { segs, H: y };
}
const yOf = m => { for (const s of TA.segs) if (m <= s.b) return s.y + (Math.max(m, s.a) - s.a) / (s.b - s.a) * s.h; return TA.H; };
const minOf = y => { for (const s of TA.segs) if (y < s.y + s.h) return s.a + Math.max(0, y - s.y) / s.h * (s.b - s.a); return 1440; };
const hh2 = m => String(m / 60).padStart(2, '0') + ':00';
ACT.wgfold = el => { wgOpen.add(Number(el.dataset.h)); render(); };

function gridHTML(days, opt) {
  const today = todayK(), SH = startH(), RH = rowH(), nm = nowMin();
  TA = buildAxis(days);
  const fz = TA.segs.some(s => s.fold);
  const showNow = days.includes(today) && nm >= SH*60, nowTop = yOf(nm);
  // Неделя с панелью дня справа: число выбирает день для панели; дел без времени над сеткой — не больше трёх строк, остальное «ещё N»
  const side = days.length > 1 && wkSide(), dAct = side ? 'pick' : 'goday';
  const head = days.map(k => `<div class="wg-day${isWknd(k)?' wknd':''}"><span class="wg-dow">${days.length === 1 ? DOWF[dowIdx(k)] : dowName(k)}</span><button class="wg-num${k===today?' today':''}${k===sel&&days.length>1?' sel':''}" data-act="${dAct}" data-d="${k}" title="${side ? 'Показать день справа' : 'Открыть день'}">${pd(k).getDate()}</button></div>`).join('');
  // В «Плане» задачи без времени — отдельным списком с кружками над сеткой (opt.noTasks), над сеткой остаются только события на весь день
  const allrow = days.map(k => { const es = evOn(k).filter(e => !e.time && !(opt && opt.noTasks && e.task)), show = days.length > 1 && es.length > 3 ? es.slice(0, 2) : es;
    return `<div class="wg-allcol${isWknd(k)?' wknd':''}" data-act="quickadd" data-d="${k}" title="Добавить задачу на весь день">${show.map(e => `<button class="wg-chip${e.done?' done':''}" data-act="edit" data-id="${e.id}" data-d="${k}" style="--c:${cat(e.cat).color}">${e.done?'✓ ':''}${esc(e.title)}</button>`).join('')}${es.length > show.length ? `<button class="wg-more" data-act="${dAct}" data-d="${k}">ещё ${es.length - show.length}</button>` : ''}</div>`; }).join('');
  const hours = TA.segs.map((s, si) => s.fold
    ? `<button class="wg-foldlbl" data-act="wgfold" data-h="${s.a / 60}" style="height:${s.h}px" title="Показать пустые часы">${hh2(s.a).slice(0, 2)}–${hh2(s.b).slice(0, 2)}</button>`
    : [...Array((s.b - s.a) / 60)].map((_, i) => { const h = s.a / 60 + i, hide = h === SH || (i === 0 && si > 0 && TA.segs[si - 1].fold) || (showNow && Math.abs(nm - h*60) < 14);
      return `<div class="wg-hourrow"><span${hide?' class="hide"':''}>${String(h).padStart(2,'0')}:00</span></div>`; }).join('')).join('');
  const cols = days.map(k => {
    const blocks = layoutDay(evOn(k).filter(e => timeMin(e.time) != null)).map(it => {
      const e = it.e, top = yOf(it.s);
      const h = Math.max(20, yOf(Math.max(it.end, SH*60 + 20)) - top - 2);
      const short = it.end - it.s <= 30 || h < 40, past = S.settings.dimPast && (k < today || (k === today && it.end <= nm)), w = 100 / it.cols;
      return `<button class="wg-block${e.done?' done':''}${past?' past':''}${short?' short':''}" data-act="edit" data-id="${e.id}" data-d="${k}" style="top:${top}px;height:${h}px;left:calc(${it.col*w}% + 1px);width:calc(${w}% - 3px);--c:${cat(e.cat).color}"><span class="wb-t">${e.done?'✓ ':''}${esc(e.title)}</span><span class="wb-m">${timeRange(e)}${e.loc?' · '+esc(e.loc):''}</span>${e.rec && !short ? '<i class="wb-rep">↻</i>' : ''}<span class="wg-rs" aria-hidden="true"></span></button>`;
    }).join('');
    return `<div class="wg-col${isWknd(k)?' wknd':''}" data-act="colclick" data-d="${k}" style="height:${TA.H}px">${blocks}${showNow && k === today ? `<div class="wg-now" style="top:${nowTop}px"></div>` : ''}</div>`;
  }).join('');
  // Линии часов при свёрнутых полосках рисуются кусками (у каждого куска свой отсчёт), полоски — поверх всех дней
  const lines = fz ? `<div class="wg-lines" aria-hidden="true">${TA.segs.filter(s => !s.fold).map(s => `<i style="top:${s.y}px;height:${s.h}px"></i>`).join('')}</div>` : '';
  const folds = fz ? TA.segs.filter(s => s.fold).map(s => `<button class="wg-fold" data-act="wgfold" data-h="${s.a / 60}" style="top:${s.y}px;height:${s.h}px" aria-label="Показать часы ${hh2(s.a)}–${hh2(s.b)}"><span>свободно</span></button>`).join('') : '';
  const wn = S.settings.weekNums && days.length > 1 ? `<span title="Номер недели">н${isoWeek(days[0])}</span>` : '';
  return `<div class="wgwrap${days.length===1?' one':''}${fz?' fz':''}" style="--n:${days.length};--rh:${RH}px"><div class="wg-stickytop"><div class="wg-head"><div class="wg-corner">${wn}</div>${head}</div>
  <div class="wg-alldays"><div class="wg-corner">весь день</div>${allrow}</div></div>
  <div class="wg-body"><div class="wg-hours">${hours}${showNow ? `<div class="wg-nowlabel" style="top:${nowTop}px">${fmtMin(nm)}</div>` : ''}</div><div class="wg-cols">${lines}${cols}${folds}</div></div></div>`;
}

// Ближайшее событие: «сейчас» или «дальше»
function nextUp(fromDay) {
  const t = todayK(), nm = nowMin();
  for (let i = 0; i < 2; i++) {
    const k = addDays(t, i);
    if (fromDay && k !== fromDay) continue;
    for (const e of evOn(k).filter(e => e.time && !e.done)) {
      const s = timeMin(e.time), en = timeMin(e.time2) != null && timeMin(e.time2) > s ? timeMin(e.time2) : s + 60;
      if (i === 0 && en <= nm) continue;
      return { e, k, label: i === 0 && s <= nm ? 'Сейчас · ещё ' + durText(en - nm) : i === 0 ? 'Через ' + durText(s - nm) : 'Завтра в ' + e.time };
    }
  }
  return null;
}
const nextCard = n => n ? `<button class="nextcard" data-act="edit" data-id="${n.e.id}" data-d="${n.k}" style="--c:${cat(n.e.cat).color}"><small>${n.label}</small><b>${esc(n.e.title)}</b><span>${timeRange(n.e)}${n.e.loc?' · '+esc(n.e.loc):''}</span></button>` : '';

// Телефон, «День» (15 октября 2026, просьба пользователя: «оставить график в виде дневного календаря с почасовой системой»):
// полоска дней недели, строка ввода и почасовая сетка выбранного дня во всю ширину — названия не обрезаются, как в семи столбиках.
// Дела без времени — строкой над сеткой. Свайп и стрелки листают дни. Недели по часам на телефоне нет (вид «Неделя» = «День»)
function phoneDayHTML() {
  const t = todayK(), st = omSt('omc'); st.base = sel !== t ? sel : null; st.ph = st.base ? `Добавить на ${relDay(sel)}…` : null;
  const plan = planOn(), tl = plan ? daySort(dayTasks(sel).filter(e => !e.time)) : [], dn = tl.filter(e => e.done).length, show = cdTasksAll ? tl : tl.slice(0, 6);
  const tasks = tl.length ? `<div class="card t3-list cd-tasks">${t3Head(withHint('Задачи', 'taskRing'), `${dn} из ${tl.length}`)}${show.map(e => t3Row(e, sel, '')).join('')}
    ${tl.length > 6 ? `<button class="t3-more" data-act="cdtasks">${cdTasksAll ? 'Свернуть' : `Ещё ${tl.length - 6}`}</button>` : ''}</div>` : '';
  return `<div class="cd-wrap">${missedBar(false, true)}${calWeekStrip()}<div class="card h2-omni cd-omni">${omniHTML('omc', 'cal')}</div>${tasks}<div class="card cd-grid">${gridHTML([sel], { noTasks: plan })}</div></div>`;
}
let cdTasksAll = false;
ACT.cdtasks = () => { cdTasksAll = !cdTasksAll; render(); };
function dayHTML() {
  if (innerWidth < 900) return phoneDayHTML();
  const es = evOn(sel), allDay = es.filter(e => !e.time), timed = es.filter(e => e.time);
  const done = es.filter(e => e.done).length, pct = es.length ? Math.round(done / es.length * 100) : 0;
  const d = pd(sel), isToday = sel === todayK();
  const sec = (title, list) => list.length ? `<div class="ds-sec">${title}<span>${list.length}</span></div>${list.map(evHTML).join('')}` : '';
  return `<div class="dayview">
    <div class="daygrid">${gridHTML([sel])}</div>
    <aside class="dayside">
      <div class="ds-head"><b>${DOWF[dowIdx(sel)]}</b><small>${d.getDate()} ${MONG[d.getMonth()]} ${d.getFullYear()}${isToday ? ' · сегодня' : ' · ' + relDay(sel)}</small></div>
      <div class="ds-prog"><div class="ds-bar"><i style="width:${pct}%"></i></div><span><span>${es.length ? `Выполнено ${done} из ${es.length}` : 'Задач пока нет'}</span><span>${es.length ? pct + '%' : ''}</span></span></div>
      ${isToday ? nextCard(nextUp(sel)) : ''}
      <input id="ds_new" class="ds-new" type="text" placeholder="Задача, например «звонок в 18»" autocomplete="off">
      <div id="ds_hint" class="nlhint"></div>
      ${sec('Без времени', allDay)}${sec('По времени', timed)}
      ${es.length ? '' : '<p class="empty" style="margin-top:12px">Нажмите на время в сетке или протяните мышью, чтобы создать событие. Можно просто написать задачу выше.</p>'}
    </aside>
  </div>`;
}

function agendaHTML() {
  const today = todayK(); let out = '';
  for (let i = 0; i < 60; i++) {
    const k = addDays(sel, i), es = evOn(k); if (!es.length) continue;
    const d = pd(k);
    out += `<div class="ag-day"><div class="ag-date${k===today?' today':''}" data-act="goday" data-d="${k}" title="Открыть день" role="button" tabindex="0" aria-label="Открыть день: ${esc(a11yDay(k))}"><b>${d.getDate()}</b><small>${MONS[d.getMonth()]}, ${dowName(k).toLowerCase()}</small></div><div class="ag-list">${es.map(e => `<div class="ag-row${e.done?' done':''}" style="--c:${cat(e.cat).color}"><button class="chk" data-act="toggle" data-id="${e.id}" data-d="${k}" aria-label="Выполнено">${e.done?I(IC.check,13):''}</button><button class="ag-main" data-act="edit" data-id="${e.id}" data-d="${k}"><span class="ag-time">${e.time ? timeRange(e) : 'весь день'}</span><span class="ag-bar"></span><span class="ag-txt"><b>${esc(e.title)}</b><small>${(e.time ? `<span class="ev-tm">${timeRange(e)}</span>` : '') + catTag(e.cat) + goalTag(e)}${e.rec?' · ↻ '+esc(repText(e)):''}${e.loc?' · '+esc(e.loc):''}</small></span></button></div>`).join('')}</div></div>`;
  }
  return `<div class="agenda">${out || `<div class="ag-empty"><b>Ближайшие 60 дней свободны</b>Нажмите «Создать» или клавишу N, чтобы запланировать что-нибудь.</div>`}</div>`;
}

const tplSub = t => t.time ? (t.time2 ? t.time + '–' + t.time2 : t.time) : 'Весь день';
function sideHTML() {
  const open = S.settings.tplOpen !== false, n = nextUp();
  const cnt = id => S.events.filter(e => e.cat === id).length;
  const top = `<div class="sb-top"><button class="sb-title" data-act="sec" data-s="home" title="Главная"><span class="sb-logo" title="Сегодня ${esc(fmtLong(todayK()))}"><span>${pd(todayK()).getDate()}</span></span><span class="wordmark">${APP_NAME}</span>${BETA_PILL}</button><button class="sb-ic" data-act="search" aria-label="Поиск" title="Поиск и команды (Ctrl+K)">${I(IC.search)}</button></div>
  ${navHTML()}`;
  const foot = `<div class="sb-foot">

    <button class="sb-link${sec === 'settings' ? ' on' : ''}" data-act="sec" data-s="settings" title="Уведомления: ${esc(notif.short)}">${I(IC.gear,15)} Настройки</button>
    <button class="sb-link" data-act="feedback">${I(IC.msg,15)} Отзыв о бете</button>
    <button class="sb-link" data-act="help">${I(IC.key,15)} Горячие клавиши <kbd>?</kbd></button>
  </div>`;
  if (sec === 'profile' || sec === 'profedit' || sec === 'settings') return `${top}${foot}`;
  const mini = `<div class="mini-head"><b>${MON[miniAnchor.getMonth()]} ${miniAnchor.getFullYear()}</b><div><button data-act="mprev" aria-label="Предыдущий месяц">${I(IC.left,16)}</button><button data-act="mnext" aria-label="Следующий месяц">${I(IC.right,16)}</button></div></div>
  <div id="mini">${miniHTML()}</div>`;
  if (sec !== 'cal') return `${top}${SEC[sec].newLabel ? `<button class="newbtn" data-act="add">${I(IC.plus,16)} ${SEC[sec].newLabel} <kbd>N</kbd></button>` : ''}
  ${sec === 'tasks' || sec === 'home' ? '' : `<div class="sb-miss">${missedBar()}</div>`}${mini}${SEC[sec].side ? SEC[sec].side() : ''}${foot}`;
  return `${top}
  <button class="newbtn" data-act="add">${I(IC.plus,16)} Создать событие <kbd>N</kbd></button>
  <div class="sb-miss">${missedBar()}</div>
  ${n && !((view === 'week' || view === 'month') && wkSide()) ? `<div class="sb-next">${nextCard(n)}</div>` : ''}
  ${mini}
  <div class="sb-sec"><div class="sb-h">Мои календари</div>
  ${S.cats.map(c => `<div class="sb-catw"><button type="button" class="sb-cat${hiddenCats.has(c.id)?'':' on'}" data-act="catfilter" data-id="${c.id}" style="--c:${c.color}"><span class="sb-box">${hiddenCats.has(c.id)?'':I(IC.check,11)}</span>${esc(c.name)}<span class="cnt">${cnt(c.id) || ''}</span></button><button type="button" class="cshare" data-act="sharecat" data-id="${c.id}" aria-label="Поделиться календарём «${esc(c.name)}»" title="Поделиться">${I(IC.share,14)}</button></div>`).join('')}
  <button class="sb-add" data-act="addcat">${I(IC.plus,15)} Добавить календарь</button></div>
  <div class="sb-sec"><button class="sb-h" data-act="tpltoggle">Шаблоны событий <span>${open?'▾':'▸'}</span></button>
  ${open ? (S.templates.length ? S.templates.map(t => `<div class="tpl" data-act="usetpl" data-id="${t.id}" style="--c:${cat(t.cat).color}" role="button" tabindex="0" aria-label="Шаблон: ${esc(t.title)}"><b>${esc(t.title)}</b><small>${esc(tplSub(t))}</small><button class="tpx" data-act="deltpl" data-id="${t.id}" aria-label="Удалить шаблон">${I(IC.x,13)}</button></div>`).join('') : '<p class="empty" style="font-size:12.5px;margin:0 4px">Шаблонов нет. Откройте событие и нажмите «В шаблоны».</p>') : ''}
  </div>
  ${foot}`;
}

function titleHTML() {
  const pc = innerWidth >= 900;
  if (view === 'month') return ymHead(ymOf(ds(monthAnchor)));   // на телефоне год — только если не текущий: в шапке ещё поиск (19 октября 2026)
  if (view === 'week') {
    const days = weekDays(), a = pd(days[0]), b = pd(days[days.length-1]);
    const wn = S.settings.weekNums ? `<span class="sub">неделя ${isoWeek(days[0])}</span>` : '';
    const MN = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
    if (pc) return (a.getMonth() === b.getMonth() ? MON[a.getMonth()] : MN[a.getMonth()] + ' – ' + MN[b.getMonth()].toLowerCase()) + ' ' + b.getFullYear() + wn;
    return a.getMonth() === b.getMonth() ? `${a.getDate()}–${b.getDate()} ${MONS[b.getMonth()]}` : `${a.getDate()} ${MONS[a.getMonth()]} – ${b.getDate()} ${MONS[b.getMonth()]}`;
  }
  if (view === 'day') { const d = pd(sel); return pc ? `${d.getDate()} ${MONG[d.getMonth()]} ${d.getFullYear()}<span class="sub">${DOWF[dowIdx(sel)].toLowerCase()}</span>` : `${d.getDate()} ${MONS[d.getMonth()]}, ${dowName(sel).toLowerCase()}`; }
  const d = pd(sel); return pc ? `Список<span class="sub">с ${d.getDate()} ${MONG[d.getMonth()]}</span>` : ymHead(ymOf(sel));
}

let lastGridView = null;
function render(dir) {
  evCache.clear();
  const fk = focSave();   // js/a11y.js: фокус клавиатуры вернётся на ту же кнопку после перерисовки
  closeQuick();
  const root = document.documentElement, cal = sec === 'cal', S2 = SEC[sec];
  if (cal && view === 'week' && innerWidth < 900) view = 'day';   // на телефоне неделя — полоской дней над «Днём»
  applyLook();   // js/look.js; открытая подсказка «?» переживает перерисовку — она переходит к новому значку (js/help.js)
  document.body.dataset.sec = sec;
  document.body.dataset.nonav = S2.noNav ? '1' : '';    // «Главная», «Профиль», «Настройки»: без стрелок периода
  // Привычки: «+» не нужен — в карточке «Сегодня» и в таблице есть «+ Привычка» (мелочи из аудита, 19 октября 2026).
  // Вкладка «Цели»: «+» повторял строку «Новая цель» прямо под ним — убран (просьба пользователя 21 октября 2026); на ПК новая цель — ещё и N
  document.body.dataset.nonew = S2.newLabel && sec !== 'home' && sec !== 'cal' && sec !== 'habits' && sec !== 'fin' && sec !== 'tasks' ? '' : '1';
  // Привычки и Финансы на текущем месяце: вторая строка шапки телефона («Сегодня») не нужна — прячется (css/ui2.css); поиск — в первой строке
  document.body.dataset.cur = (sec === 'habits' || sec === 'fin') && secYM === ymOf(todayK()) ? '1' : '';   // на Главной, в Календаре и Задачах добавляют строкой ввода — «+» в шапке не повторяем (12 октября 2026); в Привычках и Финансах — тоже (кнопки и строка записи на странице)
  $('#ttl').innerHTML = cal ? titleHTML() : S2.title();
  $$('header [data-v]').forEach(b => b.classList.toggle('on', sec === 'tasks' ? b.dataset.v === 'tasks' : b.dataset.v === view));
  document.body.dataset.plan = planOn() && (cal || sec === 'tasks') ? '1' : '';   // «План» на телефоне: общий переключатель виден и в Задачах
  const bn = $('.btn-new'); if (bn) { bn.innerHTML = I(IC.plus, 17) + (S2.newLabel || ''); bn.setAttribute('aria-label', S2.newLabel || 'Создать'); bn.title = S2.newLabel || 'Создать'; }
  const ha = $('.hdr-ava'); if (ha) { ha.innerHTML = hdrAvaHTML(); ha.classList.toggle('on', sec === 'profile' || sec === 'profedit' || sec === 'friend' || sec === 'leaders'); }
  const si = $('#secinfo'); if (si) si.innerHTML = '';   // сводки в шапке убраны 6 октября 2026: они повторяли то, что видно на странице
  root.style.setProperty('--hh', $('header').offsetHeight + 'px');
  const main = $('#main'), oldW = $('.wgwrap'), oldTop = oldW ? oldW.scrollTop : null;
  hsSave();
  main.className = cal ? 'v-' + view : 'sec sec-' + sec;
  main.innerHTML = !cal ? S2.html() : view === 'month' ? monthHTML() : view === 'week' ? weekHTML() : view === 'day' ? dayHTML() : innerWidth < 900 ? feedHTML() : agendaHTML();
  const w = $('.wgwrap');
  if (w) {
    if (oldTop != null && lastGridView === view) w.scrollTop = oldTop;
    else w.scrollTop = Math.max(0, yOf((new Date().getHours() - 1) * 60));
    lastGridView = view;
  } else lastGridView = null;
  $('#side').innerHTML = sideHTML();
  tabbarRender();
  drawCharts();
  if (S2.after) S2.after();
  hsRestore();
  if (dir) { main.classList.add(dir < 0 ? 'anim-l' : dir > 0 ? 'anim-r' : 'anim-f'); }
  const m = $('meta[name=theme-color]'); if (m) m.content = getComputedStyle(root).getPropertyValue('--bg').trim() || '#ffffff';
  tourSync(); tourInvite();   // js/tour.js
  a11yPage(); focBack(fk);   // js/a11y.js
}

function move(n) {
  if (sec !== 'cal') { SEC[sec].move(n); if (sec !== 'tasks') miniAnchor = pd(secYM + '-01'); return render(n); }
  if (view === 'month') { monthAnchor.setDate(1); monthAnchor.setMonth(monthAnchor.getMonth() + n);
    // На телефоне под месяцем — выбранный день: он остаётся в показанном месяце (сегодня или 1-е число)
    if (innerWidth < 900) { const ym = ymOf(ds(monthAnchor)); if (ymOf(sel) !== ym) { sel = ymOf(todayK()) === ym ? todayK() : ym + '-01'; syncMini(); } } }
  else if (view === 'list') { sel = addDays(sel, (innerWidth < 900 ? 7 : 14) * n); syncMini(); }   // «Лента» на телефоне — по неделе, как полоска дней
  else { sel = addDays(sel, view === 'week' ? 7 * n : n); syncMini(); }
  render(n);
}
function setView(v) { if (v === 'tasks') return setSec('tasks');   // «План» на телефоне: кнопка «Задачи» в общем переключателе
  if (sec !== 'cal') { sec = 'cal'; S.settings.sec = 'cal'; save(); view = v; if (v === 'month') { monthAnchor = pd(sel); monthAnchor.setDate(1); } return render(2); } if (v === view) return; view = v; if (v === 'month') { monthAnchor = pd(sel); monthAnchor.setDate(1); } render(2); }
// «Сегодня» в «Задачах» внутри «Плана» (телефон) открывает сегодняшний «День»
function goToday() { if (sec === 'tasks' && planOn()) { sec = 'cal'; S.settings.sec = 'cal'; view = 'day'; save(); window.scrollTo(0, 0); }
  sel = todayK(); secYM = ymOf(sel); monthAnchor = pd(sel); monthAnchor.setDate(1); syncMini(); lastGridView = null; render(2); }
// Кнопка «Создать» и клавиша N: в каждом разделе — своё
// На Главной, в Календаре и Задачах «Создать» открывает единую строку ввода
const createNew = () => useOmni() ? openOmni(sec) : sec === 'cal' || !SEC[sec].create ? openEvent() : SEC[sec].create();
function setTheme(t) { S.settings.theme = t; save(); render(); toast('Тема: ' + ({auto:'как в системе', light:'светлая', dark:'тёмная', black:'чёрная'})[t]); }

// ---- Тост и «Отменить» ----
const undoStack = [];
const UNDO_KEYS = ['events', 'cats', 'templates', 'habits', 'bio', 'fin', 'focus', 'ygoal', 'notes', 'goals'];
const snap = () => { const o = {}; UNDO_KEYS.forEach(k => { if (S[k] !== undefined) o[k] = S[k]; }); undoStack.push(JSON.stringify(o)); if (undoStack.length > 30) undoStack.shift(); };
function undo() {
  const s = undoStack.pop(); if (!s) return toast('Нечего отменять');
  Object.assign(S, JSON.parse(s)); save(); render(); toast('Действие отменено');
}
let toastTimer;
function toast(msg, withUndo) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${withUndo ? '<button data-act="undo">Отменить</button>' : ''}`;
  t.classList.add('show'); clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.classList.remove('show'); toastTimer = setTimeout(() => { t.textContent = ''; }, 250); }, withUndo ? 6000 : 2600);
}

// ---- Окна ----
// Окно с «Сохранить», в котором что-то вписали: свайп вниз, нажатие на фон, «Назад» и Esc сначала спрашивают «Закрыть без сохранения?»
// (аудит 18 октября 2026: смахнул карточку — набранное пропало). Крестик закрывает сразу — его нажали нарочно
const SH_SAVE = '[data-act="save"],[data-act="opsave"],[data-act="fcsave"],[data-act="hbsave"],[data-act="ntupd"],[data-act="qnsave"],[data-act="gsave"],[data-act="bmsave"],[data-act="fbsend"],[data-act="frsave"],[data-act="frnsave"]';
let shDirty = false;   // в окне что-то вписали или переключили (поля ввода, выбор, галочки)
['input', 'change'].forEach(t => document.addEventListener(t, e => { if (e.target.closest && e.target.closest('#sh') && e.target.id !== 'ai_text') shDirty = true; }, true));
const shUnsaved = () => shDirty && sheetOpen() && !!$('#sh').querySelector(SH_SAVE);
function shAsk() {
  let a = $('#shask');
  if (!a) { a = document.createElement('div'); a.id = 'shask'; a.setAttribute('role', 'alertdialog'); a.setAttribute('aria-label', 'Закрыть без сохранения?');
    a.innerHTML = '<span>Закрыть без сохранения?</span><button class="btn" data-act="shstay">Остаться</button><button class="btn pri" data-act="shdrop">Закрыть</button>'; document.body.appendChild(a); }
  a.classList.add('show'); a.querySelector('[data-act="shstay"]').focus();
}
function shAskHide() { const a = $('#shask'); if (!a || !a.classList.contains('show')) return; const back = a.contains(document.activeElement); a.classList.remove('show'); if (back && sheetOpen()) $('#sh').focus({ preventScroll:true }); }   // «Остаться» — фокус обратно в окно
const shAskOpen = () => { const a = $('#shask'); return !!(a && a.classList.contains('show')); };
function closeSheetAsk() { if (shAskOpen()) return shAskHide(); if (shUnsaved()) return shAsk(); closeSheet(); }   // вопрос уже открыт — Esc и фон его прячут
ACT.shstay = () => shAskHide();
ACT.shdrop = () => { shAskHide(); closeSheet(); };
document.addEventListener('pointerdown', e => { if (shAskOpen() && !(e.target.closest && e.target.closest('#shask'))) shAskHide(); }, true);   // продолжили писать — вопрос убирается
const sheet = (h, keep) => { tinvHide(); if (!keep) shDirty = false; shAskHide(); const sh = $('#sh'), top = sh.scrollTop, was = sheetOpen(), fk = was ? focSave() : null;   // плашка «Впервые здесь?» (tour.js) не висит поверх окна
 sh.innerHTML = '<span class="grab" aria-hidden="true"></span>' + h; $('#ov').classList.remove('ov-light'); $('#ov').classList.add('show'); sh.scrollTop = keep ? top : 0; shHistOpen();
 a11ySheet(was, fk); };   // js/a11y.js: заголовок для диктора, фон «заморожен», фокус внутрь окна
// fromBack — окно закрыто кнопкой «Назад»: шаг в истории уже сделан
const closeSheet = fromBack => { aiVoiceAbort(); shAskHide(); $('#ov').classList.remove('show', 'ov-light'); delAsk = null; palOpen = null; shareCtx = null; inbox = null; shHistClose(fromBack === true); a11yClose(); };
// «Назад» закрывает открытое окно (18 октября 2026: на Android «Назад» выходил из приложения, пока окно было открыто).
// Открылось окно — в истории шаг вперёд (один на все окна подряд); закрыли крестиком или «Сохранить» — сами делаем шаг назад
// и пропускаем его popstate (shBack). Пока этот шаг не дошёл, новое окно добавляет свой шаг — его закроет следующее «Назад».
let shHist = false, shBack = false;
function shHistOpen() { if (shHist) return; shHist = true; try { history.pushState({ psh: 1 }, ''); } catch (e) {} }
function shHistClose(fromBack) { if (!shHist) return; shHist = false; if (!fromBack) { shBack = true; try { history.back(); } catch (e) { shBack = false; } } }
addEventListener('popstate', () => {
  if (shBack) { shBack = false; return; }
  if (shHist && sheetOpen()) { shHist = false; if (shUnsaved()) { shHistOpen(); return shAsk(); } closeSheet(true); }   // вписано — окно остаётся, шаг в истории возвращаем
});
// Свайп вниз закрывает окно на телефоне (полоска сверху — за неё и тянут; можно и за любое место, пока окно прокручено к началу).
// Не мешает: полям ввода, карте, ленте чата и рядам, которые листаются вбок
{ const sh = $('#sh'); let d = null;
  sh.addEventListener('touchstart', e => {
    d = null; if (innerWidth >= 900 || e.touches.length !== 1 || sh.scrollTop > 0) return;
    if (e.target.closest('input, textarea, select, [contenteditable], .f-map, .ai-chat, .leaflet-container')) return;
    d = { y: e.touches[0].clientY, x: e.touches[0].clientX, t: Date.now(), dy: 0, on: false };
  }, { passive: true });
  sh.addEventListener('touchmove', e => {
    if (!d) return;
    const dy = e.touches[0].clientY - d.y, dx = e.touches[0].clientX - d.x;
    if (!d.on) { if (dy > 10 && dy > Math.abs(dx) * 1.5 && sh.scrollTop <= 0) d.on = true; else if (dy < -4 || Math.abs(dx) > 12) { d = null; return; } else return; }
    e.preventDefault(); d.dy = Math.max(0, dy - 10); sh.style.transition = 'none'; sh.style.transform = `translateY(${d.dy}px)`;
  }, { passive: false });
  const end = () => {
    if (!d) return; const x = d; d = null; if (!x.on) return;
    sh.style.transition = 'transform .2s cubic-bezier(.2,.8,.2,1)';
    const far = x.dy > 110 || (x.dy > 50 && Date.now() - x.t < 280);   // дотянули или смахнули быстро
    if (far && shUnsaved()) { sh.style.transform = ''; setTimeout(() => { sh.style.transition = ''; }, 210); shAsk(); }   // вписано — окно возвращается и спрашивает
    else if (far) {   // закрыть
      sh.style.transform = 'translateY(100%)';
      setTimeout(() => { closeSheet(); sh.style.transition = sh.style.transform = ''; }, 190);
    } else { sh.style.transform = ''; setTimeout(() => { sh.style.transition = ''; }, 210); }
  };
  sh.addEventListener('touchend', end); sh.addEventListener('touchcancel', end); }
const sheetOpen = () => $('#ov').classList.contains('show');
const catChips = (selId, act) => S.cats.map(c => `<button type="button" class="ccat${c.id===selId?' on':''}" data-act="${act}" data-id="${c.id}" style="--c:${c.color}"><i></i>${esc(c.name)}</button>`).join('');

function openQuick(date, time, x, y, time2) {
  const t2 = time2 || (time ? fmtMin(Math.min(1439, timeMin(time) + 60)) : '');
  window._qc = { date, base:date, t1:time || '', t2, cat: validCat(), nl:null };
  const qc = $('#qc');
  qc.innerHTML = `<div class="qhead"><b id="q_when">${esc(fmtLong(date))}</b><button class="qx" data-act="qclose" aria-label="Закрыть">${I(IC.x,15)}</button></div>
  <input id="q_t" class="fin" type="text" placeholder="Например: созвон завтра в 15 на час" autocomplete="off">
  <div id="q_hint" class="nlhint"></div>
  <div class="qrow"><input id="q_tm" class="fin" type="time" value="${time||''}" aria-label="Начало"><span class="dash">–</span><input id="q_tm2" class="fin" type="time" value="${t2}" aria-label="Конец"></div>
  <div class="ccats" id="q_cats">${catChips(window._qc.cat, 'qcat')}</div>
  <div class="qbtns"><button class="btn pri" data-act="qsave">Создать</button><button class="btn" data-act="qfull">Подробнее</button></div>`;
  qc.classList.add('show');
  if (innerWidth < 900) { qc.style.top = ($('header').getBoundingClientRect().bottom + 8) + 'px'; qc.style.left = '8px'; }
  else {
    const w = 310, h = qc.offsetHeight || 230;
    qc.style.left = Math.max(8, Math.min(x + 12, innerWidth - w - 12)) + 'px';
    qc.style.top = Math.max(8, Math.min(y - 20, innerHeight - h - 12)) + 'px';
  }
  setTimeout(() => $('#q_t') && $('#q_t').focus(), 30);
}
const closeQuick = () => { const q = $('#qc'), h = $('.hdr-ava'); if (q) q.classList.remove('show', 'menu', 'acc'); if (h) h.setAttribute('aria-expanded', 'false'); $$('.wg-ghost').forEach(g => g.remove()); };
const quickOpen = () => $('#qc').classList.contains('show');

function nlHint(p, id) {
  const el = $(id); if (!el) return;
  el.innerHTML = p && p.found ? `${I(IC.spark,13)} Распознано: <b>${esc(p.desc)}</b>` : '';
}

function openEvent(id, preset, instDate) {
  closeQuick(); mapDrop();
  const p = preset || {};
  const src = id ? S.events.find(x => x.id === id) : null;
  if (id && !src) return;
  const e = src || { title:p.title||'', date:p.date||sel, time:p.time||'', time2:p.time2||'', cat:validCat(p.cat), note:'', loc:'', repeat:{type:'none'}, reminder:{enabled:false, offset:15, repeat:'none', days:[]}, task: !!p.task, prio: p.prio || 'mid' };
  const rep = e.repeat || {type:'none'};
  window._fe = { rems: new Set(remOffs(e)), id, cat: validCat(e.cat), days: new Set(rep.days && rep.days.length ? rep.days : [dowIdx(e.date)]), inst: instDate || e.date, nl:null, nlOff: !!id, daysTouched: !!(rep.days && rep.days.length), prio: PRIO[e.prio] ? e.prio : 'mid', geo: geoOk(e.geo) ? [e.geo[0], e.geo[1]] : null, memUsed: '', base: e.date };
  const rec = isRec(e);
  sheet(`<div class="sh-head"><h3>${id ? 'Событие' : 'Новое событие'}</h3>
    ${id ? `<button class="ic" data-act="shareev" title="Поделиться" aria-label="Поделиться">${I(IC.share,17)}</button><button class="ic" data-act="dup" title="Дублировать" aria-label="Дублировать">${I(IC.copy,17)}</button><button class="ic" data-act="del" title="Удалить" aria-label="Удалить" style="color:var(--dng)">${I(IC.trash,17)}</button>` : ''}
    <button class="ic" data-act="close" title="Закрыть (Esc)" aria-label="Закрыть">${I(IC.x,18)}</button></div>
  <input id="f_t" class="f-title" placeholder="Название" value="${esc(e.title)}" autocomplete="off">
  <div id="f_hint" class="nlhint" style="margin:-2px 0 8px"></div>
  ${id ? '' : '<div id="f_mem" class="f-mem" hidden></div>'}
  ${rec ? `<div class="f-rec">${I(IC.rep,14)} ${esc(repText(e))} · изменения применятся ко всем повторениям</div>` : ''}
  <div class="frow"><span class="fl">Дата</span><input id="f_d" class="fin" type="date" value="${e.date}"></div>
  <div class="frow"><span class="fl">Время</span><div><div class="ftime${e.time?'':' off'}"><input id="f_tm" class="fin" type="time" value="${e.time||''}" aria-label="Начало"><span class="dash">–</span><input id="f_tm2" class="fin" type="time" value="${e.time2||''}" aria-label="Конец"></div>
    <label class="swl"><input id="f_all" class="sw" type="checkbox"${e.time?'':' checked'}> Весь день / без времени</label></div></div>
  <div class="frow"><span class="fl">Повтор</span><div><select id="f_rep" class="fin">${Object.entries(REP).map(([k,v]) => `<option value="${k}"${rep.type===k?' selected':''}>${v}</option>`).join('')}</select>
    <div id="f_repx" style="display:${rep.type && rep.type!=='none'?'block':'none'}">
      <div id="f_days" class="chips" style="display:${rep.type==='weekly'?'flex':'none'}">${DOW.map((d,i) => `<button type="button" class="chip${window._fe.days.has(i)?' on':''}" data-act="repday" data-d="${i}">${d}</button>`).join('')}</div>
      <div class="until">до <input id="f_until" class="fin" type="date" value="${rep.until||''}" aria-label="Повторять до"></div></div></div></div>
  <div class="frow"><span class="fl">Календарь</span><div class="ccats" id="f_cats">${catChips(window._fe.cat, 'fcat')}</div></div>
  <div class="frow"><span class="fl">Задача</span><div><div class="f-hrow" style="margin-top:9px"><label class="swl" style="margin-top:0"><input id="f_task" class="sw" type="checkbox"${e.task?' checked':''}> Показывать в «Задачах»</label>${hintK('task')}</div>
    <div id="f_prio" class="chips" style="display:${e.task?'flex':'none'}">${PRIO_ORDER.map(k => `<button type="button" class="chip prio${window._fe.prio===k?' on':''}" data-act="fprio" data-p="${k}" style="--c:${PRIO[k].c}">${PRIO[k].n}</button>`).join('')}</div></div></div>
  <div class="frow"><span class="fl">Напомнить</span><div><div class="f-hrow f-remh"><span id="f_remsum" class="f-remsum">${remSum(window._fe.rems)}</span>${hintK('remind')}</div>
    <div id="f_rems" class="chips">${remChips(window._fe.rems)}</div><div id="f_remwarn">${remWarnHTML()}</div></div></div>
  <div class="frow"><span class="fl">Место</span><div><div class="f-locrow"><input id="f_loc" class="fin" type="text" value="${esc(e.loc||'')}" placeholder="Адрес или ссылка" autocomplete="off"><button type="button" id="f_mapb" class="f-mapb${window._fe.geo ? ' on' : ''}" data-act="fmap" title="Точка на карте" aria-label="Точка на карте" aria-expanded="false">${I(IC.pin, 18)}</button></div>
    <div id="f_map" class="f-map" hidden></div><div id="f_mapbar" class="f-mapbar" hidden></div></div></div>
  <div class="frow"><span class="fl">Заметка</span><textarea id="f_n" class="fin" placeholder="Подробности">${esc(e.note||'')}</textarea></div>
  <div class="sh-foot"><button class="btn pri grow" data-act="save">Сохранить</button><button class="btn" data-act="savetpl" title="Сохранить как шаблон">${I(IC.tpl,16)} В шаблоны</button></div>
  <div id="f_ask"></div>`);
  mapBar();
  if (!id) setTimeout(() => $('#f_t') && $('#f_t').focus(), 60);
}

// ---- Память событий (правка бета-тестеров 17 октября 2026): в новом событии под названием — прошлые события с тем же началом
// названия и их сводка; нажатие подставляет время и длительность, календарь, задачу и важность, напоминания, место с точкой на карте
// и заметку. Дата и повтор остаются свои; время, написанное в самом названии («…завтра в 10»), важнее прошлого раза ----
const memKey = s => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
function evMemList(q) {
  const k = memKey(q); if (k.length < 2) return [];
  const t = todayK(), seen = new Set(), out = [];
  // Сначала последнее прошедшее, потом ближайшее будущее; одно название — одна строка, не больше трёх
  const L = S.events.filter(e => e.title && memKey(e.title).startsWith(k))
    .sort((a, b) => (a.date <= t) !== (b.date <= t) ? (a.date <= t ? -1 : 1) : a.date <= t ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date));
  for (const e of L) { const n = memKey(e.title); if (seen.has(n)) continue; seen.add(n); out.push(e); if (out.length === 3) break; }
  return out;
}
const memSum = e => { const c = S.cats.find(x => x.id === e.cat), r = remOffs(e);
  return [shortDate(e.date) + (e.time ? ', ' + e.time + (e.time2 ? '–' + e.time2 : '') : ''), e.loc ? '📍 ' + e.loc : geoOk(e.geo) ? '📍 точка на карте' : '', c ? c.name : '', r.length ? '🔔 ' + r.map(remShort).join(', ') : '']
    .filter(Boolean).map(esc).join(' · '); };
function evMemShow() {
  const box = $('#f_mem'), fe = window._fe; if (!box || !fe || fe.id) return;
  const raw = $('#f_t').value, p = parseNL(raw, fe.base || sel), q = p.found && p.title ? p.title : raw, L = evMemList(q);
  box.hidden = !L.length || fe.memUsed === memKey(q);   // уже подставили это название — не мешаем
  box.innerHTML = L.length ? `<small class="f-memh">Было раньше — нажмите, чтобы взять всё оттуда</small>` + L.map(e => `<button type="button" class="f-memi" data-act="fmem" data-id="${e.id}">${I(IC.rep, 15)}<span><b>${esc(e.title)}</b><small>${memSum(e)}</small></span></button>`).join('') : '';
}
document.addEventListener('input', e => { if (e.target.id === 'f_t') evMemShow(); });
ACT.fmem = el => {
  const s = S.events.find(x => x.id === el.dataset.id), fe = window._fe; if (!s || !fe || !$('#f_t')) return;
  const typed = fe.nl && fe.nl.found && fe.nl.time;
  $('#f_t').value = s.title; fe.nl = null; fe.memUsed = memKey(s.title); nlHint(null, '#f_hint');
  if (!typed) { const all = !s.time; $('#f_all').checked = all; $('.ftime').classList.toggle('off', all);
    $('#f_tm').value = s.time || ''; $('#f_tm2').value = s.time ? (s.time2 || fmtMin(Math.min(1439, timeMin(s.time) + 60))) : ''; }
  fe.cat = validCat(s.cat); $$('#f_cats .ccat').forEach(b => b.classList.toggle('on', b.dataset.id === fe.cat));
  $('#f_task').checked = !!s.task; $('#f_prio').style.display = s.task ? 'flex' : 'none';
  fe.prio = PRIO[s.prio] ? s.prio : 'mid'; $$('#f_prio .chip').forEach(b => b.classList.toggle('on', b.dataset.p === fe.prio));
  fe.rems = new Set(remOffs(s)); $('#f_rems').innerHTML = remChips(fe.rems); $('#f_remsum').textContent = remSum(fe.rems); remWarn();
  $('#f_loc').value = s.loc || ''; $('#f_n').value = s.note || '';
  fe.geo = geoOk(s.geo) ? [s.geo[0], s.geo[1]] : null; mapSync();
  $('#f_mem').hidden = true;
  toast('Взято из события ' + shortDate(s.date) + (typed ? ' — время оставил ваше' : ''));
};

// ---- Напоминания в карточке события: можно выбрать несколько («за 1 день», «за 1 час», «за 15 минут») ----
const REM_OPT = [0, 5, 10, 15, 30, 60, 120, 1440, 10080];
const remChipName = v => v === 0 ? 'В момент' : v < 60 ? v + ' мин' : v < 1440 ? plural(v / 60, ['час', 'часа', 'часов']) : v === 10080 ? 'Неделя' : plural(v / 1440, ['день', 'дня', 'дней']);
const remWord = v => v === 0 ? 'в момент начала' : 'за ' + (v < 60 ? plural(v, ['минуту', 'минуты', 'минут']) : v < 1440 ? plural(v / 60, ['час', 'часа', 'часов']) : v === 10080 ? 'неделю' : plural(v / 1440, ['день', 'дня', 'дней'])).replace(/^1 /, '');
const remSum = set => { const l = [...set].sort((a, b) => b - a).map(remWord); return l.length ? 'Напомню ' + (l.length > 1 ? l.slice(0, -1).join(', ') + ' и ' + l[l.length - 1] : l[0]) : 'Не напоминать — выберите, когда'; };
// Свои (старые) значения, которых нет в списке, тоже показываем кнопками
const remChips = set => [...new Set([...REM_OPT, ...set])].sort((a, b) => a - b).map(v => `<button type="button" class="chip${set.has(v) ? ' on' : ''}" data-act="remchip" data-v="${v}" aria-pressed="${set.has(v)}">${remChipName(v)}</button>`).join('');
ACT.remchip = el => { const fe = window._fe; if (!fe) return; const v = Number(el.dataset.v); fe.rems.has(v) ? fe.rems.delete(v) : fe.rems.add(v);
  el.classList.toggle('on', fe.rems.has(v)); el.setAttribute('aria-pressed', fe.rems.has(v)); const s = $('#f_remsum'); if (s) s.textContent = remSum(fe.rems); remWarn(); };
// Напоминание выбрано, а уведомления на этом устройстве не включены — сказать сразу, в карточке (18 октября 2026: человек ставил
// «за час», а уведомление не приходило). «Включить» — только там, где включить можно прямо здесь; иначе — причина (нужен вход,
// приложение с «Домой» на iPhone, запрещены в настройках телефона). Окно при этом не закрывается — набранное не пропадает
function remWarnHTML() {
  const fe = window._fe; if (!fe || !fe.rems.size || notif.on) return '';
  const can = signedIn() && pushSupported() && !(isIOS && navigator.standalone !== true) && Notification.permission !== 'denied';
  return `<div class="f-remwarn">${I(IC.alert, 15)}<span>${can ? 'На этом устройстве напоминания выключены — без этого уведомление не придёт.' : esc(notif.text) + '.'}</span>${can ? '<button type="button" class="pill sm" data-act="remnudge">Включить</button>' : ''}</div>`;
}
const remWarn = () => { const w = $('#f_remwarn'); if (w) w.innerHTML = remWarnHTML(); };
ACT.remnudge = async () => { await enablePush(); await checkNotif(); remWarn(); };

const PALETTE = ['#ef4444','#f97316','#f59e0b','#eab308','#22c55e','#14b8a6','#38bdf8','#3b82f6','#6366f1','#a855f7','#ec4899','#64748b'];

let palOpen = null, delAsk = null;
// Настройки — отдельная страница (SEC.settings в js/pages.js); здесь только переход и блоки для неё
function openSettings() { if (sec !== 'settings') setSec('settings'); else render(); }
function settingsBlocks() {
  const st = S.settings;
  return {
  look: lookHTML(),   // js/look.js
  cal: `<div class="set-sec">Календарь</div>
  <div class="lk-row"><div class="lk-h">Размер сетки${hintK('density')}</div><div class="seg2 lk-seg">${[['compact','Компактно'],['normal','Обычно'],['large','Крупно']].map(([v,n]) => `<button class="${st.density===v?'on':''}" data-act="density" data-v="${v}">${n}</button>`).join('')}</div></div>
  <div class="set-row"><span>День в сетке начинается с</span><select id="s_ds" class="fin" style="min-width:90px">${[...Array(13)].map((_,h) => `<option value="${h}"${startH()===h?' selected':''}>${String(h).padStart(2,'0')}:00</option>`).join('')}</select></div>
  <div class="set-row"><span>Неделя начинается с</span><select id="s_ws" class="fin"><option value="1"${st.weekStart===1?' selected':''}>Понедельника</option><option value="0"${st.weekStart===0?' selected':''}>Воскресенья</option></select></div>
  <div class="set-row"><span>Показывать выходные в неделе</span><input id="s_wk" class="sw" type="checkbox"${st.weekends?' checked':''}></div>
  <div class="set-row"><span>${withHint('Номер недели', 'weekNums')}</span><input id="s_wn" class="sw" type="checkbox"${st.weekNums?' checked':''}></div>
  <div class="set-row"><span>${withHint('Приглушать прошедшие события', 'dimPast')}</span><input id="s_dim" class="sw" type="checkbox"${st.dimPast?' checked':''}></div>
  <div class="set-row"><span>${withHint('Сворачивать пустые часы в неделе', 'fold')}</span><input id="s_fold" class="sw" type="checkbox"${st.fold !== false?' checked':''}></div>
  ${innerWidth >= 900 ? `<div class="set-row"><span>Горячие клавиши одной буквой <small class="set-note" style="display:block;margin:2px 0 0">N, T, M, W, D, L, «/» — выключите, если они срабатывают случайно. Ctrl+K работает всегда</small></span><input id="s_keys1" class="sw" type="checkbox"${st.keys1 !== false ? ' checked' : ''}></div>` : ''}`,
  cats: `<div class="set-sec">Календари (категории)</div>
  <div class="catlist">${S.cats.map(c => delAsk === c.id ? `<div class="catedit ask2">
    <span class="cswatch" style="--c:${c.color}"></span><span class="askt">Удалить «${esc(c.name)}»?</span>
    <button class="askyes" data-act="delyes" data-id="${c.id}">Удалить</button><button class="askno" data-act="delno">Отмена</button></div>` : `<div class="catedit">
    <button class="cswatch" data-act="catpal" data-id="${c.id}" style="--c:${c.color}" aria-label="Выбрать цвет"></button>
    <input class="cname" data-cat="${c.id}" data-f="name" value="${esc(c.name)}" placeholder="Название">
    <button class="cshare" data-act="sharecat" data-id="${c.id}" aria-label="Поделиться календарём" title="Поделиться">${I(IC.share,17)}</button>
    <button class="cdel" data-act="delcat" data-id="${c.id}" aria-label="Удалить категорию"${S.cats.length <= 1 ? ' disabled title="Нужна хотя бы одна категория"' : ''}>${I(IC.trash)}</button></div>
    ${palOpen === c.id ? `<div class="cpal">${PALETTE.map(col => `<button class="cdot${col.toLowerCase() === c.color.toLowerCase() ? ' on' : ''}" data-act="setcolor" data-id="${c.id}" data-c="${col}" style="--c:${col}" aria-label="${col}"></button>`).join('')}<label class="cdot custom" title="Свой цвет"><input type="color" data-cat="${c.id}" data-f="color" value="${c.color}"></label></div>` : ''}`).join('')}</div>
  <button class="addcat" data-act="addcat">+ Добавить категорию</button>
  <button class="btn" style="width:100%;margin-top:8px" data-act="shareall">${I(IC.share,16)} Поделиться всем календарём</button>`,
  notif: `<div class="set-sec">Напоминания</div>
  <div class="nstat"><i class="ndot ${notif.state}"></i><span id="nstat_t">${esc(notif.text)}</span></div>
  <div style="display:flex;gap:8px;flex-wrap:wrap">${!signedIn() ? `<button class="btn pri grow" data-act="login">${I(IC.user,16)} Войти</button>`
    : notif.on ? `<button class="btn pri grow" data-act="ntest">${I(IC.bell,16)} Проверить</button><button class="btn grow" data-act="pushoff">Выключить здесь</button>`
    : `<button class="btn pri grow" data-act="push">${I(IC.bell,16)} Включить напоминания</button>`}</div>
  ${notif.on ? digestHTML() : ''}
  <p class="set-note">Напоминание приходит в выбранное время — «за час», «за 15 минут» и т. п. задаются в карточке события. Для дел без времени — от 9:00. Включите на каждом устройстве, где хотите их получать${isIOS ? '; на iPhone — в приложении с экрана «Домой»' : ''}.${st.lastTest ? ' Последняя проверка: ' + new Date(st.lastTest).toLocaleString('ru-RU', {day:'numeric', month:'long', hour:'2-digit', minute:'2-digit'}) + '.' : ''}</p>
  <div id="plog"></div>`,
  data: `<div class="set-sec">Аккаунт и данные</div>
  ${accountHTML()}
  <div class="set-sub">Копия в файл — на всякий случай</div>
  <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn grow" data-act="export">${I(IC.down,16)} Скачать копию</button><button class="btn grow" data-act="import">${I(IC.up,16)} Загрузить из файла</button></div>
  <p class="set-note">Копия — файл со всеми записями. Его можно загрузить обратно или на другом устройстве.</p>`,
  };
}

function openHelp() {
  const rows = [['Командное меню и поиск','Ctrl K  или  /'],['Новое событие','N'],['Сегодня','T'],['Месяц / Неделя / День / Список','M  W  D  L'],['Назад / вперёд','←  →'],['Отменить последнее действие','Ctrl Z'],['Сохранить карточку','Ctrl Enter'],['Закрыть окно','Esc'],['Эта подсказка','?']];
  sheet(`<div class="sh-head"><h3>Горячие клавиши</h3><button class="ic" data-act="close" aria-label="Закрыть">${I(IC.x,18)}</button></div>
  <table class="help">${rows.map(([a,b]) => `<tr><td>${a}</td><td>${b.split('  ').map(x => x.split(' ').map(k => `<kbd>${k}</kbd>`).join(' ')).join(' <span style="color:var(--mut)">или</span> ')}</td></tr>`).join('').replace(/<kbd>или<\/kbd>/g,'или')}</table>
  <p class="set-note" style="margin-top:14px">Клавиши работают в любой раскладке. Мышью можно протянуть по сетке недели — так сразу задаётся время начала и конца. События перетаскиваются и растягиваются за нижний край.</p>
  <p class="set-note">В названии можно писать по-русски: «встреча завтра в 15:30 на час #работа», «в пятницу с 10 до 12 спорт», «через 2 часа позвонить».</p>`);
}

// ---- Командное меню ----
let cmdItems = [], cmdIdx = 0;
const cmdOpen = () => $('#cmd').classList.contains('show');
function openCmd() { closeQuick(); a11yOpen(); $('#cmd_ic').innerHTML = I(IC.search, 19); $('#cmd').classList.add('show'); $('#cmd_q').value = '';
  $('#cmd_q').placeholder = innerWidth < 900 ? 'Найти дело, трату, заметку…' : 'Найти дело, трату, заметку, привычку, цель или команду'; cmdUpdate(); setTimeout(() => $('#cmd_q').focus(), 20); }
const closeCmd = () => { if (!cmdOpen()) return; $('#cmd').classList.remove('show'); a11yClose(); };
const COMMANDS = () => [
  { ic:IC.plus, t:'Новое событие', run:() => openEvent() },
  { ic:IC.tasks, t:'Новая задача', run:() => newTask() },
  { ic:IC.habit, t:'Новая привычка', run:() => openHabit() },
  { ic:IC.wallet, t:'Записать расход или доход', run:() => openOp() },
  ...navSecs().map(s => ({ ic:SEC[s].icon, t:(s === 'home' ? '' : 'Раздел: ') + SEC[s].name, run:() => setSec(s) })),
  ...(missedList().length ? [{ ic:IC.alert, t:'Вы пропустили: разобрать', run:() => { missMove = null; openMissed(); } }] : []),
  { ic:IC.cal, t:'Перейти к сегодня', k:'T', run:goToday },
  { ic:IC.cal, t:'Вид: месяц', k:'M', run:() => setView('month') },
  { ic:IC.cal, t:'Вид: неделя', k:'W', run:() => setView('week') },
  { ic:IC.day, t:'Вид: день', k:'D', run:() => setView('day') },
  { ic:IC.list, t:'Вид: список', k:'L', run:() => setView('list') },
  { ic:IC.sun, t:'Тема: светлая', run:() => setTheme('light') },
  { ic:IC.moon, t:'Тема: тёмная', run:() => setTheme('dark') },
  { ic:IC.moon, t:'Тема: чёрная', run:() => setTheme('black') },
  { ic:IC.spark, t:'Тема: как в системе', run:() => setTheme('auto') },
  { ic:IC.bell, t:'Проверить уведомление', run:testNotif },
  { ic:IC.gear, t:'Настройки', run:() => openSettings() },
  { ic:IC.user, t:'Профиль', run:() => setSec('profile') },
  { ic:IC.key, t:'Горячие клавиши', k:'?', run:openHelp },
  { ic:IC.msg, t:'Написать отзыв', run:() => { fb = null; openFeedback(); } },
  { ic:IC.spark, t:'Помощник: чат — добавить записи, спросить о делах и деньгах', run:() => openAI() },
  { ic:IC.down, t:'Скачать резервную копию', run:exportData },
  { ic:IC.share, t:'Поделиться всем календарём', run:() => openShare({ kind:'a' }) },
  ...S.cats.map(c => ({ ic:IC.share, t:`Поделиться календарём «${c.name}»`, run:() => openShare({ kind:'c', id:c.id }) })),
  { ic:IC.undo, t:'Отменить последнее действие', k:'Ctrl Z', run:undo },
];
// ---- Общий поиск (19 октября 2026): задачи, события, деньги, заметки, привычки, цели ----
// Каждое слово запроса укорачивается до основы («стоматолога» → «стоматолог», «такси» → «такс»); запись подходит, если в ней есть все основы.
// Выключенный раздел (Финансы, Привычки, Задачи — цели) в поиске не показывается, как и везде
const SR_END = /(иями|ями|ами|ого|его|ому|ему|ыми|ими|иях|ах|ях|ам|ям|ов|ев|ей|ой|ий|ый|ая|яя|ое|ее|ую|юю|ом|ем|ия|ие|ию|а|я|о|е|ы|и|у|ю|ь|й)$/;
const srNorm = s => String(s || '').toLowerCase().replace(/ё/g, 'е');
const srStems = q => srNorm(q).split(/[^\p{L}\p{N}]+/u).filter(Boolean).map(w => { if (w.length < 5) return w; const s = w.replace(SR_END, ''); return s.length >= 4 ? s : w.slice(0, 4); });
// Где в тексте слово, начинающееся с основы (только с начала слова: «спорт» не находит «транспорт»); −1 — нет
const SR_L = /[\p{L}\p{N}]/u;
function srAt(n, s) { for (let i = n.indexOf(s); i >= 0; i = n.indexOf(s, i + 1)) if (!i || !SR_L.test(n[i - 1])) return i; return -1; }
const srIn = (text, s) => srAt(srNorm(text), s) >= 0;
// 0 — не подходит; 3 — название начинается с запроса; 2 — все слова в названии; 1 — нашлось в заметке, месте, категории
function srScore(title, rest, st) {
  const t = srNorm(title), r = srNorm(rest), inT = st.every(s => srAt(t, s) >= 0); if (!inT && !st.every(s => srAt(t, s) >= 0 || srAt(r, s) >= 0)) return 0;
  return !inT ? 1 : t.startsWith(st[0]) ? 3 : 2;
}
// Найденное в тексте — подсвечено (<mark>); остальное экранировано
function srHL(text, st) {
  const t = String(text || ''), n = srNorm(t); if (n.length !== t.length) return esc(t);
  const on = new Array(t.length).fill(false);
  st.forEach(s => { const i = srAt(n, s); if (i >= 0) for (let j = i; j < i + s.length; j++) on[j] = true; });
  let h = '', m = false;
  for (let i = 0; i < t.length; i++) { if (on[i] !== m) { h += m ? '</mark>' : '<mark>'; m = on[i]; } h += esc(t[i]); }
  return h + (m ? '</mark>' : '');
}
// Кусок длинной заметки с первым найденным словом
function srSnip(text, st) {
  const t = String(text || '').replace(/\s+/g, ' ').trim(), n = srNorm(t);
  const i = st.reduce((a, s) => { const x = srAt(n, s); return x >= 0 && (a < 0 || x < a) ? x : a; }, -1);
  const j = i > 40 ? t.indexOf(' ', i - 25) + 1 : 0;   // с начала слова, а не с середины
  return (j > 0 && j <= i ? '…' + t.slice(j) : t).slice(0, 160);
}
const SR_ORDER = ['Задачи', 'События', 'Деньги', 'Заметки', 'Привычки', 'Цели'], SR_MAX = { 'Задачи':6, 'События':6, 'Деньги':6, 'Заметки':4, 'Привычки':4, 'Цели':4 };
let srMore = {}, srQ = '';   // группы, раскрытые «Ещё N», — до нового запроса
const srEvOpen = (e, k) => () => { sel = k; syncMini(); monthAnchor = pd(k); monthAnchor.setDate(1); render(); openEvent(e.id, null, k); };
function srFind(q) {
  const st = srStems(q), g = {}, add = (sec, sc, it) => (g[sec] = g[sec] || []).push(Object.assign({ sec, sc, rec:1 }, it)), t0 = todayK();
  if (!st.length) return [];
  S.events.forEach(e => {
    const c = cat(e.cat), sc = srScore(e.title, (e.loc || '') + ' ' + (e.note || '') + ' ' + c.name, st); if (!sc) return;
    const k = nextOcc(e), gl = e.goal && secOn('tasks') && goalById(e.goal), inT = sc > 1, inL = !inT && st.every(s => srIn(e.title + ' ' + (e.loc || ''), s));
    const s = relDay(k) + (e.time ? ', ' + e.time : '') + (isRec(e) ? ' ↻' : '') + (e.task && isDone(e, k) ? ' · сделано' : '')
      + (gl ? ' · цель «' + gl.title + '»' : '') + (inT ? '' : inL && e.loc ? ' · ' + e.loc : srIn(e.note, st[0]) ? ' · в заметке' : ' · ' + c.name);
    add(e.task ? 'Задачи' : 'События', sc, { c:c.color, h:srHL(e.title, st), t:e.title, s, d:Math.abs(dayDiff(t0, k)) + (k < t0 ? .5 : 0), run:srEvOpen(e, k) });
  });
  if (secOn('fin')) S.fin.ops.forEach(o => {
    const c = fcat(o.cat), title = o.note || c.name, sc = srScore(title, (o.note ? c.name : '') + ' ' + o.amt, st); if (!sc) return;
    add('Деньги', sc, { em:c.emoji || '•', h:srHL(title, st), t:title, s:shortDate(o.date) + (o.date.slice(0, 4) !== t0.slice(0, 4) ? ' ' + o.date.slice(0, 4) : '') + (o.note ? ' · ' + c.name : ''),
      r:(c.g === 'inc' ? '+' : '') + rub0(o.amt), d:-o.date.replace(/-/g, ''), run:() => openOp(o.id) });
  });
  (S.notes || []).forEach(n => { const sc = srScore(n.text, '', st); if (sc) { const sn = srSnip(n.text, st); add('Заметки', sc > 1 ? 2 : 1, { ic:IC.note, h:srHL(sn, st), t:sn, s:relDay(n.date), d:-n.date.replace(/-/g, ''), run:() => openNote(n.id) }); } });
  if (secOn('habits')) S.habits.forEach(h => {
    const sc = srScore(h.name, '', st); if (!sc) return;
    add('Привычки', sc, { em:h.emoji || '•', h:srHL(h.name, st), t:h.name, s: h.kind === 'weekly' ? 'раз в неделю' : h.kind === 'monthly' ? 'раз в месяц' : h.days.length ? [...h.days].sort().map(d => DOW[d].toLowerCase()).join(', ') : 'каждый день', d:0, run:() => openHabit(h.id) });
  });
  if (secOn('tasks')) S.goals.forEach(gl => {
    const sc = srScore(gl.title, gl.why || '', st), due = 'до ' + shortDate(gl.due) + (gl.due.slice(0, 4) !== t0.slice(0, 4) ? ' ' + gl.due.slice(0, 4) : '') + (gl.done ? ' · достигнута' : '');
    if (sc) add('Цели', sc, { em:gl.emoji || '🎯', h:srHL(gl.title, st), t:gl.title, s:due, d:gl.done ? 1e9 : dayDiff(t0, gl.due), run:() => openGoal(gl.id) });
    (gl.steps || []).forEach(x => { const s2 = srScore(x.t, '', st); if (s2) add('Цели', s2 - .5, { ic:IC.goal, h:srHL(x.t, st), t:x.t, s:'шаг цели «' + gl.title + '»' + (x.done ? ' · сделан' : ''), d:gl.done ? 1e9 : dayDiff(t0, gl.due), run:() => openGoal(gl.id) }); });
  });
  // группы — по лучшему совпадению, внутри — сначала точнее, потом ближе к сегодня / новее
  const out = [];
  Object.keys(g).sort((a, b) => Math.max(...g[b].map(x => x.sc)) - Math.max(...g[a].map(x => x.sc)) || SR_ORDER.indexOf(a) - SR_ORDER.indexOf(b)).forEach(sec => {
    const l = g[sec].sort((a, b) => b.sc - a.sc || a.d - b.d), n = srMore[sec] ? l.length : SR_MAX[sec];
    out.push(...l.slice(0, n));
    if (l.length > n) out.push({ sec, ic:IC.more, t:'Ещё ' + (l.length - n), keep:1, run:() => { srMore[sec] = 1; cmdUpdate(cmdIdx); } });   // выбор остаётся на месте — там первая из раскрытых записей
  });
  return out;
}
function cmdUpdate(keepIdx) {
  const q = $('#cmd_q').value.trim(), ql = q.toLowerCase(), items = [];
  if (q !== srQ) { srQ = q; srMore = {}; }
  if (frCode(q)) items.push({ sec:'Присланное', ic:IC.users, t:'Открыть приглашение в друзья', s:'ссылка от друга', run:() => frOpenCode(frCode(q)) });
  if (shareCode(q)) items.push({ sec:'Присланное', ic:IC.link, t:'Открыть присланную ссылку', s:'событие или календарь', run:() => openShareCode(shareCode(q)) });
  else if (q) {
    const p = parseNL(q, sel), found = srFind(q);
    // с датой или временем («врач завтра в 10») сначала «Создать», иначе сначала найденное
    const mk = p.title ? { sec:'Создать', ic:IC.plus, t:`Создать «${p.title}»`, s: p.found ? p.desc : relDay(sel), run:() => quickCreate(p.title, p.date || sel, p.time || '', p.time2 || '', p.cat) } : null;
    if (mk && p.found) items.push(mk);
    items.push(...found);
    COMMANDS().filter(c => c.t.toLowerCase().includes(ql)).forEach(c => items.push(Object.assign({ sec:'Команды' }, c)));
    if (mk && !p.found) items.push(mk);
  } else {
    const up = []; for (let i = 0; i < 14 && up.length < 5; i++) { const k = addDays(todayK(), i); evOn(k).forEach(e => { if (up.length < 5 && !e.done && (i > 0 || !e.time || (timeMin(e.time2 || e.time) || 0) >= nowMin())) up.push({ e, k }); }); }
    up.forEach(({ e, k }) => items.push({ sec:'Ближайшие', c:cat(e.cat).color, t:e.title, s: relDay(k) + (e.time ? ', ' + e.time : ''), run:() => { sel = k; syncMini(); render(); openEvent(e.id, null, k); } }));
    COMMANDS().forEach(c => items.push(Object.assign({ sec:'Команды' }, c)));
  }
  cmdItems = items; cmdIdx = keepIdx > 0 ? Math.min(keepIdx, items.length - 1) : 0; cmdDraw();
}
function cmdDraw() {
  let h = '', last = '';
  cmdItems.forEach((it, i) => {
    if (it.sec !== last) { h += `<div class="cmd-sec" aria-hidden="true">${it.sec}</div>`; last = it.sec; }
    const ic = it.c ? `<span class="cd" style="--c:${it.c}"></span>` : it.em ? `<span class="ci em">${esc(it.em)}</span>` : `<span class="ci">${I(it.ic,17)}</span>`;
    const opt = `role="option" id="cmd_o${i}" aria-selected="${i === cmdIdx}" tabindex="-1"`;   // для диктора: список вариантов, выбранный — стрелками
    h += it.rec ? `<button class="cmd-it rec${i===cmdIdx?' act':''}" data-act="cmdrun" data-i="${i}" ${opt}>${ic}<span class="cl"><span class="cmd-tt">${it.h}</span><small>${esc(it.s)}</small></span>${it.r ? `<b class="cr">${esc(it.r)}</b>` : ''}</button>`
      : `<button class="cmd-it${it.keep ? ' more' : ''}${i===cmdIdx?' act':''}" data-act="cmdrun" data-i="${i}" ${opt}>${ic}<span class="cl">${esc(it.t)}</span>${it.s ? `<span class="cs">${esc(it.s)}</span>` : ''}${it.k ? `<kbd>${it.k}</kbd>` : ''}</button>`;
  });
  $('#cmd_res').innerHTML = h || `<p class="empty" style="padding:14px">Ничего не найдено. Ищу по задачам, событиям, тратам, заметкам, привычкам и целям</p>`;
  const a = $('.cmd-it.act'); if (a) a.scrollIntoView({ block:'nearest' });
  if (a) $('#cmd_q').setAttribute('aria-activedescendant', a.id); else $('#cmd_q').removeAttribute('aria-activedescendant');
}
function cmdRun(i) { const it = cmdItems[i]; if (!it) return; if (it.keep) { cmdIdx = i; it.run(); $('#cmd_q').focus({ preventScroll:true }); return; } closeCmd(); it.run(); }

// Дело без времени — это задача (видна в разделе «Задачи»); со временем — обычное событие
function quickCreate(title, date, time, time2, catId, opts) {
  if (!title) return;
  const o = opts || {};
  snap();
  if (time && time2 && timeMin(time2) <= timeMin(time)) time2 = '';
  S.events.push({ id:uid(), done:false, doneDates:[], skip:[], title, date, time, time2, cat:validCat(catId), note:'', loc:'', repeat:{type:'none'}, reminder:{enabled:false, offset:15, repeat:'none', days:[]},
    task: o.task != null ? o.task : !time, prio: o.prio || 'mid' });
  sel = date; syncMini(); if (view === 'month') { monthAnchor = pd(date); monthAnchor.setDate(1); }
  save(); render();
  toast(`Создано: ${title} · ${relDay(date)}${time ? ', ' + time : ''}`, true);
}
