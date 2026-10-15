-- ИИ-помощник (16 октября 2026): дневной лимит запросов на человека.
-- Выполнить один раз в Supabase → SQL Editor. Таблицу читает и пишет только Edge Function assistant
-- (служебной ролью через ai_use); приложению и посторонним она недоступна.
-- Тексты сообщений здесь не хранятся — только число запросов за день.

create table if not exists public.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  n int not null default 0,
  primary key (user_id, day)
);
alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon, authenticated;

-- +1 к счётчику человека за день; возвращает, сколько запросов вместе с этим
create or replace function public.ai_use(p_user uuid, p_day date) returns int
language sql security definer set search_path = '' as $$
  insert into public.ai_usage (user_id, day, n) values (p_user, p_day, 1)
  on conflict (user_id, day) do update set n = public.ai_usage.n + 1
  returning n;
$$;
revoke all on function public.ai_use(uuid, date) from public, anon, authenticated;
grant execute on function public.ai_use(uuid, date) to service_role;
