// Календари в обе стороны (25 ноября 2026, пользователь: «можно ли сделать синхронизацию с другими календарями?» → «давай делать»)
// 1) GET ?t=<ключ> — свои события в формате iCalendar (RFC 5545). Ссылку-подписку добавляют в Google Календарь («Добавить по URL»),
//    Яндекс Календарь («Подписаться»), Календарь iPhone (webcal://). Ключ — таблица cal_feeds (supabase/sql/calendar.sql): его создаёт,
//    сбрасывает и выключает сам человек (cal_feed_new / cal_feed_off). Что попадает: календари из S.settings.feed.cats (пусто — все), без
//    примера для пробы; заметки — только если включено (feed.notes); без напоминаний (их и так пришлёт Parsimony). Время — в поясе человека:
//    TZID + VTIMEZONE (без них Google ставит «плавающее» время как UTC — сдвиг на 3 часа в Москве).
// 2) POST { url, tz } с токеном входа — забрать чужой календарь (.ics по https: «секретный адрес» Google, экспорт Яндекса, публичный iCloud) и
//    вернуть события в виде приложения: простые повторы — repeat приложения (js/core.js occurs), сложные — отдельными днями на год вперёд.
//    Защита: только https на 443, без IP-адресов, логинов и внутренних имён; адрес, на который указывает имя, — не внутренний (если среда
//    умеет спрашивать DNS); переадресации проверяются заново (до 3); до 3 МБ и 12 с; не чаще 40 раз в час на человека. Ссылка нигде не
//    хранится — только в записях человека (S.settings.subs); сам календарь — только на его устройстве.
// 3) Виджет iPhone (Scriptable, 25 ноября 2026): ключ widget_keys (supabase/sql/widget.sql). GET ?w=<ключ> — сводка дня; POST { w, op }:
//    say — сказанное голосом разбирает помощник (функция assistant, от имени человека, в его дневной лимит), записи встают сразу (задачи,
//    события с напоминаниями, деньги, заметки, отметки привычек); tasks — разовые задачи для «Напоминаний»; sync — отметки и новые задачи
//    из «Напоминаний». Записи меняются с проверкой rev, как приложение (не совпало — заново); приложение потом сольёт их (merge3).
import { createClient } from "npm:@supabase/supabase-js@2";

// ==== CORE start ====
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/, TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const pad = n => String(n).padStart(2, '0');
const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const fmts = new Map();
const fmtOf = tz => { if (!fmts.has(tz)) fmts.set(tz, new Intl.DateTimeFormat('en-CA', { timeZone: tz, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23' })); return fmts.get(tz); };
const partsIn = (ts, tz) => { const p = {}; for (const x of fmtOf(tz).formatToParts(new Date(ts))) p[x.type] = x.value; return { y:+p.year, m:+p.month, d:+p.day, h:+p.hour % 24, mi:+p.minute }; };
const tzOffset = (ts, tz) => { const p = partsIn(ts, tz); return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi) - Math.floor(ts / 60000) * 60000; };
// День k и минута дня min по часам пояса tz → момент времени (мс); как в функции reminders
const zoned = (k, min, tz) => { const [y, m, d] = k.split('-').map(Number); const g = Date.UTC(y, m - 1, d, 0, min); const t = g - tzOffset(g, tz); return g - tzOffset(t, tz); };
const dayIn = (ts, tz) => { const p = partsIn(ts, tz); return ymd(p.y, p.m, p.d); };
const addD = (k, n) => { const [y, m, d] = k.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d + n)); return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()); };
const dayDiff = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
const dowOf = k => { const [y, m, d] = k.split('-').map(Number); return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; };   // 0 = понедельник
const wkNum = k => Math.floor((Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10)) / 864e5 + 3) / 7);
const tmin = t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
const fmtMin = m => pad(Math.floor(m / 60)) + ':' + pad(m % 60);
const tzOk = tz => { try { if (typeof tz === 'string' && tz && tz.length < 64) { fmtOf(tz); return true; } } catch (e) {} return false; };
const isRec = e => !!(e.repeat && e.repeat.type && e.repeat.type !== 'none');
// Тот же смысл, что occurs в js/core.js (и в функции reminders); тест сверяет на случайных событиях
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
const hashS = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36) + s.length.toString(36); };

// ---- 1. Свои события → iCalendar ----
const BY = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'], BYI = { MO: 0, TU: 1, WE: 2, TH: 3, FR: 4, SA: 5, SU: 6 };
const icsT = s => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const fold = line => {   // строки не длиннее 75 байт (RFC 5545, 3.1)
  const parts = []; let cur = '', n = 0, lim = 75;
  for (const ch of line) { const cp = ch.codePointAt(0), b = cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4; if (n + b > lim) { parts.push(cur); cur = ''; n = 0; lim = 74; } cur += ch; n += b; }
  parts.push(cur); return parts.join('\r\n ');
};
const icsD = (d, t) => d.replace(/-/g, '') + (t ? 'T' + t.replace(':', '') + '00' : '');
const icsZ = ts => new Date(ts).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
// Описание пояса: без перехода на летнее время (Москва и почти вся Россия) — одно смещение; с переходом — без описания (Google и Apple
// знают имена IANA сами)
function vtz(tz, year) {
  const jan = tzOffset(Date.UTC(year, 0, 15), tz), jul = tzOffset(Date.UTC(year, 6, 15), tz);
  if (jan !== jul) return [];
  const o = Math.round(jan / 60000), s = (o < 0 ? '-' : '+') + pad(Math.floor(Math.abs(o) / 60)) + pad(Math.abs(o) % 60);
  return ['BEGIN:VTIMEZONE', 'TZID:' + tz, 'BEGIN:STANDARD', 'DTSTART:19700101T000000', 'TZOFFSETFROM:' + s, 'TZOFFSETTO:' + s, 'TZNAME:' + s.slice(0, 3), 'END:STANDARD', 'END:VTIMEZONE'];
}
const FEED_MAX = 3000;
function feedIcs(data, now) {
  data = data && typeof data === 'object' ? data : {};
  const st = data.settings && typeof data.settings === 'object' ? data.settings : {}, tz = tzOk(st.tz) ? st.tz : 'Europe/Moscow';
  const f = st.feed && typeof st.feed === 'object' ? st.feed : {}, today = dayIn(now, tz), lo = addD(today, -90);
  const cats = new Map((Array.isArray(data.cats) ? data.cats : []).filter(c => c && c.id != null).map(c => [String(c.id), String(c.name || '')]));
  const only = Array.isArray(f.cats) && f.cats.length ? new Set(f.cats.map(String)) : null, notes = f.notes === true, stamp = icsZ(now);
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Parsimony//RU', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Parsimony',
    'X-WR-TIMEZONE:' + tz, 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H', ...vtz(tz, +today.slice(0, 4))];
  let n = 0;
  for (const e of Array.isArray(data.events) ? data.events : []) {
    if (n >= FEED_MAX) break;
    if (!e || typeof e !== 'object' || e.demo || e.id == null || !DATE_RE.test(e.date || '') || typeof e.title !== 'string' || !e.title.trim()) continue;
    if (only && !only.has(String(e.cat))) continue;
    const rec = isRec(e), r = rec ? e.repeat : {};
    if (!rec && e.date < lo) continue;
    if (rec && r.until && DATE_RE.test(r.until) && r.until < lo) continue;
    // Начало — первый настоящий день повтора: другие календари всегда показывают DTSTART, даже если он не по правилу
    let d0 = e.date; if (rec) { let i = 0; for (; i < 400 && !occurs(e, d0); i++) d0 = addD(d0, 1); if (i >= 400) continue; }
    const tm = TIME_RE.test(e.time || '') ? e.time : '';
    L.push('BEGIN:VEVENT', 'UID:' + icsT(String(e.id).slice(0, 80)) + '@parsimony', 'DTSTAMP:' + stamp, 'SUMMARY:' + icsT((e.task && !rec && e.done ? '✓ ' : '') + e.title.trim().slice(0, 300)));
    if (tm) { const end = TIME_RE.test(e.time2 || '') && tmin(e.time2) > tmin(tm) ? e.time2 : fmtMin(Math.min(1439, tmin(tm) + 60));
      L.push(`DTSTART;TZID=${tz}:` + icsD(d0, tm), `DTEND;TZID=${tz}:` + icsD(d0, end)); }
    else L.push('DTSTART;VALUE=DATE:' + icsD(d0), 'DTEND;VALUE=DATE:' + icsD(addD(d0, 1)));
    if (rec) {
      const days = Array.isArray(r.days) && r.days.length ? r.days.filter(i => Number.isInteger(i) && i >= 0 && i < 7) : [dowOf(e.date)];
      let rule = { daily: 'FREQ=DAILY', weekdays: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', weekly: 'FREQ=WEEKLY;' + (r.every === 2 ? 'INTERVAL=2;' : '') + 'BYDAY=' + (days.length ? days : [dowOf(e.date)]).map(i => BY[i]).join(','), monthly: 'FREQ=MONTHLY', yearly: 'FREQ=YEARLY' }[r.type];
      if (rule) {
        // UNTIL при DTSTART с поясом — в UTC (RFC 5545, 3.3.10): конец последнего дня по часам человека
        if (r.until && DATE_RE.test(r.until)) rule += ';UNTIL=' + (tm ? icsZ(zoned(r.until, 1439, tz)) : icsD(r.until));
        L.push('RRULE:' + rule);
      }
      (Array.isArray(e.skip) ? e.skip : []).filter(k => typeof k === 'string' && DATE_RE.test(k) && k >= lo).slice(0, 400)
        .forEach(k => L.push(tm ? `EXDATE;TZID=${tz}:` + icsD(k, tm) : 'EXDATE;VALUE=DATE:' + icsD(k)));
    }
    if (typeof e.loc === 'string' && e.loc.trim()) L.push('LOCATION:' + icsT(e.loc.trim().slice(0, 300)));
    if (notes && typeof e.note === 'string' && e.note.trim()) L.push('DESCRIPTION:' + icsT(e.note.trim().slice(0, 2000)));
    const cn = cats.get(String(e.cat)); if (cn) L.push('CATEGORIES:' + icsT(cn.slice(0, 80)));
    L.push('END:VEVENT'); n++;
  }
  L.push('END:VCALENDAR');
  return L.map(fold).join('\r\n') + '\r\n';
}

// ---- 2. Чужой календарь → события приложения ----
const unesc = s => String(s).replace(/\\([\\;,nN])/g, (m, c) => c === 'n' || c === 'N' ? '\n' : c);
const icsLines = text => String(text).replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
function icsProp(line) {   // ИМЯ;ПАРАМЕТР=значение;…:значение (двоеточие в кавычках параметра — не разделитель)
  let q = false, i = 0;
  for (; i < line.length; i++) { const c = line[i]; if (c === '"') q = !q; else if (c === ':' && !q) break; }
  if (i >= line.length) return null;
  const parts = line.slice(0, i).split(';'), p = {};
  for (const x of parts.slice(1)) { const j = x.indexOf('='); if (j > 0) p[x.slice(0, j).toUpperCase()] = x.slice(j + 1).replace(/^"|"$/g, ''); }
  return { name: parts[0].toUpperCase(), p, val: line.slice(i + 1) };
}
// Поясa Outlook (Windows-названия) — самые частые; остальное — как «плавающее» время
const WIN_TZ = { 'Russian Standard Time': 'Europe/Moscow', 'Russia Time Zone 3': 'Europe/Samara', 'Ekaterinburg Standard Time': 'Asia/Yekaterinburg',
  'Omsk Standard Time': 'Asia/Omsk', 'N. Central Asia Standard Time': 'Asia/Novosibirsk', 'North Asia Standard Time': 'Asia/Krasnoyarsk',
  'North Asia East Standard Time': 'Asia/Irkutsk', 'Yakutsk Standard Time': 'Asia/Yakutsk', 'Vladivostok Standard Time': 'Asia/Vladivostok',
  'Magadan Standard Time': 'Asia/Magadan', 'Kaliningrad Standard Time': 'Europe/Kaliningrad', 'Belarus Standard Time': 'Europe/Minsk',
  'FLE Standard Time': 'Europe/Kiev', 'GMT Standard Time': 'Europe/London', 'W. Europe Standard Time': 'Europe/Berlin', 'Central European Standard Time': 'Europe/Warsaw',
  'Romance Standard Time': 'Europe/Paris', 'Eastern Standard Time': 'America/New_York', 'Pacific Standard Time': 'America/Los_Angeles', 'UTC': 'UTC' };
const tzName = s => { if (!s) return ''; if (WIN_TZ[s]) return WIN_TZ[s]; if (tzOk(s)) return s; const m = /[A-Za-z_]+\/[A-Za-z_+\-]+(?:\/[A-Za-z_+\-]+)?$/.exec(s); return m && tzOk(m[0]) ? m[0] : ''; };
// Дата-время iCalendar → день и время по часам человека (tz). Z — UTC; TZID — пояс; иначе «плавающее» — как есть
function icsWhen(prop, tz) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(String(prop.val || '').trim()); if (!m) return null;
  const y = +m[1], mo = +m[2], dd = +m[3]; if (mo < 1 || mo > 12 || dd < 1 || dd > 31 || y < 1900 || y > 2200) return null;
  const d = ymd(y, mo, dd);
  if (!m[4] || String(prop.p && prop.p.VALUE || '').toUpperCase() === 'DATE') return { d, t: '' };   // весь день
  const min = +m[4] * 60 + +m[5]; if (min >= 1440) return null;
  const src = m[7] ? 'UTC' : tzName(prop.p && prop.p.TZID);
  if (!src || src === tz) return { d, t: fmtMin(min) };
  const p = partsIn(zoned(d, min, src), tz);
  return { d: ymd(p.y, p.m, p.d), t: fmtMin(p.h * 60 + p.mi) };
}
const durMin = v => { const m = /^[+]?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(String(v || '').trim()); return m ? ((+m[1] || 0) * 7 * 1440 + (+m[2] || 0) * 1440 + (+m[3] || 0) * 60 + (+m[4] || 0)) : 0; };
const rruleOf = v => { const o = {}; for (const x of String(v).split(';')) { const j = x.indexOf('='); if (j > 0) o[x.slice(0, j).toUpperCase()] = x.slice(j + 1).toUpperCase(); } return o; };
// Повтор, который приложение считает само (occurs) → repeat; иначе null — тогда дни считает expandRule
function toRepeat(rr, d0, until) {
  const iv = +(rr.INTERVAL || 1), f = rr.FREQ, days = rr.BYDAY ? rr.BYDAY.split(',') : [], plain = days.every(x => x in BYI), u = until || null;
  if (rr.BYSETPOS || rr.BYHOUR || rr.BYMINUTE || rr.BYSECOND || rr.BYWEEKNO || rr.BYYEARDAY || !plain) return null;
  if (f === 'DAILY' && iv === 1 && !rr.BYMONTHDAY && !rr.BYMONTH) return days.length ? { type: 'weekly', days: [...new Set(days.map(x => BYI[x]))].sort(), until: u } : { type: 'daily', until: u };
  if (f === 'WEEKLY' && (iv === 1 || iv === 2) && !rr.BYMONTHDAY && !rr.BYMONTH) {
    const ds = days.length ? [...new Set(days.map(x => BYI[x]))].sort() : [dowOf(d0)];
    return { type: 'weekly', days: ds, ...(iv === 2 ? { every: 2 } : {}), until: u };
  }
  if (f === 'MONTHLY' && iv === 1 && !days.length && !rr.BYMONTH && (!rr.BYMONTHDAY || rr.BYMONTHDAY === String(+d0.slice(8)))) return { type: 'monthly', until: u };
  if (f === 'YEARLY' && iv === 1 && !days.length && (!rr.BYMONTH || rr.BYMONTH === String(+d0.slice(5, 7))) && (!rr.BYMONTHDAY || rr.BYMONTHDAY === String(+d0.slice(8)))) return { type: 'yearly', until: u };
  return null;
}
const ymDays = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
// Дни месяца по BYDAY / BYMONTHDAY (с номером: 2TU — второй вторник, -1FR — последняя пятница; -1 — последний день)
function monthDays(y, m, byday, bymd, d0day) {
  const n = ymDays(y, m), first = dowOf(ymd(y, m, 1)); let set = null;
  if (byday.length) { set = new Set();
    for (const b of byday) { const all = []; for (let d = 1 + ((b.w - first + 7) % 7); d <= n; d += 7) all.push(d);
      if (!b.n) all.forEach(d => set.add(d)); else { const d = b.n > 0 ? all[b.n - 1] : all[all.length + b.n]; if (d) set.add(d); } } }
  if (bymd.length) { const md = new Set(bymd.map(x => x > 0 ? x : n + 1 + x).filter(x => x >= 1 && x <= n)); set = set ? new Set([...set].filter(d => md.has(d))) : md; }
  if (!set) set = new Set(d0day <= n ? [d0day] : []);
  return [...set].sort((a, b) => a - b);
}
// Сложный повтор (через 3 дня, второй вторник месяца, последний день месяца…) — дни по правилу RFC 5545 в окне [lo, hi], до 400
function expandRule(rr, d0, until, lo, hi) {
  const f = rr.FREQ, iv = Math.max(1, Math.min(1000, +(rr.INTERVAL || 1) || 1)), cnt = rr.COUNT ? Math.max(0, +rr.COUNT || 0) : 0;
  const byday = rr.BYDAY ? rr.BYDAY.split(',').map(x => { const m = /^([+-]?\d{1,2})?(MO|TU|WE|TH|FR|SA|SU)$/.exec(x); return m ? { n: m[1] ? +m[1] : 0, w: BYI[m[2]] } : null; }).filter(Boolean) : [];
  const bymd = rr.BYMONTHDAY ? rr.BYMONTHDAY.split(',').map(Number).filter(n => n && Math.abs(n) <= 31) : [];
  const bymo = rr.BYMONTH ? rr.BYMONTH.split(',').map(Number).filter(n => n >= 1 && n <= 12) : [];
  const pos = rr.BYSETPOS ? rr.BYSETPOS.split(',').map(Number).filter(Boolean) : [];
  const out = [], end = until && until < hi ? until : hi; let seen = 0, stop = false;
  const take = list => { for (const k of list) { if (k < d0) continue; if (k > end && !cnt) { stop = true; return; } if (until && k > until) { stop = true; return; }
    seen++; if (cnt && seen > cnt) { stop = true; return; } if (k >= lo && k <= hi) out.push(k); if (out.length >= 400 || k > hi) { stop = true; return; } } };
  const sel = list => pos.length ? pos.map(p => p > 0 ? list[p - 1] : list[list.length + p]).filter(Boolean).sort() : list;
  if (f === 'DAILY') {
    const k0 = !cnt && lo > d0 ? addD(d0, Math.floor(dayDiff(d0, lo) / iv) * iv) : d0;   // давний повтор — сразу к окну (без «N раз» считать сначала не нужно)
    for (let k = k0, i = 0; i < 5000 && !stop; i++, k = addD(k, iv))
      if ((!byday.length || byday.some(b => b.w === dowOf(k))) && (!bymo.length || bymo.includes(+k.slice(5, 7))) && (!bymd.length || bymd.includes(+k.slice(8)))) take([k]);
      else if (k > end) break;
  } else if (f === 'WEEKLY') {
    const ws = byday.length ? [...new Set(byday.map(b => b.w))].sort() : [dowOf(d0)];
    const w0 = addD(d0, -dowOf(d0)), wl = !cnt && lo > w0 ? addD(w0, Math.max(0, Math.floor(dayDiff(w0, lo) / (7 * iv)) - 1) * 7 * iv) : w0;
    for (let w = wl, i = 0; i < 2000 && !stop && w <= end; i++, w = addD(w, 7 * iv))
      take(sel(ws.map(x => addD(w, x)).filter(k => !bymo.length || bymo.includes(+k.slice(5, 7)))));
  } else if (f === 'MONTHLY' || f === 'YEARLY') {
    let y = +d0.slice(0, 4), m = +d0.slice(5, 7); const dd = +d0.slice(8);
    for (let i = 0; i < 1200 && !stop; i++) {
      const months = f === 'MONTHLY' ? (!bymo.length || bymo.includes(m) ? [m] : []) : (bymo.length ? bymo : [+d0.slice(5, 7)]).slice().sort((a, b) => a - b);
      const list = []; for (const mm of months) for (const d of monthDays(y, mm, byday, bymd, dd)) list.push(ymd(y, mm, d));
      if (list.length && list[0] > end && !cnt) break;
      take(sel(list));
      if (f === 'MONTHLY') { m += iv; while (m > 12) { m -= 12; y++; } } else y += iv;
      if (ymd(y, m, 1) > end && !cnt) break;
    }
  } else take([d0]);   // часы, минуты — только первое
  return out;
}
const PARSE_MAX = 3000, OUT_MAX = 5000;
function parseIcs(text, tz, today) {
  const lo = addD(today, -60), hi = addD(today, 400), raw = [];
  let name = '', cur = null, sub = 0;
  for (const line of icsLines(text)) {
    if (!line) continue;
    const up = line.toUpperCase();
    if (up === 'BEGIN:VEVENT') { cur = { ex: [] }; sub = 0; continue; }
    if (up === 'END:VEVENT') { if (cur && raw.length < PARSE_MAX * 2) raw.push(cur); cur = null; continue; }
    if (cur && up.startsWith('BEGIN:')) { sub++; continue; }   // напоминания (VALARM) внутри события — пропускаем
    if (cur && up.startsWith('END:')) { if (sub) sub--; continue; }
    if (cur && sub) continue;
    const p = icsProp(line); if (!p) continue;
    if (!cur) { if (p.name === 'X-WR-CALNAME' && !name) name = unesc(p.val).replace(/\s+/g, ' ').trim().slice(0, 60); continue; }
    switch (p.name) {
      case 'UID': cur.uid = p.val.slice(0, 300); break;
      case 'SUMMARY': cur.t = unesc(p.val); break;
      case 'LOCATION': cur.loc = unesc(p.val); break;
      case 'DTSTART': cur.s = p; break;
      case 'DTEND': cur.e = p; break;
      case 'DURATION': cur.dur = p.val; break;
      case 'RRULE': cur.rr = rruleOf(p.val); break;
      case 'EXDATE': for (const v of p.val.split(',')) if (cur.ex.length < 500) cur.ex.push({ p: p.p, val: v }); break;
      case 'RECURRENCE-ID': cur.rid = p; break;
      case 'STATUS': cur.st = p.val.trim().toUpperCase(); break;
    }
  }
  // Изменённый или отменённый день повтора (RECURRENCE-ID): исходный день у повтора пропускается, изменённый — отдельным событием
  const masters = new Map(); for (const x of raw) if (!x.rid && x.uid) masters.set(x.uid, x);
  for (const x of raw) if (x.rid && x.uid && masters.has(x.uid)) masters.get(x.uid).ex.push(x.rid);
  const out = []; let n = 0;
  const clean = s => String(s || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  for (const x of raw) {
    if (n >= PARSE_MAX || out.length >= OUT_MAX) break;
    if (x.st === 'CANCELLED') continue;
    const s = x.s && icsWhen(x.s, tz); if (!s) continue;
    const title = clean(x.t).slice(0, 200) || 'Без названия', loc = clean(x.loc).slice(0, 200);
    let t2 = '';
    if (s.t) { const e = x.e && icsWhen(x.e, tz);
      if (e && e.t && e.d === s.d && tmin(e.t) > tmin(s.t)) t2 = e.t;
      else if (!x.e && x.dur) { const dm = durMin(x.dur); if (dm > 0 && tmin(s.t) + dm < 1440) t2 = fmtMin(tmin(s.t) + dm); } }
    const base = { t: title, ...(s.t ? { tm: s.t } : {}), ...(t2 ? { tm2: t2 } : {}), ...(loc ? { loc } : {}) };
    const id = hashS((x.uid || title + '|' + s.d) + '|' + (x.rid ? x.rid.val : ''));
    n++;
    if (!x.rr) {
      // Весь день на несколько дней (отпуск) — по дню, до 31
      const e = !s.t && x.e && icsWhen(x.e, tz), span = e && !e.t && e.d > s.d ? Math.min(31, dayDiff(s.d, e.d)) : 1;
      for (let i = 0; i < span; i++) { const k = addD(s.d, i); if (k >= lo && k <= hi) out.push({ id: span > 1 ? id + '-' + i : id, d: k, ...base }); }
      continue;
    }
    const rr = x.rr, uw = rr.UNTIL ? icsWhen({ val: rr.UNTIL, p: {} }, tz) : null, until = uw ? uw.d : '';
    const sk = [...new Set(x.ex.map(v => icsWhen(v, tz)).filter(Boolean).map(w => w.d))];
    let rep = toRepeat(rr, s.d, until);
    if (rep && rr.COUNT) {   // «N раз» — последний день по счёту
      const c = Math.max(1, +rr.COUNT || 1), ev = { date: s.d, repeat: rep }; let k = s.d, got = 0, last = '';
      for (let i = 0; i < 3700 && got < c; i++, k = addD(k, 1)) if (occurs(ev, k)) { got++; last = k; }
      if (got < c) rep = null; else rep.until = rep.until && rep.until < last ? rep.until : last;
    }
    if (rep) {
      if (rep.until && rep.until < lo) continue;
      if (!rep.until) delete rep.until;
      out.push({ id, d: s.d, ...base, r: rep, ...(sk.length ? { sk: sk.slice(0, 400) } : {}) });
      continue;
    }
    expandRule(rr, s.d, until, lo, hi).filter(k => !sk.includes(k)).forEach((k, i) => { if (out.length < OUT_MAX) out.push({ id: id + '-' + i, d: k, ...base }); });
  }
  return { name, events: out };
}

// Ссылка на чужой календарь: только https на 443, без логина в адресе, без IP-адреса и внутренних имён; webcal:// — это https
const BAD_HOST = /(^|\.)(localhost|local|internal|intranet|lan|home|corp|localdomain|test|invalid|onion|arpa)$/i;
function feedUrl(u) {
  let s = String(u || '').trim(); if (s.length < 10 || s.length > 2000) return null;
  s = s.replace(/^webcals?:\/\//i, 'https://');
  let x; try { x = new URL(s); } catch (e) { return null; }
  if (x.protocol !== 'https:' || x.username || x.password || (x.port && x.port !== '443')) return null;
  const h = x.hostname.toLowerCase();
  if (!h.includes('.') || /^[\d.]+$/.test(h) || h.includes(':') || h.startsWith('[') || BAD_HOST.test(h)) return null;
  x.hash = ''; return x.toString();
}
// Внутренний адрес (на случай, если имя указывает внутрь: 10.x, 127.x, 192.168.x…)
const privIp = ip => /^(0|10|127)\./.test(ip) || /^169\.254\./.test(ip) || /^192\.168\./.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip) || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip)
  || /^(::1?|::ffff:.*|f[cd][0-9a-f]{2}:.*|fe[89ab][0-9a-f]:.*)$/i.test(ip);
// ---- 3. Виджет iPhone (Scriptable, 25 ноября 2026; пользователь: «давай scriptable… голосовой ввод при нажатии на виджет… синхронизацию
//      для задач и напоминаний» → с «Напоминаниями» iPhone, разбор голоса — помощник). Ключ — widget_keys (supabase/sql/widget.sql).
//      Здесь — только чистые функции над записями человека (S): сводка дня, задачи для «Напоминаний», добавить сказанное, отметки.
const W_TYPES = ['task', 'event', 'expense', 'income', 'saving', 'note', 'check'];
const wStr = (s, n) => typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n) : '';
const wUid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const wArr = (d, k) => Array.isArray(d[k]) ? d[k] : (d[k] = []);
const wDone = (e, k) => isRec(e) ? Array.isArray(e.doneDates) && e.doneDates.includes(k) : !!e.done;
const wTm = t => TIME_RE.test(t || '') ? t : '';
// Привычки на сегодня — как todayHabs в приложении: ежедневные, по дням недели, с месяца начала
const wHabs = (d, k) => (Array.isArray(d.habits) ? d.habits : []).filter(h => h && typeof h.name === 'string' && h.kind === 'daily' && h.log && typeof h.log === 'object'
  && (!Array.isArray(h.days) || !h.days.length || h.days.includes(dowOf(k))) && String(h.from || k).slice(0, 7) <= k.slice(0, 7));
// Сводка дня: дела и события сегодня по времени, сколько сделано, привычки
function wSummary(data, today) {
  const d = data && typeof data === 'object' ? data : {};
  const ev = (Array.isArray(d.events) ? d.events : []).filter(e => e && typeof e === 'object' && !e.demo && typeof e.title === 'string' && DATE_RE.test(e.date || '') && occurs(e, today));
  const cc = {}; (Array.isArray(d.cats) ? d.cats : []).forEach(c => { if (c && typeof c.id === 'string' && /^#[0-9a-f]{6}$/i.test(c.color || '')) cc[c.id] = c.color; });   // цвет календаря — для виджета
  const list = ev.map(e => ({ id: String(e.id), t: wStr(e.title, 80) || '—', tm: wTm(e.time), tm2: wTm(e.time2), task: !!e.task, done: wDone(e, today), c: cc[e.cat] || '' }))
    .sort((a, b) => (a.tm || '99:99').localeCompare(b.tm || '99:99') || a.t.localeCompare(b.t));
  const hb = wHabs(d, today).map(h => ({ n: wStr(h.name, 40), e: wStr(h.emoji, 8), done: !!h.log[today] }));
  return { day: today, items: list.slice(0, 12), n: list.length, done: list.filter(x => x.done).length, habits: hb.slice(0, 12), hn: hb.length, hdone: hb.filter(x => x.done).length };
}
// Задачи для «Напоминаний» iPhone: разовые задачи с 14 дней назад до 90 вперёд (повторяющиеся — нет: у «Напоминаний» свои повторы)
function wTasks(data, today) {
  const d = data && typeof data === 'object' ? data : {}, lo = addD(today, -14), hi = addD(today, 90);
  return (Array.isArray(d.events) ? d.events : []).filter(e => e && typeof e === 'object' && e.task && !e.demo && !isRec(e) && typeof e.title === 'string' && DATE_RE.test(e.date || '') && e.date >= lo && e.date <= hi)
    .slice(0, 300).map(e => ({ id: String(e.id), t: wStr(e.title, 200) || '—', d: e.date, tm: wTm(e.time), done: !!e.done, p: ['urgent', 'high', 'mid', 'low'].includes(e.prio) ? e.prio : 'mid' }));
}
const wCat = (d, name) => { const cs = Array.isArray(d.cats) ? d.cats.filter(c => c && typeof c.id === 'string') : [], n = String(name || '').toLowerCase().trim();
  return ((n && cs.find(c => String(c.name || '').toLowerCase() === n)) || cs[0] || {}).id || ''; };
// Новая задача или событие — как aiEvent в js/assistant.js
function wEvent(d, it, today) {
  const date = DATE_RE.test(it.date || '') ? it.date : today, time = wTm(it.time), time2 = time && wTm(it.time2) && tmin(it.time2) > tmin(time) ? it.time2 : '';
  const r = it.repeat && typeof it.repeat === 'object' && ['daily', 'weekdays', 'weekly', 'monthly', 'yearly'].includes(it.repeat.type) ? it.repeat : null;
  const repeat = r ? { type: r.type, days: r.type === 'weekly' ? (Array.isArray(r.days) && r.days.length ? r.days.filter(x => Number.isInteger(x) && x >= 0 && x < 7) : [dowOf(date)]) : [],
    ...(DATE_RE.test(r.until || '') && r.until >= date ? { until: r.until } : {}), ...(r.type === 'weekly' && r.every === 2 ? { every: 2 } : {}) } : { type: 'none' };
  const offs = time && Array.isArray(it.remind) ? it.remind.filter(x => Number.isInteger(x) && x >= 0 && x <= 40320).slice(0, 5) : [];
  return { id: wUid(), done: false, doneDates: [], skip: [], title: wStr(it.title, 200), date, time, time2, cat: wCat(d, it.cat), note: wStr(it.note, 1000), loc: wStr(it.loc, 200), repeat,
    reminder: offs.length ? { enabled: true, offsets: offs, offset: Math.min(...offs), repeat: 'none', days: [] } : { enabled: false, offset: 15, repeat: 'none', days: [] },
    task: it.type === 'task' || (it.type === 'event' && !time), prio: ['urgent', 'high', 'mid', 'low'].includes(it.prio) ? it.prio : 'mid' };
}
const W_FG = { expense: ['sub', 'reg', 'exp', 'debt'], income: ['inc'], saving: ['sav'] };
function wFinCat(d, it) {
  const cs = d.fin && Array.isArray(d.fin.cats) ? d.fin.cats.filter(c => c && typeof c.id === 'string') : [], gs = W_FG[it.type], n = String(it.category || '').toLowerCase().trim();
  const hit = n && cs.find(c => gs.includes(c.g) && String(c.name || '').toLowerCase() === n);
  return (hit || (it.type === 'expense' ? cs.find(c => c.g === 'exp' && c.name === 'Прочее') || cs.find(c => c.g === 'exp') : it.type === 'income' ? cs.find(c => c.g === 'inc' && c.name === 'Прочие доходы') || cs.find(c => c.g === 'inc') : cs.find(c => c.g === 'sav')) || cs[0] || {}).id || '';
}
// Записи помощника → в S (меняет data). Что не умеем без приложения (цели, планы, привычки, расписание, правки) — пропускаем с причиной
function wApply(data, items, today) {
  const d = data, out = [];
  for (const it of (Array.isArray(items) ? items : []).slice(0, 10)) {
    if (!it || typeof it !== 'object') continue;
    const t = it.type;
    if (!W_TYPES.includes(t)) { out.push({ type: t, t: wStr(it.title || it.text || '', 80), ok: false, why: 'это — в приложении' }); continue; }
    if (t === 'task' || t === 'event') { if (!wStr(it.title, 200)) continue; const e = wEvent(d, it, today); wArr(d, 'events').push(e); out.push({ type: t, t: e.title, ok: true, d: e.date, tm: e.time, rem: e.reminder.enabled ? e.reminder.offsets : [] }); }
    else if (W_FG[t]) { const amt = Math.round(Number(it.amount) * 100) / 100; if (!(amt > 0 && amt < 1e9)) continue;
      if (!d.fin || typeof d.fin !== 'object') d.fin = {}; const o = { id: 'o' + wUid(), amt, cat: wFinCat(d, it), note: wStr(it.note, 200), date: DATE_RE.test(it.date || '') && it.date <= today ? it.date : today };
      wArr(d.fin, 'ops').push(o); out.push({ type: t, t: o.note || (t === 'income' ? 'Доход' : t === 'saving' ? 'Накопление' : 'Трата'), ok: true, amt }); }
    else if (t === 'note') { const x = wStr(it.text, 2000); if (!x) continue; wArr(d, 'notes').push({ id: 'n' + wUid(), date: today, text: x }); out.push({ type: t, t: x.slice(0, 80), ok: true }); }
    else if (t === 'check') { const n = String(it.habit || '').toLowerCase().trim(), hs = wHabs(d, today), h = n && (hs.find(x => x.name.toLowerCase() === n) || hs.find(x => x.name.toLowerCase().startsWith(n) || n.startsWith(x.name.toLowerCase())));
      if (!h) { out.push({ type: t, t: wStr(it.habit, 60), ok: false, why: 'такой привычки на сегодня нет' }); continue; }
      if (h.log[today]) { out.push({ type: t, t: h.name, ok: false, why: 'уже отмечена' }); continue; }
      h.log[today] = 1; out.push({ type: t, t: h.name, ok: true }); }
  }
  return out;
}
// Из «Напоминаний» iPhone: отметки (done: [{ id, v }]) и новые задачи (add: [{ k, t, d, tm }]) → в S; ответ — id новых по ключам k
function wSyncApply(data, body, today) {
  const d = data, evs = wArr(d, 'events'), res = { done: 0, add: {} };
  for (const x of (Array.isArray(body.done) ? body.done : []).slice(0, 300)) {
    const e = x && evs.find(e => e && String(e.id) === String(x.id) && e.task && !isRec(e)); if (!e || !!e.done === !!x.v) continue;
    e.done = !!x.v; res.done++;
  }
  for (const x of (Array.isArray(body.add) ? body.add : []).slice(0, 50)) {
    const t = x && wStr(x.t, 200), k = x && wStr(String(x.k || ''), 120); if (!t || !k) continue;
    const e = wEvent(d, { type: 'task', title: t, date: DATE_RE.test(x.d || '') ? x.d : today, time: wTm(x.tm), prio: 'mid' }, today);
    if (x.v) e.done = true; evs.push(e); res.add[k] = String(e.id);
  }
  return res;
}
// ==== CORE end ====

const env = k => Deno.env.get(k) || '';
const sb = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
const ORIGINS = ['https://app.parsimony.ru', 'https://beta.parsimony.ru'];
const MAX_BYTES = 3 * 1024 * 1024, HITS = new Map();
async function hostOk(h) {
  const R = (globalThis.Deno && Deno.resolveDns) ? Deno.resolveDns : null; if (!R) return true;   // среда не умеет спрашивать DNS — хватит https на 443
  for (const t of ['A', 'AAAA']) { try { const l = await R(h, t); if (l.some(privIp)) return false; } catch (e) { /* нет записей этого типа */ } }
  return true;
}
async function fetchFeed(url) {
  let u = url;
  for (let i = 0; i < 4; i++) {
    if (!(await hostOk(new URL(u).hostname))) return { error: 'url' };
    const r = await fetch(u, { redirect: 'manual', headers: { Accept: 'text/calendar, text/plain;q=0.8, */*;q=0.5', 'User-Agent': 'Parsimony-Calendar/1.0 (+https://parsimony.ru)' }, signal: AbortSignal.timeout(12000) });
    if (r.status >= 300 && r.status < 400) {
      const loc = r.headers.get('location'); try { await r.body?.cancel(); } catch (e) {}
      let nx = null; try { nx = loc ? feedUrl(new URL(loc, u).toString()) : null; } catch (e) {}
      if (!nx) return { error: 'url' }; u = nx; continue;
    }
    if (r.status === 404 || r.status === 410) return { error: 'gone' };
    if (r.status === 401 || r.status === 403) return { error: 'denied' };
    if (!r.ok || !r.body) return { error: 'http', code: r.status };
    if (+(r.headers.get('content-length') || 0) > MAX_BYTES) { try { await r.body.cancel(); } catch (e) {} return { error: 'big' }; }
    const rd = r.body.getReader(), parts = []; let n = 0;
    for (;;) { const { done, value } = await rd.read(); if (done) break; n += value.length; if (n > MAX_BYTES) { try { await rd.cancel(); } catch (e) {} return { error: 'big' }; } parts.push(value); }
    const buf = new Uint8Array(n); let o = 0; for (const p of parts) { buf.set(p, o); o += p.length; }
    const text = new TextDecoder().decode(buf);
    if (!/BEGIN:VCALENDAR/i.test(text.slice(0, 4000))) return { error: 'notics' };
    return { text };
  }
  return { error: 'url' };
}

// ---- Виджет: ключ → человек; запись — с проверкой rev, не совпало — заново (до 4 раз) ----
const W_HITS = new Map();
async function wUser(k) { if (!/^[a-f0-9]{48}$/.test(k || '')) return null; const { data } = await sb.from('widget_keys').select('user_id').eq('token', k).maybeSingle(); return data ? data.user_id : null; }
async function wRead(uid) { const { data } = await sb.from('user_data').select('data, rev').eq('user_id', uid).maybeSingle(); return data; }
async function wWrite(uid, fn) {
  for (let i = 0; i < 4; i++) {
    const row = await wRead(uid); if (!row || !row.data || typeof row.data !== 'object') return { error: 'nodata' };
    const data = structuredClone(row.data), r = fn(data);
    if (!r || r.none) return r || {};
    const { data: up, error } = await sb.from('user_data').update({ data }).eq('user_id', uid).eq('rev', row.rev).select('rev');
    if (!error && up && up.length) return r;
  }
  return { error: 'busy' };
}
const wTz = d => { const tz = d && d.settings && d.settings.tz; return tzOk(tz) ? tz : 'Europe/Moscow'; };
const b64u = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64s = s => b64u(new TextEncoder().encode(s));
// Короткий токен входа от имени человека (2 минуты) — только чтобы функция assistant посчитала лимит и разобрала текст как обычно
async function wJwt(uid) {
  const n = Math.floor(Date.now() / 1000), h = b64s(JSON.stringify({ alg: 'HS256', typ: 'JWT' })), p = b64s(JSON.stringify({ sub: uid, role: 'authenticated', aud: 'authenticated', iat: n, exp: n + 120 }));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env('JWT_SECRET')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return h + '.' + p + '.' + b64u(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(h + '.' + p)));
}
// Запрос к функции assistant от имени человека (коротким токеном) — лимит и разбор как в приложении
async function wAsk(uid, payload) {
  const r = await fetch(env('SUPABASE_URL') + '/functions/v1/assistant', { method: 'POST', signal: AbortSignal.timeout(80000),
    headers: { Authorization: 'Bearer ' + await wJwt(uid), apikey: env('SUPABASE_ANON_KEY'), 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  return await r.json();
}
async function widget(req, body, json) {
  const uid = await wUser(body.w); if (!uid) return json({ error: 'key' }, 401);
  const now = Date.now(), hits = (W_HITS.get(uid) || []).filter(x => now - x < 3600e3);
  if (hits.length >= 240) return json({ error: 'limit' }, 429); hits.push(now); W_HITS.set(uid, hits);
  const row = await wRead(uid); if (!row || !row.data) return json({ error: 'nodata' }, 404);
  const tz = wTz(row.data), today = dayIn(now, tz);
  if (body.op === 'sum') return json(wSummary(row.data, today));
  if (body.op === 'tasks') return json({ day: today, tasks: wTasks(row.data, today) });
  if (body.op === 'sync') {
    const r = await wWrite(uid, d => { const x = wSyncApply(d, body, today); return x.done || Object.keys(x.add).length ? x : { none: 1, ...x }; });
    if (r.error) return json(r, 409);
    const after = await wRead(uid);
    return json({ day: today, done: r.done || 0, add: r.add || {}, tasks: wTasks(after && after.data, today) });
  }
  // Сказанное → помощник → записи. vt — подпись распознанного голоса (op hear): такое сообщение второй раз в лимит не считается
  const say = async (text, vt) => {
    const d = row.data, P = d.settings && d.settings.phr || {}, p = partsIn(now, tz);
    const ctx = { today, now: fmtMin(p.h * 60 + p.mi), tz, cats: (Array.isArray(d.cats) ? d.cats : []).map(c => wStr(c && c.name, 40)).filter(Boolean).slice(0, 20),
      fin: (d.fin && Array.isArray(d.fin.cats) ? d.fin.cats : []).map(c => ({ n: wStr(c && c.name, 40), g: c && c.g })).slice(0, 60),
      habits: wHabs(d, today).map(h => wStr(h.name, 60)).slice(0, 40), goals: (Array.isArray(d.goals) ? d.goals : []).filter(g => g && !g.done).map(g => wStr(g.title, 80)).slice(0, 20),
      taunts: P.taunts !== false, praise: P.praise !== false };
    let j;
    try { j = await wAsk(uid, { mode: 'chat', text: vt ? text : 'Сказано голосом в виджет на iPhone: ' + text, ...(vt ? { vt } : {}), ask: false, edit: false, history: [], ctx, tone: P.taunts === false ? 'soft' : 'sharp', lang: d.settings && d.settings.lang === 'en' ? 'en' : 'ru' }); }
    catch (e) { return { e: json({ error: 'ai' }, 502) }; }
    if (!j || j.error) return { e: json({ error: j && j.error === 'limit' ? 'ailimit' : 'ai' }, j && j.error === 'limit' ? 429 : 502) };
    const items = Array.isArray(j.items) ? j.items : [];
    const r = items.length ? await wWrite(uid, dd => { const res = wApply(dd, items, today); return res.some(x => x.ok) ? { res } : { none: 1, res }; }) : { res: [] };
    if (r.error) return { e: json(r, 409) };
    return { reply: wStr(String(j.reply || ''), 600), res: r.res || [], left: j.left };
  };
  if (body.op === 'say') {
    const text = wStr(body.text, 1000); if (!text) return json({ error: 'empty' }, 400);
    const o = await say(text, ''); return o.e || json(o);
  }
  // Голос записан на странице виджета (своя запись вместо окна «Dictation», 25 ноября 2026): распознаёт функция assistant (mode stt) — как голос в чате
  if (body.op === 'hear') {
    const audio = typeof body.audio === 'string' && body.audio.length < 4.2e6 && /^data:audio\/[a-z0-9.+-]+;base64,/.test(body.audio) ? body.audio : '';
    if (!audio) return json({ error: 'audio' }, 400);
    let s; try { s = await wAsk(uid, { mode: 'stt', text: '', audio }); } catch (e) { return json({ error: 'ai' }, 502); }
    if (!s || s.error) return json({ error: s && s.error === 'limit' ? 'ailimit' : s && s.error === 'audio' ? 'audio' : 'ai' }, s && s.error === 'limit' ? 429 : 502);
    const heard = wStr(String(s.text || ''), 1000); if (!heard) return json({ heard: '', res: [], reply: '', left: s.left });
    const o = await say(heard, typeof s.vt === 'string' ? s.vt : ''); return o.e || json({ heard, ...o });
  }
  return json({ error: 'op' }, 400);
}

Deno.serve(async req => {
  const o = req.headers.get('Origin') || '', cors = ORIGINS.includes(o)
    ? { 'Access-Control-Allow-Origin': o, 'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin' } : { Vary: 'Origin' };
  const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  // 1. Своя ссылка-подписка: ключ — 48 знаков, без входа (её открывают серверы Google и Apple)
  if (req.method === 'GET' && new URL(req.url).searchParams.get('w')) return widget(req, { w: new URL(req.url).searchParams.get('w'), op: 'sum' }, json);
  if (req.method === 'GET' || req.method === 'HEAD') {
    const t = new URL(req.url).searchParams.get('t') || '', nf = () => new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain', 'X-Robots-Tag': 'noindex' } });
    if (!/^[a-f0-9]{48}$/.test(t)) return nf();
    const { data: f } = await sb.from('cal_feeds').select('user_id').eq('token', t).maybeSingle(); if (!f) return nf();
    const { data: row } = await sb.from('user_data').select('data').eq('user_id', f.user_id).maybeSingle();
    const body = feedIcs(row && row.data, Date.now());
    return new Response(req.method === 'HEAD' ? null : body, { status: 200, headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'private, max-age=900',
      'Content-Disposition': 'inline; filename="parsimony.ics"', 'X-Robots-Tag': 'noindex' } });
  }
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  let body = null; try { body = await req.json(); } catch (e) { return json({ error: 'bad' }, 400); }
  if (body && typeof body === 'object' && typeof body.w === 'string') return widget(req, body, json);   // виджет iPhone: по ключу, без входа
  // 2. Чужой календарь — только вошедшему, не чаще 40 раз в час
  const tok = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: ud, error } = tok ? await sb.auth.getUser(tok) : { data: null, error: true };
  if (error || !ud || !ud.user) return json({ error: 'auth' }, 401);
  const uid = ud.user.id, now = Date.now(), h = (HITS.get(uid) || []).filter(x => now - x < 3600e3);
  if (h.length >= 40) return json({ error: 'limit' }, 429); h.push(now); HITS.set(uid, h);
  const url = feedUrl(body && body.url); if (!url) return json({ error: 'url' }, 400);
  const tz = tzOk(body.tz) ? body.tz : 'Europe/Moscow';
  let r; try { r = await fetchFeed(url); } catch (e) { return json({ error: 'net' }, 502); }
  if (r.error) return json(r, r.error === 'url' ? 400 : 502);
  const p = parseIcs(r.text, tz, dayIn(now, tz));
  return json({ name: p.name, events: p.events });
});
