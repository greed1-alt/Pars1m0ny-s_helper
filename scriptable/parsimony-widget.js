// Parsimony — виджет для iPhone (приложение Scriptable). 25 ноября 2026.
// Ставится так: Parsimony → Настройки → «Виджет iPhone» → «Скопировать код» → Scriptable → «+» → вставить → назвать «Parsimony».
// Что умеет:
//  • виджет на экране «Домой» и блокировки: дела на сегодня, сколько сделано, привычки;
//  • нажатие на виджет — диктовка: «завтра в 10 стоматолог, напомни за час» — помощник Parsimony разберёт и добавит;
//  • задачи Parsimony ↔ список «Parsimony» в «Напоминаниях» iPhone: отметили там — отмечено в Parsimony, добавили туда — появилось
//    в Parsimony. Название и срок задачи меняются в Parsimony (в «Напоминаниях» они перезапишутся при следующей синхронизации).
// Ключ ниже — только для виджета: по нему видны дела на сегодня и задачи и можно добавлять записи. Если код попал к кому-то ещё —
// Parsimony → Настройки → «Виджет iPhone» → «Новый ключ»: старый перестанет работать.
const KEY = '__KEY__';
const API = 'https://api.parsimony.ru/functions/v1/calendar';
const VER = 250;            // версия кода — видна внизу экрана, чтобы понять, что код обновлён
const LIST = 'Parsimony';   // список в «Напоминаниях»
const C = {
  bg: Color.dynamic(new Color('#ffffff'), new Color('#1c1c1e')),
  tx: Color.dynamic(new Color('#1c1c1e'), new Color('#f2f2f7')),
  mut: Color.dynamic(new Color('#7c7a99'), new Color('#aeaad8')),
  dim: Color.dynamic(new Color('#c9c7e6'), new Color('#4a4580')),
  red: Color.dynamic(new Color('#ff3b30'), new Color('#ff453a')),
  acc: Color.dynamic(new Color('#5b5bd6'), new Color('#8b8bff')),
  ok: Color.dynamic(new Color('#34c759'), new Color('#30d158'))
};
const pad = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const hm = d => pad(d.getHours()) + ':' + pad(d.getMinutes());

async function call(body) {
  const r = new Request(API);
  r.method = 'POST'; r.timeoutInterval = 60;
  r.headers = { 'Content-Type': 'application/json' };
  r.body = JSON.stringify(Object.assign({ w: KEY }, body));
  const j = await r.loadJSON();
  const code = r.response && r.response.statusCode;
  if (code >= 400 || !j || j.error) throw new Error(WHY[j && j.error] || 'Сервер не ответил (' + (code || 'нет связи') + ')');
  return j;
}
const WHY = { key: 'Ключ не подходит — скопируйте код заново в Parsimony → Настройки → «Виджет iPhone»', ailimit: 'Помощник на сегодня всё — лимит сообщений закончился',
  ai: 'Помощник не ответил — попробуйте ещё раз', limit: 'Слишком часто — попробуйте позже', nodata: 'В Parsimony ещё нет записей — откройте приложение один раз', busy: 'Записи сейчас меняются — попробуйте ещё раз' };

// ---- Виджет: «Лента дня» (выбор пользователя 25 ноября 2026 из трёх вариантов) ----
// Слева — день недели, число, сколько дел сделано и привычки кружками; справа — дела по времени: ближайшее подсвечено цветом
// своего календаря, сделанные — с галочкой. Нажатие — сказать, что добавить (без перехода в Scriptable — командой в «Командах»).
const WD = ['ВОСКРЕСЕНЬЕ', 'ПОНЕДЕЛЬНИК', 'ВТОРНИК', 'СРЕДА', 'ЧЕТВЕРГ', 'ПЯТНИЦА', 'СУББОТА'];
const hex = s => /^#[0-9a-f]{6}$/i.test(s || '') ? s : '';
const catC = x => hex(x.c) ? new Color(x.c) : C.acc;
function txt(st, s, font, color, lines) { const t = st.addText(s); t.font = font; t.textColor = color; if (lines) t.lineLimit = lines; return t; }
function img(st, name, size, color) { const i = st.addImage(SFSymbol.named(name).image); i.imageSize = new Size(size, size); i.tintColor = color; return i; }
function dayOf(sum) { const d = new Date(sum.day + 'T12:00:00'); return { wd: WD[d.getDay()], n: String(d.getDate()) }; }
// Какие дела показать: с последнего перед ближайшим и дальше по времени (всё сделано — последние)
function pick(items, max, now) {
  let i = items.findIndex(x => !x.done && x.tm && x.tm >= now);
  if (i < 0) i = items.findIndex(x => !x.done);
  if (i < 0) i = items.length;
  let from = Math.max(0, i - 1); if (items.length - from < max) from = Math.max(0, items.length - max);
  return { rows: items.slice(from, from + max), next: items[i] || null, end: Math.min(items.length, from + max) };
}
// Несделанные для маленького виджета: сначала предстоящие, потом без времени, потом прошедшие
const undone = (items, now) => { const u = items.filter(x => !x.done); return u.filter(x => x.tm && x.tm >= now).concat(u.filter(x => !x.tm), u.filter(x => x.tm && x.tm < now)); };
function dots(st, hs) {   // привычки кружками: закрашен — отмечена, по 7 в ряд
  const all = hs.slice(0, 12);
  for (let r = 0; r < all.length; r += 7) {
    if (r) st.addSpacer(3);
    const row = st.addStack(); row.spacing = 2;
    all.slice(r, r + 7).forEach(h => img(row, h.done ? 'circle.fill' : 'circle', 8, h.done ? C.ok : C.dim));
  }
}
function dayCol(st, sum, big) {
  const c = st.addStack(); c.layoutVertically(); c.size = new Size(big ? 74 : 70, 0);
  const d = dayOf(sum);
  txt(c, d.wd, Font.boldSystemFont(11), C.red, 1).minimumScaleFactor = 0.6;
  txt(c, d.n, Font.lightSystemFont(big ? 44 : 38), C.tx, 1);
  if (sum.n) { c.addSpacer(6); txt(c, 'дела ' + sum.done + '/' + sum.n, Font.mediumSystemFont(11), C.mut, 1); }
  if (sum.hn && !big) { c.addSpacer(7); dots(c, sum.habits); c.addSpacer(4); txt(c, 'привычки', Font.systemFont(11), C.mut, 1); }
  c.addSpacer();
}
function habBlock(w, sum, hb) {
  txt(w, 'ПРИВЫЧКИ  ' + sum.hdone + '/' + sum.hn, Font.boldSystemFont(11), C.mut, 1);
  w.addSpacer(6);
  for (let i = 0; i < hb.length; i += 2) {
    if (i) w.addSpacer(6);
    const r = w.addStack(); r.spacing = 10;
    hb.slice(i, i + 2).forEach(h => { const c = r.addStack(); c.size = new Size(148, 0); c.centerAlignContent(); c.spacing = 6;
      img(c, h.done ? 'checkmark.circle.fill' : 'circle', 13, h.done ? C.ok : C.dim); txt(c, (h.e ? h.e + ' ' : '') + h.n, Font.systemFont(13), h.done ? C.mut : C.tx, 1); c.addSpacer(); });
  }
  if (sum.hn > hb.length) { w.addSpacer(4); txt(w, 'и ещё ' + (sum.hn - hb.length), Font.systemFont(11), C.mut, 1); }
}
function lineRow(st, x, isNext, size) {
  const r = st.addStack(); r.centerAlignContent(); r.spacing = 7;
  if (isNext) { const h = hex(x.c) || '#5b5bd6'; r.backgroundColor = Color.dynamic(new Color(h, 0.14), new Color(h, 0.32)); r.cornerRadius = 9; r.setPadding(4, 6, 4, 6); }
  else r.setPadding(0, 6, 0, 6);
  const t = r.addStack(); t.size = new Size(36, 0);
  txt(t, x.tm || '—', isNext ? Font.boldSystemFont(11) : Font.systemFont(11), isNext ? catC(x) : C.mut, 1);
  const ic = r.addStack(); ic.size = new Size(12, 12); ic.centerAlignContent(); ic.addSpacer();
  if (x.done) img(ic, 'checkmark.circle.fill', 12, C.ok); else img(ic, 'circle.fill', 9, catC(x));
  ic.addSpacer();
  txt(r, x.t, isNext ? Font.semiboldSystemFont(size) : Font.systemFont(size), x.done ? C.mut : C.tx, 1);
  r.addSpacer();
}
function barRow(st, x) {
  const r = st.addStack(); r.spacing = 7; r.centerAlignContent();
  const b = r.addStack(); b.size = new Size(3, 30); b.backgroundColor = catC(x); b.cornerRadius = 1.5;
  const v = r.addStack(); v.layoutVertically();
  txt(v, x.tm || 'без времени', Font.semiboldSystemFont(11), catC(x), 1);
  txt(v, x.t, Font.semiboldSystemFont(13), C.tx, 1);
}
function buildWidget(sum, err) {
  const fam = config.widgetFamily || 'medium', w = new ListWidget(), now = hm(new Date());
  w.url = URLScheme.forRunningScript() + '?act=say';
  let refresh = Date.now() + 15 * 60e3;
  if (fam.startsWith('accessory')) {   // экран блокировки
    if (err) { txt(w, 'Parsimony: нет связи', Font.semiboldSystemFont(12), Color.white(), 2); return w; }
    const u = undone(sum.items, now), n = u[0];
    if (fam === 'accessoryCircular') { const t = txt(w, sum.done + '/' + sum.n, Font.boldRoundedSystemFont(17), Color.white(), 1); t.centerAlignText(); t.minimumScaleFactor = 0.6; const l = txt(w, 'дела', Font.systemFont(10), Color.white(), 1); l.centerAlignText(); return w; }
    if (fam === 'accessoryInline') { txt(w, n ? (n.tm ? n.tm + ' ' : '') + n.t : 'Дела ' + sum.done + '/' + sum.n, Font.systemFont(12), Color.white(), 1); return w; }
    txt(w, 'Дела ' + sum.done + '/' + sum.n + (sum.hn ? ' · привычки ' + sum.hdone + '/' + sum.hn : ''), Font.semiboldSystemFont(12), Color.white(), 1).minimumScaleFactor = 0.7;
    if (n) txt(w, (n.tm ? n.tm + ' ' : '') + n.t, Font.systemFont(13), Color.white(), 2);
    return w;
  }
  // Фон — мягкий градиент, не чёрный (пользователь: «сам виджет все еще черный»): светлый лавандовый / глубокий фиолетовый
  const bg = new LinearGradient(); bg.locations = [0, 1];
  bg.colors = [Color.dynamic(new Color('#ffffff'), new Color('#2a2463')), Color.dynamic(new Color('#ecebff'), new Color('#141233'))];
  w.backgroundGradient = bg;
  if (err) { w.setPadding(14, 15, 14, 15); txt(w, 'Parsimony', Font.semiboldSystemFont(13), C.acc, 1); w.addSpacer(6); txt(w, err, Font.systemFont(12), C.mut, 4); w.addSpacer(); return w; }
  if (fam === 'small') {
    w.setPadding(13, 14, 13, 14);
    const d = dayOf(sum);
    txt(w, d.wd, Font.boldSystemFont(11), C.red, 1).minimumScaleFactor = 0.6;
    txt(w, d.n, Font.lightSystemFont(34), C.tx, 1);
    w.addSpacer();
    const u = undone(sum.items, now);
    if (!u.length) txt(w, sum.n ? 'Всё сделано' : 'На сегодня пусто', Font.semiboldSystemFont(13), sum.n ? C.ok : C.mut, 2);
    u.slice(0, 2).forEach((x, i) => { if (i) w.addSpacer(5); barRow(w, x); });
    const nx = u.find(x => x.tm && x.tm >= now); if (nx) refresh = Math.min(refresh, +new Date(sum.day + 'T' + nx.tm + ':00') + 60e3);
    w.refreshAfterDate = new Date(Math.max(Date.now() + 60e3, refresh));
    return w;
  }
  const big = fam === 'large' || fam === 'extraLarge';
  w.setPadding(14, 15, 14, 13);
  const top = w.addStack(); top.topAlignContent(); top.spacing = 12;
  dayCol(top, sum, big);
  const col = top.addStack(); col.layoutVertically(); col.spacing = big ? 8 : 5;
  const hb = big ? sum.habits.slice(0, 8) : [], p = pick(sum.items, big ? (hb.length > 4 ? 7 : hb.length ? 8 : 10) : 4, now);
  if (!p.rows.length) { col.addSpacer(4); txt(col, 'На сегодня пусто', Font.semiboldSystemFont(14), C.tx, 1); txt(col, 'Нажмите и скажите, что запланировать', Font.systemFont(12), C.mut, 2); }
  p.rows.forEach(x => lineRow(col, x, x === p.next, big ? 14 : 13));
  if (sum.n > p.end) { const m = col.addStack(); m.setPadding(0, 6, 0, 6); txt(m, 'и ещё ' + (sum.n - p.end), Font.systemFont(11), C.mut, 1); }
  w.addSpacer();
  if (hb.length) habBlock(w, sum, hb);   // большой: привычки с названиями (в колонке дня их тогда нет)
  if (p.next && p.next.tm && p.next.tm >= now) refresh = Math.min(refresh, +new Date(sum.day + 'T' + p.next.tm + ':00') + 60e3);
  w.refreshAfterDate = new Date(Math.max(Date.now() + 60e3, refresh));
  return w;
}

// ---- «Напоминания» iPhone ↔ задачи Parsimony ----
// Состояние — в файле Scriptable: какая задача Parsimony ↔ какое напоминание и была ли она отмечена при прошлой синхронизации
async function remList() {
  try { return await Calendar.forRemindersByTitle(LIST); } catch (e) { return await Calendar.createForReminders(LIST); }
}
const mark = r => { const m = /parsimony:([\w-]+)/.exec(r.notes || ''); return m ? m[1] : null; };
const PRIO = { urgent: 1, high: 1, mid: 5, low: 9 };
async function syncReminders() {
  const cal = await remList(), fm = FileManager.local(), path = fm.joinPath(fm.documentsDirectory(), 'parsimony-sync.json');
  let st = { m: {} }; try { if (fm.fileExists(path)) st = JSON.parse(fm.readString(path)) || st; } catch (e) {}
  if (!st.m) st.m = {};
  const rems = await Reminder.all([cal]), byId = {};
  rems.forEach(r => { byId[r.identifier] = r; });
  // 1) что изменилось в «Напоминаниях»: отметки у наших и новые (без метки, не выполненные)
  const done = [], add = [];
  for (const r of rems) {
    const pid = mark(r);
    if (pid) { const s = st.m[pid]; if (s && !!r.isCompleted !== !!s.done) done.push({ id: pid, v: !!r.isCompleted }); }
    else if (!r.isCompleted && r.title) add.push({ k: r.identifier, t: r.title, d: r.dueDate ? ymd(r.dueDate) : null, tm: r.dueDate && r.dueDateIncludesTime ? hm(r.dueDate) : '' });
  }
  const j = await call({ op: 'sync', done, add: add.slice(0, 50) });
  for (const k in j.add) { const r = byId[k]; if (!r) continue; r.notes = ((r.notes || '') + '\nparsimony:' + j.add[k]).trim(); r.save(); st.m[j.add[k]] = { rid: k, done: !!r.isCompleted }; }
  // 2) задачи Parsimony → «Напоминания»
  let made = 0, changed = 0;
  for (const t of j.tasks || []) {
    const s = st.m[t.id];
    let r = (s && s.rid && byId[s.rid]) || rems.find(x => mark(x) === t.id), isNew = false;
    if (!r) {
      if (s) { s.gone = true; continue; }            // напоминание удалили на iPhone — заново не создаём
      if (t.done) { st.m[t.id] = { rid: null, done: true, gone: true }; continue; }   // уже сделанное не переносим
      r = new Reminder(); r.calendar = cal; r.notes = 'parsimony:' + t.id; made++; isNew = true;
    }
    const due = new Date(t.d + 'T' + (t.tm || '09:00') + ':00');
    const same = r.title === t.t && r.dueDate && r.dueDate.getTime() === due.getTime() && !!r.dueDateIncludesTime === !!t.tm && !!r.isCompleted === !!t.done && r.priority === PRIO[t.p];
    if (!same) {
      r.title = t.t; r.dueDate = due; r.dueDateIncludesTime = !!t.tm; r.priority = PRIO[t.p] || 5; r.isCompleted = !!t.done;
      r.save(); if (!isNew) changed++;
    }
    st.m[t.id] = { rid: r.identifier, done: !!t.done };
  }
  fm.writeString(path, JSON.stringify(st));
  return { up: done.length + Object.keys(j.add).length, made, changed };
}

// ---- Голос: сказать → помощник Parsimony разберёт и добавит ----
const RES_T = { task: 'Задача', event: 'Событие', expense: 'Трата', income: 'Доход', saving: 'Накопление', note: 'Заметка', check: 'Привычка' };
const RU_M = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const remTxt = rem => rem.map(m => m >= 1440 ? Math.round(m / 1440) + ' д' : m >= 60 ? Math.round(m / 60) + ' ч' : m + ' мин').join(' и ');
function whenTxt(d) {
  const t = new Date(), t1 = new Date(Date.now() + 864e5);
  if (d === ymd(t)) return 'сегодня'; if (d === ymd(t1)) return 'завтра';
  const [y, m, dd] = d.split('-'); return Number(dd) + ' ' + RU_M[Number(m) - 1];
}
function resLine(x) {   // для уведомления команды
  if (!x.ok) return '— ' + (x.t || RES_T[x.type] || 'Запись') + ': ' + (x.why || 'не получилось');
  let s = '✓ ' + (RES_T[x.type] || 'Запись') + ': ' + x.t;
  if (x.d) s += ' — ' + whenTxt(x.d);
  if (x.tm) s += ', ' + x.tm;
  if (x.amt) s += ' — ' + x.amt + ' ₽';
  if (x.rem && x.rem.length) s += ', напомню за ' + remTxt(x.rem);
  return s;
}
function resItem(x) {   // для экрана: заголовок и строка подробностей
  if (!x.ok) return { ok: false, k: x.type, t: x.t || RES_T[x.type] || 'Запись', m: x.why || 'не получилось' };
  const m = [RES_T[x.type] || 'Запись'];
  if (x.d) m.push(whenTxt(x.d)); if (x.tm) m.push(x.tm); if (x.amt) m.push(x.amt + ' ₽');
  if (x.rem && x.rem.length) m.push('напомню за ' + remTxt(x.rem));
  return { ok: true, k: x.type, t: x.t, m: m.join(' · ') };
}

// ---- Экран в Scriptable (нажали на виджет или открыли скрипт) — родная таблица Scriptable (UITable), не веб-страница:
//      веб-страница (WebView) на iPhone пользователя показалась пустой чёрной (25 ноября 2026), таблицу рисует сам iPhone.
//      Нажали на виджет — сразу диктовка, потом экран с тем, что записалось. «Сказать ещё» закрывает экран → диктовка → экран снова
//      (диктовку поверх открытого окна Scriptable может не показать). Не запустилась диктовка — на экране причина.
const EM = { event: '📅', task: '☑️', expense: '💸', income: '💰', saving: '🐷', note: '📝', check: '✅' };
async function dictate() {
  try { return { text: String(await Dictation.start('ru-RU') || '').trim() }; }
  catch (e) { return { text: '', err: String(e && e.message || e) }; }
}
const lines = (s, n) => Math.max(1, Math.ceil(String(s || '').length / n));
// Цвета экрана: фон и карточки — не чёрные (просьба пользователя): светлый лавандовый / глубокий фиолетовый
const SC = {
  bg: Color.dynamic(new Color('#f3f2ff'), new Color('#13112b')),
  card: Color.dynamic(new Color('#ffffff'), new Color('#211d45')),
  tx: Color.dynamic(new Color('#1c1b33'), new Color('#f4f3ff')),
  mut: Color.dynamic(new Color('#76749a'), new Color('#a9a6d6')),
  acc: Color.dynamic(new Color('#5b5bd6'), new Color('#a5a5ff'))
};
// Шапка экрана — картинка: градиент, светящийся шар со значком, заголовок и сказанное
const HERO = { idle: ['#4338ca', '#7c3aed'], work: ['#4338ca', '#7c3aed'], done: ['#4f46e5', '#0ea5a4'], none: ['#475569', '#6366f1'], err: ['#c2410c', '#db2777'] };
function mix(a, b, t) { const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); const x = p(a), y = p(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join(''); }
function heroImg(kind, icon, title, sub) {
  const W = Math.round(Device.screenSize().width), H = sub ? 236 : 200, dc = new DrawContext();
  dc.size = new Size(W, H); dc.opaque = true; dc.respectScreenScale = true;
  const [a, b] = HERO[kind] || HERO.idle;
  for (let y = 0; y < H; y += 2) { dc.setFillColor(new Color(mix(a, b, y / H))); dc.fillRect(new Rect(0, y, W, 2)); }
  dc.setFillColor(new Color('#ffffff', 0.07)); dc.fillEllipse(new Rect(W - 120, -60, 200, 200)); dc.fillEllipse(new Rect(-70, H - 90, 160, 160));
  const cx = W / 2, cy = 72;
  for (let r = 66; r > 44; r -= 5) { dc.setFillColor(new Color('#ffffff', 0.05)); dc.fillEllipse(new Rect(cx - r, cy - r, r * 2, r * 2)); }
  dc.setFillColor(new Color('#ffffff', 0.22)); dc.fillEllipse(new Rect(cx - 42, cy - 42, 84, 84));
  dc.setTextAlignedCenter();
  dc.setFont(Font.systemFont(40)); dc.drawTextInRect(icon, new Rect(cx - 40, cy - 26, 80, 54));
  dc.setFont(Font.boldSystemFont(25)); dc.setTextColor(Color.white()); dc.drawTextInRect(title, new Rect(16, 128, W - 32, 34));
  if (sub) { dc.setFont(Font.systemFont(15)); dc.setTextColor(new Color('#ffffff', 0.82)); dc.drawTextInRect(sub, new Rect(28, 166, W - 56, 60)); }
  return dc.getImage();
}
function addRow(t, h, fn, bg) { const r = new UITableRow(); r.height = h; r.backgroundColor = bg || SC.bg; if (fn) fn(r); t.addRow(r); return r; }
function drawScreen(t, st, sum, sumErr, syncTxt, on) {
  t.removeAllRows();
  const ok = (st.res || []).some(x => x.ok);
  const kind = st.st === 'done' ? (ok ? 'done' : 'none') : st.st;
  const icon = { idle: '🎙️', work: '⏳', done: ok ? '✅' : '🤷', err: '⚠️' }[st.st] || '🎙️';
  const title = { idle: 'Что добавить?', work: 'Записываю…', done: ok ? 'Готово' : 'Ничего не добавлено', err: 'Не получилось' }[st.st] || '';
  const said = st.text ? '«' + (st.text.length > 90 ? st.text.slice(0, 88) + '…' : st.text) + '»' : st.st === 'idle' ? 'Например: «завтра в 10 стоматолог, напомни за час»' : '';
  const img = heroImg(kind, icon, title, said);
  addRow(t, img.size.height, r => { const c = r.addImage(img); c.centerAligned(); }, new Color(HERO[kind] ? HERO[kind][1] : '#7c3aed'));
  addRow(t, 14);
  if (st.st === 'err' && st.err) addRow(t, 22 + 20 * lines(st.err, 38), r => { const c = r.addText(st.err); c.titleFont = Font.systemFont(15); c.titleColor = SC.tx; }, SC.card);
  (st.res || []).forEach((x, i) => {
    if (i) addRow(t, 2);
    addRow(t, 26 + 20 * lines(x.t, 30) + 17 * lines(x.m, 40), r => {
      r.cellSpacing = 10;
      const e = r.addText(EM[x.k] || '•'); e.titleFont = Font.systemFont(26); e.widthWeight = 14; e.centerAligned();
      const c = r.addText(x.t, x.m); c.widthWeight = 86; c.titleFont = Font.semiboldSystemFont(17); c.titleColor = x.ok ? SC.tx : SC.mut; c.subtitleFont = Font.systemFont(13); c.subtitleColor = SC.mut;
    }, SC.card);
  });
  if (st.reply) { addRow(t, 8); addRow(t, 14 + 19 * lines(st.reply, 42), r => { const c = r.addText(st.reply); c.titleFont = Font.italicSystemFont(14); c.titleColor = SC.mut; }); }
  if (st.st === 'done' && st.left != null) addRow(t, 22, r => { const c = r.addText('Помощнику осталось на сегодня: ' + st.left); c.titleFont = Font.systemFont(12); c.titleColor = SC.mut; });
  addRow(t, 10);
  addRow(t, 56, r => {
    const a = r.addButton(st.st === 'idle' ? '🎙  Сказать' : '🎙  Сказать ещё'); a.onTap = () => on('listen'); a.dismissOnTap = true; a.centerAligned();
    const b = r.addButton('⌨️  Напечатать'); b.onTap = () => on('type'); b.dismissOnTap = true; b.centerAligned();
  }, SC.card);
  addRow(t, 18);
  const head = 'СЕГОДНЯ' + (sum && sum.n ? ' · ДЕЛА ' + sum.done + '/' + sum.n : '') + (sum && sum.hn ? ' · ПРИВЫЧКИ ' + sum.hdone + '/' + sum.hn : '');
  addRow(t, 30, r => { const c = r.addText(head); c.titleFont = Font.semiboldSystemFont(12); c.titleColor = SC.mut; });
  if (!sum) addRow(t, 44, r => { const c = r.addText(sumErr || 'Загружаю…'); c.titleFont = Font.systemFont(14); c.titleColor = SC.mut; }, SC.card);
  else if (!sum.items.length) addRow(t, 44, r => { const c = r.addText('На сегодня пусто — самое время что-нибудь добавить'); c.titleFont = Font.systemFont(15); c.titleColor = SC.mut; }, SC.card);
  else {
    const now = hm(new Date()), p = pick(sum.items, 12, now);
    sum.items.forEach(x => addRow(t, 46, r => {
      const nx = x === p.next; r.cellSpacing = 6;
      const tm = r.addText(x.tm || '—'); tm.widthWeight = 17; tm.titleFont = nx ? Font.boldMonospacedSystemFont(14) : Font.regularMonospacedSystemFont(14); tm.titleColor = nx ? catC(x) : SC.mut;
      const d = r.addText(x.done ? '✓' : '●'); d.widthWeight = 7; d.titleFont = Font.boldSystemFont(x.done ? 15 : 12); d.titleColor = x.done ? C.ok : catC(x); d.centerAligned();
      const n = r.addText(x.t); n.widthWeight = 76; n.titleFont = nx ? Font.semiboldSystemFont(16) : Font.systemFont(16); n.titleColor = x.done ? SC.mut : SC.tx;
    }, x === p.next ? Color.dynamic(new Color(hex(x.c) || '#5b5bd6', 0.16), new Color(hex(x.c) || '#8b8bff', 0.34)) : SC.card));
    if (sum.n > sum.items.length) addRow(t, 34, r => { const c = r.addText('и ещё ' + (sum.n - sum.items.length)); c.titleFont = Font.systemFont(13); c.titleColor = SC.mut; }, SC.card);
  }
  addRow(t, 18);
  addRow(t, 48, r => { const b = r.addButton('🔄  Синхронизировать «Напоминания»'); b.onTap = () => on('sync'); b.centerAligned(); }, SC.card);
  if (syncTxt) addRow(t, 16 + 18 * lines(syncTxt, 44), r => { const c = r.addText(syncTxt); c.titleFont = Font.systemFont(13); c.titleColor = SC.mut; c.centerAligned(); });
  addRow(t, 40, r => { const c = r.addText('Смахните вниз, чтобы закрыть · версия ' + VER); c.titleFont = Font.systemFont(11); c.titleColor = SC.mut; c.centerAligned(); });
  for (let i = 0; i < 6; i++) addRow(t, 60);   // фон до низа экрана
  t.reload();
}
async function screen(auto) {
  const t = new UITable(); t.showSeparators = false;
  let st = { st: 'idle' }, sum = null, sumErr = '', syncTxt = '', next = null, text = '';
  const draw = () => drawScreen(t, st, sum, sumErr, syncTxt, a => { next = a; if (a === 'sync') doSync(); });
  const loadSum = async () => { try { sum = await call({ op: 'sum' }); sumErr = ''; } catch (e) { sumErr = e.message; } };
  async function doSync() {
    syncTxt = 'Синхронизирую…'; draw();
    try { const x = await syncReminders(); syncTxt = `Готово: в Parsimony — ${x.up}, новых в «Напоминаниях» — ${x.made}, обновлено — ${x.changed}`; }
    catch (e) { syncTxt = 'Не получилось: ' + String(e && e.message || e); }
    draw();
  }
  const listen = async () => { const d = await dictate(); if (d.err) st = { st: 'err', err: 'Диктовка не запустилась (' + d.err + '). Проверьте: Настройки iPhone → Scriptable → «Микрофон» и «Распознавание речи». Можно нажать «Напечатать».' }; return d.text; };
  if (auto) text = await listen();
  for (let i = 0; i < 50; i++) {
    next = null;
    if (text) st = { st: 'work', text };
    draw();
    const shown = t.present(false);   // окно снизу — закрывается смахиванием вниз (и скрипт тогда завершается)
    const work = (async () => {
      if (text) {
        const said = text.slice(0, 1000); text = '';
        try { const j = await call({ op: 'say', text: said }); st = { st: 'done', text: said, reply: String(j.reply || ''), res: (j.res || []).map(resItem), left: j.left }; syncReminders().catch(() => {}); }
        catch (e) { st = { st: 'err', text: said, err: e.message }; }
        draw();
      }
      await loadSum(); draw();
    })();
    await shown;
    if (next !== 'listen' && next !== 'type') return;   // закрыли крестиком
    if (next === 'listen') text = await listen();
    else { const a = new Alert(); a.title = 'Что добавить?'; a.message = 'Например: «завтра в 10 стоматолог, напомни за час»'; a.addTextField('Напишите или нажмите микрофон на клавиатуре'); a.addAction('Добавить'); a.addCancelAction('Отмена');
      if (await a.presentAlert() === 0) text = a.textFieldValue(0).trim(); }
    await work;
  }
}

// ---- Запуск ----
async function main() {
  if (KEY.indexOf('_') === 0) { const a = new Alert(); a.title = 'Нет ключа'; a.message = 'Скопируйте код заново: Parsimony → Настройки → «Виджет iPhone» → «Скопировать код».'; a.addAction('OK'); await a.presentAlert(); return; }
  // Из «Команд» iPhone (действие Scriptable «Run Script», параметр — продиктованный текст): без перехода в Scriptable,
  // ответ — выводом скрипта (команда показывает его уведомлением). Пустой параметр — ничего не делаем.
  const sp = args.shortcutParameter;
  if (!config.runsInWidget && sp != null) {
    const text = String(Array.isArray(sp) ? sp.join(' ') : typeof sp === 'object' ? (sp.text || '') : sp).trim();
    let out = '';
    if (!text) out = 'Ничего не услышал — попробуйте ещё раз';
    else try { const j = await call({ op: 'say', text }); out = [j.reply, ...(j.res || []).map(resLine)].filter(Boolean).join('\n') || 'Готово'; }
    catch (e) { out = 'Не получилось: ' + e.message; }
    Script.setShortcutOutput(out); return;
  }
  if (config.runsInWidget) {
    let sum = null, err = '';
    try { sum = await call({ op: 'sum' }); } catch (e) { err = e.message; }
    try { await syncReminders(); } catch (e) {}   // «Напоминания» — тихо, если нет доступа (его даёт первый запуск в самом Scriptable)
    Script.setWidget(buildWidget(sum, err)); return;
  }
  const act = (args.queryParameters || {}).act;
  if (act === 'say') { await screen(true); return; }   // нажали на виджет — экран и сразу диктовка
  await screen(false);   // открыли скрипт в самом Scriptable — тот же экран, без диктовки сразу
}
await main();
Script.complete();
