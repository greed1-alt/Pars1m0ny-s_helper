// ---- Тарифы и подписка (28 октября 2026; решение пользователя: Бесплатно — помощник 5 сообщений в день, Плюс — 149 ₽ / 1 490 ₽ в год,
// 20 сообщений и больше тем, Премиум — 249 ₽ / 2 490 ₽ в год, 60 сообщений, все базовые темы и больше возможностей помощника; оплата — ЮKassa).
// Тариф и срок решает только сервер (таблица subscriptions — supabase/sql/subscriptions.sql; выдаёт админ, позже — оплата). Здесь — только показать:
// приложение читает свою строку (myPlan, кэш remapp_plan); лимит помощника по тарифу проверяет функция assistant, и только когда тарифы включены
// в админке (app_config.tiers_on). До этого страница тарифов видна только на бете
const PLAN_NAME = { free: 'Бесплатно', plus: 'Плюс', premium: 'Премиум' };
const PLANS = [
  { k: 'free', m: 0, y: 0, perks: ['Календарь, задачи, привычки, цели и финансы', 'Друзья, переписка и лидеры', 'Помощник — 5 сообщений в день', '3 темы на выбор, остальные — за искры в магазине'] },
  { k: 'plus', m: 149, y: 1490, perks: ['Всё из бесплатного', 'Помощник — 20 сообщений в день', 'Больше тем — 8 на выбор'] },
  { k: 'premium', m: 249, y: 2490, best: true, perks: ['Всё из Плюс', 'Помощник — 60 сообщений в день и расширенные возможности', 'Все базовые темы', 'Переливающееся имя'] }];
const plansOn = () => IS_BETA || appCfg.tiers_on === true;
let myPlan = null, plansYear = false;
try { myPlan = JSON.parse(localStorage.getItem('remapp_plan') || 'null'); } catch (e) {}
const planNow = () => myPlan && PLAN_NAME[myPlan.plan] && Date.parse(myPlan.until) > Date.now() ? myPlan.plan : 'free';
const planDate = t => new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
const planLine = () => { const p = planNow(); return p === 'free' ? '' : `${PLAN_NAME[p]} до ${planDate(myPlan.until)}${myPlan.source === 'gift' ? ' · подарок' : ''}`; };
async function planLoad() {
  if (!signedIn()) return;
  try {
    const j = await api(`/rest/v1/subscriptions?select=plan,until,source,auto&user_id=eq.${auth.uid}`, { user: true });
    const was = JSON.stringify(myPlan); myPlan = Array.isArray(j) && j[0] ? j[0] : null;
    try { localStorage.setItem('remapp_plan', JSON.stringify(myPlan)); } catch (e) {}
    if (JSON.stringify(myPlan) !== was && (sec === 'plans' || sec === 'profile')) render();
  } catch (e) {}   // таблицы ещё нет (SQL не выполнен) — бесплатно
}
setTimeout(planLoad, 3000);
ACT.plansopen = () => { if (typeof closeQuick === 'function') closeQuick(); setSec('plans'); planLoad(); };
ACT.plper = el => { plansYear = el.dataset.y === '1'; render(); };
ACT.plbuy = () => toast('Оплата появится скоро — подключаем ЮKassa');
SEC.plans = { name: 'Тарифы', icon: IC.spark, noNav: true, title: () => 'Тарифы', html: plansHTML, move: () => {} };
const rubPlan = n => n.toLocaleString('ru-RU') + ' ₽';
function plansHTML() {
  const cur = planNow(), line = planLine();
  const card = p => {
    const price = !p.m ? '<b>0 ₽</b><small>навсегда</small>' : plansYear ? `<b>${rubPlan(p.y)}</b><small>в год · ${rubPlan(Math.round(p.y / 12))} в месяц</small>` : `<b>${rubPlan(p.m)}</b><small>в месяц</small>`;
    const btn = cur === p.k ? `<span class="pl-on">${I(IC.check, 15)} Ваш тариф</span>` : p.k === 'free' ? '' : `<button class="btn${p.best ? ' pri' : ''}" data-act="plbuy" data-k="${p.k}">Оформить</button>`;
    return `<div class="card pl-card${p.best ? ' best' : ''}${cur === p.k ? ' cur' : ''}">${p.best ? '<em class="pl-badge">Больше всего возможностей</em>' : ''}
      <h3>${PLAN_NAME[p.k]}</h3><div class="pl-price">${price}</div><ul>${p.perks.map(x => `<li>${I(IC.check, 14)}<span>${x}</span></li>`).join('')}</ul>${btn}</div>`;
  };
  return `<div class="pl-page"><div class="pl-top"><h2>Тарифы ${APP_NAME}</h2>${line ? `<p class="pl-cur">${I(IC.spark, 15)} У вас ${esc(line)}</p>` : ''}
      <div class="seg2 pl-per" role="group" aria-label="Оплата"><button class="${plansYear ? '' : 'on'}" aria-pressed="${!plansYear}" data-act="plper" data-y="0">Помесячно</button><button class="${plansYear ? 'on' : ''}" aria-pressed="${plansYear}" data-act="plper" data-y="1">На год · 2 месяца в подарок</button></div></div>
    <div class="pl-grid">${PLANS.map(card).join('')}</div>
    <p class="set-note pl-note">Оплата — через ЮKassa: номер карты вводится на её странице, ${APP_NAME} его не видит. Подписку можно отменить в любой момент — она действует до конца оплаченного срока, записи никогда не пропадают. Сейчас оплата ещё не подключена.</p></div>`;
}
