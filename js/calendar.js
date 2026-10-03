// ---- Состояние вида ----
let view = (window.innerWidth >= 900 ? 'week' : 'month'), sel = todayK(), monthAnchor = pd(sel);
monthAnchor.setDate(1);
let miniAnchor = new Date(monthAnchor);
const syncMini = () => { miniAnchor = pd(sel); miniAnchor.setDate(1); };
const weekDays = () => { const s = weekStartOf(sel); const d = [...Array(7)].map((_,i) => addDays(s, i)); return S.settings.weekends ? d : d.filter(k => !isWknd(k)); };

// Категория — отдельной меткой (цветная точка + название в «таблетке»), чтобы не путать её с названием события
const catTag = id => { const c = cat(id); return `<span class="ctag" style="--c:${c.color}"><i></i>${esc(c.name)}</span>`; };
function evHTML(e) {
  if (ui2()) return `<div class="ev${e.done?' done':''}" style="--c:${cat(e.cat).color}"><button class="chk" data-act="toggle" data-id="${e.id}" data-d="${e.date}" aria-label="Выполнено">${e.done?I(IC.check,13):''}</button>
  <button class="evb" data-act="edit" data-id="${e.id}" data-d="${e.date}"><b>${esc(e.title)}</b><small>${e.time?`<span class="ev-tm">${timeRange(e)}</span>`:''}${catTag(e.cat)}${e.rec?'<span>↻</span>':''}${remLabel(e) ? `<span>${remLabel(e).replace(/^ · /, '')}</span>` : ''}${e.loc?`<span>${esc(e.loc)}</span>`:''}</small>${e.note?`<p>${esc(e.note)}</p>`:''}</button></div>`;
  return `<div class="ev${e.done?' done':''}" style="--c:${cat(e.cat).color}"><button class="chk" data-act="toggle" data-id="${e.id}" data-d="${e.date}" aria-label="Выполнено">${e.done?I(IC.check,13):''}</button>
  <button class="evb" data-act="edit" data-id="${e.id}" data-d="${e.date}"><b>${esc(e.title)}</b><small>${e.time?timeRange(e)+' · ':''}${esc(cat(e.cat).name)}${e.rec?' · ↻':''}${remLabel(e)}${e.loc?' · '+esc(e.loc):''}</small>${e.note?`<p>${esc(e.note)}</p>`:''}</button></div>`;
}
const dayList = k => { const es = evOn(k); return es.length ? es.map(evHTML).join('') : '<p class="empty">Событий нет</p>'; };

function gridCells(anchor) {
  const d = new Date(anchor), off = S.settings.weekStart === 1 ? (d.getDay()+6)%7 : d.getDay();
  const n = Math.ceil((off + new Date(d.getFullYear(), d.getMonth()+1, 0).getDate()) / 7) * 7, out = [];
  for (let i = 0; i < n; i++) { const c = new Date(d); c.setDate(1 - off + i); out.push([c, c.getMonth() === d.getMonth()]); }
  return out;
}
const dowsOrdered = () => S.settings.weekStart === 1 ? DOW : [DOW[6], ...DOW.slice(0,6)];

function monthHTML() {
  const today = todayK(), cells = gridCells(monthAnchor), rows = cells.length / 7, pc = innerWidth >= 900;
  const hh = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hh')) || 60;
  const maxChips = Math.max(1, Math.floor(((innerHeight - hh - 32) / rows - 32) / 20));
  let h = `<div class="month" style="--rows:${rows}">` + dowsOrdered().map(x => `<div class="mdw">${x}</div>`).join('');
  h += cells.map(([c, inMonth]) => {
    const k = ds(c), es = evOn(k), lim = es.length > maxChips ? maxChips - 1 : maxChips;
    const chips = pc ? es.slice(0, lim).map(e => `<button class="mchip${e.time?'':' all'}${e.done?' done':''}" data-act="edit" data-id="${e.id}" data-d="${k}" style="--c:${cat(e.cat).color}"><i></i>${e.time?`<span class="t">${esc(e.time)}</span>`:''}<span class="n">${esc(e.title)}</span></button>`).join('')
      + (es.length > lim ? `<button class="mmore" data-act="goday" data-d="${k}">ещё ${es.length - lim}</button>` : '') : '';
    const dots = es.slice(0,4).map(e => `<u style="background:${cat(e.cat).color}"></u>`).join('');
    return `<div class="mc${inMonth?'':' oth'}${k===today?' today':''}${k===sel?' sel':''}${isWknd(k)?' wknd':''}" data-act="pick" data-d="${k}"><span class="mc-n"${pc?` data-act="goday" data-d="${k}" title="Открыть день"`:''}>${c.getDate()}</span><span class="mdots">${dots}</span><div class="mchips">${chips}</div></div>`;
  }).join('');
  h += '</div>';
  if (!pc) h += `<div class="mpanel"><div class="mp-head"><b>${fmtLong(sel)}</b><button class="pill sm" data-act="addday">${I(IC.plus,14)} Добавить</button></div>${dayList(sel)}</div>`;
  return (pc ? '' : missedBar()) + h;
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
const foldOn = () => ui2() && S.settings.fold !== false;
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

function gridHTML(days) {
  const today = todayK(), SH = startH(), RH = rowH(), nm = nowMin();
  TA = buildAxis(days);
  const fz = TA.segs.some(s => s.fold);
  const showNow = days.includes(today) && nm >= SH*60, nowTop = yOf(nm);
  const head = days.map(k => `<div class="wg-day${isWknd(k)?' wknd':''}"><span class="wg-dow">${days.length === 1 ? DOWF[dowIdx(k)] : dowName(k)}</span><button class="wg-num${k===today?' today':''}${k===sel&&k!==today&&days.length>1?' sel':''}" data-act="goday" data-d="${k}" title="Открыть день">${pd(k).getDate()}</button></div>`).join('');
  const allrow = days.map(k => { const es = evOn(k).filter(e => !e.time);
    return `<div class="wg-allcol${isWknd(k)?' wknd':''}" data-act="quickadd" data-d="${k}" title="Добавить задачу на весь день">${es.map(e => `<button class="wg-chip${e.done?' done':''}" data-act="edit" data-id="${e.id}" data-d="${k}" style="--c:${cat(e.cat).color}">${e.done?'✓ ':''}${esc(e.title)}</button>`).join('')}</div>`; }).join('');
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
  const folds = fz ? TA.segs.filter(s => s.fold).map(s => `<button class="wg-fold" data-act="wgfold" data-h="${s.a / 60}" style="top:${s.y}px;height:${s.h}px" aria-label="Показать часы ${hh2(s.a)}–${hh2(s.b)}"><span>${s.b - s.a >= 600 ? 'свободно' : ''} ${hh2(s.a)}–${hh2(s.b)}</span></button>`).join('') : '';
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

function dayHTML() {
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
    out += `<div class="ag-day"><div class="ag-date${k===today?' today':''}" data-act="goday" data-d="${k}" title="Открыть день"><b>${d.getDate()}</b><small>${MONS[d.getMonth()]}, ${dowName(k).toLowerCase()}</small></div><div class="ag-list">${es.map(e => `<div class="ag-row${e.done?' done':''}" style="--c:${cat(e.cat).color}"><button class="chk" data-act="toggle" data-id="${e.id}" data-d="${k}" aria-label="Выполнено">${e.done?I(IC.check,13):''}</button><button class="ag-main" data-act="edit" data-id="${e.id}" data-d="${k}"><span class="ag-time">${e.time ? timeRange(e) : 'весь день'}</span><span class="ag-bar"></span><span class="ag-txt"><b>${esc(e.title)}</b><small>${ui2() ? catTag(e.cat) : esc(cat(e.cat).name)}${e.rec?' · ↻ '+esc(repText(e)):''}${e.loc?' · '+esc(e.loc):''}</small></span></button></div>`).join('')}</div></div>`;
  }
  return `<div class="agenda">${out || `<div class="ag-empty"><b>Ближайшие 60 дней свободны</b>Нажмите «Создать» или клавишу N, чтобы запланировать что-нибудь.</div>`}</div>`;
}

const tplSub = t => t.time ? (t.time2 ? t.time + '–' + t.time2 : t.time) : 'Весь день';
function sideHTML() {
  const open = S.settings.tplOpen !== false, n = nextUp();
  const cnt = id => S.events.filter(e => e.cat === id).length;
  const top = `<div class="sb-top"><button class="sb-title" data-act="sec" data-s="home" title="Главная"><span class="sb-logo" title="Сегодня ${esc(fmtLong(todayK()))}"><span>${pd(todayK()).getDate()}</span></span><span class="wordmark">${APP_NAME}</span></button><button class="sb-ic" data-act="search" aria-label="Поиск" title="Поиск и команды (Ctrl+K)">${I(IC.search)}</button></div>
  ${navHTML()}`;
  const foot = `<div class="sb-foot">
    <button class="sb-link sb-prof${sec === 'profile' || sec === 'profedit' ? ' on' : ''}" data-act="sec" data-s="profile">${avatarHTML(22)}<span>${esc((S.settings.name || '').trim() || 'Профиль')}</span></button>
    <button class="sb-link${sec === 'settings' ? ' on' : ''}" data-act="sec" data-s="settings" title="Уведомления: ${esc(notif.short)}">${I(IC.gear,15)} Настройки</button>
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
  ${n ? `<div class="sb-next">${nextCard(n)}</div>` : ''}
  ${mini}
  <div class="sb-sec"><div class="sb-h">Мои календари</div>
  ${S.cats.map(c => `<div class="sb-catw"><button type="button" class="sb-cat${hiddenCats.has(c.id)?'':' on'}" data-act="catfilter" data-id="${c.id}" style="--c:${c.color}"><span class="sb-box">${hiddenCats.has(c.id)?'':I(IC.check,11)}</span>${esc(c.name)}<span class="cnt">${cnt(c.id) || ''}</span></button><button type="button" class="cshare" data-act="sharecat" data-id="${c.id}" aria-label="Поделиться календарём «${esc(c.name)}»" title="Поделиться">${I(IC.share,14)}</button></div>`).join('')}
  <button class="sb-add" data-act="addcat">${I(IC.plus,15)} Добавить календарь</button></div>
  <div class="sb-sec"><button class="sb-h" data-act="tpltoggle">Шаблоны событий <span>${open?'▾':'▸'}</span></button>
  ${open ? (S.templates.length ? S.templates.map(t => `<div class="tpl" data-act="usetpl" data-id="${t.id}" style="--c:${cat(t.cat).color}" role="button"><b>${esc(t.title)}</b><small>${esc(tplSub(t))}</small><button class="tpx" data-act="deltpl" data-id="${t.id}" aria-label="Удалить шаблон">${I(IC.x,13)}</button></div>`).join('') : '<p class="empty" style="font-size:12.5px;margin:0 4px">Шаблонов нет. Откройте событие и нажмите «В шаблоны».</p>') : ''}
  </div>
  ${foot}`;
}

function titleHTML() {
  const pc = innerWidth >= 900;
  if (view === 'month') return `${MON[monthAnchor.getMonth()]} ${monthAnchor.getFullYear()}`;
  if (view === 'week') {
    const days = weekDays(), a = pd(days[0]), b = pd(days[days.length-1]);
    const wn = S.settings.weekNums ? `<span class="sub">неделя ${isoWeek(days[0])}</span>` : '';
    const MN = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
    if (pc) return (a.getMonth() === b.getMonth() ? MON[a.getMonth()] : MN[a.getMonth()] + ' – ' + MN[b.getMonth()].toLowerCase()) + ' ' + b.getFullYear() + wn;
    return a.getMonth() === b.getMonth() ? `${a.getDate()}–${b.getDate()} ${MONS[b.getMonth()]}` : `${a.getDate()} ${MONS[a.getMonth()]} – ${b.getDate()} ${MONS[b.getMonth()]}`;
  }
  if (view === 'day') { const d = pd(sel); return pc ? `${d.getDate()} ${MONG[d.getMonth()]} ${d.getFullYear()}<span class="sub">${DOWF[dowIdx(sel)].toLowerCase()}</span>` : `${d.getDate()} ${MONS[d.getMonth()]}, ${dowName(sel).toLowerCase()}`; }
  const d = pd(sel); return `Список<span class="sub">с ${d.getDate()} ${MONG[d.getMonth()]}</span>`;
}

let lastGridView = null;
function render(dir) {
  evCache.clear();
  closeQuick();
  const root = document.documentElement, cal = sec === 'cal', S2 = SEC[sec];
  root.dataset.theme = S.settings.theme;
  document.body.dataset.sec = sec;
  document.body.classList.toggle('ui2', ui2());
  document.body.dataset.nonav = S2.noNav ? '1' : '';    // «Главная», «Профиль», «Настройки»: без стрелок периода
  document.body.dataset.nonew = S2.newLabel ? '' : '1';
  $('#ttl').innerHTML = cal ? titleHTML() : S2.title();
  $$('[data-v]').forEach(b => b.classList.toggle('on', b.dataset.v === view));
  const bn = $('.btn-new'); if (bn) bn.innerHTML = I(IC.plus, 17) + (S2.newLabel || '');
  const ha = $('.hdr-ava'); if (ha) { ha.innerHTML = avatarHTML(28); ha.classList.toggle('on', sec === 'profile' || sec === 'profedit'); }
  const si = $('#secinfo'); if (si) si.innerHTML = !cal && S2.info ? S2.info() : '';
  root.style.setProperty('--hh', $('header').offsetHeight + 'px');
  const main = $('#main'), oldW = $('.wgwrap'), oldTop = oldW ? oldW.scrollTop : null;
  hsSave();
  main.className = cal ? 'v-' + view : 'sec sec-' + sec;
  main.innerHTML = !cal ? S2.html() : view === 'month' ? monthHTML() : view === 'week' ? gridHTML(weekDays()) : view === 'day' ? dayHTML() : agendaHTML();
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
}

function move(n) {
  if (sec !== 'cal') { SEC[sec].move(n); if (sec !== 'tasks') miniAnchor = pd(secYM + '-01'); return render(n); }
  if (view === 'month') { monthAnchor.setDate(1); monthAnchor.setMonth(monthAnchor.getMonth() + n); }
  else if (view === 'list') { sel = addDays(sel, 14 * n); syncMini(); }
  else { sel = addDays(sel, view === 'week' ? 7 * n : n); syncMini(); }
  render(n);
}
function setView(v) { if (sec !== 'cal') { sec = 'cal'; S.settings.sec = 'cal'; save(); view = v; if (v === 'month') { monthAnchor = pd(sel); monthAnchor.setDate(1); } return render(2); } if (v === view) return; view = v; if (v === 'month') { monthAnchor = pd(sel); monthAnchor.setDate(1); } render(2); }
function goToday() { sel = todayK(); secYM = ymOf(sel); monthAnchor = pd(sel); monthAnchor.setDate(1); syncMini(); lastGridView = null; render(2); }
// Кнопка «Создать» и клавиша N: в каждом разделе — своё
// В новом интерфейсе «Создать» на Главной, в Календаре и Задачах открывает единую строку ввода
const createNew = () => ui2() && ['home', 'cal', 'tasks'].includes(sec) ? openOmni(sec) : sec === 'cal' || !SEC[sec].create ? openEvent() : SEC[sec].create();
function setTheme(t) { S.settings.theme = t; save(); render(); toast('Тема: ' + ({auto:'как в системе', light:'светлая', dark:'тёмная', black:'чёрная'})[t]); }

// ---- Тост и «Отменить» ----
const undoStack = [];
const UNDO_KEYS = ['events', 'cats', 'templates', 'habits', 'bio', 'fin', 'focus', 'ygoal', 'notes'];
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
  toastTimer = setTimeout(() => t.classList.remove('show'), withUndo ? 6000 : 2600);
}

// ---- Окна ----
const sheet = (h, keep) => { const sh = $('#sh'), top = sh.scrollTop; sh.innerHTML = '<span class="grab"></span>' + h; $('#ov').classList.add('show'); sh.scrollTop = keep ? top : 0; };
const closeSheet = () => { $('#ov').classList.remove('show'); delAsk = null; palOpen = null; shareCtx = null; inbox = null; };
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
const closeQuick = () => { const q = $('#qc'); if (q) q.classList.remove('show', 'menu'); $$('.wg-ghost').forEach(g => g.remove()); };
const quickOpen = () => $('#qc').classList.contains('show');

function nlHint(p, id) {
  const el = $(id); if (!el) return;
  el.innerHTML = p && p.found ? `${I(IC.spark,13)} Распознано: <b>${esc(p.desc)}</b>` : '';
}

function openEvent(id, preset, instDate) {
  closeQuick();
  const p = preset || {};
  const src = id ? S.events.find(x => x.id === id) : null;
  if (id && !src) return;
  const e = src || { title:p.title||'', date:p.date||sel, time:p.time||'', time2:p.time2||'', cat:validCat(p.cat), note:'', loc:'', repeat:{type:'none'}, reminder:{enabled:false, offset:15, repeat:'none', days:[]}, task: !!p.task, prio: p.prio || 'mid' };
  const r = e.reminder || {}, remV = r.enabled ? String(r.offset || 0) : 'off', rep = e.repeat || {type:'none'};
  window._fe = { id, cat: validCat(e.cat), days: new Set(rep.days && rep.days.length ? rep.days : [dowIdx(e.date)]), inst: instDate || e.date, nl:null, nlOff: !!id, daysTouched: !!(rep.days && rep.days.length), prio: PRIO[e.prio] ? e.prio : 'mid' };
  const rec = isRec(e);
  sheet(`<div class="sh-head"><h3>${id ? 'Событие' : 'Новое событие'}</h3>
    ${id ? `<button class="ic" data-act="shareev" title="Поделиться" aria-label="Поделиться">${I(IC.share,17)}</button><button class="ic" data-act="dup" title="Дублировать" aria-label="Дублировать">${I(IC.copy,17)}</button><button class="ic" data-act="del" title="Удалить" aria-label="Удалить" style="color:var(--dng)">${I(IC.trash,17)}</button>` : ''}
    <button class="ic" data-act="close" title="Закрыть (Esc)" aria-label="Закрыть">${I(IC.x,18)}</button></div>
  <input id="f_t" class="f-title" placeholder="Название" value="${esc(e.title)}" autocomplete="off">
  <div id="f_hint" class="nlhint" style="margin:-2px 0 8px"></div>
  ${rec ? `<div class="f-rec">${I(IC.rep,14)} ${esc(repText(e))} · изменения применятся ко всем повторениям</div>` : ''}
  <div class="frow"><span class="fl">Дата</span><input id="f_d" class="fin" type="date" value="${e.date}"></div>
  <div class="frow"><span class="fl">Время</span><div><div class="ftime"><input id="f_tm" class="fin" type="time" value="${e.time||''}" aria-label="Начало"${e.time?'':' disabled'}><span class="dash">–</span><input id="f_tm2" class="fin" type="time" value="${e.time2||''}" aria-label="Конец"${e.time?'':' disabled'}></div>
    <label class="swl"><input id="f_all" class="sw" type="checkbox"${e.time?'':' checked'}> Весь день / без времени</label></div></div>
  <div class="frow"><span class="fl">Повтор</span><div><select id="f_rep" class="fin">${Object.entries(REP).map(([k,v]) => `<option value="${k}"${rep.type===k?' selected':''}>${v}</option>`).join('')}</select>
    <div id="f_repx" style="display:${rep.type && rep.type!=='none'?'block':'none'}">
      <div id="f_days" class="chips" style="display:${rep.type==='weekly'?'flex':'none'}">${DOW.map((d,i) => `<button type="button" class="chip${window._fe.days.has(i)?' on':''}" data-act="repday" data-d="${i}">${d}</button>`).join('')}</div>
      <div class="until">до <input id="f_until" class="fin" type="date" value="${rep.until||''}" aria-label="Повторять до"></div></div></div></div>
  <div class="frow"><span class="fl">Календарь</span><div class="ccats" id="f_cats">${catChips(window._fe.cat, 'fcat')}</div></div>
  <div class="frow"><span class="fl">Задача</span><div><label class="swl" style="margin-top:9px"><input id="f_task" class="sw" type="checkbox"${e.task?' checked':''}> Показывать в разделе «Задачи»</label>
    <div id="f_prio" class="chips" style="display:${e.task?'flex':'none'}">${PRIO_ORDER.map(k => `<button type="button" class="chip prio${window._fe.prio===k?' on':''}" data-act="fprio" data-p="${k}" style="--c:${PRIO[k].c}">${PRIO[k].n}</button>`).join('')}</div></div></div>
  <div class="frow"><span class="fl">Напомнить</span><select id="f_rem" class="fin">${[['off','Не напоминать'],['0','В момент события'],['5','За 5 минут'],['10','За 10 минут'],['15','За 15 минут'],['30','За 30 минут'],['60','За 1 час'],['1440','За 1 день']].map(([v,t]) => `<option value="${v}"${remV===v?' selected':''}>${t}</option>`).join('')}</select></div>
  <div class="frow"><span class="fl">Место</span><input id="f_loc" class="fin" type="text" value="${esc(e.loc||'')}" placeholder="Адрес или ссылка" autocomplete="off"></div>
  <div class="frow"><span class="fl">Заметка</span><textarea id="f_n" class="fin" placeholder="Подробности">${esc(e.note||'')}</textarea></div>
  <div class="sh-foot"><button class="btn pri grow" data-act="save">Сохранить</button><button class="btn" data-act="savetpl" title="Сохранить как шаблон">${I(IC.tpl,16)} В шаблоны</button></div>
  <div id="f_ask"></div>`);
  if (!id) setTimeout(() => $('#f_t') && $('#f_t').focus(), 60);
}

const PALETTE = ['#ef4444','#f97316','#f59e0b','#eab308','#22c55e','#14b8a6','#38bdf8','#3b82f6','#6366f1','#a855f7','#ec4899','#64748b'];
const THEMES = [['auto','Авто','linear-gradient(90deg,#fff 50%,#191919 50%)','#d0d0d0','#e08a3c'],['light','Светлая','#ffffff','#e9e9e7','#2b2b2b'],['dark','Тёмная','#191919','#2f2f2f','#e08a3c'],['black','Чёрная','#000000','#232323','#e6e6e6']];
let palOpen = null, delAsk = null;
// Настройки — отдельная страница (SEC.settings в js/pages.js); здесь только переход и блоки для неё
function openSettings() { if (sec !== 'settings') setSec('settings'); else render(); }
function settingsBlocks() {
  const st = S.settings;
  return {
  look: `<div class="set-sec">Оформление</div>
  <div class="thm">${THEMES.map(([v,n,bg,a,b]) => `<button class="${st.theme===v?'on':''}" data-act="theme" data-v="${v}"><span class="pv" style="background:${bg};--pa:${a};--pb:${b}"></span>${n}</button>`).join('')}</div>
  <div class="set-row" style="margin-top:8px"><span>Размер сетки</span><div class="seg2">${[['compact','Компактно'],['normal','Обычно'],['large','Крупно']].map(([v,n]) => `<button class="${st.density===v?'on':''}" data-act="density" data-v="${v}">${n}</button>`).join('')}</div></div>
  <div class="set-row"><span>Новый интерфейс <em class="beta" title="Проба">β</em></span><input id="s_ui2" class="sw" type="checkbox"${ui2()?' checked':''}></div>
  <p class="set-note">${ui2() ? 'Единая строка ввода, сворачиваемые блоки, больше воздуха. Выключите, чтобы вернуть прежний вид — данные не меняются.' : 'Сейчас прежний вид. Включите, чтобы попробовать новый: единая строка ввода, сворачиваемые блоки, больше воздуха.'}</p>`,
  cal: `<div class="set-sec">Календарь</div>
  <div class="set-row"><span>День в сетке начинается с</span><select id="s_ds" class="fin" style="min-width:90px">${[...Array(13)].map((_,h) => `<option value="${h}"${startH()===h?' selected':''}>${String(h).padStart(2,'0')}:00</option>`).join('')}</select></div>
  <div class="set-row"><span>Неделя начинается с</span><select id="s_ws" class="fin"><option value="1"${st.weekStart===1?' selected':''}>Понедельника</option><option value="0"${st.weekStart===0?' selected':''}>Воскресенья</option></select></div>
  <div class="set-row"><span>Показывать выходные в неделе</span><input id="s_wk" class="sw" type="checkbox"${st.weekends?' checked':''}></div>
  <div class="set-row"><span>Номер недели</span><input id="s_wn" class="sw" type="checkbox"${st.weekNums?' checked':''}></div>
  <div class="set-row"><span>Приглушать прошедшие события</span><input id="s_dim" class="sw" type="checkbox"${st.dimPast?' checked':''}></div>
  ${ui2() ? `<div class="set-row"><span>Сворачивать пустые часы в неделе</span><input id="s_fold" class="sw" type="checkbox"${st.fold !== false?' checked':''}></div>` : ''}`,
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
  notif: `<div class="set-sec">Уведомления</div>
  <div class="nstat"><i class="ndot ${notif.state}"></i><span id="nstat_t">${esc(notif.text)}</span></div>
  <div style="display:flex;gap:8px;flex-wrap:wrap">${PUSH_SUBSCRIBE ? `<button class="btn pri grow" data-act="push">${I(IC.bell,16)} Включить уведомления</button>` : ''}<button class="btn grow" data-act="ntest">${PUSH_SUBSCRIBE ? '' : I(IC.bell,16) + ' '}Проверить</button></div>
  <p class="set-note">${st.lastTest ? 'Последняя проверка: ' + new Date(st.lastTest).toLocaleString('ru-RU', {day:'numeric', month:'long', hour:'2-digit', minute:'2-digit'}) : 'Проверок ещё не было.'} «Проверить» показывает тестовое уведомление на этом устройстве.${PUSH_SUBSCRIBE ? '' : ' Напоминания по времени появятся позже — для них нужен сервер.'}</p>
  <div id="plog"></div>`,
  data: `<div class="set-sec">Данные</div>
  <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn grow" data-act="export">${I(IC.down,16)} Скачать копию</button><button class="btn grow" data-act="import">${I(IC.up,16)} Загрузить из файла</button></div>
  <p class="set-note">Всё — события, задачи, привычки, финансы и заметки — хранится только на этом устройстве. Делайте копию, чтобы ничего не потерять.</p>`,
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
function openCmd() { closeQuick(); $('#cmd_ic').innerHTML = I(IC.search, 19); $('#cmd').classList.add('show'); $('#cmd_q').value = ''; cmdUpdate(); setTimeout(() => $('#cmd_q').focus(), 20); }
const closeCmd = () => $('#cmd').classList.remove('show');
const COMMANDS = () => [
  { ic:IC.plus, t:'Новое событие', run:() => openEvent() },
  { ic:IC.tasks, t:'Новая задача', run:() => newTask() },
  { ic:IC.habit, t:'Новая привычка', run:() => openHabit() },
  { ic:IC.wallet, t:'Записать расход или доход', run:() => openOp() },
  ...SEC_ORDER.map(s => ({ ic:SEC[s].icon, t:(s === 'home' ? '' : 'Раздел: ') + SEC[s].name, run:() => setSec(s) })),
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
  { ic:IC.down, t:'Скачать резервную копию', run:exportData },
  { ic:IC.share, t:'Поделиться всем календарём', run:() => openShare({ kind:'a' }) },
  ...S.cats.map(c => ({ ic:IC.share, t:`Поделиться календарём «${c.name}»`, run:() => openShare({ kind:'c', id:c.id }) })),
  { ic:IC.undo, t:'Отменить последнее действие', k:'Ctrl Z', run:undo },
];
function cmdUpdate() {
  const q = $('#cmd_q').value.trim(), ql = q.toLowerCase(), items = [];
  if (shareCode(q)) items.push({ sec:'Присланное', ic:IC.link, t:'Открыть присланную ссылку', s:'событие или календарь', run:() => openShareCode(shareCode(q)) });
  else if (q) {
    const p = parseNL(q, sel);
    if (p.title) items.push({ sec:'Создать', ic:IC.plus, t:`Создать «${p.title}»`, s: p.found ? p.desc : relDay(sel), run:() => quickCreate(p.title, p.date || sel, p.time || '', p.time2 || '', p.cat) });
    S.events.filter(e => (e.title + ' ' + (e.note||'') + ' ' + (e.loc||'')).toLowerCase().includes(ql))
      .map(e => ({ e, k: nextOcc(e) })).sort((a, b) => Math.abs(dayDiff(todayK(), a.k)) - Math.abs(dayDiff(todayK(), b.k))).slice(0, 12)
      .forEach(({ e, k }) => items.push({ sec:'События', c:cat(e.cat).color, t:e.title, s: relDay(k) + (e.time ? ', ' + e.time : '') + (isRec(e) ? ' ↻' : ''), run:() => { sel = k; syncMini(); monthAnchor = pd(k); monthAnchor.setDate(1); render(); openEvent(e.id, null, k); } }));
    COMMANDS().filter(c => c.t.toLowerCase().includes(ql)).forEach(c => items.push(Object.assign({ sec:'Команды' }, c)));
  } else {
    const up = []; for (let i = 0; i < 14 && up.length < 5; i++) { const k = addDays(todayK(), i); evOn(k).forEach(e => { if (up.length < 5 && !e.done && (i > 0 || !e.time || (timeMin(e.time2 || e.time) || 0) >= nowMin())) up.push({ e, k }); }); }
    up.forEach(({ e, k }) => items.push({ sec:'Ближайшие', c:cat(e.cat).color, t:e.title, s: relDay(k) + (e.time ? ', ' + e.time : ''), run:() => { sel = k; syncMini(); render(); openEvent(e.id, null, k); } }));
    COMMANDS().forEach(c => items.push(Object.assign({ sec:'Команды' }, c)));
  }
  cmdItems = items; cmdIdx = 0; cmdDraw();
}
function cmdDraw() {
  let h = '', last = '';
  cmdItems.forEach((it, i) => {
    if (it.sec !== last) { h += `<div class="cmd-sec">${it.sec}</div>`; last = it.sec; }
    h += `<button class="cmd-it${i===cmdIdx?' act':''}" data-act="cmdrun" data-i="${i}">${it.c ? `<span class="cd" style="--c:${it.c}"></span>` : `<span class="ci">${I(it.ic,17)}</span>`}<span class="cl">${esc(it.t)}</span>${it.s ? `<span class="cs">${esc(it.s)}</span>` : ''}${it.k ? `<kbd>${it.k}</kbd>` : ''}</button>`;
  });
  $('#cmd_res').innerHTML = h || '<p class="empty" style="padding:14px">Ничего не найдено</p>';
  const a = $('.cmd-it.act'); if (a) a.scrollIntoView({ block:'nearest' });
}
function cmdRun(i) { const it = cmdItems[i]; if (!it) return; closeCmd(); it.run(); }

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
