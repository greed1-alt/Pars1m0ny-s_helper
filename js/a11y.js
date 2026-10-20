// ---- Доступность (20 октября 2026, аудит P1-2…4, P2-4): окна, фокус, клавиатура, подписи для экранного диктора ----
// Окно открыто — остальная страница «заморожена» (inert): Tab и диктор не уходят за окно. Фокус — внутрь окна, после закрытия — обратно на кнопку,
// которой окно открыли. Перерисовка (render, обновление окна) возвращает фокус на «ту же» кнопку — по id или по data-act + data-id/data-d/…

// Последним пользовались клавиатурой (а не пальцем или мышью) — тогда фокус можно возвращать и в поля ввода (на телефоне это открыло бы клавиатуру)
let a11yKbd = false;
addEventListener('keydown', e => { if (e.key === 'Tab' || e.key === 'Enter' || e.key === ' ' || e.key.startsWith('Arrow')) a11yKbd = true; }, true);
addEventListener('pointerdown', () => { a11yKbd = false; }, true);

// «Адрес» элемента, по которому его можно найти после перерисовки
const FK_ATTRS = ['data-act', 'data-id', 'data-d', 'data-k', 'data-v', 'data-s', 'data-i', 'data-e', 'data-m', 'data-g', 'data-f'];
const FK_ROOTS = '#main, #side, header, #tabbar, #sh, #cmd';
function focKey(el) {
  if (!el || el === document.body || !el.isConnected || !el.closest) return null;
  const root = el.closest(FK_ROOTS); if (!root) return null;
  const q = el.id ? '#' + CSS.escape(el.id) : FK_ATTRS.filter(a => el.hasAttribute(a)).map(a => `[${a}="${CSS.escape(el.getAttribute(a))}"]`).join('');
  return q ? { root: root.id ? '#' + root.id : root.tagName.toLowerCase(), q: el.id ? q : el.tagName.toLowerCase() + q } : null;
}
const focSave = () => focKey(document.activeElement);
const isText = el => /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable;
// Поставить фокус на элемент по «адресу» (видимый, не «замороженный»); поля ввода на телефоне — только если пользуются клавиатурой
function focTo(k) {
  if (!k) return false;
  const box = $(k.root); if (!box) return false;
  const el = [...box.querySelectorAll(k.q)].find(e => e.getClientRects().length && !e.closest('[inert]'));
  if (!el || (isText(el) && !a11yKbd && innerWidth < 900)) return false;
  el.focus({ preventScroll: true }); return document.activeElement === el;
}
// После перерисовки: фокус потерялся (элемент заменён новым) — вернуть на такой же
function focBack(k) { const a = document.activeElement; if (k && (!a || a === document.body || !a.isConnected)) focTo(k); }

// ---- Окна ----
let a11yRet = null;   // куда вернуть фокус, когда закроются все окна
const a11yBg = on => ['.app', '#tabbar'].forEach(s => { const e = $(s); if (e) e.inert = on; });
function a11yOpen() { if (!a11yRet) a11yRet = focSave(); a11yBg(true); }
function a11yClose() {
  if (sheetOpen() || cmdOpen()) { const sh = $('#sh'); if (sheetOpen() && !sh.contains(document.activeElement)) sh.focus({ preventScroll: true }); return; }   // ещё открыто другое окно
  a11yBg(false);
  const k = a11yRet; a11yRet = null; focTo(k);
}
// Окно (sheet) нарисовано: заголовок для диктора, фокус — внутрь (при обновлении того же окна — на ту же кнопку)
function a11ySheet(was, fk) {
  const sh = $('#sh'), h = sh.querySelector('h3, h2');
  if (h) { if (!h.id) h.id = 'sh_ttl'; sh.setAttribute('aria-labelledby', h.id); sh.removeAttribute('aria-label'); }
  else { sh.removeAttribute('aria-labelledby'); sh.setAttribute('aria-label', 'Окно'); }
  if (!was) a11yOpen();
  if (fk) focBack(fk);
  if (!sh.contains(document.activeElement)) sh.focus({ preventScroll: true });
  a11yMarks(sh);
}

// ---- Клавиатура ----
// Нажимаемое, но не кнопка (role="button" у div и span): Enter и пробел — как нажатие.
// Числа в «Месяце»: стрелки ← → — по дням, ↑ ↓ — по неделям (Tab попадает только на один день — выбранный)
const MC_STEP = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
document.addEventListener('keydown', e => {
  const t = e.target; if (!t.matches || e.ctrlKey || e.metaKey || e.altKey) return;
  if (t.matches('.mc-n[data-k]') && MC_STEP[e.key]) {
    e.preventDefault(); e.stopImmediatePropagation();
    const k = addDays(t.dataset.k, MC_STEP[e.key]);
    sel = k; if (ymOf(k) !== ymOf(ds(monthAnchor))) { monthAnchor = pd(k); monthAnchor.setDate(1); }
    syncMini(); render();
    const n = $(`.mc-n[data-k="${k}"]`); if (n) n.focus();
    return;
  }
  if ((e.key === 'Enter' || e.key === ' ') && !e.repeat && t.matches('[role="button"]:not(button):not(a):not(input)')) { e.preventDefault(); e.stopImmediatePropagation(); t.click(); }
}, true);

// ---- Подписи и состояния (после каждой перерисовки) ----
const A11Y_NAMES = { f_t: 'Название', hb_n: 'Название привычки', g_t: 'Название цели', g_why: 'Зачем мне это', ds_new: 'Новая задача на этот день' };
const a11yDay = (k, n) => fmtLong(k) + (k === todayK() ? ', сегодня' : '') + (n == null ? '' : n ? ', ' + plural(n, ['дело', 'дела', 'дел']) : ', пусто');
function a11yMarks(root) {
  if (!root) return;
  // Переключатели и чипы выбора: «нажат / не нажат»
  root.querySelectorAll('.segc button, .chips > button, .ccats > button, .emj > button').forEach(b => b.setAttribute('aria-pressed', b.classList.contains('on')));
  // Кружки «выполнено»: какое дело и отмечено ли (раньше у всех было просто «Выполнено»); важность — не только цветом
  const byId = new Map(S.events.map(e => [e.id, e]));
  root.querySelectorAll('[data-act="toggle"][data-id]').forEach(b => {
    const e = byId.get(b.dataset.id); if (!e) return;
    const p = e.task && e.prio && e.prio !== 'mid' && typeof PRIO !== 'undefined' && PRIO[e.prio] ? PRIO[e.prio].n.toLowerCase() : '';
    b.setAttribute('aria-pressed', isDone(e, b.dataset.d || e.date)); b.setAttribute('aria-label', `Выполнено: «${e.title}»${p ? ', важность: ' + p : ''}`);
    if (p && !b.title) b.title = 'Важность: ' + p;
  });
  // Поля без подписи для диктора: подпись строки рядом («Дата», «Повтор», текст строки Настроек), иначе — название по id, иначе подсказка в поле
  root.querySelectorAll('input:not([type=hidden]), select, textarea').forEach(el => {
    if (el.hasAttribute('aria-label') || el.hasAttribute('aria-labelledby') || (el.labels && el.labels.length)) return;
    const row = el.closest('.frow, .set-row'), l = row && row.querySelector(':scope > .fl, :scope > span');
    const t = (l && l.textContent.trim()) || A11Y_NAMES[el.id] || (el.classList.contains('cname') ? 'Название календаря' : '') || el.placeholder;
    if (t) el.setAttribute('aria-label', t);
  });
  // Мини-календарь: число — полной датой
  root.querySelectorAll('.mcell[data-d]').forEach(b => { const k = b.dataset.d; b.setAttribute('aria-label', a11yDay(k) + (k === sel ? ', выбран' : '')); if (k === todayK()) b.setAttribute('aria-current', 'date'); });
}
// Заголовок вкладки браузера — по разделу: «Финансы — Parsimony» (таймер дописывает своё время сам)
const pageTitle = () => (sec !== 'home' && SEC[sec] && SEC[sec].name ? SEC[sec].name + ' — ' : '') + APP_TITLE;
// Плавная прокрутка — только если в системе не включено «уменьшить движение»
const smoothB = () => matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
// После render: подписи, заголовок вкладки (пока идёт таймер, заголовок с его временем ставит timer.js)
function a11yPage() {
  ['#main', '#side', 'header', '#tabbar'].forEach(s => a11yMarks($(s)));
  if (!(S.timer && S.timer.run && S.timer.run.running)) document.title = pageTitle();
}
