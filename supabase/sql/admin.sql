-- Parsimony: админка (27 октября 2026)
-- Выполнить один раз ПОСЛЕ feedback.sql и friends.sql: Supabase → SQL Editor → новый сниппет → вставить всё → Run.
-- Саму админку делает функция admin (supabase/functions/admin/index.ts): она проверяет вход и таблицу admins при каждом запросе.
-- Здесь — только то, что ей нужно в базе: журнал действий и отметка «сделано» у отзывов. Приложению прав на них нет совсем.

-- Журнал: кто из админов что сделал и над кем; сюда же — попытки открыть админку без прав (action 'denied')
create table if not exists public.admin_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  admin uuid references auth.users (id) on delete set null,
  action text not null check (char_length(action) <= 40),
  target text check (char_length(target) <= 200),
  info jsonb check (info is null or octet_length(info::text) < 2000)
);
alter table public.admin_log enable row level security;
revoke all on public.admin_log from anon, authenticated;
-- Правил нет: читать и писать журнал может только функция admin (ключ service_role) и владелец в панели

-- Отзыв разобран — когда (null — новый)
alter table public.feedback add column if not exists done_at timestamptz;

-- Добавить админа (только здесь, в SQL Editor; у приложения и функции admin прав на это нет):
--   insert into public.admins (user_id) select id from auth.users where email = 'почта@пример.ru' on conflict do nothing;
-- Кто сейчас админ:
--   select u.email, a.created_at from public.admins a join auth.users u on u.id = a.user_id;
-- Убрать админа:
--   delete from public.admins where user_id = (select id from auth.users where email = 'почта@пример.ru');
