-- Parsimony: закрыть таблицу push_subscriptions (9 октября 2026)
-- Выполнить один раз: Supabase → SQL Editor → новый сниппет → вставить всё → Run.
-- Подписка из приложения выключена (PUSH_SUBSCRIBE = false), а правило «anyone can subscribe» разрешало
-- кому угодно добавлять строки: мусор и чужие адреса, на которые потом ушла бы рассылка (Security Advisor: «RLS Policy Always True»).
-- После этого таблицу читает и меняет только сервер (функция clever-task работает с service_role и RLS не замечает).
-- Вернуть подписку — вместе с личными уведомлениями: колонка user_id и правило «только свои строки» для authenticated.

do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'push_subscriptions' loop
    execute format('drop policy %I on public.push_subscriptions', p.policyname);
  end loop;
end $$;

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
