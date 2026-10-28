// Проверка ParsiCoins: node tools/test-coins.mjs (с PGLITE_DIR — как у test-friends.mjs)
// 1. Каталог в supabase/sql/coins.sql — тот же, что в js/shop.js: задания, награды за достижения (ключи ACH в pages.js) и серию,
//    палитры (look.js), обложки (COVERS в pages.js), рамки, цены.
// 2. Если есть PGlite — coins.sql выполняется в настоящем Postgres: таблицы закрыты, монеты не дописать, награда — один раз,
//    заданий — не больше 3 в день и в неделю, друг — только настоящий и уже пользуется, покупки и бесплатные палитры, заморозка,
//    начисление админа — только ключом сервера; серия на сервере (fr_calc) не обрывается замороженным днём.
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
ok(achIds.length === 12 && new Set(achIds).size === achIds.length, 'у каждого достижения (ACH, pages.js) свой ключ: ' + achIds.join());
ok(same(sqlArr('ach_k'), achIds) && same(Object.keys(achCoins), achIds), 'награды за достижения: ключи в coins.sql, ACH_COINS и ACH не совпадают');
ok(same(sqlArr('ach_v'), achIds.map(k => achCoins[k])), 'награды за достижения: суммы в coins.sql и ACH_COINS разные');
ok(same(sqlArr('st_k'), miles.map(x => x[0])) && same(sqlArr('st_v'), miles.map(x => x[1])), 'награды за серию в coins.sql и ST_MILES разные');
ok(sqlNum('q_d') === jsNum('Q_D') && sqlNum('q_w') === jsNum('Q_W') && sqlNum('inv') === jsNum('INV_COINS'), 'награды за задания или друга в coins.sql и shop.js разные');
ok(same(sqlArr('pal_k'), palKeys.filter(k => k !== 'indigo')) && palKeys[0] === 'indigo', 'палитры в продаже (pal_k) — все из look.js, кроме Индиго');
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
    create schema auth; create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant all on functions to anon, authenticated;`);
  await db.exec(read('supabase/sql/user_data.sql'));
  await db.exec(read('supabase/sql/friends.sql'));
  await db.exec(sql); await db.exec(sql);   // повторный запуск безопасен

  const U = { A:'00000000-0000-4000-8000-00000000000a', B:'00000000-0000-4000-8000-00000000000b', C:'00000000-0000-4000-8000-00000000000c' };
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
  ok((await state('A')).bal === bal && bal >= 0, 'баланс после покупок: ' + bal);
  ok((await buy('C', 'frz')).err === 'money', 'без монет — ничего не купить');
  // Бесплатные палитры — три
  ok((await pick('A', 'pal:mint')).ok && (await pick('A', 'pal:rose')).ok && (await pick('A', 'pal:plum')).ok, 'три палитры бесплатно');
  ok((await pick('A', 'pal:sage')).err === 'limit', 'четвёртая бесплатно — нельзя');
  ok((await pick('A', 'pal:sky')).err === 'own' && (await pick('B', 'fm:gold')).err === 'item' && (await pick('B', 'pal:indigo')).err === 'item', 'своё, рамку и Индиго бесплатно не взять');
  ok((await state('A')).bal === bal, 'бесплатные палитры не тратят монеты');
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
  ok((await state('B')).log.length === 1 && (await state('C')).bal === 0, 'у каждого — только своя история');
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
