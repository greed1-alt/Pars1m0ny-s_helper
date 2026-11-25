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
const VER = 247;            // версия кода — видна внизу экрана, чтобы понять, что код обновлён
const LIST = 'Parsimony';   // список в «Напоминаниях»
const C = {
  bg: Color.dynamic(new Color('#ffffff'), new Color('#1c1c1e')),
  tx: Color.dynamic(new Color('#1c1c1e'), new Color('#f2f2f7')),
  mut: Color.dynamic(new Color('#8e8e93'), new Color('#98989d')),
  dim: Color.dynamic(new Color('#c7c7cc'), new Color('#48484a')),
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
  w.backgroundColor = C.bg;
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

// ---- Экран в Scriptable (нажали на виджет или открыли скрипт): вместо серого экрана и окошек — своя страница
//      (25 ноября 2026, пользователь: «можно ли сделать визуал Scriptable более красивым… там виден только серый экран»).
//      Страница → скрипт: setWait(completion) ждёт нажатия (act); скрипт → страница: show / setToday / syncMsg.
//      Ключ на страницу не попадает: на сервер ходит только скрипт. Весь текст на странице — через textContent.
const PAGE = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<style>
:root{--bg:#f2f2f7;--card:#fff;--tx:#1c1c1e;--mut:#8e8e93;--line:rgba(60,60,67,.12);--acc:#5b5bd6;--acc2:#8b8bff;--soft:rgba(91,91,214,.12);--ok:#34c759;--warn:#ff9f0a}
@media (prefers-color-scheme:dark){:root{--bg:#000;--card:#1c1c1e;--tx:#f2f2f7;--mut:#98989d;--line:rgba(84,84,88,.6);--acc:#8b8bff;--acc2:#b4b4ff;--soft:rgba(139,139,255,.18);--ok:#30d158}}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
body{margin:0;background:var(--bg);color:var(--tx);font:16px/1.4 -apple-system,system-ui,sans-serif;padding:max(18px,env(safe-area-inset-top)) 18px max(28px,env(safe-area-inset-bottom))}
.top{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:22px}
.brand{font-weight:700;font-size:15px;color:var(--acc);letter-spacing:.2px}
#date{font-size:13px;color:var(--mut);font-weight:500}
.hero{display:flex;flex-direction:column;align-items:center;text-align:center}
.orb{position:relative;width:118px;height:118px;border-radius:50%;border:0;background:radial-gradient(circle at 35% 30%,var(--acc2),var(--acc) 70%);color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 10px 30px var(--soft);transition:transform .35s cubic-bezier(.32,.72,0,1),background .3s}
.orb:active{transform:scale(.94)}
.orb svg{width:44px;height:44px}
.orb::before,.orb::after{content:"";position:absolute;inset:0;border-radius:50%;border:2px solid var(--acc);opacity:0}
.listen .orb::before{animation:ring 1.6s ease-out infinite}.listen .orb::after{animation:ring 1.6s ease-out .8s infinite}
@keyframes ring{0%{transform:scale(1);opacity:.6}100%{transform:scale(1.7);opacity:0}}
.work .orb{animation:breathe 1.2s ease-in-out infinite}
@keyframes breathe{50%{transform:scale(.92)}}
.done .orb{background:radial-gradient(circle at 35% 30%,#6ee7a0,var(--ok) 70%)}
.err .orb{background:radial-gradient(circle at 35% 30%,#ffc46b,var(--warn) 70%)}
.st{font-size:24px;font-weight:700;margin-top:18px;letter-spacing:-.3px}
.hint{font-size:14px;color:var(--mut);margin-top:6px}
.said{margin-top:14px;font-size:16px;color:var(--tx);background:var(--card);border-radius:14px;padding:10px 14px;max-width:100%}
.said:empty,.reply:empty,.res:empty{display:none}
.res{width:100%;margin-top:16px;display:flex;flex-direction:column;gap:8px;text-align:left}
.it{display:flex;gap:12px;align-items:center;background:var(--card);border-radius:16px;padding:12px 14px;animation:up .45s cubic-bezier(.32,.72,0,1) both}
.it:nth-child(2){animation-delay:.06s}.it:nth-child(3){animation-delay:.12s}.it:nth-child(4){animation-delay:.18s}
@keyframes up{from{opacity:0;transform:translateY(10px)}}
.ic{flex:none;width:38px;height:38px;border-radius:12px;background:var(--soft);display:flex;align-items:center;justify-content:center;font-size:20px}
.it>div:last-child{min-width:0;flex:1}.it.no{opacity:.55}.it b{display:block;font-size:16px;font-weight:600}.it span{font-size:13px;color:var(--mut)}
.reply{margin-top:12px;font-size:14px;color:var(--mut);font-style:italic;text-align:left;width:100%}
.btns{display:flex;gap:10px;margin-top:22px;width:100%}
button.b{flex:1;height:48px;border-radius:14px;border:0;font:600 16px -apple-system,system-ui,sans-serif;background:var(--card);color:var(--acc);display:flex;align-items:center;justify-content:center;gap:8px}
button.b.pri{background:var(--acc);color:#fff}button.b:active{opacity:.7}
.tw{width:100%;margin-top:12px;display:flex;flex-direction:column;gap:8px}.tw[hidden]{display:none}
textarea{width:100%;border:0;border-radius:14px;background:var(--card);color:var(--tx);padding:12px 14px;font:16px/1.4 -apple-system,system-ui,sans-serif;resize:none;outline:none}
h3{font-size:13px;font-weight:600;color:var(--mut);text-transform:uppercase;letter-spacing:.4px;margin:30px 4px 8px}
.today{background:var(--card);border-radius:16px;overflow:hidden}
.row{display:flex;gap:10px;align-items:center;padding:11px 14px;border-top:.5px solid var(--line)}.row:first-child{border-top:0}
.row .tm{width:42px;font-size:13px;color:var(--mut);font-variant-numeric:tabular-nums}.row .dot{width:9px;height:9px;border-radius:50%;flex:none}
.row .t{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.row.dn .t{color:var(--mut);text-decoration:line-through}.row.nx{background:var(--soft)}.row.nx .tm{color:var(--acc);font-weight:700}.row.nx .t{font-weight:600}
.empty{padding:14px;color:var(--mut);font-size:14px}
.link{display:block;margin:18px auto 0;background:none;border:0;color:var(--acc);font:500 15px -apple-system,system-ui,sans-serif}
#sync{text-align:center;font-size:13px;color:var(--mut);margin-top:6px}#ver{text-align:center;font-size:11px;color:var(--mut);opacity:.6;margin-top:18px}
</style></head><body>
<div class="top"><span class="brand">Parsimony</span><span id="date"></span></div>
<div class="hero" id="hero">
 <button class="orb" id="orb" aria-label="Сказать, что добавить" onclick="act({a:'listen'})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" id="oi"></svg></button>
 <div class="st" id="st">Что добавить?</div>
 <div class="hint" id="hint">Например: «завтра в 10 стоматолог, напомни за час»</div>
 <div class="said" id="said"></div>
 <div class="res" id="res"></div>
 <div class="reply" id="reply"></div>
 <div class="btns"><button class="b pri" onclick="act({a:'listen'})" id="bl">Сказать</button><button class="b" onclick="typeOpen()">Напечатать</button></div>
 <div class="tw" id="tw" hidden><textarea id="ta" rows="2" placeholder="Напишите или нажмите микрофон на клавиатуре"></textarea><button class="b pri" onclick="sendT()">Добавить</button></div>
</div>
<h3 id="th">Сегодня</h3><div class="today" id="today"><div class="empty">Загружаю…</div></div>
<button class="link" onclick="act({a:'sync'})">Синхронизировать «Напоминания»</button><div id="sync"></div><div id="ver"></div>
<script>
var wait=null,q=[];
function setWait(c){wait=c;flush()}
function act(o){q.push(o);flush()}
function flush(){if(wait&&q.length){var w=wait;wait=null;w(JSON.stringify(q.shift()))}}
var $=function(i){return document.getElementById(i)};
var IC={mic:'<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',ok:'<path d="M5 12.5l4.5 4.5L19 7.5"/>',wait:'<circle cx="12" cy="12" r="2"/><circle cx="5" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>',err:'<path d="M12 7v6M12 17h.01"/>'};
var EM={event:'📅',task:'☑️',expense:'💸',income:'💰',saving:'🐷',note:'📝',check:'✅'};
function el(t,c,x){var e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e}
function typeOpen(){$('tw').hidden=false;$('ta').focus()}
function sendT(){var t=$('ta').value.trim();if(!t)return;$('ta').value='';$('tw').hidden=true;act({a:'send',t:t})}
function show(s){
 var h=$('hero');h.className='hero '+s.st;
 var T={idle:'Что добавить?',listen:'Слушаю…',work:'Записываю…',done:(s.res||[]).some(function(x){return x.ok})?'Готово':'Ничего не добавлено',err:'Не получилось',type:'Напишите, что добавить'};
 $('st').textContent=T[s.st]||'';
 $('oi').innerHTML=s.st==='done'?IC.ok:s.st==='work'?IC.wait:s.st==='err'?IC.err:IC.mic;
 $('hint').textContent=s.st==='listen'?'Говорите — пауза закончит запись':s.st==='err'?(s.err||''):s.st==='done'&&s.left!=null?'Помощнику осталось на сегодня: '+s.left:s.st==='idle'?'Например: «завтра в 10 стоматолог, напомни за час»':'';
 $('said').textContent=s.text?'«'+s.text+'»':'';
 var r=$('res');r.textContent='';
 (s.res||[]).forEach(function(x){var it=el('div','it'+(x.ok?'':' no'));it.appendChild(el('div','ic',EM[x.k]||'•'));var b=el('div');b.appendChild(el('b',null,x.t));b.appendChild(el('span',null,x.m));it.appendChild(b);r.appendChild(it)});
 $('reply').textContent=s.reply||'';
 $('bl').textContent=s.st==='done'||s.st==='err'?'Сказать ещё':'Сказать';
 if(s.st==='type')typeOpen();
}
function setToday(s,err){
 var b=$('today');b.textContent='';
 if(!s){b.appendChild(el('div','empty',err||'Нет связи'));return}
 $('th').textContent='Сегодня'+(s.n?' · дела '+s.done+'/'+s.n:'')+(s.hn?' · привычки '+s.hdone+'/'+s.hn:'');
 if(!s.items.length){b.appendChild(el('div','empty','На сегодня пусто'));return}
 var d=new Date(),now=('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2),nx=null;
 s.items.forEach(function(x){if(!nx&&!x.done&&x.tm&&x.tm>=now)nx=x});
 if(!nx)s.items.forEach(function(x){if(!nx&&!x.done)nx=x});
 s.items.forEach(function(x){var rw=el('div','row'+(x.done?' dn':'')+(x===nx?' nx':''));rw.appendChild(el('span','tm',x.tm||'—'));var dt=el('span','dot');dt.style.background=/^#[0-9a-f]{6}$/i.test(x.c||'')?x.c:'var(--acc)';rw.appendChild(dt);rw.appendChild(el('span','t',x.t));b.appendChild(rw)});
 if(s.n>s.items.length)b.appendChild(el('div','empty','и ещё '+(s.n-s.items.length)));
}
function syncMsg(t){$('sync').textContent=t}
$('date').textContent=new Date().toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long'});
show({st:'idle'});
</script></body></html>`;
async function screen(auto) {
  const wv = new WebView();
  console.log('экран: загружаю страницу');
  await wv.loadHTML(PAGE);
  await wv.evaluateJavaScript('document.getElementById("ver").textContent="код виджета · версия ' + VER + '"', false).catch(() => {});
  console.log('экран: показываю');
  let closed = false, busy = false, sending = false;
  const shown = wv.present(true).then(() => { closed = true; }, () => { closed = true; });
  const js = s => closed ? Promise.resolve() : wv.evaluateJavaScript(s, false).catch(() => {});
  const ui = s => js('show(' + JSON.stringify(s) + ')');
  const today = async () => { try { const s = await call({ op: 'sum' }); await js('setToday(' + JSON.stringify(s) + ')'); } catch (e) { await js('setToday(null,' + JSON.stringify(e.message) + ')'); } };
  async function send(text) {
    if (sending) return; sending = true;
    await ui({ st: 'work', text });
    try { const j = await call({ op: 'say', text }); await ui({ st: 'done', text, reply: j.reply || '', res: (j.res || []).map(resItem), left: j.left }); today(); syncReminders().catch(() => {}); }
    catch (e) { await ui({ st: 'err', text, err: e.message }); }
    sending = false;
  }
  async function listen() {
    if (busy || sending) return; busy = true;
    await ui({ st: 'listen' });
    let text = '';
    // Диктовка поверх страницы; не появилась за 90 с — предлагаем напечатать (микрофон есть и на клавиатуре iPhone)
    try { text = await Promise.race([Dictation.start('ru-RU'), new Promise(r => Timer.schedule(90000, false, () => r('')))]); } catch (e) { text = ''; }
    text = String(text || '').trim();
    busy = false;
    if (text) await send(text.slice(0, 1000)); else await ui({ st: 'type' });
  }
  async function handle(a) {
    if (!a) return;
    if (a.a === 'listen') { listen(); return; }
    if (a.a === 'send' && a.t) { send(String(a.t).trim().slice(0, 1000)); return; }
    if (a.a === 'sync') {
      await js('syncMsg("Синхронизирую…")');
      try { const x = await syncReminders(); await js('syncMsg(' + JSON.stringify(`Готово: в Parsimony — ${x.up}, новых в «Напоминаниях» — ${x.made}, обновлено — ${x.changed}`) + ')'); }
      catch (e) { await js('syncMsg(' + JSON.stringify('Не получилось: ' + String(e.message || e)) + ')'); }
    }
  }
  (async () => {
    while (!closed) {
      let raw; try { raw = await wv.evaluateJavaScript('setWait(completion)', true); } catch (e) { break; }
      if (closed) break;
      let a = null; try { a = JSON.parse(raw); } catch (e) {}
      await handle(a);
    }
  })();
  today();
  if (auto) Timer.schedule(450, false, () => { listen(); });
  await shown;
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
  // Нажали на виджет: Scriptable ещё открывается — показать экран сразу он может не успеть (остаётся серый экран). Ждём чуть-чуть.
  if (act === 'say') { await new Promise(r => Timer.schedule(800, false, r)); await screen(true); return; }   // нажали на виджет — экран и сразу диктовка
  await screen(false);   // открыли скрипт в самом Scriptable — тот же экран, без диктовки сразу
}
await main();
Script.complete();
