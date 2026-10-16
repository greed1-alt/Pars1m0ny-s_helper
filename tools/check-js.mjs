// Проверка скриптов приложения перед выкладкой: node tools/check-js.mjs
// 1) каждый файл без синтаксических ошибок; 2) все файлы вместе, в порядке index.html, — тоже. У скриптов общие глобальные
// переменные, и одинаковое имя (let/const) в двух файлах ломает загрузку второго целиком — так 17 октября 2026 новая переменная
// подсказок tipAt совпала с функцией tipAt в charts.js, и графики перестали грузиться.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'fs';
import { execFileSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), TMP = mkdtempSync(join(tmpdir(), 'pj-'));
const files = [...readFileSync(join(ROOT, 'index.html'), 'utf8').matchAll(/<script src="(js\/[\w-]+\.js)"><\/script>/g)].map(m => m[1]);
const check = f => { try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); return ''; } catch (e) { return String(e.stderr || e.message).split('\n').slice(0, 6).join('\n'); } };
let bad = 0;
for (const f of [...files, 'sw.js']) { const err = check(join(ROOT, f)); if (err) { bad++; console.log('ОШИБКА в', f, '\n' + err); } }
const all = join(TMP, 'all.js'); writeFileSync(all, files.map(f => readFileSync(join(ROOT, f), 'utf8')).join('\n;\n'));
const err = check(all); if (err) { bad++; console.log('ОШИБКА, когда файлы вместе (скорее всего, одно имя объявлено в двух файлах):\n' + err); }
rmSync(TMP, { recursive: true, force: true });
console.log(bad ? 'есть ошибки' : `Скрипты в порядке: ${files.length} файлов по отдельности и вместе`);
process.exitCode = bad ? 1 : 0;
