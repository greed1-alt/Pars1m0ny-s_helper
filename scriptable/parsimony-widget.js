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
const VER = 253;            // версия кода — видна внизу экрана, чтобы понять, что код обновлён
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

async function call(body, secs) {
  const r = new Request(API);
  r.method = 'POST'; r.timeoutInterval = secs || 60;
  r.headers = { 'Content-Type': 'application/json' };
  r.body = JSON.stringify(Object.assign({ w: KEY }, body));
  const j = await r.loadJSON();
  const code = r.response && r.response.statusCode;
  if (code >= 400 || !j || j.error) throw new Error(WHY[j && j.error] || 'Сервер не ответил (' + (code || 'нет связи') + ')');
  return j;
}
const WHY = { key: 'Ключ не подходит — скопируйте код заново в Parsimony → Настройки → «Виджет iPhone»', ailimit: 'Помощник на сегодня всё — лимит сообщений закончился',
  ai: 'Помощник не ответил — попробуйте ещё раз', audio: 'Запись не подошла — скажите ещё раз или напишите', limit: 'Слишком часто — попробуйте позже', nodata: 'В Parsimony ещё нет записей — откройте приложение один раз', busy: 'Записи сейчас меняются — попробуйте ещё раз' };

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
  // Фон — не чёрный (пользователь: «сам виджет все еще черный»): светлый лавандовый / глубокий фиолетовый. Сплошной цвет, не градиент:
  // цвет «по теме iPhone» (Color.dynamic) Scriptable надёжно применяет к фону, а у градиента — не наверняка (в тёмной теме мог выйти белым).
  w.backgroundColor = Color.dynamic(new Color('#f6f5ff'), new Color('#211c4e'));
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

// ---- Экран в Scriptable: своя запись голоса вместо окна «Dictation» (25 ноября 2026; пользователь выбрал «своя запись», проверка прошла:
//      страница показывается, микрофон пишет, связь со скриптом есть). Страница сама пишет голос (микрофон + MediaRecorder), волна по громкости,
//      замолчали — запись останавливается; запись → скрипт → сервер (op hear: распознаёт функция assistant, как голос в чате) → записи.
//      Страница → скрипт — переходом по адресу parsimony-act://… (shouldAllowRequest), скрипт → страница — evaluateJavaScript без ожидания:
//      прошлая страница с «ждущим» evaluateJavaScript и без адреса была пустой чёрной. Ключ на страницу не попадает, текст — через textContent.
const PAGE = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<style>
:root{--bg:#f3f2ff;--card:#fff;--tx:#1c1b33;--mut:#76749a;--line:rgba(60,60,100,.1);--acc:#5b5bd6;--soft:rgba(91,91,214,.12);--ok:#34c759}
@media (prefers-color-scheme:dark){:root{--bg:#13112b;--card:#211d45;--tx:#f4f3ff;--mut:#a9a6d6;--line:rgba(255,255,255,.08);--acc:#a5a5ff;--soft:rgba(165,165,255,.16);--ok:#30d158}}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
body{margin:0;background:var(--bg);color:var(--tx);font:16px/1.4 -apple-system,system-ui,sans-serif;padding-bottom:max(28px,env(safe-area-inset-bottom))}
.hero{background:linear-gradient(160deg,#4338ca,#7c3aed);color:#fff;border-radius:0 0 28px 28px;padding:calc(env(safe-area-inset-top) + 58px) 20px 26px;text-align:center;transition:background .5s;position:relative;overflow:hidden}
.hero::before,.hero::after{content:"";position:absolute;border-radius:50%;background:rgba(255,255,255,.07)}.hero::before{width:220px;height:220px;right:-80px;top:-90px}.hero::after{width:170px;height:170px;left:-70px;bottom:-80px}
.done .hero{background:linear-gradient(160deg,#4f46e5,#0ea5a4)}.err .hero{background:linear-gradient(160deg,#c2410c,#db2777)}
.top{display:flex;justify-content:space-between;align-items:baseline;font-size:13px;opacity:.85;position:relative;z-index:1}.top b{font-size:15px}
.orb{position:relative;z-index:1;width:124px;height:124px;margin:22px auto 0;border-radius:50%;border:0;background:rgba(255,255,255,.2);box-shadow:0 0 0 14px rgba(255,255,255,.06),0 0 0 30px rgba(255,255,255,.04);color:#fff;display:flex;align-items:center;justify-content:center;gap:5px;transition:transform .35s cubic-bezier(.32,.72,0,1)}
.orb:active{transform:scale(.93)}.orb svg{width:46px;height:46px}
.orb i{display:none;width:7px;height:10px;border-radius:4px;background:#fff;transition:height .08s}
.rec .orb svg{display:none}.rec .orb i{display:block}
.rec .orb{animation:pulse 1.6s ease-in-out infinite}@keyframes pulse{50%{box-shadow:0 0 0 18px rgba(255,255,255,.1),0 0 0 38px rgba(255,255,255,.05)}}
.work .orb{animation:breathe 1.1s ease-in-out infinite}@keyframes breathe{50%{transform:scale(.92)}}
.st{position:relative;z-index:1;font-size:26px;font-weight:700;margin-top:20px;letter-spacing:-.3px}
.sub{position:relative;z-index:1;font-size:15px;opacity:.85;margin-top:6px;min-height:21px}
.wrap{padding:0 16px}
.res{display:flex;flex-direction:column;gap:8px;margin-top:16px}.res:empty{display:none}
.it{display:flex;gap:12px;align-items:center;background:var(--card);border-radius:16px;padding:12px 14px;animation:up .45s cubic-bezier(.32,.72,0,1) both}
.it:nth-child(2){animation-delay:.07s}.it:nth-child(3){animation-delay:.14s}.it:nth-child(4){animation-delay:.21s}
@keyframes up{from{opacity:0;transform:translateY(12px)}}
.ic{flex:none;width:40px;height:40px;border-radius:12px;background:var(--soft);display:flex;align-items:center;justify-content:center;font-size:21px}
.it>div:last-child{min-width:0;flex:1}.it.no{opacity:.55}.it b{display:block;font-size:16px;font-weight:600}.it span{font-size:13px;color:var(--mut)}
.reply{margin-top:12px;font-size:14px;color:var(--mut);font-style:italic}.reply:empty{display:none}
.btns{display:flex;gap:10px;margin-top:16px}
button.b{flex:1;height:50px;border-radius:15px;border:0;font:600 16px -apple-system,system-ui,sans-serif;background:var(--card);color:var(--acc)}
button.b.pri{background:var(--acc);color:#fff}@media (prefers-color-scheme:dark){button.b.pri{color:#13112b}}button.b:active{opacity:.7}
.tw{margin-top:10px;display:flex;flex-direction:column;gap:8px}.tw[hidden]{display:none}
textarea{width:100%;border:0;border-radius:15px;background:var(--card);color:var(--tx);padding:12px 14px;font:16px/1.4 -apple-system,system-ui,sans-serif;resize:none;outline:none}
h3{font-size:12px;font-weight:600;color:var(--mut);text-transform:uppercase;letter-spacing:.5px;margin:26px 4px 8px}
.today{background:var(--card);border-radius:16px;overflow:hidden}
.row{display:flex;gap:10px;align-items:center;padding:11px 14px;border-top:1px solid var(--line)}.row:first-child{border-top:0}
.row .tm{width:44px;font-size:13px;color:var(--mut);font-variant-numeric:tabular-nums}.row .dot{width:9px;height:9px;border-radius:50%;flex:none}
.row .t{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.row.dn .t{color:var(--mut);text-decoration:line-through}.row.nx{background:var(--soft)}.row.nx .tm{color:var(--acc);font-weight:700}.row.nx .t{font-weight:600}
.empty{padding:14px;color:var(--mut);font-size:14px}
.link{display:block;margin:16px auto 0;background:none;border:0;color:var(--acc);font:500 15px -apple-system,system-ui,sans-serif}
.note{text-align:center;font-size:13px;color:var(--mut);margin-top:6px}.ver{text-align:center;font-size:11px;color:var(--mut);opacity:.7;margin-top:16px}
</style></head><body>
<div id="page">
<div class="hero">
 <div class="top"><b>Parsimony</b><span id="date"></span></div>
 <button class="orb" id="orb" aria-label="Сказать" onclick="orbTap()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" id="oi"></svg><i></i><i></i><i></i><i></i><i></i></button>
 <div class="st" id="st">Что добавить?</div>
 <div class="sub" id="sub"></div>
</div>
<div class="wrap">
 <div class="res" id="res"></div>
 <div class="reply" id="reply"></div>
 <div class="btns"><button class="b pri" id="bl" onclick="orbTap()">Сказать</button><button class="b" onclick="typeOpen()">Напечатать</button></div>
 <div class="tw" id="tw" hidden><textarea id="ta" rows="2" placeholder="Напишите, что добавить"></textarea><button class="b pri" onclick="sendT()">Добавить</button></div>
 <h3 id="th">Сегодня</h3><div class="today" id="today"><div class="empty">Загружаю…</div></div>
 <button class="link" onclick="go('sync')">🔄 Синхронизировать «Напоминания»</button><div class="note" id="sync"></div>
 <div class="ver">Закрыть — крестик вверху · версия %VER%</div>
</div></div>
<script>
var $=function(i){return document.getElementById(i)};
var IC={mic:'<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',ok:'<path d="M5 12.5l4.5 4.5L19 7.5"/>',wait:'<circle cx="12" cy="12" r="1.6"/><circle cx="6" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/>',err:'<path d="M12 7v6M12 17h.01"/>'};
var EM={event:'📅',task:'☑️',expense:'💸',income:'💰',saving:'🐷',note:'📝',check:'✅'};
var cur='idle',audio=null,text=null,R=null;
function el(t,c,x){var e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e}
function go(a){location.href='parsimony-act://'+a}
function takeAudio(){var a=audio;audio=null;return a||''}
function takeText(){var t=text;text=null;return t||''}
function typeOpen(){$('tw').hidden=false;$('ta').focus()}
function sendT(){var t=$('ta').value.trim();if(!t)return;$('ta').value='';$('tw').hidden=true;text=t;show({st:'work',t:'Записываю…',text:t});go('send')}
function show(s){
 cur=s.st;$('page').className=s.st;
 var ok=(s.res||[]).some(function(x){return x.ok});
 var T={idle:'Что добавить?',rec:'Слушаю…',work:s.t||'Записываю…',done:ok?'Готово':'Ничего не добавлено',err:'Не получилось'};
 $('st').textContent=T[s.st]||'';
 $('oi').innerHTML=s.st==='done'?IC.ok:s.st==='work'?IC.wait:s.st==='err'?IC.err:IC.mic;
 $('sub').textContent=s.st==='rec'?'Говорите — замолчите, и запись закончится':s.st==='err'?(s.err||''):s.text?'«'+s.text+'»':s.st==='idle'?'Нажмите на шар и скажите, например: «завтра в 10 стоматолог, напомни за час»':'';
 if(s.st==='rec'||s.st==='work'||s.st==='idle'){if(s.st!=='work'){$('res').textContent='';$('reply').textContent=''}}
 if(s.res){var r=$('res');r.textContent='';s.res.forEach(function(x){var it=el('div','it'+(x.ok?'':' no'));it.appendChild(el('div','ic',EM[x.k]||'•'));var b=el('div');b.appendChild(el('b',null,x.t));b.appendChild(el('span',null,x.m));it.appendChild(b);r.appendChild(it)})}
 if(s.reply!=null)$('reply').textContent=(s.reply||'')+(s.left!=null&&s.st==='done'?' · Помощнику осталось на сегодня: '+s.left:'');
 $('bl').textContent=s.st==='rec'?'Готово':s.st==='done'||s.st==='err'?'Сказать ещё':'Сказать';
}
function setToday(s,err){
 var b=$('today');b.textContent='';
 if(!s){b.appendChild(el('div','empty',err||'Нет связи'));return}
 $('th').textContent='Сегодня'+(s.n?' · дела '+s.done+'/'+s.n:'')+(s.hn?' · привычки '+s.hdone+'/'+s.hn:'');
 if(!s.items.length){b.appendChild(el('div','empty','На сегодня пусто — самое время что-нибудь добавить'));return}
 var d=new Date(),now=('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2),nx=null;
 s.items.forEach(function(x){if(!nx&&!x.done&&x.tm&&x.tm>=now)nx=x});
 if(!nx)s.items.forEach(function(x){if(!nx&&!x.done)nx=x});
 s.items.forEach(function(x){var rw=el('div','row'+(x.done?' dn':'')+(x===nx?' nx':''));rw.appendChild(el('span','tm',x.tm||'—'));var dt=el('span','dot');dt.style.background=/^#[0-9a-f]{6}$/i.test(x.c||'')?x.c:'var(--acc)';rw.appendChild(dt);rw.appendChild(el('span','t',x.t));b.appendChild(rw)});
 if(s.n>s.items.length)b.appendChild(el('div','empty','и ещё '+(s.n-s.items.length)));
}
function syncMsg(t){$('sync').textContent=t}
function orbTap(){if(cur==='rec')stopRec(true);else if(cur!=='work')startRec()}
// Запись: волна по громкости; заговорили и замолчали на 1,8 с — конец; молчат 8 с с начала — «Не расслышал»; не дольше 30 с
async function startRec(){
 if(R)return;
 var md=navigator.mediaDevices;
 if(!md||!md.getUserMedia||typeof MediaRecorder==='undefined'){show({st:'err',err:'Микрофон здесь недоступен — нажмите «Напечатать»'});return}
 var s;try{s=await md.getUserMedia({audio:true})}catch(e){show({st:'err',err:'Нет доступа к микрофону — нажмите «Сказать ещё» и разрешите, или «Напечатать»'});return}
 var ctx=new (window.AudioContext||window.webkitAudioContext)(),an=ctx.createAnalyser(),d=new Uint8Array(512);an.fftSize=1024;ctx.createMediaStreamSource(s).connect(an);
 var mr;try{mr=new MediaRecorder(s)}catch(e){s.getTracks().forEach(function(x){x.stop()});show({st:'err',err:'Запись не началась — нажмите «Напечатать»'});return}
 var ch=[],bars=document.querySelectorAll('.orb i'),t0=Date.now(),heard=false,quiet=Date.now(),base=0,mx=0,man=false;
 try{ctx.resume&&ctx.resume()}catch(e){}
 R={s:s,ctx:ctx,mr:mr,ch:ch};
 mr.ondataavailable=function(e){if(e.data&&e.data.size)ch.push(e.data)};mr.start();
 show({st:'rec'});
 R.t=setInterval(function(){
  an.getByteTimeDomainData(d);var m=0;for(var i=0;i<d.length;i++)m=Math.max(m,Math.abs(d[i]-128));
  var now=Date.now();mx=Math.max(mx,m);if(now-t0<300)base=Math.max(base,m);
  if(!man&&now-t0>1500&&mx===0){man=true;$('sub').textContent='Говорите и нажмите на шар, когда закончите'}   // громкость не видна (звук страницы не запущен) — тогда только по нажатию
  if(man)m=8+Math.random()*30;
  var lv=Math.min(1,m/60);for(var k=0;k<bars.length;k++)bars[k].style.height=(10+lv*52*[.55,.85,1,.85,.55][k]*(.75+Math.random()*.5))+'px';
  if(!man&&m>Math.max(14,base+8)){heard=true;quiet=now}
  if(now-t0>30000)stopRec(true);else if(!man&&heard&&now-quiet>1800)stopRec(true);else if(!man&&!heard&&now-t0>8000)stopRec(false);
 },60);
}
function stopRec(send){
 var r=R;if(!r)return;R=null;clearInterval(r.t);
 r.mr.onstop=function(){
  r.s.getTracks().forEach(function(x){x.stop()});try{r.ctx.close()}catch(e){}
  if(!send||!r.ch.length){show({st:'idle'});$('sub').textContent='Не расслышал — нажмите на шар и скажите ещё раз';return}
  var b=new Blob(r.ch,{type:String(r.ch[0].type||'audio/mp4').split(';')[0]});
  show({st:'work',t:'Распознаю…'});
  var fr=new FileReader();fr.onload=function(){audio=String(fr.result||'');go('audio')};fr.onerror=function(){show({st:'err',err:'Не получилось прочитать запись — попробуйте ещё раз'})};fr.readAsDataURL(b);
 };
 try{r.mr.stop()}catch(e){r.mr.onstop()}
}
$('date').textContent=new Date().toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long'});
show({st:'idle'});
if(%AUTO%)setTimeout(startRec,250);
</script></body></html>`;
async function screen(auto) {
  const wv = new WebView();
  let closed = false, busy = false;
  const js = s => closed ? Promise.resolve(null) : wv.evaluateJavaScript(s, false).catch(() => null);
  const ui = s => js('show(' + JSON.stringify(s) + ')');
  const today = async () => { try { const s = await call({ op: 'sum' }); await js('setToday(' + JSON.stringify(s) + ')'); } catch (e) { await js('setToday(null,' + JSON.stringify(e.message) + ')'); } };
  const done = async (j, said) => {
    await ui({ st: 'done', text: said, reply: String(j.reply || ''), res: (j.res || []).map(resItem), left: j.left });
    today(); syncReminders().catch(() => {});
  };
  async function onAct(a) {
    if (a === 'sync') {
      await js('syncMsg("Синхронизирую…")');
      try { const x = await syncReminders(); await js('syncMsg(' + JSON.stringify(`Готово: в Parsimony — ${x.up}, новых в «Напоминаниях» — ${x.made}, обновлено — ${x.changed}`) + ')'); }
      catch (e) { await js('syncMsg(' + JSON.stringify('Не получилось: ' + String(e && e.message || e)) + ')'); }
      return;
    }
    if (busy) return; busy = true;
    try {
      if (a === 'audio') {
        const au = String(await js('takeAudio()') || '');
        if (!au) throw new Error('Запись не дошла — попробуйте ещё раз');
        const j = await call({ op: 'hear', audio: au }, 90);
        if (!j.heard) await ui({ st: 'err', err: 'Не расслышал — скажите ещё раз или напишите' });
        else await done(j, j.heard);
      } else if (a === 'send') {
        const t = String(await js('takeText()') || '').trim().slice(0, 1000);
        if (t) await done(await call({ op: 'say', text: t }), t);
      }
    } catch (e) { await ui({ st: 'err', err: e.message }); }
    busy = false;
  }
  wv.shouldAllowRequest = req => {
    const m = /^parsimony-act:\/\/([a-z]+)/.exec(String(req.url || ''));
    if (m) { onAct(m[1]); return false; }
    return true;
  };
  // Адрес страницы — сайт Parsimony: без него страница не считается защищённой, и микрофона у неё нет (сама страница ничего с сайта не грузит)
  await wv.loadHTML(PAGE.replace('%AUTO%', auto ? '1' : '0').replace('%VER%', String(VER)), 'https://app.parsimony.ru/');
  today();
  await wv.present(true);
  closed = true;
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
