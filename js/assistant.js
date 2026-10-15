// ---- ИИ-помощник (16 октября 2026, проба). Одно сообщение — текстом или голосом — раскладывается на задачи, события,
// привычки, цели, траты и заметки. Разбирает нейросеть на сервере (Edge Function assistant, сейчас DeepSeek);
// приложение показывает список «что добавлю», человек снимает лишние галочки и нажимает «Добавить» (одним «Отменить»).
// Нейросети уходит только текст сообщения и названия календарей, категорий трат, привычек и целей — не сами записи ----
let ai = null;   // { text, busy, reply, items:[{...it, on}], err, left }
const AI_MAX = 2000;
const AI_SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let aiRec = null;

const AI_T = { task:[IC.tasks, 'Задача'], event:[IC.cal, 'Событие'], habit:[IC.habit, 'Привычка'], expense:[IC.wallet, 'Расход'], income:[IC.wallet, 'Доход'], saving:[IC.wallet, 'Накопление'], goal:[IC.goal, 'Цель'], note:[IC.note, 'Заметка'] };
const aiRep = r => !r ? '' : r.type === 'daily' ? 'каждый день' : r.type === 'weekdays' ? 'по будням' : r.type === 'monthly' ? 'каждый месяц' : r.type === 'yearly' ? 'каждый год'
  : 'по ' + (r.days.length ? r.days.map(d => DOW[d].toLowerCase()).join(', ') : 'неделям');
const aiCat = name => { const n = String(name || '').toLowerCase(); return n && S.cats.find(c => c.name.toLowerCase() === n); };
// Категория трат: как назвала нейросеть (точно из списка), иначе — по словам, как в строке ввода («кофе» → «Кафе»), иначе — «Прочее»
const aiFin = (name, kind, note, amt) => { const n = String(name || '').toLowerCase(), gs = kind === 'out' ? FG_OUT : [kind];
  const hit = n && S.fin.cats.find(c => gs.includes(c.g) && c.name.toLowerCase() === n); if (hit) return hit;
  const p = note ? parseMoney(note + ' ' + Math.round(amt || 1), kind) : null; return p && p.ok ? fcat(p.cat) : kindDefaultCat(kind); };
const AI_KIND = { expense:'out', income:'inc', saving:'sav' };

// Что нейросеть знает о человеке: дата, часовой пояс и названия — без самих записей
const aiCtx = () => ({ today: todayK(), now: fmtMin(nowMin()), tz: S.settings.tz || '', cats: S.cats.map(c => c.name),
  fin: S.fin.cats.map(c => ({ n: c.name, g: c.g })), habits: S.habits.map(h => h.name), goals: activeGoals().map(g => g.title) });

function openAI(text) {
  if (aiRec) aiRec.stop();
  ai = { text: String(text || '').slice(0, AI_MAX), busy: false, reply: '', items: null, err: '', left: null };
  aiDraw();
  setTimeout(() => { const t = $('#ai_text'); if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); } }, 30);
}
ACT.aiopen = el => { const i = el.dataset.om && $('#' + el.dataset.om), t = i ? i.value : ''; if (i) { i.value = ''; omUpdate(i.id); } openAI(t); };

// Строка одной записи в списке «что добавлю»
function aiRow(it, i) {
  const [ic, kind] = AI_T[it.type] || [IC.note, 'Запись'], bits = [];
  if (it.type === 'task' || it.type === 'event') {
    bits.push(it.repeat ? aiRep(it.repeat) + (it.date && it.date !== todayK() ? ', с ' + relDay(it.date) : '') : relDay(it.date || todayK()));
    if (it.time) bits.push(it.time + (it.time2 ? '–' + it.time2 : ''));
    const c = aiCat(it.cat); if (c) bits.push(`<span class="ctag" style="--c:${c.color}"><i></i>${esc(c.name)}</span>`);
    if (it.type === 'task' && (it.prio === 'urgent' || it.prio === 'high')) bits.push(pbadge(it.prio));
    if (it.remind && it.remind.length) bits.push('🔔 ' + it.remind.map(remShort).join(', '));
    if (it.loc) bits.push(esc(it.loc));
  } else if (it.type === 'habit') bits.push(it.kind === 'weekly' ? 'раз в неделю' : it.kind === 'monthly' ? 'раз в месяц' : it.days.length ? 'по ' + it.days.map(d => DOW[d].toLowerCase()).join(', ') : 'каждый день');
  else if (AI_KIND[it.type]) { const c = aiFin(it.category, AI_KIND[it.type], it.note, it.amount); bits.push(`<b>${it.type === 'income' ? '+' : it.type === 'expense' ? '−' : ''}${rub(it.amount)}</b>`, esc((c.emoji || '') + ' ' + c.name)); if (it.date && it.date !== todayK()) bits.push(relDay(it.date)); }
  else if (it.type === 'goal') { bits.push('до ' + shortDate(it.due || todayK().slice(0, 4) + '-12-31')); if (it.steps.length) bits.push(plural(it.steps.length, ['шаг', 'шага', 'шагов'])); }
  const title = it.type === 'note' ? it.text : it.type === 'expense' || it.type === 'income' || it.type === 'saving' ? (it.note || kind) : (it.type === 'habit' || it.type === 'goal') && it.emoji ? it.emoji + ' ' + it.title : it.title;
  return `<label class="ai-row${it.on ? '' : ' off'}"><input type="checkbox" data-aion="${i}"${it.on ? ' checked' : ''}><span class="ai-k">${I(ic, 15)}${kind}</span>
    <span class="ai-b"><b>${esc(title)}</b>${bits.length ? `<small>${bits.join(' · ')}</small>` : ''}</span></label>`;
}

function aiDraw() {
  if (!ai) return;
  const on = ai.items ? ai.items.filter(x => x.on).length : 0;
  const mic = AI_SR ? `<button class="btn ai-mic${aiRec ? ' rec' : ''}" data-act="aimic" aria-pressed="${!!aiRec}">${I(IC.mic, 16)} ${aiRec ? 'Слушаю… нажмите, чтобы остановить' : 'Сказать голосом'}</button>` : '';
  const body = !signedIn()
    ? `<p class="set-note">Помощник работает через сервер, поэтому нужен вход в аккаунт.</p><button class="btn pri" style="width:100%" data-act="login">Войти по почте</button>`
    : `<textarea id="ai_text" class="fin ai-text" rows="4" maxlength="${AI_MAX}" placeholder="Например: завтра в 10 врач, до пятницы купить подарок маме !!, каждый день пить 2 литра воды, кофе 350, цель — выучить английский до лета" aria-label="Сообщение помощнику">${esc(ai.text)}</textarea>
    ${AI_SR ? '' : '<p class="ai-tip">Чтобы надиктовать, нажмите микрофон на клавиатуре телефона.</p>'}
    <div class="ai-bar">${mic}<button class="btn pri ai-go" data-act="aigo"${ai.busy ? ' disabled' : ''}>${ai.busy ? 'Разбираю…' : ai.items ? 'Разобрать заново' : 'Разобрать'}</button></div>
    ${ai.err ? `<p class="ai-err">${esc(ai.err)}</p>` : ''}
    ${ai.items ? `<div class="ai-out">${ai.reply ? `<p class="ai-reply">${I(IC.spark, 15)}<span>${esc(ai.reply)}</span></p>` : ''}
      ${ai.items.length ? `<div class="ai-list">${ai.items.map(aiRow).join('')}</div>
      <button class="btn pri" style="width:100%" data-act="aiapply"${on ? '' : ' disabled'}>${on ? `Добавить ${plural(on, ['запись', 'записи', 'записей'])}` : 'Отметьте, что добавить'}</button>` : ''}</div>` : ''}
    <p class="ai-note">Сообщение разбирает нейросеть DeepSeek (серверы в Китае). Ей уходит только текст сообщения и названия ваших календарей, категорий, привычек и целей — сами записи не отправляются. Не пишите пароли и номера карт.${ai.left != null ? ` Сегодня осталось запросов: ${ai.left}.` : ''}</p>`;
  sheet(`<div class="sh-head"><h3>${I(IC.spark, 18)} Помощник <em class="beta">β</em></h3><button class="ic" data-act="close" aria-label="Закрыть">${I(IC.x, 18)}</button></div>
    <p class="set-note" style="margin-top:0">Напишите или надиктуйте всё сразу — дела, встречи, привычки, цели, траты. Помощник разложит по разделам, вы проверите и добавите.</p>${body}`, true);
}
document.addEventListener('input', e => { if (e.target.id === 'ai_text' && ai) ai.text = e.target.value; });
document.addEventListener('change', e => { const i = e.target.dataset && e.target.dataset.aion; if (i == null || !ai || !ai.items) return;
  ai.items[+i].on = e.target.checked; aiDraw(); });
document.addEventListener('keydown', e => { if (e.target.id === 'ai_text' && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); aiGo(); } });

// Голосовой ввод (Web Speech API): где браузер умеет — кнопка «Сказать голосом», иначе — микрофон клавиатуры
ACT.aimic = () => {
  if (!AI_SR || !ai) return;
  if (aiRec) { aiRec.stop(); return; }
  const r = new AI_SR(), base = ai.text.trim() ? ai.text.trim() + ' ' : '';
  let said = '';
  r.lang = 'ru-RU'; r.interimResults = true; r.continuous = true;
  r.onresult = ev => { let tmp = ''; for (let i = ev.resultIndex; i < ev.results.length; i++) { const t = ev.results[i][0].transcript; if (ev.results[i].isFinal) said += t + ' '; else tmp += t; }
    ai.text = (base + said + tmp).slice(0, AI_MAX); const ta = $('#ai_text'); if (ta) ta.value = ai.text; };
  r.onerror = ev => { if (ev.error !== 'aborted' && ev.error !== 'no-speech') toast(ev.error === 'not-allowed' || ev.error === 'service-not-allowed' ? 'Нет доступа к микрофону — разрешите его в настройках браузера или нажмите микрофон на клавиатуре' : 'Не получилось распознать речь — попробуйте ещё раз'); };
  r.onend = () => { aiRec = null; if (ai && $('#ai_text')) aiDraw(); };   // окно помощника всё ещё открыто
  try { r.start(); aiRec = r; aiDraw(); } catch { aiRec = null; toast('Голосовой ввод сейчас недоступен — нажмите микрофон на клавиатуре'); }
};

async function aiGo() {
  if (!ai || ai.busy) return;
  if (aiRec) aiRec.stop();
  const ta = $('#ai_text'); if (ta) ai.text = ta.value;
  const text = ai.text.trim(); if (!text) { if (ta) ta.focus(); return toast('Напишите, что добавить'); }
  if (!navigator.onLine) { ai.err = 'Нет интернета — помощнику нужен сервер.'; return aiDraw(); }
  ai.busy = true; ai.err = ''; aiDraw();
  try {
    const r = await fetch(SUPABASE_URL + '/functions/v1/assistant', { method:'POST', cache:'no-store',
      headers:{ 'Content-Type':'application/json', apikey: SUPABASE_KEY, Authorization: 'Bearer ' + await accessToken() },
      body: JSON.stringify({ text, ctx: aiCtx() }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) ai.err = j.error === 'limit' ? `На сегодня запросы закончились (${j.limit} в день). Завтра снова можно.` : j.error === 'off' || r.status === 404 ? 'Помощник ещё не подключён к нейросети — скоро заработает.' : r.status === 403 ? 'Войдите в аккаунт заново.' : 'Нейросеть не ответила. Попробуйте ещё раз через минуту.';
    else { ai.reply = String(j.reply || ''); ai.items = (Array.isArray(j.items) ? j.items : []).map(x => Object.assign(x, { on: true })); ai.left = Number.isFinite(j.left) ? j.left : null;
      if (!ai.items.length && !ai.reply) ai.reply = 'Не нашёл, что добавить. Попробуйте написать подробнее.'; }
  } catch { ai.err = 'Не удалось связаться с сервером. Проверьте интернет.'; }
  ai.busy = false;
  if (ai && $('#ai_text')) aiDraw();   // рисуем, только если окно помощника не закрыли и не сменили другим
}
ACT.aigo = () => aiGo();

// ---- Добавить отмеченное — теми же записями, что создаёт приложение. Одно «Отменить» на всё ----
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
ACT.aiapply = () => {
  if (!ai || !ai.items) return;
  const L = ai.items.filter(x => x.on); if (!L.length) return;
  snap();
  let n = 0, skipped = 0;
  for (const it of L) {
    if (it.type === 'task' || it.type === 'event') { S.events.push(aiEvent(it)); n++; }
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
  save(); ai = null; closeSheet(); render();
  toast(`Добавлено: ${plural(n, ['запись', 'записи', 'записей'])}${skipped ? ` · ${plural(skipped, ['привычка уже была', 'привычки уже были', 'привычек уже были'])}` : ''}`, true);
};
