// ---- Графики ----
// Широкие графики (линии, столбики) рисуются после вставки страницы — когда известна ширина контейнера.
// В разметку кладём заготовку chartBox(spec), а drawCharts() превращает её в SVG.
// Кольца и диаграммы-«пончики» квадратные — их SVG масштабируется сам, рисуем сразу.
const CH = new Map();
let chSeq = 0;
const f1 = n => Math.round(n * 10) / 10;
const chartBox = (spec, h, label) => { const id = 'ch' + (++chSeq); CH.set(id, spec); return `<div class="chart" data-ch="${id}" style="height:${h}px" role="img" aria-label="${esc(label || '')}"></div>`; };

function drawCharts() {
  const live = new Set();
  $$('.chart[data-ch]').forEach(el => {
    const spec = CH.get(el.dataset.ch); if (!spec) return;
    live.add(el.dataset.ch);
    const w = el.clientWidth, h = el.clientHeight; if (!w) return;
    spec.w = w; spec.h = h;
    el.innerHTML = spec.kind === 'cols' ? colsSVG(spec, w, h) : lineSVG(spec, w, h);
  });
  for (const k of CH.keys()) if (!live.has(k)) CH.delete(k);
}

// Плавная линия без «выбросов» за пределы данных (монотонная кривая)
function monoPath(p) {
  const n = p.length; if (!n) return ''; if (n === 1) return `M${f1(p[0][0])},${f1(p[0][1])}`;
  const m = [], t = [];
  for (let i = 0; i < n - 1; i++) m[i] = (p[i+1][1] - p[i][1]) / (p[i+1][0] - p[i][0]);
  t[0] = m[0]; t[n-1] = m[n-2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i-1] * m[i] <= 0 ? 0 : (m[i-1] + m[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i+1] = 0; continue; }
    const a = t[i] / m[i], b = t[i+1] / m[i], s = a*a + b*b;
    if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i+1] = k * b * m[i]; }
  }
  let d = `M${f1(p[0][0])},${f1(p[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const h = (p[i+1][0] - p[i][0]) / 3;
    d += `C${f1(p[i][0] + h)},${f1(p[i][1] + t[i] * h)} ${f1(p[i+1][0] - h)},${f1(p[i+1][1] - t[i+1] * h)} ${f1(p[i+1][0])},${f1(p[i+1][1])}`;
  }
  return d;
}
// Куски без пропусков: null разрывает линию
const runs = vals => { const out = []; let cur = []; vals.forEach((v, i) => { if (v == null) { if (cur.length) out.push(cur); cur = []; } else cur.push(i); }); if (cur.length) out.push(cur); return out; };
const niceMax = v => { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))), r = v / p; return (r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10) * p; };
// Подписи оси X: не теснее ~26 px
const xTicks = (n, w) => { const step = [1, 2, 5, 7, 10].find(s => w / n * s >= 26) || 10; return [...Array(n).keys()].filter(i => i === 0 || (i + 1) % step === 0); };

function frame(spec, w, h) {
  const L = spec.left ?? 34, R = 10, T = 10, B = 22, iw = w - L - R, ih = h - T - B, n = spec.xs.length;
  const max = spec.max || 1, x = i => L + (n === 1 ? iw / 2 : iw * i / (n - 1)), y = v => T + ih - ih * Math.min(v, max) / max;
  return { L, R, T, B, iw, ih, n, max, x, y };
}
function axes(spec, F) {
  const ticks = spec.yTicks || [0, F.max / 2, F.max];
  let g = ticks.map(v => `<line class="cg" x1="${F.L}" x2="${F.L + F.iw}" y1="${f1(F.y(v))}" y2="${f1(F.y(v))}"/><text class="ct" x="${F.L - 6}" y="${f1(F.y(v) + 3.5)}" text-anchor="end">${esc(spec.yFmt ? spec.yFmt(v) : v)}</text>`).join('');
  g += xTicks(F.n, F.iw).map(i => `<text class="ct" x="${f1(F.x(i))}" y="${F.T + F.ih + 15}" text-anchor="middle">${esc(spec.xs[i])}</text>`).join('');
  return g;
}

function lineSVG(spec, w, h) {
  const F = frame(spec, w, h);
  let g = axes(spec, F);
  spec.series.forEach(s => {
    runs(s.vals).forEach(r => {
      const pts = r.map(i => [F.x(i), F.y(s.vals[i])]);
      const d = monoPath(pts);
      if (s.area && pts.length > 1) g += `<path d="${d}L${f1(pts[pts.length-1][0])},${F.T + F.ih}L${f1(pts[0][0])},${F.T + F.ih}Z" style="fill:${s.color}" opacity=".1"/>`;
      g += `<path d="${d}" fill="none" style="stroke:${s.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"${s.dim ? ' opacity=".55"' : ''}/>`;
    });
    // точка на последнем значении
    const last = s.vals.map((v, i) => v == null ? -1 : i).filter(i => i >= 0).pop();
    if (last != null && !s.dim) g += `<circle cx="${f1(F.x(last))}" cy="${f1(F.y(s.vals[last]))}" r="4" style="fill:${s.color};stroke:var(--bg)" stroke-width="2"/>`;
  });
  g += `<line class="xh" y1="${F.T}" y2="${F.T + F.ih}" x1="0" x2="0" style="opacity:0"/><g class="hd"></g>`;
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${g}<rect class="hit" x="${F.L - 6}" y="0" width="${F.iw + 12}" height="${h}" fill="transparent"/></svg>`;
}

function colsSVG(spec, w, h) {
  const F = frame(spec, w, h), slot = F.iw / F.n, bw = Math.max(2, Math.min(24, slot - 2));
  // Для столбиков X — середина ячейки, а не край
  F.x = i => F.L + slot * (i + .5);
  let g = axes(spec, F);
  spec.vals.forEach((v, i) => {
    if (!v) return;
    const x0 = F.x(i) - bw / 2, y0 = F.y(v), hh = F.T + F.ih - y0, r = Math.min(4, bw / 2, hh);
    const over = spec.ref != null && v > spec.ref;
    g += `<path d="M${f1(x0)},${F.T + F.ih}V${f1(y0 + r)}Q${f1(x0)},${f1(y0)} ${f1(x0 + r)},${f1(y0)}H${f1(x0 + bw - r)}Q${f1(x0 + bw)},${f1(y0)} ${f1(x0 + bw)},${f1(y0 + r)}V${F.T + F.ih}Z" style="fill:${over && spec.overColor ? spec.overColor : spec.color}"/>`;
  });
  if (spec.ref != null && spec.ref > 0) {
    const ry = f1(F.y(spec.ref));
    g += `<line x1="${F.L}" x2="${F.L + F.iw}" y1="${ry}" y2="${ry}" style="stroke:var(--tx2)" stroke-width="1" stroke-dasharray="4 3"/><text class="ct cref" x="${F.L + 4}" y="${ry - 5}">${esc(spec.refLabel || '')}</text>`;
  }
  g += `<rect class="xb" x="0" y="${F.T}" width="${f1(slot)}" height="${F.ih}" style="opacity:0"/>`;
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${g}<rect class="hit" x="${F.L}" y="0" width="${F.iw}" height="${h}" fill="transparent"/></svg>`;
}

// Кольцо-шкала: доля выполненного (pct 0..1)
function ringSVG(pct, size, color, center, sub) {
  const r = 42, c = 2 * Math.PI * r, p = Math.max(0, Math.min(1, pct || 0));
  const fs = String(center).length > 6 ? ' style="font-size:13px"' : String(center).length > 4 ? ' style="font-size:15px"' : '';
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="${r}" fill="none" style="stroke:var(--hov2)" stroke-width="9"/>${p > 0 ? `<circle cx="50" cy="50" r="${r}" fill="none" style="stroke:${color}" stroke-width="9" stroke-linecap="round" stroke-dasharray="${f1(c * p)} ${f1(c)}" transform="rotate(-90 50 50)"/>` : ''}<text x="50" y="${sub ? 50 : 56}" text-anchor="middle" class="rg-t"${fs}>${esc(center)}</text>${sub ? `<text x="50" y="66" text-anchor="middle" class="rg-s">${esc(sub)}</text>` : ''}</svg>`;
}
// «Пончик»: доли целого, между долями — просвет 2 px; подсказка при наведении на долю
function donutSVG(segs, size, center, sub) {
  const r = 40, c = 2 * Math.PI * r, total = segs.reduce((a, s) => a + s.val, 0);
  let off = 0, g = `<circle cx="50" cy="50" r="${r}" fill="none" style="stroke:var(--hov)" stroke-width="14"/>`;
  const parts = segs.filter(s => s.val > 0), gap = parts.length > 1 ? 1.2 : 0;
  parts.forEach(s => {
    const len = c * s.val / total;
    g += `<circle class="dseg" cx="50" cy="50" r="${r}" fill="none" style="stroke:${s.color}" stroke-width="14" stroke-dasharray="${f1(Math.max(.5, len - gap))} ${f1(c)}" stroke-dashoffset="${f1(-off)}" transform="rotate(-90 50 50)" data-tip="${esc(s.tip || s.name)}"/>`;
    off += len;
  });
  return `<svg class="donut" width="${size}" height="${size}" viewBox="0 0 100 100" role="img" aria-label="${esc(segs.map(s => s.name + ': ' + s.val).join(', '))}">${g}<text x="50" y="${sub ? 51 : 56}" text-anchor="middle" class="rg-t">${esc(center)}</text>${sub ? `<text x="50" y="64" text-anchor="middle" class="rg-s">${esc(sub)}</text>` : ''}</svg>`;
}
const legendHTML = items => `<div class="lgd">${items.map(it => `<span><i style="background:${it.color}"></i>${esc(it.name)}${it.val != null ? ` <b>${esc(it.val)}</b>` : ''}</span>`).join('')}</div>`;

// ---- Подсказка: перекрестие на линиях, наведение на столбики, доли и клетки с data-tip ----
const tipEl = document.createElement('div'); tipEl.id = 'tip'; tipEl.setAttribute('role', 'tooltip'); document.body.appendChild(tipEl);
let tipTimer;
function tipShow(x, y, title, rows) {
  tipEl.textContent = '';
  if (title) { const t = document.createElement('div'); t.className = 'tp-h'; t.textContent = title; tipEl.appendChild(t); }
  (rows || []).forEach(([color, name, val]) => {
    const r = document.createElement('div'); r.className = 'tp-r';
    if (color) { const k = document.createElement('i'); k.style.background = color; r.appendChild(k); }
    const b = document.createElement('b'); b.textContent = val; r.appendChild(b);
    if (name) { const s = document.createElement('span'); s.textContent = name; r.appendChild(s); }
    tipEl.appendChild(r);
  });
  tipEl.classList.add('show');
  const tw = tipEl.offsetWidth, th = tipEl.offsetHeight;
  let lx = x + 14, ly = y - th - 12;
  if (lx + tw > innerWidth - 8) lx = x - tw - 14;
  if (ly < 8) ly = y + 18;
  tipEl.style.left = Math.max(8, lx) + 'px'; tipEl.style.top = ly + 'px';
}
const tipHide = () => { tipEl.classList.remove('show'); $$('.chart .xh, .chart .xb').forEach(l => l.style.opacity = 0); $$('.chart .hd').forEach(g => g.innerHTML = ''); };
function tipAt(e) {
  const box = e.target.closest && e.target.closest('.chart[data-ch]');
  if (box) {
    const spec = CH.get(box.dataset.ch); if (!spec || !spec.w) return tipHide();
    const svg = box.querySelector('svg'), rect = svg.getBoundingClientRect(), F = frame(spec, spec.w, spec.h), px = e.clientX - rect.left;
    let i;
    if (spec.kind === 'cols') { const slot = F.iw / F.n; i = Math.floor((px - F.L) / slot); if (i < 0 || i >= F.n) return tipHide(); const xb = svg.querySelector('.xb'); xb.setAttribute('x', f1(F.L + slot * i)); xb.style.opacity = 1; }
    else {
      i = Math.round((px - F.L) / (F.n === 1 ? 1 : F.iw / (F.n - 1))); i = Math.max(0, Math.min(F.n - 1, i));
      const X = f1(F.x(i)), xh = svg.querySelector('.xh'); xh.setAttribute('x1', X); xh.setAttribute('x2', X); xh.style.opacity = '';
      svg.querySelector('.hd').innerHTML = spec.series.filter(s => s.vals[i] != null).map(s => `<circle cx="${X}" cy="${f1(F.y(s.vals[i]))}" r="4" style="fill:${s.color};stroke:var(--bg)" stroke-width="2"/>`).join('');
    }
    const rows = spec.kind === 'cols' ? [[spec.color, spec.name || '', spec.fmt ? spec.fmt(spec.vals[i] || 0) : spec.vals[i]]]
      : spec.series.map(s => [s.color, s.name, s.vals[i] == null ? '—' : spec.fmt ? spec.fmt(s.vals[i]) : s.vals[i]]);
    return tipShow(e.clientX, e.clientY, spec.tipTitle ? spec.tipTitle(i) : spec.xs[i], rows);
  }
  const t = e.target.closest && e.target.closest('[data-tip]');
  if (t) { const lines = t.getAttribute('data-tip').split('\n'); return tipShow(e.clientX, e.clientY, lines[0], lines.slice(1).map(l => [null, '', l])); }
  if (tipEl.classList.contains('show')) tipHide();
}
document.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') tipAt(e); });
document.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse') return;
  if (e.target.closest && e.target.closest('.chart[data-ch], [data-tip]')) { tipAt(e); clearTimeout(tipTimer); tipTimer = setTimeout(tipHide, 2600); }
  else tipHide();
});
addEventListener('scroll', () => { if (tipEl.classList.contains('show')) tipHide(); }, { passive:true, capture:true });
