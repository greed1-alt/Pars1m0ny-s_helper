// ---- Подробное знакомство (6 октября 2026): тур по каждой странице и каждой функции ----
// Просьба пользователя: «более расширенная версия знакомства — на каждую функцию, на каждую страницу».
// Тур подсвечивает настоящий элемент на экране и объясняет его. «Далее» / «Назад» (стрелки, Enter), Esc или × — выйти.
// Шаг: { el:'селекторы через запятую' (берётся первый видимый), t:'заголовок', p:'текст', go:() => подготовка экрана, pc/m:true — только ПК / телефон }.
// Шаг без el — окно по центру. Нет элемента (раздел или блок выключены, нет данных) — шаг пропускается, а с keep:true — показывается по центру.
// Где запускается: Настройки → «Знакомство с приложением» (openTourMenu), последний экран первого знакомства,
// приглашение при первом заходе на каждую страницу (tourInvite, отметки в S.settings.toured).
const TOURS = {
  home:{ n:'Главная', steps:[
    { el:'.h2-hero', t:'Главная — ваш день на одном экране', p:'Здесь собрано всё на сегодня: дела, привычки, деньги и цели. Приложение открывается на этой странице.' },
    { el:'.h2-ring', t:'Кольцо дня', p:'Показывает, какая часть дел и привычек на сегодня уже сделана. Отмечайте их галочками — кольцо заполнится само.' },
    { el:'.h2-omni', t:'Строка ввода — так добавляется всё', p:'Пишите обычной фразой: «позвонить маме», «встреча завтра в 15:00», «кафе 450», «2 литра воды каждый день». Под строкой видно, что получится, — нажмите Enter или «+». Кнопки «Задача», «Событие», «Деньги»… выбирают вид записи вручную.' },
    { el:'.h2-col .missbar', t:'Вы пропустили', p:'Дела прошлых дней без галочки. «Разобрать» — перенести их на другой день или отметить сделанными. Сами они никуда не переносятся.' },
    { el:'[data-blk="plan"], [data-fold="h-plan"]', t:'План на сегодня', p:'Все события и задачи на сегодня: сначала по времени, потом без времени. Кружок слева — отметить выполненным, нажатие на название — открыть и изменить. Ближайшее дело подсвечено.' },
    { el:'[data-blk="habits"], [data-fold="h-habits"]', t:'Привычки', p:'Привычки на сегодня плитками. Нажмите на плитку — привычка отмечена, ещё раз — отметка снимется. Внизу — сколько дней подряд всё выполнено.' },
    { el:'[data-blk="money"], [data-fold="h-money"]', t:'Деньги', p:'Сколько можно потратить сегодня, чтобы уложиться в бюджет месяца, и сегодняшние траты. Трату удобно записать в строке ввода: «кафе 450».' },
    { el:'.h2-col .fold.h2-blk', t:'Свёрнутые блоки', p:'Блок в одну строку — свёрнутый. Нажмите, чтобы открыть, и ещё раз — чтобы свернуть. Справа — короткая сводка.' },
    { el:'.h2-cust', t:'Настроить Главную', p:'Какие блоки показывать, в каком порядке, открытыми или свёрнутыми — выбирается здесь.' },
    { el:'.btn-new, .newbtn', t:'Кнопка «Создать»', p:'Открывает окно добавления: та же строка ввода, примеры фраз и обычные формы — событие, задача, привычка, расход, заметка. На компьютере — ещё клавиша N.' },
    { el:'#tabbar, .sb-nav', t:'Разделы', p:'Переход между разделами. Какие разделы показывать и в каком порядке — Настройки → «Разделы и Главная».' },
    { el:'.hdr-ava', t:'Профиль', p:'Имя, аватар и обложка, статистика и достижения.' },
    { el:'.top [data-act="settings"], .sb-foot [data-s="settings"]', t:'Настройки', p:'Оформление и цвета, разделы, календарь, копия данных и это знакомство.' },
  ] },
  cal:{ n:'Календарь', steps:[
    { el:'.segc', t:'Вид календаря', p:'Месяц, Неделя, День или Список на 60 дней вперёд. На компьютере — клавиши M, W, D и L.' },
    { el:'.navg, #ttl', t:'Листать время', p:'Стрелки переключают месяц, неделю или день, «Сегодня» возвращает к текущему дню. На телефоне можно листать свайпом влево и вправо.' },
    { go:() => { if (view !== 'week') setView('week'); }, el:'.wg-body', t:'Сетка недели', p:'Нажмите на пустое место — появится окошко нового события на это время (по четвертям часа). На компьютере можно протянуть мышью, чтобы сразу задать начало и конец. Красная линия — «сейчас».' },
    { el:'.wg-block', keep:true, t:'События', p:'Нажмите, чтобы открыть карточку события: время, повтор, календарь, заметка. Перетаскивайте, чтобы перенести (на телефоне — удерживайте пальцем полсекунды), тяните за нижний край — длительность. Ошиблись — «Отменить» внизу экрана.' },
    { el:'.wg-alldays', t:'Дела без времени', p:'Задачи и события на весь день — строкой над сеткой. Галочка отмечает выполненным.' },
    { el:'.wg-fold', t:'Свободные часы', p:'Пустые часы сжаты в полоску «свободно», чтобы неделя помещалась на экране. Нажмите — полоска развернётся. Отключается в Настройках → Календарь.' },
    { pc:true, el:'#mini', t:'Мини-календарь', p:'Быстрый переход к любому дню. Цветные точки под числом — задачи этого дня.' },
    { pc:true, el:'#side .sb-sec', t:'Мои календари', p:'Категории событий: Работа, Учёба, Отдых… Галочка показывает или прячет их. Цвет и название меняются в Настройках → Календари.' },
    { el:'[data-act="search"]', t:'Поиск и команды', p:'Найти событие по названию или быстро выполнить команду. На компьютере — Ctrl+K или «/». Сюда можно вставить ссылку, которой с вами поделились.' },
  ] },
  tasks:{ n:'Задачи', steps:[
    { go:() => { if (tView !== 'today') { tView = 'today'; render(); } }, el:'.t2-seg', t:'Вкладки', p:'«Сегодня» — дела на сегодня, «Неделя» — по дням, «Все» — весь список с фильтрами, «Цели» — большие цели и шаги к ним.' },
    { el:'main .h2-omni', t:'Новая задача', p:'Пишите как говорите: «отчёт в пятницу #работа !!». Дата и время понимаются из текста, #слово выбирает календарь, «!» — высокая важность, «!!» — срочно.' },
    { el:'.t2-list', t:'Список', p:'Кружок слева — сделано. Нажмите на задачу, чтобы изменить срок, важность, повтор или удалить её. Цветная метка — календарь, «Срочно» и «Высокий» — важность. Задача с датой видна и в календаре.' },
    { go:() => { tView = 'week'; render(); }, el:'.t2-list', t:'Неделя', p:'Задачи по дням недели. «+» у дня — добавить задачу именно на этот день. Пустые дни помечены «свободно».' },
    { go:() => { tView = 'all'; render(); }, el:'.t2-flt', t:'Все задачи', p:'Активные, выполненные или все. Нажмите на важность — останутся только такие задачи.' },
    { go:() => { tView = 'goals'; render(); }, el:'.g-add', t:'Цели', p:'Большая цель со сроком: «выучить английский до 1 июня». После этого добавьте к ней шаги.' },
    { el:'.gl-card', t:'Карточка цели', p:'Полоска — сколько шагов сделано, «темп» — успеваете ли вы к сроку. Нажмите на цель, чтобы добавить шаги; шаг с датой появится в задачах и в календаре. За пропуски — подначки, за успехи — похвала.' },
    { go:() => { tView = 'today'; render(); }, el:'[data-fold="t-board"]', t:'Доска недели и статистика', p:'Внизу свёрнуты доска недели (дни с процентом выполнения) и статистика. Нажмите, чтобы открыть.' },
  ] },
  habits:{ n:'Привычки', steps:[
    { el:'main .h2-card', t:'Привычки на сегодня', p:'Нажмите на плитку — отмечено, ещё раз — отметка снимется. Здесь же привычки «раз в неделю» и «раз в месяц».' },
    { el:'main .h2-card [data-act="hnew"]', t:'Новая привычка', p:'Название, значок и как часто: каждый день, по дням недели, раз в неделю или раз в месяц. Можно и строкой ввода на Главной: «привычка: зарядка».' },
    { el:'[data-fold="h-grid"]', t:'Таблица месяца', p:'Все привычки по дням. Процент — от того, что было запланировано с начала месяца. Отмечать прошлые дни — включите в Настройках «Отмечать привычки задним числом».' },
    { el:'[data-fold="h-prog"]', t:'Прогресс', p:'Как идёт месяц и сравнение с прошлым: «+10% к сентябрю». И самые стабильные привычки.' },
    { el:'[data-fold="h-bio"]', t:'Самочувствие', p:'Сон, энергия, настроение, стресс — оценки одним нажатием. Какие показатели вести — Настройки → «Показатели самочувствия».' },
    { el:'[data-fold="h-notes"]', t:'Заметки', p:'Журнал мыслей с датой: что получилось, что мешало. Все заметки — в архиве по месяцам, их можно скачать файлом.' },
    { el:'.navg, #ttl', t:'Другие месяцы', p:'Стрелки в шапке листают месяцы — так видно прошлые результаты.' },
  ] },
  fin:{ n:'Финансы', steps:[
    { el:'.f2-kh', t:'Что записываете', p:'Расход, Доход или Накопление. От выбора зависит, какую категорию угадает приложение.' },
    { el:'.f2-in .om-box', t:'Быстрая запись', p:'«кафе 450», «такси 1,5к», «+ зарплата 60 000» — сумма и категория понимаются сами. «Подробная форма…» — дата, категория и заметка вручную.' },
    { el:'.f2-hero', t:'Можно потратить сегодня', p:'Дневной лимит: остаток бюджета на траты, поделённый на оставшиеся дни месяца. Ниже — полоска расходов, доходы, накопления и остаток.' },
    { el:'.f2-hero [data-act="finbudget"]', t:'Бюджет', p:'Сколько тратить в месяц по категориям. Без бюджета дневного лимита не будет. Здесь же — свои категории.' },
    { el:'.f2-grid > .card:last-child', t:'Последние записи', p:'Нажмите на запись, чтобы изменить или удалить её.' },
    { el:'[data-fold="f-charts"]', t:'Графики и подробности', p:'Ниже свёрнуты графики, категории с бюджетом, самые дорогие покупки и вся история. Нажмите, чтобы открыть.' },
    { el:'.navg, #ttl', t:'Другие месяцы', p:'Стрелки в шапке листают месяцы.' },
  ] },
  settings:{ n:'Настройки', steps:[
    { el:'.card:has(.lk-row)', t:'Оформление', p:'Тема, палитра, контраст, вид карточек и углов. Всё меняется сразу — смотрите превью «Как это выглядит».' },
    { el:'.card:has([data-act="secscust"])', t:'Разделы и Главная', p:'Выключите ненужные разделы и расставьте вкладки по порядку. Здесь же — блоки Главной и с чего открывать приложение.' },
    { el:'.card:has(#s_ds)', t:'Календарь', p:'С какого часа начинается сетка, с какого дня неделя, выходные, номер недели, свёртка пустых часов.' },
    { el:'.card:has([data-act="export"])', t:'Копия данных', p:'Всё хранится только на этом устройстве. Время от времени нажимайте «Скачать копию» — так ничего не потеряется. Копию можно загрузить и на другом устройстве.' },
    { el:'.card:has([data-act="tourmenu"])', t:'Знакомство', p:'Этот тур можно пройти снова — целиком или по одной странице.' },
  ] },
};
onMigrate(() => { const st = S.settings; if (!st.toured || typeof st.toured !== 'object' || Array.isArray(st.toured)) st.toured = {}; });
const tourSteps = k => TOURS[k].steps.filter(s => !(s.pc && innerWidth < 900) && !(s.m && innerWidth >= 900));
const tourKeys = () => [...navSecs().filter(k => TOURS[k]), 'settings'];

let tour = null;   // { list, i, keys }
const tourFind = sel => sel ? [...document.querySelectorAll(sel)].find(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !e.closest('#tour'); }) || null : null;
function tourStart(k) {
  const keys = k === 'all' ? tourKeys() : TOURS[k] ? [k] : [];
  if (!keys.length) return;
  if (sheetOpen()) closeSheet(); hideTip(); tinvHide();
  tour = { keys, list: keys.flatMap(x => tourSteps(x).map(s => Object.assign({ s:x }, s))), i:-1 };
  let box = $('#tour');
  if (!box) {
    box = document.createElement('div'); box.id = 'tour';
    box.innerHTML = '<div class="tour-hole"></div><div class="tour-pop" role="dialog" aria-modal="true" aria-live="polite"></div>';
    // Пока идёт тур, страница не прокручивается колесом и пальцем — подсветка не съезжает
    ['wheel', 'touchmove'].forEach(ev => box.addEventListener(ev, e => { if (!e.target.closest('.tour-pop')) e.preventDefault(); }, { passive:false }));
    document.body.appendChild(box);
  }
  box.classList.add('show');
  tourGo(0, 1);
}
function tourGo(i, dir) {
  if (!tour) return;
  if (i < 0) { i = 0; dir = 1; }
  if (i >= tour.list.length) return tourEnd(true);
  const st = tour.list[i];
  if (st.s !== sec) setSec(st.s);
  if (st.go) st.go();
  const el = tourFind(st.el);
  if (st.el && !el && !st.keep) return tourGo(i + dir, dir);   // нет на экране — пропускаем
  tour.i = i;
  tourDraw(st, el);
}
function tourDraw(st, el) {
  const box = $('#tour'); if (!box || !tour) return;
  const pop = box.querySelector('.tour-pop'), hole = box.querySelector('.tour-hole');
  const n = tour.list.length, num = tour.i + 1, last = num === n;
  pop.innerHTML = `<div class="tour-top"><small>${TOURS[st.s].n} · ${num} из ${n}</small><button class="ic" data-act="tourend" aria-label="Закончить знакомство" title="Закончить (Esc)">${I(IC.x, 16)}</button></div>
    <b class="tour-t">${st.t}</b><p class="tour-p">${st.p}</p>
    <div class="tour-bar"><i style="width:${Math.round(num / n * 100)}%"></i></div>
    <div class="tour-foot">${tour.i > 0 ? '<button class="btn" data-act="tourprev">Назад</button>' : '<span></span>'}<button class="btn pri" data-act="tournext">${last ? 'Готово' : 'Далее'}</button></div>`;
  if (el) tourScroll(el);   // прокрутка мгновенная — размеры сразу известны
  tourPlace(el);
  const nx = pop.querySelector('[data-act="tournext"]'); if (nx) nx.focus({ preventScroll:true });
}
// Прокрутка к элементу. ПК: по центру экрана (высокий блок — с начала, под шапкой).
// Телефон: подсказка у верхнего края, а блок — сразу под ней; если выше прокрутить нельзя (блок в начале страницы) — подсказка снизу.
// Элементы шапки и нижних вкладок не прокручиваются — подсказка встаёт с противоположной стороны.
const popSide = (pop, side) => { pop.style.cssText = side === 'bottom' ? 'left:12px;bottom:calc(12px + env(safe-area-inset-bottom))' : 'left:12px;top:calc(12px + env(safe-area-inset-top))'; };
function tourScroll(el) {
  const H = innerHeight;
  if (innerWidth >= 600) {
    const tall = el.getBoundingClientRect().height > H * .7;
    el.scrollIntoView({ block: tall ? 'start' : 'center', inline:'nearest', behavior:'instant' });
    if (tall && scrollY > 0 && !el.closest('.wgwrap, #side, header, #tabbar')) window.scrollBy(0, -($('header').offsetHeight + 12));
    return;
  }
  const pop = $('#tour .tour-pop');
  if (el.closest('header, #tabbar')) { tour.side = el.getBoundingClientRect().top < H / 2 ? 'bottom' : 'top'; return; }
  tour.side = 'top'; popSide(pop, 'top');
  el.scrollIntoView({ block:'start', inline:'nearest', behavior:'instant' });
  const want = pop.getBoundingClientRect().bottom + 14;
  window.scrollBy(0, el.getBoundingClientRect().top - want);
  if (el.getBoundingClientRect().top >= want - 2) return;
  tour.side = 'bottom'; popSide(pop, 'bottom');
  const lim = pop.getBoundingClientRect().top - 14, b = el.getBoundingClientRect().bottom;
  if (b > lim) window.scrollBy(0, b - lim);
}
// Подсветка — «окно» в затемнении вокруг элемента; подсказка — под ним, над ним или (на телефоне) у края экрана
function tourPlace(el) {
  const box = $('#tour'); if (!box) return;
  const pop = box.querySelector('.tour-pop'), hole = box.querySelector('.tour-hole'), W = innerWidth, H = innerHeight, pad = 6;
  if (!el) { hole.classList.add('none'); box.classList.add('dim'); pop.style.cssText = `left:${Math.max(12, (W - pop.offsetWidth) / 2)}px;top:${Math.max(12, (H - pop.offsetHeight) / 2)}px`; return; }
  box.classList.remove('dim'); hole.classList.remove('none');
  const r = el.getBoundingClientRect(), top = Math.max(4, r.top - pad), bot = Math.min(H - 4, r.bottom + pad);
  hole.style.cssText = `left:${Math.max(4, r.left - pad)}px;top:${top}px;width:${Math.min(W - 8, r.width + pad * 2)}px;height:${Math.max(0, bot - top)}px`;
  const pw = pop.offsetWidth, ph = pop.offsetHeight, gap = 12;
  let x, y;
  if (W < 600) return popSide(pop, tour && tour.side || ((top + bot) / 2 < H / 2 ? 'bottom' : 'top'));
  {
    x = Math.max(12, Math.min(r.left, W - pw - 12));
    if (bot + gap + ph < H - 8) y = bot + gap;
    else if (top - gap - ph > 8) y = top - gap - ph;
    else if (r.right + gap + pw < W - 8) { x = r.right + gap; y = Math.max(12, Math.min(top, H - ph - 12)); }
    else if (r.left - gap - pw > 8) { x = r.left - gap - pw; y = Math.max(12, Math.min(top, H - ph - 12)); }
    else { x = W - pw - 16; y = H - ph - 16; }
  }
  pop.style.cssText = `left:${x}px;top:${Math.max(8, y)}px`;
}
// После перерисовки страницы (render) подсветка находит элемент заново
function tourSync() { if (!tour || tour.i < 0) return; const st = tour.list[tour.i]; if (st && st.s === sec) tourPlace(tourFind(st.el)); }
function tourEnd(done) {
  if (!tour) return;
  tour.keys.forEach(k => { S.settings.toured[k] = 1; }); save();
  tour = null;
  const box = $('#tour'); if (box) box.classList.remove('show');
  if (done) toast('Готово! Повторить знакомство — Настройки → «Знакомство с приложением»');
}
ACT.tournext = () => tour && tourGo(tour.i + 1, 1);
ACT.tourprev = () => tour && tourGo(tour.i - 1, -1);
ACT.tourend = () => tourEnd(false);
ACT.tourgo = el => tourStart(el.dataset.k);
document.addEventListener('keydown', e => {
  if (!tour) return;
  e.stopImmediatePropagation();
  if (e.key === 'Escape') { e.preventDefault(); tourEnd(false); }
  else if (e.key === 'ArrowRight' || (e.key === 'Enter' && !e.isComposing)) { e.preventDefault(); ACT.tournext(); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); ACT.tourprev(); }
}, true);
addEventListener('resize', () => { if (tour) tourSync(); });

// ---- Окно «Знакомство с приложением» (Настройки → О приложении) ----
function openTourMenu() {
  const keys = tourKeys(), all = keys.reduce((n, k) => n + tourSteps(k).length, 0);
  sheet(`<div class="sh-head"><h3>Знакомство</h3><button class="ic" data-act="close" aria-label="Закрыть">${I(IC.x, 18)}</button></div>
  <p class="set-note" style="margin:0 0 12px">Тур подсвечивает части экрана и объясняет, что они делают. Пройдите его целиком или выберите одну страницу.</p>
  <button class="tm-all" data-act="tourgo" data-k="all">${I(IC.spark, 20)}<span><b>Подробный тур по приложению</b><small>Все разделы по порядку · до ${all} шагов, около 3 минут</small></span>${I(IC.right, 18)}</button>
  <div class="set-sec">По одной странице</div>
  <div class="tm-grid">${keys.map(k => `<button data-act="tourgo" data-k="${k}">${I(k === 'settings' ? IC.gear : SEC[k].icon, 18)}<b>${TOURS[k].n}</b><small>${plural(tourSteps(k).length, ['шаг', 'шага', 'шагов'])}</small></button>`).join('')}</div>
  <button class="btn" style="width:100%;margin-top:14px" data-act="onbshow">${I(IC.spark, 16)} Первые шаги — 3 коротких экрана</button>
  ${innerWidth >= 900 ? `<button class="btn" style="width:100%;margin-top:8px" data-act="help">${I(IC.key, 16)} Горячие клавиши</button>` : ''}`);
}
ACT.tourmenu = () => openTourMenu();

// ---- Приглашение при первом заходе на страницу ----
let tinvFor = '';
function tinvHide() { const t = $('#tinv'); if (t) t.classList.remove('show'); tinvFor = ''; }
function tourInvite() {
  const k = sec;
  if (tour || !S.settings.onboarded || !TOURS[k] || S.settings.toured[k] || onbIsOpen() || sheetOpen()) { if (tinvFor && tinvFor !== k) tinvHide(); return; }
  if (tinvFor === k) return;
  let t = $('#tinv');
  if (!t) { t = document.createElement('div'); t.id = 'tinv'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.innerHTML = `<span class="tinv-ic">${I(IC.spark, 18)}</span><span class="tinv-t"><b>Впервые здесь?</b><small>Покажу, что есть на странице «${TOURS[k].n}» — ${plural(tourSteps(k).length, ['шаг', 'шага', 'шагов'])}.</small></span>
    <button class="btn pri" data-act="tinvgo">Показать</button><button class="ic" data-act="tinvno" aria-label="Не показывать">${I(IC.x, 16)}</button>`;
  tinvFor = k; void t.offsetWidth; t.classList.add('show');   // offsetWidth — чтобы сработала анимация появления
}
ACT.tinvgo = () => { const k = tinvFor; tinvHide(); tourStart(k); };
ACT.tinvno = () => { if (tinvFor) { S.settings.toured[tinvFor] = 1; save(); } tinvHide(); toast('Хорошо. Тур всегда есть в Настройках → «Знакомство с приложением»'); };
