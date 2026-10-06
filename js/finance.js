// ---- Финансы: каждая трата отдельно, бюджет и факт по разделам, дневной лимит ----
// S.fin = { cats:[{ id, g, name, emoji, plan, due }], ops:[{ id, date, cat, amt, note }] }
// g — раздел: inc доходы, sub подписки, reg регулярные платежи, exp траты, sav накопления, debt долги
const FG = {
  inc:{ n:'Доходы', c:'var(--c-green)', rest:'Ждём' }, sub:{ n:'Подписки', c:'var(--c-violet)', bill:true }, reg:{ n:'Регулярные платежи', c:'var(--c-yellow)', bill:true },
  exp:{ n:'Траты', c:'var(--c-blue)', rest:'Остаток' }, sav:{ n:'Накопления', c:'var(--c-aqua)', rest:'Осталось' }, debt:{ n:'Долги', c:'var(--c-magenta)', bill:true },
};
const FG_ORDER = ['inc', 'sub', 'reg', 'exp', 'sav', 'debt'];
const FG_OUT = ['sub', 'reg', 'exp', 'debt'];          // расходы
const FG_DONUT = ['exp', 'sav', 'sub', 'debt', 'reg'];  // порядок долей: соседние цвета проверены на различимость
const FIN_DEF = [['inc', 'Зарплата', '💼'], ['inc', 'Подработка', '💻'], ['inc', 'Прочие доходы', '➕'],
  ['sub', 'Музыка', '🎵'], ['sub', 'Кино и сериалы', '🎬'], ['sub', 'Облако и сервисы', '☁️'],
  ['reg', 'Аренда или ипотека', '🏠'], ['reg', 'Коммунальные услуги', '💡'], ['reg', 'Интернет и связь', '📱'], ['reg', 'Спортзал', '🏋️'],
  ['exp', 'Продукты', '🛒'], ['exp', 'Кафе и рестораны', '☕'], ['exp', 'Транспорт', '🚕'], ['exp', 'Одежда', '👕'], ['exp', 'Развлечения', '🎉'], ['exp', 'Здоровье', '💊'], ['exp', 'Подарки', '🎁'], ['exp', 'Прочее', '📦'],
  ['sav', 'Подушка безопасности', '🛟'], ['sav', 'Отпуск', '🏖️'], ['debt', 'Кредит', '💳']];
onMigrate(() => {
  if (!S.fin || typeof S.fin !== 'object') S.fin = {};
  if (!Array.isArray(S.fin.cats)) S.fin.cats = FIN_DEF.map(([g, name, emoji], i) => ({ id:'f' + i, g, name, emoji, plan:0 }));
  if (!Array.isArray(S.fin.ops)) S.fin.ops = [];
  S.fin.cats = S.fin.cats.filter(c => c && FG[c.g]);
  S.fin.ops = S.fin.ops.filter(o => o && isDayKey(o.date) && o.amt > 0);
});

const fcat = id => S.fin.cats.find(c => c.id === id) || { id, g:'exp', name:'Без категории', emoji:'❔', plan:0 };
const opsIn = ym => S.fin.ops.filter(o => o.date.startsWith(ym));
function finStat(ym) {
  const ops = opsIn(ym), fact = {}, g = {};
  ops.forEach(o => { fact[o.cat] = (fact[o.cat] || 0) + o.amt; });
  FG_ORDER.forEach(k => g[k] = { plan:0, fact:0 });
  S.fin.cats.forEach(c => { g[c.g].plan += c.plan || 0; g[c.g].fact += fact[c.id] || 0; });
  const spent = FG_OUT.reduce((a, k) => a + g[k].fact, 0), spentPlan = FG_OUT.reduce((a, k) => a + g[k].plan, 0);
  return { ops, fact, g, spent, spentPlan, left: g.inc.fact - spent - g.sav.fact };
}
// Дневной лимит: сколько можно тратить сегодня, чтобы уложиться в бюджет «Трат» до конца месяца
function dailyLimit(st, ym) {
  const t = todayK(), plan = st.g.exp.plan; if (ymOf(t) !== ym || !plan) return null;
  const isExp = o => fcat(o.cat).g === 'exp';
  const before = st.ops.filter(o => o.date < t && isExp(o)).reduce((a, o) => a + o.amt, 0);
  const today = st.ops.filter(o => o.date === t && isExp(o)).reduce((a, o) => a + o.amt, 0);
  const daysLeft = ymDays(ym).filter(k => k >= t).length, limit = Math.max(0, (plan - before) / daysLeft);
  return { limit, today, left: limit - today, daysLeft };
}

// «кафе 450», «+ зарплата 60 000», «такси 1,5к #транспорт»
const FIN_KW = [[/такси|метро|автобус|бензин|топлив|парковк|самокат|электричк|трамва|каршеринг/, 'Транспорт'], [/кофе|кафе|обед|ужин|завтрак|ресторан|пицц|суши|шаурм|бургер|доставк/, 'Кафе и рестораны'],
  [/продукт|магазин|пят[её]рочк|магнит|перекр[её]ст|ашан|вкусвилл|супермаркет|еда/, 'Продукты'], [/аптек|врач|лекарств|клиник|стоматолог|анализ/, 'Здоровье'],
  [/кино|концерт|театр|игр|клуб|бар\b/, 'Развлечения'], [/одежд|обув|куртк|джинс|футболк/, 'Одежда'], [/подар/, 'Подарки'], [/зарплат|^зп|аванс|оклад|преми/, 'Зарплата'],
  [/аренд|ипотек|квартплат/, 'Аренда или ипотека'], [/коммунал|жкх|электричеств/, 'Коммунальные услуги'], [/интернет|связь|мобильн/, 'Интернет и связь']];
// Какие разделы относятся к виду записи: расход, доход, накопление
const KIND_G = { out:['exp', 'sub', 'reg', 'debt'], inc:['inc'], sav:['sav'] };
const kindDefaultCat = k => (k === 'out' ? S.fin.cats.find(x => x.g === 'exp' && x.name === 'Прочее') || S.fin.cats.find(x => x.g === 'exp')
  : k === 'inc' ? S.fin.cats.find(x => x.g === 'inc' && x.name === 'Прочие доходы') || S.fin.cats.find(x => x.g === 'inc') : S.fin.cats.find(x => x.g === 'sav')) || S.fin.cats[0];
// kind — выбранный вид записи (на странице «Финансы»); без него категория угадывается среди всех
function parseMoney(raw, kind) {
  const s = String(raw || '').trim();
  const m = s.match(/(^|\s)([+-]?)\s*(\d{1,3}(?:[  ]\d{3})+|\d+)(?:[.,](\d{1,2}))?\s*(к|k|тыс\.?)?(?=\s|₽|$|р\b|руб)/i);
  if (!m) return { ok:false };
  let amt = Number(m[3].replace(/[  ]/g, '') + (m[4] ? '.' + m[4] : ''));
  if (m[5]) amt *= 1000;
  let rest = (s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length)).replace(/₽|\bруб\S*|\bр\b/gi, ' ').replace(/\s+/g, ' ').trim();
  const plus = m[2] === '+' || /^\+/.test(s);
  rest = rest.replace(/^\+\s*/, '');
  const k = plus ? 'inc' : kind, pool = k ? S.fin.cats.filter(x => KIND_G[k].includes(x.g)) : S.fin.cats;
  let c = null;
  const tag = rest.match(/#(\S+)/);
  if (tag) { const q = tag[1].toLowerCase(); c = pool.find(x => x.name.toLowerCase().startsWith(q)); rest = rest.replace(tag[0], '').trim(); }
  const low = rest.toLowerCase();
  if (!c) { const kw = FIN_KW.find(([re]) => re.test(low)); if (kw) c = pool.find(x => x.name === kw[1]); }
  if (!c && low.length >= 3) c = pool.find(x => { const n = x.name.toLowerCase(); return low.split(' ').some(w => w.length >= 3 && (n.startsWith(w.slice(0, 5)) || w.startsWith(n.split(' ')[0].slice(0, 5)))); });
  if (!c) c = kindDefaultCat(k || 'out');
  return { ok: amt > 0 && !!c, amt, cat: c && c.id, note: rest.charAt(0).toUpperCase() + rest.slice(1) };
}
function addOp(o) {
  snap(); S.fin.ops.push(Object.assign({ id:'o' + uid() }, o)); save(); render();
  const c = fcat(o.cat); toast(`${c.g === 'inc' ? 'Доход' : c.g === 'sav' ? 'Отложено' : 'Расход'}: ${rub(o.amt)} · ${c.name}`, true);
}

const ft = (label, val, sub, cls) => `<div class="ft-t${cls ? ' ' + cls : ''}"><span>${label}</span><b>${val}</b><small>${sub}</small></div>`;
function finTiles(st, lim) {
  return `<div class="ft">
    ${lim ? ft('Можно потратить сегодня', rub0(Math.max(0, lim.left)), lim.left >= 0 ? `лимит ${rub0(lim.limit)} в день · потрачено ${rub0(lim.today)}` : `лимит превышен на ${rub0(-lim.left)}`, 'hero' + (lim.left < 0 ? ' neg' : '')) : ''}
    ${ft('Доходы', rub0(st.g.inc.fact), st.g.inc.plan ? 'план ' + rub0(st.g.inc.plan) : '<button class="lnk" data-act="finbudget">задать план</button>')}
    ${ft('Расходы', rub0(st.spent), st.spentPlan ? 'бюджет ' + rub0(st.spentPlan) : '<button class="lnk" data-act="finbudget">задать бюджет</button>', st.spentPlan && st.spent > st.spentPlan ? 'neg' : '')}
    ${ft('Накопления', rub0(st.g.sav.fact), st.g.sav.plan ? 'план ' + rub0(st.g.sav.plan) : '<button class="lnk" data-act="finbudget">задать план</button>')}
    ${ft('Осталось', rub0(st.left), 'доходы − расходы − накопления', st.left < 0 ? 'neg' : '')}
  </div>`;
}
function finBullets(st) {
  const gs = ['sub', 'reg', 'exp', 'sav', 'debt'], max = Math.max(1, ...gs.map(k => Math.max(st.g[k].plan, st.g[k].fact)));
  return `<div class="card"><div class="card-h"><b>Бюджет и факт</b><small>черта — бюджет</small></div><div class="bl">${gs.map(k => { const x = st.g[k], over = x.plan && x.fact > x.plan;
    return `<div class="bl-row"><span class="bl-n"><i style="background:${FG[k].c}"></i>${FG[k].n}</span><div class="bl-track" data-tip="${FG[k].n}\nФакт: ${rub0(x.fact)}\nБюджет: ${rub0(x.plan)}${over ? '\nПерерасход: ' + rub0(x.fact - x.plan) : ''}"><i class="bl-fill" style="width:${x.fact / max * 100}%;background:${FG[k].c}"></i>${x.plan ? `<i class="bl-plan" style="left:${x.plan / max * 100}%"></i>` : ''}</div><span class="bl-v${over ? ' neg' : ''}">${rub0(x.fact)}<small> / ${rub0(x.plan)}</small></span></div>`; }).join('')}</div></div>`;
}
function finDonut(st) {
  const segs = FG_DONUT.map(k => ({ name:FG[k].n, val:st.g[k].fact, color:FG[k].c, tip:`${FG[k].n}\n${rub0(st.g[k].fact)}` })), total = segs.reduce((a, s) => a + s.val, 0);
  return `<div class="card"><div class="card-h"><b>Куда ушли деньги</b></div>${total ? `<div class="fd">${donutSVG(segs, 132, rub0(total), 'за месяц')}
    <div class="fd-l">${segs.filter(s => s.val).sort((a, b) => b.val - a.val).map(s => `<div><i style="background:${s.color}"></i><span>${s.name}</span><b>${Math.round(s.val / total * 100)}%</b></div>`).join('')}</div></div>` : '<p class="empty">Здесь появится, на что уходят деньги, когда вы запишете первые траты.</p>'}</div>`;
}
function finDaily(st, ym) {
  const days = ymDays(ym), t = todayK(), vals = days.map(k => st.ops.filter(o => o.date === k && fcat(o.cat).g === 'exp').reduce((a, o) => a + o.amt, 0));
  const avg = st.g.exp.plan / days.length, top = niceMax(Math.max(avg, ...vals) * 1.1);
  return `<div class="card"><div class="card-h"><b>Траты по дням</b><small>раздел «Траты»</small></div>
    ${chartBox({ kind:'cols', xs: days.map(k => String(+k.slice(8))), vals: vals.map((v, i) => days[i] <= t ? v : 0), color:'var(--c-blue)', name:'потрачено', max:top, yTicks:[0, top / 2, top], yFmt: v => v >= 1000 ? NF.format(v / 1000) + 'к' : String(v), fmt: rub0, left:40,
      ref: avg || null, refLabel: avg ? 'бюджет в день ' + rub0(avg) : '', tipTitle: i => fmtLong(days[i]) }, 170, 'Траты по дням месяца')}</div>`;
}
function finGroup(k, st) {
  const G = FG[k], x = st.g[k], cats = S.fin.cats.filter(c => c.g === k);
  return `<div class="card fg-card" style="--g:${G.c}"><div class="card-h"><b><i class="fg-dot"></i>${G.n}</b><small>${rub0(x.fact)} из ${rub0(x.plan)}</small></div>
    <div class="fg-tbl${G.bill ? ' bill' : ''}"><div class="fg-row fg-head"><span>Категория</span>${G.bill ? '<span>Срок</span>' : ''}<span>Бюджет</span><span>Факт</span><span>${G.bill ? 'Оплачено' : G.rest}</span></div>
    ${cats.map(c => { const fct = st.fact[c.id] || 0, rest = (c.plan || 0) - fct, paid = c.plan > 0 ? fct >= c.plan : fct > 0;
      return `<div class="fg-row"><button class="fg-n" data-act="fcedit" data-id="${c.id}" title="Изменить категорию"><span class="em">${esc(c.emoji || '•')}</span><span class="nm">${esc(c.name)}</span></button>
      ${G.bill ? `<span class="fg-due">${c.due ? 'до ' + c.due : '—'}</span>` : ''}<button class="fg-num fg-plan" data-act="finbudget" data-id="${c.id}" title="Задать бюджет">${c.plan ? rub0(c.plan) : 'задать'}</button>
      <button class="fg-num fg-fact" data-act="opnew" data-cat="${c.id}" title="Записать">${fct ? rub0(fct) : '+'}</button>
      ${G.bill ? `<span class="fg-chk"><button class="chk fg-paid${paid ? ' on' : ''}" data-act="fpaid" data-id="${c.id}" aria-pressed="${paid}" aria-label="${esc(c.name)}: оплачено">${paid ? I(IC.check, 13) : ''}</button></span>` : `<span class="fg-num${rest < 0 ? ' neg' : ''}">${c.plan ? rub0(rest) : '—'}</span>`}</div>`; }).join('')}
    </div><button class="fg-add" data-act="fcnew" data-g="${k}">${I(IC.plus, 14)} Категория</button></div>`;
}
function finHistory(st) {
  const ops = [...st.ops].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)), byDay = {};
  ops.forEach(o => (byDay[o.date] = byDay[o.date] || []).push(o));
  return `<div class="card"><div class="card-h"><b>История</b><small>${plural(ops.length, ['запись', 'записи', 'записей'])}</small></div>
    ${ops.length ? Object.keys(byDay).map(k => `<div class="fh-day"><div class="fh-d">${esc(dayDiff(todayK(), k) >= -2 && k <= todayK() ? relDay(k) : fmtLong(k))}</div>${byDay[k].map(o => { const c = fcat(o.cat), plus = c.g === 'inc';
      return `<div class="fh-row"><button class="fh-main" data-act="opedit" data-id="${o.id}"><span class="em">${esc(c.emoji || '•')}</span><span class="fh-t"><b>${esc(o.note || c.name)}</b><small>${esc(o.note ? c.name : FG[c.g].n)}</small></span><b class="fh-a${plus ? ' plus' : ''}">${plus ? '+' : '−'}${rub(o.amt)}</b></button><button class="fz-x" data-act="opdel" data-id="${o.id}" aria-label="Удалить запись">${I(IC.x, 14)}</button></div>`; }).join('')}</div>`).join('')
    : '<p class="empty">Записей за этот месяц нет. Напишите трату в поле сверху — например, «продукты 1200».</p>'}</div>`;
}
// «Топ покупок»: самые дорогие траты месяца (раздел «Траты»)
const topBuys = (ym, n) => opsIn(ym).filter(o => fcat(o.cat).g === 'exp').sort((a, b) => b.amt - a.amt || b.date.localeCompare(a.date)).slice(0, n);
const topBuysHTML = ym => { const l = topBuys(ym, 5); return l.length ? l.map((o, i) => { const c = fcat(o.cat); return `<button class="sbl sbl-buy" data-act="opedit" data-id="${o.id}"><span class="sbl-n">${i + 1}</span><span class="sbl-em">${esc(c.emoji || '•')}</span><span class="sbl-t">${esc(o.note || c.name)}<small>${esc(shortDate(o.date))} · ${esc(c.name)}</small></span><b>${rub0(o.amt)}</b></button>`; }).join('') : '<p class="sbl-empty">Здесь появятся самые дорогие покупки месяца</p>'; };

// ---- Окно записи ----
let opForm = null, finKind = 'out';   // finKind — что записывает строка быстрого ввода: расход, доход или накопление
const FIN_PH = { out:'Например: «кафе 450», «такси 380»', inc:'Например: «зарплата 60 000», «подработка 5000»', sav:'Например: «отпуск 5000», «подушка 10 000»' };
const OP_KINDS = [['out', 'Расход', ['exp', 'sub', 'reg', 'debt']], ['inc', 'Доход', ['inc']], ['sav', 'Накопление', ['sav']]];
const kindOfCat = id => { const g = fcat(id).g; return g === 'inc' ? 'inc' : g === 'sav' ? 'sav' : 'out'; };
function openOp(id, preset) {
  const o = id ? S.fin.ops.find(x => x.id === id) : null; if (id && !o) return;
  const p = preset || {}, catId = o ? o.cat : p.cat || (S.fin.cats.find(c => c.g === 'exp') || S.fin.cats[0]).id;
  const t = todayK(), d = o ? o.date : p.date || (ymOf(t) === secYM ? t : secYM + '-01');
  opForm = { id, cat:catId, kind:kindOfCat(catId), amt: o ? String(o.amt) : p.amt ? String(p.amt) : '', date:d, note: o ? o.note || '' : p.note || '' };
  drawOp();
  setTimeout(() => { const i = $('#op_amt'); if (i && !id) i.focus(); }, 60);
}
function drawOp(keep) {
  const f = opForm, groups = OP_KINDS.find(k => k[0] === f.kind)[2];
  sheet(`<div class="sh-head"><h3>${f.id ? 'Запись' : 'Новая запись'}</h3>${f.id ? `<button class="ic" data-act="opdel" data-id="${f.id}" title="Удалить" aria-label="Удалить" style="color:var(--dng)">${I(IC.trash, 17)}</button>` : ''}<button class="ic" data-act="close" aria-label="Закрыть">${I(IC.x, 18)}</button></div>
  <div class="op-amt"><input id="op_amt" class="f-title" type="text" inputmode="decimal" placeholder="0" value="${esc(f.amt)}" autocomplete="off" aria-label="Сумма"><span>₽</span></div>
  <div class="chips" style="margin:0 0 8px">${OP_KINDS.map(([v, n]) => `<button type="button" class="chip${f.kind === v ? ' on' : ''}" data-act="opkind" data-v="${v}">${n}</button>`).join('')}</div>
  <div class="frow"><span class="fl">Категория</span><div>${groups.map(g => `${groups.length > 1 ? `<div class="op-g">${FG[g].n}</div>` : ''}<div class="ccats">${S.fin.cats.filter(c => c.g === g).map(c => `<button type="button" class="ccat${c.id === f.cat ? ' on' : ''}" data-act="opcat" data-id="${c.id}" style="--c:${FG[g].c}">${esc(c.emoji || '')} ${esc(c.name)}</button>`).join('')}</div>`).join('')}
    ${f.adding ? `<div class="op-newcat"><input id="op_ce" class="fin" type="text" value="${FG_EMOJI[groups[0]]}" maxlength="4" aria-label="Значок"><input id="op_cn" class="fin" type="text" placeholder="Название, например «Кофе»" maxlength="40" autocomplete="off" aria-label="Название категории">${groups.length > 1 ? `<select id="op_cg" class="fin" aria-label="Раздел">${groups.map(g => `<option value="${g}">${FG[g].n}</option>`).join('')}</select>` : ''}<button type="button" class="btn pri" data-act="opcatadd">Добавить</button></div>`
      : `<button type="button" class="ccat op-plus" data-act="opcatnew">${I(IC.plus, 14)} Своя категория</button>`}</div></div>
  <div class="frow"><span class="fl">Дата</span><input id="op_d" class="fin" type="date" value="${f.date}"></div>
  <div class="frow"><span class="fl">Заметка</span><input id="op_n" class="fin" type="text" value="${esc(f.note)}" placeholder="Необязательно" autocomplete="off"></div>
  <div class="sh-foot"><button class="btn pri grow" data-act="opsave">Сохранить</button></div>`, keep);
}
const opKeep = () => { if (!opForm) return; const a = $('#op_amt'), d = $('#op_d'), n = $('#op_n'); if (a) opForm.amt = a.value; if (d) opForm.date = d.value; if (n) opForm.note = n.value; };
ACT.opnew = el => openOp(null, { cat: el.dataset.cat || kindDefaultCat(finKind).id });
// Своя категория прямо из окна записи: появляется сразу выбранной
const FG_EMOJI = { inc:'💰', sub:'🔁', reg:'🧾', exp:'🛍️', sav:'🐷', debt:'💳' };
ACT.opcatnew = () => { opKeep(); opForm.adding = true; drawOp(true); setTimeout(() => { const i = $('#op_cn'); if (i) i.focus(); }, 40); };
ACT.opcatadd = () => {
  const n = $('#op_cn'), name = n ? n.value.trim() : ''; if (!name) { if (n) n.focus(); return toast('Напишите название категории'); }
  const g = $('#op_cg') ? $('#op_cg').value : OP_KINDS.find(k => k[0] === opForm.kind)[2][0], id = 'f' + uid();
  opKeep(); snap(); S.fin.cats.push({ id, g, name: name.slice(0, 40), emoji: ($('#op_ce').value.trim() || FG_EMOJI[g]).slice(0, 4), plan:0 });
  opForm.cat = id; opForm.adding = false; save(); render(); drawOp(true); toast('Категория «' + name + '» добавлена');
};
ACT.opedit = el => openOp(el.dataset.id);
ACT.opkind = el => { opKeep(); opForm.kind = el.dataset.v; const g = OP_KINDS.find(k => k[0] === opForm.kind)[2]; if (!g.includes(fcat(opForm.cat).g)) opForm.cat = (S.fin.cats.find(c => c.g === g[0]) || {}).id; drawOp(true); };
ACT.opcat = el => { opKeep(); opForm.cat = el.dataset.id; drawOp(true); };
ACT.opsave = saveOp;
function saveOp() {
  opKeep();
  const f = opForm, amt = Number(String(f.amt).replace(/[\s ]/g, '').replace(',', '.'));
  if (!(amt > 0)) { $('#op_amt').focus(); return toast('Введите сумму'); }
  if (!f.cat || !isDayKey(f.date)) return;
  if (f.id) { const o = S.fin.ops.find(x => x.id === f.id); if (!o) return; snap(); Object.assign(o, { amt, cat:f.cat, date:f.date, note:f.note.trim() }); save(); closeSheet(); render(); toast('Запись сохранена', true); }
  else { closeSheet(); addOp({ amt, cat:f.cat, date:f.date, note:f.note.trim() }); }
}
ACT.opdel = el => { snap(); S.fin.ops = S.fin.ops.filter(o => o.id !== el.dataset.id); save(); if (sheetOpen()) closeSheet(); render(); toast('Запись удалена', true); };
// Отметка «оплачено»: записывает платёж на сумму бюджета; снятие убирает платежи этого месяца
ACT.fpaid = el => {
  const c = S.fin.cats.find(x => x.id === el.dataset.id); if (!c) return;
  const ym = secYM, fct = opsIn(ym).filter(o => o.cat === c.id).reduce((a, o) => a + o.amt, 0);
  if (c.plan > 0 ? fct >= c.plan : fct > 0) { snap(); S.fin.ops = S.fin.ops.filter(o => !(o.cat === c.id && o.date.startsWith(ym))); save(); render(); return toast(`«${c.name}»: отметка об оплате снята`, true); }
  if (!c.plan) return openOp(null, { cat:c.id });
  const t = todayK();
  addOp({ cat:c.id, amt:c.plan - fct, date: ymOf(t) === ym ? t : ym + '-' + String(Math.min(c.due || 1, ymDays(ym).length)).padStart(2, '0'), note:'Оплачено' });
};
ACT.fqadd = () => quickMoney();
function quickMoney() {
  const i = $('#fq_in'); if (!i) return;
  const p = parseMoney(i.value, finKind); if (!p.ok) { i.focus(); return toast('Напишите сумму, например «' + (finKind === 'inc' ? 'зарплата 60 000' : finKind === 'sav' ? 'отпуск 5000' : 'кафе 450') + '»'); }
  const t = todayK();
  addOp({ amt:p.amt, cat:p.cat, note:p.note, date: ymOf(t) === secYM ? t : secYM + '-01' });
  const n = $('#fq_in'); if (n) n.focus();
}
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || e.isComposing) return;
  if (e.target.id === 'fq_in') { e.preventDefault(); quickMoney(); }
  else if (e.target.id === 'op_amt' || e.target.id === 'op_n') { e.preventDefault(); saveOp(); }
  else if (e.target.id === 'op_cn') { e.preventDefault(); ACT.opcatadd(); }
  else if (e.target.dataset && e.target.dataset.fnewcat) { e.preventDefault(); budgetNewCat(e.target); }
  else if (e.target.dataset && e.target.dataset.fplan) { e.preventDefault(); e.target.blur(); }
  else if (e.target.id === 'fc_n' || e.target.id === 'fc_plan') { e.preventDefault(); saveFinCat(); }
});
document.addEventListener('input', e => {
  if (e.target.id !== 'fq_in') return;
  const el = $('#fq_hint'), p = e.target.value.trim() ? parseMoney(e.target.value, finKind) : { ok:false }, g = p.ok ? fcat(p.cat).g : '';
  if (el) el.innerHTML = p.ok ? `${I(IC.spark, 13)} Запишу ${g === 'inc' ? 'доход' : g === 'sav' ? 'в накопления' : 'расход'}: <b>${esc(fcat(p.cat).name)}</b><b>${rub(p.amt)}</b>${p.note ? `<b>${esc(p.note)}</b>` : ''}` : '';
});
ACT.fqkind = el => { const i = $('#fq_in'), v = i ? i.value : ''; finKind = el.dataset.k; render(); const n = $('#fq_in'); if (n) { n.value = v; n.focus(); n.dispatchEvent(new Event('input', { bubbles:true })); } };

// ---- Бюджет на месяц: план доходов и бюджет расходов по всем категориям в одном окне ----
const planOf = g => S.fin.cats.filter(c => c.g === g).reduce((a, c) => a + (c.plan || 0), 0);
function budgetSumHTML() {
  const inc = planOf('inc'), out = FG_OUT.reduce((a, g) => a + planOf(g), 0), sav = planOf('sav'), free = inc - out - sav;
  return `<div><small>Доходы</small><b>${rub0(inc)}</b></div><div><small>Расходы</small><b>${rub0(out)}</b></div><div><small>Накопления</small><b>${rub0(sav)}</b></div><div class="${free < 0 ? 'neg' : ''}"><small>Свободно</small><b>${rub0(free)}</b></div>`;
}
function openBudget(focusId, keep) {
  sheet(`<div class="sh-head"><h3>Бюджет на месяц</h3><button class="ic" data-act="close" aria-label="Закрыть">${I(IC.x, 18)}</button></div>
  <p class="set-note" style="margin:0 0 10px">Сколько планируете получать, тратить и откладывать за месяц. Бюджет одинаковый для каждого месяца — по нему считаются остаток и дневной лимит.</p>
  <div class="bd-sum" id="bd_sum">${budgetSumHTML()}</div>
  ${FG_ORDER.map(g => `<div class="bd-g" style="--g:${FG[g].c}"><div class="bd-h"><i></i>${FG[g].n}<b id="bd_t_${g}">${rub0(planOf(g))}</b></div>
    ${S.fin.cats.filter(c => c.g === g).map(c => `<label class="bd-row"><span class="em">${esc(c.emoji || '•')}</span><span class="nm">${esc(c.name)}</span><span class="bd-in"><input class="fin" type="text" inputmode="decimal" data-fplan="${c.id}" value="${c.plan || ''}" placeholder="0" aria-label="${esc(c.name)}: сумма в месяц"><em>₽</em></span></label>`).join('')}
    <input class="fin bd-add" type="text" data-fnewcat="${g}" placeholder="+ ${g === 'inc' ? 'свой источник дохода' : 'своя категория'} — напишите и нажмите Enter" autocomplete="off" aria-label="Новая категория: ${FG[g].n}">
  </div>`).join('')}
  <button class="btn pri" style="width:100%;margin-top:14px" data-act="close">Готово</button>`, keep);
  if (focusId) setTimeout(() => { const i = $(`[data-fplan="${focusId}"]`); if (i) { i.scrollIntoView({ block:'center' }); i.focus(); i.select(); } }, 60);
}
function budgetNewCat(inp) {
  const name = inp.value.trim(), g = inp.dataset.fnewcat; if (!name || !FG[g]) return;
  const id = 'f' + uid(); snap(); S.fin.cats.push({ id, g, name: name.slice(0, 40), emoji: FG_EMOJI[g], plan:0 }); save(); render(); openBudget(id, true);
}
ACT.finbudget = el => openBudget(el.dataset.id);
document.addEventListener('change', e => {
  const id = e.target.dataset && e.target.dataset.fplan; if (!id) return;
  const c = S.fin.cats.find(x => x.id === id); if (!c) return;
  const v = Math.max(0, Number(String(e.target.value).replace(/[\s ₽]/g, '').replace(',', '.')) || 0);
  c.plan = Math.round(v * 100) / 100; e.target.value = c.plan || ''; save(); render();
  const s = $('#bd_sum'); if (s) s.innerHTML = budgetSumHTML();
  const t = $('#bd_t_' + c.g); if (t) t.textContent = rub0(planOf(c.g));
});

// ---- Категории ----
let fcForm = null;
function openFinCat(id, g) {
  const c = id ? S.fin.cats.find(x => x.id === id) : null; if (id && !c) return;
  fcForm = { id, g: c ? c.g : g || 'exp', ask:false }; drawFinCat(c);
}
function drawFinCat(c, keep) {
  const f = fcForm, n = c ? opsIn('').filter(o => o.cat === c.id).length : 0;
  sheet(`<div class="sh-head"><h3>${FG[f.g].n}</h3>${c ? `<button class="ic" data-act="fcdel" title="Удалить" aria-label="Удалить" style="color:var(--dng)">${I(IC.trash, 17)}</button>` : ''}<button class="ic" data-act="close" aria-label="Закрыть">${I(IC.x, 18)}</button></div>
  <div class="op-amt"><input id="fc_e" class="f-title fc-em" type="text" value="${esc(c ? c.emoji || '' : '📌')}" maxlength="4" aria-label="Значок"><input id="fc_n" class="f-title" type="text" value="${esc(c ? c.name : '')}" placeholder="Название категории" autocomplete="off" maxlength="40"></div>
  <div class="frow"><span class="fl">${f.g === 'inc' ? 'План в месяц' : 'Бюджет в месяц'}</span><input id="fc_plan" class="fin" type="text" inputmode="decimal" value="${c && c.plan ? c.plan : ''}" placeholder="0 ₽"></div>
  ${FG[f.g].bill ? `<div class="frow"><span class="fl">Срок оплаты</span><select id="fc_due" class="fin"><option value="">Не указан</option>${[...Array(31)].map((_, i) => `<option value="${i + 1}"${c && c.due === i + 1 ? ' selected' : ''}>до ${i + 1} числа</option>`).join('')}</select></div>` : ''}
  <div class="sh-foot"><button class="btn pri grow" data-act="fcsave">Сохранить</button></div>
  ${f.ask ? `<div class="ask"><b>Удалить категорию «${esc(c.name)}»${n ? ` и ${plural(n, ['запись', 'записи', 'записей'])} в ней` : ''}?</b><div class="row"><button class="btn dngf" data-act="fcdelyes">Удалить</button><button class="btn" data-act="fcdelno">Отмена</button></div></div>` : ''}`, keep);
  if (!c) setTimeout(() => { const i = $('#fc_n'); if (i) i.focus(); }, 60);
}
function saveFinCat() {
  const f = fcForm, name = $('#fc_n').value.trim(); if (!name) { $('#fc_n').focus(); return; }
  const plan = Math.max(0, Number(String($('#fc_plan').value).replace(/[\s ₽]/g, '').replace(',', '.')) || 0), due = $('#fc_due') ? Number($('#fc_due').value) || 0 : 0;
  const data = { name, emoji: $('#fc_e').value.trim(), plan, due: due || undefined };
  snap();
  const c = f.id && S.fin.cats.find(x => x.id === f.id);
  if (c) Object.assign(c, data); else S.fin.cats.push(Object.assign({ id:'f' + uid(), g:f.g }, data));
  save(); closeSheet(); render(); toast(c ? 'Категория сохранена' : 'Категория добавлена', true);
}
ACT.fcedit = el => openFinCat(el.dataset.id);
ACT.fcnew = el => openFinCat(null, el.dataset.g);
ACT.fcsave = saveFinCat;
ACT.fcdel = () => { fcForm.ask = true; drawFinCat(S.fin.cats.find(x => x.id === fcForm.id), true); };
ACT.fcdelno = () => { fcForm.ask = false; drawFinCat(S.fin.cats.find(x => x.id === fcForm.id), true); };
ACT.fcdelyes = () => { snap(); S.fin.cats = S.fin.cats.filter(c => c.id !== fcForm.id); S.fin.ops = S.fin.ops.filter(o => o.cat !== fcForm.id); save(); closeSheet(); render(); toast('Категория удалена', true); };

SEC.fin = {
  name:'Финансы', icon:IC.wallet, newLabel:'Запись',
  title: () => innerWidth >= 900 ? `${ymTitle(secYM)}<span class="sub">финансы</span>` : ymHead(secYM),
  html: () => financeHTML(),
  move: n => { secYM = ymAdd(secYM, n); },
  create: () => openOp(),
  side: () => `<div class="sb-sec"><div class="sb-h">Топ покупок · ${MON[Number(secYM.slice(5)) - 1].toLowerCase()}</div>${topBuysHTML(secYM)}</div>`,
  info: () => { const st = finStat(ymOf(todayK())), lim = dailyLimit(st, ymOf(todayK())); return lim ? `Сегодня можно: <b>${rub0(Math.max(0, lim.left))}</b>` : `Расходы за месяц: <b>${rub0(st.spent)}</b>`; },
  demo: on => {
    if (!on) {
      S.fin.ops = S.fin.ops.filter(o => !o.demo);
      const bk = S.fin.demoPlans || {}; S.fin.cats.forEach(c => { if (c.id in bk) c.plan = bk[c.id]; }); delete S.fin.demoPlans; return;
    }
    const P = { 'Зарплата':120000, 'Подработка':25000, 'Музыка':299, 'Кино и сериалы':399, 'Облако и сервисы':199, 'Аренда или ипотека':35000, 'Коммунальные услуги':5500, 'Интернет и связь':900, 'Спортзал':2500,
      'Продукты':25000, 'Кафе и рестораны':8000, 'Транспорт':5000, 'Одежда':5000, 'Развлечения':4000, 'Здоровье':3000, 'Подарки':3000, 'Прочее':2000, 'Подушка безопасности':15000, 'Отпуск':10000, 'Кредит':9400 };
    const bk = {}; S.fin.cats.forEach(c => { if (c.name in P) { bk[c.id] = c.plan || 0; c.plan = P[c.name]; } }); S.fin.demoPlans = bk;
    const rnd = seeded(11), t = todayK(), ym = ymOf(t), byName = n => (S.fin.cats.find(c => c.name === n) || {}).id;
    const add = (n, amt, k, note) => { const id = byName(n); if (id && k <= t) S.fin.ops.push({ id:'o' + uid() + S.fin.ops.length, demo:true, cat:id, amt, date:k, note:note || '' }); };
    const pm = ymAdd(ym, -1);
    // прошлый месяц — чтобы было с чем сравнить, и текущий — до сегодняшнего дня
    [pm, ym].forEach(m => {
      const D = ymDays(m);
      add('Зарплата', 60000, D[0], 'Аванс'); add('Зарплата', 60000, D[14]); add('Подработка', 18000, D[19], 'Проект');
      add('Аренда или ипотека', 35000, D[0]); add('Интернет и связь', 900, D[2]); add('Музыка', 299, D[6]); add('Кино и сериалы', 399, D[9]); add('Спортзал', 2500, D[1]); add('Кредит', 9400, D[14]);
      add('Подушка безопасности', 15000, D[5]);
      D.forEach(k => {
        if (rnd() < .45) add('Продукты', 300 + Math.round(rnd() * 25) * 60, k, ['Пятёрочка', 'ВкусВилл', 'Магнит', 'Рынок'][Math.floor(rnd() * 4)]);
        if (rnd() < .3) add('Кафе и рестораны', 250 + Math.round(rnd() * 20) * 40, k, ['Кофе', 'Обед', 'Ужин с друзьями'][Math.floor(rnd() * 3)]);
        if (rnd() < .35) add('Транспорт', 60 + Math.round(rnd() * 10) * 40, k, ['Метро', 'Такси'][Math.floor(rnd() * 2)]);
      });
      add('Развлечения', 1800, D[11], 'Кино'); add('Здоровье', 1250, D[17], 'Аптека'); add('Одежда', 3900, D[20], 'Кроссовки');
    });
  },
};
