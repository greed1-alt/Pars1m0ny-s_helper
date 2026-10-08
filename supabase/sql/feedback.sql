-- Parsimony: отзывы бета-тестеров (8 октября 2026)
-- Выполнить один раз: Supabase → SQL Editor → новый сниппет → вставить всё → Run.
-- Отправить отзыв может только вошедший человек; читать отзывы — только владелец проекта в панели (Table Editor → feedback).

create table if not exists public.feedback (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  email text,
  created_at timestamptz not null default now(),
  kind text check (kind in ('unclear', 'inconvenient', 'bug', 'idea', 'other')),
  screen text check (char_length(screen) <= 200),
  body text not null check (char_length(body) between 1 and 4000),
  meta jsonb check (octet_length(meta::text) < 4000)
);

alter table public.feedback enable row level security;
revoke all on public.feedback from anon;

drop policy if exists "feedback: send own" on public.feedback;
create policy "feedback: send own" on public.feedback for insert to authenticated with check ((select auth.uid()) = user_id);
-- Правил на чтение, изменение и удаление нет: из приложения отзывы никто не видит, даже автор отзыва.

-- Кто и когда — ставит сервер (подделать почту или время из приложения нельзя)
create or replace function public.feedback_fill() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.user_id := auth.uid();
  new.email := auth.jwt() ->> 'email';
  new.created_at := now();
  return new;
end $$;
drop trigger if exists feedback_fill on public.feedback;
create trigger feedback_fill before insert on public.feedback
  for each row execute function public.feedback_fill();
