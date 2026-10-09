-- Parsimony: запуск функции reminders раз в минуту (9 октября 2026)
-- Выполнять ПОСЛЕ того, как функция reminders опубликована (Edge Functions → reminders → Deploy).
-- Supabase → SQL Editor → новый сниппет → вставить всё → заменить ВСТАВЬТЕ_СЮДА на секретный ключ → Run.
-- Секретный ключ: Project Settings → API Keys → Secret keys → default → значок копирования (начинается с sb_secret_).
-- Он хранится в Vault (зашифрованное хранилище Supabase) — в репозиторий и в чат его не вставлять.

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
declare
  v_key text := 'ВСТАВЬТЕ_СЮДА';
  sid uuid;
begin
  if v_key not like 'sb_secret_%' then
    raise exception 'Вставьте секретный ключ sb_secret_… вместо слов ВСТАВЬТЕ_СЮДА (в кавычках оставьте только ключ)';
  end if;
  select id into sid from vault.secrets where name = 'reminders_key';
  if sid is null then perform vault.create_secret(v_key, 'reminders_key', 'Ключ для вызова функции reminders из pg_cron');
  else perform vault.update_secret(sid, v_key); end if;
end $$;

-- Если задание уже было — пересоздаём
select cron.unschedule(jobid) from cron.job where jobname = 'parsimony-reminders';
select cron.schedule('parsimony-reminders', '* * * * *', $job$
  select net.http_post(
    url := 'https://zgasnvubcdprgsypkglh.supabase.co/functions/v1/reminders',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_key')),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000);
$job$);

-- Проверка через пару минут (выполнить отдельно):
--   select status_code, content, created from net._http_response order by created desc limit 5;
-- Ожидается status_code 200 и content вроде {"users":1,"due":0,"sent":0}.
-- Остановить напоминания: select cron.unschedule('parsimony-reminders');
