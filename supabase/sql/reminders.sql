-- Parsimony: напоминания по времени — подписки устройств и журнал отправленного (9 октября 2026)
-- Выполнить один раз: Supabase → SQL Editor → новый сниппет → вставить всё → Run.
-- Работает и со старой версией приложения: она к таблице подписок не обращается (подписка там выключена).

-- 1. Подписки устройств теперь принадлежат человеку (user_id). Старые безымянные подписки
--    (тестовая рассылка «всем» до аккаунтов) удаляются: устройства подпишутся заново кнопкой «Включить напоминания».
alter table public.push_subscriptions add column if not exists user_id uuid references auth.users (id) on delete cascade;
alter table public.push_subscriptions add column if not exists ua text;
alter table public.push_subscriptions add column if not exists created_at timestamptz not null default now();
delete from public.push_subscriptions where user_id is null;
create unique index if not exists push_subscriptions_endpoint_uidx on public.push_subscriptions (endpoint);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- Читать можно только свои подписки (приложение проверяет, подписано ли устройство). Менять — только через функции ниже.
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
grant select on public.push_subscriptions to authenticated;
drop policy if exists "push: read own" on public.push_subscriptions;
create policy "push: read own" on public.push_subscriptions for select to authenticated using ((select auth.uid()) = user_id);

-- Подписать это устройство на напоминания вошедшего человека. Если на устройстве раньше был другой аккаунт,
-- подписка переходит новому (адрес подписки знает только само устройство). Не больше 10 устройств на человека.
create or replace function public.push_register(p_endpoint text, p_p256dh text, p_auth text, p_ua text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  if p_endpoint is null or p_endpoint !~ '^https://' or length(p_endpoint) > 1000
     or coalesce(length(p_p256dh), 0) not between 20 and 200 or coalesce(length(p_auth), 0) not between 8 and 100 then
    raise exception 'bad subscription';
  end if;
  delete from public.push_subscriptions where endpoint = p_endpoint;
  insert into public.push_subscriptions (endpoint, p256dh, auth, user_id, ua) values (p_endpoint, p_p256dh, p_auth, uid, left(p_ua, 200));
  delete from public.push_subscriptions where user_id = uid and endpoint in (
    select endpoint from public.push_subscriptions where user_id = uid order by created_at desc offset 10);
end $$;

-- Отписать устройство (выход из аккаунта, «Выключить на этом устройстве»): только свою подписку
create or replace function public.push_unregister(p_endpoint text)
returns void language sql security definer set search_path = '' as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$$;

revoke all on function public.push_register(text, text, text, text) from public, anon;
revoke all on function public.push_unregister(text) from public, anon;
grant execute on function public.push_register(text, text, text, text) to authenticated;
grant execute on function public.push_unregister(text) to authenticated;

-- 2. Журнал отправленных напоминаний: каждое уходит один раз. Пишет и читает только функция reminders (service_role).
create table if not exists public.reminder_log (
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null check (char_length(key) <= 200),
  fire_at timestamptz not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.reminder_log enable row level security;
revoke all on public.reminder_log from anon, authenticated;
