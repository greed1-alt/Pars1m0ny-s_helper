-- Переписка с друзьями (23 октября 2026; просьба пользователя: «добавь пожалуйста возможность вести переписку с друзьями»).
-- Выбор пользователя: текст, событие из календаря (карточка — друг добавляет его к себе одним нажатием) и реакции; пуш о новом —
-- с задержкой до минуты (очередь msg_notify, её разбирает функция reminders); хранится всегда, своё сообщение можно удалить у обоих;
-- удалили друга или аккаунт — переписка удаляется.
-- Выполнить в Supabase → SQL Editor ПОСЛЕ friends.sql (нужна таблица friends). Повторный запуск безопасен; старое приложение не трогает.
-- Таблицы напрямую не видны никому, кроме сервера: читать и писать — только функциями msg_* ниже (security definer). Каждая берёт
-- человека из токена (auth.uid()) и работает только с его перепиской; написать можно только другу (дружба принята).
-- Приложение — js/chat.js; проверка — node tools/test-friends.mjs (с PGLITE_DIR).

create table if not exists public.messages (
  id bigint generated always as identity primary key,
  a uuid not null references auth.users (id) on delete cascade,      -- кто написал
  b uuid not null references auth.users (id) on delete cascade,      -- кому
  body text not null default '' check (char_length(body) <= 2000),
  ev jsonb check (ev is null or (jsonb_typeof(ev) = 'object' and octet_length(ev::text) <= 2000)),   -- событие из календаря
  re jsonb not null default '{}'::jsonb,                              -- реакции: { "<кто>": "❤️" }
  at timestamptz not null default now(),
  read_at timestamptz,                                                -- когда прочитал получатель
  check (a <> b),
  check (char_length(body) > 0 or ev is not null)
);
create index if not exists messages_pair on public.messages (least(a, b), greatest(a, b), id desc);
create index if not exists messages_unread on public.messages (b, a) where read_at is null;
create index if not exists messages_rate on public.messages (a, at desc);
alter table public.messages enable row level security;
revoke all on public.messages from anon, authenticated;

-- Очередь пушей: одна строка на «кому — от кого»; n — сколько новых, body — начало последнего. Прочитал — строка удаляется (пуша не будет)
create table if not exists public.msg_notify (
  to_uid uuid not null references auth.users (id) on delete cascade,
  from_uid uuid not null references auth.users (id) on delete cascade,
  n int not null default 1,
  body text not null default '',
  at timestamptz not null default now(),
  primary key (to_uid, from_uid)
);
alter table public.msg_notify enable row level security;
revoke all on public.msg_notify from anon, authenticated;

-- Отправить другу: текст до 2000 знаков и/или событие (объект до 2 КБ); не чаще 30 сообщений в минуту. Ответ — { id, at }
create or replace function public.msg_send(p_to uuid, p_body text, p_ev jsonb default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); t text := btrim(coalesce(p_body, '')); r public.messages;
begin
  if me is null then raise exception 'auth'; end if;
  if not exists (select 1 from public.friends f where f.ok and ((f.a = me and f.b = p_to) or (f.a = p_to and f.b = me))) then raise exception 'notfriend'; end if;
  if p_ev is not null and (jsonb_typeof(p_ev) <> 'object' or octet_length(p_ev::text) > 2000) then raise exception 'ev'; end if;
  if char_length(t) > 2000 then raise exception 'long'; end if;
  if t = '' and p_ev is null then raise exception 'empty'; end if;
  if (select count(*) from public.messages m where m.a = me and m.at > now() - interval '1 minute') >= 30 then raise exception 'rate'; end if;
  insert into public.messages (a, b, body, ev) values (me, p_to, t, p_ev) returning * into r;
  insert into public.msg_notify (to_uid, from_uid, n, body, at)
  values (p_to, me, 1, left(case when t <> '' then t else '📅 ' || coalesce(nullif(btrim(p_ev->>'title'), ''), 'Событие') end, 120), now())
  on conflict (to_uid, from_uid) do update set n = public.msg_notify.n + 1, body = excluded.body, at = excluded.at;
  return jsonb_build_object('id', r.id, 'at', r.at);
end $$;

-- Переписка с другом: последние p_limit (до 100), новые сверху; p_before — страница раньше. mine — своё
create or replace function public.msg_list(p_peer uuid, p_before bigint default null, p_limit int default 50)
returns table (id bigint, mine boolean, body text, ev jsonb, re jsonb, at timestamptz, read_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.id, m.a = auth.uid(), m.body, m.ev, m.re, m.at, m.read_at from public.messages m
  where auth.uid() is not null and ((m.a = auth.uid() and m.b = p_peer) or (m.a = p_peer and m.b = auth.uid()))
    and (p_before is null or m.id < p_before)
  order by m.id desc limit least(greatest(coalesce(p_limit, 50), 1), 100)
$$;

-- Все переписки: с кем, последнее сообщение (начало) и сколько новых
create or replace function public.msg_threads()
returns table (peer uuid, id bigint, mine boolean, body text, ev boolean, at timestamptz, unread int)
language sql stable security definer set search_path = '' as $$
  select distinct on (x.peer) x.peer, x.id, x.mine, left(x.body, 120), x.ev, x.at,
    (select count(*)::int from public.messages u where u.a = x.peer and u.b = auth.uid() and u.read_at is null)
  from (select case when m.a = auth.uid() then m.b else m.a end as peer, m.id, m.a = auth.uid() as mine, m.body, m.ev is not null as ev, m.at
        from public.messages m where auth.uid() in (m.a, m.b)) x
  order by x.peer, x.id desc
$$;

-- Сколько всего новых (число на кнопке в шапке)
create or replace function public.msg_unread() returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.messages m where m.b = auth.uid() and m.read_at is null
$$;

-- Прочитал переписку с другом: его сообщения — прочитаны, пуш о них уже не нужен. Ответ — сколько отметили
create or replace function public.msg_read(p_peer uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.messages set read_at = now() where a = p_peer and b = auth.uid() and read_at is null;
  get diagnostics n = row_count;
  delete from public.msg_notify where to_uid = auth.uid() and from_uid = p_peer;
  return n;
end $$;

-- Удалить своё сообщение — у обоих
create or replace function public.msg_delete(p_id bigint) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.messages where id = p_id and a = auth.uid();
  return found;
end $$;

-- Реакция на сообщение своей переписки: одна от человека, только из набора; '' — снять
create or replace function public.msg_react(p_id bigint, p_emoji text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare e text := coalesce(p_emoji, '');
begin
  if e <> '' and e <> all (array['❤️', '👍', '😂', '😮', '🔥']) then raise exception 'emoji'; end if;
  update public.messages set re = case when e = '' then re - auth.uid()::text else re || jsonb_build_object(auth.uid()::text, e) end
  where id = p_id and auth.uid() in (a, b);
  return found;
end $$;

-- Удалили из друзей (или отозвали заявку) — переписки и её пушей больше нет
create or replace function public.msg_unfriend() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.messages where (a = old.a and b = old.b) or (a = old.b and b = old.a);
  delete from public.msg_notify where (to_uid = old.a and from_uid = old.b) or (to_uid = old.b and from_uid = old.a);
  return old;
end $$;
revoke all on function public.msg_unfriend() from public, anon, authenticated;
drop trigger if exists msg_unfriend on public.friends;
create trigger msg_unfriend after delete on public.friends for each row execute function public.msg_unfriend();

revoke all on function public.msg_send(uuid, text, jsonb) from public, anon;
revoke all on function public.msg_list(uuid, bigint, int) from public, anon;
revoke all on function public.msg_threads() from public, anon;
revoke all on function public.msg_unread() from public, anon;
revoke all on function public.msg_read(uuid) from public, anon;
revoke all on function public.msg_delete(bigint) from public, anon;
revoke all on function public.msg_react(bigint, text) from public, anon;
grant execute on function public.msg_send(uuid, text, jsonb) to authenticated;
grant execute on function public.msg_list(uuid, bigint, int) to authenticated;
grant execute on function public.msg_threads() to authenticated;
grant execute on function public.msg_unread() to authenticated;
grant execute on function public.msg_read(uuid) to authenticated;
grant execute on function public.msg_delete(bigint) to authenticated;
grant execute on function public.msg_react(bigint, text) to authenticated;
