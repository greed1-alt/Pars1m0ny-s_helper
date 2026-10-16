// ---- ИИ-помощник: чат (16 октября 2026 — проба, с 17 октября — чат по просьбе пользователя). Разбирает нейросеть на сервере
// (Edge Function assistant; GigaChat от Сбера, бесплатный режим для физлиц: DeepSeek требовал иностранную карту).
// В интерфейсе — «Помощник Parsimony», без названия нейросети (просьба пользователя); кто обрабатывает данные — в памятке beta.html.
// Помощник раскладывает сообщения на задачи, события, привычки, цели, траты и заметки и отмечает привычки — сразу, без
// подтверждения (с 17 октября 2026, просьба пользователя), у каждой записи в ответе — «Отменить» / «Вернуть» (aiDo / aiUndo); отвечает на вопросы о делах, деньгах, целях и привычках, подсказывает,
// где что в приложении (кнопки перехода — AI_NAV), подначивает и хвалит (приветствие раз в день — aiHello).
// Нейросети уходят текст сообщения, несколько последних реплик и названия календарей, категорий, привычек и целей;
// когда человек спрашивает — ещё короткая сводка записей (aiData): без заметок, мест и самочувствия (решение пользователя).
// История чата — только на этом устройстве (remapp_chat), при выходе из аккаунта стирается (cloud.js → wipeDevice) ----
let ai = null;   // { msgs:[{ r:'u'|'a', t, day, items, added, nav, ask, hi }], hello, draft, busy, err, left }
const AI_MAX = 2000, AI_LS = 'remapp_chat', AI_KEEP = 40, AI_HIST = 8;
const AI_SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let aiRec = null, aiClearAsk = 0, aiVoiceIn = false;

const AI_T = { check:[IC.check, 'Отметить'], task:[IC.tasks, 'Задача'], event:[IC.cal, 'Событие'], habit:[IC.habit, 'Привычка'], expense:[IC.wallet, 'Расход'], income:[IC.wallet, 'Доход'], saving:[IC.wallet, 'Накопление'], goal:[IC.goal, 'Цель'], note:[IC.note, 'Заметка'] };
const aiRep = r => !r ? '' : r.type === 'daily' ? 'каждый день' : r.type === 'weekdays' ? 'по будням' : r.type === 'monthly' ? 'каждый месяц' : r.type === 'yearly' ? 'каждый год'
  : 'по ' + (r.days.length ? r.days.map(d => DOW[d].toLowerCase()).join(', ') : 'неделям');
const aiCat = name => { const n = String(name || '').toLowerCase(); return n && S.cats.find(c => c.name.toLowerCase() === n); };
// Категория трат: как назвала нейросеть (точно из списка), иначе — по словам, как в строке ввода («кофе» → «Кафе»), иначе — «Прочее»
const aiFin = (name, kind, note, amt) => { const n = String(name || '').toLowerCase(), gs = kind === 'out' ? FG_OUT : [kind];
  const hit = n && S.fin.cats.find(c => gs.includes(c.g) && c.name.toLowerCase() === n); if (hit) return hit;
  const p = note ? parseMoney(note + ' ' + Math.round(amt || 1), kind) : null; return p && p.ok ? fcat(p.cat) : kindDefaultCat(kind); };
const AI_KIND = { expense:'out', income:'inc', saving:'sav' };

// ---- Что нейросеть знает о человеке ----
const aiCtx = data => { const P = S.settings.phr || {};
  return { today: todayK(), now: fmtMin(nowMin()), tz: S.settings.tz || '', cats: S.cats.map(c => c.name),
    fin: S.fin.cats.map(c => ({ n: c.name, g: c.g })), habits: S.habits.map(h => h.name), goals: activeGoals().map(g => g.title),
    taunts: !!P.taunts, praise: !!P.praise, style: (P.custom || []).slice(0, 8).map(p => ({ k: p.kind, t: p.t })), ...(data ? { data: aiData() } : {}) }; };
// Сводка записей — только когда человек о чём-то спрашивает (и для приветствия): дела на 2 недели, пропущенное,
// деньги месяца по категориям, цели, привычки. Заметки, места, самочувствие и профиль не отправляются
const AI_DW = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
const aiD = k => k.slice(8) + '.' + k.slice(5, 7) + (k.slice(0, 4) !== todayK().slice(0, 4) ? '.' + k.slice(0, 4) : '');
function aiData() {
  const t = todayK(), ym = ymOf(t), L = [];
  const evTxt = (e, k) => { const c = S.cats.find(x => x.id === e.cat);
    return (isDone(e, k) ? '✓ ' : '') + (e.time ? e.time + (e.time2 ? '–' + e.time2 : '') + ' ' : '') + e.title
      + (e.task && e.prio === 'urgent' ? ' (срочно)' : e.task && e.prio === 'high' ? ' (важно)' : '') + (c ? ` [${c.name}]` : '') + (isRec(e) ? ' ↻' : ''); };
  const days = [];
  for (let i = 0; i < 14; i++) {
    const k = addDays(t, i), l = S.events.filter(e => occurs(e, k)).sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
    if (l.length) days.push(`${AI_DW[dowIdx(k)]} ${aiD(k)}${i === 0 ? ' (сегодня)' : i === 1 ? ' (завтра)' : ''}: ${l.slice(0, 12).map(e => evTxt(e, k)).join('; ')}${l.length > 12 ? `; и ещё ${l.length - 12}` : ''}`);
  }
  L.push('Дела и события на 14 дней (✓ — сделано, ↻ — повторяется; дней без дел нет в списке):', ...(days.length ? days : ['ничего не запланировано']));
  const ms = missedList();
  if (ms.length) L.push(`Пропущено — прошлые дела без отметки (${ms.length}): ` + ms.slice(0, 15).map(e => `${aiD(e.date)} ${e.title}`).join('; '));
  const st = finStat(ym), prev = finStat(ymAdd(ym, -1)), dl = dailyLimit(st, ym);
  if (st.ops.length || st.spentPlan || prev.ops.length) {
    L.push(`Деньги, ${ymTitle(ym).toLowerCase()}: потрачено ${rub(st.spent)}${st.spentPlan ? ' из бюджета ' + rub(st.spentPlan) : ' (бюджет не задан)'}; доходы ${rub(st.g.inc.fact)}; отложено ${rub(st.g.sav.fact)}`
      + (dl ? (dl.left >= 0 ? `; можно потратить сегодня ещё ${rub(dl.left)}` : `; дневной лимит превышен на ${rub(-dl.left)}`) : '') + `. В прошлом месяце потрачено ${rub(prev.spent)}.`);
    const cats = S.fin.cats.filter(c => FG_OUT.includes(c.g) && (st.fact[c.id] || c.plan)).sort((a, b) => (st.fact[b.id] || 0) - (st.fact[a.id] || 0)).slice(0, 15);
    if (cats.length) L.push('Расходы месяца по категориям: ' + cats.map(c => `${c.name} ${rub(st.fact[c.id] || 0)}${c.plan ? ' (бюджет ' + rub(c.plan) + ')' : ''}`).join('; ') + '.');
    const op = o => { const c = fcat(o.cat); return `${aiD(o.date)} ${c.g === 'inc' ? '+' : c.g === 'sav' ? 'в накопления ' : ''}${rub(o.amt)} ${o.note || c.name}${o.note ? ' (' + c.name + ')' : ''}`; };
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
const aiBrief = it => (AI_T[it.type] || [0, 'Запись'])[1] + ' «' + (it.title || it.habit || it.text || it.note || '') + '»' + (it.date ? ' ' + it.date : '') + (it.time ? ' ' + it.time : '') + (it.amount ? ' ' + it.amount + ' ₽' : '');
const aiSt = x => x.st === 'ok' ? 'сделано' : x.st === 'undone' ? 'пользователь отменил' : 'не получилось' + (x.why ? ' — ' + x.why : '');
const aiHist = () => ai.msgs.slice(-AI_HIST).map(m => ({ r: m.r, t: ((m.t || '') + (!m.items || !m.items.length ? '' : m.auto ? ` [${m.items.map(x => aiBrief(x) + ' — ' + aiSt(x)).join('; ')}]`
  : ` [предложено: ${m.items.map(aiBrief).join('; ')} — ${m.added != null ? 'добавлено' : 'пока не добавлено'}]`)).slice(0, 700) }));

// ---- Куда помощник может отправить кнопкой (ключи — те же, что в функции assistant → NAV) ----
const aiSec = s => () => { if (!secOn(s)) { toast('Этот раздел выключен — его можно включить здесь'); return aiSet('secs')(); } if (s === 'tasks' && tView === 'goals') tView = 'main'; setSec(s); };
const aiSet = k => () => { if (sec !== 'settings') setSec('settings');
  requestAnimationFrame(() => { const c = $('#st-' + k); if (!c) return; c.scrollIntoView({ block: 'start', behavior: 'smooth' }); c.classList.add('ai-flash'); setTimeout(() => c.classList.remove('ai-flash'), 1800); }); };
const AI_NAV = { home:['Главная', aiSec('home')], cal:['Календарь', aiSec('cal')], tasks:['Задачи', aiSec('tasks')], goals:['Цели', () => goGoals()], habits:['Привычки', aiSec('habits')], fin:['Финансы', aiSec('fin')],
  budget:['Бюджет на месяц', () => openBudget()], missed:['Вы пропустили', () => ACT.missopen()], profile:['Профиль', () => setSec('profile')], settings:['Настройки', aiSet('look')],
  set_look:['Оформление', aiSet('look')], set_cal:['Настройки календаря', aiSet('cal')], set_cats:['Календари', aiSet('cats')], set_layout:['Расположение', aiSet('secs')], sections:['Разделы и вкладки', () => openSecs()],
  set_notif:['Напоминания', aiSet('notif')], set_data:['Аккаунт и данные', aiSet('data')], tour:['Знакомство с приложением', () => openTourMenu()], feedback:['Отзыв', () => ACT.feedback()] };
ACT.ainav = el => { const n = AI_NAV[el.dataset.to]; if (!n) return; closeSheet(); n[1](); };

// ---- Окно ----
function openAI(text) {
  if (aiRec) aiRec.stop();
  if (!ai) { const st = aiLoad(); ai = { msgs: st.msgs, hello: st.hello || '', draft: '', busy: false, err: '', left: null }; }
  if (text) ai.draft = String(text).slice(0, AI_MAX);
  ai.err = ''; aiClearAsk = 0;
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
  const title = it.type === 'note' ? it.text : it.type === 'check' ? (hb ? (hb.emoji ? hb.emoji + ' ' : '') + hb.name : it.habit) : AI_KIND[it.type] ? (it.note || kind) : (it.type === 'habit' || it.type === 'goal') && it.emoji ? it.emoji + ' ' + it.title : it.title;
  if (auto) {
    const st = it.st || 'skip', ico = st === 'ok' ? IC.check : st === 'undone' ? IC.undo : IC.alert;
    if (it.why) bits.push(esc(it.why));
    const btn = st === 'ok' || st === 'undone' ? `<button class="ai-undo" data-act="aiundo" data-i="${key}">${st === 'ok' ? 'Отменить' : 'Вернуть'}</button>` : '';
    return `<div class="ai-row ai-auto st-${st}"><span class="ai-chk">${I(ico, 14)}</span><span class="ai-k">${I(ic, 15)}${kind}</span>
      <span class="ai-b"><b>${esc(title)}</b>${bits.length ? `<small>${bits.join(' · ')}</small>` : ''}</span>${btn}</div>`;
  }
  const tag = locked ? 'div' : 'label', box = locked ? `<span class="ai-chk">${I(IC.check, 14)}</span>` : `<input type="checkbox" data-aion="${key}"${it.on ? ' checked' : ''}>`;
  return `<${tag} class="ai-row${it.on || locked ? '' : ' off'}">${box}<span class="ai-k">${I(ic, 15)}${kind}</span>
    <span class="ai-b"><b>${esc(title)}</b>${bits.length ? `<small>${bits.join(' · ')}</small>` : ''}</span></${tag}>`;
}
// Текст ответа: экранируется; **жирный** и переводы строк — как в чате
const aiTxt = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
function aiMsg(m, i) {
  if (m.r === 'u') return `<div class="ai-m u"><div class="ai-mb">${aiTxt(m.t)}</div></div>`;
  const it = m.items || [], on = it.filter(x => x.on).length, added = m.added != null, okN = it.filter(x => x.st === 'ok').length;
  const list = m.auto && it.length ? `<div class="ai-list">${it.map((x, j) => aiRow(x, i + ':' + j, 'auto')).join('')}</div>
    ${okN > 1 ? `<button class="ai-undoall" data-act="aiundoall" data-i="${i}">${I(IC.undo, 14)} Отменить всё</button>` : ''}` : it.length ? `<div class="ai-list">${(added ? it.filter(x => x.on) : it).map((x, j) => aiRow(x, i + ':' + j, added ? 'done' : 'pick')).join('')}</div>
    ${added ? `<p class="ai-ok">${I(IC.check, 14)} ${m.added ? 'Готово: ' + plural(m.added, ['запись', 'записи', 'записей']) : 'Ничего не изменилось — это уже было'}</p>`
      : `<button class="btn pri ai-add" data-act="aiapply" data-i="${i}"${on ? '' : ' disabled'}>${on ? (it.every(x => !x.on || x.type === 'check') ? 'Отметить' : `Добавить ${plural(on, ['запись', 'записи', 'записей'])}`) : 'Выберите, что добавить'}</button>`}` : '';
  const nav = (m.nav || []).filter(n => AI_NAV[n.to]).map(n => `<button class="ai-nav" data-act="ainav" data-to="${n.to}">${esc(n.label || AI_NAV[n.to][0])}${I(IC.right, 14)}</button>`).join('');
  const say = m.t && (AI_TTS || m.sig) ? `<button class="ai-say${aiSpeak === i ? ' on' : ''}" data-act="aisay" data-i="${i}" aria-label="${aiSpeak === i ? 'Остановить' : 'Прочитать вслух'}" title="${aiSpeak === i ? 'Остановить' : 'Прочитать вслух'}">${I(aiSpeak === i ? IC.stop : IC.vol, 16)}</button>` : '';
  return `<div class="ai-m a"><span class="ai-av">${I(IC.spark, 14)}</span><div class="ai-mb">${m.t ? `<p>${say}${aiTxt(m.t)}</p>` : ''}${list}${nav ? `<div class="ai-navs">${nav}</div>` : ''}</div></div>`;
}
const AI_EX = ['Что у меня завтра?', 'Сколько я потратил в этом месяце?', 'Как дела с моими целями?', 'Как поменять цвета приложения?', 'Завтра в 10 врач, кофе 350, каждый день пить воду'];
function aiLogHTML() {
  let out = '', day = '';
  if (!ai.msgs.length && !ai.busy) out = `<div class="ai-hi"><span class="ai-av big">${I(IC.spark, 20)}</span><b>Чем помочь?</b>
    <p>Расскажите о планах и тратах — разложу по разделам. Или спросите о делах, деньгах и целях, о том, где что в приложении.</p>
    <div class="ai-ex">${AI_EX.map(x => `<button data-act="aiex" data-t="${esc(x)}">${esc(x)}</button>`).join('')}</div></div>`;
  ai.msgs.forEach((m, i) => { if (m.day && m.day !== day) { day = m.day; const d = relDay(day); out += `<div class="ai-day">${d[0].toUpperCase() + d.slice(1)}</div>`; } out += aiMsg(m, i); });
  if (ai.busy) out += `<div class="ai-m a"><span class="ai-av">${I(IC.spark, 14)}</span><div class="ai-mb ai-typing" aria-label="Помощник печатает"><i></i><i></i><i></i></div></div>`;
  if (ai.err) out += `<div class="ai-err"><span>${esc(ai.err)}</span><button class="btn" data-act="airetry">${I(IC.rep, 15)} Повторить</button></div>`;
  return out;
}
function aiDraw() {
  if (!ai) return;
  const head = `<div class="sh-head"><h3>${I(IC.spark, 18)} Помощник Parsimony <em class="beta">β</em></h3>`;
  if (!signedIn()) return sheet(`${head}<button class="ic" data-act="close" aria-label="Закрыть">${I(IC.x, 18)}</button></div>
    <p class="set-note">Помощник работает через сервер, поэтому нужен вход в аккаунт.</p><button class="btn pri" style="width:100%" data-act="login">Войти по почте</button>`);
  sheet(`<div class="ai-chat">${head}<button class="ai-clear" id="ai_clear" data-act="aiclear"${ai.msgs.length ? '' : ' hidden'} title="Очистить чат">${I(IC.trash, 16)}<span>Очистить?</span></button><button class="ic" data-act="close" aria-label="Закрыть">${I(IC.x, 18)}</button></div>
    <div class="ai-log" id="ai_log" aria-live="polite">${aiLogHTML()}</div>
    <div class="ai-in">
      <textarea id="ai_text" rows="1" maxlength="${AI_MAX}" placeholder="${AI_SR ? 'Напишите или скажите…' : 'Напишите или нажмите микрофон на клавиатуре…'}" aria-label="Сообщение помощнику">${esc(ai.draft)}</textarea>
      ${AI_SR ? `<button class="ai-ib ai-mic${aiRec ? ' rec' : ''}" id="ai_mic" data-act="aimic" aria-pressed="${!!aiRec}" title="${aiRec ? 'Остановить запись' : 'Сказать голосом'}" aria-label="Сказать голосом">${I(IC.mic, 18)}</button>` : ''}
      <button class="ai-ib ai-send" id="ai_send" data-act="aigo" title="Отправить" aria-label="Отправить"${ai.busy ? ' disabled' : ''}>${I(IC.send, 18)}</button>
    </div>
    <p class="ai-note">Помощник Parsimony · данные в России${hintK('aiData')}<span id="ai_left">${ai.left != null ? ' · осталось сегодня: ' + ai.left : ''}</span></p></div>`);
  aiGrow(); aiScroll();
}
// Перерисовка только ленты и кнопок — поле ввода и клавиатура телефона не сбрасываются
function aiRefresh() {
  const log = $('#ai_log'); if (!ai || !log) return;   // окно помощника закрыто или сменилось другим
  log.innerHTML = aiLogHTML(); aiScroll();
  const s = $('#ai_send'); if (s) s.disabled = ai.busy;
  const m = $('#ai_mic'); if (m) { m.classList.toggle('rec', !!aiRec); m.setAttribute('aria-pressed', String(!!aiRec)); m.title = aiRec ? 'Остановить запись' : 'Сказать голосом'; }
  const n = $('#ai_left'); if (n) n.textContent = ai.left != null ? ' · осталось сегодня: ' + ai.left : '';
  const c = $('#ai_clear'); if (c) { c.hidden = !ai.msgs.length; c.classList.toggle('ask', !!aiClearAsk); }
}
const aiScroll = () => { const l = $('#ai_log'); if (l) l.scrollTop = l.scrollHeight; };
const aiGrow = () => { const t = $('#ai_text'); if (!t) return; t.style.height = 'auto'; const h = t.scrollHeight; t.style.height = Math.min(h, 140) + 'px'; t.style.overflowY = h > 140 ? 'auto' : 'hidden'; };
document.addEventListener('input', e => { if (e.target.id === 'ai_text' && ai) { ai.draft = e.target.value; aiVoiceIn = false; aiGrow(); } });
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
  if (aiSpeak >= 0 && !(sheetOpen() && $('.ai-chat'))) aiHush();   // окно помощника закрыли — замолчать
}
if (window.visualViewport) { visualViewport.addEventListener('resize', aiVV); visualViewport.addEventListener('scroll', aiVV); }
{ const ov = $('#ov'), sh = $('#sh'); if (ov && sh && window.MutationObserver) { const mo = new MutationObserver(aiVV); mo.observe(ov, { attributes: true, attributeFilter: ['class'] }); mo.observe(sh, { childList: true }); } }

// Голосовой ввод (Web Speech API): где браузер умеет — кнопка с микрофоном, иначе — микрофон клавиатуры
ACT.aimic = () => {
  if (!AI_SR || !ai) return;
  if (aiRec) { aiRec.stop(); return; }
  const ta = $('#ai_text'), r = new AI_SR(), base = ta && ta.value.trim() ? ta.value.trim() + ' ' : '';
  let said = '', quiet = 0;
  // 5 секунд тишины (ничего не распознано) — микрофон выключается сам (просьба пользователя 17 октября 2026)
  const arm = () => { clearTimeout(quiet); quiet = setTimeout(() => { try { r.stop(); } catch (e) {} }, 5000); };
  r.lang = 'ru-RU'; r.interimResults = true; r.continuous = true;
  r.onresult = ev => { arm(); let tmp = ''; for (let i = ev.resultIndex; i < ev.results.length; i++) { const t = ev.results[i][0].transcript; if (ev.results[i].isFinal) said += t + ' '; else tmp += t; }
    ai.draft = (base + said + tmp).slice(0, AI_MAX); aiVoiceIn = true; const t = $('#ai_text'); if (t) { t.value = ai.draft; aiGrow(); } };
  r.onerror = ev => { if (ev.error !== 'aborted' && ev.error !== 'no-speech') toast(ev.error === 'not-allowed' || ev.error === 'service-not-allowed' ? 'Нет доступа к микрофону — разрешите его в настройках браузера или нажмите микрофон на клавиатуре' : 'Не получилось распознать речь — попробуйте ещё раз'); };
  r.onend = () => { clearTimeout(quiet); aiRec = null; aiRefresh(); };
  try { r.start(); aiRec = r; arm(); aiRefresh(); } catch (e) { aiRec = null; toast('Голосовой ввод сейчас недоступен — нажмите микрофон на клавиатуре'); }
};

// ---- Сервер ----
// Понятная причина ошибки; в скобках — служебный код, по нему видно, где сбой (ответ сервера · что случилось · код нейросети · какая нейросеть)
function aiErr(st, j) {
  const e = j.error, c = Number(j.code) || 0, p = String(j.p || '').replace(/[^a-z]/g, ''), tag = ` (${st}${e ? ' · ' + e : ''}${c ? ' ' + c : ''}${p ? ' · ' + p[0].toUpperCase() : ''})`;   // G — GigaChat, D — DeepSeek
  if (e === 'limit') return `На сегодня запросы закончились (${j.limit} в день). Завтра снова можно.`;
  if (e === 'off' || st === 404) return 'Помощник ещё не подключён к нейросети — скоро заработает.';
  if (st === 401 || st === 403) return 'Войдите в аккаунт заново.' + tag;
  if (e === 'model') return (c === 401 ? 'Помощник временно не работает: нейросеть не приняла ключ.' : c === 402 ? 'Помощник временно не работает: закончился запас запросов к нейросети. Мы уже знаем и чиним.'
    : c === 429 ? 'Нейросеть сейчас перегружена — попробуйте через минуту.' : 'Нейросеть не ответила — попробуйте ещё раз через минуту.') + tag;
  if (e === 'net') return 'Сервер помощника не смог связаться с нейросетью — попробуйте позже.' + tag;
  if (e === 'parse') return 'Нейросеть ответила непонятно — попробуйте ещё раз или напишите проще.' + tag;
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
  if (!ai || ai.busy) return;
  if (aiRec) aiRec.stop();
  const ta = $('#ai_text'); text = String(text != null ? text : ta ? ta.value : ai.draft).trim().slice(0, AI_MAX);
  if (!text) { if (ta) ta.focus(); return; }
  if (!navigator.onLine) { ai.err = 'Нет интернета — помощнику нужен сервер.'; return aiRefresh(); }
  // Вопрос — со сводкой записей; короткое уточнение после ответа по сводке («а послезавтра», «и в пятницу») — тоже
  const prev = [...ai.msgs].reverse().find(m => m.r === 'a'), ask = aiAsks(text) || !!(prev && prev.ask && !prev.hi && text.length < 60 && /^\s*(?:а|и|ещё|еще)(?=[\s,])/i.test(text));
  const history = aiHist(), speak = aiVoiceIn; aiVoiceIn = false;
  if (speak) aiUnlock();   // iPhone разрешает говорить только после нажатия — «будим» голос сейчас, ответ придёт позже
  ai.msgs.push({ r:'u', t:text, day: todayK() }); ai.draft = ''; ai.err = ''; ai.busy = true; aiClearAsk = 0; aiStore();
  if (ta && text === ta.value.trim()) { ta.value = ''; aiGrow(); }
  aiRefresh();
  const j = await aiCall({ mode:'chat', text, ask, history, ctx: aiCtx(ask) });
  ai.busy = false;
  if (j.err) ai.err = j.err;
  else { const items = Array.isArray(j.items) ? j.items.filter(x => x && AI_T[x.type]) : [], nav = Array.isArray(j.nav) ? j.nav.filter(n => n && AI_NAV[n.to]) : [];
    // Записи — сразу, без подтверждения; «нет, в 11» (fix) — исправленные прошлые записи отменяются, новые встают вместо них
    if (items.length && j.fix) aiFixPrev(items);
    items.forEach(aiDo);
    ai.msgs.push({ r:'a', t: String(j.reply || (items.length ? '' : 'Не понял, что сделать. Напишите подробнее.')), day: todayK(), ...(items.length ? { items, auto: 1 } : {}), ...(nav.length ? { nav } : {}), ...(ask ? { ask: 1 } : {}), ...(typeof j.say === 'string' ? { sig: j.say } : {}) });
    if (items.length) { save(); render(); } }
  aiStore(); aiRefresh();
  if (speak && !j.err && $('#ai_log')) aiSay(ai.msgs.length - 1);   // спросили голосом — отвечаем голосом
}

// ---- Ответ вслух: кнопка у ответа; если спросили голосом — сам. Живой голос — облачный (Яндекс SpeechKit через функцию
// assistant, mode «tts»; у ответа есть подпись sig — сервер озвучивает только свои ответы), если он не подключён или не
// ответил — голос самого устройства (Web Speech API) ----
const AI_TTS = !!(window.speechSynthesis && window.SpeechSynthesisUtterance);
let aiSpeak = -1, aiVoice = null, aiCloudOff = false;
const aiAudio = new Audio(), aiUrls = new WeakMap();   // озвученные ответы — чтобы повтор не грузить заново
// 0,1 с тишины: проиграть её по нажатию — и iPhone разрешит потом включить голос, который ещё грузится
const aiSilent = (() => { const n = 800, b = new Uint8Array(44 + n * 2), v = new DataView(b.buffer), w = (o, s) => [...s].forEach((c, k) => { b[o + k] = c.charCodeAt(0); });
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true); v.setUint32(28, 16000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
  return URL.createObjectURL(new Blob([b], { type: 'audio/wav' })); })();
// Самый живой русский голос из тех, что есть на устройстве
const aiPickVoice = () => { const v = speechSynthesis.getVoices().filter(x => /^ru/i.test(x.lang));
  return v.find(x => /natural|online|neural|enhanced|premium|улучш/i.test(x.name)) || v.find(x => /milena|милена|google|svetlana|dariya|katya/i.test(x.name)) || v[0] || null; };
if (AI_TTS && speechSynthesis.addEventListener) speechSynthesis.addEventListener('voiceschanged', () => { aiVoice = null; });
const aiUnlock = () => {
  try { aiAudio.onended = aiAudio.onerror = null; aiAudio.src = aiSilent; const p = aiAudio.play(); if (p) p.catch(() => {}); } catch (e) {}
  if (AI_TTS) try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } catch (e) {} };
function aiHush(quiet) { try { aiAudio.pause(); } catch (e) {} if (AI_TTS) try { speechSynthesis.cancel(); } catch (e) {} aiSpeak = -1; if (!quiet) aiRefresh(); }
const aiClean = s => s.replace(/^\s*•\s*/gm, '').replace(/\*\*/g, '').replace(/[«»"„“]/g, '');
async function aiTTS(m) {
  try {
    const r = await fetch(SUPABASE_URL + '/functions/v1/assistant', { method:'POST', cache:'no-store',
      headers:{ 'Content-Type':'application/json', apikey: SUPABASE_KEY, Authorization: 'Bearer ' + await accessToken() }, body: JSON.stringify({ mode:'tts', text: m.t, sig: m.sig }) });
    if (!r.ok) { if (r.status === 503) aiCloudOff = true; return null; }
    const b = await r.blob(); return b.size > 200 ? URL.createObjectURL(b) : null;
  } catch (e) { return null; }
}
async function aiSay(i) {
  const m = ai && ai.msgs[i]; if (!m || !m.t) return;
  if (aiSpeak === i) return aiHush();
  aiHush(true); aiSpeak = i; aiRefresh(); aiUnlock();
  if (m.sig && !aiCloudOff) {
    let url = aiUrls.get(m);
    if (!url) { url = await aiTTS(m); if (url) aiUrls.set(m, url); }
    if (aiSpeak !== i) return;   // пока грузилось — остановили или включили другой ответ
    if (url) { aiAudio.onended = aiAudio.onerror = () => { if (aiSpeak === i) { aiSpeak = -1; aiRefresh(); } }; aiAudio.src = url;
      try { await aiAudio.play(); return; } catch (e) {} }
  }
  aiDevSay(m, i);
}
function aiDevSay(m, i) {
  if (!AI_TTS) { aiSpeak = -1; aiRefresh(); return toast('Озвучка на этом устройстве недоступна'); }
  try { speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(aiClean(m.t));
    u.lang = 'ru-RU'; aiVoice = aiVoice || aiPickVoice(); if (aiVoice) u.voice = aiVoice; u.rate = 1.05;
    u.onend = u.onerror = () => { if (aiSpeak === i) { aiSpeak = -1; aiRefresh(); } };
    aiSpeak = i; speechSynthesis.speak(u);
  } catch (e) { aiSpeak = -1; toast('Озвучка на этом устройстве недоступна'); }
  aiRefresh();
}
ACT.aisay = el => aiSay(+el.dataset.i);
ACT.aigo = () => aiSend();
ACT.aiex = el => aiSend(el.dataset.t);
ACT.airetry = () => { const m = ai && ai.msgs[ai.msgs.length - 1]; if (!m || m.r !== 'u') return; ai.msgs.pop(); ai.err = ''; aiSend(m.t); };
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
  if (!j.err && j.reply) ai.msgs.push({ r:'a', t: String(j.reply), day: todayK(), hi: 1, ask: 1, ...(typeof j.say === 'string' ? { sig: j.say } : {}) });   // ошибку приветствия не показываем
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
function aiDo(it) {
  delete it.why; it.res = null;
  const t = it.type;
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
function aiUndo(it) {
  const r = it.res || {};
  if (r.ev && r.ev.length) S.events = S.events.filter(e => !r.ev.includes(e.id));
  if (r.hb) S.habits = S.habits.filter(h => h.id !== r.hb);
  if (r.op) S.fin.ops = S.fin.ops.filter(o => o.id !== r.op);
  if (r.goal) S.goals = S.goals.filter(g => g.id !== r.goal);
  if (r.note) S.notes = S.notes.filter(n => n.id !== r.note);
  if (r.mark) { const h = S.habits.find(x => x.id === r.mark[0]); if (h) delete h.log[r.mark[1]]; }
  it.res = null; it.st = 'undone'; delete it.why;
}
ACT.aiundo = el => {
  const [i, j] = String(el.dataset.i).split(':').map(Number), m = ai && ai.msgs[i], it = m && m.items && m.items[j]; if (!it) return;
  if (it.st === 'ok') aiUndo(it); else if (it.st === 'undone') aiDo(it); else return;
  save(); aiStore(); render(); aiRefresh();
};
ACT.aiundoall = el => { const m = ai && ai.msgs[+el.dataset.i]; if (!m || !m.items) return;
  m.items.forEach(x => { if (x.st === 'ok') aiUndo(x); }); save(); aiStore(); render(); aiRefresh(); };

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
