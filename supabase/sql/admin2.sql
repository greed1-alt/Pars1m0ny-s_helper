-- Parsimony: админка, часть 2 (27 октября 2026) — объявления, настройки без переопубликации, оповещения админам
-- Выполнить один раз ПОСЛЕ admin.sql и push_now.sql: Supabase → SQL Editor → новый сниппет → вставить всё → Run.

-- Настройки приложения: меняет только функция admin (вкладка «Настройки» в админке), читать может любой —
-- там только общее для всех: объявление (ann), плашка «идут работы» (maint), лимит помощника (ai_limit), «помощник пишет сам» (nudge)
create table if not exists public.app_config (
  k text primary key check (k ~ '^[a-z_]{1,40}$'),
  v jsonb not null check (octet_length(v::text) < 4000),
  updated_at timestamptz not null default now()
);
alter table public.app_config enable row level security;
revoke all on public.app_config from anon, authenticated;
grant select on public.app_config to anon, authenticated;
drop policy if exists "app_config: read" on public.app_config;
create policy "app_config: read" on public.app_config for select to anon, authenticated using (true);

-- Оповещения админам: о новом отзыве и о попытке открыть админку без прав — каждое один раз (push_at).
-- То, что было раньше, помечается отправленным — иначе пришла бы сразу пачка старых
alter table public.feedback add column if not exists push_at timestamptz;
alter table public.admin_log add column if not exists push_at timestamptz;
update public.feedback set push_at = now() where push_at is null and created_at < now() - interval '1 minute';
update public.admin_log set push_at = now() where push_at is null;

-- Сразу, а не в начале следующей минуты: та же push_now() из push_now.sql (вызывает функцию reminders с {"queue":true})
drop trigger if exists feedback_push_now on public.feedback;
create trigger feedback_push_now after insert on public.feedback for each statement execute function public.push_now();
drop trigger if exists admin_log_push_now on public.admin_log;
create trigger admin_log_push_now after insert on public.admin_log for each row when (new.action = 'denied') execute function public.push_now();
