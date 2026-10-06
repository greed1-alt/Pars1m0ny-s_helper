// ---- Поделиться: ссылка, файл .ics и приём присланного ----
// Ссылка несёт сами события (сжатые) после «#share=». Часть адреса после «#» не уходит на сервер.
// Это копия: повторная отправка обновляет копию у получателя (по полю src), а не дублирует.
// Друзья и общие календари, которые обновляются сами, появятся вместе с аккаунтами.
const SHARE_MAX = 12000;   // ссылки длиннее мессенджеры могут обрезать
const plural = (n, f) => n + ' ' + f[n % 10 === 1 && n % 100 !== 11 ? 0 : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 1 : 2];
const NEV = ['событие','события','событий'];
const safeColor = c => /^#[0-9a-f]{3,8}$/i.test(c || '') ? c : '#94a3b8';
const isDate = s => /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(s || '');
const isTime = s => /^([01]\d|2[0-3]):[0-5]\d$/.test(s || '');
const b64u = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); };
const pipeBytes = (bytes, stream) => new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer().then(b => new Uint8Array(b));
async function packShare(obj) {
  const raw = new TextEncoder().encode(JSON.stringify(obj));
  if (typeof CompressionStream === 'function') { try { return 'z' + b64u(await pipeBytes(raw, new CompressionStream('deflate-raw'))); } catch (x) {} }
  return 'j' + b64u(raw);
}
async function unpackShare(code) {
  const bytes = b64(code.slice(1));
  const raw = code[0] === 'z' ? await pipeBytes(bytes, new DecompressionStream('deflate-raw')) : bytes;
  const p = JSON.parse(new TextDecoder().decode(raw));
  if (!p || p.v !== 1 || !Array.isArray(p.ev) || !Array.isArray(p.cs) || !p.cs.length) throw new Error('не та ссылка');
  p.dv = String(p.dv || '').slice(0, 40); p.by = String(p.by || '').slice(0, 40);
  p.cs = p.cs.map(c => ({ i:String(c.i), n:String(c.n || 'Календарь').slice(0, 60), c:safeColor(c.c) }));
  return p;
}
const shareCode = s => { const m = String(s || '').match(/#share=([zj][A-Za-z0-9_-]+)/); return m ? m[1] : ''; };
const shareURL = code => location.origin + location.pathname + '#share=' + code;
const liveEv = e => isRec(e) ? !(e.repeat.until && e.repeat.until < todayK()) : e.date >= todayK();
const evWhen = e => relDay(nextOcc(e)) + (e.time ? ', ' + e.time + (e.time2 ? '–' + e.time2 : '') : '') + (isRec(e) ? ' · ' + repText(e).toLowerCase() : '');
const shareListHTML = (list, max) => list.length ? `<div class="shlist">${list.slice(0, max).map(e => `<div class="shrow"><i style="--c:${e.color || cat(e.cat).color}"></i><div><b>${esc(e.title)}</b><small>${esc(evWhen(e))}</small></div></div>`).join('')}${list.length > max ? `<div class="shmore">и ещё ${list.length - max}</div>` : ''}</div>` : '';
// Присланное событие → обычное событие (всё проверяем: ссылка пришла извне)
const fromShared = o => ({
  title: String(o.t || 'Без названия').slice(0, 200), date: isDate(o.d) ? o.d : todayK(),
  time: isTime(o.s) ? o.s : '', time2: isTime(o.s) && isTime(o.e) ? o.e : '',
  repeat: o.r && o.r.type !== 'none' && REP[o.r.type] ? { type:o.r.type, until: isDate(o.r.until) ? o.r.until : '', days: Array.isArray(o.r.days) ? o.r.days.filter(d => Number.isInteger(d) && d >= 0 && d <= 6) : [] } : { type:'none' },
  skip: Array.isArray(o.k) ? o.k.filter(isDate) : [], loc: String(o.l || '').slice(0, 500), note: String(o.n || '').slice(0, 5000),
  reminder: (() => { const l = (Array.isArray(o.ms) ? o.ms : o.m != null ? [o.m] : []).map(Number).filter(v => Number.isFinite(v) && v >= 0 && v <= 525600).slice(0, 10).sort((a, b) => b - a);
    return { enabled: l.length > 0, offsets: l, offset: l.length ? l[l.length - 1] : 15, repeat:'none', days:[] }; })() });

let shareCtx = null, inbox = null;
// kind: 'e' — одно событие, 'c' — календарь (категория), 'a' — все календари
function shareItems(c) {
  if (c.kind === 'e') return S.events.filter(e => e.id === c.id);
  return S.events.filter(e => (c.kind === 'a' || e.cat === c.id) && liveEv(e)).sort((a, b) => nextOcc(a).localeCompare(nextOcc(b)) || (a.time||'').localeCompare(b.time||''));
}
function sharePayload(c) {
  const list = shareItems(c), ids = new Set(list.map(e => e.cat));
  if (c.kind === 'c') ids.add(c.id);
  const cs = S.cats.filter(x => ids.has(x.id)).map(x => ({ i:x.id, n:x.name, c:x.color }));
  if (!cs.length) cs.push({ i:'none', n:'Без категории', c:'#94a3b8' });
  const ev = list.map(e => {
    const o = { i:e.id, c:e.cat, t:e.title, d:e.date };
    if (e.time) o.s = e.time; if (e.time2) o.e = e.time2;
    if (isRec(e)) { o.r = e.repeat; if (e.skip && e.skip.length) o.k = e.skip; }
    const rm = remOffs(e); if (rm.length) { o.m = rm[rm.length - 1]; if (rm.length > 1) o.ms = rm; }   // m — для старых версий приложения
    if (c.notes) { if (e.loc) o.l = e.loc; if (e.note) o.n = e.note; }
    return o;
  });
  const p = { v:1, k:c.kind, dv:S.settings.dev, cs, ev }, by = (S.settings.name || '').trim();
  if (by) p.by = by;
  return p;
}
function openShare(c) {
  closeQuick();
  const list = shareItems(c);
  if (c.kind === 'e' && !list.length) return;
  shareCtx = Object.assign({ notes: c.kind === 'e', link:'', tok:0 }, c);
  const e0 = list[0], cc = c.kind === 'c' ? cat(c.id) : null, hasNotes = list.some(e => e.note || e.loc);
  const what = c.kind === 'e' ? 'событием' : 'календарём';
  const preview = c.kind === 'e'
    ? `<div class="shv" style="--c:${cat(e0.cat).color}"><b>${esc(e0.title)}</b><small>${esc(evWhen(e0))}</small>${e0.loc ? `<small>${esc(e0.loc)}</small>` : ''}</div>`
    : `<div class="shv" style="--c:${cc ? cc.color : 'var(--acc)'}"><b>${cc ? esc(cc.name) : 'Все календари'}</b><small>${list.length ? plural(list.length, NEV) + ' — текущие и будущие' : 'Пока нет текущих и будущих событий'}</small></div>${shareListHTML(list, 5)}`;
  sheet(`<div class="sh-head">${c.back ? `<button class="ic" data-act="shback" aria-label="Назад" title="Назад">${I(IC.left,18)}</button>` : ''}<h3>Поделиться ${what}</h3><button class="ic" data-act="close" title="Закрыть (Esc)" aria-label="Закрыть">${I(IC.x,18)}</button></div>
  ${preview}
  <div class="frow"><span class="fl">Подпись</span><input id="sh_by" class="fin" type="text" value="${esc(S.settings.name || '')}" placeholder="Ваше имя" maxlength="40" autocomplete="off"></div>
  ${hasNotes ? `<div class="frow"><span class="fl">Заметки</span><label class="swl" style="margin-top:9px"><input id="sh_notes" class="sw" type="checkbox"${shareCtx.notes ? ' checked' : ''}> Отправить с заметками и местом</label></div>` : ''}
  <div class="shbtns">
    ${navigator.share ? `<button class="btn pri" data-act="shsend" disabled>${I(IC.share,16)} Отправить…</button>` : ''}
    <div class="row"><button class="btn${navigator.share ? '' : ' pri'}" data-act="shcopy" disabled>${I(IC.link,16)} Скопировать ссылку</button><button class="btn" data-act="shics">${I(IC.down,16)} Файл .ics</button></div>
  </div>
  <div id="sh_msg"></div>
  <p class="set-note">Получатель откроет ссылку в ${APP_NAME} и добавит ${c.kind === 'e' ? 'событие' : 'события'} к себе. Это копия: если что-то поменяете — отправьте ссылку ещё раз, у получателя всё обновится без дублей.</p>
  <p class="set-note">Файл .ics открывается в Google, Apple и Яндекс Календаре.</p>`);
  refreshShareLink();
}
// Ссылку готовим заранее: iPhone разрешает «Поделиться» и копирование только сразу после нажатия
async function refreshShareLink() {
  const c = shareCtx; if (!c) return;
  const by = $('#sh_by'), nt = $('#sh_notes'), tok = ++c.tok;
  if (by && by.value.trim() !== (S.settings.name || '')) { S.settings.name = by.value.trim(); save(); }
  if (nt) c.notes = nt.checked;
  const code = await packShare(sharePayload(c));
  if (shareCtx !== c || tok !== c.tok) return;
  c.link = shareURL(code);
  const long = c.link.length > SHARE_MAX;
  $$('[data-act=shsend],[data-act=shcopy]').forEach(b => b.disabled = long);
  const m = $('#sh_msg'); if (m) m.innerHTML = long ? '<p class="shnote">Слишком много событий для одной ссылки — мессенджер может её обрезать. Отправьте <b>файл .ics</b> или поделитесь календарями по отдельности.</p>' : '';
}
function shareSend() {
  const c = shareCtx; if (!c || !c.link) return;
  const list = shareItems(c);
  const text = c.kind === 'e' ? `${list[0].title} — ${evWhen(list[0])}` : `${c.kind === 'c' ? 'Календарь «' + cat(c.id).name + '»' : 'Мой календарь'} в ${APP_NAME} · ${plural(list.length, NEV)}`;
  navigator.share({ title:APP_NAME, text, url:c.link }).catch(x => { if (x.name !== 'AbortError') copyText(c.link, 'Ссылка скопирована'); });
}
function copyText(s, ok) {
  const showField = () => { const m = $('#sh_msg'); if (!m) return; m.innerHTML = `<input class="fin shlink" readonly value="${esc(s)}">`; const i = m.querySelector('input'); i.focus(); i.select(); toast('Скопируйте ссылку из поля'); };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(s).then(() => toast(ok), showField);
  else showField();
}
function shareBack() {
  const c = shareCtx; shareCtx = null;
  if (!c) return closeSheet();
  if (c.kind === 'e') return openEvent(c.id, null, c.inst);
  palOpen = null; delAsk = null; openSettings();
  setTimeout(() => { const l = $('.catlist'); if (l) l.scrollIntoView({ block:'center' }); }, 30);
}

// Файл .ics (стандарт RFC 5545): время «плавающее» — у получателя событие встанет на те же часы
function icsText(list, calName, notes) {
  const dt = (d, t) => d.replace(/-/g, '') + (t ? 'T' + t.replace(':', '') + '00' : '');
  const txt = s => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const fold = line => {   // строки не длиннее 75 байт
    const parts = []; let cur = '', n = 0, lim = 75;
    for (const ch of line) { const cp = ch.codePointAt(0), b = cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4; if (n + b > lim) { parts.push(cur); cur = ''; n = 0; lim = 74; } cur += ch; n += b; }
    parts.push(cur); return parts.join('\r\n ');
  };
  const BY = ['MO','TU','WE','TH','FR','SA','SU'], stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Napominalka//RU', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  if (calName) L.push('X-WR-CALNAME:' + txt(calName));
  list.forEach(e => {
    L.push('BEGIN:VEVENT', 'UID:' + e.id + '@napominalka', 'DTSTAMP:' + stamp, 'SUMMARY:' + txt(e.title));
    // Начало — первый настоящий день повтора: другие календари всегда показывают DTSTART, даже если он не по правилу
    let d0 = e.date;
    if (isRec(e)) for (let i = 0; i < 400 && !occurs(e, d0); i++) d0 = addDays(d0, 1);
    if (e.time) { const end = e.time2 && timeMin(e.time2) > timeMin(e.time) ? e.time2 : fmtMin(Math.min(1439, timeMin(e.time) + 60)); L.push('DTSTART:' + dt(d0, e.time), 'DTEND:' + dt(d0, end)); }
    else L.push('DTSTART;VALUE=DATE:' + dt(d0), 'DTEND;VALUE=DATE:' + dt(addDays(d0, 1)));
    if (isRec(e)) {
      const r = e.repeat;
      let rule = { daily:'FREQ=DAILY', weekdays:'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', weekly:'FREQ=WEEKLY;BYDAY=' + (r.days && r.days.length ? r.days : [dowIdx(e.date)]).map(i => BY[i]).join(','), monthly:'FREQ=MONTHLY', yearly:'FREQ=YEARLY' }[r.type];
      if (rule) { if (r.until) rule += ';UNTIL=' + dt(r.until) + (e.time ? 'T235959' : ''); L.push('RRULE:' + rule); }
      (e.skip || []).forEach(k => L.push(e.time ? 'EXDATE:' + dt(k, e.time) : 'EXDATE;VALUE=DATE:' + dt(k)));
    }
    if (notes && e.loc) L.push('LOCATION:' + txt(e.loc));
    if (notes && e.note) L.push('DESCRIPTION:' + txt(e.note));
    remOffs(e).forEach(m => L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + txt(e.title), 'TRIGGER:-PT' + m + 'M', 'END:VALARM'));
    L.push('END:VEVENT');
  });
  L.push('END:VCALENDAR');
  return L.map(fold).join('\r\n') + '\r\n';
}
function shareIcs() {
  const c = shareCtx; if (!c) return;
  const list = shareItems(c); if (!list.length) return toast('Нет событий для файла');
  const name = c.kind === 'c' ? cat(c.id).name : c.kind === 'a' ? APP_NAME : '';
  const fname = (c.kind === 'e' ? list[0].title : name).replace(/[\\/:*?"<>|#%]+/g, ' ').trim().slice(0, 40) || 'napominalka';
  const file = new File([icsText(list, name, c.notes)], fname + '.ics', { type:'text/calendar' });
  // На телефоне — меню «Поделиться» (там есть «Сохранить в Файлы» и мессенджеры), на ПК — обычное скачивание
  if (matchMedia('(pointer:coarse)').matches && navigator.canShare && navigator.canShare({ files:[file] })) navigator.share({ files:[file], title:fname }).catch(() => {});
  else { saveFile(file, file.name); toast('Файл .ics сохранён'); }
}

// ---- Приём присланной ссылки ----
async function openShareCode(code) {
  let p;
  try { p = await unpackShare(code); } catch (x) { return toast('Ссылка повреждена или обрезана — попросите прислать её ещё раз'); }
  closeCmd(); closeQuick();
  const sc = p.cs[0], pre = p.dv + ':';
  const prev = S.cats.find(x => x.src === pre + sc.i), same = S.cats.find(x => x.name.trim().toLowerCase() === sc.n.trim().toLowerCase());
  const own = p.dv === S.settings.dev && S.cats.find(x => x.id === sc.i);
  // Куда класть: прежняя копия этого календаря → свой календарь → для события тот же по названию, для календаря новый
  const target = prev ? prev.id : own ? own.id : p.k === 'e' ? (same || S.cats[0]).id : 'new';
  inbox = { p, code, target };
  drawInbox();
}
function drawInbox() {
  const b = inbox, p = b.p, sc = p.cs[0], pre = p.dv + ':';
  const colorOf = o => (p.cs.find(x => x.i === o.c) || sc).c;
  const evs = p.ev.map(o => Object.assign(fromShared(o), { color: colorOf(o) }));
  const prev = S.cats.find(x => x.src === pre + sc.i), own = p.dv === S.settings.dev;
  const safari = isIOS && navigator.standalone !== true;
  let body;
  if (p.k === 'e') { const e = evs[0] || fromShared({}); body = `<div class="shv" style="--c:${e.color || sc.c}"><b>${esc(e.title)}</b><small>${esc(evWhen(e))}</small>${e.loc ? `<small>${esc(e.loc)}</small>` : ''}${e.note ? `<p>${esc(e.note)}</p>` : ''}</div>`; }
  else body = `<div class="shv" style="--c:${p.k === 'c' ? sc.c : 'var(--acc)'}"><b>${p.k === 'c' ? esc(sc.n) : esc(p.cs.map(c => c.n).join(', '))}</b><small>${evs.length ? plural(evs.length, NEV) : 'Пока без событий'}</small></div>${shareListHTML(evs, 30)}`;
  const where = p.k === 'a'
    ? `<p class="set-note" style="margin-top:0">Каждый календарь появится у вас отдельно${p.by ? ` с подписью «· ${esc(p.by)}»` : ''}. Если вы уже добавляли их раньше — они обновятся.</p>`
    : `<div class="frow" style="border-top:0"><span class="fl">Куда</span><div class="ccats" id="in_cats">${prev ? '' : `<button type="button" class="ccat${b.target === 'new' ? ' on' : ''}" data-act="incat" data-id="new" style="--c:${sc.c}"><i></i>Новый «${esc(sc.n)}»</button>`}${catChips(b.target, 'incat')}</div></div>
      ${prev && p.k === 'c' ? '<p class="set-note" style="margin-top:0">Вы уже добавляли этот календарь — он обновится: новые события появятся, изменённые поменяются.</p>' : ''}`;
  const n = evs.length, addLbl = p.k === 'e' ? 'Добавить в календарь' : n ? 'Добавить ' + plural(n, NEV) : 'Добавить календарь';
  sheet(`<div class="sh-head"><h3>Вам прислали</h3><button class="ic" data-act="close" title="Закрыть (Esc)" aria-label="Закрыть">${I(IC.x,18)}</button></div>
  ${p.by ? `<p class="set-note" style="margin:0 0 8px"><b style="color:var(--tx)">${esc(p.by)}</b> делится ${p.k === 'e' ? 'событием' : 'календарём'}</p>` : ''}
  ${body}${where}
  ${own ? '<p class="shnote">Это ваша собственная ссылка — эти события уже есть в календаре. Если добавить, появятся копии.</p>' : ''}
  ${safari ? '<p class="shnote">Ссылка открылась в Safari, а не в приложении на экране «Домой» — у них раздельная память. Чтобы добавить в приложение: <b>скопируйте ссылку</b>, откройте ' + APP_NAME + ' с экрана «Домой», нажмите поиск и вставьте ссылку.</p>' : ''}
  <div class="shbtns">${safari
    ? `<button class="btn pri" data-act="incopy">${I(IC.link,16)} Скопировать ссылку</button><div class="row"><button class="btn" data-act="inadd">Добавить здесь</button><button class="btn" data-act="close">Не нужно</button></div>`
    : `<div class="row"><button class="btn pri" data-act="inadd">${I(IC.plus,16)} ${addLbl}</button><button class="btn" data-act="close" style="flex:0 0 auto">Не нужно</button></div>`}</div>
  <div id="sh_msg"></div>`);
}
function applyIncoming() {
  const b = inbox; if (!b) return;
  const p = b.p, pre = p.dv + ':', tmap = {};
  snap();
  const newCat = sc => { const c = { id:'c' + uid(), name: sc.n + (p.by ? ' · ' + p.by : ''), color:sc.c, src:pre + sc.i }; S.cats.push(c); return c.id; };
  p.cs.forEach(sc => {
    if (p.k === 'a') { const prev = S.cats.find(x => x.src === pre + sc.i); tmap[sc.i] = prev ? prev.id : newCat(sc); }
    else tmap[sc.i] = b.target === 'new' ? newCat(sc) : validCat(b.target);
  });
  let added = 0, upd = 0, first = null;
  const seen = new Set();
  p.ev.forEach(o => {
    const src = pre + String(o.i), data = Object.assign(fromShared(o), { cat: tmap[o.c] || tmap[p.cs[0].i] });
    seen.add(src);
    let ex = S.events.find(x => x.src === src);
    if (ex) { Object.assign(ex, data); upd++; }
    else { ex = Object.assign({ id:uid(), src, done:false, doneDates:[], skip:[] }, data); S.events.push(ex); added++; }
    first = first || ex;
  });
  // Календарь прислали снова: убираем из нашей копии текущие события, которых у отправителя больше нет
  let rem = 0;
  if (p.k !== 'e') {
    const copies = new Set(Object.values(tmap).filter(id => { const c = S.cats.find(x => x.id === id); return c && c.src && c.src.startsWith(pre); }));
    const before = S.events.length;
    S.events = S.events.filter(x => !(copies.has(x.cat) && x.src && x.src.startsWith(pre) && !seen.has(x.src) && liveEv(x)));
    rem = before - S.events.length;
  }
  Object.values(tmap).forEach(id => hiddenCats.delete(id));
  inbox = null;
  if (first) { sel = nextOcc(first); syncMini(); monthAnchor = pd(sel); monthAnchor.setDate(1); }
  save(); closeSheet(); render();
  const parts = []; if (added) parts.push('добавлено ' + plural(added, NEV)); if (upd) parts.push('обновлено ' + plural(upd, NEV)); if (rem) parts.push('убрано ' + plural(rem, NEV));
  const msg = parts.length ? parts.join(', ') : 'календарь добавлен';
  toast(msg[0].toUpperCase() + msg.slice(1), true);
}
function checkShareHash() {
  const code = shareCode(location.hash); if (!code) return;
  history.replaceState(null, '', location.pathname + location.search);
  openShareCode(code);
}
addEventListener('hashchange', checkShareHash);

// ---- Данные: копия и загрузка ----
function saveFile(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function exportData() {
  saveFile(new Blob([JSON.stringify(S, null, 2)], { type:'application/json' }), `parsimony-${todayK()}.json`);
  toast('Копия сохранена в файл');
}
function importData(input) {
  const f = input.files && input.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      if (!d || !Array.isArray(d.events) || !Array.isArray(d.cats)) throw new Error('это не копия ' + APP_NAME);
      snap();
      S.events = d.events; S.cats = d.cats.length ? d.cats : S.cats; S.templates = Array.isArray(d.templates) ? d.templates : S.templates;
      ['habits', 'bio', 'fin', 'focus', 'ygoal', 'notes', 'hnotes', 'goals'].forEach(k => { if (d[k] !== undefined) S[k] = d[k]; });
      if (d.goals === undefined) delete S.goals;   // старая копия: цели соберутся из «Фокуса месяца» и «Цели на год»
      if (d.settings) S.settings = Object.assign({}, DEF.settings, d.settings);
      migrate(); save(); closeSheet(); render(); toast(`Загружено событий: ${S.events.length}`, true);
    } catch (x) { toast('Не получилось загрузить: ' + x.message); }
    input.value = '';
  };
  r.readAsText(f);
}
