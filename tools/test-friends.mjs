// Проверка «Друзей»: node tools/test-friends.mjs
// 1. Списки недоступных ников в supabase/sql/friends.sql — те же, что в js/names.js.
// 2. Если есть PGlite (настоящий Postgres внутри Node: PGLITE_DIR=папка, где выполнен `npm i @electric-sql/pglite@0.2.17`) —
//    SQL выполняется целиком: проверка ника на сервере совпадает с приложением, каждый видит только своё, заявки, приглашения,
//    удаление аккаунта. Без PGlite эта часть пропускается (с пометкой).
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(root, p), 'utf8').replace(/\r\n/g, '\n');
const namesSrc = read('js/names.js').split('// ---- Поле ввода')[0];
const L = new Function(namesSrc + '\nreturn { nameBad, NB_ANY, NB_START, NB_EXACT, NB_RES_ANY, NB_RES_EXACT, NB_SAFE, NB_VIS, NB_DI, NB_TR };')();
const sql = read('supabase/sql/friends.sql');

let bad = 0, n = 0;
const ok = (c, msg) => { n++; if (!c) { bad++; console.log('ОШИБКА:', msg); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---- 1. Списки ----
const sqlArr = name => { const m = sql.match(new RegExp(name + " text\\[\\] := array\\[([^\\]]*)\\]")); return m ? m[1].split(',').map(s => s.trim().replace(/^'|'$/g, '')) : null; };
[['nb_any', L.NB_ANY], ['nb_start', L.NB_START], ['nb_exact', L.NB_EXACT], ['nb_res_any', L.NB_RES_ANY], ['nb_res_exact', L.NB_RES_EXACT], ['nb_safe', L.NB_SAFE]]
  .forEach(([k, js]) => ok(same(sqlArr(k), js), `${k} в friends.sql не совпадает с names.js`));
ok(same(sqlArr('di_k'), Object.keys(L.NB_DI)) && same(sqlArr('di_v'), Object.values(L.NB_DI)), 'сочетания транслита (di_k, di_v) не совпадают с NB_DI');
const trPair = m => { const ks = Object.keys(m); return `translate(%, '${ks.join('')}', '${ks.map(k => m[k]).join('')}')`; };
ok(sql.includes(trPair(L.NB_VIS).replace('%', 's')), 'двойники (translate s) не совпадают с NB_VIS');
ok(sql.includes(trPair(L.NB_TR).replace('%', 'tr')), 'транслит по буквам (translate tr) не совпадает с NB_TR');

// ---- 2. Настоящий Postgres ----
const pgDir = process.env.PGLITE_DIR || '';
const pgEntry = pgDir && join(pgDir, 'node_modules', '@electric-sql', 'pglite', 'dist', 'index.js');
if (!pgEntry || !existsSync(pgEntry)) {
  console.log('SQL в Postgres: пропущено (нет PGlite — задайте PGLITE_DIR)');
} else {
  const { PGlite } = await import(pathToFileURL(pgEntry).href);
  const db = new PGlite();
  // Как в Supabase: роли, auth.uid() из токена, права по умолчанию на всё новое в public
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
    grant usage on schema public to anon, authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant all on functions to anon, authenticated;`);
  await db.exec(sql);
  await db.exec(sql);   // повторный запуск безопасен

  // Ник и имя: сервер решает так же, как приложение
  const tn = read('tools/test-names.mjs'), lst = k => new Function('return ' + tn.match(new RegExp('const ' + k + ' = (\\[[\\s\\S]*?\\]);'))[1])();
  const words = [...L.NB_ANY, ...L.NB_START, ...L.NB_EXACT, ...L.NB_RES_ANY, ...L.NB_RES_EXACT, ...L.NB_SAFE];
  let seed = 7; const rnd = k => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % k; };
  const pick = s => s[rnd(s.length)], AL = 'abcdefghijklmnopqrstuvwxyz0123456789_.', CY = 'абвгдежзийклмнопрстуфхцчшщъыьэюяё';
  const corpus = [...lst('RUDE'), ...lst('RESERVED'), ...lst('GOOD'), ...words, ...words.map(w => 'x' + w + '7'), ...words.map(w => w.toUpperCase()),
    ...Array.from({ length: 1500 }, () => Array.from({ length: 3 + rnd(12) }, () => pick(AL)).join('')),
    ...Array.from({ length: 800 }, () => Array.from({ length: 3 + rnd(10) }, () => pick(CY + ' ')).join('')),
    ...Array.from({ length: 400 }, () => pick(words) + pick(['', '_', '.', '1', 'a']) + pick(words)),
    'shchuka', 'tshirt', 'jopa', 'suka_228', 'h.u.y', 'BigDick', 'Й', 'ЁЖИК', 'Ëжик', 'café'];
  const got = (await db.query('select x, public.name_bad(x) r from unnest($1::text[]) with ordinality u(x, i) order by i', [corpus])).rows;
  let diff = 0;
  got.forEach(({ x, r }) => { const js = L.nameBad(x); if (js !== r && diff++ < 10) console.log(`  расхождение: «${x}» приложение «${js}», сервер «${r}»`); });
  ok(!diff, `проверка имени на сервере расходится с приложением в ${diff} из ${corpus.length} случаях`);

  // Люди: A, B, C, D
  const U = { A:'00000000-0000-4000-8000-00000000000a', B:'00000000-0000-4000-8000-00000000000b', C:'00000000-0000-4000-8000-00000000000c', D:'00000000-0000-4000-8000-00000000000d' };
  await db.query('insert into auth.users (id) select unnest($1::uuid[])', [Object.values(U)]);
  const as = async (who, q, p) => {
    await db.exec(who ? `set role authenticated; select set_config('request.jwt.claim.sub', '${U[who]}', false);` : `set role anon; select set_config('request.jwt.claim.sub', '', false);`);
    try { return { rows: (await db.query(q, p)).rows }; } catch (e) { return { err: e.message }; } finally { await db.exec('reset role'); }
  };
  const one = async (who, q, p) => { const r = await as(who, q, p); return r.err ? 'ERR ' + r.err : r.rows[0] && Object.values(r.rows[0])[0]; };
  const ins = (who, nick, name) => as(who, 'insert into public.profiles (user_id, nick, name, ava, feed) values ($1, $2, $3, $4, $5) returning nick, name', [U[who], nick, name, { e:'🙂', c:'#6366f1' }, { v:1, secret:who }]);

  ok(await one('A', `select public.friend_add('bob')`) === 'noprofile', 'без карточки звать в друзья нельзя');
  ok((await ins('A', 'alice', 'Алиса')).rows, 'A создаёт свою карточку');
  ok((await ins('B', 'bob', 'Боб')).rows, 'B создаёт свою карточку');
  ok((await ins('C', 'carl', 'Карл')).rows, 'C создаёт свою карточку');
  ok(/nick_bad/.test((await ins('D', 'admin', 'Дима')).err || ''), 'ник admin сервер не пускает');
  ok(/nick_bad/.test((await ins('D', 'huy_123', 'Дима')).err || ''), 'грубый ник сервер не пускает');
  ok(/unique|duplicate/.test((await ins('D', 'alice', 'Дима')).err || ''), 'занятый ник второй раз не взять');
  ok(/check|violates/.test((await ins('D', 'Bad Nick', 'Дима')).err || ''), 'ник только из a-z, 0-9, _ и .');
  ok((await ins('D', 'dima', 'хуйло')).rows[0].name === '', 'грубое имя сервер стирает');
  ok(/permission|denied|row-level/.test((await as('D', 'insert into public.profiles (user_id, nick) values ($1, $2)', [U.A, 'zzz'])).err || ''), 'чужую карточку не создать');
  ok((await as('A', 'select user_id, nick from public.profiles')).rows.length === 1, 'A видит в таблице только свою карточку');
  ok((await as('A', 'update public.profiles set name = $1 where user_id = $2 returning 1', ['взлом', U.B])).rows.length === 0, 'A не меняет чужую карточку');
  ok((await as('A', 'delete from public.profiles where user_id = $1 returning 1', [U.B])).rows.length === 0, 'A не удаляет чужую карточку');
  ok(/permission/.test((await as('A', `update public.profiles set invite = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' where user_id = $1`, [U.A])).err || ''), 'код приглашения вручную не поменять');
  ok(/permission/.test((await as(null, 'select * from public.profiles')).err || ''), 'без входа таблица карточек закрыта');
  ok(/permission/.test((await as(null, 'select * from public.friends_list()')).err || ''), 'без входа список друзей закрыт');
  ok(/permission/.test((await as(null, `select * from public.friend_find('bob')`)).err || ''), 'без входа поиск по нику закрыт');

  const f = await as('A', `select * from public.friend_find(' @Bob ')`);
  ok(f.rows && f.rows.length === 1 && f.rows[0].name === 'Боб' && f.rows[0].rel === '' && !('feed' in f.rows[0]), 'поиск по нику: имя и значок, без ленты');
  ok((await as('A', `select * from public.friend_find('bo')`)).rows.length === 0, 'поиск только по нику целиком');
  ok(await one('A', `select public.friend_add('alice')`) === 'self', 'себя в друзья нельзя');
  ok(await one('A', `select public.friend_add('nobody')`) === 'notfound', 'нет такого ника');
  ok(await one('A', `select public.friend_add('bob')`) === 'sent', 'A зовёт B');
  ok(await one('A', `select public.friend_add('bob')`) === 'already', 'вторая заявка не нужна');
  const la = (await as('A', 'select * from public.friends_list()')).rows, lb = (await as('B', 'select * from public.friends_list()')).rows;
  ok(la.length === 1 && la[0].state === 'out' && la[0].feed === null, 'у A заявка «я позвал», ленты B не видно');
  ok(lb.length === 1 && lb[0].state === 'in' && lb[0].feed === null && lb[0].nick === 'alice', 'у B заявка «зовут меня», ленты A не видно');
  ok(/permission/.test((await as('C', 'insert into public.friends (a, b, ok) values ($1, $2, true)', [U.C, U.A])).err || ''), 'дружбу напрямую не записать');
  ok(/permission/.test((await as('A', 'update public.friends set ok = true')).err || ''), 'заявку напрямую не принять');
  ok(await one('A', 'select public.friend_accept($1)', [U.B]) === false, 'свою же заявку не принять за другого');
  ok(await one('B', 'select public.friend_accept($1)', [U.A]) === true, 'B принимает заявку A');
  const la2 = (await as('A', 'select * from public.friends_list()')).rows, lb2 = (await as('B', 'select * from public.friends_list()')).rows;
  ok(la2[0].state === 'ok' && la2[0].feed && la2[0].feed.secret === 'B', 'теперь A видит ленту B');
  ok(la2[0].since instanceof Date || !isNaN(Date.parse(la2[0].since)), 'видно, с какого дня дружба');
  ok(lb2[0].state === 'ok' && lb2[0].feed && lb2[0].feed.secret === 'A', 'и B видит ленту A');
  ok((await as('C', 'select * from public.friends_list()')).rows.length === 0, 'C не видит чужую дружбу');
  ok((await as('C', 'select * from public.friends')).rows.length === 0, 'C не видит строки дружбы A и B');
  ok(await one('C', `select rel from public.friend_find('alice')`) === '', 'для C Алиса — никто');

  // Встречные заявки и приглашение
  ok(await one('C', `select public.friend_add('dima')`) === 'sent', 'C зовёт D');
  ok(await one('D', `select public.friend_add('carl')`) === 'accepted', 'встречная заявка — сразу друзья');
  const code = await one('A', 'select invite from public.profiles');
  ok(/^[0-9a-f]{32}$/.test(code || ''), 'у A есть код приглашения');
  ok(await one('C', `select name from public.friend_invite_peek($1)`, [code]) === 'Алиса', 'по коду видно, кто зовёт');
  ok(await one('C', `select public.friend_invite_use($1)`, [code]) === 'accepted', 'по ссылке — сразу друзья');
  ok(await one('C', `select public.friend_invite_use($1)`, [code]) === 'already', 'второй раз — уже друзья');
  ok(await one('A', `select public.friend_invite_use($1)`, [code]) === 'self', 'своя ссылка — не дружба');
  ok(await one('C', `select public.friend_invite_use('zzz')`) === 'notfound', 'кривой код');
  const code2 = await one('A', 'select public.invite_new()');
  ok(code2 && code2 !== code, 'новая ссылка');
  ok((await as('D', 'select * from public.friend_invite_peek($1)', [code])).rows.length === 0, 'старая ссылка больше не работает');
  ok(await one('D', 'select public.friend_invite_use($1)', [code]) === 'notfound', 'по старой ссылке не подружиться');
  ok(await one('A', 'select public.friend_remove($1)', [U.C]) === true, 'A убирает C из друзей');
  ok((await as('C', `select * from public.friends_list() where nick = 'alice'`)).rows.length === 0, 'у C Алисы больше нет');
  ok(await one('B', 'select public.friend_remove($1)', [U.C]) === false, 'нельзя убрать чужую дружбу');

  // Общий список: только кто включил rank; только ник, имя, значок и числа; uid — только у друзей и себя
  ok((await as('C', 'select * from public.leaders_all()')).rows.length === 0, 'пока никто не участвует — общий список пуст');
  ok((await as('B', 'update public.profiles set rank = true, feed = $1 where user_id = $2 returning rank', [{ v: 1, at: '2026-10-21', wk: { w: '2026-10-19', t: 5, h: 9, s: 3 }, tot: { t: 50, h: 90 }, cs: [{ i: 'x' }], ev: [{ t: 'секрет' }], me: { ab: 'обо мне' } }, U.B])).rows[0].rank === true, 'участвовать можно самому');
  const glob = (await as('C', 'select * from public.leaders_all()')).rows;
  ok(glob.length === 1 && glob[0].nick === 'bob' && glob[0].wk.t === 5 && glob[0].tot.h === 90 && glob[0].uid === null && glob[0].rel === '', 'в общем списке — ник, имя и числа; uid чужого не виден');
  ok(!JSON.stringify(glob).includes('секрет') && !JSON.stringify(glob).includes('обо мне') && !('feed' in glob[0]), 'календарь и профиль в общий список не попадают');
  ok((await as('B', 'select * from public.leaders_all()')).rows[0].me === true, 'себя в общем списке видно как «я»');
  ok(/permission/.test((await as(null, 'select * from public.leaders_all()')).err || ''), 'без входа общий список закрыт');
  ok((await as('C', 'update public.profiles set rank = true where user_id = $1 returning 1', [U.B])).rows.length === 0, 'включить общий список за другого нельзя');

  // Размер ленты
  ok(/check|violates/.test((await as('B', 'update public.profiles set feed = $1 where user_id = $2', [{ x:'я'.repeat(200000) }, U.B])).err || ''), 'лента больше ~300 КБ не влезет');

  // Админ: служебный ник и имя — можно, грубые — нет; себя админом не сделать, чужую строку admins не увидеть
  ok(/permission/.test((await as('B', 'insert into public.admins (user_id) values ($1)', [U.B])).err || ''), 'стать админом из приложения нельзя');
  await db.query('insert into public.admins (user_id) values ($1)', [U.B]);
  ok((await as('B', 'select * from public.admins')).rows.length === 1, 'админ видит свою строку');
  ok((await as('C', 'select * from public.admins')).rows.length === 0, 'не админ не видит, кто админ');
  ok(/nick_bad/.test((await as('C', 'update public.profiles set nick = $1 where user_id = $2', ['parsimony', U.C])).err || ''), 'не админу ник parsimony нельзя');
  ok((await as('B', 'update public.profiles set nick = $1, name = $2 where user_id = $3 returning nick, name', ['parsimony', 'PARSIMONY', U.B])).rows[0].name === 'PARSIMONY', 'админу служебные ник и имя можно');
  ok(/nick_bad/.test((await as('B', 'update public.profiles set nick = $1 where user_id = $2', ['huy_admin', U.B])).err || ''), 'грубый ник нельзя и админу');
  ok((await as('B', 'update public.profiles set name = $1 where user_id = $2 returning name', ['хуйло', U.B])).rows[0].name === '', 'грубое имя сервер стирает и у админа');
  ok((await as('C', 'update public.profiles set name = $1 where user_id = $2 returning name', ['Admin', U.C])).rows[0].name === '', 'служебное имя не админа сервер стирает');

  // Удаление аккаунта — всё уходит
  await db.query('delete from auth.users where id = $1', [U.A]);
  ok((await db.query('select count(*)::int n from public.profiles where user_id = $1', [U.A])).rows[0].n === 0, 'удалили аккаунт — карточки нет');
  ok((await db.query('select count(*)::int n from public.friends where $1 in (a, b)', [U.A])).rows[0].n === 0, 'удалили аккаунт — дружб нет');
  ok((await as('B', 'select * from public.friends_list()')).rows.length === 0, 'у B удалённый друг пропал');
  console.log(`SQL в Postgres: ${corpus.length} имён сверено с приложением`);
}
console.log(bad ? `есть ошибки: ${bad} из ${n}` : `Друзья: всё прошло (${n} проверок)`);
process.exitCode = bad ? 1 : 0;
