// Проверка недоступных имён и ников (js/names.js): node tools/test-names.mjs
// Плохие должны ловиться, обычные имена и слова с «опасными» кусками (барсук, хлебать, Херсон, Yamashita) — проходить.
// Меняете списки в names.js — запускайте; нашли новое ложное срабатывание — добавьте его в GOOD
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'js', 'names.js'), 'utf8').replace(/\r\n/g, '\n');
const core = src.split('// ---- Поле ввода')[0];
const { nameBad } = new Function(core + '\nreturn { nameBad };')();

const RUDE = ['хуй', 'Хуйло', 'ХУЙ', 'х.у.й', 'х у й', 'хууууй', 'xyй', 'xyi', 'huy', 'hui', 'pohuy', 'nahui', 'xuesos', 'пизда', 'pizda', 'p1zda', 'п1зда', 'pizdec', 'Pi3dec',
  'ебать', 'ебанат', 'yebat', 'eblan', 'Ebanko', 'заебал', 'долбоёб', 'dolboeb', 'блядь', 'blyad', 'blyat', '6лядь', 'бля', 'сука', 'cyka', 'suka', 'suka228', 'сукин сын',
  'мудак', 'mudak', 'пидор', 'pidor', 'pidaras', 'Nikita_pidor', 'педик', 'гандон', 'gondon', 'шлюха', 'shlyuha', 'залупа', 'zalupa', 'говно', 'govno', 'говнюк', 'жопа', 'zhopa', 'jopa',
  'дрочер', 'засранец', 'ублюдок', 'ublyudok', 'ниггер', 'nigger', 'nigga', 'гитлер', 'hitler', 'слава_гитлеру', 'нацист', 'fashist', '1488', '14_88',
  'fuck', 'fuuuck', 'f.u.c.k', 'FuckYou', 'bullshit', 'shithead', 'bitch', 'asshole', 'motherfucker', 'cunt', 'pussy', 'BigDick', 'cock', 'nazi'];
const RESERVED = ['admin', 'Admin', 'administrator', 'админ', 'Администратор', 'BigAdmin', 'moderator', 'модератор', 'support', 'Parsimony', 'parsimony_official', 'parsimony.team',
  'official', 'root', 'null', 'поддержка'];
const GOOD = ['Глеб', 'Аня', 'Александр', 'Мария', 'Аманда', 'Барсук', 'барсуки', 'Сабля', 'рубля', 'команда', 'мандарин', 'Хлеб', 'хлебать', 'колебаться', 'требую', 'гребу', 'небу',
  'страхую', 'психую', 'педикюр', 'Херсон', 'Сукачёв', 'Ника Сукачева', 'Упорный', 'спорный', 'Спидран', 'Хулиган', 'Трахея', 'Страхов', 'Хачапури', 'Жидкость', 'Негрони', 'Нигерия',
  'Чуркин', 'Шерхан', 'мохер', 'Анна Хуторская', 'Ёжик', 'Йога', 'Сергей', 'канал', 'Вероника', 'Сабина', 'Хуан', 'бадминтон', 'Психолог',
  'Hera', 'Suki', 'hachi', 'hachiko', 'Yamashita', 'Kinoshita', 'Scunthorpe', 'Dickens', 'Hancock', 'Hitchcock', 'peacock', 'cockatoo', 'badminton', 'modern', 'moderato',
  'sasha', 'nastya', 'katya', 'vlad_2006', 'dimon', 'kirill.k', 'max.power', 'pedro', 'pizza', 'gandalf', 'gondor', 'gondola', 'shrek', 'joker', 'panda', 'spider', 'spiderman',
  'sebastian', 'debian', 'kebab', 'zebra', 'ebola', 'lebedev', 'rebecca', 'assassin', 'analyst', 'supersonic', 'marina', 'Joplin', 'uporniy', 'Huey', 'hugo', 'ruby', 'sukhoi', 'admiral', ''];

let bad = 0;
const ok = (c, msg) => { if (!c) { bad++; console.log('ОШИБКА:', msg); } };
RUDE.forEach(s => ok(nameBad(s) === 'rude', `«${s}» должно быть недоступно (грубое), а вышло «${nameBad(s)}»`));
RESERVED.forEach(s => ok(nameBad(s) === 'reserved', `«${s}» должно быть недоступно (служебное), а вышло «${nameBad(s)}»`));
GOOD.forEach(s => ok(nameBad(s) === '', `«${s}» должно быть можно, а вышло «${nameBad(s)}»`));
console.log(bad ? `есть ошибки: ${bad}` : `Имена и ники: всё прошло (${RUDE.length + RESERVED.length} недоступных, ${GOOD.length} обычных)`);
process.exitCode = bad ? 1 : 0;
