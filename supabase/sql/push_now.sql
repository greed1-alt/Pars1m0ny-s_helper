-- Parsimony: пуши о сообщениях друзей и заявках в друзья — сразу (27 октября 2026)
-- Раньше их отправляла функция reminders при ежеминутном запуске (reminders_cron.sql) — задержка до минуты.
-- Теперь, как только в очередь msg_notify или fr_notify что-то записано, база тут же вызывает функцию reminders с {"queue":true}:
-- она разбирает только эти очереди (queueTick) и шлёт пуш за пару секунд. Ежеминутный запуск остаётся — напоминания, сводки и страховка.
-- Ключ — тот же reminders_key из Vault (его положил reminders_cron.sql), новый вставлять не нужно.
-- Выполнять ПОСЛЕ reminders_cron.sql и messages.sql: Supabase → SQL Editor → новый сниппет → вставить всё → Run.
-- Старая функция reminders (до 27 октября) на {"queue":true} делает обычный полный запуск — тоже отправит сразу, только дольше.

create extension if not exists pg_net;

create or replace function public.push_now() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform net.http_post(
    url := 'https://zgasnvubcdprgsypkglh.supabase.co/functions/v1/reminders',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_key')),
    body := '{"queue":true}'::jsonb,
    timeout_milliseconds := 10000);
  return null;
end $$;
revoke all on function public.push_now() from public, anon, authenticated;

-- По одному вызову на запрос (for each statement): сообщение — insert … on conflict do update, триггер на insert срабатывает и тогда.
-- Только insert: функция сама меняет fr_notify (sent_at) — триггер на update зациклил бы её
drop trigger if exists msg_notify_now on public.msg_notify;
create trigger msg_notify_now after insert on public.msg_notify for each statement execute function public.push_now();
drop trigger if exists fr_notify_now on public.fr_notify;
create trigger fr_notify_now after insert on public.fr_notify for each statement execute function public.push_now();

-- Проверка (выполнить отдельно, после сообщения другу):
--   select status_code, content, created from net._http_response order by created desc limit 3;
-- Ожидается status_code 200 и content вроде {"users":1,"sent":1}.
-- Вернуть как было (пуши — раз в минуту):
--   drop trigger if exists msg_notify_now on public.msg_notify; drop trigger if exists fr_notify_now on public.fr_notify;
