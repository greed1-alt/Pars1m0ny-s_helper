// @ts-nocheck — файл на простом JS: ядро (между метками CORE) проверяется в Node тестом tools/test-reminders.mjs
// Edge Function reminders — напоминания по времени (9 октября 2026).
// Копия кода из панели Supabase (Edge Functions → reminders → Code). Публикуется кнопкой «Deploy» там же.
// Секретов в файле нет: ключи VAPID и служебные ключи Supabase берутся из переменных окружения функции.
//
// Кто вызывает:
// 1) pg_cron раз в минуту (supabase/sql/reminders_cron.sql) с секретным ключом sb_secret_… в заголовке apikey.
//    Функция находит напоминания, время которых наступило за последние 10 минут, и шлёт пуш на устройства владельца записей.
//    Так же — утренняя сводка «План на сегодня» и вечернее «Запишите задачи на завтра» (время — в S.settings.digest).
//    Каждое напоминание уходит один раз: перед отправкой оно записывается в reminder_log (повтор ключа — пропуск).
// 2) Приложение с токеном пользователя и {"test":true} — проверочное уведомление на устройства этого человека
//    (не чаще раза в минуту).
// В настройках функции «Verify JWT» выключен: доступ проверяется здесь (секретный ключ или настоящий токен через auth.getUser).
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

// ==== CORE start ====
// Тот же смысл, что в приложении (js/core.js: occurs, isDone, remOffs), но даты считаются в часовом поясе пользователя
const DAY = 864e5, WINDOW = 10 * 60000, NO_TIME = 9 * 60;   // дела без времени — напоминание от 9:00
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/, TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;   // время — только настоящее, 00:00–23:59
const MONG = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const pad = n => String(n).padStart(2, '0');
const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const fmts = new Map();
const fmtOf = tz => { if (!fmts.has(tz)) fmts.set(tz, new Intl.DateTimeFormat('en-CA', { timeZone: tz, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23' })); return fmts.get(tz); };
const partsIn = (ts, tz) => { const p = {}; for (const x of fmtOf(tz).formatToParts(new Date(ts))) p[x.type] = x.value; return { y:+p.year, m:+p.month, d:+p.day, h:+p.hour % 24, mi:+p.minute }; };
const tzOffset = (ts, tz) => { const p = partsIn(ts, tz); return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi) - Math.floor(ts / 60000) * 60000; };
// День k и минута дня min по часам пояса tz → момент времени (мс). Двойной проход — для перехода на летнее время
const zoned = (k, min, tz) => { const [y, m, d] = k.split('-').map(Number); const g = Date.UTC(y, m - 1, d, 0, min); const t = g - tzOffset(g, tz); return g - tzOffset(t, tz); };
const dayIn = (ts, tz) => { const p = partsIn(ts, tz); return ymd(p.y, p.m, p.d); };
const addD = (k, n) => { const [y, m, d] = k.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d + n)); return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()); };
const dowOf = k => { const [y, m, d] = k.split('-').map(Number); return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; };   // 0 = понедельник
const tzOf = data => { const tz = data && data.settings && data.settings.tz; try { if (typeof tz === 'string' && tz.length < 64) { fmtOf(tz); return tz; } } catch (e) {} return 'Europe/Moscow'; };
const tmin = t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
const isRec = e => !!(e.repeat && e.repeat.type && e.repeat.type !== 'none');
function occurs(e, k) {
  if (!isRec(e)) return e.date === k;
  const r = e.repeat;
  if (k < e.date || (r.until && k > r.until) || (Array.isArray(e.skip) && e.skip.includes(k))) return false;
  switch (r.type) {
    case 'daily': return true;
    case 'weekdays': return dowOf(k) < 5;
    case 'weekly': return (Array.isArray(r.days) && r.days.length ? r.days : [dowOf(e.date)]).includes(dowOf(k));
    case 'monthly': return e.date.slice(8) === k.slice(8);
    case 'yearly': return e.date.slice(5) === k.slice(5);
  }
  return false;
}
const isDone = (e, k) => isRec(e) ? (Array.isArray(e.doneDates) && e.doneDates.includes(k)) : !!e.done;
const remOffs = e => { const r = e.reminder; if (!r || !r.enabled) return []; const l = Array.isArray(r.offsets) && r.offsets.length ? r.offsets : [Number(r.offset) || 0];
  return [...new Set(l.map(Number).filter(v => Number.isFinite(v) && v >= 0))].sort((a, b) => b - a); };
// Какие напоминания из записей data наступили в промежутке (from, to]. Ключ меняется вместе со временем события:
// перенесли встречу — напоминание о новом времени придёт снова.
function dueReminders(data, from, to) {
  const tz = tzOf(data), out = [], evs = data && Array.isArray(data.events) ? data.events : [];
  const k0 = addD(dayIn(from, tz), -1), k1 = addD(dayIn(to, tz), 8);   // самое раннее напоминание — за неделю
  for (const e of evs) {
    if (!e || typeof e !== 'object' || !DATE_RE.test(e.date || '') || e.id == null) continue;
    const offs = remOffs(e); if (!offs.length) continue;
    const base = e.time && TIME_RE.test(e.time) ? tmin(e.time) : NO_TIME;
    const days = [];
    if (!isRec(e)) { if (e.date >= k0 && e.date <= k1) days.push(e.date); }
    else for (let k = e.date > k0 ? e.date : k0; k <= k1; k = addD(k, 1)) days.push(k);
    for (const k of days) {
      if (!occurs(e, k) || isDone(e, k)) continue;
      const start = zoned(k, base, tz);
      for (const off of offs) {
        const fire = start - off * 60000;
        if (fire > from && fire <= to) out.push({ key: `${e.id}|${k}|${e.time || ''}|${off}`.slice(0, 200), fire, start, off, k, e });
      }
    }
  }
  return out;
}
// Текст уведомления. Время до начала считается в момент отправки, поэтому оно верное даже при задержке
function remPayload(r, now, tz) {
  const e = r.e, today = dayIn(now, tz), [, m, d] = r.k.split('-').map(Number);
  const when = r.k === today ? 'сегодня' : r.k === addD(today, 1) ? 'завтра' : `${d} ${MONG[m - 1]}`;
  const range = e.time && TIME_RE.test(e.time) ? (e.time2 && TIME_RE.test(e.time2) ? `${e.time}–${e.time2}` : e.time) : '';
  const left = Math.round((r.start - now) / 60000);
  let body;
  if (!range) body = e.task ? `Задача на ${when}` : `${when[0].toUpperCase() + when.slice(1)}, весь день`;
  else if (left <= 0) body = `Сейчас · ${range}`;
  else if (left < 60) body = `Через ${left} мин · ${range}`;
  else body = `${when[0].toUpperCase() + when.slice(1)} в ${range}`;
  if (e.loc) body += ` · ${String(e.loc).slice(0, 80)}`;
  return { title: String(e.title || 'Напоминание').slice(0, 120), body, k: r.k, url: `./#d=${r.k}`, tag: `r:${String(e.id).slice(0, 60)}:${r.k}` };
}

// ---- Сводки: утром — план на день, вечером — «запишите задачи на завтра» (S.settings.digest) ----
const DG_DEF = { am: true, amT: '09:00', pm: true, pmT: '22:00' };
const digestOf = data => { const s = data && data.settings && data.settings.digest, d = Object.assign({}, DG_DEF, s && typeof s === 'object' ? s : {});
  if (!TIME_RE.test(d.amT)) d.amT = DG_DEF.amT; if (!TIME_RE.test(d.pmT)) d.pmT = DG_DEF.pmT; d.am = d.am !== false; d.pm = d.pm !== false; return d; };
function dueDigests(data, from, to) {
  const tz = tzOf(data), dg = digestOf(data), out = [];
  for (const k of new Set([dayIn(from, tz), dayIn(to, tz)]))
    for (const [kind, on, t] of [['am', dg.am, dg.amT], ['pm', dg.pm, dg.pmT]]) {
      if (!on) continue;
      const fire = zoned(k, tmin(t), tz);
      if (fire > from && fire <= to) out.push({ key: `${kind}|${k}`, fire, kind, k });
    }
  return out;
}
const plural = (n, f) => n + ' ' + f[n % 10 === 1 && n % 100 !== 11 ? 0 : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 1 : 2];
const DELO = ['дело', 'дела', 'дел'];
const okEv = e => e && typeof e === 'object' && DATE_RE.test(e.date || '') && typeof e.title === 'string';
// Невыполненные дела дня: сначала по времени, потом без времени
const dayItems = (data, k) => (data && Array.isArray(data.events) ? data.events : []).filter(e => okEv(e) && occurs(e, k) && !isDone(e, k))
  .sort((a, b) => (TIME_RE.test(a.time || '') ? a.time : '99').localeCompare(TIME_RE.test(b.time || '') ? b.time : '99') || a.title.localeCompare(b.title));
const itemText = e => (TIME_RE.test(e.time || '') ? e.time + ' ' : '') + String(e.title).slice(0, 40);
const listText = (items, n) => items.slice(0, n).map(itemText).join(', ') + (items.length > n ? ` и ещё ${items.length - n}` : '');
// «Вы пропустили» — как в приложении (missedList): разовые дела за 30 дней до сегодня без галочки
const missedCount = (data, k) => (data && Array.isArray(data.events) ? data.events : []).filter(e => okEv(e) && !isRec(e) && !e.done && e.date < k && e.date >= addD(k, -30)).length;
function digestPayload(d, data) {
  if (d.kind === 'am') {
    const items = dayItems(data, d.k), missed = missedCount(data, d.k);
    let body = items.length ? listText(items, 3) : 'Запишите, что хотите успеть сегодня';
    if (missed) body += ` · пропущено: ${missed}`;
    return { title: items.length ? `План на сегодня: ${plural(items.length, DELO)}` : 'На сегодня дел не запланировано', body, s: 'home', url: './#s=home', tag: 'am' };
  }
  const next = addD(d.k, 1), items = dayItems(data, next), left = dayItems(data, d.k).filter(e => e.task).length;
  let body = items.length ? `На завтра уже ${plural(items.length, DELO)}: ${listText(items, 2)}` : 'На завтра пока ничего нет';
  if (left) body = `Не сделано сегодня: ${left} · ${body}`;
  return { title: 'Запишите задачи на завтра', body, k: next, url: `./#d=${next}`, tag: 'pm' };
}
// ==== CORE end ====

const clean = v => (v ?? '').trim().replace(/^["']|["']$/g, '');
webpush.setVapidDetails(clean(Deno.env.get('VAPID_SUBJECT')), clean(Deno.env.get('VAPID_PUBLIC_KEY')), clean(Deno.env.get('VAPID_PRIVATE_KEY')));
const secretKeys = (() => { try { return Object.values(JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}')).map(String); } catch { return []; } })();
const sb = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// Отправить на все устройства человека. 404/410 — подписка устарела (приложение удалили, разрешение отозвали): удаляем её
async function sendTo(subs, payload, ttl) {
  let ok = 0, fail = 0;
  await Promise.all(subs.map(async s => {
    try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: ttl, urgency: 'high' }); ok++; }
    catch (e) { fail++; if (e.statusCode === 404 || e.statusCode === 410) await sb.from('push_subscriptions').delete().eq('endpoint', s.endpoint); else console.error('push', e.statusCode, e.body || e.message); }
  }));
  return { ok, fail };
}
// Записать ключ в журнал; true — записан впервые (значит, ещё не отправляли)
async function once(user_id, key, fireAt) {
  const { data, error } = await sb.from('reminder_log').upsert({ user_id, key, fire_at: new Date(fireAt).toISOString() }, { onConflict: 'user_id,key', ignoreDuplicates: true }).select('key');
  if (error) throw error;
  return !!(data && data.length);
}

async function tick(now) {
  const { data: subs, error } = await sb.from('push_subscriptions').select('endpoint,p256dh,auth,user_id').not('user_id', 'is', null);
  if (error) throw error;
  const byUser = new Map();
  for (const s of subs || []) { if (!byUser.has(s.user_id)) byUser.set(s.user_id, []); byUser.get(s.user_id).push(s); }
  let due = 0, sent = 0;
  if (byUser.size) {
    const { data: rows, error: e2 } = await sb.from('user_data').select('user_id,data').in('user_id', [...byUser.keys()]);
    if (e2) throw e2;
    for (const row of rows || []) {
      const data = row.data || {}, tz = tzOf(data);
      for (const r of dueReminders(data, now - WINDOW, now)) {
        due++;
        if (!(await once(row.user_id, r.key, r.fire))) continue;
        sent += (await sendTo(byUser.get(row.user_id), JSON.stringify(remPayload(r, now, tz)), 3600)).ok;
      }
      for (const d of dueDigests(data, now - WINDOW, now)) {
        due++;
        if (!(await once(row.user_id, d.key, d.fire))) continue;
        sent += (await sendTo(byUser.get(row.user_id), JSON.stringify(digestPayload(d, data)), 3 * 3600)).ok;
      }
    }
  }
  await sb.from('reminder_log').delete().lt('fire_at', new Date(now - 3 * DAY).toISOString());   // журнал за 3 дня, старше не нужен
  return { users: byUser.size, due, sent };
}

async function testPush(uid) {
  const now = Date.now();
  if (!(await once(uid, `test:${Math.floor(now / 60000)}`, now))) return { ok: 0, devices: 0, error: 'rate' };
  const { data: subs, error } = await sb.from('push_subscriptions').select('endpoint,p256dh,auth').eq('user_id', uid);
  if (error) throw error;
  if (!subs || !subs.length) return { ok: 0, devices: 0 };
  const r = await sendTo(subs, JSON.stringify({ title: 'Parsimony', body: 'Проверка: напоминания приходят ✓', tag: 'test', url: './' }), 300);
  return { ...r, devices: subs.length };
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  try {
    const key = req.headers.get('apikey') ?? '';
    if (key.startsWith('sb_secret_') && secretKeys.includes(key)) return json(await tick(Date.now()));
    const tok = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!tok || tok.startsWith('sb_')) return json({ error: 'forbidden' }, 403);
    const { data, error } = await sb.auth.getUser(tok);
    if (error || !data || !data.user) return json({ error: 'forbidden' }, 403);
    return json(await testPush(data.user.id));
  } catch (e) {
    console.error(e);
    return json({ error: 'server' }, 500);
  }
});
