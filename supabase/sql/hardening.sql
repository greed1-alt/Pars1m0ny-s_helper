-- Parsimony: убрать лишние права (6 ноября 2026, проверка на дыры).
-- Supabase по умолчанию даёт ролям anon / authenticated все права на новые таблицы, правила RLS потом сужают их до «только своё».
-- Но TRUNCATE правила RLS не проверяет, а TRIGGER и REFERENCES приложению не нужны. Через API (PostgREST) ими не воспользоваться,
-- снаружи база закрыта — это запас прочности на случай, если когда-нибудь что-то откроется.
-- Служебные таблицы supabase_functions (журнал вебхуков базы) мы не используем, а гостям там открыто всё — закрываем.
-- Приложение не затрагивает (и старое в main тоже). Повторный запуск безопасен. Выполнять после остальных файлов.

revoke truncate, trigger, references on all tables in schema public from anon, authenticated;

do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'supabase_functions') then
    execute 'revoke all on all tables in schema supabase_functions from anon, authenticated';
  end if;
end $$;
