-- Parsimony: данные пользователей (бета, 7 октября 2026)
-- Выполнить один раз: Supabase → SQL Editor → вставить всё → Run.
-- Одна строка на пользователя: весь набор записей приложения (JSON). Каждый видит и меняет только свою строку (RLS).

create table if not exists public.user_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  rev bigint not null default 1,
  updated_at timestamptz not null default now(),
  constraint user_data_size check (octet_length(data::text) < 5000000)   -- не больше ~5 МБ на человека
);

alter table public.user_data enable row level security;
revoke all on public.user_data from anon;

drop policy if exists "user_data: read own" on public.user_data;
drop policy if exists "user_data: insert own" on public.user_data;
drop policy if exists "user_data: update own" on public.user_data;
drop policy if exists "user_data: delete own" on public.user_data;
create policy "user_data: read own" on public.user_data for select to authenticated using ((select auth.uid()) = user_id);
create policy "user_data: insert own" on public.user_data for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "user_data: update own" on public.user_data for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "user_data: delete own" on public.user_data for delete to authenticated using ((select auth.uid()) = user_id);

-- Номер версии (rev) и время изменения ставит сервер: так два устройства не затрут изменения друг друга
create or replace function public.user_data_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then new.rev := old.rev + 1; else new.rev := 1; end if;
  return new;
end $$;
drop trigger if exists user_data_touch on public.user_data;
create trigger user_data_touch before insert or update on public.user_data
  for each row execute function public.user_data_touch();

-- «Удалить аккаунт» из приложения: человек может удалить только себя; его данные удаляются вместе с ним
create or replace function public.delete_my_account() returns void
language sql security definer set search_path = '' as $$
  delete from auth.users where id = auth.uid();
$$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
