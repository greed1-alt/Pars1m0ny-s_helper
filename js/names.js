// ---- Недоступные имена и ники (просьба пользователя 18 октября 2026: «чеклист недоступных ников — матерные и подобные») ----
// nameBad(текст): '' — можно; 'rude' — мат, оскорбления, экстремизм; 'reserved' — похоже на служебное (admin, Parsimony, поддержка).
// Текст приводится к одному виду: регистр, ё → е, й → и, без ь и ъ; латиница-двойники (xyй, cyka); транслит (huy, blyat, pizda);
// цифры и знаки вместо букв (3 → з, 0 → о, 6 → б, @ → а); разделители (х.у.й, х у й); повторы (хууууй).
// Слова-исключения (NB_SAFE: хлеб, колебаться, требую, педикюр, бадминтон…) не считаются — иначе «хлебать» попало бы под «ебат».
// Короткие и многозначные слова (сука — «барсука», бля — «рубля», хер — «Херсон») проверяются только отдельным словом.
// Проверяется: имя и ник в профиле, имя в знакомстве и подпись в «Поделиться». Уже сохранённые имена не трогаются: ошибка
// проверки молча стёрла бы чьё-то настоящее имя. Сейчас имя и ник хранятся только у самого человека; когда появятся друзья
// и страницы по нику — ту же проверку (и уникальность ника) нужно сделать на сервере. Тест: node tools/test-names.mjs
// Слова — в нормальном виде: без ё, й, ь, ъ
const NB_ANY = [
  // мат и производные
  'хуи', 'хуе', 'хуя', 'хую', 'пизд', 'пезд', 'ебан', 'ебат', 'ебал', 'ебаш', 'ебну', 'ебуч', 'ебет', 'ебис', 'ебош', 'ебло', 'еблан', 'уеб', 'заеб', 'выеб', 'наеб', 'поеб', 'отеб', 'разеб', 'долбое', 'долбае',
  'бляд', 'блят', 'мудак', 'мудил', 'мудач', 'залуп', 'мандавош', 'гандон', 'гондон', 'шлюх', 'шлух', 'шалав', 'херня', 'нахер', 'похер',
  // грубое и оскорбления
  'пидор', 'пидар', 'пидр', 'педераст', 'педрил', 'педик', 'говн', 'дермо', 'дроч', 'сран', 'ублюд', 'жоп', 'минет', 'порн', 'трахат', 'трахал', 'трахну', 'трахни', 'ниггер',
  // экстремизм
  'гитлер', 'нацист', 'фашист', 'зигхаил', 'террорист',
  // английские
  'fuck', 'bullshit', 'bitch', 'asshole', 'whore', 'slut', 'porn', 'penis', 'retard', 'faggot', 'motherf', 'nigger', 'nigga', 'hitler', 'siegheil',
];
const NB_START = ['бля', 'cunt', 'pussy', 'twat', 'shit', 'wank'];   // с этого начинается слово (shit — не внутри: Yamashita, Kinoshita)
const NB_EXACT = ['сука', 'сукин', 'сучка', 'сучара', 'сучонок', 'жид', 'жиды', 'чурка', 'чурки', 'негр', 'негры', 'хач', 'игил',
  'cock', 'dick', 'fag', 'nazi', 'nazis'];   // только отдельным словом; без «суки», «хера», «хачи» — транслитом это Suki, Hera, Hachi
// служебное: так могут называть себя только сам Parsimony и его поддержка
const NB_RES_ANY = ['админ', 'admin', 'модератор', 'moderator', 'поддержк', 'support', 'парсимон', 'parsimony', 'официальн', 'official'];
const NB_RES_EXACT = ['root', 'system', 'null', 'undefined', 'mod', 'moder', 'модер'];
// безобидные слова, внутри которых есть грубый корень (убираются перед проверкой)
const NB_SAFE = ['хлеб', 'колеб', 'треб', 'греб', 'скреб', 'стеб', 'небу', 'страху', 'психу', 'педикюр', 'педикул', 'спидр', 'упорн', 'спорн', 'жоплин', 'бадминтон', 'badminton', 'huey', 'uporn', 'sporn'];
// латиница и цифры, похожие на русские буквы (xyй, cyka, 6ля, п1зда)
const NB_VIS = { a:'а', b:'в', c:'с', e:'е', h:'н', k:'к', m:'м', i:'и', n:'п', o:'о', p:'р', r:'г', t:'т', u:'и', x:'х', y:'у', 0:'о', 1:'и', 3:'з', 4:'ч', 6:'б', '@':'а', $:'с' };
// транслит (huy, blyat, pizda, zhopa): сначала сочетания, потом буквы
const NB_DI = { shch:'щ', sch:'щ', sh:'ш', ch:'ч', zh:'ж', kh:'х', ts:'ц', ya:'я', yu:'ю', yo:'е', ye:'е', ja:'я', ju:'ю' };   // без jo: jopa — это «жопа»
const NB_DI_RE = new RegExp(Object.keys(NB_DI).join('|'), 'g');
const NB_TR = { a:'а', b:'б', v:'в', g:'г', d:'д', e:'е', z:'з', i:'и', j:'ж', k:'к', l:'л', m:'м', n:'н', o:'о', p:'п', r:'р', s:'с', t:'т', u:'у', f:'ф', h:'х', c:'ц', x:'х', y:'и', w:'в', q:'к',
  0:'о', 1:'и', 3:'з', 4:'ч', 6:'б', '@':'а', $:'с' };
// Варианты одного слова: как есть (латиница — для английских слов), двойники, транслит; каждый — с повторами букв и без, с цифрами и без
const nbSafe = x => { NB_SAFE.forEach(w => { x = x.split(w).join(' '); }); return x; };
function nbForms(s) {
  const out = new Set(); s = nbSafe(s);   // исключения — и до транслита (huey), и после (hleb → хлеб)
  [s, s.replace(/./g, c => NB_VIS[c] || c), s.replace(NB_DI_RE, d => NB_DI[d]).replace(/./g, c => NB_TR[c] || c)].forEach(x => {
    x = nbSafe(x.replace(/[ьъ]/g, ''));
    [x, x.replace(/(.)\1+/g, '$1')].forEach(y => { out.add(y); out.add(y.replace(/[^a-zа-я ]/g, '')); });
  });
  return [...out];
}
function nameBad(raw) {
  const low = String(raw || '').replace(/([a-zа-яё])([A-ZА-ЯЁ])/g, '$1 $2').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');   // BigAdmin → big admin; й → и, ё → е
  const toks = low.split(/[^a-zа-я0-9@$]+/).filter(Boolean); if (!toks.length) return '';
  const whole = nbForms(toks.join('')), words = [...new Set([...toks.flatMap(nbForms), ...whole].flatMap(f => f.split(' ')).filter(Boolean))];
  const has = L => whole.some(f => L.some(w => f.includes(w)));
  if (has(NB_ANY) || low.replace(/[^0-9]/g, '').includes('1488') || words.some(w => NB_EXACT.includes(w) || NB_START.some(p => w.startsWith(p)))) return 'rude';
  if (has(NB_RES_ANY) || words.some(w => NB_RES_EXACT.includes(w))) return 'reserved';
  return '';
}
// Админы (сам Parsimony) могут брать служебные имена и ники; грубые — никто. Кто админ, решает сервер (таблица admins,
// supabase/sql/friends.sql) — здесь только чтобы приложение не мешало. Ставит friends.js
let NAME_ADMIN = false;
const nameBadMsg = (s, nick) => { const r = nameBad(s); return !r || (r === 'reserved' && NAME_ADMIN) ? '' : (nick ? 'Такой ник недоступен' : 'Такое имя недоступно')
  + (r === 'rude' ? ' — в нём грубое или оскорбительное слово' : ' — похоже на служебное (admin, Parsimony, поддержка)'); };

// ---- Поле ввода: подсказка прямо под полем, пока человек печатает (поля с data-nchk="name" или "nick") ----
function nameNote(t, msg) {
  let n = t.nextElementSibling;
  if (!n || !n.classList.contains('name-bad')) { if (!msg) return; n = document.createElement('small'); n.className = 'name-bad'; n.setAttribute('aria-live', 'polite'); t.after(n); }
  n.textContent = msg; n.hidden = !msg; t.setAttribute('aria-invalid', msg ? 'true' : 'false');
}
document.addEventListener('input', e => { const t = e.target, k = t.dataset && t.dataset.nchk; if (k) nameNote(t, nameBadMsg(t.value, k === 'nick')); });
