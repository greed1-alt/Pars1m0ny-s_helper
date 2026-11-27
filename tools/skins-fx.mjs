// Живые фоны и «фишки» особых тем (26 ноября 2026; пользователь: «подделать особые темы, а точнее их задний план… разнообразить, добавить фишек»).
// Собирает блок между метками FX в css/skins.css: второй слой фона (html::after, у Синего чертежа и Пикселей ещё body::after — над основным фоном, кроме тура) — движение
// и новые детали, и эффекты на отметку «сделано» (.skb-*, их создаёт skinFx в js/look.js). Запуск: node tools/skins-fx.mjs
// Движется только transform / opacity (видеокарта, без перерисовки), «уменьшить движение» в телефоне — всё стоит.
import fs from 'fs';
const F = 'css/skins.css', A = '/* ==== FX: живые фоны и фишки — собирает tools/skins-fx.mjs, руками не править ==== */', B = '/* ==== FX end ==== */';
const uri = s => 'url("data:image/svg+xml,' + encodeURIComponent(s.replace(/\s+/g, ' ').replace(/> </g, '><').trim()) + '")';
const svg = (w, h, body, extra = '') => `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'${extra}>${body}</svg>`;
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const R = (a, b) => a + rnd() * (b - a), f1 = n => Math.round(n * 10) / 10;
const gear = (cx, cy, ro, ri, n, hub) => {
  const p = []; for (let i = 0; i < n * 4; i++) { const a = (i / (n * 4)) * Math.PI * 2, r = i % 4 < 2 ? ro : ri; p.push(f1(cx + r * Math.cos(a)) + ' ' + f1(cy + r * Math.sin(a))); }
  return `<path d='M${p.join('L')}Z'/><circle cx='${cx}' cy='${cy}' r='${hub}'/><circle cx='${cx}' cy='${cy}' r='${f1(hub / 2.4)}'/>`;
};
const star = (cx, cy, ro, ri, n) => { const p = []; for (let i = 0; i < n * 2; i++) { const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? ri : ro; p.push(f1(cx + r * Math.cos(a)) + ',' + f1(cy + r * Math.sin(a))); } return p.join(' '); };

// ---- Жар: искры поднимаются ----
seed = 11; let s = '';
for (let i = 0; i < 26; i++) { const x = f1(R(6, 294)), y = f1(R(6, 394)), r = f1(R(.9, 3.2)); s += i % 5 === 0 ? `<ellipse cx='${x}' cy='${y}' rx='${f1(r * .45)}' ry='${f1(r * 2.2)}' fill='url(#s)' opacity='${f1(R(.5, .9))}'/>` : `<circle cx='${x}' cy='${y}' r='${r}' fill='url(#s)' opacity='${f1(R(.45, 1))}'/>`; }
const EMBER = svg(300, 400, `<defs><radialGradient id='s'><stop offset='0' stop-color='#fff3c4'/><stop offset='.4' stop-color='#ffb347'/><stop offset='1' stop-color='#ff5a24' stop-opacity='0'/></radialGradient></defs>${s}`);
// ---- Кислота: пузырьки всплывают ----
seed = 23; s = '';
for (let i = 0; i < 20; i++) { const x = f1(R(8, 252)), y = f1(R(8, 512)), r = f1(R(2, 9)); s += `<circle cx='${x}' cy='${y}' r='${r}' fill='rgba(200,255,46,.06)' stroke='rgba(200,255,46,.42)' stroke-width='1.1'/>` + (r > 4 ? `<circle cx='${f1(x - r * .35)}' cy='${f1(y - r * .35)}' r='${f1(r * .22)}' fill='rgba(240,255,190,.55)'/>` : ''); }
const ACID = svg(260, 520, s);
// ---- Сладость: посыпка падает ----
seed = 5; s = ''; const SPR = ['#ff7a6b', '#ffd166', '#7bdff2', '#b388eb', '#ffffff', '#f9a8d4'];
for (let i = 0; i < 26; i++) { const x = f1(R(8, 312)), y = f1(R(8, 632)), a = Math.round(R(0, 180)); s += `<rect x='${x}' y='${y}' width='11' height='3.6' rx='1.8' fill='${SPR[i % SPR.length]}' opacity='.75' transform='rotate(${a} ${f1(x + 5.5)} ${f1(y + 1.8)})'/>`; }
s += `<circle cx='60' cy='120' r='5' fill='#fff' opacity='.7'/><circle cx='250' cy='460' r='4' fill='#ffd166' opacity='.7'/>`;
const CANDY = svg(320, 640, s);
// ---- Чертёж: пометки циркулем и размерами (коралловые) ----
const CRAFT = svg(560, 760, `<g fill='none' stroke='#c83a1a' stroke-opacity='.3' stroke-width='1.2'>
  <circle cx='430' cy='150' r='46'/><path d='M366 150h128M430 86v128' stroke-dasharray='10 3 2 3'/>
  <path d='M60 230 A120 120 0 0 1 220 110' stroke-dasharray='5 4'/><path d='M140 250l-6 -10M140 250l10 -4'/><circle cx='140' cy='250' r='2.5'/>
  <path d='M80 520h220M80 512v16M300 512v16M80 520l9 -4v8zM300 520l-9 -4v8z'/>
  <path d='M380 600l150 0M380 600l130 -75'/><path d='M450 600 A70 70 0 0 0 441 565'/>
  <circle cx='110' cy='690' r='16'/><path d='M126 690h70M186 682l10 8-10 8'/>
  <path d='M470 300v120M462 300h16M462 420h16'/></g>
  <g fill='#c83a1a' fill-opacity='.4' font-family='ui-monospace,Menlo,Consolas,monospace' font-size='13'>
  <text x='176' y='508'>220</text><text x='482' y='108'>R46</text><text x='484' y='362'>120</text><text x='520' y='585'>30°</text><text x='104' y='695'>A</text><text x='206' y='695'>A-A</text><text x='330' y='206'>Ø92</text></g>`);
// ---- Синий чертёж: шестерня, гайка, узел (белые) ----
const BLUE = svg(640, 900, `<g fill='none' stroke='#fff' stroke-opacity='.15' stroke-width='1.3'>${gear(160, 190, 72, 60, 12, 24)}
  <circle cx='480' cy='430' r='62'/><circle cx='480' cy='430' r='40'/><path d='M400 430h160M480 350v160' stroke-dasharray='12 4 2 4'/>
  <path d='M${star(150, 660, 48, 48, 3).split(' ').join('L').replace(/,/g, ' ')}Z'/><circle cx='150' cy='660' r='24'/>
  <path d='M300 830h240M300 822v16M540 822v16M300 830l10 -4v8zM540 830l-10 -4v8z'/><path d='M84 300v-60M84 240l-4 10h8z'/></g>
  <g fill='#fff' fill-opacity='.22' font-family='ui-monospace,Menlo,Consolas,monospace' font-size='13'><text x='402' y='820'>240</text><text x='548' y='372'>Ø124</text><text x='440' y='880'>SCALE 1:20</text><text x='86' y='740'>DETAIL B</text></g>`);
const GEAR = svg(280, 280, `<g fill='none' stroke='#fff' stroke-opacity='.13' stroke-width='2'>${gear(140, 140, 132, 112, 16, 46)}<circle cx='140' cy='140' r='90'/></g>`);
// ---- Тетрадь: каракули на полях (синие чернила и красный карандаш) ----
const NOTE = svg(460, 700, `<g fill='none' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.8'>
  <polyline points='${star(390, 92, 20, 8.5, 5)} ${star(390, 92, 20, 8.5, 5).split(' ')[0]}' stroke='#3a4fa8' stroke-opacity='.32'/>
  <path d='M96 300c0-6 8-8 12-3 6 7-2 17-12 15-13-2-16-19-6-27 13-10 33-3 34 15 1 22-25 32-42 20' stroke='#3a4fa8' stroke-opacity='.3'/>
  <path d='M400 432c-14-12-30 2-20 16l20 20 20-20c10-14-6-28-20-16z' stroke='#d65c4c' stroke-opacity='.38'/>
  <path d='M110 580c30-30 70-28 92-2M202 578l-2-14M202 578l-14 0' stroke='#3a4fa8' stroke-opacity='.3'/>
  <circle cx='300' cy='250' r='12' stroke='#d65c4c' stroke-opacity='.36'/><path d='M300 228v-8M300 280v-8M278 250h-8M330 250h-8M285 235l-6-6M321 271l-6-6M315 235l6-6M279 271l6-6' stroke='#d65c4c' stroke-opacity='.36'/>
  <circle cx='240' cy='648' r='17' stroke='#3a4fa8' stroke-opacity='.3'/><path d='M233 645v1M247 645v1M231 653c5 6 13 6 18 0' stroke='#3a4fa8' stroke-opacity='.3'/>
  <path d='M60 112c-12 0-14-16-2-18 1-12 20-14 24-3 10-3 17 9 9 15 4 9-6 13-12 8-6 6-18 5-19-2z' stroke='#3a4fa8' stroke-opacity='.26'/>
  <path d='M350 590l14 14 26-30' stroke='#d65c4c' stroke-opacity='.34' stroke-width='2.2'/></g>`);
// ---- Комикс: взрывы со звуками и молния (русские и английские) ----
const comic = (w1, w2) => svg(560, 820, `<g stroke='#000' stroke-opacity='.16' stroke-width='3' stroke-linejoin='round'>
  <polygon points='${star(140, 170, 74, 46, 12)}' fill='#fff' fill-opacity='.6'/><polygon points='${star(420, 570, 84, 52, 14)}' fill='#fff' fill-opacity='.6'/>
  <path d='M470 120h60a14 14 0 0 1 14 14v30a14 14 0 0 1-14 14h-30l-14 16v-16h-16a14 14 0 0 1-14-14v-30a14 14 0 0 1 14-14z' fill='#fff' fill-opacity='.6'/>
  <path d='M120 560l-30 70h26l-14 60 52-84h-28l20-46z' fill='#ffd84d' fill-opacity='.7'/></g>
  <g font-family='Impact,Arial Black,sans-serif' font-weight='900' text-anchor='middle'>
  <text x='140' y='180' font-size='28' fill='#ff3f4f' fill-opacity='.42' transform='rotate(-10 140 170)'>${w1}</text>
  <text x='420' y='582' font-size='30' fill='#2b6bff' fill-opacity='.42' transform='rotate(8 420 570)'>${w2}</text>
  <text x='500' y='158' font-size='22' fill='#000' fill-opacity='.3'>?!</text></g>`);
// ---- Пиксели: облака (день), звёзды и луна (ночь), светлячки ----
const px = (pts, c, sz = 6) => pts.map(([x, y, w = 1, h = 1]) => `<rect x='${x * sz}' y='${y * sz}' width='${w * sz}' height='${h * sz}' fill='${c}'/>`).join('');
const cloud = (ox, oy) => px([[ox + 3, oy, 5], [ox + 1, oy + 1, 10], [ox, oy + 2, 14], [ox + 1, oy + 3, 12]], '#f2f6e2') + px([[ox + 1, oy + 4, 11]], '#cbd9a8');
const CLOUDS = svg(480, 150, cloud(4, 3) + cloud(46, 13) + cloud(68, 2).replace(/f2f6e2/g, 'e8efd2'), ` shape-rendering='crispEdges'`);
seed = 3; s = '';
for (let i = 0; i < 22; i++) { const x = Math.round(R(1, 79)) * 3, y = Math.round(R(1, 79)) * 3, b = i % 4 === 0; s += `<rect x='${x}' y='${y}' width='${b ? 4 : 2}' height='${b ? 4 : 2}' fill='#f6f1c8' opacity='${b ? .9 : .6}'/>`; }
const STARS = svg(240, 240, s, ` shape-rendering='crispEdges'`);
const MOON = svg(60, 60, px([[3, 0, 4], [1, 1, 7], [0, 2, 8], [0, 3, 6], [0, 4, 6], [0, 5, 8], [1, 6, 7], [3, 7, 4]], '#f6efc0', 6) + px([[2, 2], [5, 4], [3, 5], [6, 2]], '#d9d09a', 6), ` shape-rendering='crispEdges'`);
seed = 9; s = '';
for (let i = 0; i < 9; i++) { const x = Math.round(R(2, 76)) * 4, y = Math.round(R(2, 116)) * 4; s += `<rect x='${x}' y='${y}' width='4' height='4' fill='#e8ff7a'/><rect x='${x - 4}' y='${y}' width='12' height='4' fill='#e8ff7a' opacity='.25'/><rect x='${x}' y='${y - 4}' width='4' height='12' fill='#e8ff7a' opacity='.25'/>`; }
const FLIES = svg(320, 480, s, ` shape-rendering='crispEdges'`);

const up = (k, h) => `@keyframes ${k}{to{transform:translateY(-${h}px)}}`;
const L = 'content:"";position:fixed;left:0;right:0;z-index:-1;pointer-events:none';
const css = `${A}
/* Второй слой фона: движение и новые детали. Только в самом приложении (html[data-skin]), в предпросмотре палитры — нет */
html[data-skin=ember]::after{${L};top:0;height:calc(100% + 400px);background:${uri(EMBER)} 0 0/300px 400px;animation:skUp400 26s linear infinite,skFlick 2.6s ease-in-out infinite alternate}
html[data-skin=acid]::after{${L};top:0;height:calc(100% + 520px);background:${uri(ACID)} 0 0/260px 520px;animation:skUp520 38s linear infinite}
html[data-skin=candy]::after{${L};top:-640px;height:calc(100% + 640px);background:${uri(CANDY)} 0 0/320px 640px;animation:skDown640 46s linear infinite}
html[data-skin=techno]::after{${L};top:0;height:180px;background:linear-gradient(transparent,rgba(255,203,51,.05) 40%,rgba(255,203,51,.13) 50%,rgba(255,203,51,.05) 60%,transparent);animation:skScan 9s linear infinite}
html[data-skin=craft]::after{${L};top:0;bottom:0;background:${uri(CRAFT)} 40px 30px/560px 760px}
html[data-skin=blueprint]::after{${L};top:0;bottom:0;background:${uri(BLUE)} 20px 40px/640px 900px}
html[data-skin=blueprint]:not(.touring) body::after{content:"";position:fixed;right:-90px;bottom:70px;width:280px;height:280px;z-index:-1;pointer-events:none;background:${uri(GEAR)} center/contain no-repeat;animation:skSpin 140s linear infinite}
html[data-skin=note]::after{${L};top:0;bottom:0;background:${uri(NOTE)} 30px 20px/460px 700px}
html[data-skin=comic]::after{${L};top:0;bottom:0;background:${uri(comic('БАМ!', 'ВЖУХ!'))} 0 40px/560px 820px}
html[data-skin=comic][lang=en]::after{background-image:${uri(comic('POW!', 'ZOOM!'))}}
/* Пиксели: время суток — data-tod на <html> (js/look.js): днём облака плывут, вечером закат, ночью звёзды, луна и светлячки */
html[data-skin=pixel]::after{content:"";position:fixed;left:0;top:72px;height:150px;width:calc(100% + 480px);z-index:-1;pointer-events:none;background:${uri(CLOUDS)} 0 0/480px 150px repeat-x;opacity:.92;animation:skLeft480 80s linear infinite}
html[data-skin=pixel][data-tod=eve]:not(.touring) body::after{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;background:linear-gradient(180deg,rgba(255,150,70,.24),rgba(255,110,90,.08) 60%,transparent)}
html[data-skin=pixel][data-tod=eve]::after{opacity:.75;filter:sepia(.5) saturate(1.6) hue-rotate(-20deg)}
html[data-skin=pixel][data-tod=night]:not(.touring) body::after{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;background:${uri(MOON)} right 26px top 96px/60px 60px no-repeat,${uri(STARS)} 0 0/240px 240px,rgba(8,18,40,.5)}
html[data-skin=pixel][data-tod=night]::after{top:0;height:100%;width:auto;right:0;background:${uri(FLIES)} 0 0/320px 480px;opacity:1;animation:skBlink 3.4s ease-in-out infinite alternate}
/* Техно: приветствие иногда «глючит» */
html[data-skin=techno] .h2-greet{animation:skGlitch 7s steps(1) infinite}
/* Календарь: линии фона там мешают сетке — у Чертежа, Тетради и Синего чертежа второй слой тоже убираем */
:is(html[data-skin=craft],html[data-skin=note],html[data-skin=blueprint]):has(body[data-sec=cal])::after{display:none}
html[data-skin=blueprint]:not(.touring) body[data-sec=cal]::after{display:none}
${up('skUp400', 400)}${up('skUp520', 520)}
@keyframes skDown640{to{transform:translateY(640px)}}
@keyframes skLeft480{to{transform:translateX(-480px)}}
@keyframes skScan{from{transform:translateY(-180px)}to{transform:translateY(100vh)}}
@keyframes skSpin{to{transform:rotate(360deg)}}
@keyframes skFlick{from{opacity:.7}to{opacity:1}}
@keyframes skBlink{0%{opacity:.25}60%{opacity:.9}100%{opacity:.45}}
@keyframes skGlitch{0%,93%,100%{filter:none;transform:none}94%{filter:drop-shadow(2px 0 #ff2d55) drop-shadow(-2px 0 #00e5ff);transform:translateX(1px)}96%{filter:drop-shadow(-2px 0 #ff2d55) drop-shadow(2px 0 #00e5ff);transform:translateX(-1px)}}

/* Фишка на отметку «сделано»: у галочки — эффект темы (skinFx в js/look.js создаёт span.skb и убирает через секунду) */
.skb{position:fixed;z-index:120;pointer-events:none;width:0;height:0;transform:translate(-50%,-50%)}
.skb::before{content:"";position:absolute;left:-3px;top:-3px;width:6px;height:6px;border-radius:50%}
.skb-ember::before{background:#ffd27a;box-shadow:0 -26px 0 #ffb347,18px -18px 0 #ff7a2a,26px 0 0 #ffd27a,18px 18px 0 #ff5a24,0 26px 0 #ffb347,-18px 18px 0 #ff7a2a,-26px 0 0 #ffd27a,-18px -18px 0 #ff5a24,0 0 12px 4px rgba(255,120,40,.7);animation:skbBurst .7s ease-out forwards}
.skb-candy::before{background:#ff7a6b;border-radius:2px;box-shadow:0 -28px 0 #ffd166,20px -20px 0 #7bdff2,28px 0 0 #b388eb,20px 20px 0 #f9a8d4,0 28px 0 #ffd166,-20px 20px 0 #7bdff2,-28px 0 0 #ff7a6b,-20px -20px 0 #b388eb;animation:skbBurst .8s cubic-bezier(.2,.8,.3,1) forwards}
.skb-acid::before{left:-14px;top:-14px;width:28px;height:28px;border:3px solid #c8ff2e;background:none;box-shadow:0 0 14px #c8ff2e;animation:skbRing .65s ease-out forwards}
.skb-craft::before,.skb-blueprint::before{left:-14px;top:-14px;width:28px;height:28px;border:1.5px solid #d6401c;background:linear-gradient(#d6401c,#d6401c) center/1.5px 100% no-repeat,linear-gradient(#d6401c,#d6401c) center/100% 1.5px no-repeat;animation:skbRing .7s ease-out forwards}
.skb-blueprint::before{border-color:#fff;background:linear-gradient(#fff,#fff) center/1.5px 100% no-repeat,linear-gradient(#fff,#fff) center/100% 1.5px no-repeat}
.skb-techno::before{left:-22px;top:-8px;width:44px;height:16px;border-radius:0;background:repeating-linear-gradient(180deg,rgba(255,203,51,.9) 0 2px,transparent 2px 5px);animation:skbGlitch .5s steps(4) forwards}
.skb-comic::before,.skb-pixel::before,.skb-note::before{display:none}
.skb-comic,.skb-pixel,.skb-note{width:auto;height:auto;white-space:nowrap}
.skb-comic{font:700 20px/1 'Pangolin','Inter',sans-serif;color:#000;background:#ffd84d;border:3px solid #000;border-radius:10px;padding:6px 10px;box-shadow:3px 3px 0 #000;animation:skbPop .9s cubic-bezier(.3,1.6,.5,1) forwards}
.skb-pixel{font:400 24px/1 'Tiny5',ui-monospace,monospace;color:#0e2a12;text-shadow:2px 2px 0 #cbdb92;animation:skbRise .9s steps(6) forwards}
.skb-note{font:400 34px/1 'Caveat',cursive;color:#3a4fa8;animation:skbStar .9s ease-out forwards}
@keyframes skbBurst{from{transform:scale(.2);opacity:1}to{transform:scale(1.5);opacity:0}}
@keyframes skbRing{from{transform:scale(.3);opacity:1}to{transform:scale(2.2);opacity:0}}
@keyframes skbGlitch{0%{transform:translateX(-6px);opacity:1}50%{transform:translateX(6px)}100%{transform:translateX(0);opacity:0}}
@keyframes skbPop{0%{transform:translate(-50%,-50%) scale(.2) rotate(-12deg);opacity:0}25%{transform:translate(-50%,-140%) scale(1.1) rotate(-6deg);opacity:1}75%{opacity:1}100%{transform:translate(-50%,-170%) scale(1) rotate(-6deg);opacity:0}}
@keyframes skbRise{from{transform:translate(-50%,-60%);opacity:1}to{transform:translate(-50%,-260%);opacity:0}}
@keyframes skbStar{0%{transform:translate(-50%,-50%) scale(.3) rotate(-30deg);opacity:0}30%{transform:translate(-50%,-120%) scale(1.15) rotate(8deg);opacity:1}100%{transform:translate(-50%,-170%) scale(1) rotate(0);opacity:0}}
/* Уменьшить движение (настройка iPhone / системы): фон стоит, эффектов нет */
@media (prefers-reduced-motion:reduce){html[data-skin]::after,html[data-skin] body::after,html[data-skin] .h2-greet{animation:none!important}html[data-skin=techno]::after,.skb{display:none}}
${B}`;
let cur = fs.readFileSync(F, 'utf8'); const nl = cur.includes('\r\n') ? '\r\n' : '\n';
cur = cur.split(/\r?\n/).join('\n');
const i = cur.indexOf(A), j = cur.indexOf(B);
cur = i >= 0 && j > i ? cur.slice(0, i) + css + cur.slice(j + B.length) : cur.replace(/\n*$/, '\n\n') + css + '\n';
fs.writeFileSync(F, cur.split('\n').join(nl));
console.log('skins.css: FX', css.length, 'знаков');
