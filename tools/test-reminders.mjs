// Проверка ядра напоминаний (supabase/functions/reminders/index.ts, между метками CORE).
// Запуск: node tools/test-reminders.mjs   — пишет «Все проверки прошли» или падает с описанием ошибки.
// 1) occurs / isDone / remOffs сервера совпадают с приложением (js/core.js) на тысячах случайных событий;
// 2) перевод «день + время в поясе» → момент времени верен для Москвы, Нью-Йорка (летнее время) и др.;
// 3) dueReminders при запуске раз в минуту даёт каждое напоминание ровно один раз и в нужную минуту.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

process.env.TZ = 'Europe/Moscow';   // так приложение считает даты на устройстве в Москве
const root = new URL('..', import.meta.url);
const fn = readFileSync(new URL('supabase/functions/reminders/index.ts', root), 'utf8');
const core = fn.slice(fn.indexOf('// ==== CORE start ===='), fn.indexOf('// ==== CORE end ===='));
const srv = new Function(core + '\nreturn { occurs, isDone, remOffs, dueReminders, remPayload, dueDigests, digestPayload, zoned, dayIn, addD, tzOf, WINDOW };')();

// Функции приложения — прямо из js/core.js
const app = readFileSync(new URL('js/core.js', root), 'utf8');
const pick = re => { const m = app.match(re); assert.ok(m, 'не нашёл в core.js: ' + re); return m[0]; };
const cli = new Function([
  pick(/const ds = d => .*\n/), pick(/const pd = s => .*\n/), pick(/const dowIdx = s => .*\n/),
  pick(/const isRec = e => .*\n/), pick(/function occurs\(e, k\) \{[\s\S]*?\n\}\n/),
  pick(/const isDone = .*\n/), pick(/const remOffs = e => [\s\S]*?\n  return [^\n]*\n/),
  'return { occurs, isDone, remOffs, ds, pd };'].join('\n'))();

// ---- 1. Совпадение с приложением ----
let seed = 7; const rnd = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
const day0 = cli.pd('2026-01-01');
const rk = span => { const d = new Date(day0); d.setDate(d.getDate() + rnd(span)); return cli.ds(d); };
const TYPES = ['none', 'daily', 'weekdays', 'weekly', 'monthly', 'yearly'];
let checks = 0;
for (let i = 0; i < 3000; i++) {
  const date = rk(800), type = TYPES[rnd(6)];
  const e = { id: 'e' + i, date, title: 'T' + i };
  if (type !== 'none') e.repeat = { type, days: rnd(2) ? [...new Set([rnd(7), rnd(7)])] : [], until: rnd(3) ? null : rk(900) };
  if (rnd(2)) e.skip = [rk(800), rk(800)];
  if (rnd(2)) e.doneDates = [rk(800), rk(800)];
  e.done = !!rnd(2);
  if (rnd(4)) e.reminder = { enabled: !!rnd(5), offset: rnd(60), offsets: rnd(2) ? [rnd(3) * 15, 60, rnd(2) ? 1440 : 0, -5, 'x'] : undefined };
  for (let j = 0; j < 40; j++) {
    const k = rk(900);
    assert.equal(srv.occurs(e, k), cli.occurs(e, k), `occurs ${JSON.stringify(e)} ${k}`);
    assert.equal(srv.isDone(e, k), cli.isDone(e, k), `isDone ${k}`);
    checks++;
  }
  assert.deepEqual(srv.remOffs(e), cli.remOffs(e), `remOffs ${JSON.stringify(e.reminder)}`);
}
// 31-е число и 29 февраля
for (const [d, k, want] of [['2026-01-31', '2026-02-28', false], ['2026-01-31', '2026-03-31', true], ['2028-02-29', '2029-02-28', false], ['2028-02-29', '2032-02-29', true]]) {
  const e = { date: d, repeat: { type: d.slice(5) === '02-29' ? 'yearly' : 'monthly' } };
  assert.equal(srv.occurs(e, k), want); assert.equal(cli.occurs(e, k), want);
}

// ---- 2. Часовые пояса ----
const iso = t => new Date(t).toISOString();
assert.equal(iso(srv.zoned('2026-10-10', 15 * 60, 'Europe/Moscow')), '2026-10-10T12:00:00.000Z');
assert.equal(iso(srv.zoned('2026-10-10', 0, 'Asia/Vladivostok')), '2026-10-09T14:00:00.000Z');
assert.equal(iso(srv.zoned('2026-07-01', 9 * 60, 'America/New_York')), '2026-07-01T13:00:00.000Z');   // летнее время, UTC−4
assert.equal(iso(srv.zoned('2026-12-01', 9 * 60, 'America/New_York')), '2026-12-01T14:00:00.000Z');   // зимнее, UTC−5
assert.equal(iso(srv.zoned('2026-03-29', 12 * 60, 'Europe/Berlin')), '2026-03-29T10:00:00.000Z');     // день перехода на летнее
for (const tz of ['Europe/Moscow', 'Europe/Kaliningrad', 'Asia/Yekaterinburg', 'Asia/Kamchatka', 'America/New_York', 'Europe/Berlin', 'Australia/Lord_Howe']) {
  for (let i = 0; i < 400; i++) {
    const k = rk(800), min = rnd(24 * 60), t = srv.zoned(k, min, tz);
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(t)).map(x => [x.type, x.value]));
    const got = (+p.hour % 24) * 60 + +p.minute;
    // В час перехода на летнее время такого времени нет — допускаем сдвиг вперёд на этот час
    if (srv.dayIn(t, tz) !== k || got !== min) assert.ok(srv.dayIn(t, tz) === k && got - min > 0 && got - min <= 60, `zoned ${tz} ${k} ${min} → ${iso(t)}`);
    checks++;
  }
}
assert.equal(srv.tzOf({ settings: { tz: 'Not/AZone' } }), 'Europe/Moscow');
assert.equal(srv.tzOf({ settings: { tz: 'Asia/Tokyo' } }), 'Asia/Tokyo');
assert.equal(srv.tzOf(null), 'Europe/Moscow');

// ---- 3. Запуск раз в минуту: каждое напоминание ровно один раз, в свою минуту ----
const MSK = 'Europe/Moscow', at = (k, hm) => srv.zoned(k, +hm.slice(0, 2) * 60 + +hm.slice(3), MSK);
function simulate(data, fromK, toK, skipMinutes = new Set()) {
  const sent = new Map();
  for (let t = at(fromK, '00:00'); t <= at(toK, '23:59'); t += 60000) {
    if (skipMinutes.has(t)) continue;   // функция не запускалась в эту минуту
    for (const r of srv.dueReminders(data, t - srv.WINDOW, t)) if (!sent.has(r.key)) sent.set(r.key, { at: t, r });
  }
  return sent;
}
const ev = (o) => Object.assign({ id: 'x', title: 'Встреча', cat: 'c1' }, o);
const fmt = t => srv.dayIn(t, MSK) + ' ' + new Date(t + 3 * 3600e3).toISOString().slice(11, 16);
{ // разовое событие: за час, за 15 минут, в момент
  const s = simulate({ settings: { tz: MSK }, events: [ev({ date: '2026-10-12', time: '15:00', time2: '16:00', reminder: { enabled: true, offsets: [60, 15, 0] } })] }, '2026-10-11', '2026-10-12');
  assert.deepEqual([...s.values()].map(v => fmt(v.at)), ['2026-10-12 14:00', '2026-10-12 14:45', '2026-10-12 15:00']);
  const p = [...s.values()].map(v => srv.remPayload(v.r, v.at, MSK).body);
  assert.deepEqual(p, ['Сегодня в 15:00–16:00', 'Через 15 мин · 15:00–16:00', 'Сейчас · 15:00–16:00']);
}
{ // выполнено — не напоминаем; выключено — не напоминаем
  const s = simulate({ events: [ev({ date: '2026-10-12', time: '15:00', done: true, reminder: { enabled: true, offsets: [15] } }), ev({ id: 'y', date: '2026-10-12', time: '15:00', reminder: { enabled: false, offsets: [15] } })] }, '2026-10-12', '2026-10-12');
  assert.equal(s.size, 0);
}
{ // дело без времени — от 9:00; за день — накануне в 9:00
  const s = simulate({ events: [ev({ date: '2026-10-12', task: true, title: 'Купить подарок', reminder: { enabled: true, offsets: [1440, 0] } })] }, '2026-10-10', '2026-10-12');
  assert.deepEqual([...s.values()].map(v => fmt(v.at)), ['2026-10-11 09:00', '2026-10-12 09:00']);
  assert.deepEqual([...s.values()].map(v => srv.remPayload(v.r, v.at, MSK).body), ['Задача на завтра', 'Задача на сегодня']);
}
{ // по будням в 8:30, кроме пропущенного дня и отмеченного выполненным
  const e = ev({ date: '2026-10-05', time: '08:30', repeat: { type: 'weekdays' }, skip: ['2026-10-07'], doneDates: ['2026-10-08'], reminder: { enabled: true, offsets: [10] } });
  const s = simulate({ events: [e] }, '2026-10-05', '2026-10-11');
  assert.deepEqual([...s.values()].map(v => fmt(v.at)), ['2026-10-05 08:20', '2026-10-06 08:20', '2026-10-09 08:20']);
}
{ // за неделю; пропущенные запуски функции (до 10 минут) не теряют напоминание
  const e = ev({ date: '2026-10-20', time: '10:00', reminder: { enabled: true, offsets: [10080] } });
  const miss = new Set(); for (let i = 0; i < 7; i++) miss.add(at('2026-10-13', '10:00') + i * 60000);
  const s = simulate({ events: [e] }, '2026-10-13', '2026-10-13', miss);
  assert.deepEqual([...s.values()].map(v => fmt(v.at)), ['2026-10-13 10:07']);
}
{ // перенесли время — новое напоминание приходит снова (другой ключ)
  const a = srv.dueReminders({ events: [ev({ date: '2026-10-12', time: '15:00', reminder: { enabled: true, offsets: [0] } })] }, at('2026-10-12', '14:55'), at('2026-10-12', '15:00'));
  const b = srv.dueReminders({ events: [ev({ date: '2026-10-12', time: '16:00', reminder: { enabled: true, offsets: [0] } })] }, at('2026-10-12', '15:55'), at('2026-10-12', '16:00'));
  assert.equal(a.length, 1); assert.equal(b.length, 1); assert.notEqual(a[0].key, b[0].key);
}
{ // мусор в данных не роняет функцию
  const bad = { events: [null, 5, 'x', {}, { id: 1, date: '2026-13-45' }, { id: 2, date: '2026-10-12', time: '25:99', reminder: { enabled: true, offsets: [0] } }, { date: '2026-10-12', reminder: { enabled: true, offsets: [0] } }] };
  assert.doesNotThrow(() => simulate(bad, '2026-10-12', '2026-10-12'));
  assert.doesNotThrow(() => srv.dueReminders({}, 0, 1)); assert.doesNotThrow(() => srv.dueReminders(null, 0, 1));
}
{ // часовой пояс пользователя: Владивосток, 9:00 по местному = 2:00 по Москве
  const s = simulate({ settings: { tz: 'Asia/Vladivostok' }, events: [ev({ date: '2026-10-12', time: '09:00', reminder: { enabled: true, offsets: [0] } })] }, '2026-10-11', '2026-10-12');
  assert.deepEqual([...s.values()].map(v => fmt(v.at)), ['2026-10-12 02:00']);
}
// ---- 4. Сводки: утром в 9:00 и вечером в 22:00 (по умолчанию), каждая раз в день ----
function simDigests(data, fromK, toK, skipMinutes = new Set()) {
  const sent = new Map();
  for (let t = at(fromK, '00:00'); t <= at(toK, '23:59'); t += 60000) {
    if (skipMinutes.has(t)) continue;
    for (const d of srv.dueDigests(data, t - srv.WINDOW, t)) if (!sent.has(d.key)) sent.set(d.key, { at: t, d });
  }
  return sent;
}
const day = (k, o) => Object.assign({ id: 'd' + Math.random(), title: 'Дело', date: k }, o);
{ // по умолчанию — 9:00 и 22:00 каждый день
  const s = simDigests({ settings: { tz: MSK } }, '2026-10-12', '2026-10-13');
  assert.deepEqual([...s.values()].map(v => v.d.kind + ' ' + fmt(v.at)), ['am 2026-10-12 09:00', 'pm 2026-10-12 22:00', 'am 2026-10-13 09:00', 'pm 2026-10-13 22:00']);
}
{ // своё время, выключенная вечерняя, мусор в настройках
  const s = simDigests({ settings: { tz: MSK, digest: { am: true, amT: '07:30', pm: false, pmT: '23:00' } } }, '2026-10-12', '2026-10-12');
  assert.deepEqual([...s.values()].map(v => v.d.kind + ' ' + fmt(v.at)), ['am 2026-10-12 07:30']);
  const bad = simDigests({ settings: { digest: { amT: '99:99', pmT: 5, am: 'x' } } }, '2026-10-12', '2026-10-12');
  assert.deepEqual([...bad.values()].map(v => v.d.kind + ' ' + fmt(v.at)), ['am 2026-10-12 09:00', 'pm 2026-10-12 22:00']);
  assert.equal(simDigests({ settings: { digest: { am: false, pm: false } } }, '2026-10-12', '2026-10-12').size, 0);
}
{ // пропущенные запуски — сводка всё равно приходит, один раз
  const miss = new Set(); for (let i = 0; i < 5; i++) miss.add(at('2026-10-12', '09:00') + i * 60000);
  const s = simDigests({}, '2026-10-12', '2026-10-12', miss);
  assert.deepEqual([...s.values()].map(v => v.d.kind + ' ' + fmt(v.at)), ['am 2026-10-12 09:05', 'pm 2026-10-12 22:00']);
}
{ // Владивосток: 9:00 по местному
  const s = simDigests({ settings: { tz: 'Asia/Vladivostok' } }, '2026-10-12', '2026-10-12');
  assert.ok([...s.values()].some(v => v.d.kind === 'am' && fmt(v.at) === '2026-10-12 02:00'));
}
{ // тексты
  const data = { events: [
    day('2026-10-12', { title: 'Купить подарок', task: true }), day('2026-10-12', { title: 'Встреча', time: '14:00' }), day('2026-10-12', { title: 'Врач', time: '10:00' }),
    day('2026-10-12', { title: 'Сделано', time: '08:00', done: true }), day('2026-10-05', { title: 'Работа', time: '09:00', repeat: { type: 'weekdays' } }),
    day('2026-10-12', { title: 'Позвонить', task: true }),
    day('2026-10-10', { title: 'Забыл', task: true }), day('2026-10-11', { title: 'Тоже забыл' }), day('2026-08-01', { title: 'Давно', task: true }),
    day('2026-10-13', { title: 'Тренировка', time: '19:00' }), day('2026-10-13', { title: 'Отчёт', task: true }) ] };
  const am = srv.digestPayload({ kind: 'am', k: '2026-10-12' }, data);
  assert.equal(am.title, 'План на сегодня: 5 дел');
  assert.equal(am.body, '09:00 Работа, 10:00 Врач, 14:00 Встреча и ещё 2 · пропущено: 2');
  const pm = srv.digestPayload({ kind: 'pm', k: '2026-10-12' }, data);
  assert.equal(pm.title, 'Запишите задачи на завтра');
  assert.equal(pm.body, 'Не сделано сегодня: 2 · На завтра уже 3 дела: 09:00 Работа, 19:00 Тренировка и ещё 1');
  assert.equal(pm.url, './#d=2026-10-13'); assert.equal(pm.k, '2026-10-13');
  const empty = srv.digestPayload({ kind: 'am', k: '2026-10-18' }, { events: [] });
  assert.equal(empty.title, 'На сегодня дел не запланировано');
  assert.equal(srv.digestPayload({ kind: 'pm', k: '2026-10-18' }, {}).body, 'На завтра пока ничего нет');
  assert.equal(srv.digestPayload({ kind: 'am', k: '2026-10-18' }, { events: [day('2026-10-18', { title: 'Одно' })] }).title, 'План на сегодня: 1 дело');
}
console.log(`Все проверки прошли (${checks} сравнений с приложением и часовых поясов + сценарии напоминаний и сводок)`);
