-- Parsimony: вызов на неделю между друзьями (7 ноября 2026, «новые действия с другом»).
-- Выполнять ПОСЛЕ friends.sql (друзья, подсчёт недели fr_calc) и coins.sql (награда — coin_add). Повторный запуск безопасен.
-- Как устроено: друг бросает другу вызов на текущую неделю (понедельник — воскресенье по Москве): кто больше задач ('t'), отметок привычек ('h')
-- или очков — задачи + привычки ('p'). Второй принимает или отказывается. Числа считает сервер из записей (fr_calc — те же правила, что у таблицы
-- лидеров), поэтому дописать себе нельзя. Итог прошлой недели подводит ch_list при первом открытии на новой неделе: победителю — 25 ParsiCoins,
-- при ничьей (и не нули) — по 10 обоим; награда — один раз (coin_log, ключ ch:<id>). Одна пара — один вызов в неделю, бросить — не больше трёх в неделю.
-- Честность (8 ноября 2026): считается только с дня, когда вызов приняли (on_day) — иначе в воскресенье можно было вызвать того, кто
-- уже отстал за неделю; у каждого — не больше трёх принятых вызовов в неделю (иначе монеты можно было бы набирать сговором).
-- Пуша здесь нет: приложение само пишет другу сообщение в переписку (msg_send) — оно и приходит уведомлением.
-- Таблица — только через функции (RLS без правил), как coins и messages.

create table if not exists public.fr_challenges (
  id bigint generated always as identity primary key,
  a uuid not null references auth.users (id) on delete cascade,   -- кто бросил вызов
  b uuid not null references auth.users (id) on delete cascade,   -- кому
  kind text not null check (kind in ('t', 'h', 'p')),
  week date not null,                                              -- понедельник недели
  state text not null default 'sent' check (state in ('sent', 'on', 'no', 'done')),
  av int, bv int, winner uuid,                                     -- итог (state = 'done'); winner null — ничья
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  check (a <> b)
);
alter table public.fr_challenges add column if not exists on_day date;   -- когда приняли (по Москве); старые — вся неделя
create unique index if not exists fr_challenges_pair on public.fr_challenges (least(a, b), greatest(a, b), week);
create index if not exists fr_challenges_b on public.fr_challenges (b);
alter table public.fr_challenges enable row level security;
revoke all on public.fr_challenges from anon, authenticated;

-- Понедельник недели, в которую входит день
create or replace function public.ch_monday(p date) returns date
language sql immutable set search_path = '' as $$ select p - ((extract(isodow from p)::int + 6) % 7) $$;
-- Текущая неделя — по Москве
create or replace function public.ch_week() returns date
language sql stable set search_path = '' as $$ select public.ch_monday((now() at time zone 'Europe/Moscow')::date) $$;

-- Число человека за неделю: задачи, отметки привычек или их сумма (fr_calc на воскресенье этой недели) — с дня p_from (вызов принят):
-- неделя целиком минус дни до него
drop function if exists public.ch_val(uuid, date, text);
create or replace function public.ch_val(p_user uuid, p_week date, p_kind text, p_from date default null) returns int
language plpgsql stable security definer set search_path = '' as $$
declare d jsonb; s jsonb; s0 jsonb; t int; h int;
begin
  select data into d from public.user_data where user_id = p_user;
  if d is null then return 0; end if;
  s := public.fr_calc(d, p_week + 6);
  if s->>'w' is distinct from p_week::text then return 0; end if;
  t := coalesce((s->>'t')::int, 0); h := coalesce((s->>'h')::int, 0);
  if p_from is not null and p_from > p_week and p_from <= p_week + 6 then
    s0 := public.fr_calc(d, p_from - 1);
    t := greatest(0, t - coalesce((s0->>'t')::int, 0)); h := greatest(0, h - coalesce((s0->>'h')::int, 0));
  end if;
  return case p_kind when 't' then t when 'h' then h else t + h end;
exception when others then return 0;
end $$;

-- Бросить вызов другу
create or replace function public.ch_send(p_to uuid, p_kind text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); wk date := public.ch_week(); nid bigint;
begin
  if me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if p_to is null or p_to = me or p_kind is null or p_kind not in ('t', 'h', 'p') then return jsonb_build_object('err', 'bad'); end if;
  if not exists (select 1 from public.friends where ok and ((a = me and b = p_to) or (a = p_to and b = me))) then return jsonb_build_object('err', 'notfriend'); end if;
  if (select count(*) from public.fr_challenges where a = me and week = wk) >= 3 then return jsonb_build_object('err', 'limit'); end if;
  insert into public.fr_challenges (a, b, kind, week) values (me, p_to, p_kind, wk) on conflict do nothing returning id into nid;
  if nid is null then return jsonb_build_object('err', 'exists'); end if;
  return jsonb_build_object('ok', true, 'id', nid);
end $$;

-- Ответить на вызов: принять или отказаться (только тот, кого вызвали, и только на этой неделе). Принять — если у обоих
-- меньше трёх принятых вызовов на этой неделе; считаться будет с сегодняшнего дня
create or replace function public.ch_answer(p_id bigint, p_ok boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); wk date := public.ch_week(); them uuid;
begin
  if me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select a into them from public.fr_challenges where id = p_id and b = me and state = 'sent' and week = wk for update;
  if not found then return false; end if;
  if p_ok and ((select count(*) from public.fr_challenges c where c.week = wk and c.state in ('on', 'done') and me in (c.a, c.b)) >= 3
      or (select count(*) from public.fr_challenges c where c.week = wk and c.state in ('on', 'done') and them in (c.a, c.b)) >= 3) then return false; end if;
  update public.fr_challenges set state = case when p_ok then 'on' else 'no' end, on_day = case when p_ok then (now() at time zone 'Europe/Moscow')::date end
    where id = p_id;
  return true;
end $$;

-- Подвести итог вызова прошлой недели — один раз (кто первым открыл приложение на новой неделе)
create or replace function public.ch_settle(p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare r record; x int; y int; w uuid;
begin
  update public.fr_challenges set state = 'done', settled_at = now()
    where id = p_id and state = 'on' and week < public.ch_week() returning a, b, kind, week, on_day into r;
  if not found then return; end if;
  x := public.ch_val(r.a, r.week, r.kind, r.on_day); y := public.ch_val(r.b, r.week, r.kind, r.on_day);
  perform public.coin_lock(least(r.a, r.b)); perform public.coin_lock(greatest(r.a, r.b));   -- баланс — под замком, как в coins.sql
  w := case when x > y then r.a when y > x then r.b end;
  update public.fr_challenges set av = x, bv = y, winner = w where id = p_id;
  if w is not null then perform public.coin_add(w, 'ch:' || p_id, 25, 'Вызов на неделю: победа');
  elsif x > 0 then perform public.coin_add(r.a, 'ch:' || p_id, 10, 'Вызов на неделю: ничья'); perform public.coin_add(r.b, 'ch:' || p_id, 10, 'Вызов на неделю: ничья');
  end if;
end $$;

-- Мои вызовы этой и прошлой недели — с другом, числами и итогом. Заодно подводит итоги прошлых недель и закрывает
-- вызовы прошлых недель, на которые не ответили
create or replace function public.ch_list() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); wk date := public.ch_week(); r record;
begin
  if me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  for r in select id from public.fr_challenges where (a = me or b = me) and state = 'on' and week < wk loop perform public.ch_settle(r.id); end loop;
  update public.fr_challenges set state = 'no' where (a = me or b = me) and state = 'sent' and week < wk;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', c.id, 'peer', case when c.a = me then c.b else c.a end, 'mine', c.a = me, 'kind', c.kind, 'week', c.week, 'state', c.state,
      'my', case when c.state = 'done' then (case when c.a = me then c.av else c.bv end)
                 when c.state = 'on' then public.ch_val(me, c.week, c.kind, c.on_day) end,
      'their', case when c.state = 'done' then (case when c.a = me then c.bv else c.av end)
                    when c.state = 'on' then public.ch_val(case when c.a = me then c.b else c.a end, c.week, c.kind, c.on_day) end,
      'won', case when c.state = 'done' and c.winner is not null then c.winner = me end,
      'coins', case when c.state = 'done' then (select l.amt from public.coin_log l where l.user_id = me and l.key = 'ch:' || c.id) end
    ) order by c.id desc)
    from public.fr_challenges c
    where (c.a = me or c.b = me) and c.week >= wk - 7 and not (c.state = 'no' and c.week < wk)), '[]'::jsonb);
end $$;

revoke all on function public.ch_monday(date) from public, anon;
revoke all on function public.ch_week() from public, anon;
revoke all on function public.ch_val(uuid, date, text, date) from public, anon, authenticated;
revoke all on function public.ch_settle(bigint) from public, anon, authenticated;
revoke all on function public.ch_send(uuid, text) from public, anon;
revoke all on function public.ch_answer(bigint, boolean) from public, anon;
revoke all on function public.ch_list() from public, anon;
grant execute on function public.ch_monday(date) to authenticated;
grant execute on function public.ch_week() to authenticated;
grant execute on function public.ch_send(uuid, text) to authenticated;
grant execute on function public.ch_answer(bigint, boolean) to authenticated;
grant execute on function public.ch_list() to authenticated;
