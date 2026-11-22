// Темы «Жидкое стекло» (22 ноября 2026): собирает css/glass.css — обои (SVG прямо в CSS) и стекло для карточек, панелей и окон.
// Запуск: node tools/glass-build.mjs. Цвета тем (палитры) — в js/look.js (PAL, skin: 'gl-…'), преломление края в Chrome — js/glass.js.
// Образец — Glisse (https://glisse.kelvinzhang.ca, MIT): матовое стекло, свет по краю, в Chromium край стекла преломляет фон.
// Safari (iPhone) преломлять фон не умеет — там матовое стекло и свет по краю.
// Обои 1200×1200 растягиваются на экран «по большей стороне» и прижаты к верху: на телефоне видна средняя полоса (x ≈ 320…880),
// на ПК — верх (y ≈ 0…750). Важное (месяц, солнце) — там, где видно и не мешает приветствию и кольцу дня.
import fs from 'fs';
const OUT = new URL('../css/glass.css', import.meta.url);
const svgUrl = s => `url("data:image/svg+xml,${encodeURIComponent(s.replace(/\s+/g, ' ').trim()).replace(/'/g, '%27').replace(/"/g, '%22')}")`;
let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const W = (body, defs = '') => `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 1200'><defs>${defs}</defs>${body}</svg>`;

// ---- Облака, звёзды, месяц ----
const cloud = ([x, y, s, o = 1, f]) => `<g transform='translate(${x} ${y}) scale(${f ? -s : s} ${s})' opacity='${o}'><ellipse cx='0' cy='40' rx='170' ry='42' fill='url(#cl)'/><circle cx='-80' cy='20' r='58' fill='url(#cl)'/><circle cx='-10' cy='-10' r='82' fill='url(#cl)'/><circle cx='80' cy='14' r='62' fill='url(#cl)'/><circle cx='135' cy='34' r='38' fill='url(#cl)'/></g>`;
const clouds = list => `<g filter='url(#cs)'>${list.map(cloud).join('')}</g>`;
const clG = (a, b, c) => `<linearGradient id='cl' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${a}'/><stop offset='.6' stop-color='${b}'/><stop offset='1' stop-color='${c}'/></linearGradient><filter id='cs' x='-20%' y='-20%' width='140%' height='140%'><feGaussianBlur stdDeviation='3'/></filter>`;
const stars = (n, h) => Array.from({ length: n }, () => `<circle cx='${(rnd() * 1200).toFixed(0)}' cy='${(rnd() * h).toFixed(0)}' r='${(0.7 + rnd() * 1.9).toFixed(1)}' fill='#fff' opacity='${(0.3 + rnd() * 0.7).toFixed(2)}'/>`).join('');
const moon = (x, y) => `<circle cx='${x}' cy='${y}' r='190' fill='url(#mg)'/><g mask='url(#mm)'><circle cx='${x}' cy='${y}' r='62' fill='#fff4d6'/></g>`;
const moonDefs = (x, y) => `<radialGradient id='mg'><stop offset='0' stop-color='#fff1c9' stop-opacity='.45'/><stop offset='1' stop-color='#fff1c9' stop-opacity='0'/></radialGradient><mask id='mm'><circle cx='${x}' cy='${y}' r='62' fill='#fff'/><circle cx='${x + 26}' cy='${y - 18}' r='56' fill='#000'/></mask>`;

// ---- Обои ----
// Хром: жидкий металл — серебряные перетекающие волны
const chrome = W(`
<rect width='1200' height='1200' fill='url(#m0)'/>
<path d='M-100 300 C 200 120 480 420 760 260 S 1160 80 1320 200 L1320 520 C 1100 380 880 600 620 560 S 160 420 -100 600 Z' fill='url(#m1)'/>
<path d='M-100 640 C 220 500 520 780 820 640 S 1180 520 1320 600 L1320 900 C 1060 800 860 1000 560 960 S 120 820 -100 960 Z' fill='url(#m2)'/>
<path d='M-100 1000 C 240 900 560 1100 880 1000 S 1200 940 1320 980 L1320 1300 L-100 1300 Z' fill='url(#m1)'/>
<path d='M-100 300 C 200 120 480 420 760 260 S 1160 80 1320 200' fill='none' stroke='#fff' stroke-width='5' opacity='.9' filter='url(#b2)'/>
<path d='M-100 640 C 220 500 520 780 820 640 S 1180 520 1320 600' fill='none' stroke='#fff' stroke-width='5' opacity='.85' filter='url(#b2)'/>`,
`<linearGradient id='m0' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#f6f7f9'/><stop offset='.5' stop-color='#d9dce2'/><stop offset='1' stop-color='#eef0f3'/></linearGradient>
<linearGradient id='m1' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#ffffff'/><stop offset='.35' stop-color='#b9bec8'/><stop offset='.6' stop-color='#7d838f'/><stop offset='.85' stop-color='#d4d8df'/><stop offset='1' stop-color='#f4f5f7'/></linearGradient>
<linearGradient id='m2' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#fafbfc'/><stop offset='.3' stop-color='#9aa0ab'/><stop offset='.55' stop-color='#5e6470'/><stop offset='.8' stop-color='#c8ccd4'/><stop offset='1' stop-color='#ffffff'/></linearGradient>
<filter id='b2' x='-5%' y='-50%' width='110%' height='200%'><feGaussianBlur stdDeviation='2'/></filter>`);

// Небосвод · День: голубое небо, солнце, пушистые облака
const day = W(`
<rect width='1200' height='1200' fill='url(#sky)'/>
<circle cx='960' cy='170' r='260' fill='url(#sun)'/>
${clouds([[240, 230, 1.1], [900, 470, 0.9, .95], [320, 720, 1.25], [1000, 930, 1.1, .95], [150, 1100, 0.9, .9], [660, 1060, 0.75, .85], [620, 380, 0.55, .8]])}`,
`<linearGradient id='sky' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#3f8ff5'/><stop offset='.55' stop-color='#8cc6ff'/><stop offset='1' stop-color='#d4ecff'/></linearGradient>
<radialGradient id='sun'><stop offset='0' stop-color='#fffbe6'/><stop offset='.35' stop-color='#fff1b8' stop-opacity='.9'/><stop offset='1' stop-color='#fff1b8' stop-opacity='0'/></radialGradient>
${clG('#ffffff', '#f3f8ff', '#d5e5f7')}`);

// Небосвод · Закат: персиковое небо, низкое солнце, облака подсвечены снизу
const sunset = W(`
<rect width='1200' height='1200' fill='url(#sk)'/>
<circle cx='640' cy='600' r='300' fill='url(#sun)'/>
${clouds([[820, 190, 1.0, 1, 1], [400, 430, 0.8, .95], [980, 660, 1.2], [470, 860, 0.9, .95, 1], [230, 1030, 1.15], [880, 1120, 0.8, .9, 1], [160, 240, 0.7, .9]])}`,
`<linearGradient id='sk' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#ffc59a'/><stop offset='.45' stop-color='#ff9c95'/><stop offset='1' stop-color='#c58aea'/></linearGradient>
<radialGradient id='sun'><stop offset='0' stop-color='#fff5cf'/><stop offset='.3' stop-color='#ffd57a' stop-opacity='.95'/><stop offset='1' stop-color='#ffb35c' stop-opacity='0'/></radialGradient>
${clG('#fff0dc', '#ffc0a8', '#e58aa6')}`);

// Небосвод · Ночь: звёзды, месяц выглядывает из-под шапки, облака в лунном свете
const night = W(`
<rect width='1200' height='1200' fill='url(#nk)'/>${stars(110, 1000)}${moon(830, 64)}
${clouds([[520, 260, 0.9, .9, 1], [160, 540, 1.0, .9], [860, 720, 1.2, .9, 1], [420, 960, 1.1, .85], [1060, 340, 0.8, .85], [740, 1130, 0.9, .8, 1]])}`,
`<linearGradient id='nk' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#040818'/><stop offset='.55' stop-color='#0b1a40'/><stop offset='1' stop-color='#1d3570'/></linearGradient>
${moonDefs(830, 64)}${clG('#3a4f86', '#1f2d58', '#111a38')}`);

// Небосвод · Сумерки: синий час — фиолетовое небо, месяц, первые звёзды, розовые отсветы на облаках
const dusk = W(`
<rect width='1200' height='1200' fill='url(#nk)'/>${stars(60, 600)}${moon(830, 64)}
${clouds([[360, 330, 1.15, .95], [960, 560, 0.95, .95, 1], [600, 620, 0.6, .85], [220, 880, 1.0, .95, 1], [820, 1000, 1.2, .95], [480, 1150, 0.7, .9, 1], [1060, 230, 0.6, .85]])}`,
`<linearGradient id='nk' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#0d0b33'/><stop offset='.45' stop-color='#2b2378'/><stop offset='.8' stop-color='#6a46b8'/><stop offset='1' stop-color='#c879b8'/></linearGradient>
${moonDefs(830, 64)}${clG('#7f6bd0', '#4b3a99', '#2a1f63')}`);

// ---- Стекло каждой темы: заливка (gl), вложенное (gl2), блик сверху (hi), свет по краю (r1 — верх и левый край, r2 — отражение снизу справа),
// линия края (e), тень (sh), шапка и вкладки (bar), окна (sheet), размытие (blur) и насыщенность фона (sat) ----
const LIGHT = { gl:'rgba(255,255,255,.48)', gl2:'rgba(255,255,255,.48)', hi:'rgba(255,255,255,.45)', r1:'rgba(255,255,255,.95)', r2:'rgba(255,255,255,.55)', bar:'rgba(255,255,255,.42)', sheet:'rgba(250,251,253,.76)', blur:'18px', sat:'1.8' };
const DARK = { gl2:'rgba(255,255,255,.08)', hi:'rgba(255,255,255,.08)', e:'rgba(255,255,255,.07)', sh:'0 14px 34px -14px rgba(0,0,0,.7)', blur:'16px', sat:'1.6' };
const T = {
  'gl-chrome': { wp:chrome, ...LIGHT, gl:'rgba(255,255,255,.42)', sat:'1.3', e:'rgba(20,25,35,.10)', sh:'0 12px 30px -14px rgba(20,25,35,.4)' },
  'gl-day': { wp:day, ...LIGHT, e:'rgba(10,50,110,.10)', sh:'0 10px 30px -14px rgba(20,70,150,.4)' },
  'gl-set': { wp:sunset, ...LIGHT, gl:'rgba(255,247,241,.5)', gl2:'rgba(255,255,255,.45)', hi:'rgba(255,255,255,.4)', r2:'rgba(255,255,255,.5)', e:'rgba(120,40,20,.10)', sh:'0 10px 30px -14px rgba(140,40,60,.35)', bar:'rgba(255,244,236,.42)', sheet:'rgba(255,248,243,.76)' },
  'gl-night': { wp:night, ...DARK, gl:'rgba(14,22,50,.44)', r1:'rgba(255,248,225,.4)', r2:'rgba(255,248,225,.15)', bar:'rgba(10,16,40,.42)', sheet:'rgba(12,18,42,.82)' },
  'gl-dusk': { wp:dusk, ...DARK, gl:'rgba(26,20,72,.44)', hi:'rgba(255,255,255,.09)', r1:'rgba(255,235,250,.42)', r2:'rgba(255,235,250,.16)', bar:'rgba(20,16,60,.42)', sheet:'rgba(22,18,62,.82)' },
};

const G = '[data-skin^=gl-]';
const CARD = '.card,.fold.fc,.gl-card,.lk-card,.missbar,.demobar,#tinv,.wkside,.ts-hero';
const INNER = '.om-box,.h2-hab,.h2-hc,.seg2,.pill,.om-t,.btn:not(.pri),.cd-row,.t3-row,input:not([type=checkbox]):not([type=radio]):not([type=range]),select,textarea';
const RIM = 'inset 1.1px 1.3px 0 -.1px var(--glr1),inset -1px -1px 0 -.1px var(--glr2)';
const css = `/* Темы «Жидкое стекло» — Хром и набор «Небосвод» (День, Закат, Ночь, Сумерки). Файл собирает tools/glass-build.mjs — правьте там.
   Обои — --sk-bg (их рисует body::before из skins.css), стекло — переменные --gl* у каждой темы. Преломление края в Chrome — js/glass.js (--glf). */
${Object.entries(T).map(([k, t]) => `[data-skin=${k}]{--sk-bg:${svgUrl(t.wp)} 50% 0/cover no-repeat;--gl:${t.gl};--gl2:${t.gl2};--glhi:${t.hi};--glr1:${t.r1};--glr2:${t.r2};--gle:${t.e};--glsh:${t.sh};--glbar:${t.bar};--glsheet:${t.sheet};--glb:${t.blur};--gls:${t.sat}}`).join('\n')}
${G}{--r2:14px}
.pal-pv[data-skin^=gl-]{background:var(--sk-bg)}
.pal-pv[data-skin^=gl-] i{background:var(--gl);box-shadow:inset 1px 1px 0 -.2px var(--glr1),0 2px 6px rgba(0,0,0,.12)}
/* Карточки и плашки: матовое стекло — фон размыт и насыщен, сверху блик, по краю свет. Внутри стекла «страница» прозрачная */
${G} :is(${CARD}){--bg:transparent;--bg2:var(--gl2);--card:transparent;--line:var(--gle);
  background:linear-gradient(180deg,var(--glhi),transparent 46%),var(--gl)!important;border:0!important;
  -webkit-backdrop-filter:blur(var(--glb)) saturate(var(--gls));backdrop-filter:var(--glf,) blur(var(--glb)) saturate(var(--gls));
  box-shadow:${RIM},inset 0 0 0 .5px var(--gle),var(--glsh)!important}
${G} .missbar{background:linear-gradient(180deg,var(--glhi),transparent 46%),linear-gradient(90deg,color-mix(in srgb,var(--c-orange) 22%,transparent),transparent 70%),var(--gl)!important}
${G} :is(${INNER}){background:var(--gl2);border-color:transparent;box-shadow:inset 1px 1px 0 -.2px var(--glr2),inset 0 0 0 .5px var(--gle)}
${G} :is(.om-box,.sr-box) :is(input,textarea){background:none!important;box-shadow:none!important}
/* Липкие столбцы и шапки таблиц внутри стекла — непрозрачные, иначе под ними видно прокрученное */
${G} :is(.hg .sticky-col,.hg .hg-w th.sticky-col,.hg .hg-w th.hg-pc,.hg-pc,.tk-head,.wg-stickytop){background:var(--sf)}
${G} .h2-hc.on{background:color-mix(in srgb,var(--c-green,#34c759) 26%,transparent)}
${G} .om-box:focus-within{box-shadow:inset 1px 1px 0 -.2px var(--glr1),0 0 0 3px color-mix(in srgb,var(--acc) 30%,transparent)}
${G} .seg2 button.on{background:var(--gl);box-shadow:${RIM},0 2px 8px rgba(0,0,0,.12)}
${G} :is(.btn.pri,.om-go,.btn-new){background:linear-gradient(180deg,rgba(255,255,255,.28),transparent 55%),var(--acc);color:var(--accfg);border:0;box-shadow:inset 1px 1.2px 0 -.1px rgba(255,255,255,.6),inset -1px -1px 0 -.1px rgba(255,255,255,.25),0 6px 16px -6px color-mix(in srgb,var(--acc) 70%,transparent)}
${G} :is(.btn,.pill,.om-t,.om-go,.btn-new){border-radius:999px}
${G} .om-box{border-radius:999px;border:0}
${G} .om-go{border-radius:50%}
/* Шапка — полоса стекла */
${G} header{background:linear-gradient(180deg,var(--glhi),transparent),var(--glbar);border-bottom:0;-webkit-backdrop-filter:blur(22px) saturate(var(--gls));backdrop-filter:blur(22px) saturate(var(--gls));box-shadow:inset 0 -.5px 0 var(--gle)}
/* Телефон: нижние вкладки — парящая капсула, выбранная вкладка — линза */
@media(max-width:899px){
${G}{--tb:calc(76px + env(safe-area-inset-bottom))}
${G} #tabbar{left:12px;right:12px;bottom:max(10px,calc(env(safe-area-inset-bottom) - 4px));border-radius:32px;padding:5px;border:0;
  background:linear-gradient(180deg,var(--glhi),transparent 60%),var(--glbar);-webkit-backdrop-filter:blur(20px) saturate(var(--gls));backdrop-filter:var(--glf,) blur(20px) saturate(var(--gls));
  box-shadow:${RIM},inset 0 0 0 .5px var(--gle),0 12px 30px -10px rgba(0,0,0,.35)}
${G} .tb-b{border-radius:26px;height:54px}
${G} .tb-b.on{background:var(--gl2);color:var(--acc);box-shadow:inset 1px 1px 0 -.2px var(--glr1),inset -1px -1px 0 -.2px var(--glr2)}
}
/* Окна — толстое стекло */
${G} #sh{background:linear-gradient(180deg,var(--glhi),transparent 30%),var(--glsheet);-webkit-backdrop-filter:blur(30px) saturate(var(--gls));backdrop-filter:blur(30px) saturate(var(--gls));border:0;box-shadow:${RIM},0 24px 70px rgba(0,0,0,.35)}
${G} #sh :is(.card,.fold.fc){-webkit-backdrop-filter:none;backdrop-filter:none}
${G} .sh-foot{background:var(--glsheet);border-top:.5px solid var(--gle)}
${G} #sh :is(input:not([type=checkbox]):not([type=radio]):not([type=range]),select,textarea){border-radius:12px}
/* ПК: боковая панель — стекло */
@media(min-width:900px){
${G} #side{background:linear-gradient(180deg,var(--glhi),transparent 40%),var(--glbar)!important;-webkit-backdrop-filter:blur(24px) saturate(var(--gls));backdrop-filter:blur(24px) saturate(var(--gls));border-right:0!important;box-shadow:inset -.5px 0 0 var(--gle)}
}
/* «Уменьшить прозрачность» в настройках устройства — стекло почти непрозрачное */
@media(prefers-reduced-transparency:reduce){
${G} :is(${CARD},#sh,header,#tabbar,#side){-webkit-backdrop-filter:none!important;backdrop-filter:none!important;background:var(--sf)!important}
}
`;
fs.writeFileSync(OUT, css);
console.log('css/glass.css:', Math.round(css.length / 1024) + ' КБ;', Object.keys(T).map(k => k + ' ' + Math.round(svgUrl(T[k].wp).length / 1024) + ' КБ').join(', '));
