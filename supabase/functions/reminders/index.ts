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
//    И пуши о заявках в друзья из очереди fr_notify (friendPushes, supabase/sql/friends.sql) и о новых сообщениях друзей
//    из очереди msg_notify (msgPushes, supabase/sql/messages.sql, с 23 октября 2026).
//    И помощник пишет сам — до 3 раз в день, только по делу, ночью тихо (nudgeCands / pickNudge / nudgePayload, с 23 октября 2026).
//    С 27 октября 2026 пуши из очередей (сообщения, заявки) — сразу: база вызывает функцию с {"queue":true} при записи в очередь
//    (supabase/sql/push_now.sql) — тогда разбираются только очереди (queueTick).
//    С 27 октября 2026 — настройки из админки (app_config, supabase/sql/admin2.sql): nudge = false выключает «помощник пишет сам» всем,
//    объявление с «отправить уведомлением» уходит всем один раз (annPushes); админам — о новом отзыве и попытке открыть админку без прав (adminPushes).
//    В воскресенье вечерняя сводка — итоги недели (weekPayload, с 27 октября 2026); повтор «через неделю» — repeat.every = 2 (wkNum).
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
const MONE = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const isEn = data => !!(data && data.settings && data.settings.lang === 'en');   // язык уведомлений — как в приложении (js/look.js)
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
// Номер недели (с понедельника) от 1 января 1970 — для повтора «через неделю» (repeat.every = 2: числитель / знаменатель, 27 октября 2026)
const wkNum = k => Math.floor((Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10)) / 864e5 + 3) / 7);
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
    case 'weekly': return (Array.isArray(r.days) && r.days.length ? r.days : [dowOf(e.date)]).includes(dowOf(k)) && (r.every !== 2 || (wkNum(k) - wkNum(e.date)) % 2 === 0);
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
function remPayload(r, now, tz, en) {
  const e = r.e, today = dayIn(now, tz), [, m, d] = r.k.split('-').map(Number);
  const when = r.k === today ? (en ? 'today' : 'сегодня') : r.k === addD(today, 1) ? (en ? 'tomorrow' : 'завтра') : `${d} ${(en ? MONE : MONG)[m - 1]}`, When = when[0].toUpperCase() + when.slice(1);
  const range = e.time && TIME_RE.test(e.time) ? (e.time2 && TIME_RE.test(e.time2) ? `${e.time}–${e.time2}` : e.time) : '';
  const left = Math.round((r.start - now) / 60000);
  let body;
  if (!range) body = e.task ? (en ? `Task for ${when}` : `Задача на ${when}`) : `${When}, ${en ? 'all day' : 'весь день'}`;
  else if (left <= 0) body = `${en ? 'Now' : 'Сейчас'} · ${range}`;
  else if (left < 60) body = en ? `In ${left} min · ${range}` : `Через ${left} мин · ${range}`;
  else body = `${When} ${en ? 'at' : 'в'} ${range}`;
  if (e.loc) body += ` · ${String(e.loc).slice(0, 80)}`;
  return { title: String(e.title || (en ? 'Reminder' : 'Напоминание')).slice(0, 120), body, k: r.k, url: `./#d=${r.k}`, tag: `r:${String(e.id).slice(0, 60)}:${r.k}` };
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
const deloN = (n, en) => en ? n + (n === 1 ? ' task' : ' tasks') : plural(n, DELO);
const okEv = e => e && typeof e === 'object' && DATE_RE.test(e.date || '') && typeof e.title === 'string';
// Невыполненные дела дня: сначала по времени, потом без времени
const dayItems = (data, k) => (data && Array.isArray(data.events) ? data.events : []).filter(e => okEv(e) && occurs(e, k) && !isDone(e, k))
  .sort((a, b) => (TIME_RE.test(a.time || '') ? a.time : '99').localeCompare(TIME_RE.test(b.time || '') ? b.time : '99') || a.title.localeCompare(b.title));
const itemText = e => (TIME_RE.test(e.time || '') ? e.time + ' ' : '') + String(e.title).slice(0, 40);
const listText = (items, n, en) => items.slice(0, n).map(itemText).join(', ') + (items.length > n ? (en ? ` and ${items.length - n} more` : ` и ещё ${items.length - n}`) : '');
// «Вы пропустили» — как в приложении (missedList): разовые дела за 30 дней до сегодня без галочки
const missedCount = (data, k) => (data && Array.isArray(data.events) ? data.events : []).filter(e => okEv(e) && !isRec(e) && !e.done && e.date < k && e.date >= addD(k, -30)).length;
// Воскресенье вечером вместо «Запишите задачи на завтра» — итоги недели (выбор пользователя 27 октября 2026): сколько задач сделано
// с понедельника (разовые — по галочке, повторяющиеся — по дням), сколько отметок привычек, сколько разовых дел на следующей неделе и сколько
// из них без времени. Есть такие — в чате помощника кнопка «Разложить дела на неделю» (act 'week'); нажатие — сообщение в чате, как у nudge
function weekPayload(d, data) {
  const en = isEn(data), all = data && Array.isArray(data.events) ? data.events.filter(e => okEv(e) && !e.demo) : [];
  const wk = Array.from({ length: 7 }, (_, i) => addD(d.k, i - 6)), nx = Array.from({ length: 7 }, (_, i) => addD(d.k, i + 1));
  let n = 0, done = 0;
  for (const e of all) if (e.task) for (const k of wk) if (occurs(e, k)) { n++; if (isDone(e, k)) done++; }
  const marks = (data && Array.isArray(data.habits) ? data.habits : []).reduce((s, h) => s + (h && h.log && typeof h.log === 'object' ? Object.keys(h.log).filter(k => h.log[k] && wk.includes(k)).length : 0), 0);
  const next = all.filter(e => !isRec(e) && !e.done && nx.includes(e.date)), free = next.filter(e => e.task && !TIME_RE.test(e.time || '')).length;
  const done1 = (en ? [n ? `Tasks done: ${done} of ${n}` : 'No tasks this week', ...(marks ? [`habit marks: ${marks}`] : [])] : [n ? `Сделано задач: ${done} из ${n}` : 'Задач на этой неделе не было', ...(marks ? [`отметок привычек: ${marks}`] : [])]).join(', ');
  const body = (done1 + '. ' + (en ? (next.length ? `Next week: ${deloN(next.length, en)}` + (free ? `, ${free} without a time. Fit them into your free time?` : '.') : 'Nothing planned for next week yet: add your plans.')
    : next.length ? `На следующей неделе — ${plural(next.length, DELO)}` + (free ? `, без времени — ${free}. Разложить их по свободному времени?` : '.')
    : 'На следующую неделю пока ничего нет — запишите планы.')).slice(0, 280);
  const title = en ? 'Week in review' : 'Итоги недели';
  return { title, body, tag: 'pm', ai: title + '. ' + body, act: free ? 'week' : '', url: './#ai' };
}
function digestPayload(d, data) {
  const en = isEn(data);
  if (d.kind === 'am') {
    const items = dayItems(data, d.k), missed = missedCount(data, d.k);
    let body = items.length ? listText(items, 3, en) : en ? 'Write down what you want to get done today' : 'Запишите, что хотите успеть сегодня';
    if (missed) body += en ? ` · missed: ${missed}` : ` · пропущено: ${missed}`;
    return { title: items.length ? (en ? `Today's plan: ${deloN(items.length, en)}` : `План на сегодня: ${plural(items.length, DELO)}`) : en ? 'Nothing planned for today' : 'На сегодня дел не запланировано', body, s: 'home', url: './#s=home', tag: 'am' };
  }
  if (dowOf(d.k) === 6) return weekPayload(d, data);   // воскресенье — итоги недели
  const next = addD(d.k, 1), items = dayItems(data, next), left = dayItems(data, d.k).filter(e => e.task).length;
  let body = items.length ? (en ? `Tomorrow already has ${deloN(items.length, en)}: ${listText(items, 2, en)}` : `На завтра уже ${plural(items.length, DELO)}: ${listText(items, 2)}`) : en ? 'Nothing for tomorrow yet' : 'На завтра пока ничего нет';
  if (left) body = en ? `Not done today: ${left} · ${body}` : `Не сделано сегодня: ${left} · ${body}`;
  return { title: en ? "Plan tomorrow's tasks" : 'Запишите задачи на завтра', body, k: next, url: `./#d=${next}`, tag: 'pm' };
}

// ---- Помощник пишет сам (23 октября 2026; выбор пользователя: «До 3 в день. Только по делу: пропущен срок, шаг цели завис, есть свободное
// окно для плана. Ночью тихо»). Поводы (nudgeCands) — по записям человека в его часовом поясе, с 9:30 до 21:30:
// late — пропущен срок разовой задачи за последнюю неделю (с 10:00; сначала шаги целей, потом важные, потом свежие);
// plan — занятия по плану к цели (g.plan, js/assistant.js) заканчиваются в ближайшие 3 дня, а нужно ещё (с 12:00) — «продли план»;
// goal — цель отстаёт от темпа или её срок прошёл (с 14:00; темп — как goalStat в js/goals.js);
// free — сегодня есть свободное окно (часы S.settings.freeHrs, между событиями) для отстающей цели с планом и занятия сегодня нет (за 30 минут).
// Выбор (pickNudge): не больше 3 за день, не чаще раза в 2 часа, один и тот же повод — не чаще раза в 3 дня. Подначка — из тех же фраз,
// что в «Целях» (TAUNTS — копия из js/goals.js, тест сверяет) и своих фраз человека, если подначки включены. Выключатель — S.settings.nudge;
// пишем только при nudge === true: его ставит приложение с выключателем (js/notify.js), на старой версии без выключателя — тихо
const NUDGE_MAX = 3, NUDGE_GAP = 2 * 3600e3, NUDGE_FROM = 9 * 60 + 30, NUDGE_TO = 21 * 60 + 30, NUDGE_COOL = 3, NUDGE_ORDER = ['late', 'goal', 'free', 'plan'];
const TAUNTS = [
  '«{step}» сам себя не сделает. Удивительно, правда?',
  'Цель «{goal}» скучает. Вы, судя по всему, нет.',
  'Ещё один день без шага к «{goal}». Мечта терпеливая, но не бесконечно.',
  'Дедлайн не двигается сам. В отличие от ваших оправданий.',
  'Вчера вы собирались. Сегодня снова собираетесь. Классика.',
  '«Начну с понедельника» — самая популярная цель в мире. Не будьте как все.',
  'Если откладывать дальше, «{goal}» станет целью на следующий год. Или на следующую жизнь.',
  'Шаг «{step}» всё ещё ждёт. Он вежливый, но уже нервничает.',
  'Время идёт. Прогресс — нет.',
  'Мотивация не придёт. Придёт только дедлайн.',
  'Вы обещали себе. Себе! Неловко получилось.',
  'Даже улитка уже доползла бы. А «{step}» всё ещё не сделан.',
  'Пропустить один раз — случайность. Два — уже новая привычка. Плохая.',
  'Будущий вы смотрит на это с грустью.',
  'Мечтать приятно. Делать — эффективно. Попробуйте второе.',
  '«Потом» — это не дата.',
  'Прогресс-бар цели «{goal}» выглядит одиноко.',
  'Список шагов есть. Шагов нет.',
  'Самое время перестать планировать и начать делать.',
  'Цели без действий называются мечтами. А мечты — это для сна.',
  'Вы же не для красоты записали «{goal}»?',
  'Где-то сейчас кто-то делает ваш шаг «{step}». Только для своей цели.',
  'Отложенное дело весит больше сделанного. Проверено.',
  'Это ваша самая грандиозная цель, вы же не будете жалеть потом?)',
];
const hashS = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0; return h; };   // как hashStr в js/goals.js
const fillS = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => v[k] != null ? v[k] : '');
const dd = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / DAY);   // дней от a до b
const hmS = m => pad(Math.floor(m / 60)) + ':' + pad(m % 60);
const dmon = (k, en) => +k.slice(8) + ' ' + (en ? MONE : MONG)[+k.slice(5, 7) - 1];
const qS = s => '«' + String(s).slice(0, 60) + '»';
const agoS = (n, en) => en ? (n === 1 ? 'yesterday' : n + ' days ago') : n === 1 ? 'вчера' : plural(n, ['день', 'дня', 'дней']) + ' назад';
const qE = s => '“' + String(s).slice(0, 60) + '”';
const PRI_N = { urgent: 3, high: 2, mid: 1, low: 0 };
// Свободное время — как в приложении (aiFreeGaps): часы из настроек (будни / выходные) минус всё, у чего есть время
const FREE_DEF = { wd: ['18:00', '22:00'], we: ['10:00', '20:00'] };
const freeOf = data => { const f = (data.settings && data.settings.freeHrs) || {}, ok = a => Array.isArray(a) && a.length === 2 && a.every(x => TIME_RE.test(x || '')) && tmin(a[0]) < tmin(a[1]);
  return { wd: ok(f.wd) ? f.wd : FREE_DEF.wd, we: ok(f.we) ? f.we : FREE_DEF.we }; };
function freeGaps(data, evs, k) {
  const h = freeOf(data)[dowOf(k) >= 5 ? 'we' : 'wd'], to = tmin(h[1]), gaps = []; let cur = tmin(h[0]);
  evs.filter(e => TIME_RE.test(e.time || '') && occurs(e, k)).map(e => { const a = tmin(e.time), b = TIME_RE.test(e.time2 || '') ? tmin(e.time2) : a + 60; return [a, Math.max(b, a + 15)]; })
    .sort((x, y) => x[0] - y[0]).forEach(([a, b]) => { if (a > cur) gaps.push([cur, Math.min(a, to)]); cur = Math.max(cur, b); });
  if (cur < to) gaps.push([cur, to]);
  return gaps.filter(([a, b]) => b > a);
}
// Темп цели — как goalStat (js/goals.js): шаги — задачи с полем goal и шаги без срока; отстаёт — есть просроченный шаг или сделано заметно меньше, чем прошло времени
function goalPace(evs, g, k) {
  const st = [...evs.filter(e => e.goal === g.id && !isRec(e)).map(e => ({ t: e.title, date: e.date, done: !!e.done })),
    ...(Array.isArray(g.steps) ? g.steps : []).filter(s => s && typeof s === 'object').map(s => ({ t: String(s.t || ''), date: '', done: !!s.done }))];
  const n = st.length, d = st.filter(x => x.done).length, late = st.filter(x => !x.done && x.date && x.date < k);
  const next = st.filter(x => !x.done).sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'))[0] || null;
  const passed = Math.min(1, Math.max(0, dd(g.created, k) / Math.max(1, dd(g.created, g.due)))), pct = n ? d / n : 0;
  return { n, d, next, passed, pace: !n ? '' : dd(k, g.due) < 0 ? 'late' : late.length || pct + .15 < passed ? 'behind' : 'ok' };
}
function nudgeCands(data, now) {
  const out = []; if (!data || typeof data !== 'object' || !data.settings || data.settings.nudge !== true) return out;
  const en = isEn(data), tz = tzOf(data), k = dayIn(now, tz), p = partsIn(now, tz), min = p.h * 60 + p.mi;
  if (min < NUDGE_FROM || min > NUDGE_TO) return out;   // ночью тихо
  const evs = (Array.isArray(data.events) ? data.events : []).filter(e => okEv(e) && !e.demo);
  const goals = (Array.isArray(data.goals) ? data.goals : []).filter(g => g && typeof g === 'object' && typeof g.id === 'string' && typeof g.title === 'string' && !g.done && !g.demo
    && DATE_RE.test(g.due || '') && DATE_RE.test(g.created || ''));
  const gTitle = id => (goals.find(g => g.id === id) || {}).title || '';
  if (min >= 600) {   // пропущен срок
    const late = evs.filter(e => e.task && !isRec(e) && !e.done && e.date < k && e.date >= addD(k, -7))
      .sort((a, b) => (!!b.goal - !!a.goal) || (PRI_N[b.prio] || 0) - (PRI_N[a.prio] || 0) || b.date.localeCompare(a.date));
    if (late.length) { const e = late[0], g = gTitle(e.goal);
      out.push({ kind: 'late', id: String(e.id), goal: g || e.title, step: e.title,
        text: en ? `The deadline for ${qE(e.title)}${g ? ' (goal ' + qE(g) + ')' : ''} passed ${agoS(dd(e.date, k), en)}.` + (late.length > 1 ? ` Also overdue: ${late.length - 1}.` : '')
          : `Срок ${qS(e.title)}${g ? ' (цель ' + qS(g) + ')' : ''} прошёл ${agoS(dd(e.date, k))}.` + (late.length > 1 ? ` Ещё просрочено: ${late.length - 1}.` : '') }); }
  }
  if (min >= 720) for (const g of goals) {   // занятия по плану заканчиваются
    const pl = g.plan; if (!pl || typeof pl !== 'object' || !DATE_RE.test(pl.last || '') || !(+pl.n < +pl.need)) continue;
    const left = dd(k, pl.last); if (left < 0 || left > 3) continue;
    out.push({ kind: 'plan', id: g.id, goal: g.title, step: g.title, quiet: true,
      text: en ? `Sessions for the goal ${qE(g.title)} are scheduled until ${dmon(pl.last, en)}. Tell the assistant “extend the plan” and I'll add the next weeks.` : `Занятия по цели ${qS(g.title)} поставлены до ${dmon(pl.last)}. Скажите помощнику «продли план» — поставлю следующие недели.` });
  }
  if (min >= 840) {   // цель отстаёт
    const bad = goals.map(g => ({ g, s: goalPace(evs, g, k) })).filter(x => x.s.pace === 'behind' || x.s.pace === 'late')
      .sort((a, b) => (b.s.pace === 'late') - (a.s.pace === 'late') || a.g.due.localeCompare(b.g.due));
    if (bad.length) { const { g, s } = bad[0];
      out.push({ kind: 'goal', id: g.id, goal: g.title, step: s.next ? s.next.t : g.title,
        text: en ? (s.pace === 'late' ? `The deadline for the goal ${qE(g.title)} has passed, with ${s.d} of ${s.n} steps done.` : `The goal ${qE(g.title)} is behind: ${s.d} of ${s.n} steps done with ${Math.round(s.passed * 100)}% of the time gone.`)
          : s.pace === 'late' ? `Срок цели ${qS(g.title)} прошёл, а сделано шагов: ${s.d} из ${s.n}.` : `Цель ${qS(g.title)} отстаёт: сделано ${s.d} из ${s.n} шагов, а прошло ${Math.round(s.passed * 100)}% срока.` }); }
  }
  for (const g of goals) {   // свободное окно сегодня для отстающей цели с планом — за 30 минут до начала, если занятия сегодня нет
    const pl = g.plan; if (!pl || typeof pl !== 'object' || !(+pl.min > 0)) continue;
    const s = goalPace(evs, g, k); if (s.pace !== 'behind') continue;
    const ids = new Set(Array.isArray(pl.ev) ? pl.ev : []); if (evs.some(e => ids.has(e.id) && occurs(e, k))) continue;
    const gap = freeGaps(data, evs, k).find(([a, b]) => b - Math.ceil(a / 15) * 15 >= +pl.min); if (!gap) continue;
    const start = Math.ceil(gap[0] / 15) * 15; if (min < Math.max(NUDGE_FROM, start - 30) || min >= start) continue;
    out.push({ kind: 'free', id: g.id, goal: g.title, step: s.next ? s.next.t : g.title, text: en ? `You're free today from ${hmS(start)}: spend ${+pl.min} min on the goal ${qE(g.title)}, it's behind.` : `Сегодня с ${hmS(start)} свободно — позанимайтесь целью ${qS(g.title)} ${+pl.min} мин: она отстаёт.` });
    break;
  }
  return out;
}
// Какой повод отправить сейчас. log — что уже отправлено за 3 дня: [{ key: 'nudge|день|вид|id', at: мс }]
function pickNudge(cands, log, now, tz) {
  const k = dayIn(now, tz);
  if (log.filter(x => x.key.startsWith(`nudge|${k}|`)).length >= NUDGE_MAX || log.some(x => now - x.at < NUDGE_GAP)) return null;
  const days = Array.from({ length: NUDGE_COOL }, (_, i) => addD(k, -i)), recent = c => days.some(d => log.some(x => x.key === `nudge|${d}|${c.kind}|${c.id}`));
  const c = [...cands].sort((a, b) => NUDGE_ORDER.indexOf(a.kind) - NUDGE_ORDER.indexOf(b.kind)).find(x => !recent(x));
  return c ? Object.assign({ key: `nudge|${k}|${c.kind}|${c.id}` }, c) : null;
}
// Текст пуша: повод + подначка (если включены; одна и та же весь день для повода); нажатие — сообщение появится в чате помощника
// (текст ai service worker кладёт в кэш, чат забирает — aiNudgeOpen в js/assistant.js; в адресе только «#ai»)
function nudgePayload(data, n, now) {
  const P = data.settings && data.settings.phr, k = dayIn(now, tzOf(data)), en = isEn(data);
  let body = n.text;
  if (!n.quiet && (!P || P.taunts !== false)) {
    const own = P && Array.isArray(P.custom) ? P.custom.filter(x => x && x.kind === 'taunt' && typeof x.t === 'string' && x.t.trim()).map(x => x.t.slice(0, 200)) : [];
    const l = [...(en ? [] : TAUNTS), ...own]; if (l.length) body += ' ' + fillS(l[hashS(k + n.id) % l.length], { goal: n.goal, step: n.step });
  }
  body = body.slice(0, 300);
  return { title: en ? 'Parsimony Assistant' : 'Помощник Parsimony', body, tag: 'nudge', ai: body, url: './#ai' };
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
  const cfg = await appCfg();
  let due = 0, sent = 0, rows = [];
  if (byUser.size) {
    const { data: rs, error: e2 } = await sb.from('user_data').select('user_id,data').in('user_id', [...byUser.keys()]);
    if (e2) throw e2;
    rows = rs || [];
    for (const row of rows) {
      const data = row.data || {}, tz = tzOf(data);
      for (const r of dueReminders(data, now - WINDOW, now)) {
        due++;
        if (!(await once(row.user_id, r.key, r.fire))) continue;
        sent += (await sendTo(byUser.get(row.user_id), JSON.stringify(remPayload(r, now, tz, isEn(data))), 3600)).ok;
      }
      for (const d of dueDigests(data, now - WINDOW, now)) {
        due++;
        if (!(await once(row.user_id, d.key, d.fire))) continue;
        sent += (await sendTo(byUser.get(row.user_id), JSON.stringify(digestPayload(d, data)), 3 * 3600)).ok;
      }
      // Помощник пишет сам: есть повод — смотрим, что уже отправлено за 3 дня (журнал reminder_log, ключи nudge|…), и шлём не больше одного
      const nc = cfg.nudge === false ? [] : nudgeCands(data, now);   // выключено в админке — всем
      if (nc.length) {
        const { data: lg } = await sb.from('reminder_log').select('key,fire_at').eq('user_id', row.user_id).like('key', 'nudge|%').gte('fire_at', new Date(now - 3 * DAY).toISOString());
        const n = pickNudge(nc, (lg || []).map(x => ({ key: x.key, at: Date.parse(x.fire_at) })), now, tz);
        if (n && await once(row.user_id, n.key, now)) sent += (await sendTo(byUser.get(row.user_id), JSON.stringify(nudgePayload(data, n, now)), 6 * 3600)).ok;
      }
    }
  }
  await sb.from('reminder_log').delete().lt('fire_at', new Date(now - 3 * DAY).toISOString());   // журнал за 3 дня, старше не нужен
  sent += await friendPushes(byUser, rows, now);
  sent += await msgPushes(byUser, rows);
  sent += await annPushes(byUser, rows, now, cfg);
  sent += await adminPushes(now);
  return { users: byUser.size, due, sent };
}

// Заявки в друзья (21 октября 2026; supabase/sql/friends.sql: очередь fr_notify): «Имя зовёт вас в друзья», «Имя теперь в друзьях».
// Каждая уходит один раз (sent_at). Нет подписки или в приложении выключен «Пуш о заявках» (settings.frPush = false) — просто отмечаем.
// Таблицы ещё нет (SQL не выполнен) — молча пропускаем, напоминания работают как раньше
async function friendPushes(byUser, rows, now) {
  const { data: q, error } = await sb.from('fr_notify').select('id').is('sent_at', null).order('id').limit(200);
  if (error || !q || !q.length) return 0;
  // забираем из очереди до отправки: запуск по записи в очередь (push_now.sql) и ежеминутный могут совпасть — пуш уйдёт один раз
  const { data: nts } = await sb.from('fr_notify').update({ sent_at: new Date(now).toISOString() }).in('id', q.map(n => n.id)).is('sent_at', null).select('id,to_uid,from_uid,kind');
  if (!nts || !nts.length) return 0;
  const who = await whoOf(nts.map(n => n.from_uid));
  const dataOf = new Map(rows.map(r => [r.user_id, r.data || {}]));
  let ok = 0;
  for (const n of nts) {
    const subs = byUser.get(n.to_uid), st = (dataOf.get(n.to_uid) || {}).settings || {};
    if (!subs || st.frPush === false) continue;
    const en = st.lang === 'en', body = n.kind === 'req' ? (en ? `${who(n.from_uid)} sent you a friend request` : `${who(n.from_uid)} зовёт вас в друзья`) : en ? `${who(n.from_uid)} is now your friend` : `${who(n.from_uid)} теперь в друзьях`;
    ok += (await sendTo(subs, JSON.stringify({ title: 'Parsimony', body, tag: 'fr-' + n.from_uid, url: './#s=profile', s: 'profile' }), 24 * 3600)).ok;
  }
  await sb.from('fr_notify').delete().lt('created_at', new Date(now - 3 * DAY).toISOString());
  return ok;
}

// Имя для пуша: имя из карточки друга, иначе @ник
async function whoOf(ids) {
  const { data: profs } = await sb.from('profiles').select('user_id,name,nick').in('user_id', [...new Set(ids)]);
  return id => { const p = (profs || []).find(x => x.user_id === id); return (p && (String(p.name || '').trim() || (p.nick ? '@' + p.nick : ''))) || 'Кто-то'; };
}

// Сообщения друзей (23 октября 2026; supabase/sql/messages.sql: очередь msg_notify — одна строка «кому — от кого», n — сколько новых,
// body — начало последнего). Прочитал раньше, чем дошла очередь, — строки уже нет, пуша не будет. Заголовок — имя друга, текст — сообщение;
// новый пуш от того же друга заменяет прошлый (tag). Нет подписки или выключен «Пуш о сообщениях» (settings.msgPush = false) — просто снимаем.
// Строку снимаем, только если с тех пор не пришло новое (тот же at). Таблицы ещё нет (SQL не выполнен) — молча пропускаем
async function msgPushes(byUser, rows) {
  const { data: q, error } = await sb.from('msg_notify').select('to_uid,from_uid,n,body,at').order('at').limit(300);
  if (error || !q || !q.length) return 0;
  const who = await whoOf(q.map(x => x.from_uid)), dataOf = new Map(rows.map(r => [r.user_id, r.data || {}]));
  let ok = 0;
  for (const x of q) {
    // забираем из очереди до отправки (как у заявок): новое сообщение того же друга меняет at — такая строка останется до следующего раза
    const { data: got } = await sb.from('msg_notify').delete().eq('to_uid', x.to_uid).eq('from_uid', x.from_uid).eq('at', x.at).select('to_uid');
    if (!got || !got.length) continue;
    const subs = byUser.get(x.to_uid), st = (dataOf.get(x.to_uid) || {}).settings || {};
    if (subs && st.msgPush !== false) {
      const body = String(x.body || '').slice(0, 120) + (x.n > 1 ? (st.lang === 'en' ? ` · ${x.n - 1} more` : ` · ещё ${x.n - 1}`) : '');
      ok += (await sendTo(subs, JSON.stringify({ title: who(x.from_uid), body, tag: 'msg-' + x.from_uid, url: './#m=' + x.from_uid, m: x.from_uid }), 24 * 3600)).ok;
    }
  }
  return ok;
}

// Только очереди — сообщения друзей и заявки в друзья (вызов из базы при записи в очередь, push_now.sql): подписки и настройки — только
// получателей, без разбора напоминаний всех людей. Напоминания и сводки — по-прежнему ежеминутный tick
async function queueTick(now) {
  const [{ data: m }, { data: f }] = await Promise.all([sb.from('msg_notify').select('to_uid').limit(300), sb.from('fr_notify').select('to_uid').is('sent_at', null).limit(200)]);
  const ids = [...new Set([...(m || []), ...(f || [])].map(x => x.to_uid))];
  const ap = await adminPushes(now);   // отзывы и попытки без прав — тоже сразу (триггеры admin2.sql)
  if (!ids.length) return { users: 0, sent: ap };
  const [{ data: subs, error }, { data: rs }] = await Promise.all([sb.from('push_subscriptions').select('endpoint,p256dh,auth,user_id').in('user_id', ids),
    sb.from('user_data').select('user_id,settings:data->settings').in('user_id', ids)]);
  if (error) throw error;
  const byUser = new Map();
  for (const s of subs || []) { if (!byUser.has(s.user_id)) byUser.set(s.user_id, []); byUser.get(s.user_id).push(s); }
  const rows = (rs || []).map(r => ({ user_id: r.user_id, data: { settings: r.settings && typeof r.settings === 'object' ? r.settings : {} } }));
  return { users: ids.length, sent: ap + (await friendPushes(byUser, rows, now)) + (await msgPushes(byUser, rows)) };
}

// Настройки из админки (app_config): таблицы ещё нет — пусто, всё как раньше
async function appCfg() { const { data, error } = await sb.from('app_config').select('k,v'); return error ? {} : Object.fromEntries((data || []).map(x => [x.k, x.v])); }
// Объявление всем — один раз: сначала помечаем отправленным (два запуска одновременно не пришлют дважды), потом шлём всем, кроме выключивших
// «Новости Parsimony» (S.settings.newsPush = false)
async function annPushes(byUser, rows, now, cfg) {
  const a = cfg.ann; if (!a || typeof a !== 'object' || !a.push || a.pushed !== false || !a.id) return 0;
  const { data: got } = await sb.from('app_config').update({ v: { ...a, pushed: true }, updated_at: new Date(now).toISOString() }).eq('k', 'ann').eq('v->>id', String(a.id)).eq('v->>pushed', 'false').select('k');
  if (!got || !got.length) return 0;
  const st = new Map(rows.map(r => [r.user_id, (r.data || {}).settings || {}]));
  const body = JSON.stringify({ title: String(a.title || 'Новости Parsimony').slice(0, 60), body: String(a.text || '').replace(/\s+/g, ' ').slice(0, 180), tag: 'ann', url: './#s=home', s: 'home' });
  let ok = 0;
  for (const [uid, subs] of byUser) if ((st.get(uid) || {}).newsPush !== false) ok += (await sendTo(subs, body, 24 * 3600)).ok;
  return ok;
}
// Админам: новый отзыв и попытка открыть админку без прав — каждое один раз (push_at: сначала пометить, потом слать); выключается в админке
// → «Настройки» → «Мои уведомления» (S.settings.admPush.fb / .deny). Нажатие — админка на нужной вкладке (#s=admfb / #s=admlog)
const FB_NAME = { unclear: 'непонятно', inconvenient: 'неудобно', bug: 'ошибка', idea: 'идея', other: 'другое' };
async function adminPushes(now) {
  const [f0, d0] = await Promise.all([sb.from('feedback').select('id').is('push_at', null).order('id').limit(20), sb.from('admin_log').select('id').eq('action', 'denied').is('push_at', null).order('id').limit(20)]);
  const fIds = (f0.error ? [] : f0.data || []).map(x => x.id), dIds = (d0.error ? [] : d0.data || []).map(x => x.id);
  if (!fIds.length && !dIds.length) return 0;
  const at = new Date(now).toISOString(), none = { data: [] };
  const [fr, dr] = await Promise.all([fIds.length ? sb.from('feedback').update({ push_at: at }).in('id', fIds).is('push_at', null).select('id,kind,body,email') : none,
    dIds.length ? sb.from('admin_log').update({ push_at: at }).in('id', dIds).is('push_at', null).select('id,admin') : none]);
  const fb = fr.data || [], dn = dr.data || [];
  if (!fb.length && !dn.length) return 0;
  const { data: ad } = await sb.from('admins').select('user_id'), ids = (ad || []).map(x => x.user_id);
  if (!ids.length) return 0;
  const [{ data: subs }, { data: rs }] = await Promise.all([sb.from('push_subscriptions').select('endpoint,p256dh,auth,user_id').in('user_id', ids), sb.from('user_data').select('user_id,settings:data->settings').in('user_id', ids)]);
  const mail = {};
  for (const x of dn) if (x.admin && !(x.admin in mail)) { const { data } = await sb.auth.admin.getUserById(x.admin); mail[x.admin] = (data && data.user && data.user.email) || 'неизвестный аккаунт'; }
  let ok = 0;
  for (const uid of ids) {
    const s = (subs || []).filter(x => x.user_id === uid), p = (((rs || []).find(r => r.user_id === uid) || {}).settings || {}).admPush || {};
    if (!s.length) continue;
    if (p.fb !== false) for (const x of fb) ok += (await sendTo(s, JSON.stringify({ title: 'Новый отзыв · ' + (FB_NAME[x.kind] || 'отзыв'), body: String(x.body || '').replace(/\s+/g, ' ').slice(0, 140) + (x.email ? ' — ' + x.email : ''), tag: 'adm-fb', url: './#s=admfb', s: 'admfb' }), 24 * 3600)).ok;
    if (p.deny !== false) for (const x of dn) ok += (await sendTo(s, JSON.stringify({ title: 'Попытка открыть админку', body: (mail[x.admin] || 'неизвестный аккаунт') + ' — без прав, доступ закрыт', tag: 'adm-deny', url: './#s=admlog', s: 'admlog' }), 24 * 3600)).ok;
  }
  return ok;
}

async function testPush(uid, en) {
  const now = Date.now();
  if (!(await once(uid, `test:${Math.floor(now / 60000)}`, now))) return { ok: 0, devices: 0, error: 'rate' };
  const { data: subs, error } = await sb.from('push_subscriptions').select('endpoint,p256dh,auth').eq('user_id', uid);
  if (error) throw error;
  if (!subs || !subs.length) return { ok: 0, devices: 0 };
  const r = await sendTo(subs, JSON.stringify({ title: 'Parsimony', body: en ? 'Test: reminders are working ✓' : 'Проверка: напоминания приходят ✓', tag: 'test', url: './' }), 300);
  return { ...r, devices: subs.length };
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  try {
    const key = req.headers.get('apikey') ?? '';
    if (key.startsWith('sb_secret_') && secretKeys.includes(key)) {
      const b = await req.json().catch(() => null);
      return json(b && b.queue === true ? await queueTick(Date.now()) : await tick(Date.now()));   // queue — из базы при записи в очередь (push_now.sql)
    }
    const tok = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!tok || tok.startsWith('sb_')) return json({ error: 'forbidden' }, 403);
    const { data, error } = await sb.auth.getUser(tok);
    if (error || !data || !data.user) return json({ error: 'forbidden' }, 403);
    const b = await req.json().catch(() => null);
    return json(await testPush(data.user.id, !!b && b.lang === 'en'));
  } catch (e) {
    console.error(e);
    return json({ error: 'server' }, 500);
  }
});
