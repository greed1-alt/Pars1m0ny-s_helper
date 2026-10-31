// ---- Английский интерфейс (31 октября 2026). Загружается только при LANG === 'en' (js/i18n.js), русским пользователям не мешает ----
// Текст в коде остаётся русским: эти функции подменяют его на экране по словарю EN_DICT (js/en-dict.js). Ключ — русская фраза, «*» в ключе — подстановка
// (`Сделано ${a} из ${b}` → «Сделано * из *»). Новые фразы ищет: node tools/i18n-extract.mjs. Текст людей (латиницей) не трогаем: смотрим только на кириллицу
(() => {
  MON.splice(0, 12, 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December');
  MONG.splice(0, 12, ...MON);
  MONS.splice(0, 12, 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec');
  DOW.splice(0, 7, 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun');
  DOWF.splice(0, 7, 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday');

  const CYR = /[А-Яа-яЁё]/, D = EN_DICT, cache = new Map(), PAT = [];
  const MISS = /localhost|127\.0\.0\.1/.test(location.hostname) ? (window.__miss = new Set()) : null;   // что не нашлось — для проверки при разработке
  const WORDS = { 'день': ['day', 'days'], 'дело': ['item', 'items'], 'активная': ['active', 'active'], 'достижение': ['achievement', 'achievements'], 'друг': ['friend', 'friends'], 'задача': ['task', 'tasks'], 'заметка': ['note', 'notes'], 'занятие': ['session', 'sessions'], 'запись': ['entry', 'entries'], 'запрос': ['request', 'requests'], 'изменение': ['change', 'changes'], 'календарь': ['calendar', 'calendars'], 'категория': ['category', 'categories'], 'месяц': ['month', 'months'], 'минута': ['minute', 'minutes'], 'минуту': ['minute', 'minutes'], 'неделю': ['week', 'weeks'], 'отметку': ['mark', 'marks'], 'показатель': ['metric', 'metrics'], 'помидор': ['pomodoro', 'pomodoros'], 'привычка уже была': ['habit already existed', 'habits already existed'], 'привычка': ['habit', 'habits'], 'раз': ['time', 'times'], 'срочная': ['urgent', 'urgent'], 'устройство': ['device', 'devices'], 'участник': ['participant', 'participants'], 'цель': ['goal', 'goals'], 'час': ['hour', 'hours'], 'часа': ['hour', 'hours'], 'человек': ['person', 'people'], 'шаг': ['step', 'steps'], 'шага': ['step', 'steps'] };
  window.enPl = (n, f) => { const w = WORDS[f[0]]; return n + ' ' + (w ? w[n === 1 ? 0 : 1] : one(f[0])); };

  // Шаблоны: длинные — первыми. Короткий шаблон («* из *») не принимает кириллицу, иначе зацепил бы обычную фразу человека
  for (const k in D) { if (!k.includes('*')) continue;
    const lit = k.replace(/\*/g, '').replace(/[^А-Яа-яЁё]/g, '').length, cap = lit < 8 ? '([^А-Яа-яЁё]*)' : '([\\s\\S]*?)';
    PAT.push([new RegExp('^' + k.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, cap) + '$'), D[k], lit]); }
  PAT.sort((a, b) => b[2] - a[2]);
  const up = s => s.charAt(0).toUpperCase() + s.slice(1), lo = s => s.charAt(0).toLowerCase() + s.slice(1);
  const MONTH = /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/g;
  const get = k => { const v = D[k]; if (v != null) return v; if (D[lo(k)] != null) return up(D[lo(k)]); if (D[up(k)] != null) return lo(D[up(k)]); return null; };
  // Строка, склеенная из известных кусков («просрочено на » + «3 days»): принимается, только если покрыта вся кириллица, поэтому фразу человека не тронет
  function seg(c) { let i = 0, out = '';
    while (i < c.length) { if (!CYR.test(c[i])) { out += c[i++]; continue; }
      let hit = null; for (let n = Math.min(c.length - i, 70); n >= 2; n--) { if (CYR.test(c[i + n] || '')) continue; const v = get(c.slice(i, i + n)); if (v != null) { hit = [n, v]; break; } }
      if (!hit) return null;
      out += hit[1]; i += hit[0]; }
    return out; }
  function one(c) {
    if (!CYR.test(c)) return c;
    if (cache.has(c)) return cache.get(c);
    if (c.includes('\n')) c = c.replace(/\s*\n\s*/g, ' ');
    let r = D[c];
    if (r == null) { if (D[lo(c)] != null && c !== lo(c)) r = up(D[lo(c)]); else if (D[up(c)] != null && c !== up(c)) r = lo(D[up(c)]); }
    if (r == null) for (const [re, t] of PAT) { const m = re.exec(c); if (m) { let i = 1; r = t.replace(/\*/g, () => tr(m[i++] || '')); break; } }
    if (r == null) r = seg(c);
    if (r == null) for (const sep of [' · ', ' — ', ' – ', ': ', ', ']) if (c.includes(sep)) { const ps = c.split(sep).map(one); if (ps.every(p => !CYR.test(p))) { r = ps.join(sep); break; } }
    if (r == null) { r = c; if (MISS) MISS.add(c); }
    r = r.replace(MONTH, up);
    cache.set(c, r); return r;
  }
  const tr = s => { const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s); return m[1] + one(m[2]) + m[3]; };
  window.enTr = tr;
  const ATTR = ['placeholder', 'aria-label', 'title', 'data-tip', 'alt'], SEL = ATTR.map(a => `[${a}]`).join(',');
  const elAttrs = el => ATTR.forEach(a => { const v = el.getAttribute(a); if (!v || !CYR.test(v)) return; const t = tr(v); if (t !== v) el.setAttribute(a, t); });   // только если изменилось: иначе наблюдатель сработает снова и снова
  const textOf = n => { if (n.nodeValue && CYR.test(n.nodeValue)) { const p = n.parentNode; if (p && (p.nodeName === 'SCRIPT' || p.nodeName === 'STYLE' || p.nodeName === 'TEXTAREA')) return; const t = tr(n.nodeValue); if (t !== n.nodeValue) n.nodeValue = t; } };
  function walk(root) {
    if (root.nodeType === 3) return textOf(root);
    if (root.nodeType !== 1) return;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) textOf(n);
    if (root.matches(SEL)) elAttrs(root);
    root.querySelectorAll(SEL).forEach(elAttrs);
  }
  // Срабатывает до показа кадра, поэтому русский текст на экране не мелькает
  const ob = new MutationObserver(list => list.forEach(m => { if (m.type === 'characterData') textOf(m.target); else if (m.type === 'attributes') elAttrs(m.target); else m.addedNodes.forEach(walk); }));
  ob.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTR });
  walk(document.documentElement);

  // Строка ввода понимает английский: слова о дате, времени и виде записи заменяются на те, что знает разбор фраз (parseNL, omniParse), название остаётся как написано
  const MO = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'], MG = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const WD = { monday: 'понедельник', tuesday: 'вторник', wednesday: 'среду', thursday: 'четверг', friday: 'пятницу', saturday: 'субботу', sunday: 'воскресенье' }, WS = Object.keys(WD).map(w => w.slice(0, 3)).join('|');
  const wdOf = w => WD[Object.keys(WD).find(x => x.startsWith(w.toLowerCase()))];   // коротко («sun», «sat») — только после on / next: это ещё и обычные слова
  const mo = MO.join('|'), wd = Object.keys(WD).join('|'), h24 = (h, ap) => { h = +h; if (/p/i.test(ap) && h < 12) h += 12; if (/a/i.test(ap) && h === 12) h = 0; return h; };
  const RULES = [
    [/^(note|thought)\s*:\s*/i, 'заметка: '], [/^habit\s*:\s*/i, 'привычка: '], [/^goal\s*:\s*/i, 'цель: '], [/^task\s*:\s*/i, 'задача: '], [/^event\s*:\s*/i, 'событие: '], [/^(expense|spent)\s*:?\s+/i, 'трата '], [/^income\s*:?\s+/i, 'доход '],
    [/(^|\s)!low(?=\s|$)/gi, '$1!низкий'], [/(^|\s)!(high)(?=\s|$)/gi, '$1!высокий'], [/(^|\s)urgent(?=\s|$)/gi, '$1срочно'],
    [/\bevery day\b|\bdaily\b/gi, 'каждый день'], [/\bevery week\b|\bweekly\b/gi, 'каждую неделю'], [/\bevery month\b|\bmonthly\b/gi, 'каждый месяц'],
    [/\bday after tomorrow\b/gi, 'послезавтра'], [/\btomorrow\b/gi, 'завтра'], [/\btoday\b/gi, 'сегодня'], [/\byesterday\b/gi, 'вчера'],
    [new RegExp('\\b(?:by|until|till)\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s+(' + mo + ')\\b', 'gi'), (m, d, n) => 'до ' + d + ' ' + MG[MO.indexOf(n.toLowerCase())]],
    [new RegExp('\\b(?:by|until|till)\\s+(' + mo + ')\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b', 'gi'), (m, n, d) => 'до ' + d + ' ' + MG[MO.indexOf(n.toLowerCase())]],
    [new RegExp('\\b(?:on\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(' + mo + ')\\b', 'gi'), (m, d, n) => d + ' ' + MG[MO.indexOf(n.toLowerCase())]],
    [new RegExp('\\b(?:on\\s+)?(' + mo + ')\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b', 'gi'), (m, n, d) => d + ' ' + MG[MO.indexOf(n.toLowerCase())]],
    [/\bfor half an hour\b/gi, 'на полчаса'], [/\bfor an hour\b|\bfor 1 hour\b/gi, 'на час'], [/\bfor (\d+(?:[.,]\d+)?)\s*(?:hours?|hrs?|h)\b/gi, 'на $1 часа'], [/\bfor (\d+)\s*(?:minutes?|mins?)\b/gi, 'на $1 минут'],
    [/\bin half an hour\b/gi, 'через полчаса'], [/\bin an hour\b|\bin 1 hour\b/gi, 'через час'], [/\bin (\d+)\s*(?:hours?|hrs?|h)\b/gi, 'через $1 часа'], [/\bin (\d+)\s*(?:minutes?|mins?)\b/gi, 'через $1 минут'], [/\bin a week\b/gi, 'через неделю'], [/\bin (\d+)\s*days?\b/gi, 'через $1 дня'], [/\bin (\d+)\s*weeks?\b/gi, 'через $1 недели'],
    [/\bfrom (\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s+(?:to|till|until)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/gi, (m, a, am, ap, b, bm, bp) => 'с ' + h24(a, ap || bp || '') + ':' + (am || '00') + ' до ' + h24(b, bp || '') + ':' + (bm || '00')],
    [/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/gi, (m, h, mm, ap) => 'в ' + h24(h, ap) + ':' + (mm || '00')],
    [/\bat noon\b/gi, 'в полдень'], [/\bat (\d{1,2}(?::\d{2})?)\b/gi, 'в $1'],
    [new RegExp('\\b(?:on\\s+)?next\\s+(' + wd + '|' + WS + ')\\b', 'gi'), (m, w) => 'в следующий ' + wdOf(w)], [new RegExp('\\bon\\s+(' + WS + ')\\b', 'gi'), (m, w) => 'в ' + wdOf(w)], [new RegExp('\\b(?:on\\s+)?(' + wd + ')\\b', 'gi'), (m, w) => 'в ' + wdOf(w)],
    [/(\d)\s*k\b/gi, '$1к'],
  ];
  const toRu = t => RULES.reduce((s, [re, to]) => s.replace(re, to), String(t == null ? '' : t));
  const pNL = parseNL, pOM = omniParse;
  parseNL = (t, ...r) => pNL(toRu(t), ...r);
  omniParse = (t, ...r) => pOM(toRu(t), ...r);
  // Угадывание категории трат и календаря по английским словам
  FIN_KW.push([/taxi|uber|metro|subway|\bbus\b|fuel|petrol|parking|train/i, 'Транспорт'], [/coffee|caf[eé]|lunch|dinner|breakfast|restaurant|pizza/i, 'Кафе и рестораны'], [/grocer|supermarket|\bfood\b/i, 'Продукты'], [/pharmacy|doctor|dentist|clinic|medicine/i, 'Здоровье'],
    [/cinema|movie|concert|theatre|theater|\bgame|\bbar\b/i, 'Развлечения'], [/clothes|shoes|jacket|jeans/i, 'Одежда'], [/gift|present/i, 'Подарки'], [/salary|wage|bonus/i, 'Зарплата'], [/\brent\b|mortgage/i, 'Аренда или ипотека'], [/utilit|electric/i, 'Коммунальные услуги'], [/internet|mobile|phone bill/i, 'Интернет и связь'], [/\bgym\b/i, 'Спортзал']);
  CAT_KW.push([/^work/i, /meeting|\bcall\b|report|client|office|deadline|project|email|presentation/i], [/^study/i, /exam|lesson|course|lecture|homework|class|seminar/i], [/^walk/i, /walk|\bpark\b/i], [/^rest/i, /rest|relax|holiday|cinema|film/i]);

  // То, что не попадает на страницу: «Поделиться», копирование, уведомление на этом устройстве
  if (navigator.share) { const sh = navigator.share.bind(navigator); navigator.share = d => sh({ ...d, text: d.text && tr(d.text) }); }
  const cp = copyText;
  copyText = (s, ok) => { const m = /^([\s\S]*?)(\s+https?:\S+)?$/.exec(String(s)); return cp(tr(m[1]) + (m[2] || ''), ok); };
  if (window.ServiceWorkerRegistration) { const P = ServiceWorkerRegistration.prototype, sn = P.showNotification; P.showNotification = function (t, o) { return sn.call(this, tr(t), o && o.body ? { ...o, body: tr(o.body) } : o); }; }
})();
