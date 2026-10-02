// ---- Ядро: настройки сервера, данные, иконки, даты, повторы, ввод фразой ----
const SUPABASE_URL = 'https://zgasnvubcdprgsypkglh.supabase.co';
const SUPABASE_KEY = 'sb_publishable_D9zVovgo-2C3MBGolggC6w_SNb8fOzR';
const VAPID_PUBLIC = 'BNLThhEBoIT1sgFRviDsI33JdA_Rz18EY5SN7ANL8_gXdctCj4vYguPYopLrBMhAsfgIropWotPwypRexGUeZYU';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const APP_NAME = 'Parsimony';
// Шрифт надписи Parsimony: 'josefin' (№14 Josefin Sans), 'vibes' (№9 Great Vibes), 'serif' (Instrument Serif) — стили в css/sections.css
const WORDMARK = 'josefin';
document.documentElement.dataset.wm = WORDMARK;
const LS = 'remapp_v1';
const DEF = { cats:[{id:'work',name:'Работа',color:'#ef4444'},{id:'rest',name:'Отдых',color:'#38bdf8'},{id:'walk',name:'Прогулка',color:'#22c55e'},{id:'study',name:'Учёба',color:'#a855f7'}], events:[],
  settings:{weekStart:1, theme:'auto', tplOpen:true, dayStart:6, density:'normal', weekends:true, weekNums:true, dimPast:true, lastTest:0},
  templates:[{id:'t1',title:'Не забыть',cat:'work',time:'',time2:''},{id:'t2',title:'Учёба',cat:'study',time:'10:00',time2:'12:00'},{id:'t3',title:'Прогулка',cat:'walk',time:'18:00',time2:'19:00'},{id:'t4',title:'Отдых',cat:'rest',time:'',time2:''}] };
let S;
try { S = JSON.parse(localStorage.getItem(LS)); } catch (e) {}
S = Object.assign(structuredClone(DEF), S || {});
S.settings = Object.assign({}, DEF.settings, S.settings);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,6);
// Старые данные: повтор напоминания (каждый день / по дням) превращаем в настоящий повтор события
function migrate() {
  if (!Array.isArray(S.events)) S.events = [];
  if (!Array.isArray(S.cats) || !S.cats.length) S.cats = structuredClone(DEF.cats);
  if (!Array.isArray(S.templates)) S.templates = [];
  S.events.forEach(e => {
    if (!e.id) e.id = uid();
    if (!e.repeat) {
      const r = e.reminder || {};
      e.repeat = r.repeat === 'daily' ? {type:'daily'} : r.repeat === 'custom' && (r.days||[]).length ? {type:'weekly', days:[...r.days]} : {type:'none'};
      if (e.reminder) { e.reminder.repeat = 'none'; e.reminder.days = []; }
    }
    if (!Array.isArray(e.doneDates)) e.doneDates = [];
    if (!Array.isArray(e.skip)) e.skip = [];
  });
  MIGRATE.forEach(f => f());
}
// Разделы (задачи, привычки, финансы) добавляют сюда свою проверку данных: она выполняется сразу и после загрузки копии
const MIGRATE = [];
const onMigrate = f => { MIGRATE.push(f); f(); };
migrate();
const evCache = new Map();
const save = () => { evCache.clear(); try { localStorage.setItem(LS, JSON.stringify(S)); } catch (e) {} };
// Метка этого устройства: по ней узнаём свои же ссылки и обновляем присланное, а не дублируем
if (!S.settings.dev) { S.settings.dev = uid(); save(); }
let hiddenCats = new Set();
// Действия по нажатию: раздел регистрирует ACT.имя = (элемент, событие) => …, общий обработчик нажатий вызывает его.
// Так каждое действие — отдельная функция, которую позже сможет вызвать и ассистент.
const ACT = Object.create(null);

// ---- Иконки ----
const I = (d, s = 18) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const IC = {
  left:'<path d="m15 18-6-6 6-6"/>', right:'<path d="m9 18 6-6-6-6"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', plus:'<path d="M12 5v14M5 12h14"/>',
  gear:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  cal:'<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  list:'<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
  bell:'<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  key:'<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6.5 10h.01M10 10h.01M14 10h.01M17.5 10h.01M7.5 14h9"/>',
  down:'<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>', up:'<path d="M12 16V5M7 9.5l5-5 5 5M5 20h14"/>',
  undo:'<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  trash:'<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  copy:'<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  x:'<path d="M18 6 6 18M6 6l12 12"/>', check:'<path d="M20 6 9 17l-5-5"/>',
  rep:'<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  moon:'<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>', sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  tpl:'<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>', clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  pin:'<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
  day:'<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4M10 14h4"/>',
  spark:'<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  share:'<path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="m16 6-4-4-4 4"/><path d="M12 2v13"/>',
  link:'<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  tasks:'<rect x="3.5" y="3.5" width="17" height="17" rx="3.5"/><path d="m8 12.5 3 3 5-6.5"/>',
  habit:'<path d="M12 21c-3.9 0-7-2.8-7-6.6 0-2.6 1.5-4.4 3-5.9.3 1.7 1.2 2.8 2.3 3.4C10 8.6 11.3 5.4 14 3c.4 3 2.1 4.7 3.6 6.6 1 1.3 1.4 2.8 1.4 4.6 0 3.9-3.1 6.8-7 6.8z"/>',
  wallet:'<path d="M17 7V5.5A1.5 1.5 0 0 0 15.5 4H6a2.5 2.5 0 0 0 0 5h13a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 20H6a2.5 2.5 0 0 1-2.5-2.5v-11"/><path d="M16.5 14.5h.01"/>',
  alert:'<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5M12 16.2h.01"/>',
  edit:'<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z"/><path d="m13.5 6.5 4 4"/>',
  home:'<path d="M3.5 10.5 12 3.5l8.5 7"/><path d="M5.5 9v10a1.5 1.5 0 0 0 1.5 1.5h3.5v-6h3v6H17a1.5 1.5 0 0 0 1.5-1.5V9"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 20.5c1.4-3.6 4.4-5.5 8-5.5s6.6 1.9 8 5.5"/>',
  trophy:'<path d="M8 4h8v5a4 4 0 0 1-8 0V4z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20.5h7M10 17h4"/>',
  note:'<path d="M5 4.5h10l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 4 19V6a1.5 1.5 0 0 1 1-1.5z"/><path d="M14.5 4.5V9h4.5M8 13h8M8 16.5h5"/>',
  gift:'<rect x="3.5" y="8" width="17" height="4" rx="1"/><path d="M5 12v7.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V12M12 8v13M12 8S10.5 3.5 8 4.2C6 4.8 6.6 8 12 8zm0 0s1.5-4.5 4-3.8c2 .6 1.4 3.8-4 3.8z"/>',
  globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>',
  more:'<circle cx="5.5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18.5" cy="12" r="1.2"/>'
};

// ---- Даты ----
const MON = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const MONG = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const MONS = ['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];
const DOW = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
const DOWF = ['Понедельник','Вторник','Среда','Четверг','Пятница','Суббота','Воскресенье'];
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const ds = d => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
const pd = s => { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); };
const addDays = (s, n) => { const d = pd(s); d.setDate(d.getDate() + n); return ds(d); };
const dowIdx = s => (pd(s).getDay() + 6) % 7;
const dowName = s => DOW[dowIdx(s)];
const isWknd = s => dowIdx(s) >= 5;
const fmtLong = s => { const d = pd(s); return d.getDate() + ' ' + MONG[d.getMonth()] + ', ' + dowName(s).toLowerCase(); };
const dnum = s => { const [y,m,d] = s.split('-').map(Number); return Date.UTC(y, m-1, d) / 864e5; };
const dayDiff = (a, b) => dnum(b) - dnum(a);
const todayK = () => ds(new Date());
const nowMin = () => { const n = new Date(); return n.getHours()*60 + n.getMinutes(); };
const weekStartOf = s => { const d = pd(s); const off = S.settings.weekStart === 1 ? (d.getDay()+6)%7 : d.getDay(); d.setDate(d.getDate() - off); return ds(d); };
const isoWeek = s => { const d = pd(s), t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); t.setUTCDate(t.getUTCDate() + 3 - (t.getUTCDay()+6)%7); const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 4)); return 1 + Math.round(((t - y) / 864e5 - 3 + (y.getUTCDay()+6)%7) / 7); };
const relDay = s => { const n = dayDiff(todayK(), s); return n === 0 ? 'сегодня' : n === 1 ? 'завтра' : n === 2 ? 'послезавтра' : n === -1 ? 'вчера' : fmtLong(s); };
const timeMin = t => { if (!t) return null; const [h,m] = t.split(':').map(Number); return isNaN(h) ? null : h*60 + (m||0); };
const fmtMin = m => m >= 1440 ? '23:59' : String(Math.floor(m/60)).padStart(2,'0') + ':' + String(m%60).padStart(2,'0');
const durText = n => n < 60 ? n + ' мин' : Math.floor(n/60) + ' ч' + (n % 60 ? ' ' + n % 60 + ' мин' : '');
const cat = id => S.cats.find(c => c.id === id) || {name:'Без категории', color:'#94a3b8'};
const validCat = id => S.cats.some(c => c.id === id) ? id : (S.cats[0] && S.cats[0].id);
const timeRange = e => e.time ? (e.time2 ? esc(e.time) + '–' + esc(e.time2) : esc(e.time)) : '';
const startH = () => Math.max(0, Math.min(12, Number(S.settings.dayStart) || 0));
const rowH = () => ({compact:44, normal:56, large:72})[S.settings.density] || 56;

// ---- Повторяющиеся события ----
const REP = {none:'Не повторять', daily:'Каждый день', weekdays:'По будням (пн–пт)', weekly:'Каждую неделю', monthly:'Каждый месяц', yearly:'Каждый год'};
const isRec = e => !!(e.repeat && e.repeat.type && e.repeat.type !== 'none');
function occurs(e, k) {
  if (!isRec(e)) return e.date === k;
  const r = e.repeat;
  if (k < e.date || (r.until && k > r.until) || (e.skip||[]).includes(k)) return false;
  const a = pd(e.date), b = pd(k);
  switch (r.type) {
    case 'daily': return true;
    case 'weekdays': return dowIdx(k) < 5;
    case 'weekly': return (r.days && r.days.length ? r.days : [dowIdx(e.date)]).includes(dowIdx(k));
    case 'monthly': return a.getDate() === b.getDate();
    case 'yearly': return a.getDate() === b.getDate() && a.getMonth() === b.getMonth();
  }
  return false;
}
const repText = e => { if (!isRec(e)) return ''; const r = e.repeat;
  let t = r.type === 'weekly' && r.days && r.days.length ? 'По дням: ' + [...r.days].sort().map(d => DOW[d]).join(', ') : REP[r.type];
  return t + (r.until ? ', до ' + pd(r.until).getDate() + ' ' + MONG[pd(r.until).getMonth()] : ''); };
const isDone = (e, k) => isRec(e) ? (e.doneDates||[]).includes(k) : !!e.done;
function evOn(k) {
  if (evCache.has(k)) return evCache.get(k);
  const list = S.events.filter(e => !hiddenCats.has(e.cat) && occurs(e, k))
    .map(e => Object.assign({}, e, { date:k, done:isDone(e, k), rec:isRec(e) }))
    .sort((a,b) => (a.time||'').localeCompare(b.time||'') || a.title.localeCompare(b.title));
  evCache.set(k, list);
  return list;
}
const nextOcc = e => { const t = todayK(); if (!isRec(e)) return e.date; for (let i = 0; i < 400; i++) { const k = addDays(t, i); if (occurs(e, k)) return k; } return e.date; };
const remLabel = e => {
  if (!e.reminder || !e.reminder.enabled) return '';
  const off = Number(e.reminder.offset || 0);
  return ' · 🔔 ' + (off === 0 ? 'в момент' : off < 60 ? `за ${off} мин` : off < 1440 ? `за ${off/60} ч` : `за ${off/1440} дн`);
};

// ---- Ввод фразой: «встреча завтра в 15:30 на час #работа» ----
const MON_RE = 'январ[яь]|феврал[яь]|марта?|апрел[яь]|ма[яй]|июн[яь]|июл[яь]|августа?|сентябр[яь]|октябр[яь]|ноябр[яь]|декабр[яь]';
function parseNL(src, base) {
  const today = todayK(), now = new Date();
  let s = ' ' + String(src) + ' ', date = null, time = null, time2 = null, dur = null, catId = null;
  const R = body => new RegExp('(^|[\\s,;(])' + body + '(?=$|[\\s,;.!?)])', 'i');
  const cut = (re, fn) => { const m = s.match(re); if (!m || fn(m) === false) return false; s = s.slice(0, m.index) + m[1] + ' ' + s.slice(m.index + m[0].length); return true; };
  const hm = (h, mi) => String(h).padStart(2,'0') + ':' + String(mi||0).padStart(2,'0');
  const tm = (h, mi, mod) => { h = Number(h); mi = Number(mi || 0); if (h > 23 || mi > 59) return null;
    mod = (mod || '').toLowerCase(); if ((mod === 'вечера' || mod === 'дня') && h < 12) h += 12; if (mod === 'ночи' && h === 12) h = 0; if (mod === 'утра' && h === 12) h = 0;
    return hm(h, mi); };
  const T = '(\\d{1,2})(?:[:.](\\d{2}))?';
  cut(/(^|\s)#([^\s#]+)(?=$|\s)/, m => { const q = m[2].toLowerCase(); const c = S.cats.find(c => c.name.toLowerCase().startsWith(q)); if (!c) return false; catId = c.id; });
  cut(R('через\\s+(полчаса|час|(\\d+)\\s*(минут[уы]?|мин|час(?:а|ов)?|ч))'), m => {
    const w = m[2].toLowerCase(), add = w === 'полчаса' ? 30 : w === 'час' ? 60 : /^ч/i.test(m[4]) ? Number(m[3]) * 60 : Number(m[3]);
    const t = new Date(now.getTime() + add * 60000); t.setMinutes(Math.ceil(t.getMinutes() / 5) * 5, 0, 0);
    date = ds(t); time = hm(t.getHours(), t.getMinutes()); });
  if (!date) cut(R('через\\s+(неделю|(\\d+)\\s*(дн(?:я|ей)|день|недел[иья]))'), m => {
    date = addDays(today, m[2].toLowerCase() === 'неделю' ? 7 : Number(m[3]) * (/^нед/i.test(m[4]) ? 7 : 1)); });
  if (!date) cut(R('(сегодня|послезавтра|завтра)'), m => { const w = m[2].toLowerCase(); date = addDays(today, w === 'сегодня' ? 0 : w === 'завтра' ? 1 : 2); });
  if (!date) cut(R('(?:в|во)\\s+(следующ\\S*\\s+)?(понедельник|вторник|среду|четверг|пятницу|субботу|воскресенье|пн|вт|ср|чт|пт|сб|вс)'), m => {
    const w = m[3].toLowerCase(), short = {пн:0,вт:1,ср:2,чт:3,пт:4,сб:5,вс:6};
    const idx = w in short ? short[w] : ['пон','вто','сре','чет','пят','суб','вос'].findIndex(p => w.startsWith(p));
    let diff = (idx - dowIdx(today) + 7) % 7; if (m[2]) diff += 7;
    date = addDays(today, diff); });
  cut(R('с\\s+' + T + '\\s+до\\s+' + T), m => { const a = tm(m[2], m[3]), b = tm(m[4], m[5]); if (!a || !b) return false; time = a; time2 = b; });
  if (!time) cut(R('(\\d{1,2})[:.](\\d{2})\\s*[-–—]\\s*(\\d{1,2})[:.](\\d{2})'), m => { const a = tm(m[2], m[3]), b = tm(m[4], m[5]); if (!a || !b) return false; time = a; time2 = b; });
  if (!time) cut(R('в\\s+полдень'), () => { time = '12:00'; });
  if (!time) cut(R('(?:в|к)\\s+' + T + '(?:\\s*(?:час(?:а|ов)?|ч))?(?:\\s+(утра|дня|вечера|ночи))?'), m => { const t = tm(m[2], m[3], m[4]); if (!t) return false; time = t; });
  if (!date) cut(R('(\\d{1,2})\\s+(' + MON_RE + ')(?:\\s+(\\d{4}))?'), m => {
    const mo = ['янв','фев','мар','апр','ма','июн','июл','авг','сен','окт','ноя','дек'].findIndex(p => m[3].toLowerCase().startsWith(p)), d = Number(m[2]);
    if (mo < 0 || d < 1 || d > 31) return false;
    let y = m[4] ? Number(m[4]) : now.getFullYear(), k = ds(new Date(y, mo, d));
    if (!m[4] && k < today) k = ds(new Date(y + 1, mo, d));
    date = k; });
  if (!date) cut(R('(\\d{1,2})\\.(\\d{1,2})(?:\\.(\\d{2,4}))?'), m => {
    const d = Number(m[2]), mo = Number(m[3]) - 1; if (d < 1 || d > 31 || mo < 0 || mo > 11) return false;
    let y = m[4] ? Number(m[4].length === 2 ? '20' + m[4] : m[4]) : now.getFullYear(), k = ds(new Date(y, mo, d));
    if (!m[4] && k < today) k = ds(new Date(y + 1, mo, d));
    date = k; });
  if (!time) cut(R('(\\d{1,2}):(\\d{2})'), m => { const t = tm(m[2], m[3]); if (!t) return false; time = t; });
  cut(R('на\\s+(полчаса|час|(\\d+(?:[.,]\\d+)?)\\s*(час(?:а|ов)?|ч|минут[уы]?|мин|м))'), m => {
    const w = m[2].toLowerCase(); dur = w === 'полчаса' ? 30 : w === 'час' ? 60 : Math.round(parseFloat(m[3].replace(',', '.')) * (/^ч/i.test(m[4]) ? 60 : 1));
    if (!(dur > 0)) return false; });
  if (time && !time2 && dur) time2 = fmtMin(Math.min(1439, timeMin(time) + dur));
  if (time && !date) date = base || today;
  const title = s.replace(/\s+/g, ' ').trim().replace(/^[,;.\-–—]+\s*|\s*[,;\-–—]+$/g, '').replace(/\s+(в|во|на|с|к)$/i, '');
  const found = !!(date || time || catId);
  const parts = [];
  if (date) parts.push(relDay(date));
  if (time) parts.push(time + (time2 ? '–' + time2 : ''));
  if (catId) parts.push(cat(catId).name);
  return { title, date, time, time2, cat:catId, found, desc: parts.join(' · ') };
}
