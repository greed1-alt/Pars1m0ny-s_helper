// ---- Разделы: Календарь, Задачи, Привычки, Финансы ----
// Каждый раздел регистрирует себя в SEC: name, icon, title(), html(), move(n), today(), create(), newLabel, info()
const SEC = {};
const SEC_ORDER = ['cal', 'tasks', 'habits', 'fin'];
let sec = SEC_ORDER.includes(S.settings.sec) ? S.settings.sec : 'cal';
SEC.cal = { name:'Календарь', icon:IC.cal, newLabel:'Создать' };

function setSec(s) {
  if (!SEC[s] || s === sec) return;
  sec = s; S.settings.sec = s; save();
  if (s === 'habits' || s === 'fin') miniAnchor = pd(secYM + '-01'); else syncMini();
  closeQuick(); if (sheetOpen()) closeSheet();
  window.scrollTo(0, 0);
  render(2);
}
ACT.sec = el => setSec(el.dataset.s);

// Месяц как строка «2026-10»
const ymOf = k => k.slice(0, 7);
const ymAdd = (ym, n) => { const [y, m] = ym.split('-').map(Number), d = new Date(y, m - 1 + n, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
const ymDays = ym => { const [y, m] = ym.split('-').map(Number), n = new Date(y, m, 0).getDate(); return [...Array(n)].map((_, i) => ym + '-' + String(i + 1).padStart(2, '0')); };
const ymTitle = ym => { const [y, m] = ym.split('-').map(Number); return MON[m - 1] + ' ' + y; };
// В шапке телефона мало места: текущий год не пишем
const ymHead = ym => innerWidth >= 900 || ym.slice(0, 4) !== todayK().slice(0, 4) ? ymTitle(ym) : MON[Number(ym.slice(5)) - 1];
const ymGen = ym => { const [y, m] = ym.split('-').map(Number); return MONG[m - 1]; };
let secYM = ymOf(todayK());   // месяц, открытый в «Привычках» и «Финансах»

// Навигация: боковая панель на ПК и вкладки внизу на телефоне
const navHTML = () => `<nav class="sb-nav">${SEC_ORDER.map(s => `<button class="sb-nv${s === sec ? ' on' : ''}" data-act="sec" data-s="${s}">${I(SEC[s].icon, 17)}${SEC[s].name}</button>`).join('')}</nav>`;
function tabbarRender() {
  const tb = $('#tabbar'); if (!tb) return;
  tb.innerHTML = SEC_ORDER.map(s => `<button class="tb-b${s === sec ? ' on' : ''}" data-act="sec" data-s="${s}" aria-label="${SEC[s].name}"${s === sec ? ' aria-current="page"' : ''}>${I(SEC[s].icon, 22)}<span>${SEC[s].name}</span></button>`).join('');
}

// ---- «Вы пропустили»: разовые дела прошлых дней без галочки ----
// Повторяющийся распорядок (работа, обед) сюда не попадает — иначе он был бы здесь каждый день.
const missedList = () => {
  const t = todayK(), from = addDays(t, -30);
  return S.events.filter(e => !isRec(e) && !e.done && e.date < t && e.date >= from)
    .sort((a, b) => b.date.localeCompare(a.date) || (a.time || '').localeCompare(b.time || ''));
};
function missedBar(full) {
  const l = missedList(); if (!l.length) return '';
  const names = l.slice(0, full ? 3 : 2).map(e => esc(e.title)).join(', ') + (l.length > (full ? 3 : 2) ? '…' : '');
  return `<button class="missbar" data-act="missopen">${I(IC.alert, 18)}<span><b>Вы пропустили: ${plural(l.length, ['дело', 'дела', 'дел'])}</b><small>${names}</small></span><em>Разобрать</em></button>`;
}
let missMove = null;   // у какого дела открыт выбор новой даты
function openMissed(keep) {
  const l = missedList();
  if (!l.length) { closeSheet(); render(); return toast('Пропущенных дел нет 👍'); }
  sheet(`<div class="sh-head"><h3>Вы пропустили</h3><button class="ic" data-act="close" aria-label="Закрыть">${I(IC.x, 18)}</button></div>
  <p class="set-note" style="margin:0 0 10px">Разовые дела за последние 30 дней, которые не отмечены выполненными. Перенесите их или отметьте.</p>
  <div class="mslist">${l.map(e => `<div class="msrow" style="--c:${cat(e.cat).color}">
    <div class="ms-top"><i></i><div class="ms-t"><b>${esc(e.title)}</b><small>${esc(relDay(e.date))}${e.time ? ', ' + esc(e.time) : ''} · ${esc(cat(e.cat).name)}</small></div></div>
    <div class="ms-btns">${missMove === e.id
      ? `<button class="btn" data-act="missto" data-id="${e.id}" data-d="${todayK()}">Сегодня</button><button class="btn" data-act="missto" data-id="${e.id}" data-d="${addDays(todayK(), 1)}">Завтра</button><input class="fin ms-date" type="date" data-id="${e.id}" min="${todayK()}" aria-label="Другая дата">`
      : `<button class="btn" data-act="missmove" data-id="${e.id}">${I(IC.cal, 15)} Перенести</button><button class="btn" data-act="missdone" data-id="${e.id}">${I(IC.check, 15)} Выполнено</button>`}</div></div>`).join('')}</div>
  ${l.length > 1 ? `<button class="btn" style="width:100%;margin-top:12px" data-act="missalldone">Отметить все выполненными</button>` : ''}`, keep);
}
function missedMoveTo(id, d) {
  const e = S.events.find(x => x.id === id); if (!e || !d) return;
  snap(); e.date = d; missMove = null; save(); render(); openMissed(true);
  toast(`«${e.title}» перенесено на ${relDay(d)}`, true);
}
ACT.missopen = () => { missMove = null; openMissed(); };
ACT.missmove = el => { missMove = el.dataset.id; openMissed(true); };
ACT.missto = el => missedMoveTo(el.dataset.id, el.dataset.d);
ACT.missdone = el => { const e = S.events.find(x => x.id === el.dataset.id); if (!e) return; snap(); e.done = true; save(); render(); openMissed(true); toast('Отмечено выполненным', true); };
ACT.missalldone = () => { const l = missedList(); snap(); l.forEach(e => e.done = true); save(); closeSheet(); render(); toast(`Отмечено выполненными: ${l.length}`, true); };
document.addEventListener('change', e => { if (e.target.classList.contains('ms-date')) missedMoveTo(e.target.dataset.id, e.target.value); });

// ---- Пример для пробы: заполнить раздел, чтобы увидеть, как он выглядит; потом убрать одной кнопкой ----
const demoBar = (key, on) => on
  ? `<div class="demobar">${I(IC.spark, 16)}<span>Это <b>пример</b> — ваши данные он не затрагивает.</span><button class="btn" data-act="demooff" data-s="${key}">Убрать пример</button></div>`
  : '';
const emptyCard = (key, title, text) => `<div class="card empty-card"><b>${title}</b><p>${text}</p><div class="row"><button class="btn pri" data-act="add">${I(IC.plus, 16)} ${SEC[key].newLabel}</button><button class="btn" data-act="demoon" data-s="${key}">${I(IC.spark, 16)} Показать на примере</button></div></div>`;
ACT.demoon = el => { const s = SEC[el.dataset.s]; if (!s || !s.demo) return; s.demo(true); save(); render(); toast('Добавлен пример — посмотрите, как всё выглядит'); };
ACT.demooff = el => { const s = SEC[el.dataset.s]; if (!s || !s.demo) return; s.demo(false); save(); render(); toast('Пример убран'); };

// Горизонтальная прокрутка таблиц сохраняется между перерисовками; при первом показе — к сегодняшнему дню
const hsKeep = {};
function hsSave() { $$('[data-hs]').forEach(e => { hsKeep[e.dataset.hs] = e.scrollLeft; }); }
function hsRestore() {
  $$('[data-hs]').forEach(e => {
    const k = e.dataset.hs;
    if (k in hsKeep) { e.scrollLeft = hsKeep[k]; return; }
    const t = e.querySelector('.is-today');
    if (t) { const pad = (e.querySelector('.sticky-col') || {}).offsetWidth || 0; e.scrollLeft = Math.max(0, t.offsetLeft - pad - (e.clientWidth - pad) / 2); }
  });
}

// Деньги: «12 345 ₽»
const NF = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
const NF0 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const rub = v => NF.format(Math.round((v || 0) * 100) / 100) + ' ₽';
const rub0 = v => NF0.format(Math.round(v || 0)) + ' ₽';
const pctTxt = p => p == null ? '—' : Math.round(p * 100) + '%';
