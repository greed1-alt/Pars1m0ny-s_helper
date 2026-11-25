-- Parsimony: ключ виджета для iPhone (Scriptable) — 25 ноября 2026; функция calendar (supabase/functions/calendar, ветка «виджет»)
-- Выполнить один раз (повтор безопасен), потом hardening.sql. Старое приложение в main это не затрагивает.
-- Ключ — 48 случайных знаков. По нему функция calendar: отдаёт сводку дня и задачи, добавляет сказанное голосом (через помощника,
-- в его дневной лимит), отмечает задачи и добавляет новые из «Напоминаний» iPhone. Больше ничего: ни переписки, ни настроек, ни удаления.
-- Создать или сбросить (старый перестаёт работать), узнать и выключить может только сам человек; таблицу напрямую не читает никто,
-- кроме функции calendar (ключом сервера). Удалили аккаунт — ключ удаляется вместе с ним.

create table if not exists public.widget_keys (
  user_id uuid primary key references auth.users (id) on delete cascade,
  token text not null unique check (token ~ '^[a-f0-9]{48}$'),
  created_at timestamptz not null default now()
);
alter table public.widget_keys enable row level security;
revoke all on public.widget_keys from anon, authenticated;   -- правил нет: только функции ниже и функция calendar

create or replace function public.widget_key_new() returns text
language plpgsql volatile security definer set search_path = '' as $$
declare t text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  t := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.widget_keys (user_id, token) values (auth.uid(), t)
    on conflict (user_id) do update set token = excluded.token, created_at = now();
  return t;
end $$;

create or replace function public.widget_key_get() returns text
language sql stable security definer set search_path = '' as $$
  select token from public.widget_keys where user_id = auth.uid();
$$;

create or replace function public.widget_key_off() returns void
language sql volatile security definer set search_path = '' as $$
  delete from public.widget_keys where user_id = auth.uid();
$$;

revoke all on function public.widget_key_new() from public, anon;
revoke all on function public.widget_key_get() from public, anon;
revoke all on function public.widget_key_off() from public, anon;
grant execute on function public.widget_key_new() to authenticated;
grant execute on function public.widget_key_get() to authenticated;
grant execute on function public.widget_key_off() to authenticated;
