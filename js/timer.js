// ---- Таймер (экспериментальный раздел): помодоро, обычный таймер, секундомер ----
// Время считается по отметкам Date.now(), поэтому не сбивается, если вкладка спала или приложение закрывали.
// Ограничение: на iPhone приложение в фоне не работает — сигнал прозвучит, когда вернётесь в приложение.
const TM_MODES = [['pomo', 'Помодоро'], ['timer', 'Таймер'], ['watch', 'Секундомер']];
const TM_PHASE = { work:['Фокус', 'var(--c-red)'], short:['Короткий перерыв', 'var(--c-aqua)'], long:['Длинный перерыв', 'var(--c-blue)'] };
const TM_PRESETS = [1, 3, 5, 10, 15, 20, 30, 45, 60];
onMigrate(() => {
  if (!S.timer || typeof S.timer !== 'object') S.timer = {};
  const t = S.timer;
  t.pomo = Object.assign({ work:25, short:5, long:15, every:4 }, t.pomo);
  if (!t.log || typeof t.log !== 'object') t.log = {};
  if (t.sound == null) t.sound = true;
  if (!t.run || typeof t.run !== 'object') t.run = { mode:'pomo', phase:'work', cycle:0, running:false, endAt:0, left:t.pomo.work * 60000, total:t.pomo.work * 60000, startAt:0, acc:0, tmin:10 };
});

const TR = () => S.timer.run;
const phaseMs = p => S.timer.pomo[p] * 60000;
const tmLeft = () => { const r = TR(); return r.running ? Math.max(0, r.endAt - Date.now()) : r.left; };
const tmWatch = () => { const r = TR(); return r.acc + (r.running ? Date.now() - r.startAt : 0); };
const fmtT = (ms, up) => { const s = up ? Math.floor(ms / 1000) : Math.ceil(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : String(m).padStart(2, '0')) + ':' + String(x).padStart(2, '0'); };
const tmText = () => TR().mode === 'watch' ? fmtT(tmWatch(), true) : fmtT(tmLeft());
const tmColor = () => { const r = TR(); return r.mode === 'pomo' ? TM_PHASE[r.phase][1] : r.mode === 'timer' ? 'var(--c-orange)' : 'var(--c-violet)'; };
const tmToday = () => S.timer.log[todayK()] || { pomos:0, mins:0 };

// Звук: включается по первому нажатию «Старт» (так требует iPhone)
let tmAudio = null;
const tmUnlock = () => { try { tmAudio = tmAudio || new (window.AudioContext || window.webkitAudioContext)(); if (tmAudio.state === 'suspended') tmAudio.resume(); } catch (e) {} };
function tmBeep() {
  if (!S.timer.sound || !tmAudio) return;
  const t0 = tmAudio.currentTime;
  [0, .32, .64].forEach(d => { const o = tmAudio.createOscillator(), g = tmAudio.createGain(); o.type = 'sine'; o.frequency.value = 880;
    g.gain.setValueAtTime(.0001, t0 + d); g.gain.exponentialRampToValueAtTime(.3, t0 + d + .02); g.gain.exponentialRampToValueAtTime(.0001, t0 + d + .26);
    o.connect(g); g.connect(tmAudio.destination); o.start(t0 + d); o.stop(t0 + d + .3); });
}

function timerHTML() {
  const r = TR(), P = S.timer.pomo, today = tmToday(), C = 2 * Math.PI * 100;
  const week = [...Array(7)].map((_, i) => S.timer.log[addDays(todayK(), -i)] || { pomos:0, mins:0 }).reduce((a, x) => ({ pomos:a.pomos + x.pomos, mins:a.mins + x.mins }), { pomos:0, mins:0 });
  const label = r.mode === 'pomo' ? TM_PHASE[r.phase][0] : r.mode === 'timer' ? 'Таймер на ' + plural(r.tmin, ['минуту', 'минуты', 'минут']) : 'Секундомер';
  const extra = r.mode === 'pomo'
    ? `<div class="tm-dots" title="Помидоры до длинного перерыва">${[...Array(P.every)].map((_, i) => `<i class="${i < r.cycle % P.every ? 'on' : ''}"></i>`).join('')}</div>
       <div class="tm-set">${[['work', 'Фокус'], ['short', 'Перерыв'], ['long', 'Длинный']].map(([k, n]) => `<label><span>${n}</span><input class="fin" type="number" inputmode="numeric" min="1" max="180" data-tmp="${k}" value="${P[k]}"><em>мин</em></label>`).join('')}</div>`
    : r.mode === 'timer'
      ? `<div class="chips tm-pre">${TM_PRESETS.map(m => `<button type="button" class="chip${r.tmin === m ? ' on' : ''}" data-act="tmpreset" data-m="${m}">${m} мин</button>`).join('')}</div>
         <label class="tm-own"><span>Своё время</span><input id="tm_min" class="fin" type="number" inputmode="numeric" min="1" max="600" value="${r.tmin}"><em>мин</em></label>`
      : '';
  return `<div class="tm-wrap">
  <div class="card tm-card">
    <div class="seg2 tm-modes">${TM_MODES.map(([k, n]) => `<button class="${r.mode === k ? 'on' : ''}" data-act="tmmode" data-m="${k}">${n}</button>`).join('')}</div>
    <div class="tm-face" style="--tc:${tmColor()}">
      <svg viewBox="0 0 220 220" aria-hidden="true"><circle cx="110" cy="110" r="100" class="tm-track"/><circle id="tm_arc" cx="110" cy="110" r="100" class="tm-arc" stroke-dasharray="${f1(C)}" stroke-dashoffset="0" transform="rotate(-90 110 110)"/></svg>
      <div class="tm-center"><small>${esc(label)}</small><b id="tm_time" aria-live="off">${tmText()}</b>${r.mode === 'pomo' ? `<span>помидор ${r.cycle % P.every + 1} из ${P.every}</span>` : ''}</div>
    </div>
    <div class="tm-ctrl">
      <button class="btn" data-act="tmreset">${I(IC.undo, 16)} Сброс</button>
      <button class="btn pri tm-go" data-act="tmgo">${r.running ? 'Пауза' : r.mode === 'watch' && tmWatch() ? 'Продолжить' : r.mode !== 'watch' && r.left < r.total && r.left > 0 ? 'Продолжить' : 'Старт'}</button>
      ${r.mode === 'pomo' ? `<button class="btn" data-act="tmskip">Дальше ${I(IC.right, 16)}</button>` : '<span class="tm-gap"></span>'}
    </div>
    ${extra}
  </div>
  <div class="card tm-stats"><div class="card-h"><b>${I(IC.timer, 17)} Фокус</b></div>
    <div class="tm-num"><div><b>${today.pomos}</b><small>${plural(today.pomos, ['помидор', 'помидора', 'помидоров']).replace(/^\d+ /, '')} сегодня</small></div><div><b>${today.mins}</b><small>минут фокуса</small></div><div><b>${week.pomos}</b><small>за 7 дней</small></div></div>
    <label class="swl" style="margin-top:14px"><input id="tm_sound" class="sw" type="checkbox"${S.timer.sound ? ' checked' : ''}> Звук в конце</label>
    <p class="set-note">Пробный раздел. Время идёт, даже если закрыть вкладку, но на iPhone сигнал прозвучит, только когда приложение открыто. Пробел — старт и пауза.</p>
  </div></div>`;
}

// Перерисовка цифр и кольца без перерисовки страницы
function tmPaint() {
  const r = TR(), txt = tmText(), el = $('#tm_time');
  if (el) {
    el.textContent = txt;
    const arc = $('#tm_arc'), C = 2 * Math.PI * 100;
    if (arc) { const p = r.mode === 'watch' ? (tmWatch() / 1000 % 60) / 60 : r.total ? tmLeft() / r.total : 0; arc.setAttribute('stroke-dashoffset', f1(C * (1 - p))); }
  }
  $$('.tm-mini').forEach(m => m.textContent = r.running ? txt : '');
  document.title = r.running ? `${txt} · ${APP_TITLE}` : APP_TITLE;
}
function tmFinish() {
  const r = TR(), t = todayK(); let msg;
  r.running = false;
  if (r.mode === 'pomo') {
    if (r.phase === 'work') {
      const L = S.timer.log[t] || (S.timer.log[t] = { pomos:0, mins:0 }); L.pomos++; L.mins += S.timer.pomo.work;
      r.cycle++; r.phase = r.cycle % S.timer.pomo.every === 0 ? 'long' : 'short';
      msg = `Помидор готов 🍅 Теперь ${r.phase === 'long' ? 'длинный' : 'короткий'} перерыв — ${plural(S.timer.pomo[r.phase], ['минута', 'минуты', 'минут'])}`;
    } else { r.phase = 'work'; msg = 'Перерыв закончился — пора за работу'; }
    r.left = r.total = phaseMs(r.phase);
  } else { r.left = 0; msg = 'Время вышло ⏰'; }
  save(); tmBeep();
  try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (x) {}
  toast(msg);
  if ('Notification' in window && Notification.permission === 'granted' && document.hidden) swReady().then(reg => reg.showNotification(APP_NAME, { body: msg, icon:'icon-192.png', tag:'timer' })).catch(() => {});
  if (sec === 'timer') render(); else { $('#side').innerHTML = sideHTML(); tmPaint(); }
}
setInterval(() => { const r = TR(); if (!r.running) return; if (r.mode !== 'watch' && tmLeft() <= 0) tmFinish(); else tmPaint(); }, 250);

function tmGo() {
  const r = TR(), now = Date.now();
  if (r.running) { if (r.mode === 'watch') r.acc = tmWatch(); else r.left = tmLeft(); r.running = false; }
  else {
    tmUnlock();
    if (r.mode === 'watch') r.startAt = now;
    else { if (r.left <= 0) r.left = r.total; r.endAt = now + r.left; }
    r.running = true;
  }
  save(); render();
}
function tmSetMode(m) {
  const r = TR(); if (r.mode === m) return;
  if (r.running) { if (r.mode === 'watch') r.acc = tmWatch(); else r.left = tmLeft(); r.running = false; }
  r.mode = m;
  if (m === 'pomo') r.left = r.total = phaseMs(r.phase);
  else if (m === 'timer') r.left = r.total = r.tmin * 60000;
  save(); render();
}
function tmReset() {
  const r = TR(); r.running = false;
  if (r.mode === 'watch') r.acc = 0;
  else r.left = r.total = r.mode === 'pomo' ? phaseMs(r.phase) : r.tmin * 60000;
  save(); render();
}
ACT.tmgo = tmGo;
ACT.tmmode = el => tmSetMode(el.dataset.m);
ACT.tmreset = tmReset;
ACT.tmskip = () => { const r = TR(); r.running = false; if (r.phase === 'work') { r.cycle++; r.phase = r.cycle % S.timer.pomo.every === 0 ? 'long' : 'short'; } else r.phase = 'work'; r.left = r.total = phaseMs(r.phase); save(); render(); };
ACT.tmpreset = el => { const r = TR(); r.tmin = Number(el.dataset.m); r.running = false; r.left = r.total = r.tmin * 60000; save(); render(); };
document.addEventListener('change', e => {
  const t = e.target, r = TR();
  if (t.dataset.tmp) {
    const v = Math.max(1, Math.min(180, Math.round(Number(t.value) || 0))); S.timer.pomo[t.dataset.tmp] = v; t.value = v;
    if (!r.running && r.mode === 'pomo' && r.phase === t.dataset.tmp) r.left = r.total = phaseMs(r.phase);
    save(); render();
  } else if (t.id === 'tm_min') { const v = Math.max(1, Math.min(600, Math.round(Number(t.value) || 0))); r.tmin = v; r.running = false; r.left = r.total = v * 60000; save(); render(); }
  else if (t.id === 'tm_sound') { S.timer.sound = t.checked; if (t.checked) tmUnlock(); save(); }
});
// Пробел на странице таймера — старт и пауза
document.addEventListener('keydown', e => {
  if (sec !== 'timer' || e.code !== 'Space' || e.repeat || sheetOpen() || cmdOpen() || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(e.target.tagName || '')) return;
  e.preventDefault(); tmGo();
});

SEC.timer = { name:'Таймер', icon:IC.timer, noNav:true, beta:true, title: () => 'Таймер', html: timerHTML, move: () => {}, after: tmPaint };
