// @ts-nocheck — файл на простом JS
// Edge Function assistant — ИИ-помощник (16 октября 2026).
// Копия кода из панели Supabase (Edge Functions → assistant → Code). Публикуется кнопкой «Deploy» там же.
// Секретов в файле нет: ключ нейросети и служебные ключи Supabase берутся из переменных окружения функции
// (Edge Functions → Secrets): AI_PROVIDER (пока «deepseek»), DEEPSEEK_API_KEY, по желанию AI_MODEL и AI_DAILY_LIMIT.
//
// Что делает: приложение присылает сообщение пользователя («завтра в 10 врач, кофе 350, каждый день вода…»)
// и короткий контекст (сегодняшняя дата, часовой пояс, названия календарей, категорий трат, привычек и целей).
// Нейросеть раскладывает сообщение на записи; функция проверяет их и возвращает приложению.
// Само приложение ничего не добавляет без подтверждения: человек видит список и нажимает «Добавить».
// Записи из приложения (события, траты, заметки) сюда не отправляются; тексты сообщений не сохраняются.
//
// В настройках функции «Verify JWT» выключен (как у reminders): токены входа проекта — ES256, доступ проверяется здесь через auth.getUser.
import { createClient } from "npm:@supabase/supabase-js@2";

const env = k => (Deno.env.get(k) ?? '').trim();
const PROVIDER = env('AI_PROVIDER') || 'deepseek';
const MODEL = env('AI_MODEL') || (PROVIDER === 'deepseek' ? 'deepseek-chat' : '');
const DAILY = Math.max(1, Number(env('AI_DAILY_LIMIT')) || 30);   // запросов на человека в сутки
const MAX_TEXT = 2000, MAX_ITEMS = 40;

const sb = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// ---- Проверка того, что пришло от приложения и от нейросети: только известные поля, строки обрезаются, даты и время — настоящие ----
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/, TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const str = (v, n) => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n) : '';
const date = v => { if (typeof v !== 'string' || !DATE_RE.test(v)) return null; const d = new Date(v + 'T00:00:00Z'); return isNaN(d) || d.toISOString().slice(0, 10) !== v ? null : v; };
const time = v => typeof v === 'string' && TIME_RE.test(v) ? v : null;
const list = (v, n, len) => Array.isArray(v) ? v.map(x => str(x, len)).filter(Boolean).slice(0, n) : [];
const days = v => Array.isArray(v) ? [...new Set(v.map(Number).filter(d => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : [];
const PRIOS = ['urgent', 'high', 'mid', 'low'], REPEATS = ['daily', 'weekdays', 'weekly', 'monthly', 'yearly'], KINDS = ['daily', 'weekly', 'monthly'];
function cleanItem(it) {
  if (!it || typeof it !== 'object') return null;
  const t = it.type;
  if (t === 'task' || t === 'event') {
    const title = str(it.title, 200); if (!title) return null;
    const r = it.repeat && typeof it.repeat === 'object' && REPEATS.includes(it.repeat.type) ? { type: it.repeat.type, days: days(it.repeat.days), until: date(it.repeat.until) } : null;
    const remind = Array.isArray(it.remind) ? [...new Set(it.remind.map(Number).filter(m => Number.isInteger(m) && m >= 0 && m <= 10080))].sort((a, b) => b - a).slice(0, 5) : [];
    return { type: t, title, date: date(it.date), time: time(it.time), time2: time(it.time2), prio: PRIOS.includes(it.prio) ? it.prio : 'mid', cat: str(it.cat, 60) || null, repeat: r, remind, loc: str(it.loc, 120) };
  }
  if (t === 'habit') { const title = str(it.title, 120); if (!title) return null;
    return { type: t, title, emoji: str(it.emoji, 8), kind: KINDS.includes(it.kind) ? it.kind : 'daily', days: days(it.days) }; }
  if (t === 'expense' || t === 'income' || t === 'saving') { const amount = Math.round(Number(it.amount) * 100) / 100;
    if (!(amount > 0 && amount < 1e9)) return null;
    return { type: t, amount, category: str(it.category, 60) || null, note: str(it.note, 120), date: date(it.date) }; }
  if (t === 'goal') { const title = str(it.title, 200); if (!title) return null;
    const steps = Array.isArray(it.steps) ? it.steps.slice(0, 20).map(s => ({ title: str(s && s.title, 200), date: date(s && s.date) })).filter(s => s.title) : [];
    return { type: t, title, emoji: str(it.emoji, 8), due: date(it.due), steps }; }
  if (t === 'note') { const text = str(it.text, 2000); return text ? { type: t, text } : null; }
  return null;
}

// ---- Что знает нейросеть ----
const SYSTEM = `Ты — помощник в приложении-планере Parsimony. Пользователь пишет одним сообщением (часто голосом, без знаков препинания) про свои дела, встречи, привычки, цели, траты и мысли. Разложи сообщение на записи для приложения и верни ТОЛЬКО JSON-объект вида:
{"reply": "...", "items": [...]}

reply — одна короткая фраза по-русски: что ты понял. Если что-то важное непонятно — задай вопрос в reply (items тогда может быть пустым).

Виды записей (поле type):
1. "task" — дело, которое отмечают как сделанное: {"type":"task","title":"...","date":"ГГГГ-ММ-ДД" или null,"time":"ЧЧ:ММ" или null,"time2":"ЧЧ:ММ" или null,"prio":"urgent"|"high"|"mid"|"low","cat":"название календаря из списка" или null,"repeat":ПОВТОР или null,"remind":[минуты до начала] или null,"loc":"место" или null}
2. "event" — встреча или событие в календаре: те же поля, что у task.
3. "habit" — регулярная привычка («каждый день», «по утрам», «по понедельникам», «раз в неделю»): {"type":"habit","title":"...","emoji":"один эмодзи","kind":"daily"|"weekly"|"monthly","days":[номера дней недели] или []}. kind "daily" с пустым days — каждый день; с days — только в эти дни. "weekly" — один раз за неделю в любой день, "monthly" — раз в месяц.
4. "expense" — трата, "income" — доход, "saving" — отложил в накопления: {"type":"expense","amount":число в рублях,"category":"категория из списка" или null,"note":"на что, коротко","date":"ГГГГ-ММ-ДД"}
5. "goal" — большая цель со сроком: {"type":"goal","title":"...","emoji":"один эмодзи","due":"ГГГГ-ММ-ДД","steps":[{"title":"...","date":"ГГГГ-ММ-ДД" или null}]}
6. "note" — мысль, идея, вывод дня: {"type":"note","text":"..."}

ПОВТОР: {"type":"daily"|"weekdays"|"weekly"|"monthly"|"yearly","days":[номера дней для weekly],"until":"ГГГГ-ММ-ДД" или null}. «По будням» — weekdays.
Номера дней недели: 0 — понедельник, 1 — вторник, 2 — среда, 3 — четверг, 4 — пятница, 5 — суббота, 6 — воскресенье.

Правила:
- Даты считай от сегодняшней (она дана в сообщении). «Завтра», «в пятницу» — ближайшая пятница, «через неделю», «12 ноября». Дело без даты — сегодня; трата без даты — сегодня.
- Есть время → "event"; дело, которое надо выполнить к сроку («позвонить маме в 18», «сдать отчёт в пятницу») → "task" (время тоже можно указать). «Работа с 8 до 16 по будням» → event, repeat weekdays, time 08:00, time2 16:00.
- «!» или «важно» → prio "high", «срочно» или «!!» → "urgent". По умолчанию "mid".
- cat и category — только из списков в сообщении, точно как там написано. Если ничего не подходит — null.
- «Напомни за час» → remind [60]; «за день и за 15 минут» → [1440, 15].
- Суммы: «1,5к» = 1500, «2 тыщи» = 2000, «350 рублей» = 350.
- Цель «до лета» — due 1 июня, «до конца года» — 31 декабря; шаги цели — только если пользователь их назвал.
- Если такая привычка уже есть в списке привычек — не добавляй её повторно и скажи об этом в reply.
- Не выдумывай того, чего нет в сообщении. Одно дело — одна запись. Названия короткие, с большой буквы, без даты и времени внутри.
- Отвечай только JSON, без пояснений вокруг.`;

const DOWF = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
function userMessage(text, c) {
  const today = date(c.today) || new Date().toISOString().slice(0, 10), dow = DOWF[(new Date(today + 'T00:00:00Z').getUTCDay() + 6) % 7];
  const fin = Array.isArray(c.fin) ? c.fin.slice(0, 60) : [], f = g => fin.filter(x => x && x.g === g).map(x => str(x.n, 40)).filter(Boolean).join(', ') || '—';
  return [`Сегодня: ${today}, ${dow}${time(c.now) ? ', сейчас ' + c.now : ''}${str(c.tz, 40) ? ' (часовой пояс ' + str(c.tz, 40) + ')' : ''}.`,
    `Календари: ${list(c.cats, 20, 40).join(', ') || '—'}.`,
    `Категории трат: ${[f('exp'), f('sub'), f('reg'), f('debt')].filter(x => x !== '—').join(', ') || '—'}. Категории доходов: ${f('inc')}. Накопления: ${f('sav')}.`,
    `Привычки: ${list(c.habits, 40, 60).join(', ') || '—'}.`,
    `Цели: ${list(c.goals, 20, 80).join(', ') || '—'}.`,
    '', 'Сообщение пользователя:', '"""', text, '"""'].join('\n');
}

// ---- Нейросеть. Сейчас DeepSeek; позже сюда добавится Anthropic (Claude) — выбор переменной AI_PROVIDER ----
async function askModel(system, user) {
  if (PROVIDER === 'deepseek') {
    const key = env('DEEPSEEK_API_KEY'); if (!key) return { error: 'off' };
    const r = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST', signal: AbortSignal.timeout(45000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: MODEL, temperature: 0.2, max_tokens: 3000, response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
    });
    if (!r.ok) { console.error('deepseek', r.status, (await r.text()).slice(0, 300)); return { error: 'model', code: r.status }; }   // 401 — ключ, 402 — баланс, 429 — перегрузка
    const j = await r.json();
    return { text: j && j.choices && j.choices[0] && j.choices[0].message ? j.choices[0].message.content : '' };
  }
  return { error: 'off' };
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  try {
    const tok = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!tok || tok.startsWith('sb_')) return json({ error: 'forbidden' }, 403);
    const { data: u, error: ue } = await sb.auth.getUser(tok);
    if (ue || !u || !u.user) return json({ error: 'forbidden' }, 403);
    const body = await req.json().catch(() => null);
    const text = body && typeof body.text === 'string' ? body.text.trim().slice(0, MAX_TEXT) : '';
    if (!text) return json({ error: 'empty' }, 400);
    const ctx = body.ctx && typeof body.ctx === 'object' ? body.ctx : {};
    // Лимит на человека в сутки (по UTC); счётчик — в ai_usage (supabase/sql/assistant.sql)
    const day = new Date().toISOString().slice(0, 10);
    const { data: n, error: le } = await sb.rpc('ai_use', { p_user: u.user.id, p_day: day });
    if (le) throw le;
    if (n > DAILY) return json({ error: 'limit', limit: DAILY }, 429);
    if (n === 1) await sb.from('ai_usage').delete().lt('day', new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10));
    const m = await askModel(SYSTEM, userMessage(text, ctx));
    if (m.error) return json({ error: m.error, code: m.code || 0 }, m.error === 'off' ? 503 : 502);
    let out; try { out = JSON.parse(m.text); } catch { return json({ error: 'parse' }, 502); }
    const items = (Array.isArray(out && out.items) ? out.items : []).slice(0, MAX_ITEMS).map(cleanItem).filter(Boolean);
    return json({ reply: str(out && out.reply, 400), items, left: Math.max(0, DAILY - n) });
  } catch (e) {
    console.error(e && e.message ? e.message : e);
    return json({ error: 'server' }, 500);
  }
});
