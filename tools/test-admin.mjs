// Тест функции admin (supabase/functions/admin/index.ts): кто может пользоваться админкой и что она проверяет.
// Запуск: node tools/test-admin.mjs — перед каждым изменением функции admin. Пишет «Админка: всё прошло» или падает с описанием.
// 1) без входа, со служебным ключом, с чужим токеном — отказ; не админ — отказ и запись в журнал, больше ничего не вызывается;
// 2) поля: почта, id, подтверждение удаления, номер отзыва; себя и других админов трогать нельзя;
// 3) по тексту функции: записи людей (user_data.data, переписка) не читаются, «select *» нет, секретов нет.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const src = readFileSync(new URL('../supabase/functions/admin/index.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const core = src.slice(src.indexOf('// ==== ADMIN start ===='), src.indexOf('// ==== ADMIN end ===='));
const adminHandle = new Function(core + '\nreturn adminHandle;')();
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };

const ME = '11111111-1111-4111-8111-111111111111', ADM2 = '22222222-2222-4222-8222-222222222222', BOB = '33333333-3333-4333-8333-333333333333', EVE = '44444444-4444-4444-8444-444444444444';
const fake = () => {
  const calls = [], log = [];
  const db = {
    calls, logs: log,
    async user(t) { calls.push('user'); return { 'tok-me': ME, 'tok-eve': EVE }[t] || null; },
    async isAdmin(id) { return id === ME || id === ADM2; },
    async log(a, action, target, info) { log.push({ a, action, target, info }); },
    async email(id) { return { [BOB]: 'Bob@Mail.ru', [ME]: 'me@mail.ru', [ADM2]: 'adm@mail.ru' }[id] || null; },
    async stats() { calls.push('stats'); return { users: 3 }; }, async users() { calls.push('users'); return []; },
    async feedback() { calls.push('feedback'); return []; }, async journal() { calls.push('journal'); return []; },
    async fbDone(id, done) { calls.push('fbDone:' + id + ':' + done); return id === 7; },
    async invite(e) { calls.push('invite:' + e); return 'new'; },
  };
  for (const a of ['ban', 'unban', 'nick', 'name', 'del']) db[a] = async id => { calls.push(a + ':' + id); };
  return db;
};
const run = async (tok, body) => { const db = fake(); const [st, out] = await adminHandle(db, tok, body); return { st, out, db }; };

// 1) доступ
for (const t of ['', null, undefined, 'sb_secret_xxx', 'sb_publishable_xxx']) { const r = await run(t, { action: 'stats' }); ok(r.st === 401 && !r.db.calls.includes('stats'), 'без входа — 401: ' + t); }
let r = await run('tok-forged', { action: 'stats' }); ok(r.st === 401 && r.db.calls.join() === 'user', 'чужой или поддельный токен — 401');
for (const action of ['stats', 'users', 'feedback', 'log', 'invite', 'del', 'nonsense', '__proto__']) {
  r = await run('tok-eve', { action, email: 'x@y.ru', id: BOB, confirm: 'bob@mail.ru' });
  ok(r.st === 403 && r.out.error === 'forbidden' && r.db.calls.join() === 'user', 'не админ — 403, ничего не вызвано: ' + action);
  ok(r.db.logs.length === 1 && r.db.logs[0].action === 'denied' && r.db.logs[0].a === EVE, 'не админ — в журнале denied: ' + action);
}
r = await run('tok-eve', null); ok(r.st === 403, 'не админ без тела — 403');
for (const action of ['nonsense', '__proto__', 'constructor', 'toString', 'user', 'isAdmin', 'email', '', 5]) { r = await run('tok-me', { action }); ok(r.st === 400 && r.out.error === 'action', 'неизвестное действие — 400: ' + action); }
r = await run('tok-me', { action: 'stats' }); ok(r.st === 200 && r.out.users === 3 && r.db.calls.includes('stats'), 'админ — сводка');

// 2) приглашение: только настоящая почта, приводится к нижнему регистру
for (const email of ['', 'bob', 'bob@', '@mail.ru', 'bob@mail', 'bo b@mail.ru', '<script>@mail.ru', 'bob@mail.ru<img>', 'a"b@mail.ru', 'x'.repeat(65) + '@mail.ru', 'a@' + 'b'.repeat(200) + '.ru', 5, null]) {
  r = await run('tok-me', { action: 'invite', email }); ok(r.st === 400 && r.out.error === 'email' && !r.db.calls.some(c => c.startsWith('invite')), 'плохая почта — 400: ' + String(email).slice(0, 30));
}
r = await run('tok-me', { action: 'invite', email: '  Friend.Name+1@Mail.RU ' });
ok(r.st === 200 && r.out.result === 'new' && r.db.calls.includes('invite:friend.name+1@mail.ru') && r.db.logs[0].action === 'invite' && r.db.logs[0].target === 'friend.name+1@mail.ru', 'приглашение — почта в нижнем регистре, в журнале');
r = await run('tok-me', { action: 'invite', email: 'ученик@почта.рф' }); ok(r.st === 200, 'кириллическая почта');

// действия над человеком
for (const action of ['ban', 'unban', 'nick', 'name', 'del']) {
  for (const id of ['', 'bob', 5, null, BOB + 'x', "33333333-3333-4333-8333-33333333333'"]) { r = await run('tok-me', { action, id, confirm: 'bob@mail.ru' }); ok(r.st === 400 && r.out.error === 'id', `${action}: плохой id — 400`); }
  r = await run('tok-me', { action, id: ME, confirm: 'me@mail.ru' }); ok(r.st === 400 && r.out.error === 'admin' && !r.db.calls.some(c => c.startsWith(action + ':')), `${action}: себя — нельзя`);
  r = await run('tok-me', { action, id: ADM2.toUpperCase(), confirm: 'adm@mail.ru' }); ok(r.st === 400 && r.out.error === 'admin', `${action}: другого админа — нельзя`);
  r = await run('tok-me', { action, id: '55555555-5555-4555-8555-555555555555', confirm: '' }); ok(r.st === 404 && r.out.error === 'none', `${action}: нет такого — 404`);
}
for (const action of ['ban', 'unban', 'nick', 'name']) { r = await run('tok-me', { action, id: BOB }); ok(r.st === 200 && r.db.calls.includes(action + ':' + BOB) && r.db.logs[0].action === action && r.db.logs[0].target === 'Bob@Mail.ru', `${action}: сделано и в журнале`); }
for (const confirm of [undefined, '', 'bob', 'eve@mail.ru', 5]) { r = await run('tok-me', { action: 'del', id: BOB, confirm }); ok(r.st === 400 && r.out.error === 'confirm' && !r.db.calls.includes('del:' + BOB), 'удаление без верного подтверждения — 400: ' + confirm); }
r = await run('tok-me', { action: 'del', id: BOB, confirm: ' BOB@mail.RU ' }); ok(r.st === 200 && r.db.calls.includes('del:' + BOB) && r.db.logs[0].action === 'del', 'удаление с почтой (регистр не важен)');

// отзывы
for (const id of ['7', 0, -1, 1.5, null, undefined]) { r = await run('tok-me', { action: 'fbdone', id }); ok(r.st === 400 && r.out.error === 'id', 'отзыв: плохой номер — 400: ' + id); }
r = await run('tok-me', { action: 'fbdone', id: 8 }); ok(r.st === 404, 'отзыва нет — 404');
r = await run('tok-me', { action: 'fbdone', id: 7, done: false }); ok(r.st === 200 && r.db.calls.includes('fbDone:7:false') && r.db.logs[0].action === 'fb_undone', 'отзыв — вернуть в новые');

// 3) по тексту функции
ok(!/select\(\s*['"]\*/.test(src), 'нет select *');
const udSel = [...src.matchAll(/from\('user_data'\)\.select\('([^']*)'/g)].map(m => m[1]);
ok(udSel.length > 0 && udSel.every(s => !/\bdata\b/.test(s.replace('updated_at', ''))), 'из user_data — без data (записи людей не читаются): ' + udSel.join(' | '));
ok([...src.matchAll(/from\('messages'\)\.select\(([^)]*)\)/g)].every(m => /head: true/.test(m[1])), 'переписка — только число (head)');
ok(!/sb_secret_[A-Za-z0-9]|eyJ[A-Za-z0-9_-]{20}|service_role['"]\s*[:=]/.test(src.replace(/SUPABASE_SERVICE_ROLE_KEY/g, '')), 'секретов в коде нет');
ok(/Deno\.env\.get\('SUPABASE_SERVICE_ROLE_KEY'\)/.test(src) && /ORIGINS = \['https:\/\/app\.parsimony\.ru', 'https:\/\/beta\.parsimony\.ru'\]/.test(src), 'ключ из окружения, CORS — только сайты Parsimony');
ok(/isAdmin\(uid\)\)\) \{ await db\.log\(uid, 'denied'/.test(core) && core.indexOf("isAdmin(uid)") < core.indexOf('ACTIONS.includes(a)'), 'права проверяются раньше всего остального');
console.log(`Админка: всё прошло (${n} проверок)`);
