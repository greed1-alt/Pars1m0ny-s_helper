// Parsimony — проверка для виджета: показывается ли своя страница в Scriptable и работает ли на ней микрофон (25 ноября 2026).
// Ничего не записывает в Parsimony и никуда не отправляет. После проверки скрипт можно удалить.
// Способ А — страница как объект (как делал бы виджет), способ Б — страница одной командой. Связь «страница → скрипт» — переходом по адресу.
const HTML = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{margin:0;min-height:100vh;background:linear-gradient(160deg,#4338ca,#7c3aed);color:#fff;font:17px/1.45 -apple-system,system-ui,sans-serif;padding:28px 22px}
h1{font-size:26px;margin:8px 0 6px}.sm{font-size:14px;opacity:.85}
.box{background:rgba(255,255,255,.14);border-radius:16px;padding:14px 16px;margin-top:16px}
.row{display:flex;justify-content:space-between;gap:10px;padding:3px 0;font-size:15px}
button{width:100%;height:52px;margin-top:12px;border:0;border-radius:14px;background:#fff;color:#4338ca;font:600 17px -apple-system,system-ui,sans-serif}
button:active{opacity:.7}
.bar{height:14px;border-radius:7px;background:rgba(255,255,255,.2);overflow:hidden;margin-top:10px}.bar i{display:block;height:100%;width:0;background:#6ee7a0;transition:width .08s}
#log{white-space:pre-wrap;font-size:15px}
</style></head><body>
<div class="sm">Parsimony · проверка · способ %WAY%</div>
<h1>Страница показалась ✅</h1>
<div class="sm">Если вы это видите — первая проверка пройдена.</div>
<div class="box" id="env"></div>
<button onclick="mic()">🎙 Проверить микрофон</button>
<div class="box"><div id="log">Нажмите кнопку выше и скажите что-нибудь 4 секунды.</div><div class="bar"><i id="lv"></i></div></div>
<audio id="au" controls style="width:100%;margin-top:12px;display:none"></audio>
<button onclick="location.href='parsimony-act://ping'">🔗 Проверить связь со скриптом</button>
<div class="box" id="link">Связь со скриптом: ещё не проверяли</div>
<div class="sm" style="margin-top:18px">Сделайте снимок экрана после всех проверок и пришлите.</div>
<script>
function $(i){return document.getElementById(i)}
function row(k,v){return '<div class="row"><span>'+k+'</span><b>'+v+'</b></div>'}
var md=navigator.mediaDevices,mr=typeof MediaRecorder!=='undefined';
$('env').innerHTML=row('Защищённая страница',window.isSecureContext?'да':'нет')+row('Доступ к микрофону',md&&md.getUserMedia?'есть':'нет')+row('Запись звука',mr?'есть':'нет')+row('Тема',matchMedia('(prefers-color-scheme: dark)').matches?'тёмная':'светлая');
function say(t){$('log').textContent=t}
function pong(){$('link').textContent='Связь со скриптом работает ✅'}
async function mic(){
 if(!md||!md.getUserMedia){say('❌ Микрофон странице недоступен (нет getUserMedia).');return}
 var s;try{s=await md.getUserMedia({audio:true})}catch(e){say('❌ Микрофон не дали: '+(e&&e.name||'')+' '+(e&&e.message||e));return}
 say('Говорите… (4 секунды)');
 var ctx=new (window.AudioContext||window.webkitAudioContext)(),an=ctx.createAnalyser(),src=ctx.createMediaStreamSource(s),d=new Uint8Array(256),peak=0;
 src.connect(an);an.fftSize=512;
 var t=setInterval(function(){an.getByteTimeDomainData(d);var m=0;for(var i=0;i<d.length;i++)m=Math.max(m,Math.abs(d[i]-128));peak=Math.max(peak,m);$('lv').style.width=Math.min(100,m/1.28*1.6)+'%'},60);
 var chunks=[],rec=null;
 if(mr){try{rec=new MediaRecorder(s);rec.ondataavailable=function(e){if(e.data&&e.data.size)chunks.push(e.data)};rec.start()}catch(e){rec=null;say('Говорите… (запись не началась: '+e.message+')')}}
 setTimeout(function(){
  clearInterval(t);$('lv').style.width='0';
  var fin=function(){s.getTracks().forEach(function(x){x.stop()});try{ctx.close()}catch(e){}
   var b=chunks.length?new Blob(chunks,{type:chunks[0].type}):null;
   say((peak>8?'✅ Микрофон слышит (громкость '+peak+')':'⚠️ Микрофон открылся, но тихо (громкость '+peak+')')+'\\n'+(b?'✅ Записано: '+Math.round(b.size/1024)+' КБ, '+(b.type||'формат не указан'):'❌ Записи нет'));
   if(b){var a=$('au');a.src=URL.createObjectURL(b);a.style.display='block'}};
  if(rec&&rec.state!=='inactive'){rec.onstop=fin;rec.stop()}else fin();
 },4000);
}
</script></body></html>`;

const BASE = 'https://beta.parsimony.ru/';   // адрес страницы — чтобы она считалась защищённой (иначе микрофона у неё нет)
async function wayA() {
  const wv = new WebView();
  wv.shouldAllowRequest = req => {
    const u = String(req.url || '');
    if (u.indexOf('parsimony-act:') === 0) { wv.evaluateJavaScript('pong()', false).catch(() => {}); return false; }
    return true;
  };
  await wv.loadHTML(HTML.replace('%WAY%', 'А'), BASE);
  await wv.present(true);
}
async function wayB() { await WebView.loadHTML(HTML.replace('%WAY%', 'Б'), BASE, null, true); }

const a = new Alert();
a.title = 'Проверка Parsimony';
a.message = 'Сначала «Способ А». Если покажется пустой чёрный экран — закройте его крестиком, запустите проверку снова и выберите «Способ Б».';
a.addAction('Способ А'); a.addAction('Способ Б'); a.addCancelAction('Отмена');
const c = await a.presentAlert();
if (c === 0) await wayA(); else if (c === 1) await wayB();
Script.complete();
