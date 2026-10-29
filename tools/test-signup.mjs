// Тест функции signup (supabase/functions/signup/index.ts): node tools/test-signup.mjs — перед каждым изменением функции.
// 1) поля: почта, одноразовые почты, ответ капчи; регистрация закрыта — отказ, ничего не создаётся;
// 2) лимиты (с адреса за час, новых за сутки — из админки) проверяются раньше капчи, капча — раньше создания аккаунта;
// 3) по тексту функции: почта и адрес не сохраняются, ключи — из окружения, CORS — только сайты Parsimony, в Supabase регистрацию не включаем.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const src = readFileSync(new URL('../supabase/functions/signup/index.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const core = src.slice(src.indexOf('// ==== SIGNUP start ===='), src.indexOf('// ==== SIGNUP end ===='));
const signupHandle = new Function(core + '\nreturn signupHandle;')();
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };

const fake = (o = {}) => {
  const calls = [], logs = [];
  const db = { calls, logs,
    async cfg() { calls.push('cfg'); return o.cfg || { signup_on: true }; },
    async ipKey(ip) { calls.push('ipKey'); return 'k:' + ip; },
    async counts(k) { calls.push('counts:' + k); return Object.assign({ tries: 0, fresh: 0, day: 0 }, o.counts); },
    async log(k, good, why) { logs.push({ k, good, why }); },
    async captcha(t, ip) { calls.push('captcha:' + t + ':' + ip); return o.captcha !== false; },
    async create(e) { calls.push('create:' + e); return o.exists ? 'exists' : 'new'; },
  };
  return db;
};
const run = async (body, o, ip = '1.2.3.4') => { const db = fake(o); const [st, out] = await signupHandle(db, body, ip); return { st, out, db }; };
const created = r => r.db.calls.some(c => c.startsWith('create'));
const good = { email: '  Ivan.Petrov@Mail.RU ', token: 'tok' };

// 1) поля
for (const body of [null, 5, 'x', [], {}]) { const r = await run(body); ok(r.st === 400 && !created(r) && !r.db.calls.length, 'кривое тело — 400: ' + JSON.stringify(body)); }
for (const email of ['', 'bob', 'bob@', '@mail.ru', 'bob@mail', 'bo b@mail.ru', '<script>@mail.ru', 'a"b@mail.ru', 'x'.repeat(65) + '@mail.ru', 'a@' + 'b'.repeat(200) + '.ru', 5, null]) {
  const r = await run({ email, token: 'tok' }); ok(r.st === 400 && r.out.error === 'email' && !r.db.calls.length, 'плохая почта — 400: ' + String(email).slice(0, 30)); }
for (const email of ['x@mailinator.com', 'x@YOPMAIL.com', 'x@sub.guerrillamail.com', 'x@10minutemail.com', 'x@temp-mail.org']) {
  const r = await run({ email, token: 'tok' }); ok(r.st === 400 && r.out.error === 'temp' && !r.db.calls.length, 'одноразовая почта — 400: ' + email); }
for (const token of [undefined, '', '   ', 5, null, 'x'.repeat(5001)]) { const r = await run({ email: 'a@mail.ru', token }); ok(r.st === 400 && r.out.error === 'captcha' && !r.db.calls.length, 'без ответа капчи — 400'); }
let r = await run(good, { cfg: {} }); ok(r.st === 403 && r.out.error === 'closed' && !created(r) && !r.db.calls.some(c => c.startsWith('captcha')), 'регистрация закрыта — 403, ничего не создано');
r = await run(good, { cfg: { signup_on: 'true' } }); ok(r.st === 403, 'открыта — только true, не строка');

// 2) лимиты и порядок
r = await run(good, { counts: { tries: 10 } }); ok(r.st === 429 && r.out.error === 'ip' && !created(r) && !r.db.calls.some(c => c.startsWith('captcha')) && r.db.logs[0].why === 'ip', '10 попыток с адреса за час — 429, капча не тратится');
r = await run(good, { counts: { fresh: 3 } }); ok(r.st === 429 && r.out.error === 'ip' && !created(r), '3 новых аккаунта с адреса за час — 429');
r = await run(good, { counts: { day: 50 } }); ok(r.st === 429 && r.out.error === 'busy' && !created(r) && r.db.logs[0].why === 'day', '50 новых за сутки — 429 (по умолчанию)');
r = await run(good, { counts: { day: 50 }, cfg: { signup_on: true, signup_day: 200 } }); ok(r.st === 200, 'лимит в сутки из админки — 200 можно');
r = await run(good, { counts: { day: 5 }, cfg: { signup_on: true, signup_day: 5 } }); ok(r.st === 429 && r.out.error === 'busy', 'лимит из админки — 5');
r = await run(good, { counts: { day: 49 }, cfg: { signup_on: true, signup_day: 0 } }); ok(r.st === 200, 'кривой лимит — по умолчанию 50');
r = await run(good, { captcha: false }); ok(r.st === 400 && r.out.error === 'captcha' && !created(r) && r.db.logs[0].why === 'captcha', 'капча не прошла — 400, аккаунт не создан');
r = await run(good, {}, '5.6.7.8');
ok(r.st === 200 && r.out.ok && r.db.calls.includes('create:ivan.petrov@mail.ru') && r.db.calls.includes('captcha:tok:5.6.7.8') && r.db.calls.includes('counts:k:5.6.7.8'), 'всё верно — аккаунт создан, почта в нижнем регистре');
ok(r.db.calls.indexOf('counts:k:5.6.7.8') < r.db.calls.indexOf('captcha:tok:5.6.7.8') && r.db.calls.indexOf('captcha:tok:5.6.7.8') < r.db.calls.indexOf('create:ivan.petrov@mail.ru'), 'порядок: лимиты → капча → создание');
ok(r.db.logs.length === 1 && r.db.logs[0].good && r.db.logs[0].why === 'new' && !JSON.stringify(r.db.logs).includes('ivan'), 'в журнале — «new», без почты');
const r2 = await run(good, { exists: true }); ok(r2.st === 200 && JSON.stringify(r2.out) === JSON.stringify(r.out) && r2.db.logs[0].why === 'exists', 'почта уже есть — тот же ответ (не выдаём, есть ли аккаунт)');
r = await run({ email: 'ученик@почта.рф', token: 'tok' }); ok(r.st === 200, 'кириллическая почта');

// 3) по тексту функции
ok(!/sb_secret_[A-Za-z0-9]|eyJ[A-Za-z0-9_-]{20}|ysc2_[A-Za-z0-9]/.test(src), 'секретов в коде нет');
ok(/Deno\.env\.get\('SUPABASE_SERVICE_ROLE_KEY'\)/.test(src) && /Deno\.env\.get\('SMARTCAPTCHA_SERVER_KEY'\)/.test(src), 'ключи — из окружения');
ok(/ORIGINS = \['https:\/\/app\.parsimony\.ru', 'https:\/\/beta\.parsimony\.ru'\]/.test(src) && /if \(!ORIGINS\.includes\(o\)\) return json\(\{ error: 'origin' \}, 403\)/.test(src), 'только с сайтов Parsimony');
const ins = [...src.matchAll(/from\('signup_log'\)\.insert\(([^)]*)\)/g)].map(m => m[1]);
ok(ins.length === 1 && !/email|ip:\s*ip\b/.test(ins[0]) && /ip: ipk/.test(ins[0]), 'в журнал — только отпечаток адреса: ' + ins.join());
ok(/importKey\('raw', new TextEncoder\(\)\.encode\(SB_KEY\), \{ name: 'HMAC'/.test(src), 'отпечаток — HMAC ключом сервера');
ok(/return r\.ok && j\.status === 'ok'/.test(src) && /if \(!secret\) throw/.test(src), 'капча: только «ok» от Яндекса, без ключа — не пускаем');
ok(!/signup|create_user:\s*true/i.test(readFileSync(new URL('../js/cloud.js', import.meta.url), 'utf8').match(/api\('\/auth\/v1\/otp'[^;]*/g).join()), 'приложение просит код только для существующих (create_user: false)');
console.log(`Регистрация: всё прошло (${n} проверок)`);
