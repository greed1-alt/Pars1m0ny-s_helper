// Тест функции помощника (supabase/functions/assistant/index.ts): сообщение для нейросети (календарь на 14 дней, флаги
// подначек, сводка, история), проверка кнопок и текста, повторы при «занято» (429), новый токен (401), запасная модель
// Lite при 402. Запуск: node tools/test-assistant.mjs — перед каждым изменением функции.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'fs';
import { pathToFileURL, fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), TMP = mkdtempSync(join(tmpdir(), 'pa-'));
process.on('exit', () => rmSync(TMP, { recursive: true, force: true }));
console.error = () => {};   // журнал функции в тесте не нужен
const src = readFileSync(join(ROOT, 'supabase/functions/assistant/index.ts'), 'utf8').replace(/\r\n/g, '\n');
const cut = (a, b) => src.slice(src.indexOf(a), src.indexOf(b));
const ok = (c, msg, x) => { if (!c) { console.log('FAIL', msg, x === undefined ? '' : JSON.stringify(x).slice(0, 400)); process.exitCode = 1; } };
// 1) сообщение, проверки
{
  const mod = `const Deno = { env: { get: k => ({ AI_PROVIDER: 'gigachat' })[k] } };\n` + cut('const env =', 'const sb =') + cut('// ---- Проверка', '// ---- Нейросеть:') +
    `\nexport { userMessage, cleanNav, block, histOf, SYSTEM, HELLO, LITE, MODEL, cleanItem };`;
  const f = join(TMP, 'c.mjs'); writeFileSync(f, mod); const m = await import(pathToFileURL(f).href);
  ok(m.LITE === 'GigaChat-2' && m.MODEL === 'GigaChat-2-Pro', 'models', [m.LITE, m.MODEL]);
  const u = m.userMessage('кофе 350', { today: '2026-10-16', now: '14:05', tz: 'Europe/Moscow', cats: ['Работа'], fin: [{ n: 'Кафе', g: 'exp' }], habits: ['Вода'], goals: ['Английский'], taunts: true, praise: false, style: [{ k: 'taunt', t: 'Ну и?' }], data: 'Дела:\nсб 17.10: Врач' }, { history: [{ r: 'u', t: 'привет' }, { r: 'a', t: 'Здравствуйте' }, { r: 'x', t: 'лишнее' }] });
  ok(u.includes('пт 2026-10-16 (сегодня), сб 2026-10-17 (завтра), вс 2026-10-18') && u.includes('чт 2026-10-29.'), 'calendar 14 days', u.split('\n')[1]);
  ok(u.includes('Подначки: включены. Похвалы: выключены.') && u.includes('«Ну и?» (подначка)'), 'flags');
  ok(u.includes('Сводка записей пользователя:\nДела:\nсб 17.10: Врач'), 'data keeps lines');
  ok(u.includes('Пользователь: привет\nПомощник: Здравствуйте') && !u.includes('лишнее'), 'history');
  ok(u.trim().endsWith('"""\nкофе 350\n"""'), 'text last');
  const h = m.userMessage('', { today: '2026-10-16' }); ok(!h.includes('Сообщение пользователя') && !h.includes('Сводка'), 'hello msg w/o text');
  ok(JSON.stringify(m.cleanNav([{ to: 'set_look', label: 'Оформление' }, { to: 'evil', label: 'x' }, { to: 'cal', label: '<b>' + 'a'.repeat(60) }, { to: 'fin' }, { to: 'home' }])) === JSON.stringify([{ to: 'set_look', label: 'Оформление' }, { to: 'cal', label: '<b>' + 'a'.repeat(37) }, { to: 'fin', label: '' }]), 'nav', m.cleanNav([{ to: 'cal', label: '<b>' }]));
  ok(m.cleanNav('x').length === 0 && m.cleanNav(null).length === 0, 'nav junk');
  ok(m.block('a\r\n\r\n\r\n\u0007b  c\n• d', 100) === 'a\n\n b c\n• d', 'block', m.block('a\r\n\r\n\r\n\u0007b  c\n• d', 100));
  ok(m.block(5, 10) === '' && m.block('x'.repeat(50), 10).length === 10, 'block len');
  ok(m.histOf(Array(20).fill({ r: 'u', t: 'x' })).length === 8 && m.histOf('x').length === 0, 'hist cap');
  ok(JSON.stringify(m.cleanItem({ type: 'check', habit: '  Вода\u0000 ', date: '2026-10-15', x: 1 })) === JSON.stringify({ type: 'check', habit: 'Вода', date: '2026-10-15' }), 'check item');
  ok(m.cleanItem({ type: 'check', title: 'Зарядка' }).habit === 'Зарядка' && m.cleanItem({ type: 'check', habit: '' }) === null && m.cleanItem({ type: 'check', habit: 'x', date: '2026-02-30' }).date === null, 'check junk');
  ok(m.SYSTEM.includes('"check"') && m.SYSTEM.startsWith('Ты — Parsimony') && m.HELLO.startsWith('Ты — Parsimony'), 'persona');
  ok(m.SYSTEM.includes('set_look — Оформление') && m.SYSTEM.includes('"nav"') && m.HELLO.includes('{"reply":"..."}'), 'prompts');
  console.log('SYSTEM:', m.SYSTEM.length, 'знаков · HELLO:', m.HELLO.length);
}
// 2) запасная модель и повтор при «занято» (429)
const body = cut('async function gcToken', 'async function askDeepseek');
const run = async (model, plan) => {
  const mod = `let gcTok='', gcExp=0; const env = k => k==='GIGACHAT_AUTH_KEY' ? 'KEY' : ''; const plan=${JSON.stringify(plan)}; export const calls=[];
  const setTimeout = (f) => f();
  async function gcFetch(url, o) { if (url.includes('oauth')) return { ok:true, status:200, json: async()=>({access_token:'T', expires_at: Date.now()+1800000}) };
    const m = JSON.parse(o.body).model; calls.push(m); const p = plan[m]; const st = Array.isArray(p) ? (p.shift() ?? 200) : (p ?? 200);
    return { ok: st===200, status: st, text: async()=>'x', json: async()=>({choices:[{message:{content:'ok '+m}}]}) }; }
  ${body}
  export { askGiga };`;
  const f = join(TMP, `m${Math.random().toString(36).slice(2)}.mjs`); writeFileSync(f, mod.replace("const sleep = ms => new Promise(r => setTimeout(r, ms));", 'const sleep = async () => {};'));
  const m = await import(pathToFileURL(f).href); const r = await m.askGiga('s', 'u', { model, temp: .2, max: 100 }); return { r, calls: m.calls };
};
let x = await run('GigaChat-2-Pro', {}); ok(x.r.text === 'ok GigaChat-2-Pro' && x.calls.length === 1, 'pro ok', x);
x = await run('GigaChat-2-Pro', { 'GigaChat-2-Pro': 402 }); ok(x.r.text === 'ok GigaChat-2' && x.calls.join() === 'GigaChat-2-Pro,GigaChat-2', '402 → lite', x);
x = await run('GigaChat-2-Pro', { 'GigaChat-2-Pro': 402, 'GigaChat-2': 402 }); ok(x.r.error === 'model' && x.r.code === 402, 'both 402', x);
x = await run('GigaChat-2-Pro', { 'GigaChat-2-Pro': [429, 200] }); ok(x.r.text === 'ok GigaChat-2-Pro' && x.calls.length === 2, '429 retry ok', x);
x = await run('GigaChat-2-Pro', { 'GigaChat-2-Pro': 429 }); ok(x.r.code === 429 && x.calls.length === 3, '429 gives up after 2 retries', x);
x = await run('GigaChat-2-Pro', { 'GigaChat-2-Pro': [401, 200] }); ok(x.r.text && x.calls.length === 2, '401 fresh token', x);
x = await run('GigaChat-2-Pro', { 'GigaChat-2-Pro': 401 }); ok(x.r.code === 401 && x.calls.length === 2, '401 twice', x);
x = await run('GigaChat-2', { 'GigaChat-2': 402 }); ok(x.r.code === 402 && x.calls.length === 1, 'lite no fallback', x);
// 3) голос: подпись ответа и разбор потока Яндекса
{
  const tts = cut('// ---- Живой голос', 'const sleep');
  const mod = `const env = k => ({ SUPABASE_SERVICE_ROLE_KEY: 'srv', YANDEX_TTS_KEY: 'yk' })[k] || ''; export const sent = [];
  const fetch = async (u, o) => { sent.push({ u, o }); const a = btoa('ID3'), b = btoa('abc'); return { ok: true, status: 200, text: async () => JSON.stringify({ result: { audioChunk: { data: a } } }) + '\\n' + JSON.stringify({ result: { audioChunk: { data: b } } }) }; };
  ${tts}
export { sigOf, ttsYandex, TTS_ON };`;
  const p = join(TMP, 'tts.mjs'); writeFileSync(p, mod); const t = await import(pathToFileURL(p).href);
  const s1 = await t.sigOf('u1', 'Привет'), s2 = await t.sigOf('u1', 'Привет'), s3 = await t.sigOf('u2', 'Привет'), s4 = await t.sigOf('u1', 'Привет!');
  ok(s1 === s2 && s1 !== s3 && s1 !== s4 && /^[A-Za-z0-9_-]{43}$/.test(s1), 'sig', [s1, s3]);
  const a = await t.ttsYandex('Привет'); ok(a && new TextDecoder().decode(a) === 'ID3abc', 'tts chunks', a && [...a]);
  const req = JSON.parse(t.sent[0].o.body); ok(t.sent[0].u.includes('tts/v3/utteranceSynthesis') && t.sent[0].o.headers.Authorization === 'Api-Key yk' && req.hints[0].voice === 'alena' && req.unsafeMode === true && req.outputAudioSpec.containerAudio.containerAudioType === 'MP3', 'tts request', req);
  ok(t.TTS_ON() === true, 'tts on');
  // SaluteSpeech: токен по ключу (scope SALUTE_SPEECH_PERS), синтез wav16, повтор при 401; при сбое — Яндекс
  const mod2 = `const env = k => ({ SUPABASE_SERVICE_ROLE_KEY: 'srv', SALUTE_AUTH_KEY: 'Basic sk', YANDEX_TTS_KEY: 'yk' })[k] || ''; export const calls = []; export const plan = { synth: [200] };
  const fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ result: { audioChunk: { data: btoa('YA') } } }) });
  const gcFetch = async (u, o) => { calls.push({ u, o }); if (u.includes('oauth')) return { ok: true, status: 200, json: async () => ({ access_token: 'T' + calls.length, expires_at: Date.now() + 1800000 }), text: async () => '' };
    const st = plan.synth.length ? plan.synth.shift() : 200; return { ok: st === 200, status: st, text: async () => 'x', arrayBuffer: async () => new Uint8Array(300).fill(7).buffer }; };
  ${tts}\nexport { ttsAny, TTS_ON };`;
  const p2 = join(TMP, 'tts2.mjs'); writeFileSync(p2, mod2); const t2 = await import(pathToFileURL(p2).href);
  let v = await t2.ttsAny('Привет');
  const oa = t2.calls[0], sy = t2.calls[1];
  ok(v && v.type === 'audio/wav' && v.audio.length === 300, 'salute audio', v && v.type);
  ok(oa.o.headers.Authorization === 'Basic sk' && oa.o.body === 'scope=SALUTE_SPEECH_PERS', 'salute oauth', oa.o);
  ok(sy.u.includes('smartspeech.sber.ru/rest/v1/text:synthesize?format=wav16&voice=Nec_24000') && sy.o.headers.Authorization === 'Bearer T1' && sy.o.headers['Content-Type'] === 'application/text' && sy.o.body === 'Привет', 'salute synth', sy);
  t2.plan.synth.push(401, 200); t2.calls.length = 0; v = await t2.ttsAny('Ещё');
  ok(v && v.type === 'audio/wav' && t2.calls.filter(c => c.u.includes('oauth')).length === 1 && t2.calls.length === 3, 'salute 401 → new token', t2.calls.map(c => c.u.slice(0, 40)));
  t2.plan.synth.push(500); v = await t2.ttsAny('Сбой');
  ok(v && v.type === 'audio/mpeg' && new TextDecoder().decode(v.audio) === 'YA', 'salute fail → yandex', v && v.type);
}
console.log(process.exitCode ? 'есть ошибки' : 'чат на сервере: всё прошло');
