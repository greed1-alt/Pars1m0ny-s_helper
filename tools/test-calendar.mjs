// Проверка функции calendar (supabase/functions/calendar/index.ts, между метками CORE). Запуск: node tools/test-calendar.mjs
// 1) occurs сервера = occurs приложения (js/core.js) на случайных событиях;
// 2) туда и обратно: случайные события приложения → ссылка-подписка (feedIcs) → разбор (parseIcs) → те же дни, время, названия, места;
// 3) чужие календари: как у Google (пояс, UTC, EXDATE, изменённый день повтора, отменённое), Outlook (Windows-пояс), «второй вторник»,
//    «N раз», весь день на неделю, перенос строк, экранирование, напоминания внутри события;
// 4) ссылка-подписка: только выбранные календари, без примера, заметки по выбору, пояс Москвы описан, UNTIL в UTC, строки ≤ 75 байт;
// 5) защита ссылок на чужой календарь: только https на 443, без IP, логина, внутренних имён; внутренние адреса.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

process.env.TZ = 'Europe/Moscow';
const root = new URL('..', import.meta.url);
const rd = f => readFileSync(new URL(f, root), 'utf8').replace(/\r\n/g, '\n');
const fn = rd('supabase/functions/calendar/index.ts');
const core = fn.slice(fn.indexOf('// ==== CORE start ===='), fn.indexOf('// ==== CORE end ===='));
assert.ok(core.length > 1000, 'нет метки CORE в функции calendar');
const srv = new Function(core + '\nreturn { occurs, feedIcs, parseIcs, feedUrl, privIp, icsWhen, expandRule, toRepeat, rruleOf, addD, dayIn, hashS };')();

const app = rd('js/core.js');
const pick = re => { const m = app.match(re); assert.ok(m, 'не нашёл в core.js: ' + re); return m[0]; };
const cli = new Function([pick(/const ds = d => .*\n/), pick(/const pd = s => .*\n/), pick(/const dowIdx = s => .*\n/),
  pick(/const isRec = e => .*\n/), pick(/const wkNum = .*\n/), pick(/function occurs\(e, k\) \{[\s\S]*?\n\}\n/), 'return { occurs, ds, pd };'].join('\n'))();

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; };
let seed = 11; const rnd = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
const T0 = Date.UTC(2026, 10, 25, 9, 0), today = '2026-11-25';
const rk = (base, span) => srv.addD(base, rnd(span));
const TYPES = ['none', 'daily', 'weekdays', 'weekly', 'monthly', 'yearly'];
const hh = () => String(rnd(23)).padStart(2, '0') + ':' + ['00', '15', '30', '45'][rnd(4)];

// ---- 1. occurs = приложение ----
for (let i = 0; i < 2000; i++) {
  const date = rk('2026-01-01', 800), type = TYPES[rnd(6)], e = { id: 'e' + i, date };
  if (type !== 'none') e.repeat = { type, days: rnd(2) ? [...new Set([rnd(7), rnd(7)])] : [], until: rnd(3) ? null : rk('2026-01-01', 900) };
  if (type === 'weekly' && i % 2) e.repeat.every = 2;
  if (rnd(2)) e.skip = [rk('2026-01-01', 800)];
  for (let j = 0; j < 20; j++) { const k = rk('2026-01-01', 900); ok(srv.occurs(e, k) === cli.occurs(e, k), `occurs ${JSON.stringify(e)} ${k}`); }
}

// ---- 2. Туда и обратно ----
const evs = [];
for (let i = 0; i < 1500; i++) {
  const date = rk('2026-09-01', 300), type = TYPES[rnd(6)], timed = rnd(3) > 0, t = hh();
  const e = { id: 'r' + i, title: ['Встреча', 'Обед, кафе; «Ромашка»', 'Тренировка\\зал', 'Созвон с командой ' + i][rnd(4)], date, cat: 'c' + rnd(3) };
  if (timed) { e.time = t; if (rnd(2)) { const m = Math.min(1439, +t.slice(0, 2) * 60 + +t.slice(3) + 15 + rnd(120)); e.time2 = String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); } }
  if (rnd(3) === 0) e.loc = 'ул. Чайковского, 13, Химки';
  if (type !== 'none') e.repeat = { type, days: type === 'weekly' && rnd(2) ? [...new Set([rnd(7), rnd(7)])] : [], until: rnd(3) ? null : rk(date, 400) };
  if (type === 'weekly' && rnd(2)) e.repeat.every = 2;
  if (type !== 'none' && rnd(2)) e.skip = [rk(date, 120), rk(date, 120)];
  evs.push(e);
}
const data = { settings: { tz: 'Europe/Moscow' }, cats: [{ id: 'c0', name: 'Работа' }, { id: 'c1', name: 'Отдых' }, { id: 'c2', name: 'Учёба' }], events: evs };
const ics = srv.feedIcs(data, T0);
ok(ics.split('\r\n').every(l => Buffer.byteLength(l) <= 75), 'строки ≤ 75 байт');
ok(/BEGIN:VTIMEZONE\r\nTZID:Europe\/Moscow[\s\S]*TZOFFSETTO:\+0300/.test(ics), 'пояс Москвы описан');
const back = srv.parseIcs(ics, 'Europe/Moscow', today);
const byId = new Map(); back.events.forEach(x => { const id = x.id.split('-')[0]; (byId.get(id) || byId.set(id, []).get(id)).push(x); });
const lo = srv.addD(today, -60), hi = srv.addD(today, 400);
const daysOf = list => { const s = new Set(); for (const x of list) { if (x.r) { const ev = { date: x.d, repeat: x.r, skip: x.sk || [] }; for (let k = lo; k <= hi; k = srv.addD(k, 1)) if (srv.occurs(ev, k)) s.add(k); } else if (x.d >= lo && x.d <= hi) s.add(x.d); } return s; };
const uidOf = e => { const m = ics.match(new RegExp('UID:' + e.id + '@parsimony')); return !!m; };
let rt = 0;
for (const e of evs) {
  const want = new Set(); for (let k = lo; k <= hi; k = srv.addD(k, 1)) if (cli.occurs(e, k)) want.add(k);
  const recent = !e.repeat && e.date < srv.addD(today, -90);
  if (!want.size && !e.repeat) continue;
  ok(uidOf(e) || recent, 'событие попало в ссылку: ' + e.id);
  // id при разборе — отпечаток UID события: сверка точная, в обе стороны
  const h = srv.hashS(e.id + '@parsimony|'), got = back.events.filter(x => x.id === h || x.id.startsWith(h + '-'));
  ok(got.length > 0 || recent, 'событие вернулось: ' + e.id);
  if (!got.length) continue;
  ok(got.every(x => x.t === e.title && (x.tm || '') === (e.time || '') && (x.tm2 || '') === (e.time && e.time2 && e.time2 > e.time ? e.time2 : (x.tm2 || '')) && (x.loc || '') === (e.loc || '')), 'название, время, место: ' + e.id);
  const gotDays = daysOf(got);
  ok(gotDays.size === want.size && [...want].every(k => gotDays.has(k)), `дни «${e.id}» (${JSON.stringify(e.repeat)}): ${gotDays.size} / ${want.size}`);
  rt++;
}
// Точная сверка одного события на каждый вид повтора
for (const type of TYPES) {
  const e = { id: 'x-' + type, title: 'Проверка ' + type, date: '2026-11-03', time: '19:30', time2: '21:00', loc: 'Дом, 5', repeat: type === 'none' ? undefined : { type, days: type === 'weekly' ? [1, 3] : [], until: '2027-06-30' }, skip: type === 'none' ? [] : ['2026-12-01'] };
  if (type === 'weekly') e.repeat.every = 2;
  const p = srv.parseIcs(srv.feedIcs({ settings: { tz: 'Europe/Moscow' }, events: [e] }, T0), 'Europe/Moscow', today).events;
  ok(p.length >= 1 && p.every(x => x.t === e.title && x.tm === '19:30' && x.tm2 === '21:00' && x.loc === 'Дом, 5'), 'название, время, место: ' + type);
  const got = daysOf(p), want = new Set(); for (let k = lo; k <= hi; k = srv.addD(k, 1)) if (cli.occurs(e, k)) want.add(k);
  ok(got.size === want.size && [...want].every(k => got.has(k)), `дни совпали: ${type} (${got.size} / ${want.size})`);
  if (type !== 'none') ok(p.length === 1 && p[0].r && p[0].r.type === (type === 'weekdays' ? 'weekly' : type) || type === 'weekdays', 'повтор приложения, а не дни: ' + type);
}

// ---- 3. Чужие календари ----
const G = ['BEGIN:VCALENDAR', 'PRODID:-//Google Inc//Google Calendar 70.9054//EN', 'VERSION:2.0', 'X-WR-CALNAME:Работа', 'X-WR-TIMEZONE:Europe/Moscow',
  'BEGIN:VTIMEZONE', 'TZID:Europe/Moscow', 'BEGIN:STANDARD', 'TZOFFSETFROM:+0300', 'TZOFFSETTO:+0300', 'DTSTART:19700101T000000', 'END:STANDARD', 'END:VTIMEZONE',
  // планёрка по понедельникам и средам с 9:30, без 2 декабря; 9 декабря перенесена на 11:00; 16 декабря отменена
  'BEGIN:VEVENT', 'DTSTART;TZID=Europe/Moscow:20261123T093000', 'DTEND;TZID=Europe/Moscow:20261123T100000', 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE', 'EXDATE;TZID=Europe/Moscow:20261202T093000',
  'UID:plan@google.com', 'SUMMARY:Планёрка\\, команда', 'LOCATION:Офис\\; 3 этаж', 'BEGIN:VALARM', 'ACTION:DISPLAY', 'SUMMARY:не должно попасть', 'TRIGGER:-P0DT0H10M0S', 'END:VALARM', 'END:VEVENT',
  'BEGIN:VEVENT', 'DTSTART;TZID=Europe/Moscow:20261209T110000', 'DTEND;TZID=Europe/Moscow:20261209T113000', 'RECURRENCE-ID;TZID=Europe/Moscow:20261209T093000', 'UID:plan@google.com', 'SUMMARY:Планёрка (перенос)', 'END:VEVENT',
  'BEGIN:VEVENT', 'DTSTART;TZID=Europe/Moscow:20261216T093000', 'DTEND;TZID=Europe/Moscow:20261216T100000', 'RECURRENCE-ID;TZID=Europe/Moscow:20261216T093000', 'UID:plan@google.com', 'STATUS:CANCELLED', 'SUMMARY:Планёрка', 'END:VEVENT',
  // разовое в UTC: 12:00Z = 15:00 по Москве; длинное название переносится на следующую строку
  'BEGIN:VEVENT', 'DTSTART:20261201T120000Z', 'DTEND:20261201T133000Z', 'UID:one@google.com', 'SUMMARY:Очень длинное название встречи с подрядчиком по поводу ремонта о', ' фиса на третьем этаже', 'END:VEVENT',
  // отпуск на неделю — весь день
  'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20261228', 'DTEND;VALUE=DATE:20270104', 'UID:vac@google.com', 'SUMMARY:Отпуск', 'END:VEVENT',
  // второй вторник месяца, 5 раз
  'BEGIN:VEVENT', 'DTSTART;TZID=Europe/Moscow:20261208T180000', 'DURATION:PT1H30M', 'RRULE:FREQ=MONTHLY;BYDAY=2TU;COUNT=5', 'UID:club@google.com', 'SUMMARY:Книжный клуб', 'END:VEVENT',
  // каждый день, 3 раза
  'BEGIN:VEVENT', 'DTSTART;TZID=Europe/Moscow:20261130T080000', 'RRULE:FREQ=DAILY;COUNT=3', 'UID:three@google.com', 'SUMMARY:Зарядка', 'END:VEVENT',
  // отменённое разовое — не показывать
  'BEGIN:VEVENT', 'DTSTART:20261203T120000Z', 'UID:cx@google.com', 'STATUS:CANCELLED', 'SUMMARY:Отменено', 'END:VEVENT',
  // давнее — не нужно
  'BEGIN:VEVENT', 'DTSTART:20200101T120000Z', 'UID:old@google.com', 'SUMMARY:Давно', 'END:VEVENT',
  'END:VCALENDAR'].join('\r\n');
const g = srv.parseIcs(G, 'Europe/Moscow', today), gE = t => g.events.filter(x => x.t === t);
ok(g.name === 'Работа', 'название календаря');
const pl = gE('Планёрка, команда');
ok(pl.length === 1 && pl[0].r && pl[0].r.type === 'weekly' && pl[0].r.days.join() === '0,2' && pl[0].tm === '09:30' && pl[0].tm2 === '10:00' && pl[0].loc === 'Офис; 3 этаж', 'планёрка — повтор пн и ср: ' + JSON.stringify(pl));
ok(pl[0].sk.includes('2026-12-02') && pl[0].sk.includes('2026-12-09') && pl[0].sk.includes('2026-12-16'), 'исключённый, перенесённый и отменённый дни пропущены: ' + JSON.stringify(pl[0].sk));
const mv = gE('Планёрка (перенос)'); ok(mv.length === 1 && mv[0].d === '2026-12-09' && mv[0].tm === '11:00' && !mv[0].r, 'перенесённый день — отдельно в 11:00');
ok(!g.events.some(x => x.t === 'не должно попасть' || x.t === 'Отменено' || x.t === 'Давно'), 'напоминание, отменённое и давнее не попали');
const one = gE('Очень длинное название встречи с подрядчиком по поводу ремонта офиса на третьем этаже');
ok(one.length === 1 && one[0].d === '2026-12-01' && one[0].tm === '15:00' && one[0].tm2 === '16:30', 'UTC → Москва, перенос строки склеен: ' + JSON.stringify(one));
const vac = gE('Отпуск'); ok(vac.length === 7 && vac.every(x => !x.tm) && vac[0].d === '2026-12-28' && vac[6].d === '2027-01-03', 'отпуск — 7 дней без времени');
const club = gE('Книжный клуб'); ok(club.length === 5 && club.map(x => x.d).join() === '2026-12-08,2027-01-12,2027-02-09,2027-03-09,2027-04-13' && club[0].tm2 === '19:30', 'второй вторник, 5 раз: ' + club.map(x => x.d));
const z = gE('Зарядка'); ok(z.length === 1 && z[0].r.type === 'daily' && z[0].r.until === '2026-12-02', '3 раза → до 2 декабря: ' + JSON.stringify(z));
// Outlook: Windows-пояс; Нью-Йорк → Москва
const O = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'DTSTART;TZID="Russian Standard Time":20261210T140000', 'DTEND;TZID="Russian Standard Time":20261210T150000', 'UID:o1', 'SUMMARY:Outlook', 'END:VEVENT',
  'BEGIN:VEVENT', 'DTSTART;TZID=America/New_York:20261210T090000', 'UID:o2', 'SUMMARY:Нью-Йорк', 'END:VEVENT', 'END:VCALENDAR'].join('\n');
const o = srv.parseIcs(O, 'Europe/Moscow', today);
ok(o.events.find(x => x.t === 'Outlook').tm === '14:00', 'Windows-пояс Москвы');
ok(o.events.find(x => x.t === 'Нью-Йорк').tm === '17:00', 'Нью-Йорк 9:00 → Москва 17:00 (зимой разница 8 часов)');
ok(srv.parseIcs('мусор', 'Europe/Moscow', today).events.length === 0 && srv.parseIcs('BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:без даты\nEND:VEVENT\nEND:VCALENDAR', 'Europe/Moscow', today).events.length === 0, 'мусор и события без даты — пусто');
// последний день месяца, каждые 3 дня, раз в 2 года
const ex = (r, d0) => srv.expandRule(srv.rruleOf(r), d0, '', '2026-11-01', '2027-04-30');
ok(ex('FREQ=MONTHLY;BYMONTHDAY=-1', '2026-11-30').join() === '2026-11-30,2026-12-31,2027-01-31,2027-02-28,2027-03-31,2027-04-30', 'последний день месяца');
ok(ex('FREQ=DAILY;INTERVAL=3', '2026-11-01').slice(0, 3).join() === '2026-11-01,2026-11-04,2026-11-07', 'каждые 3 дня');
ok(ex('FREQ=MONTHLY;BYDAY=-1FR', '2026-11-27').slice(0, 3).join() === '2026-11-27,2026-12-25,2027-01-29', 'последняя пятница');
ok(ex('FREQ=WEEKLY;INTERVAL=3;BYDAY=TU', '2020-01-07').length > 0, 'давний повтор раз в 3 недели доходит до окна');

// ---- 4. Ссылка-подписка: что попадает ----
const d2 = { settings: { tz: 'Europe/Moscow', feed: { cats: ['c0'], notes: false } }, cats: [{ id: 'c0', name: 'Работа' }, { id: 'c1', name: 'Личное' }],
  events: [{ id: 'a', title: 'Рабочее', date: today, time: '10:00', cat: 'c0', note: 'секрет', reminder: { enabled: true, offsets: [15] } }, { id: 'b', title: 'Личное', date: today, cat: 'c1' },
    { id: 'c', title: 'Пример', date: today, cat: 'c0', demo: true }, { id: 'd', title: 'Повтор', date: today, time: '09:00', cat: 'c0', repeat: { type: 'daily', until: '2026-12-31' } }] };
const f2 = srv.feedIcs(d2, T0);
ok(f2.includes('SUMMARY:Рабочее') && !f2.includes('SUMMARY:Личное') && !f2.includes('Пример'), 'только выбранные календари, без примера');
ok(!f2.includes('секрет') && !f2.includes('VALARM'), 'без заметок и напоминаний');
ok(srv.feedIcs({ ...d2, settings: { tz: 'Europe/Moscow', feed: { notes: true } } }, T0).includes('DESCRIPTION:секрет'), 'заметки — если включено');
ok(f2.includes('RRULE:FREQ=DAILY;UNTIL=20261231T205900Z'), 'UNTIL в UTC: 31 декабря 23:59 по Москве = 20:59Z');
ok(f2.includes('DTSTART;TZID=Europe/Moscow:20261125T100000'), 'время с поясом');
ok(srv.feedIcs(null, T0).includes('END:VCALENDAR') && srv.feedIcs({ events: [null, 5, { id: 1 }] }, T0).includes('END:VCALENDAR'), 'пустые и битые записи');

// ---- 5. Ссылки ----
const good = ['https://calendar.google.com/calendar/ical/abc%40group.calendar.google.com/private-123/basic.ics', 'webcal://p01-caldav.icloud.com/published/2/abc', 'https://calendar.yandex.ru/export/ics.xml?private_token=x&tz_id=Europe/Moscow', 'https://example.com:443/a.ics'];
good.forEach(u => ok(srv.feedUrl(u) && srv.feedUrl(u).startsWith('https://'), 'подходит: ' + u));
const bad = ['http://calendar.google.com/a.ics', 'https://127.0.0.1/a.ics', 'https://10.0.0.5/a.ics', 'https://[::1]/a.ics', 'https://localhost/a.ics', 'https://api-gw:8000/x', 'https://db.internal/a', 'https://printer.local/a',
  'https://user:pass@example.com/a.ics', 'https://example.com:8443/a.ics', 'ftp://example.com/a.ics', 'javascript:alert(1)', 'https://x', ''];
bad.forEach(u => ok(srv.feedUrl(u) === null, 'не подходит: ' + u));
['10.1.2.3', '127.0.0.1', '192.168.0.1', '172.20.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1'].forEach(ip => ok(srv.privIp(ip), 'внутренний: ' + ip));
['8.8.8.8', '172.32.0.1', '194.67.125.109', '2a00:1450::1'].forEach(ip => ok(!srv.privIp(ip), 'внешний: ' + ip));

console.log(`Календари: всё прошло (${checks} проверок; туда и обратно — ${rt} событий)`);
