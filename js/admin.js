// ---- Админка (27 октября 2026; просьба пользователя: «давай сделаем первую версию админки, сделай ее поудобнее. так же проверь всю
// безопасность, чтобы админ панель не попала не в те руки»). Страница SEC.admin: «Сводка», «Люди» (с приглашением), «Отзывы», «Журнал».
// Кнопка в меню профиля — только у админов (NAME_ADMIN, frAdmin), но это лишь удобство: всё делает функция admin на сервере
// (supabase/functions/admin), и она сама проверяет вход и таблицу admins при каждом запросе (тест — tools/test-admin.mjs).
// Записи людей (дела, деньги, самочувствие, переписку) админка не видит. Что пришло с сервера — только в памяти страницы, на устройстве не хранится
let adm = { tab: 'sum', q: '', fb: 'new', inv: '', invRes: null, stats: null, users: null, fbs: null, cfg: null, log: null, err: '', busy: 0 };
const ADM_KEY = { sum: 'stats', ppl: 'users', fb: 'fbs', set: 'cfg', log: 'log' }, ADM_ACTION = { sum: 'stats', ppl: 'users', fb: 'feedback', set: 'cfg', log: 'log' };
const ADM_ERR = { auth: 'Войдите в аккаунт заново', forbidden: 'Нет доступа: этот аккаунт не админ', email: 'Это не похоже на почту',
  admin: 'Себя и других админов здесь менять нельзя — только в SQL Editor', none: 'Такого уже нет — обновите список', confirm: 'Почта для подтверждения не совпала',
  server: 'Сервер не ответил — попробуйте ещё раз' };
const ADM_DONE = { nick: 'Ник сброшен', name: 'Имя сброшено', ban: 'Вход заблокирован', unban: 'Вход разблокирован', del: 'Аккаунт удалён', grant: 'Подписка выдана', revoke: 'Подписка отменена', coins: 'Монеты начислены' };
const ADM_ACT = { invite: 'Приглашение', ban: 'Блокировка входа', unban: 'Разблокировка', nick: 'Сброс ника', name: 'Сброс имени', del: 'Удаление аккаунта',
  fb_done: 'Отзыв разобран', fb_undone: 'Отзыв — снова новый', denied: 'Попытка открыть без прав', cfg: 'Настройка', grant: 'Выдана подписка', revoke: 'Отменена подписка', coins: 'ParsiCoins' };
const ADM_CFG = { ann: 'объявление', maint: 'плашка «идут работы»', ai_limit: 'лимит помощника', nudge: 'помощник пишет сам', tiers_on: 'тарифы', limits: 'лимиты по тарифам' };
const ADM_KIND = Object.fromEntries([...FB_KINDS, ['other', 'Другое']]);
async function admCall(body) {
  let r;
  try { r = await fetch(SUPABASE_URL + '/functions/v1/admin', { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: 'Bearer ' + await accessToken() }, body: JSON.stringify(body) }); }
  catch (e) { throw new Error(e instanceof CloudErr ? 'Войдите в аккаунт заново' : 'Нет связи с сервером'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(ADM_ERR[j.error] || (r.status === 404 ? 'Функция admin ещё не опубликована на сервере' : 'Ошибка запроса (' + r.status + ')'));
  return j;
}
const admDraw = () => { if (sec === 'admin') render(); };
async function admLoad(tab, force) {
  tab = tab || adm.tab; const key = ADM_KEY[tab];
  if (adm[key] && !force) return;
  adm.busy++; adm.err = ''; admDraw();
  try { const j = await admCall({ action: ADM_ACTION[tab] }); adm[key] = tab === 'sum' ? j : tab === 'ppl' ? j.users : tab === 'set' ? j.cfg : j.items; }
  catch (e) { adm.err = e.message; }
  adm.busy--; admDraw();
}
ACT.admopen = () => { if (typeof closeQuick === 'function') closeQuick(); setSec('admin'); admLoad(adm.tab); };
ACT.admtab = el => { adm.tab = ADM_KEY[el.dataset.k] ? el.dataset.k : 'sum'; adm.err = ''; render(); admLoad(adm.tab); };
ACT.admref = () => admLoad(adm.tab, true);
ACT.admfbf = el => { adm.fb = el.dataset.k; render(); };
ACT.admpf = el => { adm.pf = el.dataset.k; render(); };
document.addEventListener('input', e => { if (e.target.id === 'adm_gd' && adm.g) adm.g.days = Math.round(Number(e.target.value)) || adm.g.days; });
SEC.admin = { name: 'Админка', icon: IC.lock, noNav: true, title: () => 'Админка', html: admHTML, move: () => {} };

function admHTML() {
  if (!NAME_ADMIN || !signedIn()) return `<div class="card adm-no"><b>Нет доступа</b><p class="set-note">Админка — только для админов Parsimony.</p></div>`;
  if (!adm[ADM_KEY[adm.tab]] && !adm.busy && !adm.err) setTimeout(() => admLoad(adm.tab), 0);   // открыли страницу не кнопкой (например, «Назад»)
  const nNew = adm.fbs ? adm.fbs.filter(x => !x.done_at).length : adm.stats ? adm.stats.fbNew : 0;
  return `<div class="adm">
    <div class="adm-top"><div class="seg2 adm-tabs" role="tablist" aria-label="Разделы админки">${[['sum', 'Сводка'], ['ppl', 'Люди'], ['fb', 'Отзывы'], ['set', 'Настройки'], ['log', 'Журнал']].map(([k, n]) =>
      `<button role="tab" class="${adm.tab === k ? 'on' : ''}" aria-selected="${adm.tab === k}" data-act="admtab" data-k="${k}"${k === 'set' ? ' title="Настройки"' : ''}>${k === 'set' ? I(IC.gear, 16) + '<span class="adm-tl">' + n + '</span>' : n}${k === 'fb' && nNew ? `<em class="adm-badge" aria-label="новых: ${nNew}">${nNew}</em>` : ''}</button>`).join('')}</div></div>
    <div class="adm-sub"><span role="status">${adm.busy ? 'Загружаю…' : ''}</span><button class="adm-rf" data-act="admref"${adm.busy ? ' disabled' : ''}>${I(IC.rep, 14)} Обновить</button></div>
    ${adm.err ? `<p class="adm-err" role="alert">${esc(adm.err)}</p>` : ''}
    ${({ sum: admSum, ppl: admPpl, fb: admFb, set: admSet, log: admLog })[adm.tab]()}
    <p class="adm-foot">${I(IC.lock, 13)} Админке видны только числа и служебное — записей людей в ней нет. Все действия пишутся в журнал.</p></div>`;
}

// ---- Сводка: только числа ----
function admSum() {
  const s = adm.stats; if (!s) return '';
  const t = (n, label, sub, go) => `<${go ? `button data-act="admtab" data-k="${go}"` : 'div'} class="adm-t"><b>${n == null ? '—' : n}</b><span>${label}</span>${sub ? `<small>${sub}</small>` : ''}</${go ? 'button' : 'div'}>`;
  const max = Math.max(0, ...s.ai.map(x => x[1])), sum = s.ai.reduce((a, x) => a + x[1], 0), dm = k => +k.slice(8) + ' ' + MONS[+k.slice(5, 7) - 1];
  return `<div class="adm-tiles">
    ${t(s.users, 'Всего людей', (s.new7 ? '+' + s.new7 + ' за неделю' : 'новых за неделю нет') + (s.banned ? ' · заблокировано ' + s.banned : ''), 'ppl')}
    ${t(s.act1, 'Заходили за сутки', 'за неделю — ' + s.act7)}
    ${t(s.push, 'С уведомлениями', 'включены на устройстве')}
    ${t(s.aiToday, 'Помощник сегодня', 'запросов; за 14 дней — ' + sum)}
    ${t(s.fbNew, 'Новых отзывов', 'нажмите, чтобы разобрать', 'fb')}
    ${t(s.cards, 'Карточек друзей', 'пар друзей — ' + s.friends)}
    ${t(s.msg7, 'Сообщений', 'между друзьями за неделю')}
    ${t(s.plus == null ? null : s.plus + s.premium, 'Подписчиков', s.plus == null ? 'выполните subscriptions.sql' : 'Плюс ' + s.plus + ' · Премиум ' + s.premium)}</div>
    <div class="card adm-chart"><b class="adm-h">Запросы к помощнику, 14 дней</b>
      <div class="adm-bars" role="img" aria-label="Запросов за 14 дней: ${sum}">${s.ai.map(([k, n]) => `<i class="${n ? '' : 'z'}" style="height:${Math.max(2, Math.round(n / Math.max(1, max) * 100))}%" title="${dm(k)}: ${n}"></i>`).join('')}</div>
      <div class="adm-bx"><span>${dm(s.ai[0][0])}</span><span>больше всего за день — ${max}</span><span>${dm(s.ai[s.ai.length - 1][0])}</span></div></div>`;
}

// ---- Люди: приглашение, поиск, человек (окно с действиями) ----
const admSite = () => /^https:\/\/(app|beta)\.parsimony\.ru$/.test(location.origin) ? location.origin : 'https://app.parsimony.ru';
const admInvText = e => `Приглашаю тебя в Parsimony — это планер: календарь, задачи, привычки и помощник. Открой ${admSite()}, нажми «Войти» и введи почту ${e} — придёт код. На iPhone потом: «Поделиться» → «На экран „Домой“».`;
function admPpl() {
  const r = adm.invRes;
  return `<div class="card adm-inv"><b class="adm-h">${I(IC.user, 16)} Пригласить друга</b>
    <p class="set-note">Создам аккаунт на эту почту — друг войдёт по коду из письма. Пароль не нужен.</p>
    <div class="adm-invf"><input id="adm_inv" class="fin" type="email" inputmode="email" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="200" placeholder="friend@mail.ru" aria-label="Почта друга" value="${esc(adm.inv)}">
      <button class="btn pri" data-act="adminv"${adm.busy ? ' disabled' : ''}>Пригласить</button></div>
    ${r ? `<div class="adm-invr"><p>${r.result === 'new' ? 'Аккаунт создан ✓ Отправьте другу:' : 'Такой аккаунт уже есть — можно просто отправить приглашение:'}</p>
      <blockquote>${esc(admInvText(r.email))}</blockquote>
      <div class="adm-invb"><button class="btn" data-act="admcopy">${I(IC.copy, 15)} Скопировать</button>${navigator.share ? `<button class="btn" data-act="admshare">${I(IC.share, 15)} Отправить</button>` : ''}</div></div>` : ''}</div>
  ${adm.users ? `<div class="card adm-ppl"><label class="adm-srch">${I(IC.search, 16)}<input id="adm_q" class="fin" type="search" placeholder="Почта, ник или имя" aria-label="Поиск людей" value="${esc(adm.q)}"></label>
    <div class="frl-tabs adm-pf" role="group" aria-label="Кого показать">${[['all', 'Все'], ['sub', 'С подпиской']].map(([k, n]) => `<button class="${(adm.pf || 'all') === k ? 'on' : ''}" aria-pressed="${(adm.pf || 'all') === k}" data-act="admpf" data-k="${k}">${n}</button>`).join('')}</div>
    <div id="adm_list">${admList()}</div></div>` : ''}`;
}
function admList() {
  const q = adm.q.trim().toLowerCase(), l = adm.users.filter(u => (adm.pf !== 'sub' || u.plan) && (!q || [u.email, u.nick, u.name].some(x => String(x || '').toLowerCase().includes(q))));
  if (!l.length) return `<p class="set-note adm-empty">${q ? 'Никого не нашлось.' : 'Пока никого.'}</p>`;
  return `<p class="adm-cnt">${plural(l.length, ['человек', 'человека', 'человек'])}</p>` + l.map(u => {
    const last = u.sync || u.seen, ch = String(u.name || u.email || '?').trim().charAt(0).toUpperCase() || '?';
    return `<button class="adm-u" data-act="admuser" data-id="${esc(u.id)}"><span class="adm-av" aria-hidden="true">${esc(ch)}</span>
      <span class="adm-ub"><b>${esc(u.email)}</b><small>${[u.nick ? '@' + esc(u.nick) : '', u.name ? esc(u.name) : '', last ? 'активность ' + ago(Date.parse(last)) : 'ещё не входили'].filter(Boolean).join(' · ')}</small></span>
      <span class="adm-tags">${u.plan ? `<em class="adm-tag p">${PLAN_NAME[u.plan]}</em>` : ''}${u.admin ? '<em class="adm-tag a">админ</em>' : ''}${u.banned ? '<em class="adm-tag b">заблокирован</em>' : ''}${u.dev ? `<em class="adm-tag" title="Устройств с уведомлениями">${I(IC.bell, 12)} ${u.dev}</em>` : ''}</span></button>`;
  }).join('');
}
const admDT = t => t ? new Date(t).toLocaleString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
function admUser(id, ask) {
  const u = (adm.users || []).find(x => x.id === id); if (!u) return;
  const lock = u.admin || u.id === auth.uid, uid = esc(u.id), b = (a, label, cls) => `<button class="btn${cls ? ' ' + cls : ''}" data-act="admdo" data-a="${a}" data-id="${uid}">${label}</button>`;
  const yes = (a, label, cls) => `<button class="btn ${cls || 'pri'}" data-act="admyes" data-a="${a}" data-id="${uid}">${label}</button>`, no = `<button class="btn" data-act="admno" data-id="${uid}">Отмена</button>`;
  const sub = u.plan ? `${PLAN_NAME[u.plan]} до ${admDT(u.until)}${u.subSrc === 'pay' ? ' · оплата' : ' · подарок'}${u.subNote ? ' · ' + esc(u.subNote) : ''}` : u.until ? 'закончилась ' + admDT(u.until) : 'нет';
  const info = [['Ник', u.nick ? '@' + esc(u.nick) : '—'], ['Имя', u.name ? esc(u.name) : '—'], ['Подписка', sub], [COIN, NF0.format(u.bal || 0)], ['Аккаунт с', admDT(u.created)], ['Последний вход', admDT(u.seen)],
    ['Синхронизация', admDT(u.sync)], ['Уведомления', u.dev ? plural(u.dev, ['устройство', 'устройства', 'устройств']) : 'выключены'], ['Помощник сегодня', plural(u.ai, ['запрос', 'запроса', 'запросов'])],
    ['Вход', u.banned ? 'заблокирован' : 'разрешён']];
  const g = ask === 'grant' ? adm.g || (adm.g = { plan: u.plan || 'premium', days: 30 }) : null;
  const askHTML = ask === 'ban' ? `<div class="adm-ask"><p><b>Заблокировать вход?</b> Человек не сможет войти, уведомления перестанут приходить; уже открытое приложение отключится в течение часа. Записи останутся — вход можно вернуть.</p>
      <div class="adm-acts">${yes('ban', 'Заблокировать', 'dng')}${no}</div></div>`
    : ask === 'del' ? `<div class="adm-ask"><p><b>Удалить аккаунт навсегда?</b> Удалятся все записи человека, карточка, друзья и переписка — вернуть нельзя. Чтобы подтвердить, введите его почту:</p>
      <input id="adm_cf" class="fin" type="email" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${esc(u.email)}" aria-label="Почта для подтверждения">
      <div class="adm-acts">${yes('del', 'Удалить навсегда', 'dng')}${no}</div></div>`
    : ask === 'grant' ? `<div class="adm-ask"><p><b>${u.plan ? 'Продлить или сменить подписку' : 'Выдать подписку'}</b> — без оплаты: тестерам, друзьям, за найденную ошибку. Дни добавятся к оставшемуся сроку.</p>
      <div class="chips adm-gc">${['plus', 'premium'].map(p => `<button type="button" class="chip${g.plan === p ? ' on' : ''}" data-act="admgp" data-p="${p}" data-id="${uid}">${PLAN_NAME[p]}</button>`).join('')}</div>
      <div class="chips adm-gc">${[[7, 'Неделя'], [30, 'Месяц'], [90, '3 месяца'], [365, 'Год']].map(([d, n]) => `<button type="button" class="chip${g.days === d ? ' on' : ''}" data-act="admgd" data-d="${d}" data-id="${uid}">${n}</button>`).join('')}</div>
      <label class="adm-gl"><span>Дней</span><input id="adm_gd" class="fin" type="number" inputmode="numeric" min="1" max="3660" value="${g.days}"></label>
      <input id="adm_gn" class="fin" maxlength="200" placeholder="Пометка для себя: «тестер», «за ошибку в календаре»" aria-label="Пометка">
      <div class="adm-acts">${yes('grant', 'Выдать ' + PLAN_NAME[g.plan])}${no}</div></div>`
    : ask === 'revoke' ? `<div class="adm-ask"><p><b>Отменить подписку?</b> Тариф сразу станет бесплатным. Записи человека не пропадут.</p><div class="adm-acts">${yes('revoke', 'Отменить подписку', 'dng')}${no}</div></div>`
    : ask === 'coins' ? `<div class="adm-ask"><p><b>Начислить ${COIN}</b> — за найденную ошибку, конкурс, в подарок. Со знаком минус — списать (не ниже нуля). Человек увидит это в истории монет вместе с пометкой.</p>
      <label class="adm-gl"><span>Сколько</span><input id="adm_ca" class="fin" type="number" inputmode="numeric" min="-100000" max="100000" value="100"></label>
      <input id="adm_cn" class="fin" maxlength="200" placeholder="Пометка, её видит человек: «спасибо за найденную ошибку»" aria-label="Пометка">
      <div class="adm-acts">${yes('coins', 'Начислить')}${no}</div></div>` : '';
  const subActs = `<div class="adm-acts">${b('grant', u.plan ? 'Продлить или сменить подписку…' : 'Выдать подписку…')}${u.plan ? b('revoke', 'Отменить подписку…') : ''}${b('coins', 'Начислить ' + COIN + '…')}</div>`;
  const modActs = lock ? `<p class="set-note">${u.id === auth.uid ? 'Это вы.' : 'Это админ.'} Блокировать, удалять и переименовывать админов можно только в SQL Editor.</p>`
    : `<div class="adm-acts">${u.nick ? b('nick', 'Сбросить ник') : ''}${u.name ? b('name', 'Сбросить имя') : ''}${b(u.banned ? 'unban' : 'ban', u.banned ? 'Разблокировать вход' : 'Заблокировать вход…')}${b('del', 'Удалить аккаунт…', 'dng')}</div>
      <p class="set-note">Ник и имя сбрасывают, если они грубые или выдают себя за другого — человек сможет выбрать новые.</p>`;
  sheet(`<div class="sh-head"><h3>${esc(u.email)}</h3><button class="ic" data-act="close" aria-label="Закрыть">${I(IC.x, 18)}</button></div>
    <dl class="adm-dl">${info.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>${askHTML || subActs + modActs}`);
  if (ask === 'del') setTimeout(() => { const i = $('#adm_cf'); if (i) i.focus(); }, 50);
}
ACT.admuser = el => { adm.g = null; admUser(el.dataset.id); };
ACT.admdo = el => { const a = el.dataset.a; if (['ban', 'del', 'grant', 'revoke', 'coins'].includes(a)) { if (a === 'grant') adm.g = null; return admUser(el.dataset.id, a); } admRun(a, el.dataset.id); };
ACT.admgp = el => { adm.g = Object.assign(adm.g || {}, { plan: el.dataset.p }); admUser(el.dataset.id, 'grant'); };
ACT.admgd = el => { adm.g = Object.assign(adm.g || {}, { days: Number(el.dataset.d) }); admUser(el.dataset.id, 'grant'); };
ACT.admyes = el => {
  const a = el.dataset.a, id = el.dataset.id;
  if (a === 'grant') { const d = Math.round(Number(($('#adm_gd') || {}).value)); if (!(d >= 1 && d <= 3660)) return toast('Дней — от 1 до 3660');
    return admRun('grant', id, undefined, { plan: (adm.g || {}).plan || 'premium', days: d, note: ($('#adm_gn') || {}).value || '' }); }
  if (a === 'coins') { const n = Number(($('#adm_ca') || {}).value); if (!Number.isInteger(n) || !n || Math.abs(n) > 100000) return toast('Целое число от −100 000 до 100 000, не ноль');
    return admRun('coins', id, undefined, { amt: n, note: ($('#adm_cn') || {}).value || '' }); }
  const cf = $('#adm_cf'); admRun(a, id, cf ? cf.value : undefined);
};
ACT.admno = el => admUser(el.dataset.id);
async function admRun(a, id, confirm, extra) {
  if (adm.busy || !ADM_DONE[a]) return;
  if (a === 'del' && !String(confirm || '').trim()) { toast('Введите почту, чтобы подтвердить'); const i = $('#adm_cf'); return i && i.focus(); }
  adm.busy++;
  try {
    const j = await admCall({ action: a, id, ...(confirm != null ? { confirm } : {}), ...(extra || {}) });
    toast(a === 'grant' ? `${PLAN_NAME[extra.plan]} до ${admDT(j.until)}` : a === 'coins' ? `${COIN}: теперь ${NF0.format(j.bal)}` : ADM_DONE[a]); adm.log = null; adm.stats = null;
    const u = (adm.users || []).find(x => x.id === id);
    if (a === 'del') { adm.users = adm.users.filter(x => x.id !== id); closeSheet(); }
    else {
      if (u) Object.assign(u, a === 'nick' ? { nick: '' } : a === 'name' ? { name: '' } : a === 'grant' ? { plan: extra.plan, until: j.until, subSrc: u.subSrc === 'pay' ? 'pay' : 'gift', subNote: String(extra.note || '').trim() }
        : a === 'revoke' ? { plan: '', until: null } : a === 'coins' ? { bal: j.bal } : { banned: a === 'ban' });
      admUser(id);
    }
    if (id === auth.uid && (a === 'grant' || a === 'revoke')) planLoad();   // своя подписка — обновить в приложении
    if (id === auth.uid && a === 'coins') coinsLoad();
  } catch (e) { toast(e.message); }
  adm.busy--; admDraw();
}
ACT.adminv = async () => {
  const i = $('#adm_inv'), e = String(i ? i.value : adm.inv).trim(); adm.inv = e;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) { toast('Введите почту друга'); return i && i.focus(); }
  if (adm.busy) return;
  adm.busy++; admDraw();
  try { const j = await admCall({ action: 'invite', email: e }); adm.invRes = { result: j.result, email: e.toLowerCase() }; adm.inv = ''; adm.users = null; adm.stats = null; adm.log = null; }
  catch (x) { toast(x.message); }
  adm.busy--; admDraw();
};
ACT.admcopy = async () => { if (!adm.invRes) return; try { await navigator.clipboard.writeText(admInvText(adm.invRes.email)); toast('Приглашение скопировано'); } catch (e) { toast('Не получилось — выделите текст и скопируйте'); } };
ACT.admshare = () => { if (adm.invRes && navigator.share) navigator.share({ text: admInvText(adm.invRes.email) }).catch(() => {}); };
// Поиск — без перерисовки страницы (поле не теряет фокус); почта приглашения — запоминается, Enter — пригласить
document.addEventListener('input', e => {
  if (e.target.id === 'adm_q') { adm.q = e.target.value; const l = $('#adm_list'); if (l && adm.users) l.innerHTML = admList(); }
  else if (e.target.id === 'adm_inv') adm.inv = e.target.value;
});
document.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing && (e.target.id === 'adm_inv' || e.target.id === 'adm_cf')) { e.preventDefault(); if (e.target.id === 'adm_inv') ACT.adminv(); else { const y = $('#sh [data-act="admyes"]'); if (y) y.click(); } } });

// ---- Отзывы: новые / разобранные / все ----
const admUA = ua => { ua = String(ua || ''); const os = /iPhone|iPad/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : '';
  const br = /YaBrowser/.test(ua) ? 'Яндекс Браузер' : /Firefox|FxiOS/.test(ua) ? 'Firefox' : /Edg\//.test(ua) ? 'Edge' : /Chrome|CriOS/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : ''; return [os, br].filter(Boolean).join(', '); };
function admFb() {
  const all = adm.fbs; if (!all) return '';
  const nNew = all.filter(x => !x.done_at).length, l = all.filter(x => adm.fb === 'all' || (adm.fb === 'new' ? !x.done_at : !!x.done_at));
  return `<div class="frl-tabs adm-fbf" role="group" aria-label="Какие отзывы">${[['new', 'Новые', nNew], ['done', 'Разобранные', all.length - nNew], ['all', 'Все', all.length]].map(([k, n, c]) =>
    `<button class="${adm.fb === k ? 'on' : ''}" aria-pressed="${adm.fb === k}" data-act="admfbf" data-k="${k}">${n} · ${c}</button>`).join('')}</div>
    ${l.length ? l.map(admFbCard).join('') : `<p class="set-note adm-empty">${adm.fb === 'new' ? 'Новых отзывов нет 🎉' : 'Пусто.'}</p>`}`;
}
function admFbCard(x) {
  const m = x.meta && typeof x.meta === 'object' ? x.meta : {}, kind = ADM_KIND[x.kind] ? x.kind : 'other', id = Number(x.id) || 0;
  const meta = [x.screen ? 'экран «' + String(x.screen) + '»' : '', m.ver ? 'версия ' + m.ver : '', /beta\./.test(String(m.site || '')) ? 'бета' : m.site ? 'рабочая' : '',
    m.w ? m.w + '×' + m.h : '', m.app === true ? 'с экрана «Домой»' : m.app === false ? 'в браузере' : '', admUA(m.ua)].filter(Boolean).map(s => esc(String(s).slice(0, 60))).join(' · ');
  return `<article class="card adm-fb${x.done_at ? ' done' : ''}">
    <div class="adm-fbh"><em class="adm-kind k-${kind}">${esc(ADM_KIND[kind])}</em><span>${esc(admDT(x.created_at))}</span></div>
    <p class="adm-fbt">${esc(x.body)}</p>${meta ? `<p class="adm-fbm">${meta}</p>` : ''}
    <div class="adm-fbb"><span class="adm-fbe">${esc(x.email || '')}</span>
      ${x.email ? `<a class="btn" href="mailto:${esc(encodeURIComponent(x.email))}?subject=${encodeURIComponent('Parsimony: ваш отзыв')}">${I(IC.msg, 15)} Ответить</a>` : ''}
      <button class="btn${x.done_at ? '' : ' pri'}" data-act="admfbd" data-id="${id}" data-done="${x.done_at ? 0 : 1}">${x.done_at ? 'Вернуть в новые' : I(IC.check, 15) + ' Разобрано'}</button></div></article>`;
}
ACT.admfbd = async el => {
  const id = Number(el.dataset.id), done = el.dataset.done === '1', x = (adm.fbs || []).find(f => f.id === id); if (!x || adm.busy) return;
  adm.busy++;
  try { await admCall({ action: 'fbdone', id, done }); x.done_at = done ? new Date().toISOString() : null; adm.log = null; adm.stats = null; toast(done ? 'Отзыв разобран' : 'Отзыв снова новый'); }
  catch (e) { toast(e.message); }
  adm.busy--; admDraw();
};

// ---- Журнал: действия админов и попытки без прав ----
function admLog() {
  const l = adm.log; if (!l) return '';
  if (!l.length) return '<p class="set-note adm-empty">Пока пусто. Здесь будут действия админов и попытки открыть админку без прав.</p>';
  return `<div class="card adm-log">${l.map(x => `<div class="adm-lr${x.action === 'denied' ? ' bad' : ''}"><span class="adm-lt">${esc(new Date(x.at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}</span>
    <span class="adm-lb"><b>${esc(ADM_ACT[x.action] || x.action)}</b>${x.target ? ' — ' + esc(x.action === 'cfg' ? ADM_CFG[x.target] || x.target : x.target) : ''}<small>${esc(x.who || 'аккаунт удалён')}</small></span></div>`).join('')}</div>`;
}

// ---- Настройки приложения (часть 2, 27 октября 2026; просьба пользователя: «давай объявления, оповещения и настройки»): объявление всем,
// плашка «идут работы», лимит помощника, «помощник пишет сам» для всех — без переопубликации (функция admin → таблица app_config);
// «Мои уведомления» — о новых отзывах и попытках открыть админку без прав (S.settings.admPush, шлёт функция reminders)
async function admSetCfg(k, v, msg) {
  if (adm.busy) return;
  adm.busy++;
  try { const j = await admCall({ action: 'setcfg', k, v }); if (j.v === null) delete adm.cfg[k]; else adm.cfg[k] = j.v; adm.log = null; toast(msg); cfgLoad(); }
  catch (e) { toast(e.message); }
  adm.busy--; admDraw();
}
function admSet() {
  const c = adm.cfg; if (!c) return '';
  const a = c.ann, m = c.maint || { on: false, text: '' }, lim = Number.isInteger(c.ai_limit) ? c.ai_limit : 30, p = S.settings.admPush || {};
  const TL = Object.assign({ free: 5, plus: 20, premium: 60 }, c.limits && typeof c.limits === 'object' ? c.limits : {});
  return `<div class="card adm-set"><b class="adm-h">📣 Объявление</b>
    <p class="set-note">Карточка на Главной у всех, пока человек не нажмёт «Понятно». Можно сразу отправить уведомлением — кроме тех, кто выключил «Новости Parsimony».</p>
    ${a ? `<div class="adm-cur"><small>Сейчас висит · ${esc(admDT(a.at))}${a.push ? (a.pushed ? ' · уведомление отправлено' : ' · уведомление уходит…') : ''}</small><b>${esc(a.title || 'Новости Parsimony')}</b><p>${esc(a.text)}</p>
      <button class="btn" data-act="admannoff">Снять</button></div>` : ''}
    <input id="adm_at" class="fin" maxlength="60" placeholder="Заголовок, например «Что нового»" aria-label="Заголовок объявления">
    <textarea id="adm_ax" class="fin" rows="4" maxlength="600" placeholder="Текст объявления" aria-label="Текст объявления"></textarea>
    <label class="swl"><input id="adm_ap" class="sw" type="checkbox"> Отправить и уведомлением</label>
    <button class="btn pri" data-act="admann"${adm.busy ? ' disabled' : ''}>${a ? 'Опубликовать вместо текущего' : 'Опубликовать'}</button></div>
  <div class="card adm-set"><b class="adm-h">🛠 Идут работы</b><p class="set-note">Жёлтая плашка на Главной у всех — на время, пока что-то чините.</p>
    <label class="swl"><input id="adm_mo" class="sw" type="checkbox"${m.on ? ' checked' : ''}> Показывать плашку</label>
    <input id="adm_mt" class="fin" maxlength="200" placeholder="Например: помощник временно не отвечает" value="${esc(m.text || '')}" aria-label="Текст плашки">
    <button class="btn" data-act="admmaint">Сохранить</button></div>
  <div class="card adm-set"><b class="adm-h">✦ Помощник</b>
    <div class="adm-lim"><span>Запросов в день на человека</span><input id="adm_lim" class="fin" type="number" inputmode="numeric" min="1" max="500" value="${lim}" aria-label="Запросов в день"><button class="btn" data-act="admlim">Сохранить</button></div>
    <div class="set-row"><span>Помощник пишет сам — всем<small>выключить разом для всех, если что-то пошло не так</small></span><input id="adm_nudge" class="sw" type="checkbox"${c.nudge === false ? '' : ' checked'}></div></div>
  <div class="card adm-set"><b class="adm-h">💳 Тарифы</b>
    <p class="set-note">${c.tiers_on === true ? 'Включены: лимит помощника — по тарифу человека, страница тарифов видна всем.' : `Выключены: у всех один лимит помощника (${lim} в день), страница тарифов видна только на бете. Включите, когда заработает оплата.`}</p>
    <div class="set-row"><span>Тарифы включены<small>бесплатным станет ${TL.free} сообщений в день</small></span><input id="adm_tiers" class="sw" type="checkbox"${c.tiers_on === true ? ' checked' : ''}></div>
    <div class="adm-lims">${['free', 'plus', 'premium'].map(p => `<label><span>${PLAN_NAME[p]}</span><input id="adm_l_${p}" class="fin" type="number" inputmode="numeric" min="1" max="1000" value="${TL[p]}"></label>`).join('')}</div>
    <button class="btn" data-act="admlims">Сохранить лимиты по тарифам</button></div>
  <div class="card adm-set"><b class="adm-h">🚪 Регистрация</b>
    <p class="set-note">${c.signup_on === true ? 'Открыта: незнакомая почта на экране входа — «Создать аккаунт» с проверкой «я не робот» (функция signup). У всех — галочка согласия и ссылки на документы.'
      : 'Закрыта: войти могут только те, кого вы пригласили. Откройте, когда в документах будет почта и их посмотрит юрист, а сервер переедет в Россию (152-ФЗ): тогда у всех появятся галочка согласия и ссылки на документы.'}</p>
    <div class="set-row"><span>Регистрация открыта<small>${c.captcha ? 'ключ капчи сохранён' : 'сначала сохраните ключ капчи'}</small></span><input id="adm_su" class="sw" type="checkbox"${c.signup_on === true ? ' checked' : ''}></div>
    <div class="adm-lim"><span>Новых аккаунтов в сутки</span><input id="adm_sud" class="fin" type="number" inputmode="numeric" min="1" max="1000" value="${Number.isInteger(c.signup_day) ? c.signup_day : 50}" aria-label="Новых аккаунтов в сутки"><button class="btn" data-act="admsud">Сохранить</button></div>
    <label class="adm-gl"><span>Ключ клиента SmartCaptcha</span><input id="adm_cap" class="fin" maxlength="120" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="ysc1_…" value="${esc(c.captcha || '')}"></label>
    <button class="btn" data-act="admcap">Сохранить ключ</button>
    <p class="set-note">Ключ сервера (ysc2_…) — только в Supabase → Edge Functions → Secrets как SMARTCAPTCHA_SERVER_KEY, сюда его не вставлять. Лимит в сутки бережёт письма с кодом: у Resend бесплатно около 100 в день.</p></div>
  <div class="card adm-set"><b class="adm-h">🔔 Мои уведомления</b><p class="set-note">Приходят на ваши устройства, где включены напоминания.</p>
    <div class="set-row"><span>О новых отзывах</span><input id="adm_pfb" class="sw" type="checkbox"${p.fb === false ? '' : ' checked'}></div>
    <div class="set-row"><span>О попытках открыть админку без прав</span><input id="adm_pdn" class="sw" type="checkbox"${p.deny === false ? '' : ' checked'}></div></div>`;
}
ACT.admann = () => { const t = ($('#adm_ax') || {}).value || ''; if (!t.trim()) { toast('Напишите текст объявления'); const x = $('#adm_ax'); return x && x.focus(); }
  admSetCfg('ann', { title: ($('#adm_at') || {}).value || '', text: t, push: !!($('#adm_ap') || {}).checked }, 'Объявление опубликовано'); };
ACT.admannoff = () => admSetCfg('ann', null, 'Объявление снято');
ACT.admlims = () => { const v = {}; for (const p of ['free', 'plus', 'premium']) { const n = Math.round(Number(($('#adm_l_' + p) || {}).value)); if (!(n >= 1 && n <= 1000)) return toast('Лимит — от 1 до 1000'); v[p] = n; }
  admSetCfg('limits', v, `Лимиты: ${v.free} · ${v.plus} · ${v.premium} в день`); };
ACT.admmaint = () => { const on = !!($('#adm_mo') || {}).checked; admSetCfg('maint', { on, text: ($('#adm_mt') || {}).value || '' }, on ? 'Плашка включена у всех' : 'Плашка выключена'); };
ACT.admsud = () => { const n = Math.round(Number(($('#adm_sud') || {}).value)); if (!(n >= 1 && n <= 1000)) return toast('От 1 до 1000'); admSetCfg('signup_day', n, 'Новых аккаунтов в сутки — не больше ' + n); };
ACT.admcap = () => { const v = String(($('#adm_cap') || {}).value || '').trim();
  if (/^ysc2_/.test(v)) return toast('Это ключ сервера — его только в Secrets, не сюда');
  if (v && !/^ysc1_[A-Za-z0-9_-]{10,100}$/.test(v)) return toast('Ключ клиента начинается с ysc1_');
  if (!v && adm.cfg.signup_on === true) return toast('Сначала закройте регистрацию');
  admSetCfg('captcha', v || null, v ? 'Ключ капчи сохранён' : 'Ключ капчи убран'); };
ACT.admlim = () => { const n = Math.round(Number(($('#adm_lim') || {}).value)); if (!(n >= 1 && n <= 500)) return toast('Лимит — от 1 до 500'); admSetCfg('ai_limit', n, 'Помощник: ' + plural(n, ['запрос', 'запроса', 'запросов']) + ' в день'); };
document.addEventListener('change', e => { const id = e.target.id;
  if (id === 'adm_tiers') { if (e.target.checked && !confirm('Включить тарифы? Лимит помощника станет по тарифу — у бесплатных меньше.')) { e.target.checked = false; return; }
    return admSetCfg('tiers_on', e.target.checked, e.target.checked ? 'Тарифы включены' : 'Тарифы выключены — у всех прежний лимит'); }
  if (id === 'adm_su') { const on = e.target.checked;
    if (on && !adm.cfg.captcha) { e.target.checked = false; return toast('Сначала сохраните ключ клиента капчи'); }
    if (on && !confirm('Открыть регистрацию для всех? У всех появятся галочка согласия и ссылки на документы. По закону данные новых людей должны храниться на сервере в России.')) { e.target.checked = false; return; }
    return admSetCfg('signup_on', on, on ? 'Регистрация открыта' : 'Регистрация закрыта'); }
  if (id === 'adm_nudge') admSetCfg('nudge', e.target.checked, e.target.checked ? 'Помощник снова пишет сам' : 'Помощник больше не пишет сам — никому');
  else if (id === 'adm_pfb' || id === 'adm_pdn') { S.settings.admPush = Object.assign({}, S.settings.admPush, { [id === 'adm_pfb' ? 'fb' : 'deny']: e.target.checked }); save(); toast(e.target.checked ? 'Буду присылать' : 'Не буду присылать'); } });
// Из уведомления админу (#s=admfb / #s=admlog, notify.js) — сразу на нужную вкладку, свежие данные
const admOpenTab = t => { if (typeof closeSheet === 'function') closeSheet(); adm.tab = t; adm[ADM_KEY[t]] = null; adm.err = ''; setSec('admin'); admLoad(t); };

// ---- Для всех: объявление и «идут работы» на Главной (таблица app_config, читать может любой; на устройстве — последнее известное) ----
let appCfg = {}, cfgAt = 0;
try { appCfg = JSON.parse(localStorage.getItem('remapp_cfg') || '{}') || {}; } catch (e) {}
async function cfgLoad() {
  cfgAt = Date.now();
  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/app_config?select=k,v', { cache: 'no-store', headers: { apikey: SUPABASE_KEY } });
    const j = r.ok ? await r.json() : null; if (!Array.isArray(j)) return;
    const c = {}; j.forEach(x => { if (x && typeof x.k === 'string') c[x.k] = x.v; });
    const was = JSON.stringify(appCfg); appCfg = c;
    try { localStorage.setItem('remapp_cfg', JSON.stringify(c)); } catch (e) {}
    if (JSON.stringify(c) !== was && sec === 'home') render();
  } catch (e) {}
}
setTimeout(cfgLoad, 2500);
document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - cfgAt > 10 * 60e3) cfgLoad(); });
function cfgHomeHTML() {
  const m = appCfg.maint, a = appCfg.ann;
  return (m && m.on ? `<div class="card cfg-maint" role="status">${I(IC.alert, 17)}<span><b>Идут работы.</b> ${esc(m.text || 'Что-то может работать с перебоями — скоро всё наладим.')}</span></div>` : '')
    + (a && a.id && a.text && S.settings.annSeen !== Number(a.id) ? `<div class="card cfg-ann"><b>📣 ${esc(a.title || 'Новости Parsimony')}</b><p>${esc(a.text)}</p><button class="btn" data-act="annok" data-id="${Number(a.id)}">Понятно</button></div>` : '');
}
ACT.annok = el => { S.settings.annSeen = Number(el.dataset.id); save(); render(); };
