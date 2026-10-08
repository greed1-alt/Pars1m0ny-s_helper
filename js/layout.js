// ---- Расположение (6 октября 2026): какие разделы нужны и в каком порядке, что и как показывать на Главной ----
// Просьба пользователя: «самому выставлять, что идёт сначала, что нужно, а что не очень».
// Разделы: S.settings.secs = [{ k, on }] — порядок вкладок внизу телефона и пунктов боковой панели ПК; Главная всегда первая.
//   Выключенный раздел прячется из навигации, его блоки — с Главной, его виды записей — из строки ввода. Данные не удаляются.
// Главная: S.settings.home = [{ k, m }] — порядок блоков; m: 'card' — открыт, 'fold' — свёрнут (открывается нажатием), 'off' — скрыт.
// Окна настройки: openSecs() и openBlocks(страница) — из Настроек → «Расположение» и кнопкой внизу Главной и страниц.
const SEC_OPT = ['cal', 'tasks', 'habits', 'fin', 'timer'];
const SEC_DESC = { cal:'месяц, неделя, день, список', tasks:'дела, сроки, цели', habits:'трекер, самочувствие, заметки', fin:'траты, бюджет, накопления', timer:'помодоро, таймер, секундомер' };
// need — блок показывается, если включён хотя бы один из этих разделов
const HOME_BL = {
  plan:{ n:'План на сегодня', ic:IC.list, need:['tasks', 'cal'] },
  habits:{ n:'Привычки', ic:IC.habit, need:['habits'] },
  money:{ n:'Деньги', ic:IC.wallet, need:['fin'] },
  goals:{ n:'Цели', ic:IC.goal, need:['tasks'] },
  bio:{ n:'Самочувствие', ic:IC.spark },
  notes:{ n:'Мысли дня', ic:IC.note },
};
const HOME_M = [['card', 'Открыт'], ['fold', 'Свёрнут'], ['off', 'Скрыт']];
const HOME_DEF = () => [{ k:'plan', m:'card' }, { k:'habits', m:'card' }, { k:'money', m:'card' }, { k:'bio', m:'fold' }, { k:'goals', m:'fold' }, { k:'notes', m:'fold' }];
onMigrate(() => {
  const st = S.settings;
  // Таймер — проба, по умолчанию выключен (включается здесь же)
  if (!Array.isArray(st.secs)) st.secs = SEC_OPT.map(k => ({ k, on: k !== 'timer' }));
  st.secs = st.secs.filter((x, i, a) => x && SEC_OPT.includes(x.k) && a.findIndex(y => y && y.k === x.k) === i).map(x => ({ k:x.k, on: x.on !== false }));
  SEC_OPT.forEach(k => { if (!st.secs.some(x => x.k === k)) st.secs.push({ k, on: k !== 'timer' }); });
  // Прежний ответ знакомства «что для вас главное» (st.areas): выбранное — открытыми карточками, остальное — свёрнутым
  if (!Array.isArray(st.home)) {
    const A = Array.isArray(st.areas) && st.areas.length ? st.areas : ['tasks', 'cal', 'habits', 'fin'];
    const m = [['plan', A.includes('tasks') || A.includes('cal')], ['habits', A.includes('habits')], ['money', A.includes('fin')]];
    st.home = [...m.filter(x => x[1]).map(x => ({ k:x[0], m:'card' })), ...m.filter(x => !x[1]).map(x => ({ k:x[0], m:'fold' })), { k:'bio', m:'fold' }, { k:'goals', m:'fold' }, { k:'notes', m:'fold' }];
  }
  st.home = st.home.filter((x, i, a) => x && HOME_BL[x.k] && a.findIndex(y => y && y.k === x.k) === i).map(x => ({ k:x.k, m: ['card', 'fold', 'off'].includes(x.m) ? x.m : 'fold' }));
  Object.keys(HOME_BL).forEach(k => { if (!st.home.some(x => x.k === k)) st.home.push({ k, m:'fold' }); });
  delete st.areas;
});
const secOn = k => !SEC_OPT.includes(k) || (S.settings.secs.find(x => x.k === k) || {}).on !== false;
const navSecs = () => ['home', ...S.settings.secs.filter(x => x.on && SEC[x.k]).map(x => x.k)];
const blockOn = k => { const n = HOME_BL[k].need; return !n || n.some(secOn); };
const homeOrder = () => S.settings.home.filter(x => x.m !== 'off' && blockOn(x.k));
// Последний открытый раздел выключили — при запуске открываем Главную
if (!navSecs().includes(sec) && !['profile', 'profedit', 'settings'].includes(sec)) sec = 'home';

const moveIn = (arr, k, d) => { const i = arr.findIndex(x => x.k === k), j = i + d; if (i < 0 || j < 0 || j >= arr.length) return false; [arr[i], arr[j]] = [arr[j], arr[i]]; return true; };
const mvBtns = (act, k, i, n, name, p) => { const pa = p ? ` data-p="${p}"` : ''; return `<span class="lo-mv"><button class="ic" data-act="${act}" data-k="${k}"${pa} data-d="-1" aria-label="${esc(name)} — выше"${i === 0 ? ' disabled' : ''}>${I(IC.cup, 18)}</button><button class="ic" data-act="${act}" data-k="${k}"${pa} data-d="1" aria-label="${esc(name)} — ниже"${i === n - 1 ? ' disabled' : ''}>${I(IC.cdown, 18)}</button></span>`; };
const loHead = (title, note) => `<div class="sh-head"><h3>${title}</h3><button class="ic" data-act="close" aria-label="Закрыть">${I(IC.x, 18)}</button></div><p class="set-note lo-note">${note}</p>`;

// ---- Окно «Разделы»: включить / выключить и порядок ----
function openSecs(keep) {
  const L = S.settings.secs;
  sheet(`${loHead('Разделы', 'Включите нужные разделы и расставьте их по порядку — так они встанут во вкладках внизу экрана (на компьютере — в панели слева). Выключенный раздел просто прячется: записи в нём сохраняются.')}
  <div class="lo-list">
    <div class="lo-row fixed"><span class="lo-ic">${I(IC.home, 18)}</span><span class="lo-t"><b>Главная</b><small>всегда первая</small></span></div>
    ${L.map((x, i) => `<div class="lo-row${x.on ? '' : ' off'}"><span class="lo-ic">${I(SEC[x.k].icon, 18)}</span><span class="lo-t"><b>${SEC[x.k].name}${SEC[x.k].beta ? ' <em class="beta">β</em>' : ''}</b><small>${SEC_DESC[x.k]}</small></span>${mvBtns('secmv', x.k, i, L.length, SEC[x.k].name)}<input class="sw" type="checkbox" data-secon="${x.k}"${x.on ? ' checked' : ''} aria-label="Показывать раздел «${SEC[x.k].name}»"></div>`).join('')}
  </div>
  <button class="btn pri" style="width:100%;margin-top:14px" data-act="close">Готово</button>`, keep);
}
ACT.secscust = () => openSecs();
ACT.secmv = el => { if (moveIn(S.settings.secs, el.dataset.k, +el.dataset.d)) { save(); render(); } openSecs(true); };
document.addEventListener('change', e => {
  const k = e.target.dataset && e.target.dataset.secon; if (!k) return;
  const x = S.settings.secs.find(s => s.k === k); if (!x) return;
  x.on = e.target.checked; save(); render(); openSecs(true);
  toast(x.on ? `Раздел «${SEC[k].name}» включён` : `Раздел «${SEC[k].name}» скрыт — записи в нём сохранены`);
});

// ---- Блоки страниц: Главная (S.settings.home) и «Задачи», «Привычки», «Финансы» (S.settings.lay[страница]) ----
// Просьба пользователя (6 октября 2026): «перемещать блоки в каждом разделе — например, сверху Самочувствие, потом Таблица месяца».
// fixed — главный блок страницы: только порядок, без «свернуть / скрыть». own — блок сам рисует карточку с заголовком.
const PAGE_BL = {
  tasks:{ list:{ n:'Список задач и строка ввода', ic:IC.tasks, fixed:true }, board:{ n:'Доска недели', ic:IC.cal }, stats:{ n:'Статистика', ic:IC.spark } },
  habits:{ today:{ n:'Сегодня', ic:IC.check }, grid:{ n:'Таблица месяца', ic:IC.habit }, prog:{ n:'Прогресс и сравнение', ic:IC.trophy }, per:{ n:'Раз в неделю и раз в месяц', ic:IC.cal }, bio:{ n:'Самочувствие', ic:IC.spark }, notes:{ n:'Заметки', ic:IC.note } },
  fin:{ main:{ n:'Запись, итоги и последние записи', ic:IC.wallet, fixed:true }, charts:{ n:'Графики', ic:IC.spark }, cats:{ n:'Категории и бюджет', ic:IC.wallet }, top:{ n:'Топ покупок', ic:IC.trophy }, hist:{ n:'Вся история', ic:IC.list } },
};
const PAGE_DEF = { tasks:[['list', 'card'], ['board', 'fold'], ['stats', 'fold']], habits:[['today', 'card'], ['grid', 'fold'], ['prog', 'fold'], ['per', 'fold'], ['bio', 'fold'], ['notes', 'fold']],
  fin:[['main', 'card'], ['charts', 'fold'], ['cats', 'fold'], ['top', 'fold'], ['hist', 'fold']] };
const layDef = p => p === 'home' ? HOME_DEF() : PAGE_DEF[p].map(([k, m]) => ({ k, m }));
onMigrate(() => {
  const st = S.settings; if (!st.lay || typeof st.lay !== 'object' || Array.isArray(st.lay)) st.lay = {};
  Object.keys(PAGE_BL).forEach(p => {
    const B = PAGE_BL[p]; let L = Array.isArray(st.lay[p]) ? st.lay[p] : layDef(p);
    L = L.filter((x, i, a) => x && B[x.k] && a.findIndex(y => y && y.k === x.k) === i).map(x => ({ k:x.k, m: B[x.k].fixed ? 'card' : ['card', 'fold', 'off'].includes(x.m) ? x.m : 'fold' }));
    layDef(p).forEach(d => { if (!L.some(x => x.k === d.k)) L.push(d); });
    st.lay[p] = L;
  });
});
const BL = p => p === 'home' ? HOME_BL : PAGE_BL[p];
const layOf = p => p === 'home' ? S.settings.home : S.settings.lay[p];
const setLay = (p, L) => { if (p === 'home') S.settings.home = L; else S.settings.lay[p] = L; };
const pageCust = p => `<div class="h2-cust pg-cust"><button class="lnk" data-act="blkcust" data-p="${p}">${I(IC.grid, 15)} Настроить страницу</button><button class="lnk" data-act="feedback">${I(IC.msg, 15)} Отзыв</button></div>`;
// Блоки страницы в порядке пользователя. defs[k] = { sum, body(), foldBody() (если свёрнутым нужен другой вид), def — открыт ли свёрнутый по умолчанию, fk — ключ открытости, own, skip — нечего показать }
function pageBlocks(p, defs) {
  return layOf(p).filter(x => x.m !== 'off').map(x => { const d = defs[x.k], b = PAGE_BL[p][x.k]; if (!d || d.skip) return '';
    if (x.m === 'fold' && !b.fixed) return foldHTML(d.fk, b.n, d.sum, d.foldBody || d.body, d.def || false, { ic:b.ic });
    if (b.fixed || d.own) return d.body();
    return `<section class="fold open fixed"><div class="fold-h">${I(b.ic, 18)}<span class="fold-tt"><b>${b.n}</b>${d.sum ? `<small>${d.sum}</small>` : ''}</span></div><div class="fold-b">${d.body()}</div></section>`; }).join('') + pageCust(p);
}

// ---- Окно «Блоки страницы»: что показывать и в каком порядке ----
const needTxt = n => n.length > 1 ? `разделы ${n.map(k => `«${SEC[k].name}»`).join(' и ')} выключены` : `раздел «${SEC[n[0]].name}» выключен`;
function openBlocks(p, keep) {
  const L = layOf(p), B = BL(p), home = p === 'home';
  sheet(`${loHead(home ? 'Главная' : SEC[p].name, '«Открыт» — блок виден целиком, «Свёрнут» — одна строка, открывается нажатием, «Скрыт» — блока нет. Стрелками меняйте порядок.' + (home ? ' Приветствие и строка ввода всегда сверху.' : ''))}
  <div class="lo-list">${L.map((x, i) => { const b = B[x.k], ok = !home || blockOn(x.k);
    return `<div class="lo-row lo-blk${ok ? '' : ' off'}${x.m === 'off' ? ' hid' : ''}">
      <div class="lo-top"><span class="lo-ic">${I(b.ic, 18)}</span><span class="lo-t"><b>${b.n}</b>${!ok ? `<small>${needTxt(b.need)}</small>` : b.fixed ? '<small>всегда открыт, можно только переставить</small>' : ''}</span>${mvBtns('blkmv', x.k, i, L.length, b.n, p)}</div>
      ${b.fixed ? '' : `<div class="seg2 lo-seg" role="group" aria-label="${b.n}">${HOME_M.map(([m, n]) => `<button class="${x.m === m ? 'on' : ''}" data-act="blkm" data-p="${p}" data-k="${x.k}" data-m="${m}" aria-pressed="${x.m === m}"${ok ? '' : ' disabled'}>${n}</button>`).join('')}</div>`}</div>`; }).join('')}</div>
  <div class="lo-foot"><button class="btn" data-act="blkreset" data-p="${p}">Как по умолчанию</button><button class="btn pri grow" data-act="close">Готово</button></div>`, keep);
}
const okPage = p => p === 'home' || !!PAGE_BL[p];
ACT.blkcust = el => { const p = el.dataset.p || 'home'; if (okPage(p)) openBlocks(p); };
ACT.homecust = () => openBlocks('home');
ACT.blkmv = el => { const p = el.dataset.p; if (!okPage(p)) return; if (moveIn(layOf(p), el.dataset.k, +el.dataset.d)) { save(); render(); } openBlocks(p, true); };
ACT.blkm = el => { const p = el.dataset.p; if (!okPage(p)) return; const x = layOf(p).find(b => b.k === el.dataset.k); if (!x || !HOME_M.some(m => m[0] === el.dataset.m)) return; x.m = el.dataset.m; save(); render(); openBlocks(p, true); };
ACT.blkreset = el => { const p = el.dataset.p; if (!okPage(p)) return; setLay(p, layDef(p)); save(); render(); openBlocks(p, true); toast('Порядок блоков — как по умолчанию'); };

// Строки в Настройках → «Расположение»
function layoutSetHTML() {
  const on = navSecs().slice(1);
  const top = p => { const B = BL(p), v = layOf(p).filter(x => x.m !== 'off' && (p !== 'home' || blockOn(x.k))); return v.length ? 'сверху: ' + v.slice(0, 2).map(x => B[x.k].n).join(', ') : 'все блоки скрыты'; };
  const row = (p, ic, n) => `<button class="set-link" data-act="blkcust" data-p="${p}">${I(ic, 18)}<span><b>${n}</b><small>${esc(top(p))}</small></span>${I(IC.right, 18)}</button>`;
  return `<button class="set-link" data-act="secscust">${I(IC.grid, 18)}<span><b>Разделы и вкладки</b><small>${on.length ? on.map(k => SEC[k].name).join(', ') : 'только Главная'}</small></span>${I(IC.right, 18)}</button>
  <div class="set-sub">Порядок блоков на страницах</div>
  ${row('home', IC.home, 'Главная')}${['tasks', 'habits', 'fin'].filter(secOn).map(p => row(p, SEC[p].icon, SEC[p].name)).join('')}`;
}
