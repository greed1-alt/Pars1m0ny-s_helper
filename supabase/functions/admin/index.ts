// @ts-nocheck — файл на простом JS: проверка доступа и полей (между метками ADMIN) проверяется в Node тестом tools/test-admin.mjs
// Edge Function admin — админка Parsimony (27 октября 2026; просьба пользователя: «давай сделаем первую версию админки, сделай ее
// поудобнее. так же проверь всю безопасность, чтобы админ панель не попала не в те руки»).
// Публикует пользователь: Supabase → Edge Functions → Deploy a new function → Via Editor → имя admin → вставить этот файл → Deploy;
// в настройках функции «Verify JWT» выключить (как у reminders и assistant): токен входа проверяется здесь, сервером авторизации.
// Секретов в файле нет: ключ service_role функция берёт из своих переменных окружения (их ставит сам Supabase).
//
// Как защищено (чтобы админка не попала не в те руки):
// 1) каждый запрос — с токеном входа, его проверяет сервер авторизации Supabase (auth.getUser): подделать или взять просроченный нельзя;
// 2) затем — есть ли человек в таблице admins; её меняет только владелец в SQL Editor, у приложения прав на запись нет.
//    Кнопка «Админка» в приложении — только для удобства: без этих двух проверок функция ничего не делает и ничего не отдаёт;
// 3) попытки без прав пишутся в журнал admin_log (action 'denied'), все действия админов — тоже (кто, что, над кем);
// 4) записи людей (дела, деньги, самочувствие, переписку) функция не читает и не отдаёт — только числа и служебное
//    (почта, даты, ник, имя, число устройств), как обещано в политике обработки данных;
// 5) себя и других админов заблокировать, удалить или переименовать нельзя (только в SQL Editor); удаление — с повтором почты;
// 6) отвечает только сайтам Parsimony (CORS), тело запроса — до 4 КБ, все поля проверяются, ответы не кэшируются.
import { createClient } from "npm:@supabase/supabase-js@2";

// ==== ADMIN start ==== (тест: tools/test-admin.mjs; db — доступ к базе, в тесте — подделка)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@<>"'`,;:()[\]\\]{1,64}@[^\s@<>"'`,;:()[\]\\]+\.[a-zа-яё0-9-]{2,}$/i;
const ACTIONS = ['stats', 'users', 'invite', 'ban', 'unban', 'nick', 'name', 'del', 'feedback', 'fbdone', 'log'];
async function adminHandle(db, token, body) {
  if (!token || token.startsWith('sb_')) return [401, { error: 'auth' }];
  const uid = await db.user(token);
  if (!uid) return [401, { error: 'auth' }];
  const a = body && typeof body.action === 'string' ? body.action : '';
  if (!(await db.isAdmin(uid))) { await db.log(uid, 'denied', null, { action: a.slice(0, 20) }); return [403, { error: 'forbidden' }]; }
  if (!ACTIONS.includes(a)) return [400, { error: 'action' }];
  if (a === 'stats') return [200, await db.stats()];
  if (a === 'users') return [200, { users: await db.users() }];
  if (a === 'feedback') return [200, { items: await db.feedback() }];
  if (a === 'log') return [200, { items: await db.journal() }];
  if (a === 'fbdone') {
    const id = body.id, done = body.done !== false;
    if (!Number.isInteger(id) || id < 1) return [400, { error: 'id' }];
    if (!(await db.fbDone(id, done))) return [404, { error: 'none' }];
    await db.log(uid, done ? 'fb_done' : 'fb_undone', String(id));
    return [200, { ok: true }];
  }
  if (a === 'invite') {
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (email.length > 200 || !EMAIL_RE.test(email)) return [400, { error: 'email' }];
    const r = await db.invite(email);   // 'new' — создан, 'exists' — уже есть
    await db.log(uid, 'invite', email, { result: r });
    return [200, { result: r }];
  }
  // Действия над человеком: ban, unban, nick, name, del
  const id = typeof body.id === 'string' && UUID_RE.test(body.id) ? body.id.toLowerCase() : '';
  if (!id) return [400, { error: 'id' }];
  if (id === uid || await db.isAdmin(id)) return [400, { error: 'admin' }];   // себя и других админов — только в SQL Editor
  const who = await db.email(id);
  if (!who) return [404, { error: 'none' }];
  if (a === 'del' && (typeof body.confirm !== 'string' || body.confirm.trim().toLowerCase() !== who.toLowerCase())) return [400, { error: 'confirm' }];
  await db[a](id);
  await db.log(uid, a, who);
  return [200, { ok: true }];
}
// ==== ADMIN end ====

const sb = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
const DAY = 864e5, iso = t => new Date(t).toISOString();
async function allUsers() {   // все аккаунты (почта, даты, блокировка) — по 1000 за запрос
  const out = [];
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    out.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return out;
}
const banned = u => !!(u.banned_until && Date.parse(u.banned_until) > Date.now());
const rows = r => (r && !r.error && Array.isArray(r.data) ? r.data : []);   // таблицы ещё нет (SQL не выполнен) — пусто, а не ошибка
const db = {
  async user(tok) { const { data, error } = await sb.auth.getUser(tok); return !error && data && data.user ? data.user.id : null; },
  async isAdmin(id) { const { data, error } = await sb.from('admins').select('user_id').eq('user_id', id).maybeSingle(); if (error) throw error; return !!data; },
  async log(admin, action, target, info) { await sb.from('admin_log').insert({ admin, action, target: target ? String(target).slice(0, 200) : null, info: info || null }); },
  async email(id) { const { data, error } = await sb.auth.admin.getUserById(id); return error || !data || !data.user ? null : data.user.email || null; },
  // Только числа: записи людей не читаются (из user_data — лишь время последней синхронизации, без data)
  async stats() {
    const now = Date.now(), d1 = iso(now - DAY), d7 = iso(now - 7 * DAY), from = iso(now - 13 * DAY).slice(0, 10), today = iso(now).slice(0, 10);
    const users = await allUsers();
    const [ud, subs, ai, prof, fb, msg, frs] = await Promise.all([
      sb.from('user_data').select('user_id,updated_at'), sb.from('push_subscriptions').select('user_id'), sb.from('ai_usage').select('day,n').gte('day', from),
      sb.from('profiles').select('user_id', { count: 'exact', head: true }), sb.from('feedback').select('id', { count: 'exact', head: true }).is('done_at', null),
      sb.from('messages').select('id', { count: 'exact', head: true }).gte('at', d7), sb.from('friends').select('a', { count: 'exact', head: true }).eq('ok', true)]);
    const act = t => rows(ud).filter(r => r.updated_at >= t).length, byDay = {};
    rows(ai).forEach(r => { byDay[r.day] = (byDay[r.day] || 0) + (r.n || 0); });
    return { users: users.length, new7: users.filter(u => u.created_at >= d7).length, act1: act(d1), act7: act(d7),
      push: new Set(rows(subs).map(r => r.user_id)).size, banned: users.filter(banned).length,
      cards: prof.count || 0, friends: frs.count || 0, msg7: msg.count || 0, fbNew: fb.error ? null : fb.count || 0, aiToday: byDay[today] || 0,
      ai: Array.from({ length: 14 }, (_, i) => { const k = iso(now - (13 - i) * DAY).slice(0, 10); return [k, byDay[k] || 0]; }) };
  },
  async users() {
    const users = await allUsers(), today = iso(Date.now()).slice(0, 10);
    const [ud, subs, prof, adm, ai] = await Promise.all([sb.from('user_data').select('user_id,updated_at'), sb.from('push_subscriptions').select('user_id'),
      sb.from('profiles').select('user_id,nick,name'), sb.from('admins').select('user_id'), sb.from('ai_usage').select('user_id,n').eq('day', today)]);
    const m = (r, k) => new Map(rows(r).map(x => [x.user_id, k ? x[k] : x])), sync = m(ud, 'updated_at'), pr = m(prof), ad = m(adm), aiN = m(ai, 'n'), dev = {};
    rows(subs).forEach(r => { dev[r.user_id] = (dev[r.user_id] || 0) + 1; });
    return users.map(u => ({ id: u.id, email: u.email || '', created: u.created_at, seen: u.last_sign_in_at || null, sync: sync.get(u.id) || null,
      nick: (pr.get(u.id) || {}).nick || '', name: (pr.get(u.id) || {}).name || '', dev: dev[u.id] || 0, ai: aiN.get(u.id) || 0, admin: ad.has(u.id), banned: banned(u) }))
      .sort((a, b) => String(b.sync || b.seen || b.created).localeCompare(String(a.sync || a.seen || a.created)));
  },
  // Как Authentication → Add user с Auto Confirm: пароль — длинный случайный (входят по коду из письма, пароль никому не нужен)
  async invite(email) {
    const { error } = await sb.auth.admin.createUser({ email, email_confirm: true, password: crypto.randomUUID() + crypto.randomUUID() });
    if (!error) return 'new';
    if (error.status === 422 || /already|exists|registered/i.test(error.message || '')) return 'exists';
    throw error;
  },
  // Блокировка: вход запрещён (обновить токен нельзя — уже открытое приложение отключится в течение часа), уведомления больше не приходят
  async ban(id) { const { error } = await sb.auth.admin.updateUserById(id, { ban_duration: '876000h' }); if (error) throw error; await sb.from('push_subscriptions').delete().eq('user_id', id); },
  async unban(id) { const { error } = await sb.auth.admin.updateUserById(id, { ban_duration: 'none' }); if (error) throw error; },
  async nick(id) { const { error } = await sb.from('profiles').update({ nick: null }).eq('user_id', id); if (error) throw error; },
  async name(id) { const { error } = await sb.from('profiles').update({ name: '' }).eq('user_id', id); if (error) throw error; },
  async del(id) { const { error } = await sb.auth.admin.deleteUser(id); if (error) throw error; },   // записи, карточка, друзья, переписка — удаляются вместе с аккаунтом (on delete cascade)
  async feedback() {
    const { data, error } = await sb.from('feedback').select('id,email,created_at,kind,screen,body,meta,done_at').order('id', { ascending: false }).limit(300);
    if (error) throw error; return data || [];
  },
  async fbDone(id, done) {
    const { data, error } = await sb.from('feedback').update({ done_at: done ? iso(Date.now()) : null }).eq('id', id).select('id');
    if (error) throw error; return !!(data && data.length);
  },
  async journal() {
    const { data, error } = await sb.from('admin_log').select('id,at,admin,action,target').order('id', { ascending: false }).limit(150);
    if (error) throw error;
    const mail = new Map((await allUsers()).map(u => [u.id, u.email || '']));
    return (data || []).map(x => ({ at: x.at, who: mail.get(x.admin) || '', action: x.action, target: x.target || '' }));
  },
};

const ORIGINS = ['https://app.parsimony.ru', 'https://beta.parsimony.ru'];
Deno.serve(async req => {
  const o = req.headers.get('Origin') || '', h = ORIGINS.includes(o)
    ? { 'Access-Control-Allow-Origin': o, 'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin' } : { Vary: 'Origin' };
  const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...h, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  if (req.method === 'OPTIONS') return new Response(null, { headers: h });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  try {
    const raw = await req.text();
    if (raw.length > 4096) return json({ error: 'big' }, 413);
    let body = null; try { body = JSON.parse(raw); } catch {}
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'body' }, 400);
    const [status, out] = await adminHandle(db, (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, ''), body);
    return json(out, status);
  } catch (e) {
    console.error('admin', e && e.message);   // без данных запроса
    return json({ error: 'server' }, 500);
  }
});
