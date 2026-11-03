-- Parsimony: закрытая бета (3 ноября 2026)
-- Выполнить один раз ПОСЛЕ friends.sql (нужна таблица admins): Supabase → SQL Editor → новый сниппет → вставить всё → Run. Повторный запуск безопасен.
-- На beta.parsimony.ru пускают только админов и тех, кому админ открыл доступ: Админка → человек → «Открыть доступ к бете»
-- (это делает функция admin ключом сервера). Приложение спрашивает только «мне можно?» — функцией beta_ok; список целиком не видит никто.
-- Рабочую версию (app.parsimony.ru) это не касается.
-- Открыть доступ вручную, здесь же (то же, что кнопка в админке):
--   insert into public.beta_access (user_id) select id from auth.users where email = 'почта@пример.ru' on conflict do nothing;

create table if not exists public.beta_access (
  user_id uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.beta_access enable row level security;
revoke all on public.beta_access from anon, authenticated;   -- правил нет: только функция beta_ok и функция admin

create or replace function public.beta_ok() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (exists (select 1 from public.admins where user_id = auth.uid())
    or exists (select 1 from public.beta_access where user_id = auth.uid()));
$$;
revoke all on function public.beta_ok() from public, anon;
grant execute on function public.beta_ok() to authenticated;
