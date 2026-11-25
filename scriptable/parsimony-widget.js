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
const APP = 'https://app.parsimony.ru/';
const LIST = 'Parsimony';   // список в «Напоминаниях»
const C = {
  bg: Color.dynamic(new Color('#ffffff'), new Color('#17181c')),
  tx: Color.dynamic(new Color('#16171b'), new Color('#f3f3f5')),
  mut: Color.dynamic(new Color('#6b7280'), new Color('#9ca3af')),
  line: Color.dynamic(new Color('#e5e7eb'), new Color('#2a2c33')),
  acc: new Color('#e8883a'), ok: new Color('#22a55e')
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

// ---- Виджет ----
function row(w, time, title, done, size) {
  const s = w.addStack(); s.centerAlignContent(); s.spacing = 6;
  const dot = s.addText(done ? '✓' : '•'); dot.font = Font.boldSystemFont(size); dot.textColor = done ? C.ok : C.acc;
  if (time) { const t = s.addText(time); t.font = Font.mediumMonospacedSystemFont(size - 1); t.textColor = C.mut; }
  const n = s.addText(title); n.font = Font.systemFont(size); n.textColor = done ? C.mut : C.tx; n.lineLimit = 1;
  return s;
}
function buildWidget(sum, err) {
  const fam = config.widgetFamily || 'medium', w = new ListWidget(), say = URLScheme.forRunningScript() + '?act=say';
  w.url = say; w.refreshAfterDate = new Date(Date.now() + 15 * 60e3);
  if (fam.startsWith('accessory')) {   // экран блокировки
    const t = w.addText(err ? 'Parsimony: нет связи' : fam === 'accessoryCircular' ? (sum.done + '/' + sum.n) : `Дела ${sum.done}/${sum.n} · привычки ${sum.hdone}/${sum.hn}`);
    t.font = Font.semiboldSystemFont(fam === 'accessoryCircular' ? 16 : 13); t.minimumScaleFactor = 0.6;
    if (fam === 'accessoryRectangular' && !err) { const n = sum.items.find(x => !x.done); if (n) { const x = w.addText((n.tm ? n.tm + ' ' : '') + n.t); x.font = Font.systemFont(12); x.lineLimit = 1; } }
    return w;
  }
  w.backgroundColor = C.bg; w.setPadding(14, 15, 12, 15);
  const top = w.addStack(); top.centerAlignContent();
  const ttl = top.addText('Parsimony'); ttl.font = Font.semiboldSystemFont(13); ttl.textColor = C.acc;
  top.addSpacer();
  const mic = top.addImage(SFSymbol.named('mic.circle.fill').image); mic.imageSize = new Size(24, 24); mic.tintColor = C.acc;
  w.addSpacer(fam === 'small' ? 6 : 4);
  if (err) { const e = w.addText(err); e.font = Font.systemFont(12); e.textColor = C.mut; w.addSpacer(); return w; }
  const df = new DateFormatter(); df.locale = 'ru_RU'; df.dateFormat = 'EEEE, d MMMM';
  if (fam === 'small') {
    const big = w.addText(sum.n ? sum.done + '/' + sum.n : '—'); big.font = Font.boldRoundedSystemFont(30); big.textColor = C.tx;
    const l = w.addText(sum.n ? 'дел сделано' : 'дел на сегодня нет'); l.font = Font.systemFont(12); l.textColor = C.mut;
    if (sum.hn) { w.addSpacer(4); const h = w.addText(`Привычки ${sum.hdone}/${sum.hn}`); h.font = Font.mediumSystemFont(12); h.textColor = sum.hdone === sum.hn ? C.ok : C.tx; }
    w.addSpacer();
    const hint = w.addText('Нажмите и скажите'); hint.font = Font.systemFont(11); hint.textColor = C.mut;
    return w;
  }
  const sub = w.addText(df.string(new Date()) + (sum.n ? ` · дела ${sum.done}/${sum.n}` : '') + (sum.hn ? ` · привычки ${sum.hdone}/${sum.hn}` : ''));
  sub.font = Font.mediumSystemFont(12); sub.textColor = C.mut; sub.lineLimit = 1; sub.minimumScaleFactor = 0.8;
  w.addSpacer(8);
  const max = fam === 'large' || fam === 'extraLarge' ? 11 : 3, size = fam === 'large' ? 14 : 13;
  const list = sum.items.filter(x => !x.done).concat(sum.items.filter(x => x.done));
  if (!list.length) { const e = w.addText('На сегодня пусто. Нажмите и скажите, что запланировать.'); e.font = Font.systemFont(13); e.textColor = C.mut; }
  list.slice(0, max).forEach((x, i) => { if (i) w.addSpacer(5); row(w, x.tm, x.t, x.done, size); });
  if (list.length > max) { w.addSpacer(4); const m = w.addText('и ещё ' + (list.length - max)); m.font = Font.systemFont(11); m.textColor = C.mut; }
  if ((fam === 'large' || fam === 'extraLarge') && sum.habits.length) {
    w.addSpacer(10); const h = w.addText(sum.habits.map(x => (x.done ? '✓ ' : '○ ') + (x.e ? x.e + ' ' : '') + x.n).join('   ')); h.font = Font.systemFont(12); h.textColor = C.mut; h.lineLimit = 2;
  }
  w.addSpacer();
  const hint = w.addText('Нажмите и скажите, что добавить'); hint.font = Font.systemFont(11); hint.textColor = C.mut;
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
function resLine(x) {
  if (!x.ok) return '— ' + (x.t || RES_T[x.type] || 'Запись') + ': ' + (x.why || 'не получилось');
  let s = '✓ ' + (RES_T[x.type] || 'Запись') + ': ' + x.t;
  if (x.d) { const [y, m, d] = x.d.split('-'); s += ' — ' + Number(d) + '.' + m; }
  if (x.tm) s += ', ' + x.tm;
  if (x.amt) s += ' — ' + x.amt + ' ₽';
  if (x.rem && x.rem.length) s += ', напомню за ' + x.rem.map(m => m >= 1440 ? Math.round(m / 1440) + ' д' : m >= 60 ? Math.round(m / 60) + ' ч' : m + ' мин').join(' и ');
  return s;
}
async function say() {
  let text = '';
  try { text = (await Dictation.start('ru-RU') || '').trim(); } catch (e) { text = ''; }
  if (!text) {   // диктовка не сработала — можно напечатать
    const a = new Alert(); a.title = 'Что добавить?'; a.message = 'Например: «завтра в 10 стоматолог, напомни за час»'; a.addTextField('Скажите или напишите'); a.addAction('Добавить'); a.addCancelAction('Отмена');
    if (await a.presentAlert() === -1) return false; text = a.textFieldValue(0).trim(); if (!text) return false;
  }
  let j; try { j = await call({ op: 'say', text }); }
  catch (e) { const a = new Alert(); a.title = 'Не получилось'; a.message = e.message; a.addAction('Ещё раз'); a.addCancelAction('Закрыть'); if (await a.presentAlert() === 0) return say(); return false; }
  const a = new Alert(); a.title = (j.res || []).some(x => x.ok) ? 'Готово' : 'Ничего не добавлено';
  a.message = [j.reply, ...(j.res || []).map(resLine)].filter(Boolean).join('\n\n');
  a.addAction('Сказать ещё'); a.addAction('Открыть Parsimony'); a.addCancelAction('Закрыть');
  const b = await a.presentAlert();
  if (b === 0) return say();
  if (b === 1) Safari.open(APP);
  return true;
}

// ---- Запуск ----
async function main() {
  if (KEY.indexOf('_') === 0) { const a = new Alert(); a.title = 'Нет ключа'; a.message = 'Скопируйте код заново: Parsimony → Настройки → «Виджет iPhone» → «Скопировать код».'; a.addAction('OK'); await a.presentAlert(); return; }
  if (config.runsInWidget) {
    let sum = null, err = '';
    try { sum = await call({ op: 'sum' }); } catch (e) { err = e.message; }
    try { await syncReminders(); } catch (e) {}   // «Напоминания» — тихо, если нет доступа (его даёт первый запуск в самом Scriptable)
    Script.setWidget(buildWidget(sum, err)); return;
  }
  const act = (args.queryParameters || {}).act;
  if (act === 'say') { await say(); try { await syncReminders(); } catch (e) {} return; }
  // Запуск из самого Scriptable — меню
  const a = new Alert(); a.title = 'Parsimony'; a.message = 'Виджет готов. Нажмите на него на экране «Домой» — и скажите, что добавить.';
  a.addAction('Сказать, что добавить'); a.addAction('Синхронизировать «Напоминания»'); a.addAction('Показать виджет'); a.addAction('Открыть Parsimony'); a.addCancelAction('Закрыть');
  const b = await a.presentAlert();
  if (b === 0) { await say(); try { await syncReminders(); } catch (e) {} }
  else if (b === 1) {
    const r = new Alert();
    try { const x = await syncReminders(); r.title = 'Синхронизировано'; r.message = `Список «${LIST}» в «Напоминаниях».\nНовых в Parsimony и отметок: ${x.up}\nНовых в «Напоминаниях»: ${x.made}\nОбновлено: ${x.changed}`; }
    catch (e) { r.title = 'Не получилось'; r.message = String(e.message || e); }
    r.addAction('OK'); await r.presentAlert();
  }
  else if (b === 2) { let sum = null, err = ''; try { sum = await call({ op: 'sum' }); } catch (e) { err = e.message; } await buildWidget(sum, err).presentMedium(); }
  else if (b === 3) Safari.open(APP);
}
await main();
Script.complete();
