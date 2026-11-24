-- Parsimony: ссылка-подписка на свой календарь (25 ноября 2026; функция calendar — supabase/functions/calendar)
-- Выполнить один раз (повтор безопасен), потом hardening.sql. Старое приложение в main это не затрагивает.
-- Ключ — 48 случайных знаков (24 байта): по нему функция calendar отдаёт события человека для Google / Яндекса / iPhone.
-- Создать или сбросить (новый ключ — старая ссылка перестаёт работать), узнать и выключить может только сам человек;
-- таблицу напрямую не читает никто, кроме функции calendar (ключом сервера). Удалили аккаунт — ключ удаляется вместе с ним.

create table if not exists public.cal_feeds (
  user_id uuid primary key references auth.users (id) on delete cascade,
  token text not null unique check (token ~ '^[a-f0-9]{48}$'),
  created_at timestamptz not null default now()
);
alter table public.cal_feeds enable row level security;
revoke all on public.cal_feeds from anon, authenticated;   -- правил нет: только функции ниже и функция calendar

-- Новый ключ (и сброс прежнего)
create or replace function public.cal_feed_new() returns text
language plpgsql volatile security definer set search_path = '' as $$
declare t text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  t := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.cal_feeds (user_id, token) values (auth.uid(), t)
    on conflict (user_id) do update set token = excluded.token, created_at = now();
  return t;
end $$;

-- Свой ключ (нет — null)
create or replace function public.cal_feed_get() returns text
language sql stable security definer set search_path = '' as $$
  select token from public.cal_feeds where user_id = auth.uid();
$$;

-- Выключить ссылку
create or replace function public.cal_feed_off() returns void
language sql volatile security definer set search_path = '' as $$
  delete from public.cal_feeds where user_id = auth.uid();
$$;

revoke all on function public.cal_feed_new() from public, anon;
revoke all on function public.cal_feed_get() from public, anon;
revoke all on function public.cal_feed_off() from public, anon;
grant execute on function public.cal_feed_new() to authenticated;
grant execute on function public.cal_feed_get() to authenticated;
grant execute on function public.cal_feed_off() to authenticated;
