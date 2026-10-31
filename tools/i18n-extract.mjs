// Русские фразы из js/*.js для словаря английского (js/en-dict.js).
// Разбирает код по-настоящему: строки и шаблоны `...${...}...` (подстановка становится «*»), HTML-теги режут фразу, комментарии и регулярки пропускаются.
// Запуск: node tools/i18n-extract.mjs            — показать, чего нет в словаре
//         node tools/i18n-extract.mjs out.json   — записать все фразы в файл
import fs from 'fs';
const SKIP = new Set(['admin.js', 'names.js', 'en.js', 'en-dict.js']);   // админка — для владельца, names.js — список запретных слов
const CYR = /[А-Яа-яЁё]/;
function phrases(src) {
  const out = []; let i = 0, prev = '';
  const add = t => { for (const m of t.matchAll(/(?:title|aria-label|placeholder|alt)=\\?"([^"]*)"/g)) if (CYR.test(m[1])) out.push(m[1].replace(/\\$/, '').replace(/\s+/g, ' ').trim()); addT(t); };
  const addT = t => t.split(/<[^>]*>/).forEach(p => { p = p.replace(/\\n/g, ' ').replace(/\\(['"`])/g, '$1').replace(/\s+/g, ' ').trim(); if (CYR.test(p)) out.push(p); });
  const str = q => { let b = ''; i++; while (i < src.length && src[i] !== q && src[i] !== '\n') { if (src[i] === '\\') { b += src[i] + src[i + 1]; i += 2; continue; } b += src[i++]; } i++; add(b); };
  function tpl() { let b = ''; i++;
    while (i < src.length) { const c = src[i];
      if (c === '\\') { b += src[i] + src[i + 1]; i += 2; continue; }
      if (c === '`') { i++; break; }
      if (c === '$' && src[i + 1] === '{') { i += 2; code(1); b += '*'; continue; }
      b += c; i++; }
    add(b); }
  function code(depth) { let d = depth;
    while (i < src.length) { const c = src[i], n = src[i + 1];
      if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
      if (c === '/' && n === '*') { i = src.indexOf('*/', i) + 2; continue; }
      if (c === "'" || c === '"') { str(c); prev = 's'; continue; }
      if (c === '`') { tpl(); prev = 's'; continue; }
      if (c === '/') {   // регулярка, если перед ней не значение
        if (!/[\w)\]s]/.test(prev)) { i++; let cls = false; while (i < src.length && (src[i] !== '/' || cls) && src[i] !== '\n') { if (src[i] === '\\') i++; else if (src[i] === '[') cls = true; else if (src[i] === ']') cls = false; i++; } i++; while (/[a-z]/.test(src[i] || '')) i++; prev = 's'; continue; } }
      if (c === '{') d++;
      if (c === '}') { d--; if (depth && d === 0) { i++; return; } }
      if (!/\s/.test(c)) prev = /[\w$]/.test(c) ? 'x' : c;
      if (/[a-zA-Z_$]/.test(c)) { let w = ''; while (/[\w$]/.test(src[i] || '')) w += src[i++]; prev = w === 'return' ? '(' : 'x'; continue; }
      i++; } }
  code(0);
  return out;
}
const all = {}, seen = new Set();
for (const f of fs.readdirSync('js').filter(x => x.endsWith('.js') && !SKIP.has(x))) {
  all[f] = [...new Set(phrases(fs.readFileSync('js/' + f, 'utf8').replace(/\r/g, '')))].filter(p => !seen.has(p) && seen.add(p));
}
if (process.argv[2]) { fs.writeFileSync(process.argv[2], JSON.stringify(all)); }
let dict = {}; try { dict = JSON.parse(fs.readFileSync('js/en-dict.js', 'utf8').replace(/^[\s\S]*?const EN_DICT = /, '').replace(/;\s*$/, '')); } catch (e) {}
let n = 0, chars = 0, miss = 0;
for (const f in all) { const m = all[f].filter(p => dict[p] == null); n += all[f].length; chars += all[f].join('').length; miss += m.length; console.log(f, all[f].length, m.length ? 'нет в словаре: ' + m.length : ''); }
console.log('всего', n, 'фраз,', chars, 'знаков; без перевода:', miss);
