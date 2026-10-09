// ---- Подсказки «?» (6 октября 2026): значок рядом с непонятной деталью ----
// На ПК подсказка показывается при наведении, на телефоне — по нажатию. Закрывается нажатием мимо, Esc или прокруткой.
// Тексты — в HINTS (по ключу), чтобы потом собрать из них страницу «Помощь». В разметке: ${hintK('ключ')} или ${hint('свой текст')}.
// Значок нельзя класть внутрь другой кнопки — только рядом с подписью.
const HINTS = {
  theme:'Светлая или тёмная. «Авто» — как в настройках телефона или компьютера. «Чёрная» — самая тёмная, для экранов OLED: меньше расходует заряд.',
  pal:'Набор цветов приложения: фон, карточки, кнопки. Цвета ваших календарей, категорий и графиков не меняются. «Графит» — первые цвета Parsimony.',
  contrast:'Насколько текст и линии отличаются от фона. «Мягкий» — спокойнее для глаз. «Высокий» — читается лучше всего, например на солнце.',
  card:'Как выглядят блоки на экранах. «Объёмные» — с мягкой тенью. «С рамкой» — с тонкой линией, как раньше. «Плоские» — без тени и линии, только цветом.',
  round:'Насколько скруглены углы у карточек и блоков.',
  evc:'Заливка событий в календаре: светлые «Пастельные» или «Яркие» — насыщеннее и заметнее.',
  density:'Высота одного часа в календаре (неделя и день). «Компактно» — на экран помещается больше часов, «Крупно» — легче попасть пальцем.',
  fold:'Если несколько часов подряд пусто во все дни недели, они сжимаются в узкую полоску «свободно». Нажмите на полоску — она развернётся.',
  dimPast:'Прошедшие события становятся бледнее — сразу видно, что ещё впереди.',
  weekNums:'Номер недели в году рядом с заголовком календаря — удобно, если на работе или учёбе считают по неделям.',
  habitPast:'Если включено, в таблице привычек можно отмечать прошлые дни. Если выключено — только сегодняшний.',
  omni:'Напишите обычной фразой — приложение само поймёт, что это:\n• «позвонить маме» — задача;\n• «встреча завтра в 15:00» — событие (есть время);\n• «кафе 450» — трата (есть сумма);\n• «2 литра воды каждый день» — привычка;\n• «заметка: …» — запись в журнал.\n«#работа» выбирает календарь, «!» и «!!» — важность. Под строкой видно, что получится. Кнопками над подсказкой вид можно выбрать вручную.',
  ring:'Сколько дел на сегодня уже сделано: задачи и привычки вместе. Отмечайте их галочками — процент посчитается сам.',
  limit:'Сколько можно потратить сегодня, чтобы уложиться в бюджет до конца месяца: (бюджет на траты − уже потрачено) ÷ сколько дней осталось. Бюджет задаётся кнопкой «Бюджет».',
  finKind:'Что записываете: «Расход» — трата, «Доход» — зарплата и другие поступления, «Накопление» — деньги, которые откладываете. По этому выбору приложение угадывает категорию.',
  task:'Задача — дело, которое отмечают галочкой «сделано»: она видна в разделе «Задачи», у неё есть важность. Без этой отметки запись — просто событие в календаре.',
  remind:'Пришлём уведомление в выбранное время на устройства, где включены напоминания (Настройки → Напоминания). Можно выбрать несколько. Для дел без времени — от 9:00.',
  habitPct:'Процент за месяц: сколько отмечено из всего, что было запланировано с 1-го числа по сегодня.',
  pace:'Темп сравнивает, какая часть шагов сделана и какая часть срока прошла. «Отстаёте» — если сделано меньше, чем прошло времени, или есть просроченный шаг.',
  missed:'Разовые дела за последние 30 дней, которые не отмечены выполненными. Повторяющиеся дела (работа, обед) сюда не попадают. Сами они никуда не переносятся — решаете вы.',
};
const hint = (text, label) => `<button type="button" class="hint" data-act="hint" data-tip="${esc(text)}" aria-label="${esc(label || 'Подсказка')}" aria-expanded="false">?</button>`;
const hintK = k => HINTS[k] ? hint(HINTS[k]) : '';
// Подпись со значком: последнее слово и «?» не разрываются переносом строки (иначе значок остаётся один на новой строке)
const withHint = (text, k) => { const s = String(text), i = s.lastIndexOf(' '), tail = s.slice(i + 1);
  return i < 0 || /[<>]/.test(tail) ? `<span class="hint-nw">${s}${hintK(k)}</span>` : `${s.slice(0, i + 1)}<span class="hint-nw">${tail}${hintK(k)}</span>`; };

let tipFor = null, tipPinned = false;
function showTip(el, pin) {
  let t = $('#tip');
  if (!t) { t = document.createElement('div'); t.id = 'tip'; t.setAttribute('role', 'tooltip'); document.body.appendChild(t); }
  if (tipFor && tipFor !== el) tipFor.setAttribute('aria-expanded', 'false');
  tipFor = el; tipPinned = !!pin; el.setAttribute('aria-expanded', 'true');
  t.textContent = el.dataset.tip; t.classList.add('show');
  // Под значком, а если внизу мало места — над ним; по ширине не выходит за край экрана
  const r = el.getBoundingClientRect(), w = Math.min(300, innerWidth - 24); t.style.maxWidth = w + 'px';
  const tw = t.offsetWidth, th = t.offsetHeight, below = r.bottom + 8 + th < innerHeight - 8 || r.top - 8 - th < 8;
  t.style.left = Math.max(12, Math.min(r.left + r.width / 2 - tw / 2, innerWidth - tw - 12)) + 'px';
  t.style.top = (below ? r.bottom + 8 : r.top - 8 - th) + 'px';
}
function hideTip() {
  const t = $('#tip'); if (t) t.classList.remove('show');
  if (tipFor) tipFor.setAttribute('aria-expanded', 'false');
  tipFor = null; tipPinned = false;
}
ACT.hint = el => { if (tipFor === el && tipPinned) hideTip(); else showTip(el, true); };
const canHover = matchMedia('(hover: hover) and (pointer: fine)');
document.addEventListener('mouseover', e => { const h = canHover.matches && e.target.closest && e.target.closest('.hint'); if (h && h !== tipFor && !tipPinned) showTip(h, false); });
document.addEventListener('mouseout', e => { const h = e.target.closest && e.target.closest('.hint'); if (h && h === tipFor && !tipPinned && !h.contains(e.relatedTarget)) hideTip(); });
document.addEventListener('pointerdown', e => { if (tipFor && !(e.target.closest && e.target.closest('.hint, #tip'))) hideTip(); }, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && tipFor) { e.stopImmediatePropagation(); e.preventDefault(); hideTip(); } }, true);
addEventListener('scroll', () => { if (tipFor) hideTip(); }, true);
addEventListener('resize', () => { if (tipFor) hideTip(); });
