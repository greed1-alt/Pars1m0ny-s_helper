// @ts-nocheck — файл на простом JS: проверки (между метками SIGNUP) проверяются в Node тестом tools/test-signup.mjs
// Edge Function signup — открытая регистрация Parsimony (29 октября 2026; решения пользователя: защита — Яндекс SmartCaptcha,
// регистрацию открывает сам из админки, когда будут готовы документы и сервер в России).
// Публикует пользователь: Supabase → Edge Functions → Deploy a new function → Via Editor → имя signup → вставить этот файл → Deploy;
// в настройках функции «Verify JWT» выключить (как у остальных): человек ещё без аккаунта.
// Секреты — Edge Functions → Secrets: SMARTCAPTCHA_SERVER_KEY (ключ сервера капчи, ysc2_…). В файле секретов нет.
//
// Как работает: в самом Supabase регистрация выключена — завести аккаунт можно только здесь. Приложение присылает почту и ответ капчи;
// функция проверяет, что регистрация открыта (app_config.signup_on), лимиты (с одного адреса — не больше 10 попыток и 3 новых аккаунтов
// в час, всего — не больше signup_day новых в сутки, по умолчанию 50: письма с кодом не должны кончиться), капчу у Яндекса —
// и создаёт аккаунт (как «Пригласить» в админке). Дальше приложение просит обычный код на почту — без кода в аккаунт не войти.
// Ответ одинаковый для новой и уже известной почты. Почта и адрес не сохраняются — в журнале только отпечаток адреса (signup.sql).
import { createClient } from "npm:@supabase/supabase-js@2";

// ==== SIGNUP start ==== (тест: tools/test-signup.mjs; db — доступ к базе и капче, в тесте — подделка)
const SU_EMAIL = /^[^\s@<>"'`,;:()[\]\\]{1,64}@[^\s@<>"'`,;:()[\]\\]+\.[a-zа-яё0-9-]{2,}$/i;
// Одноразовые почты: такие аккаунты создают ради накрутки (награда за друга, ParsiCoins)
const SU_TEMP = ['mailinator.com', 'yopmail.com', 'guerrillamail.com', 'guerrillamail.info', 'sharklasers.com', 'grr.la', 'temp-mail.org', 'tempmail.com', 'tempmail.net',
  'temp-mail.io', '10minutemail.com', '10minutemail.net', 'minutemail.com', 'minuteinbox.com', 'throwawaymail.com', 'trashmail.com', 'trashmail.de', 'getnada.com', 'nada.email',
  'dispostable.com', 'maildrop.cc', 'mohmal.com', 'emailondeck.com', 'fakeinbox.com', 'tempail.com', 'mail.tm', 'mailnesia.com', 'mintemail.com', 'spamgourmet.com',
  'mailcatch.com', 'tempr.email', 'discard.email', 'cryptogmail.com', 'dropmail.me', 'emailfake.com', 'generator.email', 'inboxkitten.com', 'burnermail.io', 'mytemp.email',
  'tempinbox.com', 'luxusmail.org', 'harakirimail.com', 'moakt.com', 'byom.de', 'trash-mail.com', 'spambox.us', 'emltmp.com', 'tmpmail.org', 'tmail.ws', 'crazymailing.com'];
const SU_IP_TRIES = 10, SU_IP_NEW = 3, SU_DAY = 50;
async function signupHandle(db, body, ip) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return [400, { error: 'body' }];
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (email.length > 200 || !SU_EMAIL.test(email)) return [400, { error: 'email' }];
  const dom = email.slice(email.lastIndexOf('@') + 1);
  if (SU_TEMP.some(d => dom === d || dom.endsWith('.' + d))) return [400, { error: 'temp' }];
  const token = typeof body.token === 'string' && body.token.length <= 5000 ? body.token.trim() : '';
  if (!token) return [400, { error: 'captcha' }];
  const cfg = await db.cfg();
  if (cfg.signup_on !== true) return [403, { error: 'closed' }];
  const ipk = await db.ipKey(String(ip || ''));
  const n = await db.counts(ipk);   // { tries, fresh } — с этого адреса за час; { day } — новых за сутки у всех
  if (n.tries >= SU_IP_TRIES || n.fresh >= SU_IP_NEW) { await db.log(ipk, false, 'ip'); return [429, { error: 'ip' }]; }
  const day = Number.isInteger(cfg.signup_day) && cfg.signup_day >= 1 ? cfg.signup_day : SU_DAY;
  if (n.day >= day) { await db.log(ipk, false, 'day'); return [429, { error: 'busy' }]; }
  if (!(await db.captcha(token, String(ip || '')))) { await db.log(ipk, false, 'captcha'); return [400, { error: 'captcha' }]; }
  const r = await db.create(email);   // 'new' — создан, 'exists' — уже был
  await db.log(ipk, true, r === 'new' ? 'new' : 'exists');
  return [200, { ok: true }];
}
// ==== SIGNUP end ====

const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const sb = createClient(Deno.env.get('SUPABASE_URL'), SB_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const HOSTS = ['app.parsimony.ru', 'beta.parsimony.ru'];
const iso = t => new Date(t).toISOString();
const cnt = r => { if (r.error) throw r.error; return r.count || 0; };
const db = {
  async cfg() { const { data, error } = await sb.from('app_config').select('k,v').in('k', ['signup_on', 'signup_day']); if (error) throw error; return Object.fromEntries((data || []).map(x => [x.k, x.v])); },
  // Отпечаток адреса: HMAC-SHA256 ключом сервера — по нему не восстановить адрес, но можно посчитать попытки
  async ipKey(ip) {
    const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(SB_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const s = new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode('signup:' + ip)));
    return [...s.slice(0, 16)].map(b => b.toString(16).padStart(2, '0')).join('');
  },
  async counts(ipk) {
    const hr = iso(Date.now() - 3600e3), day = iso(Date.now() - 864e5), q = () => sb.from('signup_log').select('id', { count: 'exact', head: true });
    const [a, b, c] = await Promise.all([q().eq('ip', ipk).gte('at', hr), q().eq('ip', ipk).eq('why', 'new').gte('at', hr), q().eq('why', 'new').gte('at', day)]);
    return { tries: cnt(a), fresh: cnt(b), day: cnt(c) };
  },
  async log(ipk, ok, why) {
    await sb.from('signup_log').insert({ ip: ipk, ok, why });
    await sb.from('signup_log').delete().lt('at', iso(Date.now() - 30 * 864e5));   // старше 30 дней не храним
  },
  // Проверка у Яндекса: ответ «ok» и капча показана на нашем сайте. Нет ключа или Яндекс не ответил — не пускаем
  async captcha(token, ip) {
    const secret = Deno.env.get('SMARTCAPTCHA_SERVER_KEY'); if (!secret) throw new Error('SMARTCAPTCHA_SERVER_KEY');
    const r = await fetch('https://smartcaptcha.yandexcloud.net/validate', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, token, ip }), signal: AbortSignal.timeout(8000) });
    const j = await r.json().catch(() => ({}));
    return r.ok && j.status === 'ok' && (!j.host || HOSTS.includes(j.host));
  },
  // Как «Пригласить» в админке: пароль — длинный случайный (входят по коду из письма)
  async create(email) {
    const { error } = await sb.auth.admin.createUser({ email, email_confirm: true, password: crypto.randomUUID() + crypto.randomUUID() });
    if (!error) return 'new';
    if (error.status === 422 || /already|exists|registered/i.test(error.message || '')) return 'exists';
    throw error;
  },
};

const ORIGINS = ['https://app.parsimony.ru', 'https://beta.parsimony.ru'];
Deno.serve(async req => {
  const o = req.headers.get('Origin') || '', h = ORIGINS.includes(o)
    ? { 'Access-Control-Allow-Origin': o, 'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin' } : { Vary: 'Origin' };
  const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...h, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  if (req.method === 'OPTIONS') return new Response(null, { headers: h });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  if (!ORIGINS.includes(o)) return json({ error: 'origin' }, 403);   // только из приложения
  try {
    const raw = await req.text();
    if (raw.length > 8192) return json({ error: 'big' }, 413);
    let body = null; try { body = JSON.parse(raw); } catch {}
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('x-real-ip') || '';
    const [status, out] = await signupHandle(db, body, ip);
    return json(out, status);
  } catch (e) {
    console.error('signup', e && e.message);   // без почты и адреса
    return json({ error: 'server' }, 500);
  }
});
