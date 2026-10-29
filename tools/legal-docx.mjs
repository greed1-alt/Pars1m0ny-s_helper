// Word-файлы документов из страниц сайта: node tools/legal-docx.mjs [папка]   (DOCX_DIR=папка, где выполнен `npm i docx`)
// Источник — текст между метками <!-- doc --> и <!-- /doc --> в privacy.html, consent.html, terms.html (и записка для юриста,
// если есть «Для юриста/zapiska.html» — она только на этом компьютере). Так сайт и Word-файлы всегда совпадают.
// Разметка источника простая: h1, p.ed (редакция), h2, p, ul > li, внутри — b и a (ссылка остаётся текстом).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = process.env.DOCX_DIR || '';
if (!dir || !existsSync(join(dir, 'node_modules', 'docx'))) { console.log('Нет библиотеки docx — задайте DOCX_DIR (папка, где выполнен npm i docx)'); process.exit(1); }
const { Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel, LevelFormat, Footer, PageNumber } = createRequire(join(dir, 'x.js'))('docx');
const out = process.argv[2] || join(root, 'Для юриста');
mkdirSync(out, { recursive: true });

const FONT = 'Times New Roman';
const ENT = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', laquo: '«', raquo: '»', mdash: '—', ndash: '–' };
const decode = s => s.replace(/&(#\d+|\w+);/g, (m, e) => e[0] === '#' ? String.fromCodePoint(+e.slice(1)) : ENT[e] ?? m);
const clean = s => decode(s.replace(/\s+/g, ' ')).trim();
// Текст с <b> — в куски с жирным; остальные теги (a, span) — только текст
function runs(html, base = {}) {
  const out = []; let bold = false;
  for (const part of html.split(/(<\/?b>)/)) {
    if (part === '<b>') { bold = true; continue; }
    if (part === '</b>') { bold = false; continue; }
    const t = decode(part.replace(/<[^>]+>/g, '').replace(/\s+/g, ' '));
    if (t) out.push(new TextRun({ text: t, bold: bold || base.bold, italics: base.italics, size: base.size, font: FONT }));
  }
  return out;
}
const trimRuns = html => html.replace(/^\s+|\s+$/g, '');
function blocks(html) {
  const body = html.slice(html.indexOf('<!-- doc -->') + 12, html.indexOf('<!-- /doc -->'));
  if (body.length < 50) throw new Error('нет меток doc');
  const res = [];
  for (const m of body.matchAll(/<(h1|h2|p|ul)(\s[^>]*)?>([\s\S]*?)<\/\1>/g)) {
    const [, tag, attrs = '', inner] = m;
    if (tag === 'ul') { for (const li of inner.matchAll(/<li>([\s\S]*?)<\/li>/g)) res.push({ t: 'li', h: trimRuns(li[1]) }); continue; }
    res.push({ t: tag === 'p' && /class="ed"/.test(attrs) ? 'ed' : tag, h: trimRuns(inner) });
  }
  return res;
}
function build(file) {
  const bl = blocks(readFileSync(file, 'utf8').replace(/\r\n/g, '\n'));
  const children = bl.map(b => {
    if (b.t === 'h1') return new Paragraph({ heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: runs(b.h, { bold: true, size: 30 }) });
    if (b.t === 'ed') return new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 360 }, children: runs(b.h, { italics: true }) });
    if (b.t === 'h2') return new Paragraph({ heading: HeadingLevel.HEADING_1, keepNext: true, spacing: { before: 300, after: 120 }, children: runs(b.h, { bold: true, size: 24 }) });
    if (b.t === 'li') return new Paragraph({ numbering: { reference: 'dash', level: 0 }, alignment: AlignmentType.JUSTIFIED, spacing: { after: 60 }, children: runs(b.h) });
    return new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 120 }, children: runs(b.h) });
  });
  const title = clean(bl[0].h.replace(/<[^>]+>/g, ''));
  return { title, doc: new Document({
    creator: 'Parsimony', title, language: 'ru-RU',
    styles: {
      default: { document: { run: { font: FONT, size: 24, language: { value: 'ru-RU' } }, paragraph: { spacing: { line: 276 } } } },
      paragraphStyles: [
        { id: 'Title', name: 'Title', basedOn: 'Normal', next: 'Normal', run: { font: FONT, size: 30, bold: true, color: '000000' } },
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 24, bold: true, color: '000000' }, paragraph: { outlineLevel: 0 } },
      ],
    },
    numbering: { config: [{ reference: 'dash', levels: [{ level: 0, format: LevelFormat.BULLET, text: '–', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 567, hanging: 283 } } } }] }] },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1701, right: 850 } } },   // A4; поля 30 / 15 / 20 / 20 мм
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 20 })] })] }) },
      children,
    }],
  }) };
}
const files = [['privacy.html', 'Политика обработки персональных данных Parsimony.docx'], ['consent.html', 'Согласие на обработку персональных данных Parsimony.docx'],
  ['terms.html', 'Пользовательское соглашение Parsimony.docx'], ['Для юриста/zapiska.html', 'Записка для юриста.docx']];
for (const [src, name] of files) {
  const p = join(root, src); if (!existsSync(p)) continue;
  const { doc } = build(p);
  writeFileSync(join(out, name), await Packer.toBuffer(doc));
  console.log('Готово:', name);
}
