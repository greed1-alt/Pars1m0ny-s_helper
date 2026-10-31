// ---- ParsiCoins: внутренняя валюта, задания и магазин (28 октября 2026) ----
// Решения пользователя: название — «ParsiCoins» («пока пусть будут, потом если что поменяем» — константа COIN); монеты — за задания дня
// и недели (платят мало), достижения, серию дней подряд и друга в Parsimony (временно); в магазине — палитры (3 на выбор бесплатно,
// остальные — за монеты; Индиго — у всех), рамки аватара, обложки профиля, заморозка серии. Платных функций пока нет.
// Баланс, награды и покупки решает сервер (supabase/sql/coins.sql): монеты не дописать себе в приложении, награда выдаётся один раз,
// заданий — не больше 3 в день и 3 в неделю. Здесь — показать, проверить условие задания и попросить сервер.
// Каталог и награды — копия coins.sql (тест tools/test-coins.mjs сверяет). Кэш на устройстве — remapp_coins
const COIN = 'ParsiCoins', CN_LS = 'remapp_coins';
// Значок монеты — пиксельное золотое древо, рисунок по клеткам (выбор пользователя 31 октября 2026). 17×17: тёмный контур, край — светлый сверху слева и тёмный
// справа снизу, вековой дуб: крона полного размера с контрастной листвой и просветами, тень под ней, толстый ствол с корнями; для мелких — 13×13.
// Размер подгоняется так, чтобы клетка была целым числом точек экрана: иначе клетки выходят разной ширины. Если 17×17 так отличается от нужного размера
// больше чем на 25 % — 13×13, если она ближе. Пробовали жёлудь, голографический жетон, ракушку, кольца, белок и зелёное древо — код в коммите eeb65cb
const PX_COL = { K: '#1d0b2b', Y: '#f6dc68', G: '#ecac40', R: '#c75b2f', e: '#b56f1f', f: '#94561a',   // контур, блик края, золото, тень края, ствол
  A: '#fff4b0', B: '#fad468', D: '#c67c1e', S: '#c9842a' };   // листва: блик, середина, тень; тень на монете
const COIN_PX = {
  17: ['......KKKKK......', '....KKYYYYYKK....', '...KYYAABBAYYK...', '..KYAAABBDBAAYK..', '.KYAABBDAABBDDYK.', '.KYABBBBBBBDBDGK.', 'KYABBDAABBBBDDDRK', 'KYDBBBBBBeBDDDDRK', 'KYSDBeBBeBeDBDSRK',
    'KYGSDDeeefeDDSGRK', 'KYGGSSeeeefSSGGRK', '.KYGGGeeeefGGGRK.', '.KYGGeeeeeffGGRK.', '..KYeeeGeeGffRK..', '...KYGGGGGGRRK...', '....KKRRRRRKK....', '......KKKKK......'],
  13: ['....KKKKK....', '..KKYYYYYKK..', '.KYYGABASYYK.', '.KYAABDBBDYK.', 'KYAABBDBBDDGK', 'KYABDBBBDDDRK', 'KYDBeBBeBDDRK',
    'KYSDDeeeDDSRK', 'KYGSSeefSSGRK', '.KYGeeeffGRK.', '.KYYGeGfGRRK.', '..KKGRRRRKK..', '....KKKKK....'],
};
const pxPaths = g => { const runs = {};
  g.forEach((r, y) => { for (let x = 0; x < r.length;) { const c = r[x]; let w = 1; while (r[x + w] === c) w++; if (c !== '.') (runs[c] = runs[c] || []).push(`M${x} ${y}h${w}v1h-${w}z`); x += w; } });
  return Object.keys(runs).map(c => `<path fill="${PX_COL[c]}" d="${runs[c].join('')}"/>`).join(''); };
const PX_IN = { 17: pxPaths(COIN_PX[17]), 13: pxPaths(COIN_PX[13]) };
function coinI(s = 18) { const r = window.devicePixelRatio || 1, fit = n => [n, Math.max(1, Math.round(s * r / n - .01)) * n / r], a = fit(17), b = fit(13),
    off = ([, px]) => Math.abs(px - s), [n, px] = off(a) <= s * .25 || off(a) <= off(b) ? a : b;
  return `<svg class="coin" width="${+px.toFixed(2)}" height="${+px.toFixed(2)}" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" aria-hidden="true">${PX_IN[n]}</svg>`; }
onMigrate(() => { delete S.settings.coinLook; });   // переключатель пробы значков
// Полёт монет из кнопки «Забрать» в баланс наверху страницы; число обновляется, когда монеты долетят
function coinFly(from, n) {
  const to = $('.cn-bal .coin'); if (!from || !to || matchMedia('(prefers-reduced-motion: reduce)').matches) return 0;
  const f = from.getBoundingClientRect(), t = to.getBoundingClientRect(), x0 = f.left + f.width / 2 - 11, y0 = f.top + f.height / 2 - 11, x1 = t.left + t.width / 2 - 11, y1 = t.top + t.height / 2 - 11;
  for (let i = 0; i < n; i++) {
    const el = document.createElement('div'); el.className = 'cn-fly'; el.innerHTML = coinI(22); document.body.appendChild(el);
    const mx = (x0 + x1) / 2 + (i - n / 2) * 16, my = Math.min(y0, y1) - 50 - i * 6;
    el.animate([{ transform: `translate(${x0}px,${y0}px) scale(.6)`, opacity: 0 }, { transform: `translate(${mx}px,${my}px) scale(1.2)`, opacity: 1, offset: .45 }, { transform: `translate(${x1}px,${y1}px) scale(.9)`, opacity: 1 }],
      { duration: 720, delay: i * 90, easing: 'cubic-bezier(.3,.7,.4,1)', fill: 'both' }).onfinish = () => el.remove();
    setTimeout(() => el.remove(), 1500 + i * 90);   // если кадры не рисуются (приложение свёрнуто)
  }
  return 720 + (n - 1) * 90;
}
const coinBump = () => { const b = $('.cn-bal'); if (b) b.classList.add('bump'); };

// ---- Каталог (как в coins.sql) ----
const Q_D = 5, Q_W = 20, Q_MAX = 3;   // задание дня, недели; сколько заданий в день и в неделю
const ACH_COINS = { first: 10, t50: 30, t300: 80, w7: 30, w30: 100, m100: 30, bio30: 40, ops50: 30, save10k: 50, notes10: 20, goal1: 10, days30: 50 };
const ST_MILES = [[3, 10], [7, 25], [14, 40], [30, 80], [60, 120], [100, 200]];   // серия дней подряд → монеты
const INV_COINS = 50, INV_MAX = 10;
const PAL_FREE = 3, PAL_PRICE = 200, CV_PRICE = 150, FRZ_PRICE = 50, FRZ_MAX = 2;
const PAL_SHOP = PAL_ORDER.filter(k => k !== 'indigo');   // Индиго — у всех
const COVER_SHOP = { boreal: 'Северное сияние', neon: 'Неон', gold: 'Золото', cosmos: 'Космос', seaset: 'Закат у моря', berry: 'Ягоды' };   // градиенты — COVERS (pages.js)
const FRAMES = {
  gold: { n: 'Золото', p: 200, g: 'conic-gradient(#fff3b0,#f7d774,#b8860b,#f7d774,#fff3b0,#c9a227,#fff3b0)' },
  fire: { n: 'Огонь', p: 200, g: 'conic-gradient(#ff512f,#f09819,#ffdd00,#f09819,#ff512f)' },
  ice: { n: 'Лёд', p: 200, g: 'conic-gradient(#6dd5fa,#e0f7ff,#a1c4fd,#ffffff,#6dd5fa)' },
  neon: { n: 'Неон', p: 200, g: 'conic-gradient(#00f5d4,#9b5de5,#f15bb5,#00f5d4)' },
  sakura: { n: 'Сакура', p: 200, g: 'conic-gradient(#ffb7c5,#ff8fab,#ffe5ec,#ff8fab,#ffb7c5)' },
  emerald: { n: 'Изумруд', p: 200, g: 'conic-gradient(#11998e,#38ef7d,#b4f5c8,#38ef7d,#11998e)' },
  rainbow: { n: 'Радуга', p: 300, g: 'conic-gradient(#ff5f6d,#ffc371,#f9f871,#5ee7a0,#4facfe,#a66cff,#ff5f6d)', spin: true },
};
const coinPrice = it => it === 'frz' ? FRZ_PRICE : it.startsWith('pal:') ? PAL_PRICE : it.startsWith('cv:') ? CV_PRICE : (FRAMES[it.slice(3)] || {}).p;
const itemName = it => { const k = it.split(':')[1];
  return it === 'frz' ? 'Заморозка серии' : it.startsWith('pal:') ? `Палитра «${(PAL[k] || {}).n || k}»` : it.startsWith('cv:') ? `Обложка «${COVER_SHOP[k] || k}»` : `Рамка «${(FRAMES[k] || {}).n || k}»`; };
// Рамка у аватара: класс и цвет для .ava (pages.js, friends.js)
const frameAttr = k => FRAMES[k] ? { c: ' fm' + (FRAMES[k].spin ? ' spin' : ''), s: `;--fm:${FRAMES[k].g}` } : { c: '', s: '' };

onMigrate(() => {
  if (!Array.isArray(S.frz)) S.frz = [];
  S.frz = [...new Set(S.frz.filter(isDate))].sort().slice(-200);   // замороженные дни серии (их тратит сервер — coins_freeze)
  if (S.settings.frame && !FRAMES[S.settings.frame]) delete S.settings.frame;
});

// ---- Состояние (решает сервер) ----
let coins = lsGet(CN_LS), coinsErr = '', cnBusy = false, cnTab = 'tasks', cnDirty = true, cnReady = [];
if (coins && (typeof coins !== 'object' || !coins.items)) coins = null;
const coinOwn = it => it === 'pal:indigo' || !!coins && (coins.items[it] || 0) > 0;   // Индиго — у всех
const coinGot = k => !!coins && coins.keys.includes(k);
const coinsOn = () => signedIn() && coinsErr !== 'off';
const palOk = k => !coins || coinOwn('pal:' + k);   // магазина нет (не вошли) — палитры как раньше
// Замочек на плитке палитры (look.js): ещё не ваша — откроется в магазине (цена — там)
const palLock = k => palOk(k) ? '' : `<em class="pal-lock" title="В магазине">${I(IC.lock, 11)}</em>`;
const cvOk = k => !COVER_SHOP[k] || coinOwn('cv:' + k);
const cnRpc = (fn, body) => api('/rest/v1/rpc/' + fn, { method: 'POST', user: true, body: body || {} });
SAVE_HOOKS.push(() => { cnDirty = true; });
async function coinsLoad() {
  if (!signedIn()) return;
  try {
    const j = await cnRpc('coins_state'), was = JSON.stringify([coins && coins.bal, coins && coins.keys, coins && coins.items]);
    const items = {}; Object.entries(j && j.items || {}).forEach(([k, n]) => { if (typeof k === 'string' && Number.isInteger(n)) items[k] = n; });
    coins = { bal: Math.max(0, j.bal | 0), items, free: j.free | 0, keys: (Array.isArray(j.keys) ? j.keys : []).filter(k => typeof k === 'string'),
      log: (Array.isArray(j.log) ? j.log : []).filter(x => x && typeof x.k === 'string').slice(0, 40), fz: coins && coins.fz || '' };
    coinsErr = ''; cnDirty = true; lsSet(CN_LS, coins);
    coinsHeal();
    if (JSON.stringify([coins.bal, coins.keys, coins.items]) !== was) render();
  } catch (e) {
    coinsErr = e && (e.status === 404 || e.code === 'PGRST202') ? 'off' : 'net';   // coins.sql ещё не выполнен — магазина нет
    if (coinsErr === 'off' && coins) { coins = null; lsSet(CN_LS, null); render(); } else if (sec === 'shop') render();
  }
}
setTimeout(coinsLoad, 3500);
// Заморозки с сервера — в S.frz (их видит и счёт серии у друзей); текущая палитра — одна из трёх бесплатных; заморозка серии
function coinsHeal() {
  const z = coins.keys.filter(k => /^z:\d{4}-\d{2}-\d{2}$/.test(k)).map(k => k.slice(2)).filter(k => !S.frz.includes(k));
  if (z.length) { S.frz = [...S.frz, ...z].sort(); save(); }
  const p = S.settings.pal;
  if (p !== 'indigo' && PAL[p] && !coinOwn('pal:' + p) && coins.free < PAL_FREE) coinPick('pal:' + p, true);
  coinsFreeze();
}
// Вчера (или позавчера) не все ежедневные привычки — заморозка тратится сама, если есть серия, которую она спасёт. Раз в день
async function coinsFreeze() {
  const t = todayK(), n = coins.items.frz || 0;
  if (!n || coins.fz === t) return;
  coins.fz = t; lsSet(CN_LS, coins);
  const fz = new Set(S.frz), miss = [addDays(t, -2), addDays(t, -1)].filter(k => { const d = dayStat(k); return d.plan && d.done < d.plan && !fz.has(k); });
  if (!miss.length || miss.length > n) return;
  let run = 0;
  for (let k = addDays(miss[0], -1), i = 0; i < 400; i++, k = addDays(k, -1)) { const d = dayStat(k); if (!d.plan || fz.has(k)) continue; if (d.done === d.plan) run++; else break; }
  if (!run) return;
  try {
    for (const k of miss) { const r = await cnRpc('coins_freeze', { p_day: k }); if (!r || !r.ok) return; if (!S.frz.includes(k)) S.frz.push(k); }
    S.frz.sort(); save(); render();
    toast(`❄️ Заморозка сохранила серию — ${plural(habitStreaks().cur, NDAY)}`);
    coinsLoad();
  } catch (e) {}
}

// ---- Задания ----
// Сделано задач за дни [a, b] (f — какие считать); шаги к целям — задачи цели и шаги без срока, отмеченные в эти дни (doneAt)
const qDone = (a, b, f) => S.events.reduce((n, e) => { if (!e.task || e.demo || (f && !f(e))) return n; const r = k => k >= a && k <= b; return n + (isRec(e) ? (e.doneDates || []).filter(r).length : e.done && r(e.date) ? 1 : 0); }, 0);
const qSteps = (a, b) => qDone(a, b, e => e.goal) + S.goals.reduce((n, g) => n + (g.steps || []).filter(s => s.done && s.doneAt >= a && s.doneAt <= b).length, 0);
const qDays = (a, b, f) => { let n = 0; for (let k = a; k <= b; k = addDays(k, 1)) if (f(k)) n++; return n; };
const qHab = k => { const d = dayStat(k); return d.plan > 0 && d.done === d.plan; };
const qBio = k => !!S.bio.log[k] && Object.keys(S.bio.log[k]).length > 0;
const qFin = k => S.fin.ops.some(o => o.date === k && !o.demo);
const qOne = (a, b) => S.events.filter(e => !e.demo && !isRec(e) && e.date >= a && e.date <= b).length;
const qNotes = (a, b) => S.notes.filter(n => !n.demo && n.date >= a && n.date <= b).length;
const qHasHab = () => secOn('habits') && hByKind('daily').some(h => !h.demo), qHasBio = () => secOn('habits') && (S.bio.metrics || []).length > 0;
const qHasGoal = () => S.goals.some(g => !g.done && !g.demo);
// [ключ, текст, есть ли такое задание у человека, (сегодня / понедельник, сегодня) → [сделано, нужно]]
const QUEST_D = [
  ['t3', 'Выполнить 3 задачи', () => secOn('tasks'), t => [qDone(t, t), 3]],
  ['tall', 'Закрыть все задачи на сегодня (от двух)', () => secOn('tasks'), t => { const l = S.events.filter(e => e.task && !e.demo && occurs(e, t)); return [l.filter(e => isDone(e, t)).length, Math.max(2, l.length)]; }],
  ['hall', 'Отметить все привычки дня', qHasHab, t => { const d = dayStat(t); return [d.done, Math.max(1, d.plan)]; }],
  ['fin', 'Записать трату или доход', () => secOn('fin'), t => [qFin(t) ? 1 : 0, 1]],
  ['bio', 'Отметить самочувствие', qHasBio, t => [qBio(t) ? 1 : 0, 1]],
  ['note', 'Записать мысль дня', () => true, t => [Math.min(1, qNotes(t, t)), 1]],
  ['plan', 'Запланировать дело на завтра', () => true, t => [Math.min(1, qOne(addDays(t, 1), addDays(t, 1))), 1]],
  ['goal', 'Сделать шаг к цели', qHasGoal, t => [Math.min(1, qSteps(t, t)), 1]],
];
const QUEST_W = [
  ['t15', 'Выполнить 15 задач', () => secOn('tasks'), (m, t) => [qDone(m, t), 15]],
  ['h5', '5 дней — все привычки', qHasHab, (m, t) => [qDays(m, t, qHab), 5]],
  ['f5', 'Записывать траты 5 дней', () => secOn('fin'), (m, t) => [qDays(m, t, qFin), 5]],
  ['b5', 'Отмечать самочувствие 5 дней', qHasBio, (m, t) => [qDays(m, t, qBio), 5]],
  ['g3', 'Сделать 3 шага к целям', qHasGoal, (m, t) => [qSteps(m, t), 3]],
  ['n3', 'Записать 3 мысли дня', () => true, (m, t) => [qNotes(m, t), 3]],
  ['pw', 'Запланировать 5 дел на следующую неделю', () => true, (m, t) => [qOne(addDays(m, 7), addDays(m, 13)), 5]],
];
const qHash = s => { let h = 2166136261; for (const c of s) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
// Три задания на день (неделю): полученные остаются на месте, остальные — по жребию дня и человека, только из того, чем он пользуется
function qPick(list, pre) {
  const got = list.filter(q => coinGot(pre + q[0])), seed = (signedIn() ? auth.uid : S.settings.dev) + pre;
  const rest = list.filter(q => !coinGot(pre + q[0]) && q[2]()).sort((a, b) => qHash(seed + a[0]) - qHash(seed + b[0]));
  return [...got, ...rest].slice(0, Q_MAX).sort((a, b) => list.indexOf(a) - list.indexOf(b));
}
function questsNow() {
  const t = todayK(), m = frMonday(t), dp = 'd:' + t + ':', wp = 'w:' + m + ':';
  const row = (q, pre, a, st) => { const [have, need] = st, got = coinGot(pre + q[0]); return { k: pre + q[0], t: q[1], a, have: got ? need : Math.min(have, need), need, ok: got || have >= need, got }; };   // полученное — полной полоской, даже если запись потом удалили
  return { d: qPick(QUEST_D, dp).map(q => row(q, dp, Q_D, q[3](t))), w: qPick(QUEST_W, wp).map(q => row(q, wp, Q_W, q[3](m, t))) };
}
// Награды, которые можно забрать: достижения, серия, друзья
function coinRewards() {
  const s = profileStats(), out = [];
  achState(s).forEach(a => { if (a.ok && ACH_COINS[a.id] && !coinGot('a:' + a.id)) out.push({ k: 'a:' + a.id, e: a.e, t: `Достижение «${a.n}»`, a: ACH_COINS[a.id] }); });
  ST_MILES.forEach(([n, a]) => { if (s.best >= n && !coinGot('s:' + n)) out.push({ k: 's:' + n, e: '🔥', t: `Серия ${plural(n, NDAY)} подряд`, a }); });
  const inv = coins ? coins.keys.filter(k => k.startsWith('i:')).length : 0;
  fr.list.filter(f => f.state === 'ok' && f.uid && !coinGot('i:' + f.uid)).slice(0, Math.max(0, INV_MAX - inv))
    .forEach(f => out.push({ k: 'i:' + f.uid, e: '🤝', t: `Друг в ${APP_NAME}: ${frName(f)}`, a: INV_COINS }));
  return out;
}
// Сколько можно забрать прямо сейчас (точка на аватаре, число в меню); пересчёт — только после изменений
function coinsReady() {
  if (!coins || !coinsOn()) return [];
  if (cnDirty) { const q = questsNow(); cnReady = [...q.d, ...q.w].filter(x => x.ok && !x.got).concat(coinRewards()); cnDirty = false; }
  return cnReady;
}
const coinDot = () => coinsReady().length ? '<i class="fr-dot cn-dot" aria-hidden="true"></i>' : '';

// ---- Запросы ----
const CN_ERR = { already: 'Уже получено', limit: 'На сегодня задания закончились — новые завтра', late: 'Время этого задания вышло', friend: 'Это не ваш друг',
  new: 'Друг ещё не начал пользоваться приложением — заберите позже', money: `Не хватает ${COIN}`, own: 'Уже есть', max: `Больше ${FRZ_MAX} заморозок не хранится`, key: 'Не получилось', item: 'Не получилось' };
async function coinClaim(k, quiet) {
  const r = await cnRpc('coins_claim', { p_key: k });
  if (r && r.ok) { coins.bal = r.bal; coins.keys.push(k); cnDirty = true; lsSet(CN_LS, coins); if (!quiet) toast(`+${r.amt} ${COIN}`); return r.amt; }
  if (!quiet) toast(CN_ERR[r && r.err] || 'Не получилось');
  if (r && r.err === 'already') coins.keys.push(k);
  return 0;
}
async function coinPick(it, quiet) {
  try {
    const r = await cnRpc('coins_pick', { p_item: it });
    if (r && r.ok) { coins.items[it] = 1; coins.free++; lsSet(CN_LS, coins); return true; }
    if (!quiet) toast(r && r.err === 'limit' ? 'Бесплатные палитры уже выбраны' : CN_ERR[r && r.err] || 'Не получилось');
  } catch (e) { if (!quiet) toast('Нет связи — попробуйте ещё раз'); }
  return false;
}
const cnRun = async f => { if (cnBusy) return; cnBusy = true; try { await f(); } catch (e) { toast(e && e.status === 0 ? 'Нет связи — попробуйте ещё раз' : 'Не получилось — попробуйте ещё раз'); } finally { cnBusy = false; } };

// ---- Действия ----
ACT.shopopen = el => { if (typeof closeQuick === 'function') closeQuick(); if (el && el.dataset.tab) cnTab = el.dataset.tab; setSec('shop'); coinsLoad(); };
ACT.cntab = el => { cnTab = el.dataset.t === 'shop' ? 'shop' : 'tasks'; render(); };
ACT.cnclaim = el => cnRun(async () => { const bal = coins.bal, amt = await coinClaim(el.dataset.k), ms = amt ? coinFly(el, 5) : 0;
  if (ms) { coins.bal = bal; render(); coins.bal = bal + amt; setTimeout(() => { render(); coinBump(); }, ms); } else render();   // число — когда долетят
  coinsLoad(); });
ACT.cnall = el => cnRun(async () => {
  const bal = coins.bal; let sum = 0; for (const x of coinsReady().slice()) sum += await coinClaim(x.k, true);
  toast(sum ? `+${sum} ${COIN}` : 'Не получилось — попробуйте позже');
  const ms = sum ? coinFly(el, 8) : 0;
  if (ms) { coins.bal = bal; render(); coins.bal = bal + sum; setTimeout(() => { render(); coinBump(); }, ms); } else render();
  coinsLoad();
});
ACT.cnitem = el => openShopItem(el.dataset.it);
// Включить своё: палитру, обложку, рамку
function coinUse(it) {
  const k = it.split(':')[1];
  if (it.startsWith('pal:')) { S.settings.pal = k; save(); render(); }
  else if (it.startsWith('cv:')) { S.settings.cover = { p: k, img: '' }; profTouch(); render(); }
  else if (it.startsWith('fm:')) { if (S.settings.frame === k) delete S.settings.frame; else S.settings.frame = k; profTouch(); render(); }
}
ACT.cnuse = el => { coinUse(el.dataset.it); closeSheet(); };
ACT.cnbuy = el => cnRun(async () => {
  const it = el.dataset.it, r = await cnRpc('coins_buy', { p_item: it });
  if (!r || !r.ok) return toast(CN_ERR[r && r.err] || 'Не получилось');
  coins.bal = r.bal; coins.items[it] = (coins.items[it] || 0) + 1; lsSet(CN_LS, coins); closeSheet();
  if (it !== 'frz') coinUse(it); else render();
  toast(it === 'frz' ? 'Заморозка куплена — сработает сама, если пропустите день' : `${itemName(it)} — ваша и уже включена`); coinsLoad();
});
ACT.cnpick = el => cnRun(async () => { const it = el.dataset.it; if (await coinPick(it)) { closeSheet(); coinUse(it); toast(`${itemName(it)} — ваша бесплатно`); coinsLoad(); } });

// ---- Предпросмотр палитры («можешь сделать предпросмотр тем, чтобы людям было понятнее», 31 октября 2026): в окне палитры — кусочек экрана в её цветах,
// светлая, тёмная и чёрная тема. Примерку на всё приложение пробовали и убрали («просто покажи как оно выглядит») — код в коммите 12d849c
const PV_MODE = [['l', 'Светлая'], ['d', 'Тёмная'], ['b', 'Чёрная']];
const palCSS = (k, m) => { const v = lookVars(k, m !== 'l', m === 'b'); return Object.keys(v).map(x => `${x}:${v[x]}`).join(';'); };
ACT.cnpvt = el => { $('.cn-pv-app').style.cssText = palCSS(el.dataset.k, el.dataset.m); $$('.cn-pt button').forEach(b => { b.classList.toggle('on', b === el); b.setAttribute('aria-pressed', b === el); }); };

// ---- Окно вещи ----
function openShopItem(it) {
  const k = it.split(':')[1], price = coinPrice(it), own = it === 'frz' ? false : coinOwn(it), bal = coins ? coins.bal : 0, pm = S.settings.theme === 'black' ? 'b' : darkNow() ? 'd' : 'l';
  if (!price) return;
  const pv = it === 'frz' ? '<div class="cn-pv cn-pv-frz" aria-hidden="true">❄️</div>'
    : it.startsWith('pal:') ? `<div class="seg2 cn-pt" role="group" aria-label="Как показать">${PV_MODE.map(([v, n]) => `<button class="${v === pm ? 'on' : ''}" aria-pressed="${v === pm}" data-act="cnpvt" data-k="${k}" data-m="${v}">${n}</button>`).join('')}</div><div class="lk-prev cn-pv-app" style="${palCSS(k, pm)}" aria-hidden="true">${lookDemo()}</div>`
    : it.startsWith('cv:') ? `<div class="cn-pv cn-pv-cv" style="background-image:${COVER_GLOW},${COVERS[k]}"></div>`
    : `<div class="cn-pv cn-pv-fm">${avatarHTML(88, k)}</div>`;
  const desc = it === 'frz' ? `Пропустили день — серия привычек не сгорает: заморозка тратится сама. Про запас — до ${FRZ_MAX}, у вас ${coins ? coins.items.frz || 0 : 0}.`
    : it.startsWith('pal:') ? 'Цвета всего приложения: фон, карточки, кнопки. Индиго и ещё 3 палитры на выбор — бесплатно.'
    : it.startsWith('cv:') ? 'Обложка вашего профиля — её видят и друзья.' : 'Рамка вокруг аватара — в шапке, профиле и у друзей.';
  const buy = () => bal >= price ? `<button class="btn pri" data-act="cnbuy" data-it="${it}">Купить за ${coinI(16)} ${price}</button>`
    : `<button class="btn" disabled>Не хватает ${coinI(16)} ${price - bal}</button>`;
  let btns;
  if (!coins) btns = `<p class="set-note">${signedIn() ? 'Магазин сейчас недоступен — попробуйте позже.' : 'Магазин работает, когда вы вошли в аккаунт.'}</p>`;
  else if (it === 'frz') btns = (coins.items.frz || 0) >= FRZ_MAX ? '<p class="set-note">Про запас — уже максимум.</p>' : buy();
  else if (own) btns = it.startsWith('fm:') && S.settings.frame === k ? `<button class="btn" data-act="cnuse" data-it="${it}">Снять рамку</button>`
    : (it.startsWith('pal:') && S.settings.pal === k) || (it.startsWith('cv:') && (S.settings.cover || {}).p === k && !okImg((S.settings.cover || {}).img)) ? `<p class="cn-on">${I(IC.check, 16)} Включена</p>`
    : `<button class="btn pri" data-act="cnuse" data-it="${it}">${it.startsWith('fm:') ? 'Надеть' : 'Включить'}</button>`;
  else if (it.startsWith('pal:') && coins.free < PAL_FREE) btns = `<button class="btn pri" data-act="cnpick" data-it="${it}">Взять бесплатно</button>${buy().replace(' pri', '')}
    <p class="set-note">Бесплатно — ещё ${coins.free ? PAL_FREE - coins.free + ' из ' + PAL_FREE : PAL_FREE + ' палитры'} на выбор. Выбор не отменить.</p>`;
  else btns = buy();
  sheet(`<div class="sh-head"><h3>${esc(itemName(it))}</h3><button class="ic" data-act="close" aria-label="Закрыть">${I(IC.x, 18)}</button></div>
    ${pv}<p class="cn-desc">${desc}</p><div class="cn-bal-s">У вас ${coinI(16)} <b>${NF0.format(bal)}</b></div><div class="cn-btns">${btns}</div>`);
}

// ---- Страница ----
SEC.shop = { name: COIN, icon: IC.coin, noNav: true, title: () => COIN, html: () => shopHTML(), move: () => {} };
const cnRow = x => `<div class="cn-q${x.got ? ' got' : x.ok ? ' ok' : ''}"><span class="cn-q-t"><b>${esc(x.t)}</b>
  <span class="cn-q-p"><span class="ds-bar"><i style="width:${Math.round(x.have / x.need * 100)}%"></i></span><small>${x.have} / ${x.need}</small></span></span>
  ${x.got ? `<span class="cn-q-got">${I(IC.check, 15)} Получено</span>` : x.ok ? `<button class="btn pri sm" data-act="cnclaim" data-k="${esc(x.k)}">Забрать +${x.a}</button>` : `<span class="cn-q-a">${coinI(15)} ${x.a}</span>`}</div>`;
const cnLogName = k => {
  const p = k.split(':'), q = (l, id) => (l.find(x => x[0] === id) || [])[1] || '', a = ACH.find(x => x[5] === p[1]), f = p[0] === 'i' && fr.list.find(x => x.uid === p[1]);
  return p[0] === 'd' ? 'Задание дня: ' + q(QUEST_D, p[2]) : p[0] === 'w' ? 'Задание недели: ' + q(QUEST_W, p[2]) : p[0] === 'a' ? `Достижение «${a ? a[1] : p[1]}»`
    : p[0] === 's' ? `Серия ${plural(+p[1] || 0, NDAY)} подряд` : p[0] === 'i' ? 'Друг в ' + APP_NAME + (f ? ': ' + frName(f) : '') : p[0] === 'z' ? 'Заморозка серии: ' + fmtLong(p[1])
    : p[0] === 'p' ? itemName(p.slice(1).join(':')) + ' — бесплатно' : p[0] === 'b' ? itemName(p.slice(1, -1).join(':')) : p[0] === 'adm' ? 'От ' + APP_NAME : k;
};
function shopTasksHTML() {
  const q = questsNow(), rw = coinRewards(), ready = coinsReady().length, s = profileStats();
  const nextSt = ST_MILES.find(([n]) => s.best < n), left = ACH.filter(a => !coinGot('a:' + a[5])).length - rw.filter(x => x.k.startsWith('a:')).length;
  const log = coins.log.map(x => `<li><span>${esc(cnLogName(x.k))}${x.n ? `<small>${esc(x.n)}</small>` : ''}</span><b class="${x.a > 0 ? 'pl' : x.a < 0 ? 'mn' : ''}">${x.a > 0 ? '+' + x.a : x.a < 0 ? '−' + -x.a : ''}</b>
    <time>${esc(new Date(x.t).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' }))}</time></li>`).join('');
  return `${ready > 1 ? `<button class="btn pri cn-all" data-act="cnall">Забрать всё · ${ready}</button>` : ''}
    <div class="card"><div class="card-h"><b>Задания дня</b><small>по ${Q_D} · новые в полночь</small></div>${q.d.map(cnRow).join('') || '<p class="hm-empty">Сегодня заданий нет.</p>'}</div>
    <div class="card"><div class="card-h"><b>Задания недели</b><small>по ${Q_W} · новые в понедельник</small></div>${q.w.map(cnRow).join('') || '<p class="hm-empty">Заданий нет.</p>'}</div>
    <div class="card"><div class="card-h"><b>Награды</b>${hintK('coins')}</div>
      ${rw.map(x => `<div class="cn-q ok"><span class="cn-q-e" aria-hidden="true">${x.e}</span><span class="cn-q-t"><b>${esc(x.t)}</b></span><button class="btn pri sm" data-act="cnclaim" data-k="${esc(x.k)}">Забрать +${x.a}</button></div>`).join('')}
      <p class="cn-next">${nextSt ? `<span aria-hidden="true">🔥</span> Серия ${plural(nextSt[0], NDAY)} подряд — +${nextSt[1]} <small>(сейчас лучшая — ${plural(s.best, NDAY)})</small><br>` : ''}
        ${left > 0 ? `${I(IC.trophy, 15)} Ещё ${plural(left, ['достижение', 'достижения', 'достижений'])} — от 10 до 100 <button class="lnk" data-act="achall">Какие</button><br>` : ''}
        ${I(IC.users, 15)} За друга в ${APP_NAME} — +${INV_COINS} вам и другу <button class="lnk" data-act="accinv">Пригласить</button></p></div>
    ${log ? foldHTML('cn-log', 'История', '', () => `<ul class="cn-log">${log}</ul>`, false) : ''}`;
}
function shopItemsHTML() {
  const tile = (it, pv, name) => { const own = coinOwn(it), on = it.startsWith('pal:') ? S.settings.pal === it.slice(4) : it.startsWith('fm:') ? S.settings.frame === it.slice(3) : it.startsWith('cv:') && (S.settings.cover || {}).p === it.slice(3) && !okImg((S.settings.cover || {}).img);
    return `<button class="cn-it${on ? ' on' : ''}" data-act="cnitem" data-it="${it}">${pv}<b>${esc(name)}</b><small>${on ? 'Включена' : own ? 'Ваша' : it.startsWith('pal:') && coins.free < PAL_FREE ? 'Бесплатно' : `${coinI(13)} ${coinPrice(it)}`}</small></button>`; };
  const free = PAL_FREE - coins.free, frz = coins.items.frz || 0;
  return `<div class="card"><div class="card-h"><b>Палитры</b><small>${free > 0 ? `бесплатно — ещё ${free} на выбор` : 'Индиго и 3 бесплатных — уже ваши'}</small></div>
      <div class="cn-grid">${tile('pal:indigo', palPv('indigo'), PAL.indigo.n)}${PAL_SHOP.map(k => tile('pal:' + k, palPv(k), PAL[k].n)).join('')}</div>
      <p class="set-note">Скоро — новые палитры, которых ещё нет.</p></div>
    <div class="card"><div class="card-h"><b>Рамки аватара</b></div><div class="cn-grid">${Object.keys(FRAMES).map(k => tile('fm:' + k, avatarHTML(48, k), FRAMES[k].n)).join('')}</div></div>
    <div class="card"><div class="card-h"><b>Обложки профиля</b></div><div class="cn-grid cn-cvs">${Object.keys(COVER_SHOP).map(k => tile('cv:' + k, `<span class="cn-cv" style="background-image:${COVER_GLOW},${COVERS[k]}"></span>`, COVER_SHOP[k])).join('')}</div></div>
    <div class="card"><div class="card-h"><b>Заморозка серии</b>${hintK('frz')}</div>
      <div class="cn-frz"><span class="cn-frz-e" aria-hidden="true">❄️</span><span><b>У вас ${frz} из ${FRZ_MAX}</b><small>Пропустили день — серия привычек не сгорает. Тратится сама.</small></span>
      ${frz < FRZ_MAX ? `<button class="btn${coins.bal >= FRZ_PRICE ? ' pri' : ''}" data-act="cnitem" data-it="frz">${coinI(15)} ${FRZ_PRICE}</button>` : ''}</div></div>`;
}
function shopHTML() {
  if (!coins) return `<div class="cn-page"><div class="card cn-empty">${coinI(48)}<h3>${COIN}</h3><p>${!signedIn() ? 'Задания и магазин работают, когда вы вошли в аккаунт: монеты хранятся на сервере.'
    : coinsErr === 'off' ? 'Магазин скоро откроется.' : 'Загружаю… Если долго — проверьте интернет.'}</p>${!signedIn() ? '<button class="btn pri" data-act="accin">Войти</button>' : ''}</div></div>`;
  return `<div class="cn-page"><div class="card cn-top"><div class="cn-bal">${coinI(40)}<span><b>${NF0.format(coins.bal)}</b><small>${COIN}</small></span></div>
      <p>Выполняйте задания и получайте награды — открывайте палитры, рамки и обложки.</p>
      <div class="seg2 cn-tabs" role="group" aria-label="Раздел"><button class="${cnTab === 'tasks' ? 'on' : ''}" aria-pressed="${cnTab === 'tasks'}" data-act="cntab" data-t="tasks">Задания${coinsReady().length ? ` · ${coinsReady().length}` : ''}</button><button class="${cnTab === 'shop' ? 'on' : ''}" aria-pressed="${cnTab === 'shop'}" data-act="cntab" data-t="shop">Магазин</button></div></div>
    ${cnTab === 'shop' ? shopItemsHTML() : shopTasksHTML()}</div>`;
}
