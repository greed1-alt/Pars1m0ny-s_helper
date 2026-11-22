// ---- «Жидкое стекло»: преломление края (22 ноября 2026) ----
// У тем «Жидкое стекло» (css/glass.css) край карточки, как линза, изгибает фон под ней. Карта смещения — по закону Снеллиуса
// для скруглённого края (как в Glisse, MIT, https://github.com/0kzh/glisse — selectionMaps в refraction.ts), подставляется
// в backdrop-filter через --glf. Фильтры SVG на фоне умеет только Chromium (Chrome, Edge); Safari и iPhone — без преломления,
// у них матовое стекло и свет по краю. Только на ПК (от 900 px): на телефонах с Android это лишняя нагрузка.
(() => {
  if (!/Chrom(e|ium)\//.test(navigator.userAgent)) return;
  const wide = matchMedia('(min-width:900px)'), SEL = '.card,.fold.fc,.gl-card,.missbar,.demobar,.wkside,.ts-hero,#tinv';
  const NS = 'http://www.w3.org/2000/svg', maps = new Map();
  let box = null, raf = 0;
  const on = () => wide.matches && (document.documentElement.dataset.skin || '').startsWith('gl-');
  const mk = (n, a) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); return e; };
  const lim = (v, a, b) => Math.min(b, Math.max(a, v));
  // Насколько сдвигается луч на краю: стекло с показателем 1,5, край — «сквиркл»
  function bend(bezel, thick) {
    const s = new Float32Array(96); let max = 0;
    for (let i = 0; i < s.length; i++) {
      const t = Math.max(0.001, i / (s.length - 1)), surf = (1 - (1 - t) ** 4) ** 0.25;
      const inc = Math.atan((1 - t) ** 3 / surf ** 3), ref = Math.asin(Math.sin(inc) / 1.5);
      s[i] = Math.tan(inc - ref) * (thick + surf * bezel); max = Math.max(max, s[i]);
    }
    return { s, max };
  }
  // Фильтр для карточки w×h со скруглением r (один на каждый размер)
  function lens(w, h, r) {
    const key = w + 'x' + h + 'x' + r; if (maps.has(key)) return maps.get(key);
    const m = Math.min(w, h), bezel = lim(m * 0.22, 6, 26), { s, max } = bend(bezel, lim(m * 0.3, 10, 36));
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const cx = cv.getContext('2d'), img = cx.createImageData(w, h), d = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const px = x + 0.5 - w / 2, py = y + 0.5 - h / 2, qx = Math.abs(px) - (w / 2 - r), qy = Math.abs(py) - (h / 2 - r);
      const ox = Math.max(qx, 0), oy = Math.max(qy, 0), len = Math.hypot(ox, oy), dist = r - (len + Math.min(Math.max(qx, qy), 0));
      const nx = len > 0 ? ox / len * Math.sign(px) : qx > qy ? Math.sign(px) : 0, ny = len > 0 ? oy / len * Math.sign(py) : qx > qy ? 0 : Math.sign(py);
      let sh = 0; if (dist >= 0 && dist < bezel) { const p = dist / bezel * (s.length - 1), lo = Math.floor(p), a = s[lo], b = s[Math.min(lo + 1, s.length - 1)]; sh = a + (b - a) * (p - lo); }
      const i = (y * w + x) * 4; d[i] = Math.round(127.5 + nx * sh / max * 127.5); d[i + 1] = Math.round(127.5 + ny * sh / max * 127.5); d[i + 2] = 128; d[i + 3] = 255;
    }
    cx.putImageData(img, 0, 0);
    if (!box) { box = mk('svg', { width: 0, height: 0, 'aria-hidden': 'true', style: 'position:absolute;width:0;height:0;pointer-events:none' }); document.body.appendChild(box); }
    const id = 'glf' + maps.size, f = mk('filter', { id, x: 0, y: 0, width: w, height: h, filterUnits: 'userSpaceOnUse', primitiveUnits: 'userSpaceOnUse', 'color-interpolation-filters': 'sRGB' });
    f.append(mk('feImage', { href: cv.toDataURL(), x: 0, y: 0, width: w, height: h, preserveAspectRatio: 'none', result: 'm' }),
      mk('feDisplacementMap', { in: 'SourceGraphic', in2: 'm', scale: max * 2, xChannelSelector: 'R', yChannelSelector: 'G' }));
    box.appendChild(f);
    const u = `url(#${id})`; maps.set(key, u); return u;
  }
  function fit() {
    if (!on()) return;
    for (const e of document.querySelectorAll(SEL)) {
      const w = Math.round(e.offsetWidth), h = Math.round(e.offsetHeight); if (!w || !h || w * h > 1200 * 1600) continue;
      const k = w + 'x' + h; if (e.dataset.glk === k) continue; e.dataset.glk = k;
      const r = Math.round(Math.min(w / 2, h / 2, parseFloat(getComputedStyle(e).borderTopLeftRadius) || 0));
      e.style.setProperty('--glf', lens(w, h, r));
    }
  }
  const later = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => setTimeout(fit, 30)); };
  const start = () => { new MutationObserver(later).observe(document.body, { childList: true, subtree: true }); new MutationObserver(later).observe(document.documentElement, { attributes: true, attributeFilter: ['data-skin'] }); addEventListener('resize', later); later(); };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
