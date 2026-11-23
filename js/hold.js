// ---- Меню пункта: долгое нажатие (телефон), правая кнопка мыши и клавиша меню / Shift+F10 (ПК) — 24 ноября 2026 ----
// Просьба пользователя: «при зажатии на пункты (привычки и подобное) открывалась небольшая настройка (изменить / удалить и подобное)».
// Пункты: события и задачи (строки, чипы месяца; блоки почасовой сетки — только мышью: на телефоне их долгое нажатие
// перетаскивает, input.js), привычки (таблетки, плитки, названия и клетки таблицы), траты, заметки, цели.
// Обычное нажатие работает как раньше. Удаление — сразу с «Отменить» в тосте; привычка, цель и все повторения — после вопроса в самом меню.
const HOLD_MS = 450;
let hold = null, holdAt = 0, holdLift = false,   // holdLift — палец ещё на экране после долгого нажатия, holdAt — когда его отпустили
    hmIt = null, hmActs = [], hmAsk = null, hmKbd = false;
const hmOpen = () => !!hmIt;

// Что за пункт под пальцем: { kind, id, k (день или период), el (что подсветить), blk (блок сетки) }
function holdItem(t) {
  if (!t || !t.closest || t.closest('#hm, #cmd, #qc, #askm, .ai-chat, input, textarea, select, [contenteditable=true]') || document.documentElement.classList.contains('touring')) return null;
  if (t.closest('#sh') && !t.closest('.nt-row')) return null;   // в окнах — только заметки окна «Все заметки»
  const b = t.closest('[data-act][data-id]'); if (!b) return null;
  const it = holdKind(b); if (it) it.src = b;   // src — сама кнопка: на неё вернётся фокус
  return it;
}
function holdKind(b) {
  const a = b.dataset.act, id = b.dataset.id;
  if (a === 'edit' || a === 'toggle') { const e = S.events.find(x => x.id === id); return e ? { kind: 'ev', id, k: b.dataset.d || e.date, el: b.closest('.t3-row, .pl-row') || b, blk: b.classList.contains('wg-block') } : null; }
  if (a === 'hmark' || a === 'hmarkp' || a === 'hedit') { const h = S.habits.find(x => x.id === id); return h ? { kind: 'hab', id, k: b.dataset.k || b.dataset.key || hbNowKey(h), el: b } : null; }
  if (a === 'opedit' || a === 'opdel') { const o = S.fin.ops.find(x => x.id === id); return o ? { kind: 'op', id, el: b.closest('.fh-row') || b } : null; }
  if (a === 'ntedit' || a === 'ntdel') { const n = S.notes.find(x => x.id === id); return n ? { kind: 'note', id, el: b.closest('.nt-row') || b } : null; }
  if (a === 'gopen' || a === 'glate' || a === 'gext') { const g = S.goals.find(x => x.id === id); return g ? { kind: 'goal', id, el: b.closest('.gl-card') || b } : null; }
  return null;
}
// Ключ отметки «сейчас» для названия привычки в таблице: день, неделя месяца или месяц; не по плану сегодня — без отметки
function hbNowKey(h) {
  const t = todayK(), ym = ymOf(t);
  if (h.kind === 'weekly') return ym + ':w' + (wkOf(t) + 1);
  if (h.kind === 'monthly') return ym;
  return hDow(h, t) && t >= hStart(h) ? t : '';
}

// Пункты меню: { ic, t, run, dng, ask: { q, note, yes } }; head — [заголовок, [кусочки подписи], значок]
function holdActs(it) {
  const t = todayK();
  if (it.kind === 'ev') {
    const e = S.events.find(x => x.id === it.id); if (!e) return null;
    const rec = isRec(e), done = isDone(e, it.k), k = it.k;
    const when = relDay(k), head = [e.title, [rec && 'Повторяется', rec ? when : when.charAt(0).toUpperCase() + when.slice(1), e.time && e.time + (e.time2 ? '–' + e.time2 : '')]];
    const L = [{ ic: IC.check, t: done ? 'Снять отметку' : 'Выполнено', run: () => toggleDone(e.id, k) },
      { ic: IC.edit, t: 'Изменить', run: () => openEvent(e.id, null, k) }];
    if (!rec && !done) { const nd = k < t ? t : addDays(k, 1);
      L.push({ ic: IC.day, t: k < t ? 'Перенести на сегодня' : 'Перенести на завтра', run: () => { snap(); e.date = nd; save(); render(); toast('Перенесено на ' + relDay(nd), true); } }); }
    L.push({ ic: IC.copy, t: 'Дублировать', run: () => { snap(); S.events.push(Object.assign(structuredClone(e), { id: uid(), title: e.title + ' (копия)', done: false, doneDates: [], skip: [] })); save(); render(); toast('Создана копия', true); } });
    L.push({ ic: IC.share, t: 'Поделиться', run: () => openShare({ kind: 'e', id: e.id, inst: k }) });
    if (rec) {
      L.push({ ic: IC.trash, t: 'Удалить только ' + relDay(k), dng: true, run: () => { snap(); e.skip = [...(e.skip || []), k]; save(); render(); toast('Удалено только это повторение', true); } });
      L.push({ ic: IC.trash, t: 'Удалить все повторения', dng: true, ask: { q: `Удалить «${e.title}» со всеми повторениями?`, yes: 'Удалить все' }, run: () => { snap(); S.events = S.events.filter(x => x.id !== e.id); save(); render(); toast('Удалены все повторения', true); } });
    } else L.push({ ic: IC.trash, t: 'Удалить', dng: true, run: () => { snap(); S.events = S.events.filter(x => x.id !== e.id); save(); render(); toast(e.task ? 'Задача удалена' : 'Событие удалено', true); } });
    return { head, L };
  }
  if (it.kind === 'hab') {
    const h = S.habits.find(x => x.id === it.id); if (!h) return null;
    const k = it.k, on = !!(k && h.log[k]), day = isDayKey(k);
    const freq = h.kind === 'weekly' ? 'Раз в неделю' : h.kind === 'monthly' ? 'Раз в месяц' : h.days.length ? h.days.map(d => DOW[d]).join(', ') : 'Каждый день';
    const L = [];
    if (k) L.push({ ic: IC.check, t: (on ? 'Снять отметку' : 'Отметить') + (day && k !== t ? ' за ' + relDay(k) : ''), run: () => markHabit(h.id, k) });
    L.push({ ic: IC.edit, t: 'Изменить', run: () => openHabit(h.id) });
    L.push({ ic: IC.trash, t: 'Удалить', dng: true, ask: { q: `Удалить привычку «${h.name}» со всеми отметками?`, yes: 'Удалить' }, run: () => { snap(); S.habits = S.habits.filter(x => x.id !== h.id); save(); render(); toast('Привычка удалена', true); } });
    return { head: [h.name, [freq], h.emoji], L };
  }
  if (it.kind === 'op') {
    const o = S.fin.ops.find(x => x.id === it.id); if (!o) return null;
    const c = fcat(o.cat), plus = c.g === 'inc';
    const L = [{ ic: IC.edit, t: 'Изменить', run: () => openOp(o.id) }];
    if (o.date !== t) L.push({ ic: IC.copy, t: 'Повторить сегодня', run: () => { snap(); S.fin.ops.push(Object.assign(structuredClone(o), { id: 'o' + uid(), date: t, demo: undefined })); save(); render(); toast('Записано на сегодня: ' + (plus ? '+' : '−') + rub(o.amt), true); } });
    L.push({ ic: IC.trash, t: 'Удалить', dng: true, run: () => { snap(); S.fin.ops = S.fin.ops.filter(x => x.id !== o.id); save(); render(); toast('Запись удалена', true); } });
    return { head: [o.note || c.name, [(plus ? '+' : '−') + rub(o.amt), relDay(o.date)], c.emoji], L };
  }
  if (it.kind === 'note') {
    const n = S.notes.find(x => x.id === it.id); if (!n) return null;
    return { head: [n.text.split('\n')[0].slice(0, 60), [fmtLong(n.date)]], L: [
      { ic: IC.edit, t: 'Изменить', run: () => openNote(n.id) },
      { ic: IC.copy, t: 'Скопировать текст', run: () => copyText(n.text, 'Текст скопирован') },
      { ic: IC.trash, t: 'Удалить', dng: true, run: () => ACT.ntdel({ dataset: { id: n.id } }) }] };   // как корзина у строки: в окне «Все заметки» список обновится
  }
  if (it.kind === 'goal') {
    const g = S.goals.find(x => x.id === it.id); if (!g) return null;
    const steps = S.events.some(e => e.goal === g.id);
    return { head: [g.title, [g.done ? 'Достигнута' : dueTxt(g)], g.emoji], L: [
      { ic: IC.goal, t: 'Открыть', run: () => openGoal(g.id) },
      g.done ? { ic: IC.undo, t: 'Вернуть в работу', run: () => { snap(); g.done = false; delete g.doneAt; save(); render(); toast('Цель снова в работе', true); } }
        : { ic: IC.check, t: 'Цель достигнута', run: () => { snap(); g.done = true; g.doneAt = t; save(); render(); toast(`Цель «${g.title}» достигнута!`, true); } },
      { ic: IC.trash, t: 'Удалить', dng: true, ask: { q: `Удалить цель «${g.title}»?`, note: steps ? 'Шаги-задачи останутся в календаре.' : '', yes: 'Удалить' }, run: () => { snap(); S.goals = S.goals.filter(x => x.id !== g.id); S.events.forEach(e => { if (e.goal === g.id) delete e.goal; }); save(); render(); toast('Цель удалена', true); } }] };
  }
  return null;
}

// ---- Окошко меню ----
function hmShow(it, x, y, mouse) {
  const a = holdActs(it); if (!a) return;
  hmClose(); closeQuick();
  hmIt = Object.assign({ x, y, mouse }, it); hmActs = a.L; hmAsk = null; hmKbd = a11yKbd;
  const b = document.createElement('div'); b.id = 'hmb'; document.body.appendChild(b);
  const m = document.createElement('div'); m.id = 'hm'; m.setAttribute('role', 'menu'); m.tabIndex = -1; document.body.appendChild(m);
  m.dataset.head = a.head[0];
  hmDraw();
  if (it.el && it.el.isConnected) { it.el.classList.add('held'); hmIt.top0 = it.el.getBoundingClientRect().top; }
  (m.querySelector('.hm-i') && hmKbd ? m.querySelector('.hm-i') : m).focus({ preventScroll: true });
}
function hmDraw() {
  const m = $('#hm'); if (!m || !hmIt) return;
  const a = holdActs(hmIt); if (!a) return hmClose();
  hmActs = a.L;
  m.setAttribute('aria-label', 'Действия: ' + a.head[0]);
  m.innerHTML = hmAsk != null
    ? `<div class="hm-ask"><b>${esc(hmActs[hmAsk].ask.q)}</b>${hmActs[hmAsk].ask.note ? `<small>${esc(hmActs[hmAsk].ask.note)}</small>` : ''}</div>
      <button class="hm-i dng" role="menuitem" data-hm="yes">${I(IC.trash, 17)}<span>${esc(hmActs[hmAsk].ask.yes)}</span></button><button class="hm-i" role="menuitem" data-hm="no">${I(IC.x, 17)}<span>Отмена</span></button>`
    : `<div class="hm-h"><b>${a.head[2] ? `<span class="hm-em">${esc(a.head[2])}</span> ` : ''}<span>${esc(a.head[0])}</span></b>${(p => p.length ? `<small>${p.map(x => `<span>${esc(x)}</span>`).join(' · ')}</small>` : '')(a.head[1].filter(Boolean))}</div>` +   // подпись — кусочками: переводчик (en.js) переводит каждый
      hmActs.map((x, i) => `<button class="hm-i${x.dng ? ' dng' : ''}" role="menuitem" data-hm="${i}">${I(x.ic, 17)}<span>${esc(x.t)}</span></button>`).join('');
  hmPlace(m);
}
// Мышью — у курсора; пальцем — под пунктом (над ним, если не влезает), чтобы меню не оказалось под пальцем
function hmPlace(m) {
  const it = hmIt, pad = 8, vw = innerWidth, vh = (window.visualViewport && visualViewport.height) || innerHeight;
  m.style.left = '0px'; m.style.top = '0px';
  const W = m.offsetWidth, H = m.offsetHeight;
  const r = it.el && it.el.isConnected ? it.el.getBoundingClientRect() : { top: it.y - 20, bottom: it.y + 20 };
  let left, top;
  if (it.mouse) { left = it.x + W > vw - pad ? it.x - W : it.x; top = it.y + H > vh - pad ? it.y - H : it.y; }
  else {
    left = it.x - W / 2;
    top = r.bottom + 8 + H <= vh - pad ? r.bottom + 8 : r.top - 8 - H >= pad ? r.top - 8 - H : it.y + 28 + H <= vh - pad ? it.y + 28 : it.y - 28 - H;
  }
  left = Math.max(pad, Math.min(left, vw - W - pad)); top = Math.max(pad, Math.min(top, vh - H - pad));
  m.style.left = Math.round(left) + 'px'; m.style.top = Math.round(top) + 'px';
  m.style.setProperty('--ox', Math.round(Math.max(0, Math.min(W, it.x - left))) + 'px');
  m.style.setProperty('--oy', (top + H / 2 < it.y ? H : 0) + 'px');
}
function hmClose(back) {
  if (!hmIt) { $$('#hm, #hmb').forEach(x => x.remove()); return; }
  const el = hmIt.el, src = hmIt.src; hmIt = null; hmAsk = null;
  $$('#hm, #hmb').forEach(x => x.remove());
  $$('.held').forEach(x => x.classList.remove('held'));
  if (back) { const f = src && src.isConnected ? src : el && el.isConnected ? el.querySelector('[data-act][data-id]') || el : null; if (f) f.focus({ preventScroll: true }); }
}
function hmRun(i) {
  const x = hmActs[i]; if (!x) return;
  if (x.ask && hmAsk == null) { hmAsk = i; hmDraw(); const y = $('#hm [data-hm="yes"]'); if (y) y.focus({ preventScroll: true }); return; }
  hmClose(true); x.run();   // фокус — обратно на пункт: окно, открытое из меню, вернёт его туда же
}
document.addEventListener('click', e => {
  const inM = e.target.closest && e.target.closest('#hm');
  if (holdLift || Date.now() - holdAt < 200) { e.stopPropagation(); e.preventDefault(); return; }   // отпустили палец после долгого нажатия — это не нажатие (ни на пункт, ни на меню)
  if (e.target.id === 'hmb') { e.stopPropagation(); hmClose(true); return; }
  if (!inM) return;
  e.stopPropagation();
  const b = e.target.closest('[data-hm]'); if (!b) return;
  const v = b.dataset.hm;
  if (v === 'yes') { const i = hmAsk; hmAsk = null; const x = hmActs[i]; hmClose(true); if (x) x.run(); }
  else if (v === 'no') { hmAsk = null; hmDraw(); const f = $('#hm .hm-i'); if (f) f.focus({ preventScroll: true }); }
  else hmRun(Number(v));
}, true);

// ---- Долгое нажатие ----
document.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse') return;
  holdLift = false;
  if (hmOpen()) return;
  clearTimeout(hold && hold.t); hold = null;
  const it = holdItem(e.target); if (!it || it.blk) return;   // блок сетки на телефоне — перетаскивание
  hold = { it, x: e.clientX, y: e.clientY, pid: e.pointerId, t: setTimeout(holdFire, HOLD_MS) };
}, true);
function holdFire() {
  if (!hold) return;
  const h = hold; hold = null; clearTimeout(h.t);
  if (!h.it.el || !h.it.el.isConnected) return;
  holdLift = true;
  try { if (navigator.vibrate) navigator.vibrate(12); } catch (x) {}
  hmShow(h.it, h.x, h.y, false);
}
document.addEventListener('pointermove', e => { if (hold && e.pointerId === hold.pid && Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > 10) { clearTimeout(hold.t); hold = null; } }, true);
['pointerup', 'pointercancel'].forEach(t => document.addEventListener(t, e => { if (hold && e.pointerId === hold.pid) { clearTimeout(hold.t); hold = null; } if (holdLift && e.pointerType !== 'mouse') holdAt = Date.now(); }, true));
// Страницу или окно прокрутили и пункт уехал — меню закрывается (просто событие прокрутки, например при перерисовке, его не закрывает)
addEventListener('scroll', () => { if (hold) { clearTimeout(hold.t); hold = null; } if (hmOpen() && hmIt.el && hmIt.el.isConnected && Math.abs(hmIt.el.getBoundingClientRect().top - hmIt.top0) > 6) hmClose(); }, true);
// После долгого нажатия палец отпускают над пунктом: без этого iPhone «нажал» бы его (отметил привычку, открыл событие)
document.addEventListener('touchend', e => { if (holdLift) { holdLift = false; holdAt = Date.now(); if (e.cancelable) e.preventDefault(); } }, { passive: false, capture: true });
document.addEventListener('touchcancel', () => { if (holdLift) { holdLift = false; holdAt = Date.now(); } }, true);

// Правая кнопка мыши; на Android долгое нажатие тоже присылает contextmenu — меню уже открыто или открывается сейчас
document.addEventListener('contextmenu', e => {
  if (hmOpen()) { e.preventDefault(); return; }
  const it = holdItem(e.target); if (!it) return;
  e.preventDefault();
  if (hold && hold.it.el === it.el) return holdFire();
  if (e.pointerType && e.pointerType !== 'mouse' || (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents)) { if (it.blk) return; holdLift = true; hmShow(it, e.clientX, e.clientY, false); return; }
  hmShow(it, e.clientX, e.clientY, true);
});

// Клавиатура: в меню — стрелки, Home / End, Esc; на пункте — клавиша меню или Shift+F10
document.addEventListener('keydown', e => {
  if (hmOpen()) {
    const items = $$('#hm .hm-i'), i = items.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (hmAsk != null) { hmAsk = null; hmDraw(); const f = $('#hm .hm-i'); if (f) f.focus(); } else hmClose(true); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End' || e.key === 'Tab') {
      e.preventDefault(); e.stopPropagation(); hmKbd = true;
      const n = items.length, j = e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : (e.key === 'ArrowDown' || e.key === 'Tab' && !e.shiftKey) ? (i + 1) % n : (i - 1 + n) % n;
      if (items[j]) items[j].focus();
      return;
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) { e.stopPropagation(); }   // одиночные буквы — горячие клавиши календаря — не срабатывают под меню
    return;
  }
  if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
    const it = holdItem(document.activeElement); if (!it) return;
    e.preventDefault();
    const r = (it.el || document.activeElement).getBoundingClientRect();
    hmShow(it, r.left + Math.min(r.width / 2, 120), r.bottom - 4, false);
  }
}, true);
addEventListener('resize', () => { if (hmOpen() && !(document.activeElement && document.activeElement.closest('#hm'))) hmClose(); });
