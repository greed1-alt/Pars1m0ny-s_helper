// ---- Нажатия ----
document.addEventListener('click', async ev => {
  if (Date.now() - lastDragEnd < 250) return;
  const el = ev.target.closest('[data-act]');
  if (quickOpen() && !$('#qc').contains(ev.target) && !(el && (el.dataset.act === 'colclick' || el.dataset.act === 'quickadd'))) closeQuick();
  if (ev.target.id === 'ov') return closeSheet();
  if (ev.target.id === 'cmd') return closeCmd();
  if (!el) return;
  const a = el.dataset.act, id = el.dataset.id;
  if (ACT[a]) { ACT[a](el, ev); return; }
  if (a === 'prev') move(-1); else if (a === 'next') move(1);
  else if (a === 'v') setView(el.dataset.v);
  else if (a === 'today') goToday();
  else if (a === 'mprev' || a === 'mnext') { miniAnchor.setDate(1); miniAnchor.setMonth(miniAnchor.getMonth() + (a === 'mnext' ? 1 : -1)); $('#side').innerHTML = sideHTML(); }
  else if (a === 'tpltoggle') { S.settings.tplOpen = S.settings.tplOpen === false; save(); render(); }
  else if (a === 'deltpl') { ev.stopPropagation(); snap(); S.templates = S.templates.filter(t => t.id !== id); save(); render(); toast('Шаблон удалён', true); }
  else if (a === 'usetpl') { const t = S.templates.find(x => x.id === id); if (t) openEvent(null, { title:t.title, cat:t.cat, time:t.time, time2:t.time2 }); }
  else if (a === 'savetpl') {
    const title = $('#f_t').value.trim(); if (!title) { $('#f_t').focus(); return; }
    const all = $('#f_all').checked;
    S.templates.push({ id:'t' + uid(), title: titleFromForm(title), cat:window._fe.cat, time: all ? '' : $('#f_tm').value, time2: all ? '' : $('#f_tm2').value });
    save(); el.innerHTML = I(IC.check,16) + ' В шаблонах'; el.disabled = true; $('#side').innerHTML = sideHTML(); toast('Шаблон сохранён');
  }
  else if (a === 'search') openCmd();
  else if (a === 'cmdrun') cmdRun(Number(el.dataset.i));
  else if (a === 'help') { closeCmd(); openHelp(); }
  else if (a === 'undo') { $('#toast').classList.remove('show'); undo(); }
  else if (a === 'pick') { const d = el.dataset.d; const fromMini = !!el.closest('#mini'); sel = d;
    if (view === 'month') { const m = pd(d); if (m.getMonth() !== monthAnchor.getMonth()) { monthAnchor = m; monthAnchor.setDate(1); } }
    if (sec === 'habits' || sec === 'fin') { if (ymOf(d) !== secYM) { secYM = ymOf(d); window.scrollTo(0, 0); } }   // в «Привычках» и «Финансах» день открывает его месяц
    if (fromMini) syncMini(); render(); }
  else if (a === 'goday') { sel = el.dataset.d; view = 'day'; syncMini(); render(2); }
  else if (a === 'addday') openEvent(null, { date: sel });
  else if (a === 'quickadd') { if (ev.target.closest('.wg-chip')) return; openQuick(el.dataset.d, '', ev.clientX, ev.clientY); }
  else if (a === 'colclick') {
    const rect = el.getBoundingClientRect();
    let mins = startH()*60 + Math.floor((ev.clientY - rect.top) / rowH() * 4) * 15;
    mins = Math.max(startH()*60, Math.min(23*60 + 45, mins));
    openQuick(el.dataset.d, fmtMin(mins), ev.clientX, ev.clientY);
  }
  else if (a === 'qclose') closeQuick();
  else if (a === 'qcat') { window._qc.cat = id; $$('#q_cats .ccat').forEach(b => b.classList.toggle('on', b.dataset.id === id)); }
  else if (a === 'qsave') {
    const raw = $('#q_t').value.trim(); if (!raw) { $('#q_t').focus(); return; }
    const q = window._qc, title = q.nl && q.nl.found && q.nl.title ? q.nl.title : raw, t1 = $('#q_tm').value, t2 = t1 ? $('#q_tm2').value : '';
    closeQuick(); quickCreate(title, q.date, t1, t2, q.cat);
  }
  else if (a === 'qfull') { const q = window._qc, raw = $('#q_t').value.trim();
    const preset = { title: q.nl && q.nl.found ? q.nl.title : raw, date:q.date, time:$('#q_tm').value, time2:$('#q_tm2').value, cat:q.cat };
    closeQuick(); sel = q.date; openEvent(null, preset); }
  else if (a === 'add') createNew();
  else if (a === 'edit') openEvent(id, null, el.dataset.d);
  else if (a === 'toggle') toggleDone(id, el.dataset.d);
  else if (a === 'close') closeSheet();
  else if (a === 'settings') { palOpen = null; delAsk = null; openSettings(); }
  else if (a === 'catfilter') { hiddenCats.has(id) ? hiddenCats.delete(id) : hiddenCats.add(id); render(); }
  else if (a === 'fprio') { window._fe.prio = el.dataset.p; $$('#f_prio .chip').forEach(b => b.classList.toggle('on', b.dataset.p === el.dataset.p)); }
  else if (a === 'fcat') { window._fe.cat = id; $$('#f_cats .ccat').forEach(b => b.classList.toggle('on', b.dataset.id === id)); }
  else if (a === 'repday') { const d = Number(el.dataset.d), s = window._fe.days; s.has(d) ? (s.size > 1 && s.delete(d)) : s.add(d); el.classList.toggle('on', s.has(d)); window._fe.daysTouched = true; }
  else if (a === 'save') saveEvent();
  else if (a === 'dup') {
    const src = S.events.find(x => x.id === window._fe.id); if (!src) return;
    snap(); const c = Object.assign(structuredClone(src), { id:uid(), title: src.title + ' (копия)', done:false, doneDates:[], skip:[] });
    S.events.push(c); save(); render(); openEvent(c.id, null, window._fe.inst); toast('Создана копия события', true);
  }
  else if (a === 'del') {
    const src = S.events.find(x => x.id === window._fe.id); if (!src) return;
    if (isRec(src)) { $('#f_ask').innerHTML = `<div class="ask"><b>Это повторяющееся событие. Что удалить?</b><div class="row"><button class="btn dng" data-act="delone">Только ${esc(fmtLong(window._fe.inst))}</button><button class="btn dngf" data-act="delall">Все повторения</button><button class="btn" data-act="delcancel">Отмена</button></div></div>`; $('#f_ask').scrollIntoView({ block:'nearest', behavior:'smooth' }); return; }
    snap(); S.events = S.events.filter(x => x.id !== src.id); save(); closeSheet(); render(); toast('Событие удалено', true);
  }
  else if (a === 'delone') { const src = S.events.find(x => x.id === window._fe.id); if (!src) return; snap(); src.skip = [...(src.skip||[]), window._fe.inst]; save(); closeSheet(); render(); toast('Удалено только это повторение', true); }
  else if (a === 'delall') { snap(); S.events = S.events.filter(x => x.id !== window._fe.id); save(); closeSheet(); render(); toast('Удалены все повторения', true); }
  else if (a === 'delcancel') $('#f_ask').innerHTML = '';
  else if (a === 'theme') { S.settings.theme = el.dataset.v; save(); render(); openSettings(true); }
  else if (a === 'density') { S.settings.density = el.dataset.v; save(); lastGridView = null; render(); openSettings(true); }
  else if (a === 'addcat') {
    const used = S.cats.map(c => c.color.toLowerCase()), nid = 'c' + uid();
    S.cats.push({ id:nid, name:'Новая категория', color: PALETTE.find(c => !used.includes(c)) || PALETTE[S.cats.length % PALETTE.length] });
    palOpen = null; save(); render(); openSettings(sheetOpen());
    setTimeout(() => { const i = $(`.cname[data-cat="${nid}"]`); if (i) { i.scrollIntoView({ block:'center' }); i.focus(); i.select(); } }, 60);
  }
  else if (a === 'catpal') { palOpen = palOpen === id ? null : id; openSettings(true); }
  else if (a === 'setcolor') { const c = S.cats.find(x => x.id === id); if (c) { c.color = el.dataset.c; save(); render(); openSettings(true); } }
  else if (a === 'delcat') { if (S.cats.length > 1) { delAsk = id; palOpen = null; openSettings(true); } }
  else if (a === 'delyes') {
    if (S.cats.length > 1) { snap(); S.cats = S.cats.filter(x => x.id !== id); hiddenCats.delete(id); }
    delAsk = null; if (palOpen === id) palOpen = null; save(); render(); openSettings(true); toast('Категория удалена', true);
  }
  else if (a === 'delno') { delAsk = null; openSettings(true); }
  else if (a === 'push') enablePush();
  else if (a === 'ntest') testNotif();
  else if (a === 'export') exportData();
  else if (a === 'import') $('#imp_file').click();
  else if (a === 'shareev') openShare({ kind:'e', id:window._fe.id, inst:window._fe.inst, back:true });
  else if (a === 'sharecat') openShare({ kind:'c', id, back: sheetOpen() && !!$('.catlist') });
  else if (a === 'shareall') openShare({ kind:'a', back: sheetOpen() && !!$('.catlist') });
  else if (a === 'shback') shareBack();
  else if (a === 'shsend') shareSend();
  else if (a === 'shcopy') { if (shareCtx && shareCtx.link) copyText(shareCtx.link, 'Ссылка скопирована'); }
  else if (a === 'shics') shareIcs();
  else if (a === 'incat') { inbox.target = id; $$('#in_cats .ccat').forEach(b => b.classList.toggle('on', b.dataset.id === id)); }
  else if (a === 'inadd') applyIncoming();
  else if (a === 'incopy') copyText(shareURL(inbox.code), 'Ссылка скопирована — вставьте её в поиск ' + APP_NAME);
});
document.addEventListener('dblclick', ev => {
  const mc = ev.target.closest('.mc'); if (!mc || ev.target.closest('.mchip,.mmore,.mc-n')) return;
  openQuick(mc.dataset.d, '', ev.clientX, ev.clientY);
});

function toggleDone(id, k) {
  const e = S.events.find(x => x.id === id); if (!e) return;
  if (isRec(e)) { const s = new Set(e.doneDates || []); s.has(k) ? s.delete(k) : s.add(k); e.doneDates = [...s]; }
  else e.done = !e.done;
  save(); render();
  const es = evOn(k); if (es.length > 1 && es.every(x => x.done)) toast(k === todayK() ? 'Все дела на сегодня сделаны 🎉' : 'Все дела этого дня сделаны 🎉');
}
// Дни недельного повтора следуют за датой, пока пользователь не выбрал их сам
function syncRepDays() {
  const fe = window._fe, d = $('#f_d') && $('#f_d').value; if (!fe || fe.daysTouched || !d) return;
  fe.days = new Set([dowIdx(d)]);
  $$('#f_days .chip').forEach(b => b.classList.toggle('on', fe.days.has(Number(b.dataset.d))));
}
const titleFromForm = raw => { const f = window._fe; return !f.nlOff && f.nl && f.nl.found && f.nl.title ? f.nl.title : raw; };
function saveEvent() {
  const raw = $('#f_t').value.trim(); if (!raw) { $('#f_t').focus(); return; }
  const fe = window._fe, src = fe.id ? S.events.find(x => x.id === fe.id) : null;
  const all = $('#f_all').checked;
  let t1 = all ? '' : $('#f_tm').value, t2 = all || !t1 ? '' : $('#f_tm2').value;
  if (t1 && t2 && timeMin(t2) <= timeMin(t1)) t2 = fmtMin(Math.min(1439, timeMin(t1) + 60));
  const date = $('#f_d').value || sel, rt = $('#f_rep').value;
  const repeat = rt === 'none' ? {type:'none'} : { type:rt, until: $('#f_until').value || '', days: rt === 'weekly' ? [...fe.days].sort() : [] };
  const remV = $('#f_rem').value;
  const data = { title: titleFromForm(raw), date, time:t1, time2:t2, cat:fe.cat, note:$('#f_n').value.trim(), loc:$('#f_loc').value.trim(), repeat,
    reminder:{ enabled: remV !== 'off', offset: remV === 'off' ? 15 : Number(remV), repeat:'none', days:[] }, task: $('#f_task').checked, prio: fe.prio };
  snap();
  if (src) Object.assign(src, data);
  else S.events.push(Object.assign({ id:uid(), done:false, doneDates:[], skip:[] }, data));
  if (rt === 'none' || !src) { sel = date; syncMini(); if (view === 'month') { monthAnchor = pd(date); monthAnchor.setDate(1); } }
  save(); closeSheet(); render();
  toast(src ? 'Изменения сохранены' : `Создано: ${data.title} · ${relDay(date)}${t1 ? ', ' + t1 : ''}`, true);
}

document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.cat) {
    S.cats.find(c => c.id === t.dataset.cat)[t.dataset.f] = t.value; save(); render();
    if (t.dataset.f === 'color') { const sw = $(`.cswatch[data-id="${t.dataset.cat}"]`); if (sw) sw.style.setProperty('--c', t.value); $$(`.cdot[data-id="${t.dataset.cat}"]`).forEach(d => d.classList.remove('on')); }
  }
  else if (t.id === 'cmd_q') cmdUpdate();
  else if (t.id === 'q_t') {
    const q = window._qc, p = parseNL(t.value, q.base); q.nl = p;
    q.date = p.date || q.base; $('#q_when').textContent = fmtLong(q.date);
    if (p.time) { $('#q_tm').value = p.time; $('#q_tm2').value = p.time2 || fmtMin(Math.min(1439, timeMin(p.time) + 60)); }
    else { $('#q_tm').value = q.t1; $('#q_tm2').value = q.t2; }
    if (p.cat) { q.cat = p.cat; $$('#q_cats .ccat').forEach(b => b.classList.toggle('on', b.dataset.id === p.cat)); }
    nlHint(p, '#q_hint');
  }
  else if (t.id === 'f_t' && !window._fe.nlOff) {
    const p = parseNL(t.value, sel); window._fe.nl = p;
    if (p.date) { $('#f_d').value = p.date; syncRepDays(); }
    if (p.time) { $('#f_all').checked = false; $('#f_tm').disabled = $('#f_tm2').disabled = false; $('#f_tm').value = p.time; $('#f_tm2').value = p.time2 || fmtMin(Math.min(1439, timeMin(p.time) + 60)); }
    if (p.cat) { window._fe.cat = p.cat; $$('#f_cats .ccat').forEach(b => b.classList.toggle('on', b.dataset.id === p.cat)); }
    nlHint(p, '#f_hint');
  }
  else if (t.id === 'ds_new') nlHint(t.value.trim() ? parseNL(t.value, sel) : null, '#ds_hint');
  else if (t.id === 'sh_by') refreshShareLink();
});
document.addEventListener('change', e => {
  const t = e.target, st = S.settings;
  if (t.id === 's_ws') { st.weekStart = Number(t.value); save(); render(); }
  else if (t.id === 's_ds') { st.dayStart = Number(t.value); save(); lastGridView = null; render(); }
  else if (t.id === 's_wk') { st.weekends = t.checked; save(); render(); }
  else if (t.id === 's_wn') { st.weekNums = t.checked; save(); render(); }
  else if (t.id === 's_dim') { st.dimPast = t.checked; save(); render(); }
  else if (t.id === 'f_all') { $('#f_tm').disabled = $('#f_tm2').disabled = t.checked; if (!t.checked && !$('#f_tm').value) { $('#f_tm').value = '09:00'; $('#f_tm2').value = '10:00'; } }
  else if (t.id === 'f_tm') { const a = timeMin(t.value), b = timeMin($('#f_tm2').value); if (a != null && (b == null || b <= a)) $('#f_tm2').value = fmtMin(Math.min(1439, a + 60)); }
  else if (t.id === 'f_d') syncRepDays();
  else if (t.id === 'f_task') $('#f_prio').style.display = t.checked ? 'flex' : 'none';
  else if (t.id === 'f_rep') { syncRepDays(); $('#f_repx').style.display = t.value === 'none' ? 'none' : 'block'; $('#f_days').style.display = t.value === 'weekly' ? 'flex' : 'none'; }
  else if (t.id === 'imp_file') importData(t);
  else if (t.id === 'sh_notes') refreshShareLink();
});

// ---- Перетаскивание и растягивание событий ----
const snap15 = m => Math.round(m / 15) * 15;
const pointerMin = (col, y) => startH()*60 + (y - col.getBoundingClientRect().top) / rowH() * 60;
let drag = null, mk = null, lastDragEnd = 0;
document.addEventListener('pointerdown', e => {
  const blk = e.target.closest('.wg-block');
  if (!blk) {
    const col = e.target.closest('.wg-col');
    if (col && e.pointerType === 'mouse' && e.button === 0) { const m = Math.max(startH()*60, Math.floor(pointerMin(col, e.clientY) / 15) * 15); mk = { col, a:m, s:m, e:m + 15, y0:e.clientY, pid:e.pointerId, active:false }; }
    return;
  }
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  const item = S.events.find(x => x.id === blk.dataset.id); if (!item) return;
  const m = timeMin(item.time), m2 = timeMin(item.time2); if (m == null) return;
  const hadEnd = m2 != null && m2 > m, end = hadEnd ? m2 : m + 60;
  const mode = e.target.closest('.wg-rs') ? 'resize' : 'move';
  drag = { id:item.id, inst:blk.dataset.d, blk, col:blk.parentElement, mode, start:m, end, dur:end - m, hadEnd,
    off: pointerMin(blk.parentElement, e.clientY) - (mode === 'move' ? m : end),
    x0:e.clientX, y0:e.clientY, lastX:e.clientX, lastY:e.clientY, pid:e.pointerId,
    touch: e.pointerType !== 'mouse', active:false, newStart:m, newEnd:end };
  if (drag.touch) drag.timer = setTimeout(startDrag, 320);   // на телефоне — долгое нажатие
});
function startDrag() {
  if (!drag || drag.active) return;
  drag.active = true; drag.blk.classList.add('dragging'); document.body.classList.add('dragmode');
  try { if (drag.touch && navigator.vibrate) navigator.vibrate(10); } catch (x) {}
  requestAnimationFrame(autoScrollDrag);
}
document.addEventListener('pointermove', e => {
  if (mk && e.pointerId === mk.pid) {
    if (!mk.active) { if (Math.abs(e.clientY - mk.y0) < 6) return; mk.active = true; mk.ghost = document.createElement('div'); mk.ghost.className = 'wg-ghost'; mk.col.appendChild(mk.ghost); document.body.classList.add('dragmode'); }
    const cur = pointerMin(mk.col, e.clientY);
    mk.s = Math.max(startH()*60, Math.min(mk.a, Math.floor(cur / 15) * 15)); mk.e = Math.min(1440, Math.max(mk.a + 15, Math.ceil(cur / 15) * 15));
    mk.ghost.style.top = ((mk.s - startH()*60) / 60 * rowH()) + 'px'; mk.ghost.style.height = ((mk.e - mk.s) / 60 * rowH() - 2) + 'px';
    mk.ghost.textContent = fmtMin(mk.s) + '–' + fmtMin(mk.e) + ' · ' + durText(mk.e - mk.s);
    return;
  }
  if (!drag || e.pointerId !== drag.pid) return;
  drag.lastX = e.clientX; drag.lastY = e.clientY;
  if (!drag.active) {
    const dist = Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0);
    if (drag.touch) { if (dist > 10) { clearTimeout(drag.timer); drag = null; } return; }
    if (dist < 5) return;
    startDrag();
  }
  updateDrag();
});
document.addEventListener('touchmove', e => { if (drag && drag.active) e.preventDefault(); }, { passive:false });
function updateDrag() {
  if (drag.mode === 'move') {
    const target = $$('.wg-col').find(c => { const r = c.getBoundingClientRect(); return drag.lastX >= r.left && drag.lastX < r.right; });
    if (target && target !== drag.col) { target.appendChild(drag.blk); drag.col = target; }
    const s0 = Math.max(startH()*60, Math.min(1440 - Math.min(drag.dur, 60), snap15(pointerMin(drag.col, drag.lastY) - drag.off)));
    drag.newStart = s0; drag.newEnd = Math.min(1440, s0 + drag.dur);
  } else {
    drag.newEnd = Math.max(drag.start + 15, Math.min(1440, snap15(pointerMin(drag.col, drag.lastY) - drag.off)));
  }
  drag.blk.style.top = ((drag.newStart - startH()*60) / 60 * rowH()) + 'px';
  drag.blk.style.height = Math.max(20, (drag.newEnd - drag.newStart) / 60 * rowH() - 2) + 'px';
  const m = drag.blk.querySelector('.wb-m');
  if (m) m.textContent = (drag.mode === 'resize' || drag.hadEnd) ? fmtMin(drag.newStart) + '–' + fmtMin(drag.newEnd) : fmtMin(drag.newStart);
}
function autoScrollDrag() {
  if (!drag || !drag.active) return;
  const w = $('.wgwrap');
  if (w) {
    const r = w.getBoundingClientRect(), head = (w.querySelector('.wg-stickytop') || {}).offsetHeight || 0;
    let dy = 0;
    if (drag.lastY < r.top + head + 36) dy = -10; else if (drag.lastY > r.bottom - 36) dy = 10;
    if (dy) { w.scrollTop += dy; updateDrag(); }
  }
  requestAnimationFrame(autoScrollDrag);
}
function endDrag(e, cancelled) {
  if (mk && e.pointerId === mk.pid) {
    const m = mk; mk = null; document.body.classList.remove('dragmode');
    if (!m.active) return;
    lastDragEnd = Date.now();
    if (cancelled) { m.ghost.remove(); return; }
    openQuick(m.col.dataset.d, fmtMin(m.s), e.clientX, e.clientY, fmtMin(m.e));
    m.col.appendChild(m.ghost);
    return;
  }
  if (!drag || e.pointerId !== drag.pid) return;
  clearTimeout(drag.timer);
  const d = drag; drag = null;
  document.body.classList.remove('dragmode');
  if (!d.active) return;                       // это был обычный клик — откроется карточка
  lastDragEnd = Date.now();
  if (!cancelled) {
    const item = S.events.find(x => x.id === d.id), nd = d.col.dataset.d;
    if (item) {
      snap();
      if (isRec(item)) { const delta = dayDiff(d.inst, nd); if (delta) { item.date = addDays(item.date, delta); if (item.repeat.type === 'weekly' && item.repeat.days) item.repeat.days = item.repeat.days.map(x => ((x + delta) % 7 + 7) % 7); } }
      else { item.date = nd; sel = nd; }
      item.time = fmtMin(d.newStart); if (d.mode === 'resize' || d.hadEnd) item.time2 = fmtMin(d.newEnd);
      save();
      toast((d.mode === 'resize' ? 'Длительность: ' + durText(d.newEnd - d.newStart) : 'Перенесено на ' + relDay(isRec(item) ? nd : item.date) + ', ' + item.time) + (isRec(item) ? ' (все повторения)' : ''), true);
    }
  }
  render();
}
document.addEventListener('pointerup', e => endDrag(e, false));
document.addEventListener('pointercancel', e => endDrag(e, true));

// ---- Клавиатура ----
document.addEventListener('keydown', e => {
  const t = e.target, typing = /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || '') || t.isContentEditable, mod = e.ctrlKey || e.metaKey;
  if (cmdOpen()) {
    if (e.key === 'Escape') { e.preventDefault(); closeCmd(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); cmdIdx = Math.min(cmdItems.length - 1, cmdIdx + 1); cmdDraw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); cmdIdx = Math.max(0, cmdIdx - 1); cmdDraw(); }
    else if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); cmdRun(cmdIdx); }
    return;
  }
  if (mod && e.code === 'KeyK') { e.preventDefault(); openCmd(); return; }
  if (mod && e.code === 'KeyZ' && !typing) { e.preventDefault(); undo(); return; }
  if (e.key === 'Escape') {
    if (drag) { const d = drag; drag = null; clearTimeout(d.timer); document.body.classList.remove('dragmode'); if (d.active) { lastDragEnd = Date.now(); render(); } return; }
    if (mk) { if (mk.ghost) mk.ghost.remove(); mk = null; document.body.classList.remove('dragmode'); return; }
    if (quickOpen()) { e.preventDefault(); closeQuick(); return; }
    if (sheetOpen()) { e.preventDefault(); if (delAsk) { delAsk = null; openSettings(true); return; } closeSheet(); return; }
    return;
  }
  if (e.key === 'Enter' && !e.isComposing) {
    if (t.id === 'q_t') { e.preventDefault(); $('[data-act="qsave"]').click(); return; }
    if (t.id === 'ds_new') {
      const raw = t.value.trim(); if (!raw) return;
      const p = parseNL(raw, sel);
      quickCreate(p.found && p.title ? p.title : raw, p.date || sel, p.time || '', p.time2 || '', p.cat);
      const i = $('#ds_new'); if (i) i.focus();
      return;
    }
    if (mod && $('#f_t') && sheetOpen()) { e.preventDefault(); saveEvent(); return; }
  }
  if (typing || mod || e.altKey || sheetOpen() || quickOpen()) return;
  const k = e.code;
  if (k === 'Slash' && e.shiftKey || e.key === '?') { e.preventDefault(); openHelp(); }
  else if (k === 'Slash') { e.preventDefault(); openCmd(); }
  else if (k === 'KeyT') goToday();
  else if (k === 'KeyM') setView('month');
  else if (k === 'KeyW') setView('week');
  else if (k === 'KeyD') setView('day');
  else if (k === 'KeyL') setView('list');
  else if (k === 'KeyN' || k === 'KeyC') { e.preventDefault(); createNew(); }
  else if (k === 'ArrowLeft' || k === 'KeyJ') move(-1);
  else if (k === 'ArrowRight' || k === 'KeyK') move(1);
});

// ---- Свайп между периодами ----
let tsx = 0, tsy = 0, tsIn = false;
// В разделах таблицы листаются пальцем вбок — там свайп не переключает месяц
document.addEventListener('touchstart', e => { tsx = e.touches[0].clientX; tsy = e.touches[0].clientY; tsIn = !!(e.target.closest && e.target.closest('[data-hs], .chart, input, textarea')); }, {passive:true});
document.addEventListener('touchend', e => {
  if (!e.changedTouches || tsIn || sheetOpen() || cmdOpen() || quickOpen() || drag || Date.now() - lastDragEnd < 600) return;
  const dx = e.changedTouches[0].clientX - tsx, dy = e.changedTouches[0].clientY - tsy;
  if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5) move(dx < 0 ? 1 : -1);
}, {passive:true});
