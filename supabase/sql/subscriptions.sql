-- Parsimony: подписки Плюс и Премиум (28 октября 2026)
-- Выполнить один раз ПОСЛЕ admin2.sql: Supabase → SQL Editor → новый сниппет → вставить всё → Run.
-- Тариф и срок решает только сервер: строку меняет функция admin (выдать / отменить из админки), позже — функция оплаты (ЮKassa).
-- Приложение может только прочитать свою строку. Нет строки или срок прошёл — бесплатный тариф.
-- Лимиты по тарифам (5 / 20 / 60 сообщений помощнику) действуют, только когда в админке включены тарифы (app_config.tiers_on = true).

create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan text not null check (plan in ('plus', 'premium')),
  until timestamptz not null,
  source text not null default 'gift' check (source in ('gift', 'pay')),   -- gift — выдал админ, pay — оплата
  auto boolean not null default false,                                       -- автопродление (появится с оплатой)
  note text check (note is null or char_length(note) <= 200),                -- пометка админа: «тестер», «за найденную ошибку»
  updated_at timestamptz not null default now()
);
alter table public.subscriptions enable row level security;
revoke all on public.subscriptions from anon, authenticated;
grant select on public.subscriptions to authenticated;
drop policy if exists "subscriptions: read own" on public.subscriptions;
create policy "subscriptions: read own" on public.subscriptions for select to authenticated using ((select auth.uid()) = user_id);
