// ---- Свои окошки выбора (25 ноября 2026, пользователь: «сделай функции календаря удобнее и красивее… всё подобное как в файле
//      (стандартное окошко времени браузера) тоже красивым, и всё плавнее, как на айфонах») ----
// Только на ПК с мышью (pointer:fine): на iPhone остаются системные колёсики — они и есть «как на айфоне», на Android — системные окна.
// Поле остаётся настоящим <input type="time|date"> / <select>: окошко пишет в него value и шлёт input + change, весь прежний код работает как был.
// С клавиатуры (Tab, стрелки, ввод цифр) поле работает по-прежнему; Alt+↓ или F4 — открыть окошко.
// Время — два колёсика (часы и минуты по 5, своё значение тоже есть), дата — календарик месяца, список — свой выпадающий список.
const PK_ON = () => matchMedia('(pointer:fine)').matches;
const PK_ROW = 34;   // высота строки колёсика, px
let pk = null;       // { el, box, kind, ... } — открытое окошко

function pkClose(back) {
  if (!pk) return;
  const { box, el } = pk; pk = null;
  box.classList.add('out'); setTimeout(() => box.remove(), 160);
  if (back && el && document.contains(el)) { try { el.focus({ preventScroll: true }); } catch (e) {} }
}
function pkSet(el, v) {
  if (el.value === v) return;
  el.value = v;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
// Окошко под полем (не влезает — над ним), по левому краю поля, не за краем экрана
function pkPlace() {
  if (!pk) return;
  if (!document.contains(pk.el)) return pkClose();
  const r = pk.el.getBoundingClientRect(), b = pk.box, w = b.offsetWidth, h = b.offsetHeight, gap = 6;
  const below = innerHeight - r.bottom - gap, up = below < h + 8 && r.top - gap > below;
  b.style.left = Math.round(Math.max(8, Math.min(r.left, innerWidth - w - 8))) + 'px';
  b.style.top = Math.round(up ? Math.max(8, r.top - gap - h) : Math.min(r.bottom + gap, innerHeight - h - 8)) + 'px';
  b.classList.toggle('up', up);
}
function pkOpen(el, kind, html) {
  pkClose();
  const box = document.createElement('div');
  box.className = 'pk pk-' + kind; box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', el.getAttribute('aria-label') || (kind === 'time' ? 'Выбор времени' : kind === 'date' ? 'Выбор даты' : 'Выбор'));
  box.innerHTML = html;
  document.body.appendChild(box);
  pk = { el, box, kind };
  pkPlace();
  return box;
}

// ---- Время: колёсики ----
const pk2 = n => String(n).padStart(2, '0');
function pkWheel(list, cur, name) {
  return `<div class="pk-wh" data-w="${name}" tabindex="0" role="listbox" aria-label="${name === 'h' ? 'Часы' : 'Минуты'}">
    <div class="pk-pad"></div>${list.map(v => `<div class="pk-it${v === cur ? ' on' : ''}" data-v="${v}" role="option" aria-selected="${v === cur}">${pk2(v)}</div>`).join('')}<div class="pk-pad"></div></div>`;
}
function pkTime(el) {
  const m = /^(\d{2}):(\d{2})/.exec(el.value || ''), now = new Date();
  let h = m ? +m[1] : now.getHours(), mi = m ? +m[2] : Math.round(now.getMinutes() / 5) * 5 % 60;
  const mins = [...Array(12)].map((_, i) => i * 5); if (!mins.includes(mi)) { mins.push(mi); mins.sort((a, b) => a - b); }
  const box = pkOpen(el, 'time', `<div class="pk-whs"><div class="pk-band" aria-hidden="true"></div>${pkWheel([...Array(24).keys()], h, 'h')}<span class="pk-colon" aria-hidden="true">:</span>${pkWheel(mins, mi, 'm')}</div>
    <div class="pk-foot"><button type="button" class="pk-b" data-pk="now">Сейчас</button><button type="button" class="pk-b pri" data-pk="ok">Готово</button></div>`);
  pk.h = h; pk.m = mi;
  box.querySelectorAll('.pk-wh').forEach(w => {
    const on = w.querySelector('.pk-it.on'); if (on) w.scrollTop = on.offsetTop - PK_ROW * 2;
    pkTilt(w);
    let t = 0;
    w.addEventListener('scroll', () => { pkTilt(w); clearTimeout(t); t = setTimeout(() => pkSettle(w), 110); }, { passive: true });
    let acc = 0, at = 0;
    w.addEventListener('wheel', e => {   // колесо мыши: щелчок — одна строка; тачпад (мелкие шаги) копится до строки
      e.preventDefault(); if (Date.now() - at > 250) acc = 0; at = Date.now(); acc += e.deltaMode === 1 ? e.deltaY * 34 : e.deltaY;
      const n = Math.abs(acc) >= 50 || (e.deltaMode !== 0 || Math.abs(e.deltaY) >= 50) ? Math.sign(acc) : 0; if (!n) return; acc = 0;
      const its = [...w.querySelectorAll('.pk-it')], i = its.findIndex(x => x.classList.contains('on')), j = Math.max(0, Math.min(its.length - 1, i + n));
      if (j !== i) { its.forEach(x => x.classList.toggle('on', x === its[j])); pkWheelTo(w, its[j].dataset.v, true); }
    }, { passive: false });
  });
  if (!m) pkTimeWrite();   // пустое поле — сразу ставим время колёсиков (как системное окошко)
}
// Колёсико «как барабан»: строки дальше от середины мельче, бледнее и наклонены
function pkTilt(w) {
  const mid = w.scrollTop + w.clientHeight / 2;
  for (const it of w.children) {
    if (!it.classList.contains('pk-it')) continue;
    const d = (it.offsetTop + PK_ROW / 2 - mid) / PK_ROW, a = Math.max(-1, Math.min(1, d / 2.6));
    it.style.transform = `rotateX(${(-a * 62).toFixed(1)}deg) scale(${(1 - Math.abs(a) * .12).toFixed(3)})`;
    it.style.opacity = (1 - Math.min(1, Math.abs(d) / 3) * .75).toFixed(2);
  }
}
function pkSettle(w) {
  if (!pk || pk.kind !== 'time') return;
  const its = [...w.querySelectorAll('.pk-it')], i = Math.max(0, Math.min(its.length - 1, Math.round(w.scrollTop / PK_ROW))), it = its[i];
  its.forEach(x => { x.classList.toggle('on', x === it); x.setAttribute('aria-selected', x === it); });
  pk[w.dataset.w] = +it.dataset.v; pkTimeWrite();
}
const pkTimeWrite = () => { if (pk && pk.kind === 'time') pkSet(pk.el, pk2(pk.h) + ':' + pk2(pk.m)); };
function pkWheelTo(w, v, smooth) {
  const it = w.querySelector(`.pk-it[data-v="${v}"]`); if (!it) return;
  w.scrollTo({ top: it.offsetTop - PK_ROW * 2, behavior: smooth && !matchMedia('(prefers-reduced-motion:reduce)').matches ? 'smooth' : 'auto' });
  if (!smooth) { pkTilt(w); pkSettle(w); }
}

// ---- Дата: календарик ----
function pkDateHTML() {
  const { y, mo, val } = pk, first = new Date(y, mo, 1), ws = S.settings.weekStart === 0 ? 0 : 1;
  const off = (first.getDay() - ws + 7) % 7, n = new Date(y, mo + 1, 0).getDate(), t = todayK(), min = pk.el.min || '', max = pk.el.max || '';
  const dows = ws === 1 ? DOW : [DOW[6], ...DOW.slice(0, 6)];
  let cells = '';
  for (let i = 0; i < off; i++) cells += '<i></i>';
  for (let d = 1; d <= n; d++) {
    const k = y + '-' + pk2(mo + 1) + '-' + pk2(d), bad = (min && k < min) || (max && k > max), we = [0, 6].includes(new Date(y, mo, d).getDay());
    cells += `<button type="button" class="pk-d${k === val ? ' on' : ''}${k === t ? ' tdy' : ''}${we ? ' we' : ''}" data-k="${k}"${bad ? ' disabled' : ''} aria-label="${esc(fmtLong(k))}"${k === val ? ' aria-pressed="true"' : ''}>${d}</button>`;
  }
  return `<div class="pk-mh"><button type="button" class="pk-nav" data-pk="prev" aria-label="Прошлый месяц">‹</button><b>${MON[mo]} ${y}</b><button type="button" class="pk-nav" data-pk="next" aria-label="Следующий месяц">›</button></div>
    <div class="pk-dw" aria-hidden="true">${dows.map(x => `<span>${x}</span>`).join('')}</div>
    <div class="pk-g ${pk.dir || ''}">${cells}</div>
    <div class="pk-foot">${pk.el.required ? '' : '<button type="button" class="pk-b" data-pk="clear">Очистить</button>'}<button type="button" class="pk-b" data-pk="today">Сегодня</button></div>`;
}
function pkDate(el) {
  const v = /^\d{4}-\d{2}-\d{2}$/.test(el.value) ? el.value : '', d = v ? pd(v) : new Date();
  pkOpen(el, 'date', '');
  Object.assign(pk, { y: d.getFullYear(), mo: d.getMonth(), val: v });
  pkDateDraw();
}
function pkDateDraw() { if (!pk) return; pk.box.innerHTML = pkDateHTML(); pkPlace(); }
function pkMonth(n) { const d = new Date(pk.y, pk.mo + n, 1); pk.y = d.getFullYear(); pk.mo = d.getMonth(); pk.dir = n > 0 ? 'fr' : 'fl'; pkDateDraw(); }

// ---- Список (select) ----
function pkSelect(el) {
  const opts = [...el.options];
  const box = pkOpen(el, 'sel', `<div class="pk-ls" role="listbox">${opts.map((o, i) => `<button type="button" class="pk-o${o.selected ? ' on' : ''}" data-i="${i}" role="option" aria-selected="${o.selected}"${o.disabled ? ' disabled' : ''}>${esc(o.textContent)}</button>`).join('')}</div>`);
  box.style.minWidth = Math.max(160, el.offsetWidth) + 'px'; pkPlace();
  const on = box.querySelector('.pk-o.on'); if (on) { const ls = box.querySelector('.pk-ls'); ls.scrollTop = on.offsetTop - ls.clientHeight / 2 + on.offsetHeight / 2; (on).focus({ preventScroll: true }); }
}

// ---- Открыть: нажатие мышью по полю (и по значку часов / календаря в нём) ----
const PK_SEL = 'input[type="time"], input[type="date"], select';
function pkFor(el) { if (el.disabled || el.readOnly || el.dataset.native != null || (el.tagName === 'SELECT' && el.multiple)) return; return el.tagName === 'SELECT' ? pkSelect(el) : el.type === 'time' ? pkTime(el) : pkDate(el); }
document.addEventListener('mousedown', e => {
  if (e.button !== 0 || !PK_ON()) return;
  if (pk && pk.box.contains(e.target)) return;
  const el = e.target.closest && e.target.closest(PK_SEL);
  if (!el) { if (pk) pkClose(); return; }
  if (pk && pk.el === el) { e.preventDefault(); return pkClose(true); }
  e.preventDefault(); el.focus({ preventScroll: true }); pkFor(el);
}, true);
// Мышью мимо — в mousedown выше; в самом окошке — кнопки
document.addEventListener('click', e => {
  if (!pk || !pk.box.contains(e.target)) return;
  const b = e.target.closest('[data-pk], .pk-it, .pk-d, .pk-o'); if (!b) return;
  e.preventDefault(); e.stopPropagation();
  if (b.classList.contains('pk-it')) return pkWheelTo(b.parentElement, b.dataset.v, true);
  if (b.classList.contains('pk-d')) { pkSet(pk.el, b.dataset.k); pk.val = b.dataset.k; b.classList.add('on'); return setTimeout(() => pkClose(true), 120); }
  if (b.classList.contains('pk-o')) { const el = pk.el; el.selectedIndex = +b.dataset.i; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return pkClose(true); }
  const a = b.dataset.pk;
  if (a === 'ok') return pkClose(true);
  if (a === 'now') { const n = new Date(); pk.box.querySelectorAll('.pk-wh').forEach(w => pkWheelTo(w, w.dataset.w === 'h' ? n.getHours() : Math.round(n.getMinutes() / 5) * 5 % 60, true)); return; }
  if (a === 'prev') return pkMonth(-1);
  if (a === 'next') return pkMonth(1);
  if (a === 'today') { const t = todayK(); pkSet(pk.el, t); return pkClose(true); }
  if (a === 'clear') { pkSet(pk.el, ''); return pkClose(true); }
}, true);
// Клавиатура: Esc — закрыть (не трогая окно под ним), Enter — готово, стрелки — по колёсику / дням / списку; Alt+↓ и F4 на поле — открыть
addEventListener('keydown', e => {
  if (!pk) {
    const el = e.target; if (!PK_ON() || !el.matches || !el.matches(PK_SEL)) return;
    if ((e.altKey && e.key === 'ArrowDown') || e.key === 'F4') { e.preventDefault(); e.stopImmediatePropagation(); pkFor(el); const f = pk && pk.box.querySelector('.pk-wh, .pk-d.on, .pk-d.tdy, .pk-d:not([disabled])'); if (f) f.focus(); }
    return;
  }
  if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); return pkClose(true); }
  if (e.key === 'Tab') return pkClose();
  if (!pk.box.contains(e.target)) return;
  const t = e.target;
  if (t.classList.contains('pk-wh') && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    e.preventDefault(); e.stopImmediatePropagation();
    const its = [...t.querySelectorAll('.pk-it')], i = its.findIndex(x => x.classList.contains('on')), j = Math.max(0, Math.min(its.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
    return pkWheelTo(t, its[j].dataset.v, false);
  }
  if (t.classList.contains('pk-d') && /^Arrow/.test(e.key)) {
    e.preventDefault(); e.stopImmediatePropagation();
    const k = addDays(t.dataset.k, { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key]), d = pd(k);
    if (d.getMonth() !== pk.mo) { pk.y = d.getFullYear(); pk.mo = d.getMonth(); pk.dir = ''; pkDateDraw(); }
    const n = pk.box.querySelector(`.pk-d[data-k="${k}"]`); if (n) n.focus();
    return;
  }
  if (t.classList.contains('pk-o') && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    e.preventDefault(); e.stopImmediatePropagation();
    const os = [...pk.box.querySelectorAll('.pk-o:not([disabled])')], i = os.indexOf(t), n = os[Math.max(0, Math.min(os.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
    if (n) n.focus();
    return;
  }
  if (e.key === 'Enter' && t.classList.contains('pk-wh')) { e.preventDefault(); e.stopImmediatePropagation(); pkClose(true); }
}, true);
addEventListener('resize', () => pkClose());
addEventListener('scroll', e => { if (pk && !pk.box.contains(e.target)) pkPlace(); }, true);   // окно с полем листается — окошко едет за полем
