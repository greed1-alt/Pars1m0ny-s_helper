// ---- Привычки: таблица на месяц по неделям, проценты, сравнение с прошлым месяцем, самочувствие, заметки ----
// Привычка: { id, name, emoji, kind:'daily'|'weekly'|'monthly', days:[0..6] (для daily: пусто = каждый день), from, log:{ ключ:1 } }
// Ключ отметки: день «2026-10-05», неделя «2026-10:w2» (недели месяца: 1–7, 8–14, 15–21, 22–28, 29–31), месяц «2026-10».
const BIO_DEF = [
  { id:'sleep', name:'Сон', emoji:'😴', type:'hours', plan:8 },
  { id:'energy', name:'Энергия', emoji:'⚡', type:'score', plan:5 },
  { id:'mood', name:'Настроение', emoji:'🙂', type:'score', plan:5 },
  { id:'prod', name:'Продуктивность', emoji:'🚀', type:'score', plan:5 },
  { id:'focus', name:'Фокус', emoji:'🎯', type:'score', plan:5 },
  { id:'stress', name:'Стресс', emoji:'🌪️', type:'score', plan:1, low:true },
];
const HB_EMOJI = ['💧','🏃','📚','🧘','💪','🥗','😴','📝','🚭','🍎','🧹','💊','🚶','🎯','🙏','📵','☀️','🛌','🎸','🧠','💻','💰','🌿','❤️','🦷','🧴','🏋️','✍️'];
onMigrate(() => {
  if (!Array.isArray(S.habits)) S.habits = [];
  S.habits.forEach(h => {
    if (!h.id) h.id = 'h' + uid();
    if (!h.log || typeof h.log !== 'object') h.log = {};
    if (!['daily', 'weekly', 'monthly'].includes(h.kind)) h.kind = 'daily';
    if (!Array.isArray(h.days)) h.days = [];
    if (!h.from) h.from = todayK();
  });
  if (!S.bio || typeof S.bio !== 'object') S.bio = {};
  if (!Array.isArray(S.bio.metrics)) S.bio.metrics = structuredClone(BIO_DEF);
  if (!S.bio.log || typeof S.bio.log !== 'object') S.bio.log = {};
  // Заметки — журнал записей с датой: { id, date, text }. Старый текст месяца (S.hnotes) превращается в запись.
  if (!Array.isArray(S.notes)) S.notes = [];
  if (S.hnotes && typeof S.hnotes === 'object') {
    Object.entries(S.hnotes).forEach(([ym, txt]) => { if (typeof txt === 'string' && txt.trim()) S.notes.push({ id:'n' + uid() + ym, date: ym === ymOf(todayK()) ? todayK() : ym + '-01', text: txt.trim() }); });
    delete S.hnotes;
  }
  S.notes = S.notes.filter(n => n && /^\d{4}-\d{2}-\d{2}$/.test(n.date) && typeof n.text === 'string');
  if (S.settings.habitPast == null) S.settings.habitPast = true;
});

const wkOf = k => Math.floor((Number(k.slice(8)) - 1) / 7);   // неделя месяца 0..4
const monthWeeks = ym => { const w = []; ymDays(ym).forEach(k => (w[wkOf(k)] = w[wkOf(k)] || []).push(k)); return w; };
const wkName = i => i < 4 ? 'Неделя ' + (i + 1) : 'Доп.';
const hByKind = kind => S.habits.filter(h => h.kind === kind);
const hDow = (h, k) => !h.days.length || h.days.includes(dowIdx(k));
// Начало привычки: дата создания или самая ранняя отметка (если отмечали задним числом)
const isDayKey = k => /^\d{4}-\d{2}-\d{2}$/.test(k);
// Начало учёта привычки — 1-е число месяца, в котором её создали (или самой ранней отметки задним числом):
// процент = отмеченные клетки / все запланированные клетки месяца до сегодня включительно — как видно в таблице
const hStart = h => Object.keys(h.log).reduce((m, k) => isDayKey(k) && k < m ? k : m, h.from).slice(0, 8) + '01';
function hStat(h, days) {
  const t = todayK(), st = hStart(h); let done = 0, plan = 0;
  days.forEach(k => { if (k > t || k < st || !hDow(h, k)) return; plan++; if (h.log[k]) done++; });
  return { done, plan, pct: plan ? done / plan : null };
}
function dayStat(k) {
  let done = 0, plan = 0;
  hByKind('daily').forEach(h => { if (k < hStart(h) || !hDow(h, k)) return; plan++; if (h.log[k]) done++; });
  return { done, plan };
}
function monthStat(ym) {
  let done = 0, plan = 0; const days = ymDays(ym);
  hByKind('daily').forEach(h => { const s = hStat(h, days); done += s.done; plan += s.plan; });
  return { done, plan, pct: plan ? done / plan : null };
}
const canMark = k => { const t = todayK(); return k <= t && (S.settings.habitPast || k === t); };
const deltaHTML = (now, prev) => {
  if (now == null || prev == null) return '';
  const d = Math.round((now - prev) * 100);
  return `<small class="dlt ${d > 0 ? 'up' : d < 0 ? 'down' : ''}" title="К прошлому месяцу">${d > 0 ? '+' : d < 0 ? '−' : '±'}${Math.abs(d)}%</small>`;
};

function habitGrid(ym) {
  const days = ymDays(ym), t = todayK(), hs = hByKind('daily'), weeks = monthWeeks(ym);
  const td = k => (k === t ? ' is-today' : '') + (isWknd(k) ? ' wknd' : '');
  let h = `<div class="hscroll" data-hs="hab-${ym}"><table class="hg"><thead>
    <tr class="hg-w"><th class="sticky-col hg-name" rowspan="2">Привычка</th>${weeks.map((ws, i) => `<th colspan="${ws.length}" style="--w:var(--w${i + 1})">${wkName(i)}</th>`).join('')}<th class="hg-pc" rowspan="2" title="Процент за месяц">%</th></tr>
    <tr class="hg-d">${days.map(k => `<th class="${td(k)}" style="--w:var(--w${wkOf(k) + 1})"><small>${dowName(k)}</small><b>${+k.slice(8)}</b></th>`).join('')}</tr></thead><tbody>`;
  hs.forEach(hb => {
    const st = hStart(hb), s = hStat(hb, days);
    h += `<tr><th class="sticky-col hg-name"><button data-act="hedit" data-id="${hb.id}" title="Изменить привычку"><span class="em">${esc(hb.emoji || '•')}</span><span class="nm">${esc(hb.name)}</span></button></th>`;
    h += days.map(k => {
      const on = !!hb.log[k], fut = k > t, cls = 'hc' + (on ? ' on' : '') + (!hDow(hb, k) ? ' off' : '') + (k < st && !on ? ' pre' : '') + (!canMark(k) ? ' lock' : '');
      return `<td class="${td(k)}" style="--w:var(--w${wkOf(k) + 1})"><button class="${cls}" data-act="hmark" data-id="${hb.id}" data-k="${k}" aria-pressed="${on}" aria-label="${esc(hb.name)}, ${+k.slice(8)} ${ymGen(ym)}"${fut ? ' disabled' : ''}>${on ? I(IC.check, 12) : ''}</button></td>`;
    }).join('');
    h += `<td class="hg-pc"><b>${pctTxt(s.pct)}</b></td></tr>`;
  });
  h += `<tr class="hg-addrow"><th class="sticky-col hg-name"><button class="hg-add" data-act="hnew" data-k="daily">${I(IC.plus, 15)} Привычка</button></th><td colspan="${days.length + 1}"></td></tr></tbody>`;
  if (hs.length) {
    const ds = days.map(k => ({ k, ...dayStat(k) }));
    const show = d => d.plan && d.k <= t;
    h += `<tfoot><tr><th class="sticky-col hg-name">Выполнено</th>${ds.map(d => `<td class="${td(d.k)}">${show(d) ? d.done : ''}</td>`).join('')}<td class="hg-pc"></td></tr>
    <tr><th class="sticky-col hg-name">Прогресс</th>${ds.map(d => { const p = show(d) ? d.done / d.plan : null; return `<td class="hg-p ${p == null ? '' : p >= .8 ? 'good' : p >= .5 ? 'mid' : 'low'}${td(d.k)}">${p == null ? '' : Math.round(p * 100)}</td>`; }).join('')}<td class="hg-pc"></td></tr></tfoot>`;
  }
  return h + '</table></div>';
}

function habitWave(ym) {
  const days = ymDays(ym), t = todayK();
  const vals = days.map(k => { const d = dayStat(k); return k <= t && d.plan ? Math.round(d.done / d.plan * 100) : null; });
  const ms = monthStat(ym);
  return `<div class="card hb-wave"><div class="card-h"><b>Прогресс по дням</b><small>% выполненных привычек</small></div>
    <div class="hw-row"><div class="hw-ring">${ringSVG(ms.pct || 0, 104, 'var(--c-blue)', ms.plan ? ms.done + ' / ' + ms.plan : '—', 'отметок')}</div>
    <div class="hw-chart">${chartBox({ kind:'line', xs: days.map(k => String(+k.slice(8))), max:100, yTicks:[0, 50, 100], yFmt: v => v + '%', fmt: v => v + '%', left:40, tipTitle: i => fmtLong(days[i]),
      series:[{ name:'привычек выполнено', color:'var(--c-blue)', vals, area:true }] }, 150, 'Процент выполненных привычек по дням месяца')}</div></div></div>`;
}

// Прогресс за месяц по каждой привычке и «Самые стабильные» — отдельными карточками
function habitStats(ym) {
  const days = ymDays(ym), prevDays = ymDays(ymAdd(ym, -1)), hs = hByKind('daily'), ms = monthStat(ym), pm = monthStat(ymAdd(ym, -1));
  const st = hs.map(h => ({ h, s: hStat(h, days), p: hStat(h, prevDays).pct })).filter(x => x.s.plan);
  const top = [...st].sort((a, b) => b.s.pct - a.s.pct).slice(0, 5);
  const prevName = MON[(Number(ymAdd(ym, -1).slice(5)) - 1)].toLowerCase();
  const progress = `<div class="card hp-card"><div class="card-h"><b>Прогресс за месяц</b></div>
    <div class="hp-top"><b class="hp-big">${pctTxt(ms.pct)}</b><span>${ms.plan ? `${ms.done} из ${ms.plan} отметок` : 'Пока нет отметок'}${ms.pct != null && pm.pct != null ? `<br>${deltaHTML(ms.pct, pm.pct)} к прошлому месяцу (${prevName})` : ''}</span></div>
    ${st.map(({ h, s, p }) => `<div class="hp-row"><span class="em">${esc(h.emoji || '•')}</span><span class="nm">${esc(h.name)}</span><span class="hp-bar"><i style="width:${Math.round(s.pct * 100)}%"></i></span><b>${pctTxt(s.pct)}</b>${deltaHTML(s.pct, p) || '<small class="dlt"></small>'}</div>`).join('') || '<p class="empty">Отметьте привычки в таблице — здесь появятся проценты по каждой.</p>'}
  </div>`;
  const stable = `<div class="card m-only"><div class="card-h"><b>Самые стабильные</b></div>${top.length ? top.map((x, i) => `<div class="hs-row"><span class="hs-n">${i + 1}</span><span class="em">${esc(x.h.emoji || '•')}</span><span class="nm">${esc(x.h.name)}</span><b>${pctTxt(x.s.pct)}</b></div>`).join('') : '<p class="empty">Появятся, когда будут отметки.</p>'}</div>`;
  return { progress, stable };
}

function periodicCard(kind, ym) {
  const t = todayK(), weeks = monthWeeks(ym), list = hByKind(kind), weekly = kind === 'weekly';
  const cols = weekly ? weeks.map((ws, i) => ({ key: ym + ':w' + (i + 1), name: i < 4 ? 'Нед. ' + (i + 1) : 'Доп.', first: ws[0], w: i + 1 })) : [{ key: ym, name: ymTitle(ym).split(' ')[0], first: ym + '-01', w: 0 }];
  return `<div class="card"><div class="card-h"><b>${weekly ? 'Еженедельные привычки' : 'Ежемесячные привычки'}</b><button class="pill sm" data-act="hnew" data-k="${kind}">${I(IC.plus, 14)} Добавить</button></div>
    ${list.length ? `<div class="hscroll plain"><table class="hw"><thead><tr><th></th>${cols.map(c => `<th${c.w ? ` style="--w:var(--w${c.w})"` : ''}><span class="wpill">${c.name}</span></th>`).join('')}</tr></thead><tbody>
    ${list.map(h => `<tr><th><button data-act="hedit" data-id="${h.id}"><span class="em">${esc(h.emoji || '•')}</span><span class="nm">${esc(h.name)}</span></button></th>${cols.map(c => { const on = !!h.log[c.key]; return `<td${c.w ? ` style="--w:var(--w${c.w})"` : ''}><button class="hc${on ? ' on' : ''}" data-act="hmarkp" data-id="${h.id}" data-key="${c.key}" aria-pressed="${on}" aria-label="${esc(h.name)}, ${c.name}"${c.first > t ? ' disabled' : ''}>${on ? I(IC.check, 12) : ''}</button></td>`; }).join('')}</tr>`).join('')}
    </tbody></table></div>` : `<p class="empty">${weekly ? 'Например: «Спортзал 3 раза в неделю», «Анализ расходов».' : 'Например: «Сделать замеры», «Разобрать шкаф».'}</p>`}
  </div>`;
}

// ---- Самочувствие ----
const bioVal = (k, id) => (S.bio.log[k] || {})[id];
const bioMax = m => m.type === 'hours' ? Math.max(12, m.plan) : 5;
function bioAvg(m, days) { const v = days.map(k => bioVal(k, m.id)).filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; }
function bioScore(m, avg) { if (avg == null) return null; const max = bioMax(m); return m.low ? (avg <= m.plan ? 1 : Math.max(0, (max - avg) / (max - m.plan))) : Math.min(1, avg / m.plan); }
const bioUnit = m => m.type === 'hours' ? ' ч' : '';
const fmtNum = v => v == null ? '—' : String(Math.round(v * 10) / 10).replace('.', ',');
function bioCard(ym) {
  const days = ymDays(ym), t = todayK(), M = S.bio.metrics;
  const td = k => (k === t ? ' is-today' : '') + (isWknd(k) ? ' wknd' : '');
  const grid = `<div class="hscroll" data-hs="bio-${ym}"><table class="hg bio"><thead><tr class="hg-d"><th class="sticky-col hg-name">Показатель</th>${days.map(k => `<th class="${td(k)}" style="--w:var(--w${wkOf(k) + 1})"><small>${dowName(k)}</small><b>${+k.slice(8)}</b></th>`).join('')}<th class="hg-pc">Факт</th></tr></thead><tbody>
    ${M.map(m => `<tr><th class="sticky-col hg-name"><button data-act="bioedit" title="Настроить показатели"><span class="em">${esc(m.emoji || '•')}</span><span class="nm">${esc(m.name)}<small>план ${fmtNum(m.plan)}${bioUnit(m)}</small></span></button></th>
      ${days.map(k => { const v = bioVal(k, m.id); return `<td class="${td(k)}"><button class="bc${v != null ? ' has' : ''}" data-act="bioset" data-m="${m.id}" data-k="${k}" style="--a:${v == null ? 0 : Math.round(v / bioMax(m) * 34)}%" aria-label="${esc(m.name)}, ${+k.slice(8)} ${ymGen(ym)}: ${v == null ? 'нет' : fmtNum(v)}"${k > t ? ' disabled' : ''}>${v == null ? '' : fmtNum(v)}</button></td>`; }).join('')}
      <td class="hg-pc"><b>${fmtNum(bioAvg(m, days))}</b></td></tr>`).join('')}
  </tbody></table></div>`;
  const bars = M.map(m => {
    const avg = bioAvg(m, days), sc = bioScore(m, avg), st = sc == null ? '' : sc >= .85 ? 'good' : sc >= .6 ? 'mid' : 'low';
    return `<div class="bio-bar"><div class="bb-h"><span>${esc(m.emoji || '')} ${esc(m.name)}</span><small>${avg == null ? 'нет данных' : `${fmtNum(avg)}${bioUnit(m)} · план ${fmtNum(m.plan)}${bioUnit(m)}`}${st ? ` · <b class="st-${st}">${{ good:'хорошо', mid:'средне', low:'плохо' }[st]}</b>` : ''}</small></div><div class="ds-bar"><i class="st-${st}" style="width:${sc == null ? 0 : Math.round(sc * 100)}%"></i></div></div>`;
  }).join('');
  return `<div class="card bio-card"><div class="card-h"><b>Самочувствие</b><button class="pill sm" data-act="bioedit">${I(IC.gear, 14)} Настроить</button></div>
    <p class="set-note" style="margin:-4px 0 10px">Нажмите на клетку дня и выберите оценку: сон — в часах, остальное — от 1 до 5. Так видно, как отдых связан с результатами.</p>
    ${grid}<div class="bio-bars">${bars}</div></div>`;
}

// ---- Действия ----
function markHabit(id, key) {
  const h = S.habits.find(x => x.id === id); if (!h) return;
  if (isDayKey(key) && !canMark(key)) return toast(key > todayK() ? 'Будущие дни отмечать нельзя' : 'Отмечать задним числом выключено в настройках');
  if (h.log[key]) delete h.log[key]; else h.log[key] = 1;
  save(); render();
  if (key === todayK()) { const d = dayStat(key); if (d.plan > 1 && d.done === d.plan) toast('Все привычки на сегодня выполнены 🎉'); }
}
ACT.hmark = el => markHabit(el.dataset.id, el.dataset.k);
ACT.hmarkp = el => markHabit(el.dataset.id, el.dataset.key);
ACT.hnew = el => openHabit(null, el.dataset.k);
ACT.hedit = el => openHabit(el.dataset.id);

let hbForm = null;
function openHabit(id, kind) {
  const h = id ? S.habits.find(x => x.id === id) : null; if (id && !h) return;
  const mode = h ? (h.kind === 'daily' ? (h.days.length ? 'days' : 'all') : h.kind) : (kind === 'weekly' || kind === 'monthly' ? kind : 'all');
  hbForm = { id, name: h ? h.name : '', emoji: h ? h.emoji : HB_EMOJI[0], mode, days: new Set(h ? h.days : [0, 2, 4]), ask:false };
  drawHabit();
  if (!id) setTimeout(() => { const i = $('#hb_n'); if (i) i.focus(); }, 60);
}
function drawHabit(keep) {
  const f = hbForm, modes = [['all', 'Каждый день'], ['days', 'По дням недели'], ['weekly', 'Раз в неделю'], ['monthly', 'Раз в месяц']];
  sheet(`<div class="sh-head"><h3>${f.id ? 'Привычка' : 'Новая привычка'}</h3>${f.id ? `<button class="ic" data-act="hbdel" title="Удалить" aria-label="Удалить" style="color:var(--dng)">${I(IC.trash, 17)}</button>` : ''}<button class="ic" data-act="close" aria-label="Закрыть">${I(IC.x, 18)}</button></div>
  <input id="hb_n" class="f-title" placeholder="Например: «2 литра воды»" value="${esc(f.name)}" autocomplete="off" maxlength="60">
  <div class="frow"><span class="fl">Значок</span><div class="emj">${HB_EMOJI.map(e => `<button type="button" class="emb${e === f.emoji ? ' on' : ''}" data-act="hbemoji" data-e="${e}" aria-label="${e}">${e}</button>`).join('')}</div></div>
  <div class="frow"><span class="fl">Как часто</span><div><div class="chips" style="margin-top:4px">${modes.map(([v, n]) => `<button type="button" class="chip${f.mode === v ? ' on' : ''}" data-act="hbmode" data-v="${v}">${n}</button>`).join('')}</div>
    ${f.mode === 'days' ? `<div class="chips">${DOW.map((d, i) => `<button type="button" class="chip${f.days.has(i) ? ' on' : ''}" data-act="hbday" data-d="${i}">${d}</button>`).join('')}</div>` : ''}
    <p class="set-note">${{ all:'Отмечается каждый день.', days:'В другие дни клетка неактивна и не влияет на процент.', weekly:'Одна галочка на неделю — например, «спортзал 3 раза в неделю».', monthly:'Одна галочка на месяц.' }[f.mode]}</p></div></div>
  <div class="sh-foot"><button class="btn pri grow" data-act="hbsave">Сохранить</button></div>
  ${f.ask ? `<div class="ask"><b>Удалить привычку «${esc(f.name)}» со всеми отметками?</b><div class="row"><button class="btn dngf" data-act="hbdelyes">Удалить</button><button class="btn" data-act="hbdelno">Отмена</button></div></div>` : ''}`, keep);
}
const hbKeepName = () => { const i = $('#hb_n'); if (i && hbForm) hbForm.name = i.value; };
ACT.hbemoji = el => { hbKeepName(); hbForm.emoji = el.dataset.e; drawHabit(true); };
ACT.hbmode = el => { hbKeepName(); hbForm.mode = el.dataset.v; drawHabit(true); };
ACT.hbday = el => { hbKeepName(); const d = +el.dataset.d, s = hbForm.days; s.has(d) ? (s.size > 1 && s.delete(d)) : s.add(d); drawHabit(true); };
ACT.hbdel = () => { hbKeepName(); hbForm.ask = true; drawHabit(true); };
ACT.hbdelno = () => { hbKeepName(); hbForm.ask = false; drawHabit(true); };
ACT.hbdelyes = () => { snap(); S.habits = S.habits.filter(h => h.id !== hbForm.id); save(); closeSheet(); render(); toast('Привычка удалена', true); };
ACT.hbsave = saveHabit;
function saveHabit() {
  hbKeepName();
  const f = hbForm, name = f.name.trim(); if (!name) { $('#hb_n').focus(); return; }
  const kind = f.mode === 'weekly' || f.mode === 'monthly' ? f.mode : 'daily', days = f.mode === 'days' ? [...f.days].sort() : [];
  snap();
  const h = f.id && S.habits.find(x => x.id === f.id);
  if (h) Object.assign(h, { name, emoji:f.emoji, kind, days });
  else S.habits.push({ id:'h' + uid(), name, emoji:f.emoji, kind, days, from:todayK(), log:{} });
  save(); closeSheet(); render(); toast(h ? 'Привычка сохранена' : 'Привычка добавлена: ' + name, true);
}
document.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing && e.target.id === 'hb_n') { e.preventDefault(); saveHabit(); } });

// Выбор значения самочувствия — маленькое окно у клетки
function openBioPicker(el) {
  const m = S.bio.metrics.find(x => x.id === el.dataset.m), k = el.dataset.k; if (!m) return;
  if (!canMark(k)) return toast(k > todayK() ? 'Будущие дни заполнять нельзя' : 'Отмечать задним числом выключено в настройках');
  const cur = bioVal(k, m.id), opts = m.type === 'hours' ? [5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 10] : [1, 2, 3, 4, 5];
  const qc = $('#qc');
  qc.innerHTML = `<div class="qhead"><b>${esc(m.emoji || '')} ${esc(m.name)} · ${esc(fmtLong(k))}</b><button class="qx" data-act="qclose" aria-label="Закрыть">${I(IC.x, 15)}</button></div>
    <div class="chips bp">${opts.map(v => `<button type="button" class="chip${cur === v ? ' on' : ''}" data-act="bioval" data-m="${m.id}" data-k="${k}" data-v="${v}">${fmtNum(v)}</button>`).join('')}</div>
    ${m.type === 'hours' ? `<div class="qrow"><input id="bp_in" class="fin" type="number" inputmode="decimal" step="0.5" min="0" max="24" value="${cur ?? ''}" placeholder="Другое, часов"><button class="btn" data-act="bioin" data-m="${m.id}" data-k="${k}">OK</button></div>` : `<p class="set-note" style="margin:8px 2px 0">${m.low ? '1 — спокойно, 5 — очень сильно' : '1 — плохо, 5 — отлично'}</p>`}
    ${cur != null ? `<button class="btn" style="width:100%;margin-top:8px;height:34px" data-act="bioval" data-m="${m.id}" data-k="${k}" data-v="">Очистить</button>` : ''}`;
  qc.classList.add('show');
  const r = el.getBoundingClientRect(), w = innerWidth < 900 ? innerWidth - 16 : 310, h = qc.offsetHeight || 160;
  if (innerWidth < 900) qc.style.left = '8px'; else qc.style.left = Math.max(8, Math.min(r.left - w / 2 + r.width / 2, innerWidth - w - 8)) + 'px';
  qc.style.top = (r.bottom + h + 12 < innerHeight ? r.bottom + 6 : Math.max(8, r.top - h - 6)) + 'px';
}
function setBio(mid, k, v) {
  const day = S.bio.log[k] || (S.bio.log[k] = {});
  if (v === '' || v == null || isNaN(v)) delete day[mid]; else day[mid] = Math.max(0, Math.min(24, Number(v)));
  if (!Object.keys(day).length) delete S.bio.log[k];
  save(); closeQuick(); render();
}
ACT.bioset = el => openBioPicker(el);
ACT.bioval = el => setBio(el.dataset.m, el.dataset.k, el.dataset.v === '' ? '' : Number(el.dataset.v));
ACT.bioin = el => { const v = $('#bp_in').value; setBio(el.dataset.m, el.dataset.k, v === '' ? '' : Number(String(v).replace(',', '.'))); };
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'bp_in') { e.preventDefault(); const b = $('[data-act="bioin"]'); if (b) b.click(); } });

// Настройка показателей самочувствия
let bmAsk = null;
function openBioEdit(keep) {
  sheet(`<div class="sh-head"><h3>Самочувствие</h3><button class="ic" data-act="close" aria-label="Закрыть">${I(IC.x, 18)}</button></div>
  <p class="set-note" style="margin:0 0 10px">Что отмечать каждый день. План — к чему стремитесь: сон в часах, остальное от 1 до 5. Для стресса меньше — лучше.</p>
  <div class="catlist">${S.bio.metrics.map(m => bmAsk === m.id ? `<div class="catedit ask2"><span class="askt">Удалить «${esc(m.name)}» и его отметки?</span><button class="askyes" data-act="bmdelyes" data-id="${m.id}">Удалить</button><button class="askno" data-act="bmdelno">Отмена</button></div>` : `<div class="bm-row">
    <input class="bm-em" data-bm="${m.id}" data-f="emoji" value="${esc(m.emoji || '')}" maxlength="4" aria-label="Значок">
    <input class="cname" data-bm="${m.id}" data-f="name" value="${esc(m.name)}" placeholder="Название" aria-label="Название">
    <select class="fin bm-sel" data-bm="${m.id}" data-f="type" aria-label="Шкала"><option value="score"${m.type === 'score' ? ' selected' : ''}>1–5</option><option value="hours"${m.type === 'hours' ? ' selected' : ''}>часы</option></select>
    <label class="bm-plan">план <input class="fin" type="number" inputmode="decimal" step="0.5" min="0" max="24" data-bm="${m.id}" data-f="plan" value="${m.plan}"></label>
    <label class="bm-low" title="Меньше — лучше (как стресс)"><input type="checkbox" data-bm="${m.id}" data-f="low"${m.low ? ' checked' : ''}> меньше — лучше</label>
    <button class="cdel" data-act="bmdel" data-id="${m.id}" aria-label="Удалить показатель">${I(IC.trash)}</button></div>`).join('')}</div>
  <button class="addcat" data-act="bmadd">+ Добавить показатель</button>
  <div class="set-sec">Привычки</div>
  <div class="set-row"><span>Отмечать задним числом</span><input id="s_hpast" class="sw" type="checkbox"${S.settings.habitPast ? ' checked' : ''}></div>
  <button class="btn pri" style="width:100%;margin-top:18px" data-act="close">Готово</button>`, keep);
}
ACT.bioedit = () => { bmAsk = null; openBioEdit(); };
ACT.bmadd = () => { S.bio.metrics.push({ id:'m' + uid(), name:'Новый показатель', emoji:'⭐', type:'score', plan:5 }); save(); render(); openBioEdit(true); };
ACT.bmdel = el => { bmAsk = el.dataset.id; openBioEdit(true); };
ACT.bmdelno = () => { bmAsk = null; openBioEdit(true); };
ACT.bmdelyes = el => { snap(); S.bio.metrics = S.bio.metrics.filter(m => m.id !== el.dataset.id); Object.values(S.bio.log).forEach(d => delete d[el.dataset.id]); bmAsk = null; save(); render(); openBioEdit(true); toast('Показатель удалён', true); };
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.bm) {
    const m = S.bio.metrics.find(x => x.id === t.dataset.bm); if (!m) return;
    const f = t.dataset.f;
    if (f === 'low') m.low = t.checked; else if (f === 'plan') m.plan = Math.max(0, Number(String(t.value).replace(',', '.')) || 0); else if (f === 'type') m.type = t.value === 'hours' ? 'hours' : 'score'; else m[f] = t.value.trim() || m[f];
    save(); render();
  } else if (t.id === 's_hpast') { S.settings.habitPast = t.checked; save(); render(); }
});

// ---- Заметки: журнал с датами, архив за все месяцы, выгрузка в файл ----
let noteDraft = '', noteForm = null;
// Дата новой заметки: сегодня, а если открыт другой месяц — его последний (прошлый) или первый (будущий) день
const noteDate = ym => { const t = todayK(); return ym === ymOf(t) ? t : ym < ymOf(t) ? ymDays(ym).pop() : ym + '-01'; };
const notesOf = ym => S.notes.filter(n => !ym || n.date.startsWith(ym)).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
const noteRow = n => `<div class="nt-row"><button class="nt-main" data-act="ntedit" data-id="${n.id}" title="Изменить"><span class="nt-d">${esc(fmtLong(n.date))}</span><span class="nt-x">${esc(n.text)}</span></button><button class="fz-x" data-act="ntdel" data-id="${n.id}" aria-label="Удалить заметку">${I(IC.trash, 14)}</button></div>`;
function notesCard(ym) {
  const list = notesOf(ym);
  return `<div class="card nt-card"><div class="card-h"><b>Заметки</b><button class="pill sm" data-act="ntall">${I(IC.list, 14)} Все заметки${S.notes.length ? ' · ' + S.notes.length : ''}</button></div>
    <textarea id="nt_text" class="fin hn-text" placeholder="Мысли, выводы, что получилось и что мешало…" aria-label="Новая заметка">${esc(noteDraft)}</textarea>
    <div class="nt-bar"><small>Сохранится с датой ${esc(fmtLong(noteDate(ym)))} и останется в архиве «Все заметки».</small><button class="btn pri" data-act="ntsave">Сохранить заметку</button></div>
    ${list.length ? `<div class="nt-list">${list.map(noteRow).join('')}</div>` : `<p class="empty">За ${ymTitle(ym).toLowerCase()} заметок пока нет.</p>`}
  </div>`;
}
function saveNoteDraft() {
  const ta = $('#nt_text'), text = (ta ? ta.value : noteDraft).trim();
  if (!text) { if (ta) ta.focus(); return toast('Напишите заметку'); }
  snap(); S.notes.push({ id:'n' + uid(), date: noteDate(secYM), text }); noteDraft = ''; save(); render(); toast('Заметка сохранена', true);
}
function openAllNotes() {
  const list = notesOf(''), byM = {};
  list.forEach(n => (byM[ymOf(n.date)] = byM[ymOf(n.date)] || []).push(n));
  sheet(`<div class="sh-head"><h3>Все заметки</h3>${list.length ? `<button class="ic" data-act="ntdl" title="Скачать файлом" aria-label="Скачать файлом">${I(IC.down, 17)}</button>` : ''}<button class="ic" data-act="close" aria-label="Закрыть">${I(IC.x, 18)}</button></div>
  ${list.length ? Object.keys(byM).map(m => `<div class="nt-m">${ymTitle(m)}</div><div class="nt-list">${byM[m].map(noteRow).join('')}</div>`).join('') : '<p class="empty">Заметок пока нет. Напишите первую в «Привычках».</p>'}
  ${list.length ? `<button class="btn" style="width:100%;margin-top:14px" data-act="ntdl">${I(IC.down, 16)} Скачать все заметки (.txt)</button>` : ''}`);
}
function openNote(id) {
  const n = S.notes.find(x => x.id === id); if (!n) return;
  noteForm = { id, back: sheetOpen() && !!$('.nt-m') };
  sheet(`<div class="sh-head">${noteForm.back ? `<button class="ic" data-act="ntall" aria-label="Назад">${I(IC.left, 18)}</button>` : ''}<h3>Заметка</h3><button class="ic" data-act="close" aria-label="Закрыть">${I(IC.x, 18)}</button></div>
  <textarea id="ne_text" class="fin hn-text" style="min-height:180px" aria-label="Текст заметки">${esc(n.text)}</textarea>
  <div class="frow" style="border-top:0;margin-top:6px"><span class="fl">Дата</span><input id="ne_d" class="fin" type="date" value="${n.date}"></div>
  <div class="sh-foot"><button class="btn pri grow" data-act="ntupd">Сохранить</button><button class="btn dng" data-act="ntdel" data-id="${n.id}">${I(IC.trash, 16)} Удалить</button></div>`);
}
ACT.ntsave = saveNoteDraft;
ACT.ntall = openAllNotes;
ACT.ntedit = el => openNote(el.dataset.id);
ACT.ntupd = () => {
  const n = S.notes.find(x => x.id === noteForm.id), text = $('#ne_text').value.trim(), d = $('#ne_d').value; if (!n) return;
  if (!text) return toast('Заметка пустая — удалите её кнопкой «Удалить»');
  snap(); n.text = text; if (isDayKey(d)) n.date = d; save(); render(); if (noteForm.back) openAllNotes(); else closeSheet(); toast('Заметка сохранена', true);
};
ACT.ntdel = el => { const inAll = sheetOpen() && (!!$('.nt-m') || (noteForm && noteForm.back)); snap(); S.notes = S.notes.filter(n => n.id !== el.dataset.id); save(); render(); if (inAll && S.notes.length) openAllNotes(); else if (sheetOpen()) closeSheet(); toast('Заметка удалена', true); };
ACT.ntdl = () => {
  const txt = notesOf('').map(n => `${fmtLong(n.date)} ${n.date.slice(0, 4)}\n${n.text}`).join('\n\n———\n\n');
  saveFile(new Blob([txt + '\n'], { type:'text/plain;charset=utf-8' }), `${APP_NAME.toLowerCase()}-заметки-${todayK()}.txt`); toast('Заметки сохранены в файл');
};
document.addEventListener('input', e => { if (e.target.id === 'nt_text') noteDraft = e.target.value; });
document.addEventListener('keydown', e => { if (e.target.id === 'nt_text' && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveNoteDraft(); } });

// ---- Пример ----
function seeded(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
SEC.habits = {
  name:'Привычки', icon:IC.habit, newLabel:'Привычка',
  title: () => innerWidth >= 900 ? `${ymTitle(secYM)}<span class="sub">привычки</span>` : ymHead(secYM),
  html: () => habitsHTML(),
  move: n => { secYM = ymAdd(secYM, n); },
  create: () => openHabit(),
  side: () => {
    const days = ymDays(secYM), top = hByKind('daily').map(h => ({ h, s: hStat(h, days) })).filter(x => x.s.plan).sort((a, b) => b.s.pct - a.s.pct).slice(0, 5);
    return `<div class="sb-sec"><div class="sb-h">Топ привычек · ${MON[Number(secYM.slice(5)) - 1].toLowerCase()}</div>${top.length ? top.map((x, i) => `<button class="sbl sbl-top" data-act="hedit" data-id="${x.h.id}"><span class="sbl-n">${i + 1}</span><span class="sbl-em">${esc(x.h.emoji || '•')}</span><span class="sbl-t">${esc(x.h.name)}</span><b>${pctTxt(x.s.pct)}</b><i class="sbl-bar"><i style="width:${Math.round(x.s.pct * 100)}%"></i></i></button>`).join('') : '<p class="sbl-empty">Появится, когда будут отметки</p>'}</div>`;
  },
  info: () => { const d = dayStat(todayK()); return d.plan ? `Сегодня: <b>${d.done} из ${d.plan}</b>` : 'Привычек на сегодня нет'; },
  demo: on => {
    if (!on) {
      S.habits = S.habits.filter(h => !h.demo);
      (S.bio.demoKeys || []).forEach(x => { const [k, id] = x.split('|'); if (S.bio.log[k]) { delete S.bio.log[k][id]; if (!Object.keys(S.bio.log[k]).length) delete S.bio.log[k]; } });
      delete S.bio.demoKeys; return;
    }
    const rnd = seeded(7), t = todayK(), ym = ymOf(t), from = ymAdd(ym, -1) + '-01';
    const days = [...ymDays(ymAdd(ym, -1)), ...ymDays(ym)].filter(k => k <= t);
    const D = [['2 литра воды', '💧', [], .85], ['Зарядка утром', '🏃', [], .7], ['Чтение 30 страниц', '📚', [], .6], ['Без сладкого', '🍎', [], .55], ['Растяжка 15 минут', '🧘', [], .8], ['Спортзал в 18:00', '🏋️', [0, 2, 4], .75], ['Дневник', '📝', [], .5]];
    D.forEach(([name, emoji, dd, p], i) => {
      const log = {}; days.forEach(k => { if ((!dd.length || dd.includes(dowIdx(k))) && rnd() < p + (k >= ym ? .07 : 0)) log[k] = 1; });
      S.habits.push({ id:'h' + uid() + i, demo:true, name, emoji, kind:'daily', days:dd, from, log });
    });
    const wl = {}; [ymAdd(ym, -1), ym].forEach(m => monthWeeks(m).forEach((ws, i) => { if (ws[0] <= t && rnd() < .7) wl[m + ':w' + (i + 1)] = 1; }));
    S.habits.push({ id:'h' + uid() + 'w', demo:true, name:'Анализ расходов', emoji:'💰', kind:'weekly', days:[], from, log:wl });
    S.habits.push({ id:'h' + uid() + 'm', demo:true, name:'Сделать замеры', emoji:'🎯', kind:'monthly', days:[], from, log:{ [ymAdd(ym, -1)]:1 } });
    const keys = [];
    days.forEach(k => {
      const day = S.bio.log[k] || (S.bio.log[k] = {});
      S.bio.metrics.forEach(m => { if (day[m.id] != null) return; day[m.id] = m.type === 'hours' ? 6 + Math.round(rnd() * 6) / 2 : m.low ? 1 + Math.floor(rnd() * 3) : 2 + Math.floor(rnd() * 4); keys.push(k + '|' + m.id); });
    });
    S.bio.demoKeys = keys;
  },
};
