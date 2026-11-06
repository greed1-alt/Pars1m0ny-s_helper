-- Parsimony: запуск функции reminders раз в минуту (9 октября 2026; с 6 ноября 2026 — свой сервер api.parsimony.ru)
-- Функция вызывается внутри сервера: база → шлюз api-gw:8000 → функция reminders (через интернет запрос не идёт).
-- Ключ вызова — reminders_key в Vault (зашифрованное хранилище базы): секретный ключ сервера sb_secret_… из /opt/supabase/.env.
-- Его кладут в Vault один раз на сервере, не через чат и не в репозиторий:
--   SK=$(grep ^SUPABASE_SECRET_KEY= /opt/supabase/.env | cut -d= -f2-)
--   docker exec -i supabase-db psql -U postgres -d postgres -v k="$SK" -c "select vault.create_secret(:'k', 'reminders_key', 'Ключ для вызова функции reminders из базы')"
-- Выполнять ПОСЛЕ того, как функция reminders лежит в /opt/supabase/volumes/functions/reminders. Повторный запуск безопасен.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Если задание уже было — пересоздаём
select cron.unschedule(jobid) from cron.job where jobname = 'parsimony-reminders';
select cron.schedule('parsimony-reminders', '* * * * *', $job$
  select net.http_post(
    url := 'http://api-gw:8000/functions/v1/reminders',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_key')),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000);
$job$);

-- Проверка через пару минут (выполнить отдельно):
--   select status_code, content, created from net._http_response order by created desc limit 5;
-- Ожидается status_code 200 и content вроде {"users":1,"due":0,"sent":0}.
-- Остановить напоминания: select cron.unschedule('parsimony-reminders');
