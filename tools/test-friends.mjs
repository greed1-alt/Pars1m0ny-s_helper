// Проверка «Друзей»: node tools/test-friends.mjs
// 1. Списки недоступных ников в supabase/sql/friends.sql — те же, что в js/names.js.
// 2. Если есть PGlite (настоящий Postgres внутри Node: PGLITE_DIR=папка, где выполнен `npm i @electric-sql/pglite@0.2.17`) —
//    SQL выполняется целиком: проверка ника на сервере совпадает с приложением, каждый видит только своё, заявки, приглашения,
//    удаление аккаунта; переписка (supabase/sql/messages.sql): писать — только другу, видят только двое, прочитано, реакции, удалить своё,
//    очередь пушей, удалили друга — переписки нет. Без PGlite эта часть пропускается (с пометкой).
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
  await db.exec(read('supabase/sql/user_data.sql'));   // триггер честных очков висит на user_data
  await db.exec(sql);
  await db.exec(sql);   // повторный запуск безопасен
  const msql = read('supabase/sql/messages.sql');
  await db.exec(msql); await db.exec(msql);   // переписка — после друзей, тоже повторно

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

  // Честные очки: сервер (fr_calc) считает так же, как приложение — frWeekStats (friends.js), habitStreaks и profileStats (pages.js).
  // Код приложения берём из самих файлов: поменяли правило там — тест сразу покажет расхождение с сервером
  const coreJs = read('js/core.js'), habitsJs = read('js/habits.js'), pagesJs = read('js/pages.js'), shareJs = read('js/share.js'), frJs = read('js/friends.js');
  const line = (src, re) => { const m = src.match(re); if (!m) throw new Error('нет в коде приложения: ' + re); return m[0]; };
  const block = (src, head) => { const i = src.indexOf(head); if (i < 0) throw new Error('нет в коде приложения: ' + head); return src.slice(i, src.indexOf('\n}\n', i) + 2); };
  const expr = (src, key) => line(src, new RegExp('^\\s*' + key + ': .*,$', 'm')).replace(new RegExp('^\\s*' + key + ': '), '').replace(/,$/, '');
  const appStats = new Function(`let S, TODAY = ''; const todayK = () => TODAY;
${[/^const ds = .*$/m, /^const pd = .*$/m, /^const addDays = .*$/m, /^const dowIdx = .*$/m, /^const isRec = .*$/m].map(re => line(coreJs, re)).join('\n')}
${line(shareJs, /^const isDate = .*$/m)}
${[/^const hByKind = .*$/m, /^const hDow = .*$/m, /^const isDayKey = .*$/m, /^const hStart = .*$/m].map(re => line(habitsJs, re)).join('\n')}
${block(habitsJs, 'function dayStat(')}
${block(pagesJs, 'function habitStreaks(')}
${line(frJs, /^const frMonday = .*$/m)}
${block(frJs, 'function frWeekStats(')}
return (data, today) => { S = data; TODAY = today; const w = frWeekStats(), hs = habitStreaks();
  return { w: w.w, t: w.t, h: w.h, s: hs.cur, b: hs.best, tt: ${expr(pagesJs, 'tasksDone')}, th: ${expr(pagesJs, 'marks')} }; };`)();
  const dAdd = (k, n) => new Date(Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10) + n)).toISOString().slice(0, 10);
  const genData = today => {
    const rdate = (span, past) => dAdd(today, -rnd(span) + (past ? 0 : rnd(10)));
    const events = Array.from({ length: rnd(25) }, () => { const rec = rnd(3) === 0;
      return { task: rnd(6) > 0, demo: rnd(9) === 0, date: rdate(30), done: rnd(2) === 0, title: 'x',
        repeat: rec ? { type: pick(['daily', 'weekly', 'monthly']), days: [] } : { type: pick(['none', 'none', '']) }, doneDates: rec ? Array.from({ length: rnd(8) }, () => rdate(20)) : undefined }; });
    const habits = Array.from({ length: rnd(5) }, () => { const log = {};
      for (let i = rnd(45); i-- > 0;) log[rdate(70, true)] = pick([1, 1, 1, 0, true]);
      if (rnd(3) === 0) log[today.slice(0, 7) + ':w' + (1 + rnd(4))] = 1;
      if (rnd(2) === 0) { for (let i = 1 + rnd(18); i > 0; i--) log[dAdd(today, -i)] = 1; log[today] = pick([1, 0]); }   // серия до вчера, сегодня — как повезёт
      return { kind: pick(['daily', 'daily', 'weekly', 'monthly']), days: rnd(2) ? [] : [0, 1, 2, 3, 4, 5, 6].filter(() => rnd(2)), from: rdate(120, true), demo: rnd(10) === 0, log }; });
    return { events, habits, settings: { tz: 'Europe/Moscow' } };
  };
  let sdiff = 0, scount = 0, streaky = 0, open = 0;
  for (const today of ['2026-10-21', '2026-10-19', '2026-10-25', '2026-03-01', '2027-01-03']) {
    for (let n = 0; n < 80; n++) {
      const data = genData(today), js = appStats(JSON.parse(JSON.stringify(data)), today);
      const sv = (await db.query('select public.fr_calc($1::jsonb, $2::date) r', [data, today])).rows[0].r;
      const a = JSON.stringify(js), b = JSON.stringify({ w: sv.w, t: sv.t, h: sv.h, s: sv.s, b: sv.b, tt: sv.tt, th: sv.th });
      scount++; if (js.s > 0) streaky++; if (js.s > 0 && data.habits.some(h => h.kind === 'daily' && !h.log[today])) open++;
      if (a !== b && sdiff++ < 5) console.log('  очки расходятся (' + today + '): приложение ' + a + ', сервер ' + b);
    }
  }
  ok(!sdiff, `очки на сервере расходятся с приложением в ${sdiff} из ${scount} случаях`);
  ok(streaky > 60 && open > 5, 'среди случайных записей есть серии, в том числе с неотмеченным сегодня (иначе проверка серии ничего не доказывает): ' + streaky + ' / ' + open);
  ok(JSON.stringify((await db.query(`select public.fr_calc('[]'::jsonb, '2026-10-21') r`)).rows[0].r) === JSON.stringify({ b: 0, h: 0, s: 0, t: 0, w: '2026-10-19', at: '2026-10-21', th: 0, tt: 0 }), 'пустые и кривые записи — нули, без ошибки');

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

  // Честные очки: при сохранении записей сервер сам пишет fr_stats; друзьям и в общем списке — st
  const srvToday = (await db.query(`select (now() at time zone 'UTC')::date::text d`)).rows[0].d;
  await db.query('insert into public.user_data (user_id, data) values ($1, $2)', [U.B, { events: [{ task: true, done: true, date: srvToday, title: 'x' }, { task: true, done: true, date: '2020-01-01', title: 'y' }], habits: [], settings: { tz: 'UTC' } }]);
  const stB = (await as('A', 'select st from public.friends_list() where nick = $1', ['bob'])).rows[0].st;
  ok(stB && stB.t === 1 && stB.tt === 2 && stB.at === srvToday, 'друг видит очки, посчитанные сервером из записей');
  ok((await as('C', 'select st from public.leaders_all() where nick = $1', ['bob'])).rows[0].st.tt === 2, 'в общем списке — тоже очки сервера');
  await db.query('update public.user_data set data = $1 where user_id = $2', [{ events: 'сломано', habits: [{ log: 5 }], settings: { tz: 'Марс/База' } }, U.B]);
  ok((await db.query('select st from public.fr_stats where user_id = $1', [U.B])).rows[0].st.tt === 0, 'кривые записи и чужой часовой пояс сохранению не мешают');
  ok((await as('C', 'select * from public.fr_stats')).rows.length === 0, 'чужие очки в таблице не видны');
  ok(/permission/.test((await as('A', `select public.fr_calc('{}'::jsonb, '2026-10-21')`)).err || ''), 'считать очки за другого из приложения нельзя');
  ok(/permission/.test((await as('A', 'insert into public.fr_stats (user_id, st) values ($1, $2)', [U.A, { tt: 999 }])).err || ''), 'подменить свои очки нельзя');

  // Пуши о заявках: очередь fr_notify — кто кого позвал и кто принял; не чаще раза в час; из приложения не видна
  const nt = async (to, from, kind) => (await db.query('select count(*)::int n from public.fr_notify where to_uid = $1 and from_uid = $2 and kind = $3', [U[to], U[from], kind])).rows[0].n;
  ok(await nt('B', 'A', 'req') === 1, 'A позвал B — B получит пуш «зовёт в друзья»');
  ok(await nt('A', 'B', 'ok') === 1, 'B принял — A получит пуш «теперь в друзьях»');
  ok(await nt('C', 'D', 'ok') === 1, 'встречная заявка — пуш тому, кто звал первым');
  ok(await nt('A', 'C', 'ok') === 1, 'по ссылке-приглашению — пуш тому, чья ссылка');
  await as('C', 'select public.friend_remove($1)', [U.D]); await as('C', `select public.friend_add('dima')`);
  ok(await nt('D', 'C', 'req') === 1, 'позвал, отозвал, позвал снова — второго пуша в течение часа нет');
  ok(/permission/.test((await as('A', 'select * from public.fr_notify')).err || ''), 'очередь пушей из приложения не видна');
  ok(/permission/.test((await as('A', 'select public.fr_notify_add($1, $2, $3)', [U.B, U.A, 'req'])).err || ''), 'слать пуши другим из приложения нельзя');

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

  // Переписка (messages.sql). Сейчас друзья только A–B; C позвал D, D не ответил
  const send = (w, to, body, ev) => as(w, 'select public.msg_send($1, $2, $3) r', [U[to], body, ev === undefined ? null : ev]);
  const m1 = await send('A', 'B', '  Привет!  ');
  ok(m1.rows && m1.rows[0].r.id > 0, 'A пишет другу B');
  ok(/notfriend/.test((await send('C', 'D', 'эй')).err || ''), 'не другу (заявку не приняли) писать нельзя');
  ok(/notfriend/.test((await send('B', 'C', 'эй')).err || ''), 'чужому писать нельзя');
  ok(/permission/.test((await as(null, 'select public.msg_send($1, $2, $3)', [U.B, 'x', null])).err || ''), 'без входа писать нельзя');
  ok(/empty/.test((await send('A', 'B', '   ')).err || ''), 'пустое не отправить');
  ok(/long/.test((await send('A', 'B', 'я'.repeat(2001))).err || ''), 'длиннее 2000 знаков не отправить');
  ok(/ev/.test((await send('A', 'B', '', [1, 2])).err || '') && /ev/.test((await send('A', 'B', '', { title: 'x'.repeat(3000) })).err || ''), 'событие — только объект и не больше 2 КБ');
  const m2 = await send('B', 'A', '', { title: 'Кино', date: '2026-10-25', time: '19:00' });
  ok(m2.rows && m2.rows[0].r.id > m1.rows[0].r.id, 'B отправляет событие');
  const mlb = (await as('B', 'select * from public.msg_list($1)', [U.A])).rows;
  ok(mlb.length === 2 && mlb[0].ev.title === 'Кино' && mlb[0].mine === true && mlb[1].body === 'Привет!' && mlb[1].mine === false, 'переписка у B: новое сверху, своё помечено, пробелы по краям срезаны');
  ok((await as('C', 'select * from public.msg_list($1)', [U.B])).rows.length === 0 && (await as('C', 'select * from public.msg_list($1)', [U.A])).rows.length === 0, 'третий не видит чужую переписку');
  ok(/permission/.test((await as('B', 'select * from public.messages')).err || '') && /permission/.test((await as('A', 'insert into public.messages (a, b, body) values ($1, $2, $3)', [U.A, U.B, 'x'])).err || ''), 'таблицу напрямую — ни читать, ни писать');
  ok(/permission/.test((await as('A', 'select * from public.msg_notify')).err || ''), 'очередь пушей переписки из приложения не видна');
  const thA = (await as('A', 'select * from public.msg_threads()')).rows;
  ok(thA.length === 1 && thA[0].peer === U.B && thA[0].ev === true && thA[0].unread === 1 && thA[0].mine === false, 'переписки A: с B, последнее — событие, одно новое');
  ok(await one('B', 'select public.msg_unread()') === 1, 'у B одно непрочитанное');
  const nq = async (to, from) => (await db.query('select n, body from public.msg_notify where to_uid = $1 and from_uid = $2', [U[to], U[from]])).rows[0];
  await send('A', 'B', 'Ты где?');
  const q1 = await nq('B', 'A');
  ok(q1 && q1.n === 2 && q1.body === 'Ты где?', 'очередь пушей: два сообщения — одна строка, с последним');
  ok((await nq('A', 'B')).body === '📅 Кино', 'событие в пуше — с названием');
  ok(await one('B', 'select public.msg_read($1)', [U.A]) === 2 && !(await nq('B', 'A')) && await one('B', 'select public.msg_unread()') === 0, 'B прочитал — непрочитанных нет, пуша не будет');
  ok((await as('A', 'select read_at from public.msg_list($1)', [U.B])).rows.filter(r => r.read_at).length === 2, 'A видит, что прочитано');
  const id1 = m1.rows[0].r.id, reOf = async w => JSON.stringify((await as(w, 'select re from public.msg_list($1) where id = $2', [w === 'A' ? U.B : U.A, id1])).rows[0].re);
  ok(await one('B', 'select public.msg_react($1, $2)', [id1, '❤️']) === true && await reOf('A') === JSON.stringify({ [U.B]: '❤️' }), 'B ставит ❤️ — A её видит');
  ok(/emoji/.test((await as('B', 'select public.msg_react($1, $2)', [id1, '<b>'])).err || ''), 'реакции — только из набора');
  ok(await one('C', 'select public.msg_react($1, $2)', [id1, '👍']) === false, 'на чужую переписку реакцию не поставить');
  await as('B', 'select public.msg_react($1, $2)', [id1, '']);
  ok(await reOf('A') === '{}', 'реакцию можно снять');
  ok(await one('B', 'select public.msg_delete($1)', [id1]) === false, 'чужое сообщение не удалить');
  ok(await one('A', 'select public.msg_delete($1)', [id1]) === true && (await as('B', 'select id from public.msg_list($1)', [U.A])).rows.every(r => r.id !== id1), 'своё удалил — пропало у обоих');
  let rateErr = ''; for (let i = 0; i < 31 && !rateErr; i++) rateErr = (await send('A', 'B', 'm' + i)).err || '';
  ok(/rate/.test(rateErr), 'больше 30 сообщений в минуту — нельзя');
  await as('D', 'select public.friend_accept($1)', [U.C]);
  ok(!(await send('C', 'D', 'Привет, D')).err, 'D принял заявку C — теперь им можно переписываться');
  await as('B', 'select public.friend_remove($1)', [U.A]);
  ok((await as('A', 'select * from public.msg_list($1)', [U.B])).rows.length === 0 && (await db.query('select count(*)::int n from public.msg_notify where $1 in (to_uid, from_uid) and $2 in (to_uid, from_uid)', [U.A, U.B])).rows[0].n === 0, 'удалили из друзей — переписки и пушей нет');
  ok((await as('D', 'select * from public.msg_list($1)', [U.C])).rows.length === 1, 'переписка других друзей осталась');

  // Удаление аккаунта — всё уходит
  await db.query('delete from auth.users where id = $1', [U.A]);
  ok((await db.query('select count(*)::int n from public.profiles where user_id = $1', [U.A])).rows[0].n === 0, 'удалили аккаунт — карточки нет');
  ok((await db.query('select count(*)::int n from public.friends where $1 in (a, b)', [U.A])).rows[0].n === 0, 'удалили аккаунт — дружб нет');
  ok((await as('B', 'select * from public.friends_list()')).rows.length === 0, 'у B удалённый друг пропал');
  await db.query('delete from auth.users where id = $1', [U.D]);
  ok((await db.query('select count(*)::int n from public.messages where $1 in (a, b)', [U.D])).rows[0].n === 0 && (await as('C', 'select * from public.msg_threads()')).rows.length === 0, 'удалили аккаунт — его переписки нет и у друга');
  console.log(`SQL в Postgres: ${corpus.length} имён сверено с приложением`);
}
console.log(bad ? `есть ошибки: ${bad} из ${n}` : `Друзья: всё прошло (${n} проверок)`);
process.exitCode = bad ? 1 : 0;
