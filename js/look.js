// ---- Оформление (6 октября 2026): тема, палитра, контраст, вид карточек, углы, цвет событий ----
// Выбирает сам пользователь: Настройки → Оформление. Цвета палитр — здесь; applyLook() ставит их переменными CSS на <html>.
// «Классика» — прежние цвета из css/app.css. В CSS остались запасные значения и то, что от палитры не зависит (цвета графиков, тени окон).
// Ключи цвета: bg — фон «с рамкой», pg — фон страницы под карточками, bg2 — боковая панель, sf — карточки и окна,
// line — линии, tx/tx2/mut — текст основной/второй/приглушённый, acc/accfg — кнопки и выбранное, wm — надпись Parsimony.
const PAL = {
  indigo:{ n:'Индиго',
    l:{ bg:'#fbfbfe', pg:'#f2f3f9', bg2:'#eceef7', sf:'#ffffff', line:'#e1e4f0', tx:'#1a1c2b', tx2:'#4d536b', mut:'#80869e', acc:'#4b4fd1', accfg:'#ffffff', wm:'#5b5ee0' },
    d:{ bg:'#12131b', bg2:'#171824', sf:'#1d1f2d', line:'#2a2d40', tx:'#e7e8f3', tx2:'#adb1c9', mut:'#7a7f99', acc:'#9599ff', accfg:'#10123a', wm:'#9fa3ff' } },
  sage:{ n:'Шалфей',
    l:{ bg:'#fbfcf9', pg:'#f2f4ee', bg2:'#eaede4', sf:'#ffffff', line:'#dde2d5', tx:'#1c211b', tx2:'#4f584c', mut:'#80897c', acc:'#3b6e4c', accfg:'#ffffff', wm:'#4a8360' },
    d:{ bg:'#111511', bg2:'#161b16', sf:'#1c221c', line:'#29312a', tx:'#e4ebe3', tx2:'#a8b3a5', mut:'#768073', acc:'#8ccaa0', accfg:'#0b1d10', wm:'#95cfa8' } },
  ocean:{ n:'Океан',
    l:{ bg:'#fafcfd', pg:'#eff4f6', bg2:'#e7eff2', sf:'#ffffff', line:'#d8e4e9', tx:'#12232a', tx2:'#475b63', mut:'#7b8f96', acc:'#0a6d80', accfg:'#ffffff', wm:'#0e8196' },
    d:{ bg:'#0e1519', bg2:'#121c21', sf:'#182429', line:'#243439', tx:'#e1edf0', tx2:'#a0b4ba', mut:'#6c838a', acc:'#55c6d6', accfg:'#04222a', wm:'#63cddb' } },
  lavender:{ n:'Лаванда',
    l:{ bg:'#fcfbfe', pg:'#f5f2fa', bg2:'#eee9f6', sf:'#ffffff', line:'#e5deef', tx:'#221b2b', tx2:'#594e6d', mut:'#9085a2', acc:'#7546bd', accfg:'#ffffff', wm:'#8a5ad0' },
    d:{ bg:'#15121a', bg2:'#1b1722', sf:'#221d2b', line:'#31293d', tx:'#ece6f4', tx2:'#b8accb', mut:'#85799a', acc:'#b791f3', accfg:'#1e0f33', wm:'#c09cf6' } },
  coral:{ n:'Коралл',
    l:{ bg:'#fffcfa', pg:'#f9f3ef', bg2:'#f3eae4', sf:'#ffffff', line:'#ece0d8', tx:'#2a1d17', tx2:'#634f45', mut:'#998679', acc:'#b84a26', accfg:'#ffffff', wm:'#c2512b' },
    d:{ bg:'#17120f', bg2:'#1d1713', sf:'#251d18', line:'#362a23', tx:'#f2e8e2', tx2:'#c4b1a5', mut:'#8f7c70', acc:'#f2916b', accfg:'#2b1206', wm:'#f39c78' } },
  rose:{ n:'Роза',
    l:{ bg:'#fffbfc', pg:'#f9f2f4', bg2:'#f3e9ed', sf:'#ffffff', line:'#ecdce2', tx:'#2b1a20', tx2:'#654c56', mut:'#9b848d', acc:'#b03f65', accfg:'#ffffff', wm:'#c24f76' },
    d:{ bg:'#171114', bg2:'#1e161a', sf:'#261c21', line:'#382930', tx:'#f3e6eb', tx2:'#c6aeb8', mut:'#927a84', acc:'#f285a7', accfg:'#300b19', wm:'#f48fae' } },
  sand:{ n:'Песок',
    l:{ bg:'#fdfcf8', pg:'#f5f2e9', bg2:'#efeadd', sf:'#fffefb', line:'#e6dfcf', tx:'#24201a', tx2:'#5b5346', mut:'#928877', acc:'#8a5f17', accfg:'#ffffff', wm:'#a8742a' },
    d:{ bg:'#15130f', bg2:'#1b1813', sf:'#221f18', line:'#332e24', tx:'#f0ebe0', tx2:'#bfb5a3', mut:'#8b8170', acc:'#e5b366', accfg:'#2a1c05', wm:'#e8b970' } },
  classic:{ n:'Классика',
    l:{ bg:'#ffffff', pg:'#f5f5f3', bg2:'#f7f7f5', sf:'#ffffff', line:'#e9e9e7', grid:'#efefed', tx:'#1d1d1c', tx2:'#5f5e5b', mut:'#9b9a97', acc:'#2b2b2b', accfg:'#ffffff', wm:'#b4642c' },
    d:{ bg:'#191919', bg2:'#202020', sf:'#252525', line:'#2f2f2f', grid:'#292929', tx:'#ececec', tx2:'#b4b4b4', mut:'#7f7f7f', acc:'#e08a3c', accfg:'#1a0f02', wm:'#e8964a' } },
};
const PAL_ORDER = Object.keys(PAL);
// Чёрная тема: фон чисто чёрный, акцент — из палитры (у «Классики» — светло-серый, как раньше)
const BLACK = { bg:'#000000', pg:'#000000', bg2:'#0a0a0a', sf:'#141414', line:'#232323', grid:'#1b1b1b', tx:'#f2f2f2', tx2:'#b0b0b0', mut:'#767676' };
const LOOK_OPT = {
  contrast:[['soft', 'Мягкий'], ['normal', 'Обычный'], ['high', 'Высокий']],
  card:[['soft', 'Объёмные'], ['line', 'С рамкой'], ['flat', 'Плоские']],
  round:[['s', 'Меньше'], ['m', 'Обычные'], ['l', 'Круглее']],
  evc:[['pastel', 'Пастельные'], ['bright', 'Яркие']],
};
const LOOK_DEF = { pal:'indigo', contrast:'normal', card:'soft', round:'m', evc:'pastel' };
onMigrate(() => {
  const st = S.settings;
  if (!PAL[st.pal]) st.pal = LOOK_DEF.pal;
  for (const k in LOOK_OPT) if (!LOOK_OPT[k].some(o => o[0] === st[k])) st[k] = LOOK_DEF[k];
});

// Цвета: «#rrggbb» ↔ [r, g, b], смешивание (t — доля второго цвета), прозрачность
const hx = h => { h = String(h).replace('#', ''); if (h.length === 3) h = h.replace(/./g, '$&$&'); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
const toHex = a => '#' + a.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const mixC = (a, b, t) => { const A = hx(a), B = hx(b); return toHex(A.map((v, i) => v + (B[i] - v) * t)); };
const rgba = (h, a) => `rgba(${hx(h).join(',')},${a})`;

const darkMQ = matchMedia('(prefers-color-scheme: dark)');
const darkNow = () => { const t = S.settings.theme; return t === 'dark' || t === 'black' || (t === 'auto' && darkMQ.matches); };
// Цвета палитры для текущей темы (без контраста) — для превью в настройках
const palColors = (k, dark, black) => { const p = PAL[k] || PAL[LOOK_DEF.pal], c = Object.assign({}, dark ? p.d : p.l);
  if (black) Object.assign(c, BLACK, k === 'classic' ? { acc:'#e6e6e6', accfg:'#111111', wm:'#8f8f8f' } : {});
  if (!c.pg) c.pg = c.bg; return c; };

let lookKey = '';
function applyLook() {
  const st = S.settings, dark = darkNow(), black = st.theme === 'black';
  const key = [st.theme, dark, st.pal, st.contrast, st.card, st.round, st.evc].join();
  if (key === lookKey) return; lookKey = key;
  const root = document.documentElement, c = palColors(st.pal, dark, black);
  root.dataset.theme = st.theme; root.dataset.card = st.card;
  const page = st.card === 'line' ? c.bg : c.pg;
  let { tx, tx2, mut, line } = c;
  if (st.contrast === 'high') { tx = dark ? '#ffffff' : '#000000'; tx2 = mixC(tx2, tx, .5); mut = mixC(mut, tx, .4); line = mixC(line, tx, .2); }
  else if (st.contrast === 'soft') { tx = mixC(tx, page, .14); tx2 = mixC(tx2, page, .08); line = mixC(line, page, .35); }
  const card = st.card === 'line' ? page : c.sf;
  const cardbd = st.card === 'line' || st.contrast === 'high' ? line : 'transparent';
  const cardsh = st.card !== 'soft' ? 'none' : dark ? '0 1px 2px rgba(0,0,0,.35),0 0 0 1px rgba(255,255,255,.045)' : `0 1px 2px ${rgba(c.tx, .05)},0 6px 18px ${rgba(c.tx, .06)}`;
  const bright = st.evc === 'bright';
  const v = {
    '--bg':page, '--page':page, '--bg2':c.bg2, '--sf':c.sf, '--line':line, '--grid':c.grid && st.contrast === 'normal' ? c.grid : mixC(line, page, .4),
    '--tx':tx, '--tx2':tx2, '--mut':mut, '--acc':c.acc, '--accfg':c.accfg, '--wm':c.wm,
    '--hov': dark ? 'rgba(255,255,255,.055)' : rgba(c.tx, .055), '--hov2': dark ? 'rgba(255,255,255,.09)' : rgba(c.tx, .095), '--wk': dark ? 'rgba(255,255,255,.02)' : rgba(c.tx, .025),
    '--card':card, '--cardbd':cardbd, '--cardsh':cardsh, '--rc':{ s:'12px', m:'18px', l:'24px' }[st.round],
    '--mix': bright ? (dark ? '40%' : '30%') : (dark ? '26%' : '17%'), '--mixtx': bright ? (dark ? '32%' : '72%') : (dark ? '52%' : '62%'),
  };
  for (const k in v) root.style.setProperty(k, v[k]);
}
darkMQ.addEventListener('change', () => { if (S.settings.theme === 'auto') render(); });
applyLook();

// ---- Блок «Оформление» в Настройках ----
const THEME_N = [['auto', 'Авто'], ['light', 'Светлая'], ['dark', 'Тёмная'], ['black', 'Чёрная']];
function themePrev(t) {
  const L = palColors(S.settings.pal, false), D = palColors(S.settings.pal, true, t === 'black');
  const bg = t === 'auto' ? `linear-gradient(90deg,${L.pg} 50%,${D.bg} 50%)` : t === 'light' ? L.pg : D.bg, c = t === 'light' || t === 'auto' ? L : D;
  return `background:${bg};--pa:${t === 'auto' ? D.line : c.line};--pb:${c.acc}`;
}
const lookSeg = k => `<div class="seg2 lk-seg" role="group">${LOOK_OPT[k].map(([v, n]) => `<button class="${S.settings[k] === v ? 'on' : ''}" data-act="look" data-k="${k}" data-v="${v}" aria-pressed="${S.settings[k] === v}">${n}</button>`).join('')}</div>`;
const lookRow = (k, label) => `<div class="lk-row"><div class="lk-h">${label}${hintK(k)}</div>${lookSeg(k)}</div>`;
function lookHTML() {
  const st = S.settings, dark = darkNow(), black = st.theme === 'black';
  const sw = k => { const c = palColors(k, dark, black);
    return `<button class="pal${st.pal === k ? ' on' : ''}" data-act="look" data-k="pal" data-v="${k}" aria-pressed="${st.pal === k}"><span class="pal-pv" style="--p:${c.pg};--s:${c.sf};--a:${c.acc};--l:${c.line};--t:${c.tx2}"><i></i><b></b><em></em></span>${PAL[k].n}</button>`; };
  return `<div class="set-sec">Оформление</div>
  <div class="lk-row"><div class="lk-h">Тема${hintK('theme')}</div>
    <div class="thm">${THEME_N.map(([v, n]) => `<button class="${st.theme === v ? 'on' : ''}" data-act="theme" data-v="${v}" aria-pressed="${st.theme === v}"><span class="pv" style="${themePrev(v)}"></span>${n}</button>`).join('')}</div></div>
  <div class="lk-row"><div class="lk-h">Палитра${hintK('pal')}</div><div class="pals">${PAL_ORDER.map(sw).join('')}</div></div>
  ${lookRow('contrast', 'Контраст')}${lookRow('card', 'Карточки')}${lookRow('round', 'Углы')}${lookRow('evc', 'Цвет событий')}
  <div class="lk-row"><div class="lk-h">Как это выглядит</div>
    <div class="lk-prev" aria-hidden="true"><div class="lk-card">
      <div class="lk-ph"><b>План на сегодня</b><small>1 из 3</small></div>
      <div class="lk-it done"><span class="chk">${I(IC.check, 13)}</span><span class="lk-t">Зарядка</span></div>
      <div class="lk-it"><span class="chk"></span><span class="lk-t">Отчёт по проекту</span><span class="pbadge" style="--c:${PRIO.urgent.c}">${PRIO.urgent.n}</span></div>
      <div class="lk-ev" style="--c:${(S.cats[0] || { color:'#3b82f6' }).color}"><b>15:00</b> Встреча с командой</div>
      <div class="ds-bar"><i style="width:34%"></i></div>
      <div class="lk-btns"><span class="btn pri">Сохранить</span><span class="btn">Отмена</span></div></div></div></div>
  <button class="lnk lk-reset" data-act="lookreset">Вернуть оформление по умолчанию</button>`;
}
ACT.look = el => { const k = el.dataset.k, v = el.dataset.v; if (k === 'pal' ? !PAL[v] : !LOOK_OPT[k]) return; S.settings[k] = v; save(); render(); };
ACT.lookreset = () => { Object.assign(S.settings, LOOK_DEF); save(); render(); toast('Оформление — как по умолчанию'); };
