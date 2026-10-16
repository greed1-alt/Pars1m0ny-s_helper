// @ts-nocheck — файл на простом JS
// Edge Function assistant — ИИ-помощник (16 октября 2026).
// Копия кода из панели Supabase (Edge Functions → assistant → Code). Публикуется кнопкой «Deploy» там же.
// Секретов в файле нет: ключ нейросети и служебные ключи Supabase берутся из переменных окружения функции
// (Edge Functions → Secrets): AI_PROVIDER — «gigachat» (с 17 октября 2026; ключ GIGACHAT_AUTH_KEY) или «deepseek» (DEEPSEEK_API_KEY),
// по желанию AI_MODEL и AI_DAILY_LIMIT.
//
// Что делает (с 17 октября 2026 — чат): приложение присылает сообщение пользователя, несколько последних реплик разговора
// и короткий контекст (дата, часовой пояс, названия календарей, категорий трат, привычек и целей, включены ли подначки).
// Когда человек о чём-то спрашивает («что у меня завтра?», «сколько потратил на кафе?») — ещё короткую сводку записей:
// дела на 2 недели, траты месяца по категориям, цели и привычки, без заметок, мест и самочувствия (решение пользователя).
// Нейросеть отвечает в чате, раскладывает сообщение на записи и может дать кнопки перехода по приложению;
// функция всё проверяет и возвращает приложению. Без подтверждения человека приложение ничего не добавляет.
// mode «hello» — приветствие при первом открытии чата за день: подначка или похвала по сводке.
// mode «tts» — живой голос ответа (SaluteSpeech Сбера или Яндекс SpeechKit — какой ключ задан): озвучивается только ответ
// самого помощника — у него подпись say (HMAC от служебного ключа), чужой текст функция не озвучит.
// С 17 октября 2026 записи приложение добавляет сразу, без подтверждения; у каждой в ответе — «Отменить».
// Тексты сообщений и сводки нигде не сохраняются и в журнал не пишутся.
//
// В настройках функции «Verify JWT» выключен (как у reminders): токены входа проекта — ES256, доступ проверяется здесь через auth.getUser.
import { createClient } from "npm:@supabase/supabase-js@2";

const env = k => (Deno.env.get(k) ?? '').trim().replace(/^["']|["']$/g, '').trim();   // лишние кавычки и пробелы при вставке ключа не мешают
const PROVIDER = env('AI_PROVIDER') || 'deepseek';
const MODEL = env('AI_MODEL') || ({ deepseek: 'deepseek-chat', gigachat: 'GigaChat-2-Pro' })[PROVIDER] || '';
const DAILY = Math.max(1, Number(env('AI_DAILY_LIMIT')) || 30);   // запросов на человека в сутки
// Вопросы и приветствие — моделью Lite (бесплатный запас 250 млн токенов в год), записи — основной (Pro, 40 млн)
const LITE = env('AI_MODEL_LITE') || (PROVIDER === 'gigachat' ? 'GigaChat-2' : MODEL);
const MAX_TEXT = 2000, MAX_ITEMS = 40, MAX_DATA = 6000, MAX_HIST = 8;
// Куда помощник может отправить кнопкой (ключи знает приложение, js/assistant.js → AI_NAV)
const NAV = ['home', 'cal', 'tasks', 'goals', 'habits', 'fin', 'budget', 'missed', 'profile', 'settings', 'set_look', 'set_cal', 'set_cats', 'set_layout', 'sections', 'set_notif', 'set_data', 'tour', 'feedback'];

const sb = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// ---- Проверка того, что пришло от приложения и от нейросети: только известные поля, строки обрезаются, даты и время — настоящие ----
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/, TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const str = (v, n) => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n) : '';
const date = v => { if (typeof v !== 'string' || !DATE_RE.test(v)) return null; const d = new Date(v + 'T00:00:00Z'); return isNaN(d) || d.toISOString().slice(0, 10) !== v ? null : v; };
const time = v => typeof v === 'string' && TIME_RE.test(v) ? v : null;
const block = (v, n) => typeof v === 'string' ? v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, n) : '';   // как str, но строки сохраняются
const cleanNav = v => Array.isArray(v) ? v.filter(x => x && NAV.includes(x.to)).slice(0, 3).map(x => ({ to: x.to, label: str(x.label, 40) })) : [];
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
  if (t === 'check') { const habit = str(it.habit || it.title, 120); return habit ? { type: t, habit, date: date(it.date) } : null; }   // отметить привычку выполненной
  return null;
}

// ---- Что знает нейросеть ----
const SYSTEM = `Ты — Parsimony, помощник в приложении-планере Parsimony, и общаешься с пользователем в чате. Пиши по-русски, на «вы», коротко и по делу, дружелюбно и с лёгкой иронией. Пользователь часто пишет голосом, без знаков препинания.
Верни ТОЛЬКО JSON-объект вида:
{"reply": "...", "items": [...], "nav": [...], "fix": false}

reply — твой ответ в чате: до 5 коротких предложений; перечисления — отдельными строками, каждая начинается с «• ». Без markdown: никаких **, #, таблиц.
items — записи для приложения, если пользователь рассказывает о делах, встречах, привычках, целях, тратах или мыслях. Приложение добавляет их сразу, а пользователь может отменить любую, поэтому в reply коротко скажи, что сделал: «Добавил врача на завтра в 10:00 и трату 350 ₽», «Отметил зарядку». Если пользователь только спрашивает или болтает — items пустой. Если что-то важное непонятно — не добавляй, а спроси в reply.
fix — true, только если пользователь исправляет записи из твоего предыдущего ответа («нет, в 11», «не врач, а стоматолог», «не 350, а 450»): тогда в items верни только исправленные записи целиком, со всеми полями, — они заменят прошлые такие же (остальные прошлые записи останутся). Если пользователь просто добавляет ещё что-то — fix не ставь.
nav — до 2 кнопок перехода в нужное место приложения: [{"to":"ключ","label":"короткая подпись"}]. Ставь, когда спрашивают, где или как что-то сделать, или когда кнопка явно поможет. Ключи — только из списка «Места» ниже; иначе nav пустой.

Виды записей (поле type):
1. "task" — дело, которое отмечают как сделанное: {"type":"task","title":"...","date":"ГГГГ-ММ-ДД" или null,"time":"ЧЧ:ММ" или null,"time2":"ЧЧ:ММ" или null,"prio":"urgent"|"high"|"mid"|"low","cat":"название календаря из списка" или null,"repeat":ПОВТОР или null,"remind":[минуты до начала] или null,"loc":"место" или null}
2. "event" — встреча или событие в календаре: те же поля, что у task.
3. "habit" — регулярная привычка («каждый день», «по утрам», «по понедельникам», «раз в неделю»): {"type":"habit","title":"...","emoji":"один эмодзи","kind":"daily"|"weekly"|"monthly","days":[номера дней недели] или []}. kind "daily" с пустым days — каждый день; с days — только в эти дни. "weekly" — один раз за неделю в любой день, "monthly" — раз в месяц.
4. "expense" — трата, "income" — доход, "saving" — отложил в накопления: {"type":"expense","amount":число в рублях,"category":"категория из списка" или null,"note":"на что, коротко","date":"ГГГГ-ММ-ДД"}
5. "goal" — большая цель со сроком: {"type":"goal","title":"...","emoji":"один эмодзи","due":"ГГГГ-ММ-ДД","steps":[{"title":"...","date":"ГГГГ-ММ-ДД" или null}]}
6. "note" — мысль, идея, вывод дня: {"type":"note","text":"..."}
7. "check" — отметить, что привычка из списка привычек выполнена: {"type":"check","habit":"название точно из списка привычек","date":"ГГГГ-ММ-ДД" или null}. Когда пользователь говорит, что сделал привычку («выпил 2 литра воды», «сделал зарядку», «отметь чтение», «вчера бегал»). date — день, когда сделал (по умолчанию сегодня).

ПОВТОР: {"type":"daily"|"weekdays"|"weekly"|"monthly"|"yearly","days":[номера дней для weekly],"until":"ГГГГ-ММ-ДД" или null}. «По будням» — weekdays.
Номера дней недели: 0 — понедельник, 1 — вторник, 2 — среда, 3 — четверг, 4 — пятница, 5 — суббота, 6 — воскресенье.

Правила для записей:
- Даты бери из списка «Ближайшие дни» в сообщении, не высчитывай сам. «Завтра»; «в пятницу» — ближайшая пятница; «в выходные» — ближайшая суббота; «через неделю»; «12 ноября». Трата без даты — сегодня.
- Мелкое дело без даты — сегодня. Большой план без даты (поездка, отпуск, ремонт, крупная покупка) — не добавляй, а спроси в reply, когда.
- Есть время → "event"; дело, которое надо выполнить к сроку («позвонить маме в 18», «сдать отчёт в пятницу») → "task" (время тоже можно указать). «Работа с 8 до 16 по будням» → event, repeat weekdays, time 08:00, time2 16:00.
- «!» или «важно» → prio "high", «срочно» или «!!» → "urgent". По умолчанию "mid".
- cat и category — только из списков в сообщении, точно как там написано. Если ничего не подходит — null.
- «Напомни за час» → remind [60]; «за день и за 15 минут» → [1440, 15].
- Суммы: «1,5к» = 1500, «2 тыщи» = 2000, «350 рублей» = 350.
- Цель «до лета» — due 1 июня, «до конца года» — 31 декабря; шаги цели — только если пользователь их назвал.
- Если такая привычка уже есть в списке привычек — не добавляй её повторно; если пользователь говорит, что выполнил её, — это "check". Привычки, которой нет в списке, не отмечай: предложи создать её ("habit").
- Не выдумывай того, чего нет в сообщении. Одно дело — одна запись. Названия короткие, с большой буквы, без даты и времени внутри.
- Что было сделано в разговоре и что пользователь отменил, видно в «Недавнем разговоре» в квадратных скобках. Отменённое не добавляй снова, если об этом не просят.
- Менять, переносить, отмечать и удалять уже добавленные записи ты пока не умеешь: так и скажи и дай кнопку туда, где это сделать.

Вопросы о делах, деньгах, целях и привычках:
- Отвечай только по «Сводке записей» из сообщения; суммы, проценты и даты бери оттуда как есть, ничего не досчитывай и не выдумывай. Если сводки нет или нужного в ней нет — так и скажи.
- Подначки (если включены): когда человек затягивает — просроченные дела и шаги целей, низкий процент привычек, бюджет превышен, — добавь одну колкую фразу в стиле приложения: жёсткий сарказм без мата, про дело, а не про человека. Например: «„Потом“ — это не дата.», «Цель скучает. Вы, судя по всему, нет.» Не шути про здоровье, утраты и тяжёлые темы.
- Похвалы (если включены): заметил успех — коротко похвали.
- Не давай медицинских, юридических и инвестиционных советов — только общее. Никогда не проси пароли, коды и номера карт.
- Ты — помощник Parsimony. Не называй, на какой нейросети или модели ты работаешь; если спрашивают — ответь, что ты помощник Parsimony, а ответы готовит нейросеть на серверах в России.

Справка по приложению (для вопросов «где» и «как»):
- Главная: приветствие, кольцо «день выполнен на N%», строка ввода, «План на сегодня», привычки, деньги, самочувствие, цели, мысли дня. Порядок блоков — «Настроить Главную» внизу страницы.
- Строка ввода (на Главной, в Календаре и Задачах) понимает фразы: «завтра в 15 встреча», «кофе 350», «+ зарплата 60000», «каждый день вода», «заметка: …», «цель: … до лета». «!» — важно, «!!» — срочно, #тег — календарь. Этот чат открывается кнопкой «Помощник» в шапке и в строке ввода; на сообщение можно ответить голосом (микрофон), а ответ — прослушать.
- Календарь: Месяц, Неделя (на телефоне — День по часам), Лента. На телефоне Календарь и Задачи — одна вкладка «План»; вернуть две вкладки — Настройки → Расположение → Разделы и вкладки. Событие можно перетащить и растянуть. В карточке события — повтор, календарь, напоминания, место, заметка, «Поделиться».
- Задачи: на ПК «Фокус дня», вкладки «Все» и «Цели». Важность: срочно, высокая, средняя, низкая.
- Цели: срок, шаги (шаг со сроком — задача в календаре), темп, подначки и похвалы; свои фразы и выключатели подначек — внизу вкладки «Цели».
- Привычки: отметка одним нажатием (или скажите помощнику «сделал зарядку»), таблица месяца, процент за месяц, самочувствие, заметки. Отмечать задним числом — Настройки → Расположение → Разное.
- Финансы: Расход / Доход / Накопление, «Можно потратить сегодня» (бюджет трат минус уже потраченное, делённое на оставшиеся дни месяца), «Бюджет на месяц», свои категории.
- «Вы пропустили» — прошлые дела без галочки: «Перенести» или «Выполнено».
- Напоминания по времени: Настройки → Напоминания → «Включить» на каждом устройстве; там же утренняя и вечерняя сводки. На iPhone — только в приложении, установленном на экран «Домой». В карточке события можно выбрать несколько напоминаний: за день, за час, за 15 минут.
- Оформление: Настройки → Оформление — тема (светлая, тёмная, чёрная, авто), палитра, контраст, карточки, углы, цвет событий.
- Какие разделы показывать и в каком порядке — Настройки → Расположение; таймер включается там же.
- Аккаунт: синхронизация между устройствами идёт сама; копия в файл, загрузка из файла, выход, удаление — Настройки → Аккаунт и данные.
- Знак «?» рядом с непонятным — подсказка. Подробный тур — Настройки → О приложении → Знакомство с приложением. «Отменить» — в сообщении после действия или Ctrl+Z. На ПК меню команд — Ctrl+K.

Места (ключи для nav): home — Главная; cal — Календарь; tasks — Задачи; goals — Цели; habits — Привычки; fin — Финансы; budget — окно «Бюджет на месяц»; missed — окно «Вы пропустили»; profile — Профиль; settings — Настройки; set_look — Оформление; set_cal — настройки календаря; set_cats — Календари (категории); set_layout — Расположение; sections — Разделы и вкладки; set_notif — Напоминания; set_data — Аккаунт и данные; tour — Знакомство с приложением; feedback — Отзыв.

Отвечай только JSON, без пояснений вокруг.`;

// Приветствие при первом открытии чата за день
const HELLO = `Ты — Parsimony, помощник в приложении-планере Parsimony, с характером: жёсткий сарказм без мата, но ты на стороне пользователя. Он только что открыл чат. По сводке его записей напиши приветствие — 1–3 коротких предложения по-русски, на «вы», без списков и markdown:
- если подначки включены и есть просроченные дела или шаги целей (или привычки сильно проседают) — подколи, назвав конкретное дело или цель;
- если похвалы включены и сегодня что-то уже сделано или цель идёт с опережением — коротко похвали;
- подскажи одно главное дело на сегодня или спроси, что добавить.
Подначка — про дело, а не про человека; не шути про здоровье, утраты и тяжёлые темы. Примеры стиля: «„Потом“ — это не дата.», «Шаг сам себя не сделает. Удивительно, правда?», «Цель скучает. Вы, судя по всему, нет.», «Вы молодец — на шаг ближе к цели.»
Верни ТОЛЬКО JSON: {"reply":"..."}`;

const DOWF = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'], DOWS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
const dowOf = k => (new Date(k + 'T00:00:00Z').getUTCDay() + 6) % 7;
const plusDays = (k, n) => new Date(Date.parse(k + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
// Последние реплики разговора — чтобы понимать «а послезавтра?», «нет, в 11»
const histOf = v => Array.isArray(v) ? v.slice(-MAX_HIST).filter(m => m && (m.r === 'u' || m.r === 'a')).map(m => ({ r: m.r, t: str(m.t, 700) })).filter(m => m.t) : [];
function userMessage(text, c, extra) {
  const today = date(c.today) || new Date().toISOString().slice(0, 10), dow = DOWF[dowOf(today)];
  const fin = Array.isArray(c.fin) ? c.fin.slice(0, 60) : [], f = g => fin.filter(x => x && x.g === g).map(x => str(x.n, 40)).filter(Boolean).join(', ') || '—';
  // Нейросети плохо даётся счёт дней — даём готовый календарь на две недели
  const days = [...Array(14)].map((_, i) => { const k = plusDays(today, i); return `${DOWS[dowOf(k)]} ${k}${i === 0 ? ' (сегодня)' : i === 1 ? ' (завтра)' : ''}`; }).join(', ');
  const style = Array.isArray(c.style) ? c.style.slice(0, 8).map(x => x && str(x.t, 150) ? `«${str(x.t, 150)}» (${x.k === 'praise' ? 'похвала' : 'подначка'})` : '').filter(Boolean) : [];
  const L = [`Сегодня: ${today}, ${dow}${time(c.now) ? ', сейчас ' + c.now : ''}${str(c.tz, 40) ? ' (часовой пояс ' + str(c.tz, 40) + ')' : ''}.`,
    `Ближайшие дни: ${days}.`,
    `Календари: ${list(c.cats, 20, 40).join(', ') || '—'}.`,
    `Категории трат: ${[f('exp'), f('sub'), f('reg'), f('debt')].filter(x => x !== '—').join(', ') || '—'}. Категории доходов: ${f('inc')}. Накопления: ${f('sav')}.`,
    `Привычки: ${list(c.habits, 40, 60).join(', ') || '—'}.`,
    `Цели: ${list(c.goals, 20, 80).join(', ') || '—'}.`,
    `Подначки: ${c.taunts === false ? 'выключены' : 'включены'}. Похвалы: ${c.praise === false ? 'выключены' : 'включены'}.${style.length ? ' Свои фразы пользователя (для стиля): ' + style.join('; ') + '.' : ''}`];
  const data = block(c.data, MAX_DATA);
  if (data) L.push('', 'Сводка записей пользователя:', data);
  const h = extra && extra.history ? histOf(extra.history) : [];
  if (h.length) L.push('', 'Недавний разговор:', ...h.map(m => (m.r === 'u' ? 'Пользователь: ' : 'Помощник: ') + m.t));
  if (text) L.push('', 'Сообщение пользователя:', '"""', text, '"""');
  return L.join('\n');
}

// ---- Нейросеть: выбор переменной AI_PROVIDER — «gigachat» (Сбер, бесплатный режим для физлиц), «deepseek»; позже — Anthropic (Claude) ----
// Все ответы — { text } или { error: 'off' | 'model' | 'net', code }: 'model' — нейросеть отказала (code — её ответ: 401 ключ, 402 баланс, 429 перегрузка),
// 'net' — не удалось связаться (сеть, сертификат)
const jsonOf = s => { const t = String(s || '').replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  try { return JSON.parse(t); } catch {}
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch {} }
  return null; };

// GigaChat: ключ авторизации (Basic) → токен доступа на 30 минут → запрос. Серверы Сбера подписаны российским удостоверяющим центром
// Минцифры, которому серверы Supabase сами не доверяют, — поэтому корневой сертификат вложен сюда. Он открытый: скачан с gu-st.ru (Госуслуги)
// 17 октября 2026 и совпал с тем, что отдаёт сам Сбер; SHA-256 D2:6D:2D:02:31:B7:C3:9F:92:CC:73:85:12:BA:54:10:35:19:E4:40:5D:68:B5:BD:70:3E:97:88:CA:8E:CF:31, действует до 27.02.2032
const RU_ROOT_CA = `-----BEGIN CERTIFICATE-----
MIIFwjCCA6qgAwIBAgICEAAwDQYJKoZIhvcNAQELBQAwcDELMAkGA1UEBhMCUlUx
PzA9BgNVBAoMNlRoZSBNaW5pc3RyeSBvZiBEaWdpdGFsIERldmVsb3BtZW50IGFu
ZCBDb21tdW5pY2F0aW9uczEgMB4GA1UEAwwXUnVzc2lhbiBUcnVzdGVkIFJvb3Qg
Q0EwHhcNMjIwMzAxMjEwNDE1WhcNMzIwMjI3MjEwNDE1WjBwMQswCQYDVQQGEwJS
VTE/MD0GA1UECgw2VGhlIE1pbmlzdHJ5IG9mIERpZ2l0YWwgRGV2ZWxvcG1lbnQg
YW5kIENvbW11bmljYXRpb25zMSAwHgYDVQQDDBdSdXNzaWFuIFRydXN0ZWQgUm9v
dCBDQTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBAMfFOZ8pUAL3+r2n
qqE0Zp52selXsKGFYoG0GM5bwz1bSFtCt+AZQMhkWQheI3poZAToYJu69pHLKS6Q
XBiwBC1cvzYmUYKMYZC7jE5YhEU2bSL0mX7NaMxMDmH2/NwuOVRj8OImVa5s1F4U
zn4Kv3PFlDBjjSjXKVY9kmjUBsXQrIHeaqmUIsPIlNWUnimXS0I0abExqkbdrXbX
YwCOXhOO2pDUx3ckmJlCMUGacUTnylyQW2VsJIyIGA8V0xzdaeUXg0VZ6ZmNUr5Y
Ber/EAOLPb8NYpsAhJe2mXjMB/J9HNsoFMBFJ0lLOT/+dQvjbdRZoOT8eqJpWnVD
U+QL/qEZnz57N88OWM3rabJkRNdU/Z7x5SFIM9FrqtN8xewsiBWBI0K6XFuOBOTD
4V08o4TzJ8+Ccq5XlCUW2L48pZNCYuBDfBh7FxkB7qDgGDiaftEkZZfApRg2E+M9
G8wkNKTPLDc4wH0FDTijhgxR3Y4PiS1HL2Zhw7bD3CbslmEGgfnnZojNkJtcLeBH
BLa52/dSwNU4WWLubaYSiAmA9IUMX1/RpfpxOxd4Ykmhz97oFbUaDJFipIggx5sX
ePAlkTdWnv+RWBxlJwMQ25oEHmRguNYf4Zr/Rxr9cS93Y+mdXIZaBEE0KS2iLRqa
OiWBki9IMQU4phqPOBAaG7A+eP8PAgMBAAGjZjBkMB0GA1UdDgQWBBTh0YHlzlpf
BKrS6badZrHF+qwshzAfBgNVHSMEGDAWgBTh0YHlzlpfBKrS6badZrHF+qwshzAS
BgNVHRMBAf8ECDAGAQH/AgEEMA4GA1UdDwEB/wQEAwIBhjANBgkqhkiG9w0BAQsF
AAOCAgEAALIY1wkilt/urfEVM5vKzr6utOeDWCUczmWX/RX4ljpRdgF+5fAIS4vH
tmXkqpSCOVeWUrJV9QvZn6L227ZwuE15cWi8DCDal3Ue90WgAJJZMfTshN4OI8cq
W9E4EG9wglbEtMnObHlms8F3CHmrw3k6KmUkWGoa+/ENmcVl68u/cMRl1JbW2bM+
/3A+SAg2c6iPDlehczKx2oa95QW0SkPPWGuNA/CE8CpyANIhu9XFrj3RQ3EqeRcS
AQQod1RNuHpfETLU/A2gMmvn/w/sx7TB3W5BPs6rprOA37tutPq9u6FTZOcG1Oqj
C/B7yTqgI7rbyvox7DEXoX7rIiEqyNNUguTk/u3SZ4VXE2kmxdmSh3TQvybfbnXV
4JbCZVaqiZraqc7oZMnRoWrXRG3ztbnbes/9qhRGI7PqXqeKJBztxRTEVj8ONs1d
WN5szTwaPIvhkhO3CO5ErU2rVdUr89wKpNXbBODFKRtgxUT70YpmJ46VVaqdAhOZ
D9EUUn4YaeLaS8AjSF/h7UkjOibNc4qVDiPP+rkehFWM66PVnP1Msh93tc+taIfC
EYVMxjh8zNbFuoc7fzvvrFILLe7ifvEIUqSVIC/AzplM/Jxw7buXFeGP1qVCBEHq
391d/9RAfaZ12zkwFsl+IKwE/OZxW8AHa9i1p4GO0YSNuczzEm4=
-----END CERTIFICATE-----`;
let gcHttp = null, gcNode = false, gcTok = '', gcExp = 0;
// Запасной путь, если в среде нет Deno.createHttpClient: node:https со своим сертификатом
async function nodeFetch(url, o) {
  const https = await import('node:https');
  return await new Promise((res, rej) => {
    const rq = https.request(url, { method: o.method, headers: o.headers, ca: RU_ROOT_CA, timeout: 45000 }, rs => {
      const ch = []; rs.on('data', c => { ch.push(c); });
      rs.on('end', () => { const b = Buffer.concat(ch), d = b.toString('utf8');   // звук приходит двоичным — не склеиваем как текст
        res({ ok: rs.statusCode >= 200 && rs.statusCode < 300, status: rs.statusCode, text: async () => d, json: async () => JSON.parse(d), arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.length) }); }); });
    rq.on('error', rej); rq.on('timeout', () => rq.destroy(new Error('timeout')));
    if (o.body) rq.write(o.body); rq.end(); });
}
function gcFetch(url, o) {
  if (!gcNode) { try { gcHttp = gcHttp || Deno.createHttpClient({ caCerts: [RU_ROOT_CA] }); return fetch(url, { ...o, client: gcHttp, signal: AbortSignal.timeout(45000) }); } catch (e) { console.error('createHttpClient', e && e.message); gcNode = true; } }
  return nodeFetch(url, o);
}
async function gcToken(key, fresh) {
  if (!fresh && gcTok && Date.now() < gcExp - 60000) return { token: gcTok };
  const r = await gcFetch('https://ngw.devices.sberbank.ru:9443/api/v2/oauth', { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', RqUID: crypto.randomUUID(), Authorization: 'Basic ' + key },
    body: 'scope=' + encodeURIComponent(env('GIGACHAT_SCOPE') || 'GIGACHAT_API_PERS') });
  if (!r.ok) { console.error('gigachat oauth', r.status, (await r.text()).slice(0, 300)); return { error: 'model', code: r.status === 400 ? 401 : r.status }; }   // 400 «Can't decode Authorization» — ключ не тот
  const j = await r.json(), e = Number(j.expires_at) || 0;
  gcTok = j.access_token || ''; gcExp = e > 1e12 ? e : e > 0 ? e * 1000 : Date.now() + 25 * 60000;   // срок приходит то в мс, то в секундах
  return gcTok ? { token: gcTok } : { error: 'model', code: 0 };
}
// ---- Живой голос ответа. Первым — SaluteSpeech Сбера (ключ авторизации SALUTE_AUTH_KEY из проекта «SaluteSpeech API» в Studio;
// голос SALUTE_VOICE, по умолчанию Nec_24000 — «Наталья»), иначе Яндекс SpeechKit, API v3 (ключ сервисного аккаунта YANDEX_TTS_KEY;
// по желанию TTS_VOICE, TTS_ROLE, TTS_SPEED, YANDEX_FOLDER_ID). Нет ни одного ключа — приложение говорит голосом устройства ----
const TTS_ON = () => !!(env('SALUTE_AUTH_KEY') || env('YANDEX_TTS_KEY'));
let ssTok = '', ssExp = 0;
async function ttsSalute(text) {
  const key = env('SALUTE_AUTH_KEY').replace(/^Basic\s+/i, '');
  for (let i = 0; i < 2; i++) {   // токен мог истечь раньше срока — один повтор с новым
    if (i || !ssTok || Date.now() > ssExp - 60000) {   // токен — тем же способом, что у GigaChat, но со своим ключом и scope
      const t = await gcFetch('https://ngw.devices.sberbank.ru:9443/api/v2/oauth', { method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', RqUID: crypto.randomUUID(), Authorization: 'Basic ' + key },
        body: 'scope=' + encodeURIComponent(env('SALUTE_SCOPE') || 'SALUTE_SPEECH_PERS') });
      if (!t.ok) { console.error('salute oauth', t.status, (await t.text()).slice(0, 300)); return null; }
      const j = await t.json(), e = Number(j.expires_at) || 0;
      ssTok = j.access_token || ''; ssExp = e > 1e12 ? e : e > 0 ? e * 1000 : Date.now() + 25 * 60000;
    }
    const r = await gcFetch('https://smartspeech.sber.ru/rest/v1/text:synthesize?format=wav16&voice=' + encodeURIComponent(env('SALUTE_VOICE') || 'Nec_24000'),
      { method: 'POST', headers: { Authorization: 'Bearer ' + ssTok, 'Content-Type': 'application/text' }, body: text });
    if (r.status === 401 && !i) continue;
    if (!r.ok) { console.error('salute', r.status, (await r.text()).slice(0, 300)); return null; }
    const a = new Uint8Array(await r.arrayBuffer());
    return a.length > 200 ? { audio: a, type: 'audio/wav' } : null;
  }
  return null;
}
async function ttsAny(text) {   // SaluteSpeech, а если его нет или он не ответил — Яндекс
  if (env('SALUTE_AUTH_KEY')) { const s = await ttsSalute(text).catch(e => { console.error('salute net', e && e.message); return null; }); if (s) return s; }
  if (env('YANDEX_TTS_KEY')) { const y = await ttsYandex(text); if (y) return { audio: y, type: 'audio/mpeg' }; }
  return null;
}
const b64url = u8 => btoa(String.fromCharCode(...u8)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
let hmacK = null;
async function sigOf(uid, text) {   // подпись ответа: озвучить можно только то, что ответил сам помощник этому человеку
  hmacK = hmacK || await crypto.subtle.importKey('raw', new TextEncoder().encode('parsimony-tts:' + env('SUPABASE_SERVICE_ROLE_KEY')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', hmacK, new TextEncoder().encode(uid + '\n' + text))));
}
async function ttsYandex(text) {
  const folder = env('YANDEX_FOLDER_ID'), role = env('TTS_ROLE');
  const r = await fetch('https://tts.api.cloud.yandex.net/tts/v3/utteranceSynthesis', { method: 'POST', signal: AbortSignal.timeout(30000),
    headers: { Authorization: 'Api-Key ' + env('YANDEX_TTS_KEY'), 'Content-Type': 'application/json', ...(folder ? { 'x-folder-id': folder } : {}) },
    body: JSON.stringify({ text, hints: [{ voice: env('TTS_VOICE') || 'alena' }, ...(role ? [{ role }] : []), { speed: Number(env('TTS_SPEED')) || 1.05 }],
      outputAudioSpec: { containerAudio: { containerAudioType: 'MP3' } }, loudnessNormalizationType: 'LUFS', unsafeMode: true }) });
  if (!r.ok) { console.error('tts', r.status, (await r.text()).slice(0, 300)); return null; }
  // Ответ — поток JSON-объектов с кусками звука в base64 (result.audioChunk.data)
  const chunks = [...(await r.text()).matchAll(/"data"\s*:\s*"([A-Za-z0-9+/=]+)"/g)].map(x => Uint8Array.from(atob(x[1]), c => c.charCodeAt(0)));
  if (!chunks.length) { console.error('tts: пустой ответ'); return null; }
  const out = new Uint8Array(chunks.reduce((a, c) => a + c.length, 0)); let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function askGiga(system, user, o) {
  const key = env('GIGACHAT_AUTH_KEY').replace(/^Basic\s+/i, ''); if (!key) return { error: 'off' };
  // 402 — кончились бесплатные токены этой модели: тогда пробуем Lite, у неё бесплатный запас больше всех (250 млн в год, у Pro — 40 млн)
  const models = [o.model]; if (!/^GigaChat(-2)?$/i.test(o.model)) models.push('GigaChat-2');
  let last = { error: 'model', code: 0 };
  for (const model of models) {
    let fresh = false, busy = 0;
    for (let i = 0; i < 6; i++) {
      const t = await gcToken(key, fresh); if (t.error) return t;
      const r = await gcFetch('https://api.giga.chat/v1/chat/completions', { method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: 'Bearer ' + t.token },
        body: JSON.stringify({ model, temperature: o.temp, max_tokens: o.max, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }) });
      if (r.status === 401 && !fresh) { fresh = true; continue; }   // токен мог истечь раньше срока — один повтор с новым
      if (r.status === 429 && busy < 2) { busy++; await r.text().catch(() => ''); await sleep(1500 * busy); continue; }   // у физлица один поток: кто-то пишет одновременно — подождать
      if (!r.ok) { console.error('gigachat', model, r.status, (await r.text()).slice(0, 300)); last = { error: 'model', code: r.status }; break; }
      const j = await r.json();
      return { text: j && j.choices && j.choices[0] && j.choices[0].message ? j.choices[0].message.content : '' };
    }
    if (last.code !== 402) return last;
  }
  return last;
}
async function askDeepseek(system, user, o) {
  const key = env('DEEPSEEK_API_KEY'); if (!key) return { error: 'off' };
  const r = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST', signal: AbortSignal.timeout(45000),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: o.model, temperature: o.temp, max_tokens: o.max, response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
  });
  if (!r.ok) { console.error('deepseek', r.status, (await r.text()).slice(0, 300)); return { error: 'model', code: r.status }; }   // 401 — ключ, 402 — баланс, 429 — перегрузка
  const j = await r.json();
  return { text: j && j.choices && j.choices[0] && j.choices[0].message ? j.choices[0].message.content : '' };
}
async function askModel(system, user, o) {
  try {
    if (PROVIDER === 'gigachat') return await askGiga(system, user, o);
    if (PROVIDER === 'deepseek') return await askDeepseek(system, user, o);
    return { error: 'off' };
  } catch (e) { console.error('ai net', PROVIDER, e && e.message); return { error: 'net' }; }
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
    if (body.mode === 'tts') {   // голос ответа — не считается в дневной лимит: озвучить можно только подписанный ответ помощника
      if (!TTS_ON()) return json({ error: 'off' }, 503);
      if (typeof body.sig !== 'string' || body.sig !== await sigOf(u.user.id, text)) return json({ error: 'forbidden' }, 403);
      const v = await ttsAny(text.replace(/^\s*•\s*/gm, '').replace(/[«»"„“*]/g, '').slice(0, 1500));
      return v ? new Response(v.audio, { headers: { ...CORS, 'Content-Type': v.type, 'Cache-Control': 'no-store' } }) : json({ error: 'model' }, 502);
    }
    const ctx = body.ctx && typeof body.ctx === 'object' ? body.ctx : {};
    const hello = body.mode === 'hello';
    // Лимит на человека в сутки (по UTC); счётчик — в ai_usage (supabase/sql/assistant.sql)
    const day = new Date().toISOString().slice(0, 10);
    const { data: n, error: le } = await sb.rpc('ai_use', { p_user: u.user.id, p_day: day });
    if (le) throw le;
    if (n > DAILY) return json({ error: 'limit', limit: DAILY }, 429);
    if (n === 1) await sb.from('ai_usage').delete().lt('day', new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10));
    const m = hello ? await askModel(HELLO, userMessage('', ctx), { model: LITE, temp: 0.8, max: 300 })
      : await askModel(SYSTEM, userMessage(text, ctx, { history: body.history }), { model: body.ask ? LITE : MODEL, temp: 0.2, max: 2500 });
    if (m.error) return json({ error: m.error, code: m.code || 0, p: PROVIDER }, m.error === 'off' ? 503 : 502);   // p — какая нейросеть ответила (видно в окне помощника)
    const j0 = jsonOf(m.text), plain = String(m.text || '').trim();
    // Модель иногда отвечает просто текстом — тогда это ответ в чате без записей
    const out = j0 && typeof j0 === 'object' && !Array.isArray(j0) ? j0 : plain && !/[{}]/.test(plain) ? { reply: plain } : null;
    if (!out) { console.error('parse', PROVIDER, 'длина ответа', String(m.text || '').length); return json({ error: 'parse', p: PROVIDER }, 502); }   // сам текст в журнал не пишем
    const left = Math.max(0, DAILY - n);
    const reply = block(out.reply, hello ? 500 : 1500), say = TTS_ON() && reply ? await sigOf(u.user.id, reply) : undefined;
    if (hello) return json({ reply, items: [], nav: [], left, say });
    const items = (Array.isArray(out.items) ? out.items : []).slice(0, MAX_ITEMS).map(cleanItem).filter(Boolean);
    return json({ reply, items, nav: cleanNav(out.nav), fix: out.fix === true && items.length > 0, left, say });
  } catch (e) {
    console.error(e && e.message ? e.message : e);
    return json({ error: 'server' }, 500);
  }
});
