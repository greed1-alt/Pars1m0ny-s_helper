// ---- ИИ-помощник: чат (16 октября 2026 — проба, с 17 октября — чат по просьбе пользователя). Разбирает нейросеть на сервере
// (Edge Function assistant; GigaChat от Сбера, бесплатный режим для физлиц: DeepSeek требовал иностранную карту).
// В интерфейсе — «Помощник Parsimony», без названия нейросети (просьба пользователя); кто обрабатывает данные — в памятке beta.html.
// Помощник раскладывает сообщения на задачи, события, привычки, цели, траты и заметки и отмечает привычки — сразу, без
// подтверждения (с 17 октября 2026, просьба пользователя), у каждой записи в ответе — «Отменить» / «Вернуть» (aiDo / aiUndo); отвечает на вопросы о делах, деньгах, целях и привычках, подсказывает,
// где что в приложении (кнопки перехода — AI_NAV), подначивает и хвалит (приветствие раз в день — aiHello).
// С 18 октября 2026 — ещё меняет уже созданное (перенести, переименовать, отметить сделанным, удалить; записи в сводке со ссылками
// [e3] / [m2] — aiData, aiRefs) и разбирает картинки: скриншот расписания — повторяющиеся события, чек — траты (aiPickImg).
// Нейросети уходят текст сообщения, несколько последних реплик и названия календарей, категорий, привычек и целей;
// когда человек спрашивает — ещё короткая сводка записей (aiData): без заметок, мест и самочувствия (решение пользователя).
// История чата — только на этом устройстве (remapp_chat), при выходе из аккаунта стирается (cloud.js → wipeDevice) ----
let ai = null;   // { msgs:[{ r:'u'|'a', t, day, items, added, nav, ask, hi }], hello, draft, busy, err, left }
const AI_MAX = 2000, AI_LS = 'remapp_chat', AI_KEEP = 40, AI_HIST = 8;
const AI_SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let aiPtt = null, aiClearAsk = 0, aiSeen = 0;   // aiPtt — идёт запись голосом; aiSeen — сколько сообщений уже показано (новые появляются с анимацией)

const AI_T = { edit:[IC.edit, 'Изменить'], done:[IC.check, 'Отметить'], delete:[IC.trash, 'Удалить'], uncheck:[IC.undo, 'Снять отметку'], check:[IC.check, 'Отметить'], task:[IC.tasks, 'Задача'], event:[IC.cal, 'Событие'], habit:[IC.habit, 'Привычка'], expense:[IC.wallet, 'Расход'], income:[IC.wallet, 'Доход'], saving:[IC.wallet, 'Накопление'], goal:[IC.goal, 'Цель'], note:[IC.note, 'Заметка'] };
const aiRep = r => !r ? '' : r.type === 'daily' ? 'каждый день' : r.type === 'weekdays' ? 'по будням' : r.type === 'monthly' ? 'каждый месяц' : r.type === 'yearly' ? 'каждый год'
  : 'по ' + (r.days.length ? r.days.map(d => DOW[d].toLowerCase()).join(', ') : 'неделям');
const aiCat = name => { const n = String(name || '').toLowerCase(); return n && S.cats.find(c => c.name.toLowerCase() === n); };
// Категория трат: как назвала нейросеть (точно из списка), иначе — по словам, как в строке ввода («кофе» → «Кафе»), иначе — «Прочее»
const aiFin = (name, kind, note, amt) => { const n = String(name || '').toLowerCase(), gs = kind === 'out' ? FG_OUT : [kind];
  const hit = n && S.fin.cats.find(c => gs.includes(c.g) && c.name.toLowerCase() === n); if (hit) return hit;
  const p = note ? parseMoney(note + ' ' + Math.round(amt || 1), kind) : null; return p && p.ok ? fcat(p.cat) : kindDefaultCat(kind); };
const AI_KIND = { expense:'out', income:'inc', saving:'sav' };

// ---- Что нейросеть знает о человеке ----
const aiCtx = (data, R, find) => { const P = S.settings.phr || {};
  return { today: todayK(), now: fmtMin(nowMin()), tz: S.settings.tz || '', cats: S.cats.map(c => c.name),
    fin: S.fin.cats.map(c => ({ n: c.name, g: c.g })), habits: S.habits.map(h => h.name), goals: activeGoals().map(g => g.title),
    taunts: !!P.taunts, praise: !!P.praise, style: (P.custom || []).slice(0, 8).map(p => ({ k: p.kind, t: p.t })), ...(data ? { data: aiData(R, find) } : {}) }; };
// Ссылки на записи для нейросети: [e3] — дело или событие, [m2] — трата / доход; R.map — какая ссылка на какой id (живёт в ответе, m.refs)
const aiRefs = () => ({ map: {}, by: {}, n: { e: 0, m: 0 } });
const aiRef = (R, kind, id) => { if (!R) return ''; const k = R.by[id] || (R.by[id] = kind + (++R.n[kind])); R.map[k] = id; return '[' + k + '] '; };
// Просят перенести, переименовать, отметить или удалить — нужна сводка со ссылками и записи, подходящие по словам сообщения
const AI_EDIT = /(?:^|[\s,.!?])(?:перенес\S*|перенос\S*|передвин\S*|сдвин\S*|перемест\S*|измени\S*|поменя\S*|исправ\S*|переимен\S*|удали\S*|удалить|убери\S*|убрать|отмени\S*|отмет\S*|сделал\S*|выполнил\S*|сними|снять|вычеркн\S*|не был\S*|не ходил\S*)(?=$|[\s,.!?])/i;
const AI_SKIP = /^(?:перен|перед|сдвин|перем|измен|поменя|исправ|переим|удали|убер|убра|отмен|отмет|сдела|выпол|сними|снять|вычер|завтр|сегод|вчер|послез|понед|вторн|сред|четве|пятни|суббо|воскр|недел|утра|утром|вечер|часов|минут|этот|этой|этого|всех|какой|пожал|потом|сейча|пусть|нужно|надо|чтобы)/;
function aiFind(text) {
  const ws = (String(text).toLowerCase().replace(/ё/g, 'е').match(/[а-яa-z0-9]{4,}/g) || []).filter(w => !AI_SKIP.test(w)).map(w => w.slice(0, Math.max(4, Math.min(6, w.length - 1))));
  if (!ws.length) return { ev: [], ops: [] };
  const t = todayK(), lo = addDays(t, -60), hi = addDays(t, 365), hit = s => { const v = String(s || '').toLowerCase().replace(/ё/g, 'е'); return ws.some(w => v.includes(w)); };
  const ev = S.events.filter(e => hit(e.title) && (isRec(e) ? !(e.repeat.until && e.repeat.until < lo) : e.date >= lo && e.date <= hi))
    .map(e => ({ e, k: isRec(e) ? nextOcc(e) : e.date })).sort((a, b) => Math.abs(dayDiff(t, a.k)) - Math.abs(dayDiff(t, b.k))).slice(0, 15).map(x => x.e);
  const ops = S.fin.ops.filter(o => o.date >= addDays(t, -90) && (hit(o.note) || hit(fcat(o.cat).name))).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  return { ev, ops };
}
// Сводка записей — только когда человек о чём-то спрашивает (и для приветствия): дела на 2 недели, пропущенное,
// деньги месяца по категориям, цели, привычки. Заметки, места, самочувствие и профиль не отправляются
const AI_DW = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
const aiD = k => k.slice(8) + '.' + k.slice(5, 7) + (k.slice(0, 4) !== todayK().slice(0, 4) ? '.' + k.slice(0, 4) : '');
function aiData(R, find) {
  const t = todayK(), ym = ymOf(t), L = [];
  const evTxt = (e, k) => { const c = S.cats.find(x => x.id === e.cat);
    return aiRef(R, 'e', e.id) + (isDone(e, k) ? '✓ ' : '') + (e.time ? e.time + (e.time2 ? '–' + e.time2 : '') + ' ' : '') + e.title
      + (e.task && e.prio === 'urgent' ? ' (срочно)' : e.task && e.prio === 'high' ? ' (важно)' : '') + (c ? ` [${c.name}]` : '') + (isRec(e) ? ' ↻' : ''); };
  const days = [];
  for (let i = 0; i < 14; i++) {
    const k = addDays(t, i), l = S.events.filter(e => occurs(e, k)).sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
    if (l.length) days.push(`${AI_DW[dowIdx(k)]} ${aiD(k)}${i === 0 ? ' (сегодня)' : i === 1 ? ' (завтра)' : ''}: ${l.slice(0, 12).map(e => evTxt(e, k)).join('; ')}${l.length > 12 ? `; и ещё ${l.length - 12}` : ''}`);
  }
  L.push('Дела и события на 14 дней (✓ — сделано, ↻ — повторяется; дней без дел нет в списке):', ...(days.length ? days : ['ничего не запланировано']));
  const ms = missedList();
  if (ms.length) L.push(`Пропущено — прошлые дела без отметки (${ms.length}): ` + ms.slice(0, 15).map(e => `${aiRef(R, 'e', e.id)}${aiD(e.date)} ${e.title}`).join('; '));
  const st = finStat(ym), prev = finStat(ymAdd(ym, -1)), dl = dailyLimit(st, ym);
  if (st.ops.length || st.spentPlan || prev.ops.length) {
    L.push(`Деньги, ${ymTitle(ym).toLowerCase()}: потрачено ${rub(st.spent)}${st.spentPlan ? ' из бюджета ' + rub(st.spentPlan) : ' (бюджет не задан)'}; доходы ${rub(st.g.inc.fact)}; отложено ${rub(st.g.sav.fact)}`
      + (dl ? (dl.left >= 0 ? `; можно потратить сегодня ещё ${rub(dl.left)}` : `; дневной лимит превышен на ${rub(-dl.left)}`) : '') + `. В прошлом месяце потрачено ${rub(prev.spent)}.`);
    const cats = S.fin.cats.filter(c => FG_OUT.includes(c.g) && (st.fact[c.id] || c.plan)).sort((a, b) => (st.fact[b.id] || 0) - (st.fact[a.id] || 0)).slice(0, 15);
    if (cats.length) L.push('Расходы месяца по категориям: ' + cats.map(c => `${c.name} ${rub(st.fact[c.id] || 0)}${c.plan ? ' (бюджет ' + rub(c.plan) + ')' : ''}`).join('; ') + '.');
    const op = o => { const c = fcat(o.cat); return `${aiRef(R, 'm', o.id)}${aiD(o.date)} ${c.g === 'inc' ? '+' : c.g === 'sav' ? 'в накопления ' : ''}${rub(o.amt)} ${o.note || c.name}${o.note ? ' (' + c.name + ')' : ''}`; };
    const last = [...S.fin.ops].sort((a, b) => b.date.localeCompare(a.date)).filter(o => o.date <= t).slice(0, 12);
    if (last.length) L.push('Последние записи денег: ' + last.map(op).join('; ') + '.');
  }
  const gl = activeGoals().slice(0, 8);
  if (gl.length) L.push('Цели:', ...gl.map(g => { const s = goalStat(g);
    return `• ${g.title} — срок ${aiD(g.due)} (${s.left >= 0 ? 'осталось ' + plural(s.left, NDAY) : 'срок прошёл'}); шагов сделано ${s.d} из ${s.n}${s.pace ? '; темп: ' + PACE[s.pace] : ''}`
      + (s.late.length ? '; просрочены шаги: ' + s.late.slice(0, 3).map(x => `«${x.t}» (${aiD(x.date)})`).join(', ') : '') + (s.next ? `; следующий шаг: «${s.next.t}»` : ''); }));
  if (S.habits.length) { const md = ymDays(ym), wk = ym + ':w' + (wkOf(t) + 1);
    L.push('Привычки (процент — за этот месяц):', ...S.habits.slice(0, 20).map(h => {
      if (h.kind === 'weekly') return `• ${h.name} (раз в неделю): на этой неделе ${h.log[wk] ? '✓ сделано' : 'ещё нет'}`;
      if (h.kind === 'monthly') return `• ${h.name} (раз в месяц): в этом месяце ${h.log[ym] ? '✓ сделано' : 'ещё нет'}`;
      const s = hStat(h, md); return `• ${h.name}: ${s.pct == null ? 'пока без отметок' : Math.round(s.pct * 100) + '%'}${hDow(h, t) ? (h.log[t] ? ', сегодня ✓' : ', сегодня ещё нет') : ', сегодня не по плану'}`; })); }
  if (find) {   // записи, о которых, похоже, речь (по словам сообщения), — со ссылками
    const f = aiFind(find), c = e => S.cats.find(x => x.id === e.cat);
    const evs = f.ev.map(e => `${aiRef(R, 'e', e.id)}${isRec(e) ? '↻ ' + aiRep(e.repeat) + ', ближайший ' + aiD(nextOcc(e)) : aiD(e.date)}${e.time ? ' ' + e.time + (e.time2 ? '–' + e.time2 : '') : ''} ${e.title}${!isRec(e) && e.done ? ' (✓ сделано)' : ''}${c(e) ? ` [${c(e).name}]` : ''}`);
    const ops = f.ops.map(o => { const cc = fcat(o.cat); return `${aiRef(R, 'm', o.id)}${aiD(o.date)} ${rub(o.amt)} ${o.note || cc.name} (${cc.name})`; });
    if (evs.length || ops.length) L.unshift('Записи, о которых может идти речь (найдены по словам сообщения):', ...evs, ...ops, '');
  }
  return L.join('\n').slice(0, 6000);
}
// Похоже на вопрос — нужна сводка (и хватит модели попроще): «что у меня завтра?», «сколько потратил на кафе», «как дела с целью»
const AI_ASK = /^\s*(?:(?:а|и|ну|так|слушай|скажи)[\s,]+)*(?:что|чем|сколько|когда|какие|какой|какая|какое|каких|где|как|почему|зачем|покажи|расскажи|подскажи|есть ли|успеваю|успею)(?=$|[\s,.!?])/i;
const AI_ASK2 = /(?:^|[\s,.!?])(?:просроч\S*|прогресс\S*|сводк\S*|статистик\S*|итог\S*|план на)(?=$|[\s,.!?])/i;
const aiAsks = t => t.includes('?') || AI_ASK.test(t) || AI_ASK2.test(t);

// ---- История чата: только на этом устройстве ----
const aiLoad = () => { try { const j = JSON.parse(localStorage.getItem(AI_LS) || 'null'); if (j && Array.isArray(j.msgs)) return j; } catch (e) {} return { msgs: [], hello: '' }; };
const aiStore = () => { if (!ai) return; ai.msgs = ai.msgs.slice(-AI_KEEP); try { localStorage.setItem(AI_LS, JSON.stringify({ msgs: ai.msgs, hello: ai.hello })); } catch (e) {} };
// Что было в разговоре — коротко, вместе с предложенными записями: так нейросеть понимает «нет, в 11» и «а послезавтра?»
const aiBrief = it => AI_ACT.includes(it.type) ? (AI_T[it.type] || [0, ''])[1] + ' «' + (it.lbl || it.habit || '') + '»' + (it.chg ? ' ' + it.chg : '') : (AI_T[it.type] || [0, 'Запись'])[1] + ' «' + (it.title || it.habit || it.text || it.note || '') + '»' + (it.date ? ' ' + it.date : '') + (it.time ? ' ' + it.time : '') + (it.amount ? ' ' + it.amount + ' ₽' : '');
const AI_ACT = ['edit', 'done', 'delete', 'uncheck'];   // действия с тем, что уже есть
const aiSt = x => x.st === 'ok' ? 'сделано' : x.st === 'undone' ? 'пользователь отменил' : x.st === 'ask' ? 'ждёт подтверждения' : x.st === 'no' ? 'пользователь не подтвердил' : 'не получилось' + (x.why ? ' — ' + x.why : '');
const aiHist = () => ai.msgs.slice(-AI_HIST).map(m => ({ r: m.r, t: ((m.t || '') + (!m.items || !m.items.length ? '' : m.auto ? ` [${m.items.map(x => aiBrief(x) + ' — ' + aiSt(x)).join('; ')}]`
  : ` [предложено: ${m.items.map(aiBrief).join('; ')} — ${m.added != null ? 'добавлено' : 'пока не добавлено'}]`)).slice(0, 700) }));

// ---- Куда помощник может отправить кнопкой (ключи — те же, что в функции assistant → NAV) ----
const aiSec = s => () => { if (!secOn(s)) { toast('Этот раздел выключен — его можно включить здесь'); return aiSet('secs')(); } if (s === 'tasks' && tView === 'goals') tView = 'main'; setSec(s); };
const aiSet = k => () => stJump(k);   // pages.js: на телефоне — открыть раздел, на ПК — прокрутить к нему
const AI_NAV = { home:['Главная', aiSec('home')], cal:['Календарь', aiSec('cal')], tasks:['Задачи', aiSec('tasks')], goals:['Цели', () => goGoals()], habits:['Привычки', aiSec('habits')], fin:['Финансы', aiSec('fin')],
  budget:['Бюджет на месяц', () => openBudget()], missed:['Вы пропустили', () => ACT.missopen()], profile:['Профиль', () => setSec('profile')], settings:['Настройки', () => { if (sec !== 'settings') return setSec('settings'); stOpen = null; render(); window.scrollTo(0, 0); }],
  set_look:['Оформление', aiSet('look')], set_cal:['Настройки календаря', aiSet('cal')], set_cats:['Календари', aiSet('cats')], set_layout:['Расположение', aiSet('secs')], sections:['Разделы и вкладки', () => openSecs()],
  set_notif:['Напоминания', aiSet('notif')], set_data:['Аккаунт и данные', aiSet('data')], tour:['Знакомство с приложением', () => openTourMenu()], feedback:['Отзыв', () => ACT.feedback()] };
ACT.ainav = el => { const n = AI_NAV[el.dataset.to]; if (!n) return; closeSheet(); n[1](); };

// ---- Окно ----
function openAI(text) {
  aiVoiceAbort();
  if (!ai) { const st = aiLoad(); ai = { msgs: st.msgs, hello: st.hello || '', draft: '', busy: false, err: '', left: null }; }
  ai.msgs.forEach(m => { delete m.tw; });   // печатается только ответ, пришедший сейчас
  if (text) ai.draft = String(text).slice(0, AI_MAX);
  ai.err = ''; aiClearAsk = 0; aiSeen = ai.msgs.length;
  aiDraw();
  if (text || matchMedia('(pointer:fine)').matches) setTimeout(() => { const t = $('#ai_text'); if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); } }, 30);
  if (!text) aiHello();
}
ACT.aiopen = el => { const i = el.dataset.om && $('#' + el.dataset.om), t = i ? i.value : ''; if (i) { i.value = ''; omUpdate(i.id); } openAI(t); };

// Строка записи. mode: 'auto' — уже сделано (с «Отменить» / «Вернуть»); 'pick' — с галочкой и 'done' — добавлено:
// так выглядят сообщения до 17 октября 2026, когда записи ещё подтверждали кнопкой «Добавить»
function aiRow(it, key, mode) {
  const locked = mode === 'done', auto = mode === 'auto', bits = [];
  let [ic, kind] = AI_T[it.type] || [IC.note, 'Запись'];
  if (auto && it.type === 'check' && it.st === 'ok') kind = 'Отмечено';
  if (it.type === 'done' && it.done === false) kind = 'Снять отметку';
  if (AI_ACT.includes(it.type) && it.chg) bits.push(esc(it.chg));
  if (it.type === 'task' || it.type === 'event') {
    bits.push(it.repeat ? aiRep(it.repeat) + (it.date && it.date !== todayK() ? ', с ' + relDay(it.date) : '') : relDay(it.date || todayK()));
    if (it.time) bits.push(it.time + (it.time2 ? '–' + it.time2 : ''));
    const c = aiCat(it.cat); if (c) bits.push(`<span class="ctag" style="--c:${c.color}"><i></i>${esc(c.name)}</span>`);
    if (it.type === 'task' && (it.prio === 'urgent' || it.prio === 'high')) bits.push(pbadge(it.prio));
    if (it.remind && it.remind.length) bits.push('🔔 ' + it.remind.map(remShort).join(', '));
    if (it.loc) bits.push(esc(it.loc));
  } else if (it.type === 'check') { const h = aiHab(it.habit), d = it.date || todayK();
    bits.push(h ? (h.kind === 'weekly' ? 'за эту неделю' : h.kind === 'monthly' ? 'за этот месяц' : relDay(d)) : 'такой привычки нет');
    if (mode !== 'pick') {} else if (h && aiMarked(h, d)) bits.push('уже отмечена'); else if (h && h.kind === 'daily' && d < todayK() && !S.settings.habitPast) bits.push('задним числом выключено в настройках'); }
  else if (it.type === 'habit') bits.push(it.kind === 'weekly' ? 'раз в неделю' : it.kind === 'monthly' ? 'раз в месяц' : it.days.length ? 'по ' + it.days.map(d => DOW[d].toLowerCase()).join(', ') : 'каждый день');
  else if (AI_KIND[it.type]) { const c = aiFin(it.category, AI_KIND[it.type], it.note, it.amount); bits.push(`<b>${it.type === 'income' ? '+' : it.type === 'expense' ? '−' : ''}${rub(it.amount)}</b>`, esc((c.emoji || '') + ' ' + c.name)); if (it.date && it.date !== todayK()) bits.push(relDay(it.date)); }
  else if (it.type === 'goal') { bits.push('до ' + shortDate(it.due || todayK().slice(0, 4) + '-12-31')); if (it.steps.length) bits.push(plural(it.steps.length, ['шаг', 'шага', 'шагов'])); }
  const hb = it.type === 'check' && aiHab(it.habit);
  const title = AI_ACT.includes(it.type) ? (it.lbl || it.habit || '—') : it.type === 'note' ? it.text : it.type === 'check' ? (hb ? (hb.emoji ? hb.emoji + ' ' : '') + hb.name : it.habit) : AI_KIND[it.type] ? (it.note || kind) : (it.type === 'habit' || it.type === 'goal') && it.emoji ? it.emoji + ' ' + it.title : it.title;
  if (auto) {
    const st = it.st || 'skip', ico = st === 'ok' ? IC.check : st === 'undone' ? IC.undo : st === 'no' ? IC.x : IC.alert;
    if (it.why) bits.push(esc(it.why));
    const btn = st === 'ok' || st === 'undone' ? `<button class="ai-undo" data-act="aiundo" data-i="${key}">${st === 'ok' ? 'Отменить' : 'Вернуть'}</button>` : '';
    return `<div class="ai-row ai-auto st-${st}"><span class="ai-chk">${I(ico, 14)}</span><span class="ai-k">${I(ic, 15)}${kind}</span>
      <span class="ai-b"><b>${esc(title)}</b>${bits.length ? `<small>${bits.join(' · ')}</small>` : ''}</span>${btn}</div>`;
  }
  const tag = locked ? 'div' : 'label', box = locked ? `<span class="ai-chk">${I(IC.check, 14)}</span>` : `<input type="checkbox" data-aion="${key}"${it.on ? ' checked' : ''}>`;
  return `<${tag} class="ai-row${it.on || locked ? '' : ' off'}">${box}<span class="ai-k">${I(ic, 15)}${kind}</span>
    <span class="ai-b"><b>${esc(title)}</b>${bits.length ? `<small>${bits.join(' · ')}</small>` : ''}</span></${tag}>`;
}
// Удаление и больше трёх изменений за раз ждут подтверждения: «Удалить» / «Подтвердить» и «Не надо» под сообщением
function aiAskHTML(m, i) {
  const a = (m.items || []).filter(x => x.st === 'ask'); if (!a.length) return '';
  const del = a.every(x => x.type === 'delete');
  return `<div class="ai-ask"><button class="btn pri" data-act="aiyes" data-i="${i}">${del ? I(IC.trash, 15) + ' Удалить' : 'Подтвердить'}${a.length > 1 ? ' (' + a.length + ')' : ''}</button><button class="btn" data-act="aino" data-i="${i}">Не надо</button></div>`;
}
// Текст ответа: экранируется; **жирный** и переводы строк — как в чате
const aiTxt = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
function aiMsg(m, i) {
  if (m.r === 'u') return `<div class="ai-m u${i >= aiSeen ? ' new' : ''}"><div class="ai-mb">${aiThumbOk(m.img) ? `<img class="ai-uimg" src="${m.img}" alt="Картинка">` : ''}${m.t ? aiTxt(m.t) : ''}</div></div>`;
  const it = m.items || [], on = it.filter(x => x.on).length, added = m.added != null, okN = it.filter(x => x.st === 'ok').length;
  const list = m.auto && it.length ? `<div class="ai-list">${it.map((x, j) => aiRow(x, i + ':' + j, 'auto')).join('')}</div>
    ${okN > 1 ? `<button class="ai-undoall" data-act="aiundoall" data-i="${i}">${I(IC.undo, 14)} Отменить всё</button>` : ''}${aiAskHTML(m, i)}` : it.length ? `<div class="ai-list">${(added ? it.filter(x => x.on) : it).map((x, j) => aiRow(x, i + ':' + j, added ? 'done' : 'pick')).join('')}</div>
    ${added ? `<p class="ai-ok">${I(IC.check, 14)} ${m.added ? 'Готово: ' + plural(m.added, ['запись', 'записи', 'записей']) : 'Ничего не изменилось — это уже было'}</p>`
      : `<button class="btn pri ai-add" data-act="aiapply" data-i="${i}"${on ? '' : ' disabled'}>${on ? (it.every(x => !x.on || x.type === 'check') ? 'Отметить' : `Добавить ${plural(on, ['запись', 'записи', 'записей'])}`) : 'Выберите, что добавить'}</button>`}` : '';
  const nav = (m.nav || []).filter(n => AI_NAV[n.to]).map(n => `<button class="ai-nav" data-act="ainav" data-to="${n.to}">${esc(n.label || AI_NAV[n.to][0])}${I(IC.right, 14)}</button>`).join('');
  // Ответ без «пузыря», со светящимся шаром; только что пришедший (tw) — печатается, записи и кнопки появляются после текста (aiTypeRun)
  const more = list + (nav ? `<div class="ai-navs">${nav}</div>` : ''), tw = m.tw && m.t;
  return `<div class="ai-m a${i >= aiSeen ? ' new' : ''}"><span class="ai-orb xs" aria-hidden="true"></span><div class="ai-mb">${m.t ? (tw ? `<p class="ai-tw" data-i="${i}"></p>` : `<p>${aiTxt(m.t)}</p>`) : ''}${more ? (tw ? `<div class="ai-later">${more}</div>` : more) : ''}</div></div>`;
}
const aiThumbOk = s => typeof s === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(s) && s.length < 80000;   // миниатюра — только своя JPEG
// Пустой чат: приветствие, шар и подсказки карточками
const AI_CARDS = [[IC.cal, 'План', 'Что у меня завтра?'], [IC.wallet, 'Деньги', 'Сколько я потратил в этом месяце?'], [IC.goal, 'Цели', 'Как дела с моими целями?'], [IC.spark, 'Записать', 'Завтра в 10 врач, кофе 350, каждый день пить воду']];
function aiLogHTML() {
  let out = '', day = '';
  if (!ai.msgs.length && !ai.busy) { const nm = (S.settings.name || '').trim();
    out = `<div class="ai-hi"><span class="ai-orb lg" aria-hidden="true"></span><b>${greet()}${nm ? ', ' + esc(nm) : ''}!</b>
    <p>Расскажите о планах и тратах — разложу по разделам. Спросите о делах, деньгах и целях или пришлите скриншот расписания.</p>
    <div class="ai-cards">${AI_CARDS.map(([ic, n, q]) => `<button class="ai-card" data-act="aiex" data-t="${esc(q)}">${I(ic, 18)}<b>${n}</b><small>${esc(q)}</small></button>`).join('')}</div></div>`; }
  ai.msgs.forEach((m, i) => { if (m.day && m.day !== day) { day = m.day; const d = relDay(day); out += `<div class="ai-day">${d[0].toUpperCase() + d.slice(1)}</div>`; } out += aiMsg(m, i); });
  if (ai.busy) out += `<div class="ai-m a think new"><span class="ai-orb xs" aria-hidden="true"></span><div class="ai-mb"><span class="ai-shim" role="status">Думаю…</span></div></div>`;
  if (ai.err) { const [msg, code] = ai.err.split('\n');   // понятный текст крупно, служебный код (aiErr) — мелкой строкой для отзыва
    out += `<div class="ai-err"><span>${esc(msg)}${code ? `<small class="ai-errc">Код для отзыва: ${esc(code)}</small>` : ''}</span><button class="btn" data-act="airetry">${I(IC.rep, 15)} Повторить</button></div>`; }
  aiSeen = ai.msgs.length;   // при следующих перерисовках уже показанное не анимируется
  return out;
}
const aiStateText = () => aiPtt ? 'Слушаю…' : ai && ai.busy ? 'Думаю…' : 'На связи';
// Полоски «волны» голосовой записи: у каждой своя высота и сдвиг — волна живая, а не одинаковая
const AI_WAVE = Array.from({ length: 32 }, (_, i) => `<i style="--d:${((i * 37) % 100) / 100};--h:${(0.35 + ((i * 53) % 60) / 100).toFixed(2)}"></i>`).join('');
const aiVoiceHTML = () => `<div class="ai-voice" id="ai_voice" hidden>
  <div class="ai-vrow"><span class="ai-vdot" aria-hidden="true"></span><span class="ai-vtime" id="ai_vtime">0:00</span><p class="ai-vt" id="ai_vt" aria-live="polite">Говорите…</p></div>
  <div class="ai-wave" aria-hidden="true">${AI_WAVE}</div>
  <div class="ai-vfoot"><span class="ai-vh" id="ai_vh"></span><span class="ai-vbtns"><button class="ai-ib" data-act="aivcancel" aria-label="Отменить запись" title="Отменить">${I(IC.x, 18)}</button><button class="ai-ib ai-send" data-act="aivsend" aria-label="Отправить сказанное" title="Отправить">${I(IC.send, 18)}</button></span></div>
</div>`;
function aiDraw() {
  if (!ai) return;
  if (!signedIn()) return sheet(`<div class="sh-head"><h3>${I(IC.spark, 18)} Помощник Parsimony <em class="beta">β</em></h3><button class="ic" data-act="close" aria-label="Закрыть">${I(IC.x, 18)}</button></div>
    <p class="set-note">Помощник работает через сервер, поэтому нужен вход в аккаунт.</p><button class="btn pri" style="width:100%" data-act="login">Войти по почте</button>`);
  // Чат (22 октября 2026, выбор пользователя «чистый и современный», на телефоне — на весь экран): шапка с шаром и состоянием,
  // лента, снизу поле — пустое: справа микрофон (удерживать и говорить), есть текст или картинка: «отправить» (aiMode)
  sheet(`<div class="ai-chat">
    <div class="ai-top"><button class="ic ai-x" data-act="close" aria-label="Закрыть чат" title="Закрыть">${I(innerWidth < 900 ? IC.left : IC.x, 20)}</button>
      <span class="ai-orb sm" aria-hidden="true"></span><span class="ai-tt"><h3>Помощник Parsimony <em class="beta">β</em></h3><small id="ai_state">${aiStateText()}</small></span>
      <button class="ai-clear" id="ai_clear" data-act="aiclear"${ai.msgs.length ? '' : ' hidden'} title="Очистить чат" aria-label="Очистить чат">${I(IC.trash, 16)}<span>Очистить?</span></button></div>
    <div class="ai-log" id="ai_log" role="log" aria-live="polite" aria-label="Переписка с помощником">${aiLogHTML()}</div>
    <div class="ai-dock">
      <div class="ai-att" id="ai_att">${aiAttHTML()}</div>
      <div class="ai-in" id="ai_in">
        <button class="ai-ib" data-act="aiimg" title="Прикрепить картинку — например, скриншот расписания" aria-label="Прикрепить картинку">${I(IC.img, 20)}</button><input type="file" id="ai_file" accept="image/*" hidden>
        <textarea id="ai_text" rows="1" maxlength="${AI_MAX}" placeholder="Спросите или запишите…" aria-label="Сообщение помощнику">${esc(ai.draft)}</textarea>
        ${AI_SR ? `<button class="ai-ib ai-mic" id="ai_mic" aria-label="Сказать голосом: удерживайте и говорите" title="Удерживайте и говорите — отпустите, чтобы отправить">${I(IC.mic, 20)}</button>` : ''}
        <button class="ai-ib ai-send" id="ai_send" data-act="aigo" title="Отправить" aria-label="Отправить"${ai.busy ? ' disabled' : ''}>${I(IC.send, 18)}</button>
      </div>
      ${AI_SR ? aiVoiceHTML() : ''}
      <p class="ai-note">Помощник Parsimony · нейросеть в России${hintK('aiData')}<span id="ai_left">${ai.left != null ? ' · осталось сегодня: ' + ai.left : ''}</span></p>
    </div></div>`);
  aiGrow(); aiMode(); aiScroll(); aiTypeRun();
}
// Поле пустое — справа микрофон, есть текст или картинка — «отправить» (как в DeepSeek); без распознавания речи — всегда «отправить»
const aiMode = () => { const ta = $('#ai_text'), inn = $('#ai_in'); if (inn) inn.classList.toggle('has', !AI_SR || !!(ta && ta.value.trim()) || !!(ai && ai.img)); };
// Ответ печатается, как в чатах с нейросетью: не дольше ~1,2 с; «уменьшить движение» — сразу целиком. Записи и кнопки — после текста
function aiTypeRun() {
  const el = $('#ai_log .ai-tw'); if (!el || !ai) return;
  const m = ai.msgs[+el.dataset.i]; if (!m) return;
  delete m.tw; aiStore();
  const full = String(m.t || ''), box = el.closest('.ai-mb');
  const done = () => { if (!el.isConnected) return; el.innerHTML = aiTxt(full); el.classList.remove('ai-tw'); const l = box && box.querySelector('.ai-later'); if (l) l.classList.remove('ai-later'); aiScroll(); };
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || full.length < 4) return done();
  const step = Math.max(2, Math.ceil(full.length / 75)); let pos = 0;
  const tick = () => { if (!el.isConnected) return; pos = Math.min(full.length, pos + step); el.textContent = full.slice(0, pos).replace(/\*\*/g, ''); if (pos < full.length) { aiScroll(); requestAnimationFrame(tick); } else done(); };
  requestAnimationFrame(tick);
}
// Перерисовка только ленты и кнопок — поле ввода и клавиатура телефона не сбрасываются
function aiRefresh() {
  const log = $('#ai_log'); if (!ai || !log) return;   // окно помощника закрыто или сменилось другим
  log.innerHTML = aiLogHTML(); aiScroll();
  const s = $('#ai_send'); if (s) s.disabled = ai.busy;
  const st = $('#ai_state'); if (st) st.textContent = aiStateText();
  const n = $('#ai_left'); if (n) n.textContent = ai.left != null ? ' · осталось сегодня: ' + ai.left : '';
  const at = $('#ai_att'); if (at) at.innerHTML = aiAttHTML();
  const c = $('#ai_clear'); if (c) { c.hidden = !ai.msgs.length; c.classList.toggle('ask', !!aiClearAsk); }
  aiMode(); aiTypeRun();
}
const aiScroll = () => { const l = $('#ai_log'); if (l) l.scrollTop = l.scrollHeight; };
const aiGrow = () => { const t = $('#ai_text'); if (!t) return; t.style.height = 'auto'; const h = t.scrollHeight; t.style.height = Math.min(h, 140) + 'px'; t.style.overflowY = h > 140 ? 'auto' : 'hidden'; };
document.addEventListener('input', e => { if (e.target.id === 'ai_text' && ai) { ai.draft = e.target.value; aiGrow(); aiMode(); } });
document.addEventListener('change', e => { const k = e.target.dataset && e.target.dataset.aion; if (k == null || !ai) return;
  const [i, j] = k.split(':').map(Number), m = ai.msgs[i]; if (!m || !m.items || !m.items[j] || m.added != null) return;
  m.items[j].on = e.target.checked; aiStore(); aiRefresh(); });
// Enter — отправить (на ПК; на телефоне Enter — новая строка, отправка кнопкой), Ctrl+Enter — всегда
document.addEventListener('keydown', e => { if (e.target.id !== 'ai_text' || e.key !== 'Enter' || e.isComposing) return;
  if (e.ctrlKey || e.metaKey || (!e.shiftKey && matchMedia('(pointer:fine)').matches)) { e.preventDefault(); aiSend(); } });
// iPhone: пока открыта клавиатура, окно чата ужимается до видимой части экрана — поле ввода и последние сообщения видны
function aiVV() {
  const vv = window.visualViewport, ov = $('#ov'); if (!vv || !ov) return;
  // Класс меняем, только если он другой: сама смена класса снова вызывает aiVV (MutationObserver ниже) — иначе бесконечный круг
  if (sheetOpen() && $('.ai-chat') && innerWidth < 900) { ov.style.top = vv.offsetTop + 'px'; ov.style.height = vv.height + 'px'; ov.style.bottom = 'auto'; if (!ov.classList.contains('ov-vv')) ov.classList.add('ov-vv'); aiScroll(); }
  else if (ov.classList.contains('ov-vv')) { ov.style.top = ov.style.height = ov.style.bottom = ''; ov.classList.remove('ov-vv'); }
}
if (window.visualViewport) { visualViewport.addEventListener('resize', aiVV); visualViewport.addEventListener('scroll', aiVV); }
{ const ov = $('#ov'), sh = $('#sh'); if (ov && sh && window.MutationObserver) { const mo = new MutationObserver(aiVV); mo.observe(ov, { attributes: true, attributeFilter: ['class'] }); mo.observe(sh, { childList: true }); } }

// ---- Голосовой ввод: удерживать и говорить (просьба пользователя 22 октября 2026: «сделать голосовой ввод похожим хотя бы на то что у дип сика
// (красивым и сразу отправляющимся)»). Зажали микрофон — запись с «волной» и текстом, который распознаётся; отпустили — сообщение сразу уходит;
// смахнули вверх — отмена. Короткое нажатие (или Enter / пробел с клавиатуры) — запись до паузы 2,5 с, кнопки «отменить» и «отправить».
// Распознаёт браузер (Web Speech API); где не умеет — микрофона нет, остаётся микрофон клавиатуры.
// iPhone может не дать начать запись по нажатию (только по отпусканию пальца) — тогда она начнётся при отпускании и уйдёт после паузы (aiLate)
const AI_HOLD = 350, AI_UP = 70, AI_QUIET = 2500;
let aiLate = null;
function aiVoiceStart(pid, y, tap) {
  if (!AI_SR || !ai || aiPtt || !$('#ai_voice')) return false;
  const r = new AI_SR(), v = aiPtt = { r, pid, y0: y, t0: Date.now(), said: '', tmp: '', cancel: false, tap: !!tap, up: false, quiet: 0, tick: 0, talk: 0 };
  r.lang = 'ru-RU'; r.interimResults = true; r.continuous = true;
  r.onresult = ev => { v.tmp = ''; for (let i = ev.resultIndex; i < ev.results.length; i++) { const t = ev.results[i][0].transcript; if (ev.results[i].isFinal) v.said += t + ' '; else v.tmp += t; }
    v.talk = Date.now(); if (v.tap) aiVoiceArm(); aiVoiceUI(); };
  r.onerror = ev => { if (ev.error === 'aborted' || ev.error === 'no-speech') return; v.cancel = true;
    const deny = ev.error === 'not-allowed' || ev.error === 'service-not-allowed';
    if (deny && !v.tap && !v.up && v.pid >= 0) { aiLate = v.pid; return; }   // начнём заново при отпускании пальца
    toast(deny ? 'Нет доступа к микрофону — разрешите его в настройках браузера или нажмите микрофон на клавиатуре' : 'Голос не распознался — попробуйте ещё раз или напишите'); };
  r.onend = () => aiVoiceEnd(v);
  try { r.start(); } catch (e) { aiPtt = null; if (!tap && pid >= 0) { aiLate = pid; return false; } toast('Голосовой ввод сейчас недоступен — нажмите микрофон на клавиатуре'); return false; }
  if (navigator.vibrate) navigator.vibrate(12);
  v.tick = setInterval(aiVoiceUI, 200); if (v.tap) aiVoiceArm(); aiVoiceUI();
  return true;
}
const aiVoiceArm = () => { const v = aiPtt; if (!v) return; clearTimeout(v.quiet); v.quiet = setTimeout(() => aiVoiceStop(false), AI_QUIET); };
// Остановить: cancel — без отправки; иначе браузер досылает последний распознанный кусок, и в onend сообщение уходит (aiVoiceEnd)
function aiVoiceStop(cancel) { const v = aiPtt; if (!v) return; if (cancel) v.cancel = true; try { cancel ? v.r.abort() : v.r.stop(); } catch (e) { aiVoiceEnd(v); } }
const aiVoiceAbort = () => aiVoiceStop(true);
function aiVoiceEnd(v) {
  if (v.done) return; v.done = true; clearInterval(v.tick); clearTimeout(v.quiet);
  if (aiPtt === v) aiPtt = null;
  aiVoiceUI();
  const said = (v.said + v.tmp).trim(), ta = $('#ai_text');
  if (v.cancel || !said || !ai || !ta) return;
  ta.value = (ta.value.trim() + ' ' + said).trim().slice(0, AI_MAX); ai.draft = ta.value; aiGrow(); aiMode();
  aiSendWhenFree();   // помощник ещё отвечает — уйдёт, как только ответит
}
function aiVoiceUI() {
  const box = $('#ai_voice'), inn = $('#ai_in'), v = aiPtt; if (!box) return;
  box.hidden = !v; if (inn) inn.classList.toggle('rec', !!v);
  const st = $('#ai_state'); if (st && ai) st.textContent = aiStateText();
  if (!v) return;
  const sec = Math.floor((Date.now() - v.t0) / 1000), txt = (v.said + v.tmp).trim();
  box.classList.toggle('talk', Date.now() - v.talk < 700); box.classList.toggle('cancel', v.cancel && !v.tap); box.classList.toggle('tap', v.tap);
  $('#ai_vtime').textContent = Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
  $('#ai_vt').textContent = txt ? (txt.length > 140 ? '…' + txt.slice(-140) : txt) : 'Говорите…';
  $('#ai_vh').textContent = v.tap ? 'Пауза — и сообщение уйдёт само' : v.cancel ? 'Отпустите — запись отменится' : 'Отпустите — отправить · вверх — отмена';
}
document.addEventListener('pointerdown', e => { const m = e.target.closest && e.target.closest('#ai_mic'); if (!m || e.button > 0) return; e.preventDefault(); aiLate = null; aiVoiceStart(e.pointerId, e.clientY, false); });
document.addEventListener('pointermove', e => { const v = aiPtt; if (!v || v.tap || e.pointerId !== v.pid) return; const c = v.y0 - e.clientY > AI_UP; if (c !== v.cancel) { v.cancel = c; aiVoiceUI(); } });
const aiUp = e => {
  if (aiLate === e.pointerId) {   // нажатием запись не пустили — начинаем по отпусканию: до паузы, потом отправка
    aiLate = null; if (aiPtt) { const o = aiPtt; aiPtt = null; o.cancel = true; try { o.r.abort(); } catch (x) {} }
    if (e.type === 'pointerup') aiVoiceStart(-1, 0, true);
    return;
  }
  const v = aiPtt; if (!v || v.tap || e.pointerId !== v.pid) return;
  v.up = true;
  if (e.type === 'pointercancel' || v.cancel) return aiVoiceStop(true);
  if (Date.now() - v.t0 < AI_HOLD && !(v.said + v.tmp).trim()) { v.tap = true; aiVoiceArm(); return aiVoiceUI(); }   // короткое нажатие — запись до паузы
  aiVoiceStop(false);
};
document.addEventListener('pointerup', aiUp); document.addEventListener('pointercancel', aiUp);
document.addEventListener('keydown', e => { if (e.target.id === 'ai_mic' && (e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); aiVoiceStart(-1, 0, true); } });
ACT.aivcancel = () => aiVoiceStop(true);
ACT.aivsend = () => aiVoiceStop(false);

// ---- Сервер ----
// Понятная причина ошибки; в скобках — служебный код, по нему видно, где сбой (ответ сервера · что случилось · код нейросети · какая нейросеть)
function aiErr(st, j) {
  const e = j.error, c = Number(j.code) || 0, p = String(j.p || '').replace(/[^a-z]/g, ''), tag = `\n${st}${e ? ' · ' + e : ''}${c ? ' ' + c : ''}${p ? ' · ' + p[0].toUpperCase() : ''}`;   // G — GigaChat, D — DeepSeek. Код — после перевода строки: окно показывает его мелко, «Код для отзыва» (аудит, 21 октября 2026)
  if (e === 'limit') return `На сегодня запросы закончились (${j.limit} в день). Завтра снова можно.`;
  if (e === 'off' || st === 404) return 'Помощник ещё не подключён к нейросети — скоро заработает.';
  if (st === 401 || st === 403) return 'Войдите в аккаунт заново.' + tag;
  if (e === 'model') return (c === 401 ? 'Помощник временно не работает: нейросеть не приняла ключ.' : c === 402 ? 'Помощник временно не работает: закончился запас запросов к нейросети. Мы уже знаем и чиним.'
    : c === 429 ? 'Нейросеть сейчас перегружена — попробуйте через минуту.' : 'Нейросеть не ответила — попробуйте ещё раз через минуту.') + tag;
  if (e === 'net') return 'Сервер помощника не смог связаться с нейросетью — попробуйте позже.' + tag;
  if (e === 'parse') return 'Нейросеть ответила непонятно — попробуйте ещё раз или напишите проще.' + tag;
  if (e === 'image') return 'Не получилось отправить картинку — попробуйте другую (JPG или PNG).' + tag;
  if (e === 'noimage') return 'Картинки пока не разбираю — опишите словами.' + tag;
  return 'Ошибка на сервере помощника — попробуйте позже.' + tag;
}
async function aiCall(body) {
  try {
    const r = await fetch(SUPABASE_URL + '/functions/v1/assistant', { method:'POST', cache:'no-store',
      headers:{ 'Content-Type':'application/json', apikey: SUPABASE_KEY, Authorization: 'Bearer ' + await accessToken() }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (Number.isFinite(j.left)) ai.left = j.left;
    return r.ok ? j : { err: aiErr(r.status, j) };
  } catch (e) { return { err: 'Не удалось связаться с сервером. Проверьте интернет.' }; }
}
async function aiSend(text) {
  if (!ai) return;
  if (ai.busy) { if (text == null) aiSendWhenFree(); return; }   // Enter, пока помощник отвечает (например, на приветствие), — уйдёт, когда ответит
  // Запись голосом ещё идёт — выключить и отцепить: иначе её последний кусок после остановки отправил бы то же сообщение второй раз
  if (aiPtt) aiVoiceAbort();   // запись голосом ещё идёт (например, нажали Enter) — без второй отправки того же
  const ta = $('#ai_text'); text = String(text != null ? text : ta ? ta.value : ai.draft).trim().slice(0, AI_MAX);
  const img = ai.img || null;
  if (!text && !img) { if (ta) ta.focus(); return; }
  if (!navigator.onLine) { ai.err = 'Нет интернета — помощнику нужен сервер.'; ai.errT = text; return aiRefresh(); }   // сообщение не ушло — «Повторить» отправит его
  // Вопрос — со сводкой записей; короткое уточнение после ответа по сводке («а послезавтра», «и в пятницу») — тоже
  // Просят изменить уже созданное — сводка со ссылками на записи и основная модель; картинка — тоже основная модель
  // Изменить уже созданное — только по просьбе: «перенеси», «удали», «отметь»… или поправка к прошлому изменению («нет, на 11»).
  // Флаг edit уходит и на сервер: там такие записи без просьбы тоже отбрасываются (аудит 18 октября 2026)
  const prev = [...ai.msgs].reverse().find(m => m.r === 'a'), prevAct = !!(prev && prev.auto && (prev.items || []).some(x => AI_ACT.includes(x.type) && x.st === 'ok'));
  const edit = AI_EDIT.test(text) || (prevAct && text.length < 80 && /^\s*(?:нет|не\s|лучше|точнее|давай|а\s)/i.test(text));
  const ask = !edit && !img && (aiAsks(text) || !!(prev && prev.ask && !prev.hi && text.length < 60 && /^\s*(?:а|и|ещё|еще)(?=[\s,])/i.test(text)));
  const history = aiHist(), R = aiRefs();
  ai.msgs.push({ r:'u', t:text, day: todayK(), ...(img ? { img: img.thumb } : {}) }); ai.draft = ''; ai.err = ''; ai.errT = null; ai.busy = true; ai.img = null; aiClearAsk = 0; aiStore();
  if (ta && text === ta.value.trim()) { ta.value = ''; aiGrow(); }
  aiRefresh();
  const j = await aiCall({ mode:'chat', text: text || 'Разбери картинку и добавь в приложение, что на ней', ask, edit, history, ctx: aiCtx(ask || edit, R, edit ? text : ''), ...(img ? { image: img.data } : {}) });
  ai.busy = false;
  if (j.err) { ai.err = j.err; if (img) ai.img = img; }   // «Повторить» отправит картинку ещё раз
  else { const items = Array.isArray(j.items) ? j.items.filter(x => x && AI_T[x.type] && (edit || !AI_ACT.includes(x.type))) : [], nav = Array.isArray(j.nav) ? j.nav.filter(n => n && AI_NAV[n.to]) : [];
    const refs = {}; items.forEach(x => { if (x.ref && R.map[x.ref]) refs[x.ref] = R.map[x.ref]; });
    // Записи — сразу, без подтверждения; «нет, в 11» (fix) — исправленные прошлые записи отменяются, новые встают вместо них
    if (items.length && j.fix) aiFixPrev(items);
    // Удаление и больше трёх изменений за раз — не сразу, а по кнопке под сообщением (aiPeek только описывает, что будет)
    const askAll = items.filter(x => AI_ACT.includes(x.type)).length > 3;
    items.forEach(x => x.type === 'delete' || (askAll && AI_ACT.includes(x.type)) ? aiPeek(x, refs) : aiDo(x, refs));
    ai.msgs.push({ r:'a', t: String(j.reply || (items.length ? '' : 'Не понял, что сделать. Напишите подробнее.')), day: todayK(), tw: 1, ...(items.length ? { items, auto: 1 } : {}), ...(Object.keys(refs).length ? { refs } : {}), ...(nav.length ? { nav } : {}), ...(ask ? { ask: 1 } : {}) });
    if (items.length) { save(); render(); }
    const done = items.filter(x => x.st === 'ok').length, asks = items.filter(x => x.st === 'ask').length;   // окно чата закрыли до ответа — сказать, что сделано
    if ((done || asks) && !(sheetOpen() && $('#ai_log'))) toast(asks ? 'Помощник ждёт подтверждения в чате' : 'Помощник: ' + plural(done, ['изменение', 'изменения', 'изменений']) + ' — отменить можно в чате'); }
  aiStore(); aiRefresh();
}

// Отправить надиктованное: если помощник ещё отвечает (например, на приветствие) — дождаться, но не дольше 30 с
function aiSendWhenFree(n = 0) {
  const ta = $('#ai_text'); if (!ai || !ta || !ta.value.trim()) return;   // окно закрыли или текст стёрли
  if (!ai.busy) return aiSend();
  if (n < 100) setTimeout(() => aiSendWhenFree(n + 1), 300);
}
ACT.aigo = () => aiSend();
ACT.aiex = el => aiSend(el.dataset.t);
ACT.airetry = () => { if (ai && ai.errT != null) { const t = ai.errT; ai.errT = null; ai.err = ''; return aiSend(t); }
  const m = ai && ai.msgs[ai.msgs.length - 1]; if (!m || m.r !== 'u') return; ai.msgs.pop(); ai.err = ''; aiSend(m.t); };
ACT.aiclear = () => {
  if (!ai) return;
  if (!aiClearAsk) { aiClearAsk = setTimeout(() => { aiClearAsk = 0; aiRefresh(); }, 3000); return aiRefresh(); }
  clearTimeout(aiClearAsk); aiClearAsk = 0; ai.msgs = []; ai.err = ''; aiStore(); aiRefresh(); };
// Приветствие при первом открытии за день: подначка за просроченное или похвала за сделанное (если они включены у целей)
async function aiHello() {
  const P = S.settings.phr || {};
  if (!ai || ai.busy || !signedIn() || !navigator.onLine || ai.hello === todayK() || !(P.taunts || P.praise)) return;
  ai.hello = todayK(); ai.busy = true; aiStore(); aiRefresh();
  const j = await aiCall({ mode:'hello', text:'привет', ctx: aiCtx(true) });
  ai.busy = false;
  if (!j.err && j.reply) ai.msgs.push({ r:'a', t: String(j.reply), day: todayK(), hi: 1, ask: 1, tw: 1 });   // ошибку приветствия не показываем
  aiStore(); aiRefresh();
}

// ---- Отметить привычку: по названию (точно, иначе — по началу или вхождению), в клетке её вида: день, неделя месяца или месяц ----
const aiHab = name => { const n = String(name || '').toLowerCase().trim(); if (!n) return null;
  return S.habits.find(h => h.name.toLowerCase() === n) || S.habits.find(h => h.name.toLowerCase().startsWith(n) || n.startsWith(h.name.toLowerCase())) || S.habits.find(h => h.name.toLowerCase().includes(n) || n.includes(h.name.toLowerCase())) || null; };
const aiHabKey = (h, d) => h.kind === 'weekly' ? ymOf(d) + ':w' + (wkOf(d) + 1) : h.kind === 'monthly' ? ymOf(d) : d;
const aiMarked = (h, d) => !!h.log[aiHabKey(h, d)];
// Привычку можно отметить: она есть, ещё не отмечена и день не в будущем (задним числом — если это включено в настройках)
const aiCanMark = it => { const h = aiHab(it.habit), d = it.date && it.date <= todayK() ? it.date : todayK(); return !!h && !aiMarked(h, d) && !(h.kind === 'daily' && d < todayK() && !S.settings.habitPast); };

// ---- Сделать одну запись сразу (теми же записями, что создаёт приложение) и запомнить, что сделано, — чтобы отменить ----
// it.st: 'ok' — сделано (it.res — что именно), 'undone' — отменено, 'skip' — не получилось (it.why — почему)
function aiDo(it, refs) {
  delete it.why; it.res = null;
  const t = it.type;
  if (AI_ACT.includes(t)) return aiChange(it, refs);
  if (t === 'check') {
    const h = aiHab(it.habit), d = it.date && it.date <= todayK() ? it.date : todayK();
    if (!aiCanMark(it)) { it.st = 'skip'; it.why = !h ? 'такой привычки нет' : aiMarked(h, d) ? 'уже отмечена' : 'задним числом — выключено в настройках'; return; }
    const k = aiHabKey(h, d); h.log[k] = 1; it.res = { mark: [h.id, k] };
  } else if (t === 'task' || t === 'event') { const e = aiEvent(it); S.events.push(e); it.res = { ev: [e.id] }; }
  else if (t === 'habit') {
    if (S.habits.some(h => h.name.toLowerCase() === it.title.toLowerCase())) { it.st = 'skip'; it.why = 'такая привычка уже есть'; return; }
    const h = { id: 'h' + uid(), name: it.title, emoji: aiEmoji(it.emoji, it.title), kind: it.kind, days: it.kind === 'daily' ? it.days : [], from: todayK(), log: {} };
    S.habits.push(h); it.res = { hb: h.id };
  } else if (AI_KIND[t]) {
    const o = { id: 'o' + uid(), amt: it.amount, cat: aiFin(it.category, AI_KIND[t], it.note, it.amount).id, note: it.note || '', date: it.date && it.date <= todayK() ? it.date : todayK() };
    S.fin.ops.push(o); it.res = { op: o.id };
  } else if (t === 'goal') {
    const g = { id: 'g' + uid(), title: it.title, emoji: aiEmoji(it.emoji, it.title), due: it.due && it.due >= todayK() ? it.due : todayK().slice(0, 4) + '-12-31', created: todayK(), why: '', done: false, steps: [] }, ev = [];
    it.steps.forEach(s => { if (s.date) { const e = aiEvent({ type: 'task', title: s.title, date: s.date, prio: 'mid' }, { goal: g.id }); S.events.push(e); ev.push(e.id); } else g.steps.push({ id: 's' + uid(), t: s.title, done: false }); });
    S.goals.push(g); it.res = { goal: g.id, ev };
  } else if (t === 'note') { const n = { id: 'n' + uid(), date: todayK(), text: it.text }; S.notes.push(n); it.res = { note: n.id }; }
  else { it.st = 'skip'; it.why = 'не умею такое'; return; }
  it.st = 'ok';
}
// Исправление прошлого ответа: для каждой новой записи отменяется прошлая того же вида с тем же (или похожим) названием,
// а если такая запись была одна — она. Остальное из прошлого ответа не трогаем
const aiGrp = t => t === 'task' || t === 'event' ? 'ev' : t;
const aiName = x => String(x.title || x.habit || x.note || x.text || '').toLowerCase().trim();
function aiFixPrev(items) {
  const pm = [...ai.msgs].reverse().find(m => m.r === 'a' && m.auto); if (!pm) return;
  const pool = pm.items.filter(x => x.st === 'ok');
  items.forEach(n => {
    const same = pool.filter(x => aiGrp(x.type) === aiGrp(n.type)), nn = aiName(n);
    const hit = same.find(x => { const a = aiName(x); return a && nn && (a === nn || a.includes(nn) || nn.includes(a)); }) || (same.length === 1 ? same[0] : null);
    if (hit) { aiUndo(hit); hit.why = 'исправлено ниже'; pool.splice(pool.indexOf(hit), 1); }
  });
}
// ---- Изменить то, что уже есть (по ссылке [e3] / [m2] из сводки). В it.res — прежний вид записи, чтобы «Отменить» вернул как было ----
const aiByRef = (it, refs) => { const id = refs && refs[it.ref], k = String(it.ref || '')[0];
  return !id ? null : k === 'e' ? S.events.find(e => e.id === id) || null : k === 'm' ? S.fin.ops.find(o => o.id === id) || null : null; };
const aiWhen = (k, tm) => shortDate(k) + (tm ? ', ' + tm : '');
function aiSkip(it, why) { it.st = 'skip'; it.why = why; }
// Ждёт подтверждения: только описание — что и с какой записью будет; сама запись пока не меняется
function aiPeek(it, refs) {
  it.st = 'ask'; delete it.why; it.res = null;
  if (it.type === 'uncheck') { const h = aiHab(it.habit); it.lbl = h ? (h.emoji ? h.emoji + ' ' : '') + h.name : it.habit; return; }
  const x = aiByRef(it, refs); if (!x) return aiSkip(it, 'не нашёл эту запись');
  if (String(it.ref)[0] === 'm') { it.lbl = x.note || fcat(x.cat).name; it.chg = rub(x.amt) + ' · ' + shortDate(x.date); return; }
  it.lbl = x.title;
  if (it.type === 'delete') it.chg = it.only_date ? 'только ' + shortDate(it.only_date) : isRec(x) ? 'весь повтор' : aiWhen(x.date, x.time);
  else if (it.type === 'done') it.chg = it.done === false ? 'снять отметку' : 'отметить сделанным';
  else it.chg = '→ ' + [it.title && '«' + it.title + '»', it.date && shortDate(it.date), it.all_day ? 'без времени' : it.time].filter(Boolean).join(', ');
}
ACT.aiyes = el => { const m = ai && ai.msgs[+el.dataset.i]; if (!m || !m.items) return;
  m.items.forEach(x => { if (x.st === 'ask') { delete x.st; delete x.chg; aiDo(x, m.refs); } }); save(); aiStore(); render(); aiRefresh(); };
ACT.aino = el => { const m = ai && ai.msgs[+el.dataset.i]; if (!m || !m.items) return;
  m.items.forEach(x => { if (x.st === 'ask') { x.st = 'no'; x.why = 'вы не подтвердили'; } }); aiStore(); aiRefresh(); };
function aiChange(it, refs) {
  const t = it.type, today = todayK();
  if (t === 'uncheck') {   // снять отметку привычки
    const h = aiHab(it.habit), d = it.date && it.date <= today ? it.date : today; if (!h) return aiSkip(it, 'такой привычки нет');
    const k = aiHabKey(h, d); it.lbl = (h.emoji ? h.emoji + ' ' : '') + h.name; if (!h.log[k]) return aiSkip(it, 'и так не отмечена');
    delete h.log[k]; it.res = { unmark: [h.id, k] }; it.chg = h.kind === 'daily' ? relDay(d) : ''; it.st = 'ok'; return;
  }
  const x = aiByRef(it, refs); if (!x) return aiSkip(it, 'не нашёл эту запись');
  if (String(it.ref)[0] === 'm') {   // трата / доход
    const prev = { ...x }, c0 = fcat(x.cat); it.lbl = x.note || c0.name;
    if (t === 'delete') { S.fin.ops = S.fin.ops.filter(o => o.id !== x.id); it.res = { prevOp: [prev] }; it.chg = rub(x.amt) + ' · ' + shortDate(x.date); it.st = 'ok'; return; }
    if (t !== 'edit') return aiSkip(it, 'не умею такое');
    const kind = c0.g === 'inc' ? 'inc' : c0.g === 'sav' ? 'sav' : 'out', ch = [];
    if (it.amount > 0 && it.amount !== x.amt) { ch.push(rub(x.amt) + ' → ' + rub(it.amount)); x.amt = it.amount; }
    if (typeof it.note === 'string' && it.note && it.note !== x.note) { ch.push('«' + it.note + '»'); x.note = it.note; }
    if (it.category) { const c = aiFin(it.category, kind, x.note, x.amt); if (c.id !== x.cat) { ch.push(c.name); x.cat = c.id; } }
    if (it.date && it.date <= today && it.date !== x.date) { ch.push(shortDate(x.date) + ' → ' + shortDate(it.date)); x.date = it.date; }
    if (!ch.length) return aiSkip(it, 'нечего менять');
    const old = {}; ['amt', 'note', 'cat', 'date'].forEach(k => { if (prev[k] !== x[k]) old[k] = prev[k]; });
    it.res = { opFields: [x.id, old] }; it.chg = ch.join(', '); it.st = 'ok'; return;
  }
  const e = x, prev = structuredClone(e), rec = isRec(e); it.lbl = e.title;
  if (t === 'done') {
    const k = it.date || today, want = it.done !== false;
    if (rec) { if (!occurs(e, k)) return aiSkip(it, 'в этот день его нет'); if ((e.doneDates || []).includes(k) === want) return aiSkip(it, want ? 'уже отмечено' : 'и так не отмечено');
      e.doneDates = want ? [...(e.doneDates || []), k] : e.doneDates.filter(d => d !== k); it.res = { dd: [e.id, k, want] }; }
    else { if (!!e.done === want) return aiSkip(it, want ? 'уже отмечено' : 'и так не отмечено'); e.done = want; it.res = { fields: [e.id, { done: !!prev.done }] }; } it.chg = (want ? 'сделано' : 'не сделано') + (rec ? ' · ' + shortDate(k) : ''); it.st = 'ok'; return;
  }
  if (t === 'delete') {
    if (rec && it.only_date) { if (!occurs(e, it.only_date)) return aiSkip(it, 'в этот день его нет');
      e.skip = [...(e.skip || []), it.only_date]; it.res = { unskip: [e.id, it.only_date] }; it.chg = 'только ' + shortDate(it.only_date); it.st = 'ok'; return; }
    S.events = S.events.filter(v => v.id !== e.id); it.res = { prev: [prev] }; it.chg = rec ? 'весь повтор — ' + aiRep(e.repeat) : aiWhen(e.date, e.time); it.st = 'ok'; return;
  }
  // edit: только то, что пришло; у повтора с only_date — меняется один день (он выпадает из повтора и становится отдельной записью)
  const ch = {};
  if (it.title && it.title !== e.title) ch.title = it.title;
  if (typeof it.loc === 'string' && it.loc !== (e.loc || '')) ch.loc = it.loc;
  if (it.cat) { const c = aiCat(it.cat); if (c && c.id !== e.cat) ch.cat = c.id; }
  if (it.prio && it.prio !== e.prio) ch.prio = it.prio;
  if (it.all_day) { if (e.time) { ch.time = ''; ch.time2 = ''; } }
  else if (it.time) { const dur = e.time && e.time2 ? timeMin(e.time2) - timeMin(e.time) : 0;
    ch.time = it.time; ch.time2 = it.time2 && timeMin(it.time2) > timeMin(it.time) ? it.time2 : dur > 0 ? fmtMin(Math.min(1439, timeMin(it.time) + dur)) : ''; }
  else if (it.time2 && e.time && timeMin(it.time2) > timeMin(e.time)) ch.time2 = it.time2;
  if (Array.isArray(it.remind)) { const offs = [...it.remind].sort((a, b) => b - a);
    ch.reminder = offs.length ? { enabled: true, offsets: offs, offset: offs[offs.length - 1], repeat: 'none', days: [] } : { enabled: false, offset: 15, repeat: 'none', days: [] }; }
  const say = (a, b) => { const p = []; if (b.title !== a.title) p.push('«' + b.title + '»');
    if (b.date !== a.date || b.time !== a.time) p.push(aiWhen(a.date, a.time) + ' → ' + aiWhen(b.date, b.time));
    if (b.loc !== a.loc) p.push('место: ' + (b.loc || 'нет')); if (b.cat !== a.cat) p.push(((S.cats.find(c => c.id === b.cat) || {}).name) || '');
    if (b.prio !== a.prio && PRIO[b.prio]) p.push(PRIO[b.prio].n.toLowerCase()); if (ch.reminder) p.push(remOffs(b).length ? '🔔 ' + remOffs(b).map(remShort).join(', ') : 'без напоминаний');
    return p.filter(Boolean).join(', '); };
  if (rec && it.only_date) {
    if (!occurs(e, it.only_date)) return aiSkip(it, 'в этот день его нет');
    const c = Object.assign(structuredClone(e), { id: uid(), repeat: { type: 'none' }, date: it.date || it.only_date, done: isDone(e, it.only_date), doneDates: [], skip: [] }, ch);
    e.skip = [...(e.skip || []), it.only_date]; S.events.push(c);
    it.res = { unskip: [e.id, it.only_date], ev: [c.id] }; it.chg = say(Object.assign({}, e, { date: it.only_date }), c) || 'отдельно в этот день'; it.st = 'ok'; return;
  }
  if (it.date && !rec && it.date !== e.date) ch.date = it.date;
  if (!Object.keys(ch).length) return aiSkip(it, 'нечего менять');
  const old = {}; Object.keys(ch).forEach(k => { old[k] = structuredClone(prev[k] === undefined ? '' : prev[k]); });
  Object.assign(e, ch); it.res = { fields: [e.id, old] }; it.chg = say(prev, e); it.st = 'ok';
}
function aiUndo(it) {
  const r = it.res || {};
  if (r.ev && r.ev.length) S.events = S.events.filter(e => !r.ev.includes(e.id));
  // прежний вид изменённых и удалённых записей
  (r.prev || []).forEach(p => { if (!S.events.some(e => e.id === p.id)) S.events.push(structuredClone(p)); });   // удалённое — вернуть
  (r.prevOp || []).forEach(p => { if (!S.fin.ops.some(o => o.id === p.id)) S.fin.ops.push({ ...p }); });
  if (r.unmark) { const h = S.habits.find(x => x.id === r.unmark[0]); if (h) h.log[r.unmark[1]] = 1; }
  // изменения отменяются точечно: прежние значения только тех полей, что менялись, — другие правки той же записи остаются
  const ev = id => S.events.find(e => e.id === id);
  if (r.fields) { const e = ev(r.fields[0]); if (e) Object.assign(e, structuredClone(r.fields[1])); }
  if (r.unskip) { const e = ev(r.unskip[0]); if (e) e.skip = (e.skip || []).filter(d => d !== r.unskip[1]); }
  if (r.dd) { const [id, k, want] = r.dd, e = ev(id); if (e) e.doneDates = want ? (e.doneDates || []).filter(d => d !== k) : [...(e.doneDates || []), k]; }
  if (r.opFields) { const o = S.fin.ops.find(x => x.id === r.opFields[0]); if (o) Object.assign(o, r.opFields[1]); }
  if (r.hb) S.habits = S.habits.filter(h => h.id !== r.hb);
  if (r.op) S.fin.ops = S.fin.ops.filter(o => o.id !== r.op);
  if (r.goal) S.goals = S.goals.filter(g => g.id !== r.goal);
  if (r.note) S.notes = S.notes.filter(n => n.id !== r.note);
  if (r.mark) { const h = S.habits.find(x => x.id === r.mark[0]); if (h) delete h.log[r.mark[1]]; }
  it.res = null; it.st = 'undone'; delete it.why;
}
// Созданную помощником привычку или цель, которой с тех пор пользовались (есть отметки, сделанные шаги), «Отменить» не удаляет:
// вместе с ней пропали бы отметки, а «Вернуть» создаёт запись заново — уже пустой. Удалить можно в самом разделе
function aiUsed(it) {
  const r = it.res || {}, h = r.hb && S.habits.find(x => x.id === r.hb), g = r.goal && S.goals.find(x => x.id === r.goal);
  if (h && Object.keys(h.log || {}).length) return 'У привычки «' + h.name + '» уже есть отметки — удалить её можно в «Привычках»';
  if (g && (g.done || (g.steps || []).some(s => s.done) || S.events.some(e => e.goal === g.id && (e.done || (e.doneDates || []).length))))
    return 'В цели «' + g.title + '» уже есть сделанные шаги — удалить её можно во вкладке «Цели»';
  return '';
}
ACT.aiundo = el => {
  const [i, j] = String(el.dataset.i).split(':').map(Number), m = ai && ai.msgs[i], it = m && m.items && m.items[j]; if (!it) return;
  const used = it.st === 'ok' && aiUsed(it); if (used) return toast(used);
  if (it.st === 'ok') aiUndo(it); else if (it.st === 'undone') aiDo(it, m.refs); else return;
  save(); aiStore(); render(); aiRefresh();
};
ACT.aiundoall = el => { const m = ai && ai.msgs[+el.dataset.i]; if (!m || !m.items) return;
  let used = '';
  [...m.items].reverse().forEach(x => { if (x.st !== 'ok') return; const u = aiUsed(x); if (u) used = used || u; else aiUndo(x); });
  save(); aiStore(); render(); aiRefresh(); if (used) toast(used); };   // с конца: последнее сделанное — первым

// ---- Картинка к сообщению (18 октября 2026: «скинуть скрин расписания, а помощник заполнит календарь»). Уменьшается до 1600 px
// по большей стороне (JPEG), в сообщение — миниатюра 240 px (она и хранится в истории чата на устройстве). На ПК можно вставить Ctrl+V ----
const aiAttHTML = () => ai && ai.img ? `<div class="ai-attc"><img src="${ai.img.thumb}" alt="Прикреплённая картинка"><span>Картинка прикреплена — напишите, что с ней сделать, или просто отправьте</span><button class="ic" data-act="aiimgx" aria-label="Убрать картинку">${I(IC.x, 16)}</button></div>` : '';
const aiScale = (img, max, q) => { const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.naturalWidth * s)); c.height = Math.max(1, Math.round(img.naturalHeight * s));
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', q); };
async function aiPickImg(file) {
  if (!ai || !file) return;
  if (!/^image\//.test(file.type || '')) return toast('Это не картинка — нужен скриншот или фото');
  if (file.size > 30 * 1048576) return toast('Картинка слишком большая — больше 30 МБ');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    ai.img = { data: aiScale(img, 1600, 0.85), thumb: aiScale(img, 240, 0.7) };
    if (ai.img.data.length > 5.5e6) { ai.img = null; return toast('Картинка слишком большая — сделайте скриншот поменьше'); }
  } catch (e) { ai.img = null; toast('Не получилось открыть картинку — сохраните её как JPG или PNG'); }
  finally { URL.revokeObjectURL(url); }
  aiRefresh(); const ta = $('#ai_text'); if (ta) ta.focus();
}
ACT.aiimg = () => { const f = $('#ai_file'); if (f) { f.value = ''; f.click(); } };
ACT.aiimgx = () => { if (ai) { ai.img = null; aiRefresh(); } };
document.addEventListener('change', e => { if (e.target.id === 'ai_file' && e.target.files && e.target.files[0]) aiPickImg(e.target.files[0]); });
document.addEventListener('paste', e => { if (e.target.id !== 'ai_text' || !ai) return;
  const f = [...((e.clipboardData && e.clipboardData.files) || [])].find(x => /^image\//.test(x.type)); if (f) { e.preventDefault(); aiPickImg(f); } });

// ---- Старые сообщения (до 17 октября 2026): добавить отмеченное кнопкой. Одно «Отменить» на всё ----
const aiEmoji = (e, name) => e && /\p{Extended_Pictographic}/u.test(e) && e.length <= 8 ? e : ((HB_GUESS.find(([re]) => re.test(name.toLowerCase())) || [0, '🎯'])[1]);
function aiEvent(it, extra) {
  const date = it.date || todayK(), r = it.repeat;
  const repeat = r ? { type: r.type, days: r.type === 'weekly' ? (r.days.length ? r.days : [dowIdx(date)]) : [], ...(r.until && r.until >= date ? { until: r.until } : {}) } : { type: 'none' };
  const time2 = it.time && it.time2 && timeMin(it.time2) > timeMin(it.time) ? it.time2 : '';
  const offs = it.time && it.remind && it.remind.length ? it.remind : [];
  return Object.assign({ id: uid(), done: false, doneDates: [], skip: [], title: it.title, date, time: it.time || '', time2, cat: validCat((aiCat(it.cat) || {}).id || guessCat(it.title)),
    note: '', loc: it.loc || '', repeat, reminder: offs.length ? { enabled: true, offsets: offs, offset: Math.min(...offs), repeat: 'none', days: [] } : { enabled: false, offset: 15, repeat: 'none', days: [] },
    task: it.type === 'task' || (it.type === 'event' && !it.time), prio: it.prio || 'mid' }, extra || {});
}
ACT.aiapply = el => {
  const m = ai && ai.msgs[+el.dataset.i]; if (!m || !m.items || m.added != null) return;
  const L = m.items.filter(x => x.on); if (!L.length) return;
  snap();
  let n = 0, skipped = 0, noMark = 0;
  for (const it of L) {
    if (it.type === 'check') {
      const h = aiHab(it.habit), d = it.date && it.date <= todayK() ? it.date : todayK();
      if (!aiCanMark(it)) { noMark++; continue; }
      h.log[aiHabKey(h, d)] = 1; n++;
    }
    else if (it.type === 'task' || it.type === 'event') { S.events.push(aiEvent(it)); n++; }
    else if (it.type === 'habit') {
      if (S.habits.some(h => h.name.toLowerCase() === it.title.toLowerCase())) { skipped++; continue; }
      S.habits.push({ id: 'h' + uid(), name: it.title, emoji: aiEmoji(it.emoji, it.title), kind: it.kind, days: it.kind === 'daily' ? it.days : [], from: todayK(), log: {} }); n++;
    } else if (AI_KIND[it.type]) {
      const d = it.date && it.date <= todayK() ? it.date : todayK();
      S.fin.ops.push({ id: 'o' + uid(), amt: it.amount, cat: aiFin(it.category, AI_KIND[it.type], it.note, it.amount).id, note: it.note || '', date: d }); n++;
    } else if (it.type === 'goal') {
      const g = { id: 'g' + uid(), title: it.title, emoji: aiEmoji(it.emoji, it.title), due: it.due && it.due >= todayK() ? it.due : todayK().slice(0, 4) + '-12-31', created: todayK(), why: '', done: false, steps: [] };
      it.steps.forEach(s => { if (s.date) S.events.push(aiEvent({ type: 'task', title: s.title, date: s.date, prio: 'mid' }, { goal: g.id })); else g.steps.push({ id: 's' + uid(), t: s.title, done: false }); });
      S.goals.push(g); n++;
    } else if (it.type === 'note') { S.notes.push({ id: 'n' + uid(), date: todayK(), text: it.text }); n++; }
  }
  m.added = n; save(); aiStore(); render(); aiRefresh();
  toast(`Готово: ${plural(n, ['запись', 'записи', 'записей'])}${skipped ? ` · ${plural(skipped, ['привычка уже была', 'привычки уже были', 'привычек уже были'])}` : ''}${noMark ? ` · не отмечено: ${noMark}` : ''}`, true);
};
