-- Parsimony: открытая регистрация (29 октября 2026)
-- Выполнить один раз: Supabase → SQL Editor → новый сниппет → вставить всё → Run. Повторный запуск безопасен.
-- Регистрацию в самом Supabase НЕ включать (Authentication → «Allow new users to sign up» остаётся выключенным):
-- аккаунты создаёт только функция signup — после проверки «я не робот» (Яндекс SmartCaptcha) и лимитов.
-- Открывает и закрывает регистрацию админ: Админка → Настройки → «Регистрация» (app_config: signup_on, signup_day, captcha).
-- Журнал попыток — для лимитов: сколько раз с одного адреса за час и сколько новых аккаунтов за сутки.
-- Ни почты, ни самого адреса здесь нет — только отпечаток адреса (HMAC с ключом сервера); старше 30 дней — удаляется.

create table if not exists public.signup_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  ip text not null check (char_length(ip) <= 64),
  ok boolean not null default false,
  why text check (why is null or char_length(why) <= 20)   -- new — создан, exists — уже был, ip / day / captcha — отказ
);
create index if not exists signup_log_ip on public.signup_log (ip, at);
create index if not exists signup_log_at on public.signup_log (at);
alter table public.signup_log enable row level security;
revoke all on public.signup_log from anon, authenticated;
