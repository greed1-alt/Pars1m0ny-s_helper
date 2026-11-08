// Проверка ParsiCoins: node tools/test-coins.mjs (с PGLITE_DIR — как у test-friends.mjs)
// 1. Каталог в supabase/sql/coins.sql — тот же, что в js/shop.js: задания, награды за достижения (ключи ACH в pages.js) и серию,
//    палитры (look.js), обложки (COVERS в pages.js), рамки, цены.
// 2. Если есть PGlite — coins.sql выполняется в настоящем Postgres: таблицы закрыты, монеты не дописать, награда — один раз,
//    заданий — не больше 3 в день и в неделю, друг — только настоящий и уже пользуется, покупки и бесплатные палитры, заморозка,
//    начисление админа — только ключом сервера; серия на сервере (fr_calc) не обрывается замороженным днём.
// 3. Честно (8 ноября 2026): награду сервер выдаёт, только если сам видит условие в записях (coin_ok) — без записей, по примеру для пробы
//    и по отметкам задним числом — нельзя; правила сервера совпадают с приложением (qDone, qSteps, qHabStat, qBio, qStreak…) на случайных записях.
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(root, p), 'utf8').replace(/\r\n/g, '\n');
const sql = read('supabase/sql/coins.sql'), shop = read('js/shop.js'), pages = read('js/pages.js'), look = read('js/look.js');

let bad = 0, n = 0;
const ok = (c, msg) => { n++; if (!c) { bad++; console.log('ОШИБКА:', msg); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---- 1. Каталог ----
const sqlArr = name => { const m = sql.match(new RegExp(name + ' (?:text|int)\\[\\] := array\\[([^\\]]*)\\]')); return m ? m[1].split(',').map(s => s.trim().replace(/^'|'$/g, '')).map(s => /^\d+$/.test(s) ? +s : s) : null; };
const sqlNum = name => { const m = sql.match(new RegExp('\\b' + name + ' int := (\\d+)')); return m ? +m[1] : null; };
const lit = (src, name) => { const i = src.indexOf('const ' + name + ' = '); if (i < 0) throw new Error('нет ' + name); const s = src.slice(i + name.length + 9); const end = s.search(/;\s*(\/\/[^\n]*)?\n/); return new Function('return ' + s.slice(0, end))(); };
const jsNum = name => { const m = shop.match(new RegExp('\\b' + name + ' = (\\d+)')); return m ? +m[1] : null; };
const keysIn = (src, head) => { const i = src.indexOf(head); return [...src.slice(i, src.indexOf('\n];', i)).matchAll(/^  \['(\w+)'/gm)].map(m => m[1]); };
const achIds = [...pages.slice(pages.indexOf('const ACH = ['), pages.indexOf('\n];', pages.indexOf('const ACH = ['))).matchAll(/, '(\w+)'\],$/gm)].map(m => m[1]);
const palKeys = [...look.slice(look.indexOf('const PAL = {'), look.indexOf('const PAL_ORDER')).matchAll(/^  (\w+):\{ n:/gm)].map(m => m[1]);
const covers = Object.keys(lit(pages, 'COVERS')), coverShop = lit(shop, 'COVER_SHOP'), achCoins = lit(shop, 'ACH_COINS'), miles = lit(shop, 'ST_MILES');
const frames = [...shop.slice(shop.indexOf('const FRAMES = {'), shop.indexOf('\n};', shop.indexOf('const FRAMES = {'))).matchAll(/^  (\w+): \{ n: '[^']*', p: (\d+)/gm)].map(m => [m[1], +m[2]]);

ok(same(sqlArr('qd'), keysIn(shop, 'const QUEST_D = [')), 'задания дня в coins.sql (qd) и shop.js (QUEST_D) разные');
ok(same(sqlArr('qw'), keysIn(shop, 'const QUEST_W = [')), 'задания недели в coins.sql (qw) и shop.js (QUEST_W) разные');
ok(same(sqlArr('qm'), keysIn(shop, 'const QUEST_M = [')), 'задания месяца в coins.sql (qm) и shop.js (QUEST_M) разные');
const firstRows = [...shop.slice(shop.indexOf('const FIRST = ['), shop.indexOf('\n];', shop.indexOf('const FIRST = ['))).matchAll(/^  \['(\w+)', .*, (\d+)\],$/gm)].map(m => [m[1], +m[2]]);
ok(firstRows.length === 11 && same(sqlArr('fs_k'), firstRows.map(x => x[0])) && same(sqlArr('fs_v'), firstRows.map(x => x[1])), 'первые шаги и их монеты в coins.sql (fs_k, fs_v) и shop.js (FIRST) разные');
ok(firstRows.reduce((a, x) => a + x[1], 0) === 120, 'первые шаги — всего 120');
ok(sqlNum('q_m') === jsNum('Q_M') && sqlNum('q_x') === jsNum('Q_X'), 'награды за задание месяца и бонус недели в coins.sql и shop.js разные');
ok(/like 'm:' \|\| p\[2\] \|\| ':%'\) >= 2/.test(sql) && jsNum('Q_MMAX') === 2, 'заданий месяца — 2 и там, и там');
ok(/having count\(\*\) >= 3\) z\) < 5/.test(sql) && jsNum('Q_XDAYS') === 5, 'бонус недели — 5 дней со всеми тремя заданиями и там, и там');
ok(/key like 'i:%'\) >= 5 then/.test(sql) && /key like 'i:%'\) < 5 then/.test(sql) && jsNum('INV_MAX') === 5, 'за друга — до 5 друзей и там, и там');
ok(achIds.length === 12 && new Set(achIds).size === achIds.length, 'у каждого достижения (ACH, pages.js) свой ключ: ' + achIds.join());
ok(same(sqlArr('ach_k'), achIds) && same(Object.keys(achCoins), achIds), 'награды за достижения: ключи в coins.sql, ACH_COINS и ACH не совпадают');
ok(same(sqlArr('ach_v'), achIds.map(k => achCoins[k])), 'награды за достижения: суммы в coins.sql и ACH_COINS разные');
ok(same(sqlArr('st_k'), miles.map(x => x[0])) && same(sqlArr('st_v'), miles.map(x => x[1])), 'награды за серию в coins.sql и ST_MILES разные');
ok(sqlNum('q_d') === jsNum('Q_D') && sqlNum('q_w') === jsNum('Q_W') && sqlNum('inv') === jsNum('INV_COINS'), 'награды за задания или друга в coins.sql и shop.js разные');
ok(same(sqlArr('pal_k'), palKeys.filter(k => k !== 'indigo')) && palKeys[0] === 'indigo', 'палитры в продаже (pal_k) — все из look.js, кроме Индиго');
const palP = [...look.slice(look.indexOf('const PAL = {'), look.indexOf('const PAL_ORDER')).matchAll(/^  (\w+):\{ n:'[^']*', p:(\d+)/gm)].map(m => [m[1], +m[2]]);
ok(same(sqlArr('pal_s'), palP.filter(x => x[1] === sqlNum('pal_sp')).map(x => x[0])) && same(sqlArr('pal_u'), palP.filter(x => x[1] === sqlNum('pal_up')).map(x => x[0])) && palP.length === sqlArr('pal_s').length + sqlArr('pal_u').length, 'цены тематических тем в coins.sql и look.js разные');
ok(same(sqlArr('cv_k'), Object.keys(coverShop)) && Object.keys(coverShop).every(k => covers.includes(k)), 'обложки в продаже (cv_k) = COVER_SHOP, у каждой есть градиент в COVERS');
ok(same(sqlArr('fm_k'), frames.map(x => x[0])) && same(sqlArr('fm_v'), frames.map(x => x[1])), 'рамки и их цены в coins.sql и FRAMES разные');
ok(sqlNum('pal_p') === jsNum('PAL_PRICE') && sqlNum('cv_p') === jsNum('CV_PRICE') && sqlNum('frz_p') === jsNum('FRZ_PRICE'), 'цены палитры, обложки, заморозки в coins.sql и shop.js разные');
ok(/count\(\*\) from public\.coin_items where user_id = me and free\) >= 3/.test(sql) && jsNum('PAL_FREE') === 3, 'бесплатных палитр — 3 и там, и там');
ok(/'frz' and coalesce\(cnt, 0\) >= 2/.test(sql) && jsNum('FRZ_MAX') === 2, 'заморозок про запас — 2 и там, и там');
ok(/key like p\[1\] \|\| ':' \|\| p\[2\] \|\| ':%'\) >= 3/.test(sql) && jsNum('Q_MAX') === 3, 'заданий — 3 в день и в неделю и там, и там');

// ---- 2. Настоящий Postgres ----
const pgDir = process.env.PGLITE_DIR || '';
const pgEntry = pgDir && join(pgDir, 'node_modules', '@electric-sql', 'pglite', 'dist', 'index.js');
if (!pgEntry || !existsSync(pgEntry)) {
  console.log('SQL в Postgres: пропущено (нет PGlite — задайте PGLITE_DIR)');
} else {
  const { PGlite } = await import(pathToFileURL(pgEntry).href);
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    set timezone to 'UTC';
    create schema auth; create table auth.users (id uuid primary key, created_at timestamptz not null default now());
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant all on functions to anon, authenticated;`);
  await db.exec(read('supabase/sql/user_data.sql'));
  await db.exec(read('supabase/sql/friends.sql'));
  for (const f of ['messages', 'assistant', 'push_base', 'push_lock', 'reminders']) await db.exec(read(`supabase/sql/${f}.sql`));   // их смотрит проверка условий
  await db.exec(sql); await db.exec(sql);   // повторный запуск безопасен
  await db.exec(read('supabase/sql/challenges.sql'));

  const U = Object.fromEntries([['A', 'a'], ['B', 'b'], ['C', 'c'], ['D', 'd'], ['E', 'e'], ['F', 'f'], ['G', '1a'], ['P', '1b']].map(([k, v]) => [k, '00000000-0000-4000-8000-' + v.padStart(12, '0')]));
  await db.query('insert into auth.users (id) select unnest($1::uuid[])', [Object.values(U)]);
  const as = async (who, q, p) => {
    await db.exec(who === 'srv' ? `set role service_role;` : who ? `set role authenticated; select set_config('request.jwt.claim.sub', '${U[who]}', false);` : `set role anon; select set_config('request.jwt.claim.sub', '', false);`);
    try { return { rows: (await db.query(q, p)).rows }; } catch (e) { return { err: e.message }; } finally { await db.exec('reset role'); }
  };
  const one = async (who, q, p) => { const r = await as(who, q, p); return r.err ? { err: r.err } : Object.values(r.rows[0])[0]; };
  const claim = (who, k) => one(who, 'select public.coins_claim($1) r', [k]);
  const buy = (who, it) => one(who, 'select public.coins_buy($1) r', [it]);
  const pick = (who, it) => one(who, 'select public.coins_pick($1) r', [it]);
  const state = who => one(who, 'select public.coins_state() r');
  const today = (await db.query('select current_date::text d')).rows[0].d;
  const dAdd = (k, x) => new Date(Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10) + x)).toISOString().slice(0, 10);
  const dow = new Date(today + 'T00:00:00Z').getUTCDay(), mon = dAdd(today, -((dow + 6) % 7));

  // Закрыто: без входа — ничего, таблицы напрямую — ни прочитать, ни записать; внутренние функции и начисление админа — не вызвать
  ok(/permission/.test((await state(null)).err || ''), 'без входа — нельзя');
  for (const t of ['coins', 'coin_log', 'coin_items']) {
    ok(/permission/.test((await as('A', `select * from public.${t}`)).err || ''), `${t}: прочитать напрямую нельзя`);
    ok(/permission/.test((await as('A', t === 'coins' ? `insert into public.coins (user_id, bal) values ('${U.A}', 99999)` : t === 'coin_log' ? `insert into public.coin_log (user_id, key, amt) values ('${U.A}', 'x', 99999)` : `insert into public.coin_items (user_id, item) values ('${U.A}', 'pal:sky')`)).err || ''), `${t}: записать напрямую нельзя`);
  }
  for (const f of [`coin_add('${U.A}', 'x', 99999, null)`, `coin_lock('${U.A}')`, `coin_reward('a:first')`, `coin_price('frz')`, `coins_admin('${U.A}', 99999, null)`])
    ok(/permission/.test((await as('A', 'select public.' + f)).err || ''), 'из приложения не вызвать: ' + f.split('(')[0]);
  ok((await state('A')).bal === 0, 'сначала — ноль');
  for (const f of ['coin_ok', 'coin_streak', 'coin_tasks', 'coin_days_rec'])
    ok(/permission/.test((await as('A', `select public.${f}(${f === 'coin_ok' ? `'${U.A}', 'a:first'` : f === 'coin_streak' ? `'${U.A}', '{}', current_date` : f === 'coin_tasks' ? `'{}', current_date, current_date, false` : `'${U.A}', '{}'`})`)).err || ''), 'из приложения не вызвать: ' + f);
  ok(/permission/.test((await as('A', 'select * from public.coin_days')).err || ''), 'дни «вовремя» напрямую не прочитать и не дописать');

  // Записи, по которым сервер проверяет условия (coin_ok). A: 20 задач сегодня, привычка 61 день, траты сегодня и завтра, самочувствие;
  // дни «вовремя» — как будто отмечал каждый день (их пишет триггер при сохранении; здесь — сразу за 61 день и на всю неделю)
  const T = today, range = (a, n) => Array.from({ length: n }, (_, i) => dAdd(a, i)), mo = today.slice(0, 8) + '01', moOld = dAdd(mo, -40).slice(0, 8) + '01';
  const setData = (who, d) => db.query('insert into public.user_data (user_id, data) values ($1, $2) on conflict (user_id) do update set data = excluded.data', [U[who], d]);
  const live = (who, k, days) => db.query('insert into public.coin_days (user_id, k, day) select $1, $2, unnest($3::date[]) on conflict do nothing', [U[who], k, days]);
  const tasksOn = (n, d) => Array.from({ length: n }, (_, i) => ({ id: 'e' + i, task: true, done: true, date: d, title: 'x', repeat: { type: 'none' } }));
  await setData('A', { settings: { tz: 'UTC' }, habits: [{ id: 'h1', kind: 'daily', days: [], from: dAdd(T, -60), log: Object.fromEntries(range(dAdd(T, -60), 61).map(k => [k, 1])) }],
    events: tasksOn(20, T), fin: { cats: [], ops: [{ id: 'o1', amt: 100, cat: 'x', date: T }, { id: 'o2', amt: 100, cat: 'x', date: dAdd(T, 1) }] }, bio: { log: { [T]: { m1: 3 } } } });
  await live('A', 'h', [...range(dAdd(T, -60), 61), ...range(mon, 7)]); await live('A', 'f', range(mon, 7));
  await setData('D', { settings: { tz: 'UTC', name: 'D', avatar: { e: '🙂' } }, events: tasksOn(60, T) });
  await live('D', 'h', range(mo, 20));
  await db.query("insert into public.push_subscriptions (endpoint, p256dh, auth, user_id) values ('https://push.example/1', 'k', 'a', $1)", [U.D]);

  // Задания дня: за сегодня, по 5, не больше трёх, каждое — один раз
  let r = await claim('A', `d:${today}:t3`); ok(r.ok && r.amt === 5 && r.bal === 5, 'задание дня — +5');
  ok((await claim('A', `d:${today}:t3`)).err === 'already', 'то же задание второй раз — нельзя');
  for (const k of [`d:${today}:nope`, `d:${today}:t3:x`, 'd:2026-13-01:t3', `d:${today.replace(/-0/g, '-')}:t3x`, 'd:сегодня:t3', 'x', '', 'a:', `w:${today}:nope`])
    ok(['key', 'late'].includes((await claim('A', k)).err), 'кривой ключ — нельзя: ' + k);
  ok((await claim('A', `d:${dAdd(today, -3)}:fin`)).err === 'late', 'задание за прошлые дни — нельзя');
  ok((await claim('A', `d:${dAdd(today, 5)}:fin`)).err === 'late', 'задание за будущие дни — нельзя');
  ok((await claim('A', `d:${today}:tall`)).ok && (await claim('A', `d:${today}:hall`)).ok, 'ещё два задания дня');
  ok((await claim('A', `d:${today}:fin`)).err === 'limit', 'четвёртое задание дня — нельзя');
  ok((await claim('A', `d:${dAdd(today, 1)}:fin`)).ok, 'завтрашний день (часовой пояс впереди) — свои три');
  // Задания недели: с понедельника этой недели, по 20, не больше трёх
  r = await claim('A', `w:${mon}:t15`); ok(r.ok && r.amt === 20, 'задание недели — +20');
  ok((await claim('A', `w:${dAdd(mon, 1)}:h5`)).err === 'late', 'неделя — только с понедельника');
  ok((await claim('A', `w:${dAdd(mon, -14)}:h5`)).err === 'late', 'задание позапрошлой недели — нельзя');
  ok((await claim('A', `w:${mon}:h5`)).ok && (await claim('A', `w:${mon}:f5`)).ok && (await claim('A', `w:${mon}:b5`)).err === 'limit', 'не больше трёх заданий недели');
  // Достижения и серия — один раз, суммы с сервера
  r = await claim('A', 'a:w30'); ok(r.ok && r.amt === 100, 'достижение «Железная воля» — +100');
  ok((await claim('A', 'a:w30')).err === 'already' && (await claim('A', 'a:nope')).err === 'key', 'достижение — один раз, только из списка');
  r = await claim('A', 's:7'); ok(r.ok && r.amt === 25 && (await claim('A', 's:8')).err === 'key', 'серия 7 дней — +25, других нет');
  let bal = (await state('A')).bal; ok(bal === 5 * 4 + 20 * 3 + 100 + 25, 'баланс сходится: ' + bal);
  // Задания месяца: с первого числа этого месяца, по 40, не больше двух
  r = await claim('D', `m:${mo}:mt60`); ok(r.ok && r.amt === 40, 'задание месяца — +40');
  ok((await claim('D', `m:${dAdd(mo, 1)}:mh20`)).err === 'late', 'месяц — только с первого числа');
  ok((await claim('D', `m:${moOld}:mh20`)).err === 'late', 'задание позапрошлого месяца — нельзя');
  ok((await claim('D', `m:${mo}:nope`)).err === 'key' && (await claim('D', `m:${mo}:t3`)).err === 'key', 'нет такого задания месяца');
  ok((await claim('D', `m:${mo}:mh20`)).ok && (await claim('D', `m:${mo}:mf20`)).err === 'limit', 'не больше двух заданий месяца');
  ok((await state('D')).keys.includes(`m:${mo}:mt60`), 'полученное задание месяца видно в состоянии');
  // Первые шаги — один раз, суммы с сервера
  r = await claim('D', 'f:push'); ok(r.ok && r.amt === 15, 'первый шаг «уведомления» — +15');
  ok((await claim('D', 'f:push')).err === 'already' && (await claim('D', 'f:nope')).err === 'key' && (await claim('D', 'f:prof:x')).err === 'key', 'первый шаг — один раз, только из списка');
  r = await claim('D', 'f:prof'); ok(r.ok && r.amt === 10, 'первый шаг «профиль» — +10');
  ok((await state('D')).keys.includes('f:push'), 'первые шаги видны в состоянии');
  // Бонус недели: все три задания дня в пять дней этой недели — +20; раньше, за прошлую неделю, дважды — нельзя
  const dlog = (k) => db.query('insert into public.coin_log (user_id, key, amt) values ($1, $2, 5)', [U.D, k]);
  ok((await claim('D', `q:${mon}`)).err === 'early', 'бонус недели — ничего не сделано, нельзя');
  ok((await claim('D', `q:${dAdd(mon, 1)}`)).err === 'late' && (await claim('D', 'q:нет')).err === 'key' && (await claim('D', `q:${dAdd(mon, -14)}`)).err === 'late', 'бонус — только с понедельника этой недели');
  for (let i = 0; i < 4; i++) for (const k of ['t3', 'tall', 'hall']) await dlog(`d:${dAdd(mon, i)}:${k}`);
  await dlog(`d:${dAdd(mon, 4)}:t3`); await dlog(`d:${dAdd(mon, 4)}:tall`);
  for (const k of ['t3', 'tall', 'hall']) await dlog(`d:${dAdd(mon, -1)}:${k}`);
  ok((await claim('D', `q:${mon}`)).err === 'early', 'бонус недели — 4 полных дня (прошлое воскресенье не в счёт), нельзя');
  await dlog(`d:${dAdd(mon, 4)}:hall`);
  r = await claim('D', `q:${mon}`); ok(r.ok && r.amt === 20, 'бонус недели — 5 полных дней, +20');
  ok((await claim('D', `q:${mon}`)).err === 'already' && (await state('D')).keys.includes('q:' + mon), 'бонус — один раз в неделю, виден в состоянии');
  // ---- Честно: без записей — ничего ----
  for (const k of [`d:${T}:t3`, `d:${T}:hall`, `d:${T}:bio`, `d:${T}:msg`, `w:${mon}:t15`, `w:${mon}:ch`, `m:${mo}:mt60`, 'a:first', 'a:goal1', 'a:days30', 's:3',
    'f:hab', 'f:prof', 'f:push', 'f:ai', 'f:card', 'f:friend', 'f:tour'])
    ok((await claim('C', k)).err === 'early', 'без записей — нельзя: ' + k);
  // Переписка, помощник, карточка, друг, вызов, знакомство — сервер видит сам
  await db.query("insert into public.messages (a, b, body) values ($1, $2, 'Привет')", [U.C, U.E]);
  ok((await claim('C', `d:${T}:cheer`)).err === 'early' && (await claim('C', `d:${T}:msg`)).ok, 'написал другу — «Написать», но не «Подбодрить»');
  await db.query("insert into public.messages (a, b, body) values ($1, $2, '💪 Так держать!')", [U.C, U.E]);
  ok((await claim('C', `d:${T}:cheer`)).ok, 'подбодрил — «Подбодрить»');
  await db.query("insert into public.ai_usage (user_id, day, n) values ($1, current_date, 1)", [U.C]);
  await db.query("insert into public.profiles (user_id, nick) values ($1, 'ccc')", [U.C]);
  await db.query('insert into public.friends (a, b, ok) values ($1, $2, true)', [U.C, U.E]);
  await setData('C', { settings: { tz: 'UTC', tourDone: 1 } });
  for (const k of ['f:ai', 'f:card', 'f:friend', 'f:tour']) ok((await claim('C', k)).ok, 'первый шаг засчитан по серверу: ' + k);
  await db.query("insert into public.fr_challenges (a, b, kind, week, state) values ($1, $2, 't', $3, 'on')", [U.E, U.C, mon]);
  ok((await claim('C', `w:${mon}:ch`)).ok, 'принятый вызов недели — задание «Сыграть вызов»');
  // 30 дней с Parsimony: дату начала на устройстве можно поменять — считается не раньше появления аккаунта
  await setData('G', { settings: { tz: 'UTC', since: dAdd(T, -100) } });
  ok((await claim('G', 'a:days30')).err === 'early', '«30 дней» — не раньше чем через 30 дней после появления аккаунта');
  await db.query("update auth.users set created_at = now() - interval '40 days' where id = $1", [U.G]);
  ok((await claim('G', 'a:days30')).ok, 'аккаунту 40 дней — «30 дней» можно');
  // ---- Пример для пробы не приносит ничего ----
  const hl = Object.fromEntries(range(dAdd(T, -60), 61).map(k => [k, 1]));
  await setData('E', { settings: { tz: 'UTC' },
    events: [...tasksOn(30, T).map(e => ({ ...e, demo: true })), { id: 'r', demo: true, title: 'r', date: T, repeat: { type: 'daily' }, reminder: { enabled: true } }],
    habits: [{ id: 'h', demo: true, kind: 'daily', days: [], from: dAdd(T, -60), log: hl }],
    bio: { log: Object.fromEntries(range(dAdd(T, -40), 41).map(k => [k, { m1: 3 }])), demoKeys: range(dAdd(T, -40), 41).map(k => k + '|m1') },
    fin: { cats: [{ id: 'c1', g: 'sav', plan: 5000 }], demoPlans: { c1: 0 }, ops: Array.from({ length: 60 }, (_, i) => ({ id: 'o' + i, demo: true, amt: 20000, cat: 'c1', date: T })) },
    notes: Array.from({ length: 12 }, (_, i) => ({ id: 'n' + i, demo: true, date: T, text: 'x' })),
    goals: [{ id: 'g', demo: true, title: 'x', steps: [{ done: true, doneAt: T }] }] });
  for (const k of [`d:${T}:t3`, `d:${T}:hall`, `d:${T}:bio`, `d:${T}:fin`, `d:${T}:note`, `d:${T}:goal`, `w:${mon}:t15`, `w:${mon}:b5`,
    'a:first', 'a:m100', 'a:ops50', 'a:save10k', 'a:notes10', 'a:goal1', 'a:bio30', 'a:w7', 's:3', 'f:hab', 'f:rep', 'f:rem', 'f:bud'])
    ok((await claim('E', k)).err === 'early', 'пример для пробы не считается: ' + k);
  ok(+(await db.query('select count(*) n from public.coin_days where user_id = $1', [U.E])).rows[0].n === 0, 'пример не даёт дней «вовремя»');
  // ---- Задним числом серия за монеты не растёт: сохранили 10 отмеченных дней — «вовремя» только сегодня и вчера ----
  await setData('F', { settings: { tz: 'UTC' }, habits: [{ id: 'h', kind: 'daily', days: [], from: dAdd(T, -9), log: Object.fromEntries(range(dAdd(T, -9), 10).map(k => [k, 1])) }] });
  const fd = (await db.query("select day::text d from public.coin_days where user_id = $1 and k = 'h' order by day", [U.F])).rows.map(x => x.d);
  ok(same(fd, [dAdd(T, -1), T]), 'дни «вовремя» — сегодня и вчера, а отмеченное задним числом — нет: ' + fd);
  ok((await claim('F', 's:3')).err === 'early' && (await claim('F', 'a:w7')).err === 'early', 'серия задним числом за монеты не растёт');
  ok(same((await state('F')).ld.h, [dAdd(T, -1), T]), 'приложение получает свои дни «вовремя» (ld)');
  await live('F', 'h', [dAdd(T, -3)]); await db.query('insert into public.coin_log (user_id, key, amt) values ($1, $2, 0)', [U.F, 'z:' + dAdd(T, -2)]);
  r = await claim('F', 's:3'); ok(r.ok && r.amt === 10, 'замороженный день не обрывает серию «вовремя»: 3 дня — +10');

  // ---- Правила сервера = правила приложения (shop.js) на случайных записях ----
  const coreJs = read('js/core.js'), habitsJs = read('js/habits.js'), shareJs = read('js/share.js');
  const line = (src, re) => { const m = src.match(re); if (!m) throw new Error('нет в коде приложения: ' + re); return m[0]; };
  const block = (src, head) => { const i = src.indexOf(head); if (i < 0) throw new Error('нет в коде приложения: ' + head); return src.slice(i, src.indexOf('\n}\n', i) + 2); };
  const app = new Function(`let S, TODAY = '', coins = null, cnLd = null; const todayK = () => TODAY;
${[/^const ds = .*$/m, /^const pd = .*$/m, /^const addDays = .*$/m, /^const dowIdx = .*$/m, /^const isRec = .*$/m].map(re => line(coreJs, re)).join('\n')}
${line(shareJs, /^const isDate = .*$/m)}
${[/^const hByKind = .*$/m, /^const hDow = .*$/m, /^const isDayKey = .*$/m, /^const hStart = .*$/m].map(re => line(habitsJs, re)).join('\n')}
${[/^const qDone = .*$/m, /^const qSteps = .*$/m, /^const qHabStat = .*$/m, /^const qBio = .*$/m, /^const qFin = .*$/m, /^const qOne = .*$/m, /^const qNotes = .*$/m, /^const qLive = .*$/m].map(re => line(shop, re)).join('\n')}
${block(shop, 'function qStreak(')}
return { set: (d, t, z, lv) => { S = d; TODAY = t; coins = { keys: z.map(k => 'z:' + k) }; cnLd = { h: new Set(lv), b: new Set(), f: new Set() }; },
  qDone: (a, b, g) => qDone(a, b, g ? e => e.goal : undefined), qSteps, qHabStat, qBio, qFin, qOne, qNotes, qStreak };`)();
  let seed = 7; const rnd = n => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) % n; }, pickR = l => l[rnd(l.length)];
  const rday = (span, ahead = 0) => dAdd(T, rnd(span + ahead) - span);
  const genData = () => ({
    settings: { tz: 'UTC' },
    events: Array.from({ length: rnd(30) }, (_, i) => { const rec = rnd(4) === 0;
      return { id: 'e' + i, task: rnd(5) > 0, demo: rnd(8) === 0, goal: rnd(4) === 0 ? 'g1' : undefined, title: 'x', date: rday(25, 10), done: rnd(2) === 0,
        repeat: rec ? { type: pickR(['daily', 'weekly']), days: [] } : { type: pickR(['none', 'none', '']) }, doneDates: rec ? Array.from({ length: rnd(10) }, () => rday(25, 3)) : undefined }; }),
    habits: Array.from({ length: rnd(4) }, (_, i) => { const log = {};
      for (let j = rnd(40); j-- > 0;) log[rday(60)] = pickR([1, 1, 1, 0, true]);
      if (rnd(2) === 0) for (let j = 1 + rnd(20); j >= 0; j--) log[dAdd(T, -j)] = 1;
      return { id: 'h' + i, kind: pickR(['daily', 'daily', 'daily', 'weekly']), days: rnd(2) ? [] : [0, 1, 2, 3, 4, 5, 6].filter(() => rnd(2)), from: rday(90), demo: rnd(9) === 0, log }; }),
    bio: (() => { const log = {}, dk = []; for (let j = rnd(20); j-- > 0;) { const k = rday(20, 2), id = pickR(['m1', 'm2']); (log[k] = log[k] || {})[id] = 3; if (rnd(3) === 0) dk.push(k + '|' + id); } return { log, demoKeys: dk }; })(),
    fin: { cats: [], ops: Array.from({ length: rnd(15) }, (_, i) => ({ id: 'o' + i, amt: 100, cat: 'x', date: rday(20, 2), demo: rnd(5) === 0 })) },
    notes: Array.from({ length: rnd(12) }, (_, i) => ({ id: 'n' + i, date: rday(20, 2), demo: rnd(5) === 0, text: 'x' })),
    goals: Array.from({ length: rnd(3) }, (_, i) => ({ id: 'g' + i, demo: rnd(4) === 0, title: 'x', steps: Array.from({ length: rnd(5) }, () => ({ done: rnd(2) === 0, doneAt: rday(20) })) })),
  });
  let pdiff = 0, pn = 0, sdiff = 0, streaky = 0;
  for (let it = 0; it < 250; it++) {
    const d = genData(), a = rday(20, 5), b = dAdd(a, rnd(10)), k = rday(30, 2);
    const sv = (await db.query(`select public.coin_tasks($1, $2, $3, false) t, public.coin_tasks($1, $2, $3, true) g, public.coin_steps($1, $2, $3) s,
      public.coin_notes($1, $2, $3) n, public.coin_one($1, $2, $3) o, public.coin_bio_day($1, $4) bi, public.coin_fin_day($1, $4) fi, h.pl, h.dn
      from public.coin_hab_stat($1, $4) h`, [d, a, b, k])).rows[0];
    app.set(JSON.parse(JSON.stringify(d)), T, [], []);
    const hs = app.qHabStat(k), js = { t: app.qDone(a, b), g: app.qDone(a, b, true), s: app.qSteps(a, b), n: app.qNotes(a, b), o: app.qOne(a, b), bi: app.qBio(k), fi: app.qFin(k), pl: hs.plan, dn: hs.done };
    const A = JSON.stringify(js), B = JSON.stringify({ t: sv.t, g: sv.g, s: sv.s, n: sv.n, o: sv.o, bi: sv.bi, fi: sv.fi, pl: sv.pl, dn: sv.dn });
    pn++; if (A !== B && pdiff++ < 5) console.log(`  расходится (${a}…${b}, день ${k}): приложение ${A}, сервер ${B}`);
    // Серия за монеты: случайные дни «вовремя» и заморозки + то, что запишет триггер при сохранении (сегодня и вчера)
    await db.query('delete from public.coin_days where user_id = $1', [U.P]); await db.query("delete from public.coin_log where user_id = $1", [U.P]);
    const lv = Array.from({ length: rnd(40) }, () => rday(50)), z = Array.from({ length: rnd(3) }, () => rday(20));
    if (rnd(2) === 0) for (let j = 2 + rnd(20); j >= 2; j--) lv.push(dAdd(T, -j));
    await setData('P', d); await live('P', 'h', lv);
    for (const x of [...new Set(z)]) await db.query('insert into public.coin_log (user_id, key, amt) values ($1, $2, 0)', [U.P, 'z:' + x]);
    const ss = (await db.query('select public.coin_streak($1, $2, $3::date) r', [U.P, d, T])).rows[0].r;
    app.set(JSON.parse(JSON.stringify(d)), T, [...new Set(z)], lv); const jss = app.qStreak();
    if (jss.best > 2) streaky++;
    if ((jss.cur !== ss.cur || jss.best !== ss.best) && sdiff++ < 5) console.log(`  серия расходится: приложение ${JSON.stringify(jss)}, сервер ${JSON.stringify(ss)}`);
  }
  ok(!pdiff, `условия заданий на сервере расходятся с приложением в ${pdiff} из ${pn} случаях`);
  ok(!sdiff && streaky > 30, `серия за монеты на сервере расходится с приложением в ${sdiff} из ${pn} случаях (с серией больше 2 дней — ${streaky})`);

  // Друг: только настоящий, только если уже пользуется, монеты обоим, один раз на пару
  ok((await claim('A', 'i:' + U.B)).err === 'friend', 'не друг — нельзя');
  ok((await claim('A', 'i:' + U.A)).err === 'key' && (await claim('A', 'i:' + U.B.toUpperCase())).err === 'key' && (await claim('A', 'i:нет')).err === 'key', 'себя и кривой id — нельзя');
  await db.query('insert into public.friends (a, b, ok) values ($1, $2, false)', [U.A, U.B]);
  ok((await claim('A', 'i:' + U.B)).err === 'friend', 'заявка без ответа — ещё не друг');
  await db.query('update public.friends set ok = true where a = $1 and b = $2', [U.A, U.B]);
  ok((await claim('A', 'i:' + U.B)).err === 'new', 'друг ещё не пользуется приложением — позже');
  await db.query(`insert into public.user_data (user_id, data) values ($1, '{}')`, [U.B]);
  for (let i = 0; i < 3; i++) await db.query(`update public.user_data set data = '{"x":${i}}' where user_id = $1`, [U.B]);
  r = await claim('A', 'i:' + U.B); ok(r.ok && r.amt === 50, 'друг пользуется — +50');
  ok((await state('B')).bal === 50 && (await claim('B', 'i:' + U.A)).err === 'already', 'другу тоже +50, второй раз — нельзя');
  bal += 50;

  // Покупки
  ok((await buy('A', 'fm:rainbow')).err === 'money', 'не хватает (255 из 300) — нельзя');
  ok((await one('srv', `select public.coins_admin('${U.A}', 500, 'за ошибку') r`)) === bal + 500, 'админ (ключ сервера) начисляет 500');
  bal += 500;
  r = await buy('A', 'pal:sky'); ok(r.ok && r.bal === bal - 200, 'палитра за 200'); bal -= 200;
  ok((await buy('A', 'pal:sky')).err === 'own', 'купленное второй раз — нельзя');
  for (const it of ['pal:indigo', 'pal:', 'pal:nope', 'fm:', 'cv:dusk', 'xyz', 'frz:1', ''])
    ok((await buy('A', it)).err === 'item', 'нет такой вещи: ' + it);
  r = await buy('A', 'fm:rainbow'); ok(r.ok && r.bal === bal - 300, 'рамка «Радуга» за 300'); bal -= 300;
  ok((await buy('A', 'cv:boreal')).ok, 'обложка за 150'); bal -= 150;
  ok((await buy('A', 'frz')).ok && (await buy('A', 'frz')).ok && (await buy('A', 'frz')).err === 'max', 'заморозок — не больше двух'); bal -= 100;
  await one('srv', `select public.coins_admin('${U.A}', 900, 'темы') r`); bal += 900;
  r = await buy('A', 'pal:comic'); ok(r.ok && r.bal === bal - 500, 'необычная тема за 500'); bal -= 500;
  r = await buy('A', 'pal:ember'); ok(r.ok && r.bal === bal - 400, 'тема по образцу за 400'); bal -= 400;
  ok((await state('A')).bal === bal && bal >= 0, 'баланс после покупок: ' + bal);
  ok((await buy('E', 'frz')).err === 'money', 'без монет — ничего не купить');
  // Бесплатные палитры — три
  ok((await pick('A', 'pal:mint')).ok && (await pick('A', 'pal:rose')).ok && (await pick('A', 'pal:plum')).ok, 'три палитры бесплатно');
  ok((await pick('A', 'pal:sage')).err === 'limit', 'четвёртая бесплатно — нельзя');
  ok((await pick('A', 'pal:sky')).err === 'own' && (await pick('B', 'fm:gold')).err === 'item' && (await pick('B', 'pal:indigo')).err === 'item', 'своё, рамку и Индиго бесплатно не взять');
  ok((await state('A')).bal === bal, 'бесплатные палитры не тратят монеты');
  ok((await pick('B', 'pal:pixel')).err === 'item' && (await pick('B', 'pal:techno')).err === 'item', 'тематические темы бесплатно не взять');
  // Заморозка
  const fz = d => one('A', 'select public.coins_freeze($1::date) r', [d]);
  r = await fz(dAdd(today, -1)); ok(r.ok && r.n === 1, 'заморозка вчерашнего дня');
  r = await fz(dAdd(today, -1)); ok(r.ok && r.already, 'тот же день ещё раз — без траты');
  ok((await fz(dAdd(today, -5))).err === 'day' && (await fz(dAdd(today, 1))).err === 'day', 'давно прошедший и будущий день — нельзя');
  ok((await fz(dAdd(today, -2))).ok && (await fz(dAdd(today, -3))).err === 'none', 'заморозки кончились');
  ok((await one('B', 'select public.coins_freeze($1::date) r', [dAdd(today, -1)])).err === 'none', 'без заморозки — нельзя');
  const st = await state('A');
  ok(st.items.frz === 0 && st.items['pal:sky'] === 1 && st.free === 3 && st.keys.includes('z:' + dAdd(today, -1)) && st.keys.includes(`d:${today}:t3`) && !st.keys.some(k => k.startsWith('b:')), 'состояние: вещи, бесплатные, полученные награды');
  ok(st.log.length > 10 && st.log[0].k.startsWith('z:') && st.log.some(x => x.k.startsWith('adm:') && x.n === 'за ошибку'), 'история — новые сверху, с пометкой админа');
  ok((await state('B')).log.length === 1 && (await state('E')).bal === 0, 'у каждого — только своя история');
  // Админ: списать не ниже нуля; из приложения — нельзя; неизвестный человек — ошибка
  ok((await one('srv', `select public.coins_admin('${U.B}', -1000, null) r`)) === 0, 'списать больше, чем есть, — до нуля');
  ok(/amt/.test((await one('srv', `select public.coins_admin('${U.B}', 0, null) r`)).err || '') && /user/.test((await one('srv', `select public.coins_admin('00000000-0000-4000-8000-0000000000ff', 5, null) r`)).err || ''), 'ноль и неизвестный человек — ошибка');
  // Серия на сервере: замороженный день не обрывает (как habitStreaks в pages.js)
  const hlog = {}; for (let i = 2; i <= 6; i++) hlog[dAdd(today, -i)] = 1;
  const d0 = { habits: [{ kind: 'daily', days: [], from: dAdd(today, -30), log: hlog }] };
  const calc = async d => (await db.query('select public.fr_calc($1::jsonb, $2::date) r', [d, today])).rows[0].r;
  ok((await calc(d0)).s === 0, 'вчера пропуск — серии нет');
  ok((await calc({ ...d0, frz: [dAdd(today, -1)] })).s === 5, 'вчера заморожен — серия 5 дней');
  ok((await calc({ ...d0, frz: 'x' })).s === 0 && (await calc({ ...d0, frz: [5, null] })).s === 0, 'кривые заморозки — без ошибки и без серии');
  // Удалили аккаунт — монет и истории нет
  await db.query('delete from auth.users where id = $1', [U.A]);
  ok(+(await db.query('select (select count(*) from public.coins where user_id = $1) + (select count(*) from public.coin_log where user_id = $1) + (select count(*) from public.coin_items where user_id = $1) n', [U.A])).rows[0].n === 0, 'удалили аккаунт — монеты, история и вещи удалены');
  console.log('SQL в Postgres: проверено');
}
if (bad) { console.log(`ParsiCoins: ошибок ${bad} из ${n}`); process.exit(1); }
console.log(`ParsiCoins: всё прошло (${n} проверок)`);
