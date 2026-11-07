// Тест запросов функции reminders к базе (supabase/functions/reminders/index.ts, блок между метками IO) — 3 ноября 2026, к открытому запуску.
// Запуск: node tools/test-reminders-io.mjs — перед каждым изменением функции reminders (вместе с test-reminders.mjs).
// Подставляет выдуманную базу на 450 человек с ~1100 устройствами и проверяет:
// 1) id уходят порциями (не больше CHUNK в одном запросе, адрес запроса короткий), подписки читаются страницами (сервер отдаёт до 1000 строк);
// 2) из записей берётся только нужное пушам (не весь JSON: без денег, заметок, самочувствия, фото), язык и выключатели пушей работают;
// 3) напоминание уходит каждому один раз, на все его устройства; очереди сообщений и заявок — с именами отправителей.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const src = readFileSync(new URL('../supabase/functions/reminders/index.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const cut = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b); assert.ok(i >= 0 && j > i, 'нет меток ' + a); return src.slice(i, j); };
const code = cut('// ==== CORE start ====', '// ==== CORE end ====') + cut('// ==== IO start ====', '// ==== IO end ====');
const make = new Function('sb', 'sendTo', code + '\nreturn { tick, queueTick, CHUNK, DATA_SEL, PREF_SEL };');
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };

const uid = i => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
const NOW = Date.UTC(2026, 10, 3, 12, 0), DAYK = '2026-11-03';
// Выдуманная база: таблицы — массивы строк; запросы — как у supabase-js (цепочка, потом await)
function fakeDb(T) {
  const log = { ins: [], sels: [], pages: 0 };
  const pick = (row, sel) => {
    const out = {};
    for (const part of sel.split(',')) {
      const [alias, path] = part.includes(':') ? part.split(':') : [part, part];
      let v = row; for (const k of path.split(/->>?/)) v = v == null ? undefined : v[k];
      out[alias] = v === undefined ? null : v;
    }
    return out;
  };
  const from = t => {
    const q = { op: 'select', sel: '*', f: [], range: null, limit: null, payload: null };
    const b = {
      select(s) { if (q.op === 'select') q.sel = s; return b; },
      not(c) { q.f.push(r => r[c] != null); return b; },
      in(c, v) { log.ins.push({ t, n: v.length, len: v.join(',').length }); q.f.push(r => v.includes(r[c])); return b; },
      eq(c, v) { q.f.push(r => r[c] === v); return b; },
      is(c, v) { q.f.push(r => (r[c] ?? null) === v); return b; },
      like(c, p) { q.f.push(r => String(r[c]).startsWith(p.replace('%', ''))); return b; },
      gte(c, v) { q.f.push(r => r[c] >= v); return b; },
      lt(c, v) { q.f.push(r => r[c] < v); return b; },
      order() { return b; }, limit(x) { q.limit = x; return b; }, range(a, z) { q.range = [a, z]; return b; },
      upsert(row) { q.op = 'upsert'; q.payload = row; return b; }, update(v) { q.op = 'update'; q.payload = v; return b; }, delete() { q.op = 'delete'; return b; },
      then(res, rej) { try { res(run()); } catch (e) { rej(e); } },
    };
    const run = () => {
      T[t] = T[t] || [];
      if (q.op === 'upsert') { const k = q.payload.user_id + '|' + q.payload.key; if (T[t].some(r => r.user_id + '|' + r.key === k)) return { data: [] }; T[t].push(q.payload); return { data: [{ key: q.payload.key }] }; }
      const rows = T[t].filter(r => q.f.every(f => f(r)));
      if (q.op === 'delete') { T[t] = T[t].filter(r => !rows.includes(r)); return { data: rows }; }
      if (q.op === 'update') { rows.forEach(r => Object.assign(r, q.payload)); return { data: rows }; }
      if (t === 'user_data') log.sels.push(q.sel);
      let out = q.sel === '*' ? rows : rows.map(r => pick(r, q.sel));
      if (q.range) { log.pages++; out = out.slice(q.range[0], q.range[1] + 1); }
      return { data: out.slice(0, Math.min(q.limit || 1000, 1000)), error: null };   // больше 1000 строк за раз сервер не отдаёт
    };
    return b;
  };
  return { from, log, auth: { admin: { getUserById: async () => ({ data: null }) } } };
}
const world = () => {
  const T = { push_subscriptions: [], user_data: [], reminder_log: [], profiles: [], msg_notify: [], fr_notify: [], app_config: [], feedback: [], admin_log: [], admins: [] };
  for (let i = 1; i <= 450; i++) {
    for (let d = 0; d <= i % 4; d++) T.push_subscriptions.push({ endpoint: `https://push.example/${i}/${d}`, p256dh: 'k', auth: 'a', user_id: uid(i) });
    T.user_data.push({ user_id: uid(i), data: {
      events: [{ id: 'e' + i, title: 'Встреча ' + i, date: DAYK, time: '11:55', reminder: { enabled: true, offsets: [0] } }],
      habits: [], goals: [],
      settings: { tz: 'UTC', lang: i % 2 ? 'en' : 'ru', msgPush: i === 5 ? false : undefined, cover: { img: 'data:image/png;base64,' + 'A'.repeat(4000) } },
      fin: { ops: [{ sum: 100 }] }, notes: [{ text: 'личное' }], bio: { log: { [DAYK]: { sleep: 7 } } },
    } });
    T.profiles.push({ user_id: uid(i), name: i === 9 ? 'Аня' : 'Человек ' + i, nick: 'n' + i });
  }
  return T;
};
const devices = T => T.push_subscriptions.length;

// 1) Ежеминутный разбор
{
  const T = world(), db = fakeDb(T), sent = [];
  const { tick, CHUNK, DATA_SEL, PREF_SEL } = make(db, async (subs, payload) => { sent.push({ uid: subs[0].user_id, n: subs.length, p: JSON.parse(payload) }); return { ok: subs.length, fail: 0 }; });
  ok(devices(T) > 1000, 'устройств больше 1000 — проверяем чтение страницами: ' + devices(T));
  const r = await tick(NOW);
  ok(r.users === 450 && r.due === 450, `все 450 человек разобраны, у каждого одно напоминание: ${r.users} / ${r.due}`);
  ok(r.sent === devices(T), `напоминание ушло на все устройства: ${r.sent} из ${devices(T)}`);
  ok(new Set(sent.map(x => x.uid)).size === 450 && sent.length === 450, 'каждому человеку — один пуш');
  ok(db.log.pages >= 2, 'подписки прочитаны страницами, а не первые 1000: страниц ' + db.log.pages);
  ok(db.log.ins.length > 0 && db.log.ins.every(x => x.n <= CHUNK && x.len < 4000), `в одном запросе не больше ${CHUNK} id, адрес короткий (макс. ${Math.max(...db.log.ins.map(x => x.len))} знаков)`);
  ok(db.log.sels.every(s => s === DATA_SEL || s === PREF_SEL), 'из записей читаются только выбранные поля');
  for (const bad of ['fin', 'notes', 'bio', 'cover', 'img']) ok(!DATA_SEL.includes(bad) && !PREF_SEL.includes(bad), 'не читается лишнее: ' + bad);
  ok(!DATA_SEL.split(',').includes('data') && !PREF_SEL.split(',').includes('data'), 'весь JSON записей (data) не читается');
  const en = sent.find(x => x.uid === uid(1)).p, ru = sent.find(x => x.uid === uid(2)).p;
  ok(en.body === 'Now · 11:55' && ru.body === 'Сейчас · 11:55' && ru.title === 'Встреча 2', `язык пуша — из настроек: «${en.body}» / «${ru.body}»`);
  const again = await tick(NOW + 30000);
  ok(again.due === 450 && again.sent === 0, 'через полминуты повторно не шлёт: журнал reminder_log');
}

// 2) Очереди: сообщения и заявки в друзья (вызов из базы при записи в очередь)
{
  const T = world(), db = fakeDb(T), sent = [];
  const at = new Date(NOW).toISOString();
  T.msg_notify.push({ to_uid: uid(7), from_uid: uid(9), n: 2, body: 'Привет!', at }, { to_uid: uid(5), from_uid: uid(9), n: 1, body: 'Не придёт', at });
  for (let i = 100; i < 398; i++) T.msg_notify.push({ to_uid: uid(i + 1), from_uid: uid(i), n: 1, body: 'm' + i, at: new Date(NOW + i).toISOString() });
  T.fr_notify.push({ id: 1, to_uid: uid(7), from_uid: uid(9), kind: 'req', sent_at: null, created_at: at });
  const { queueTick, CHUNK } = make(db, async (subs, payload) => { sent.push({ uid: subs[0].user_id, p: JSON.parse(payload) }); return { ok: subs.length, fail: 0 }; });
  const r = await queueTick(NOW);
  const to7 = sent.filter(x => x.uid === uid(7));
  ok(to7.some(x => x.p.title === 'Аня' && x.p.body === 'Привет! · 1 more'), 'сообщение: имя отправителя и язык получателя');
  ok(to7.some(x => x.p.body === 'Аня sent you a friend request'), 'заявка в друзья: имя и язык получателя');
  ok(!sent.some(x => x.uid === uid(5)), 'выключил «Пуш о сообщениях» — не получает');
  ok(T.msg_notify.length === 0 && T.fr_notify[0].sent_at, 'очереди разобраны');
  ok(db.log.ins.filter(x => x.t === 'profiles').every(x => x.n <= CHUNK) && db.log.ins.filter(x => x.t === 'profiles').length >= 3, 'имена отправителей — порциями');
  ok(db.log.ins.every(x => x.n <= CHUNK), 'и подписки, и настройки получателей — порциями');
  ok(r.users > 290, 'получателей в очереди: ' + r.users);
}

// 3) Дни рождения друзей (7 ноября 2026): у Ани (9) сегодня день рождения, она открыла его друзьям; её друзья — 7 (получит, английский), 10 (получит, русский), 8 (выключил пуш),
// 11 (у него ночь по часовому поясу); у 12 друг 13 — день рождения не открыт. Повторно в тот же день — не шлём
{
  const T = world(), db = fakeDb(T), sent = [];
  T.friends = [{ a: uid(9), b: uid(7), ok: true }, { a: uid(10), b: uid(9), ok: true }, { a: uid(8), b: uid(9), ok: true }, { a: uid(11), b: uid(9), ok: true }, { a: uid(12), b: uid(13), ok: true }, { a: uid(9), b: uid(20), ok: false }];
  T.profiles.find(p => p.user_id === uid(9)).feed = { me: { bd: '11-03' } };
  T.profiles.find(p => p.user_id === uid(13)).feed = { me: {} };
  T.user_data.find(r => r.user_id === uid(8)).data.settings.bdPush = false;
  T.user_data.find(r => r.user_id === uid(11)).data.settings.tz = 'Pacific/Kiritimati';   // UTC+14: там уже 2:00 4 ноября — ночь, и это не её день
  const { tick } = make(db, async (subs, payload) => { const p = JSON.parse(payload); if (p.tag && p.tag.startsWith('bday-')) sent.push({ uid: subs[0].user_id, p }); return { ok: subs.length, fail: 0 }; });
  await tick(NOW);
  ok(sent.length === 2 && sent.some(x => x.uid === uid(7)) && sent.some(x => x.uid === uid(10)), 'пуш о дне рождения — только друзьям с включённым пушем, у кого сейчас день: ' + sent.map(x => x.uid.slice(-2)).join(','));
  const ru = sent.find(x => x.uid === uid(10)).p, en = sent.find(x => x.uid === uid(7)).p;
  ok(ru.title === '🎂 Аня празднует день рождения' && en.title === "🎂 It's Аня's birthday" && ru.url === './#m=' + uid(9), 'текст на языке получателя и переход в переписку: ' + ru.title + ' / ' + en.title);
  ok(!sent.some(x => x.uid === uid(20)), 'заявка не принята — не друзья');
  await tick(NOW + 60000);
  ok(sent.length === 2, 'в тот же день повторно не шлёт');
  ok(db.log.ins.filter(x => x.t === 'friends' || x.t === 'profiles').every(x => x.n <= 100), 'друзья и даты — порциями');
  const early = world(), db2 = fakeDb(early), s2 = [];
  early.friends = [{ a: uid(9), b: uid(7), ok: true }]; early.profiles.find(p => p.user_id === uid(9)).feed = { me: { bd: '11-03' } };
  const m2 = make(db2, async (subs, payload) => { const p = JSON.parse(payload); if (p.tag && p.tag.startsWith('bday-')) s2.push(p); return { ok: subs.length, fail: 0 }; });
  await m2.tick(Date.UTC(2026, 10, 3, 7, 0));
  ok(s2.length === 0, 'раньше 9:00 по часовому поясу — не шлёт');
}

console.log(`Напоминания и база: всё прошло (${n} проверок)`);
