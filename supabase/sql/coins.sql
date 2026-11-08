-- Parsimony: ParsiCoins — внутренняя валюта, задания и магазин (28 октября 2026)
-- Выполнить один раз ПОСЛЕ friends.sql: Supabase → SQL Editor → новый сниппет → вставить всё → Run. Повторный запуск безопасен.
-- Выполнять после friends.sql, messages.sql, assistant.sql и push_*.sql (проверка условий смотрит переписку, помощника и подписки).
-- Решения пользователя: монеты — за задания дня и недели (мало), достижения, серию дней подряд и друга в Parsimony (временно);
-- на них — палитры (3 на выбор бесплатно, Индиго — всегда), обложки, рамки аватара и заморозка серии. Денег здесь нет.
-- Баланс, награды и покупки решает только сервер: приложение не может дописать себе монеты или вещь — таблицы закрыты,
-- всё — через функции ниже. Каждая награда выдаётся один раз (ключ), заданий — не больше 3 в день и 3 в неделю.
-- Каталог наград и цен — копия js/shop.js (тест tools/test-coins.mjs сверяет и проверяет функции в настоящем Postgres).

create table if not exists public.coins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  bal int not null default 0 check (bal >= 0),
  updated_at timestamptz not null default now()
);
-- История: награды (d: задание дня, w: недели, a: достижение, s: серия, i: друг), покупки (b:), бесплатные палитры (p:),
-- заморозки (z:день), начисления админа (adm:). Ключ у человека не повторяется — так награду не получить дважды
create table if not exists public.coin_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null check (char_length(key) <= 80),
  amt int not null,
  note text check (note is null or char_length(note) <= 200),
  at timestamptz not null default now(),
  unique (user_id, key)
);
create index if not exists coin_log_user on public.coin_log (user_id, id desc);
-- Купленное: pal:палитра, cv:обложка, fm:рамка — навсегда (n = 1); frz — заморозки серии (n — сколько осталось, не больше 2)
create table if not exists public.coin_items (
  user_id uuid not null references auth.users (id) on delete cascade,
  item text not null check (char_length(item) <= 40),
  n int not null default 1 check (n >= 0),
  free boolean not null default false,   -- палитра из трёх бесплатных
  at timestamptz not null default now(),
  primary key (user_id, item)
);
alter table public.coins enable row level security;
alter table public.coin_log enable row level security;
alter table public.coin_items enable row level security;
revoke all on public.coins, public.coin_log, public.coin_items from anon, authenticated;

-- Сколько монет за награду (null — такой награды нет)
create or replace function public.coin_reward(p_key text) returns int
language plpgsql immutable set search_path = '' as $$
declare
  p text[] := string_to_array(p_key, ':');
  qd text[] := array['t3','tall','hall','fin','bio','note','plan','goal','cheer','msg'];   -- задания дня
  qw text[] := array['t15','h5','f5','b5','g3','n3','pw','ch'];                   -- задания недели
  qm text[] := array['mt60','mh20','mf20','mb20','mg10','mn12'];                  -- задания месяца (8 ноября 2026)
  fs_k text[] := array['prof','hab','rep','rem','cal','bud','ai','push','card','friend','tour'];   -- первые шаги, один раз
  fs_v int[] := array[10,10,10,10,10,10,10,15,10,15,10];
  ach_k text[] := array['first','t50','t300','w7','w30','m100','bio30','ops50','save10k','notes10','goal1','days30'];
  ach_v int[] := array[10,30,80,30,100,30,40,30,50,20,10,50];
  st_k text[] := array['3','7','14','30','60','100'];
  st_v int[] := array[10,25,40,80,120,200];
  q_d int := 5; q_w int := 20; q_m int := 40; q_x int := 20; inv int := 50;   -- q_x — бонус недели (все задания дня 5 дней)
begin
  if p_key is null or char_length(p_key) > 80 then return null; end if;
  if p[1] = 'd' and cardinality(p) = 3 and p[3] = any (qd) then return q_d; end if;
  if p[1] = 'w' and cardinality(p) = 3 and p[3] = any (qw) then return q_w; end if;
  if p[1] = 'm' and cardinality(p) = 3 and p[3] = any (qm) then return q_m; end if;
  if p[1] = 'q' and cardinality(p) = 2 then return q_x; end if;
  if p[1] = 'f' and cardinality(p) = 2 and p[2] = any (fs_k) then return fs_v[array_position(fs_k, p[2])]; end if;
  if p[1] = 'a' and cardinality(p) = 2 and p[2] = any (ach_k) then return ach_v[array_position(ach_k, p[2])]; end if;
  if p[1] = 's' and cardinality(p) = 2 and p[2] = any (st_k) then return st_v[array_position(st_k, p[2])]; end if;
  if p[1] = 'i' and cardinality(p) = 2 then return inv; end if;
  return null;
end $$;

-- Цена вещи (null — такой нет)
create or replace function public.coin_price(p_item text) returns int
language plpgsql immutable set search_path = '' as $$
declare
  p text[] := string_to_array(p_item, ':');
  pal_k text[] := array['sky','midnight','ocean','mint','sage','olive','sand','mocha','coral','rose','plum','lavender','classic','ember','acid','craft','candy','techno','blueprint','note','comic','pixel'];
  pal_s text[] := array['ember','acid','craft','candy','techno','blueprint'];   -- тематические темы по образцам
  pal_u text[] := array['note','comic','pixel'];                     -- необычные темы
  cv_k text[] := array['boreal','neon','gold','cosmos','seaset','berry'];
  fm_k text[] := array['gold','fire','ice','neon','sakura','emerald','rainbow'];
  fm_v int[] := array[200,200,200,200,200,200,300];
  pal_p int := 200; pal_sp int := 400; pal_up int := 500; cv_p int := 150; frz_p int := 50;
begin
  if p_item = 'frz' then return frz_p; end if;
  if cardinality(p) <> 2 then return null; end if;
  if p[1] = 'pal' and p[2] = any (pal_s) then return pal_sp; end if;
  if p[1] = 'pal' and p[2] = any (pal_u) then return pal_up; end if;
  if p[1] = 'pal' and p[2] = any (pal_k) then return pal_p; end if;
  if p[1] = 'cv' and p[2] = any (cv_k) then return cv_p; end if;
  if p[1] = 'fm' and p[2] = any (fm_k) then return fm_v[array_position(fm_k, p[2])]; end if;
  return null;
end $$;

-- Начислить по ключу (один раз). Строка баланса уже заблокирована вызывающей функцией
create or replace function public.coin_add(p_user uuid, p_key text, p_amt int, p_note text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.coin_log (user_id, key, amt, note) values (p_user, p_key, p_amt, p_note) on conflict (user_id, key) do nothing;
  if not found then return false; end if;
  update public.coins set bal = bal + p_amt, updated_at = now() where user_id = p_user;
  if not found then insert into public.coins (user_id, bal) values (p_user, p_amt); end if;
  return true;
end $$;
-- Строка баланса — до всего остального и под замком: два запроса одного человека идут по очереди (лимит заданий не обойти)
create or replace function public.coin_lock(p_user uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare b int;
begin
  insert into public.coins (user_id) values (p_user) on conflict (user_id) do nothing;
  select bal into b from public.coins where user_id = p_user for update;
  return b;
end $$;

-- ---- Честная проверка (8 ноября 2026, просьба пользователя «проверь на дюпы, обходы и баги — всё должно быть честно») ----
-- Раньше сервер верил приложению, что условие выполнено: награду можно было забрать запросом в обход приложения, а пример для пробы
-- засчитывался в достижения. Теперь перед выдачей сервер сам проверяет условие (coin_ok) по записям человека (user_data — приложение
-- сначала отправляет их), переписке, подпискам и т. п. Примеры (demo) не считаются нигде. Привычки по дням (серия, «N дней — все привычки»),
-- самочувствие и записи в финансах по дням — только «вовремя»: день засчитан, если сервер видел его выполненным в тот же день
-- или на следующий (coin_days, записывает триггер при каждом сохранении) — отмеченное задним числом позже не в счёт.
-- Правила — копия js/shop.js (qDone, qSteps, qHabDay, qBio, qLive, qStreak…), тест tools/test-coins.mjs сверяет их на случайных записях.
create table if not exists public.coin_days (
  user_id uuid not null references auth.users (id) on delete cascade,
  k text not null check (k in ('h', 'b', 'f')),   -- h — все свои ежедневные привычки дня, b — самочувствие, f — запись в финансах
  day date not null,
  primary key (user_id, k, day)
);
alter table public.coin_days enable row level security;
revoke all on public.coin_days from anon, authenticated;

create or replace function public.coin_arr(j jsonb) returns jsonb
language sql immutable set search_path = '' as $$ select case when jsonb_typeof(j) = 'array' then j else '[]'::jsonb end $$;
create or replace function public.coin_obj(j jsonb) returns jsonb
language sql immutable set search_path = '' as $$ select case when jsonb_typeof(j) = 'object' then j else '{}'::jsonb end $$;

-- Свои ежедневные привычки (без примеров): журнал, дни недели и начало (1-е число месяца — как hStart в habits.js)
create or replace function public.coin_habs(d jsonb) returns table (lg jsonb, dz jsonb, st text)
language sql immutable set search_path = '' as $$
  select public.coin_obj(x->'log'), public.coin_arr(x->'days'),
    left(coalesce((select min(k collate "C") from jsonb_object_keys(public.coin_obj(x->'log')) k
      where k ~ '^\d{4}-\d{2}-\d{2}$' and (x->>'from' is null or k collate "C" < (x->>'from') collate "C")), x->>'from', '9999-12-31'), 8) || '01'
  from jsonb_array_elements(public.coin_arr(d->'habits')) x
  where jsonb_typeof(x) = 'object' and x->>'kind' = 'daily' and not public.fr_truthy(x->'demo')
$$;
-- Сколько привычек запланировано на день и сколько отмечено (как qHabStat в shop.js)
create or replace function public.coin_hab_stat(d jsonb, dk date, out pl int, out dn int)
language sql immutable set search_path = '' as $$
  select count(*)::int, count(*) filter (where public.fr_truthy(lg->(dk::text)))::int
  from public.coin_habs(d) where dk::text collate "C" >= st collate "C"
    and (jsonb_array_length(dz) = 0 or dz @> jsonb_build_array((extract(isodow from dk)::int + 6) % 7))
$$;
create or replace function public.coin_hab_day(d jsonb, dk date) returns boolean
language sql immutable set search_path = '' as $$ select pl > 0 and dn = pl from public.coin_hab_stat(d, dk) $$;
-- Самочувствие за день — хоть один свой показатель (значения примера — в bio.demoKeys)
create or replace function public.coin_bio_day(d jsonb, dk date) returns boolean
language sql immutable set search_path = '' as $$
  select exists (select 1 from jsonb_object_keys(public.coin_obj(public.coin_obj(d->'bio'->'log')->(dk::text))) id
    where not public.coin_arr(d->'bio'->'demoKeys') @> jsonb_build_array(dk::text || '|' || id))
$$;
-- Запись в финансах за день (не пример)
create or replace function public.coin_fin_day(d jsonb, dk date) returns boolean
language sql immutable set search_path = '' as $$
  select exists (select 1 from jsonb_array_elements(public.coin_arr(d->'fin'->'ops')) o
    where jsonb_typeof(o) = 'object' and o->>'date' = dk::text and not public.fr_truthy(o->'demo'))
$$;
-- Сделано задач (без примеров) за дни [a, b]; p_goal — только шаги целей (задачи с полем goal). Как qDone
create or replace function public.coin_tasks(d jsonb, a date, b date, p_goal boolean) returns int
language sql immutable set search_path = '' as $$
  select coalesce(sum(case
      when jsonb_typeof(e->'repeat') = 'object' and coalesce(e->'repeat'->>'type', '') not in ('', 'none')
        then (select count(*) from jsonb_array_elements(public.coin_arr(e->'doneDates')) y
          where jsonb_typeof(y) = 'string' and (y #>> '{}') collate "C" >= a::text collate "C" and (y #>> '{}') collate "C" <= b::text collate "C")
      when public.fr_truthy(e->'done') and jsonb_typeof(e->'date') = 'string'
        and (e->>'date') collate "C" >= a::text collate "C" and (e->>'date') collate "C" <= b::text collate "C" then 1
      else 0 end), 0)::int
  from jsonb_array_elements(public.coin_arr(d->'events')) e
  where jsonb_typeof(e) = 'object' and public.fr_truthy(e->'task') and not public.fr_truthy(e->'demo') and (not p_goal or public.fr_truthy(e->'goal'))
$$;
-- Шаги к целям за дни [a, b]: задачи целей и отмеченные шаги без срока (doneAt), без примеров. Как qSteps
create or replace function public.coin_steps(d jsonb, a date, b date) returns int
language sql immutable set search_path = '' as $$
  select public.coin_tasks(d, a, b, true) + (select count(*)::int
    from jsonb_array_elements(public.coin_arr(d->'goals')) g, jsonb_array_elements(public.coin_arr(g->'steps')) s
    where jsonb_typeof(g) = 'object' and not public.fr_truthy(g->'demo') and jsonb_typeof(s) = 'object' and public.fr_truthy(s->'done')
      and jsonb_typeof(s->'doneAt') = 'string' and (s->>'doneAt') collate "C" >= a::text collate "C" and (s->>'doneAt') collate "C" <= b::text collate "C")
$$;
-- Заметок (мыслей дня) за дни [a, b]. Как qNotes
create or replace function public.coin_notes(d jsonb, a date, b date) returns int
language sql immutable set search_path = '' as $$
  select count(*)::int from jsonb_array_elements(public.coin_arr(d->'notes')) n
  where jsonb_typeof(n) = 'object' and not public.fr_truthy(n->'demo') and jsonb_typeof(n->'date') = 'string'
    and (n->>'date') collate "C" >= a::text collate "C" and (n->>'date') collate "C" <= b::text collate "C"
$$;
-- Разовых дел (не повторяются, без примеров) с датой в [a, b]. Как qOne
create or replace function public.coin_one(d jsonb, a date, b date) returns int
language sql immutable set search_path = '' as $$
  select count(*)::int from jsonb_array_elements(public.coin_arr(d->'events')) e
  where jsonb_typeof(e) = 'object' and not public.fr_truthy(e->'demo')
    and not (jsonb_typeof(e->'repeat') = 'object' and coalesce(e->'repeat'->>'type', '') not in ('', 'none'))
    and jsonb_typeof(e->'date') = 'string' and (e->>'date') collate "C" >= a::text collate "C" and (e->>'date') collate "C" <= b::text collate "C"
$$;
-- «Сегодня» человека — по его часовому поясу (settings.tz), иначе Москва
create or replace function public.coin_today(d jsonb) returns date
language plpgsql stable set search_path = '' as $$
begin return (now() at time zone coalesce(d->'settings'->>'tz', 'Europe/Moscow'))::date;
exception when others then return (now() at time zone 'Europe/Moscow')::date;
end $$;

-- Дни «вовремя»: при каждом сохранении записей — сегодня и вчера, если они выполнены. Ошибка никогда не мешает сохранить записи
create or replace function public.coin_days_rec(p_user uuid, d jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare t date := public.coin_today(d); x date;
begin
  foreach x in array array[t, t - 1] loop
    if public.coin_hab_day(d, x) then insert into public.coin_days values (p_user, 'h', x) on conflict do nothing; end if;
    if public.coin_bio_day(d, x) then insert into public.coin_days values (p_user, 'b', x) on conflict do nothing; end if;
    if public.coin_fin_day(d, x) then insert into public.coin_days values (p_user, 'f', x) on conflict do nothing; end if;
  end loop;
exception when others then null;
end $$;
create or replace function public.coin_days_upd() returns trigger
language plpgsql security definer set search_path = '' as $$
begin perform public.coin_days_rec(new.user_id, new.data); return null; end $$;
drop trigger if exists coin_days_upd on public.user_data;
create trigger coin_days_upd after insert or update of data on public.user_data for each row execute function public.coin_days_upd();
-- Один раз, когда таблица только появилась: накопленное раньше — по записям (до проверки им доверяли)
do $$ declare r record; t date; x date; k text; begin
  if exists (select 1 from public.coin_days limit 1) then return; end if;
  for r in select user_id, data from public.user_data loop
    t := public.coin_today(r.data);
    for x in select g::date from generate_series(t - 730, t, interval '1 day') g loop
      if public.coin_hab_day(r.data, x) then insert into public.coin_days values (r.user_id, 'h', x) on conflict do nothing; end if;
    end loop;
    for k in select jsonb_object_keys(public.coin_obj(r.data->'bio'->'log')) loop
      if k ~ '^\d{4}-\d{2}-\d{2}$' and k collate "C" <= t::text collate "C" and public.coin_bio_day(r.data, k::date) then insert into public.coin_days values (r.user_id, 'b', k::date) on conflict do nothing; end if;
    end loop;
    insert into public.coin_days select r.user_id, 'f', (o->>'date')::date from jsonb_array_elements(public.coin_arr(r.data->'fin'->'ops')) o
      where jsonb_typeof(o) = 'object' and not public.fr_truthy(o->'demo') and o->>'date' ~ '^\d{4}-\d{2}-\d{2}$' and o->>'date' collate "C" <= t::text collate "C"
      on conflict do nothing;
  end loop;
exception when others then raise warning 'coin_days: %', sqlerrm;
end $$;

-- Серия для монет (как qStreak в shop.js): дни подряд, когда все свои ежедневные привычки отмечены вовремя (coin_days 'h');
-- замороженный день (z: в журнале монет) и сегодня серию не обрывают, дни без запланированных привычек пропускаются → { cur, best }
create or replace function public.coin_streak(p_user uuid, d jsonb, today date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare first text; dd date; run int := 0; best int := 0; pl int; live date[]; fz text[];
begin
  select min(st collate "C") into first from public.coin_habs(d);
  if first is null then return jsonb_build_object('cur', 0, 'best', 0); end if;
  if first collate "C" > today::text collate "C" then first := today::text; end if;
  if first collate "C" < (today - 730)::text collate "C" then first := (today - 730)::text; end if;
  select coalesce(array_agg(day), '{}') into live from public.coin_days where user_id = p_user and k = 'h' and day >= first::date and day <= today;
  select coalesce(array_agg(substr(key, 3)), '{}') into fz from public.coin_log where user_id = p_user and key like 'z:%';
  dd := first::date;
  while dd <= today loop
    select s.pl into pl from public.coin_hab_stat(d, dd) s;
    if pl > 0 and dd = any (live) then run := run + 1; best := greatest(best, run);
    elsif pl > 0 and dd <> today and not (dd::text = any (fz)) then run := 0; end if;
    dd := dd + 1;
  end loop;
  return jsonb_build_object('cur', run, 'best', best);
end $$;

-- Выполнено ли условие награды — по тому, что видит сервер. Ключи заданий уже проверены coins_claim (срок, лимит); q и i — там же
create or replace function public.coin_ok(p_user uuid, p_key text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare p text[] := string_to_array(p_key, ':'); d jsonb; t date; d1 date; d2 date; x text; tz text;
begin
  select data into d from public.user_data where user_id = p_user;
  d := public.coin_obj(d); t := public.coin_today(d);
  tz := case when exists (select 1 from pg_timezone_names where name = d->'settings'->>'tz') then d->'settings'->>'tz' else 'Europe/Moscow' end;
  x := p[cardinality(p)];
  if p[1] = 'd' then
    d1 := p[2]::date;
    return case x
      when 't3' then public.coin_tasks(d, d1, d1, false) >= 3
      when 'tall' then public.coin_tasks(d, d1, d1, false) >= 2
      when 'hall' then public.coin_hab_day(d, d1)
      when 'fin' then public.coin_fin_day(d, d1)
      when 'bio' then public.coin_bio_day(d, d1)
      when 'note' then public.coin_notes(d, d1, d1) >= 1
      when 'plan' then public.coin_one(d, d1 + 1, d1 + 1) >= 1
      when 'goal' then public.coin_steps(d, d1, d1) >= 1
      when 'cheer' then exists (select 1 from public.messages m where m.a = p_user and (m.at at time zone tz)::date = d1
        and split_part(m.body, ' ', 1) in ('💪', '🔥', '👏', '❤️'))
      when 'msg' then exists (select 1 from public.messages m where m.a = p_user and (m.at at time zone tz)::date = d1)
      else false end;
  elsif p[1] in ('w', 'm') then
    d1 := p[2]::date; d2 := case when p[1] = 'w' then d1 + 6 else (d1 + interval '1 month')::date - 1 end;
    return case x
      when 't15' then public.coin_tasks(d, d1, d2, false) >= 15
      when 'mt60' then public.coin_tasks(d, d1, d2, false) >= 60
      when 'h5' then (select count(*) from public.coin_days where user_id = p_user and k = 'h' and day between d1 and d2) >= 5
      when 'mh20' then (select count(*) from public.coin_days where user_id = p_user and k = 'h' and day between d1 and d2) >= 20
      when 'f5' then (select count(*) from public.coin_days where user_id = p_user and k = 'f' and day between d1 and d2) >= 5
      when 'mf20' then (select count(*) from public.coin_days where user_id = p_user and k = 'f' and day between d1 and d2) >= 20
      when 'b5' then (select count(*) from public.coin_days where user_id = p_user and k = 'b' and day between d1 and d2) >= 5
      when 'mb20' then (select count(*) from public.coin_days where user_id = p_user and k = 'b' and day between d1 and d2) >= 20
      when 'g3' then public.coin_steps(d, d1, d2) >= 3
      when 'mg10' then public.coin_steps(d, d1, d2) >= 10
      when 'n3' then public.coin_notes(d, d1, d2) >= 3
      when 'mn12' then public.coin_notes(d, d1, d2) >= 12
      when 'pw' then public.coin_one(d, d1 + 7, d1 + 13) >= 5
      when 'ch' then exists (select 1 from public.fr_challenges c where p_user in (c.a, c.b) and c.week = d1 and c.state in ('on', 'done'))
      else false end;
  elsif p[1] = 'f' then
    return case x
      when 'prof' then btrim(coalesce(d->'settings'->>'name', '')) <> '' and (coalesce(d->'settings'->'avatar'->>'e', '') <> ''
        or coalesce(d->'settings'->'avatar'->>'img', '') ~ '^data:image/(jpeg|png|webp);base64,')
      when 'hab' then exists (select 1 from jsonb_array_elements(public.coin_arr(d->'habits')) h where jsonb_typeof(h) = 'object' and not public.fr_truthy(h->'demo'))
      when 'rep' then exists (select 1 from jsonb_array_elements(public.coin_arr(d->'events')) e where jsonb_typeof(e) = 'object' and not public.fr_truthy(e->'demo')
        and jsonb_typeof(e->'repeat') = 'object' and coalesce(e->'repeat'->>'type', '') not in ('', 'none'))
      when 'rem' then exists (select 1 from jsonb_array_elements(public.coin_arr(d->'events')) e where jsonb_typeof(e) = 'object' and not public.fr_truthy(e->'demo')
        and public.fr_truthy(e->'reminder'->'enabled'))
      when 'cal' then exists (select 1 from jsonb_array_elements(public.coin_arr(d->'cats')) c where jsonb_typeof(c) = 'object'
        and coalesce(c->>'id', '') not in ('work', 'rest', 'walk', 'study'))
      when 'bud' then exists (select 1 from jsonb_array_elements(public.coin_arr(d->'fin'->'cats')) c where jsonb_typeof(c) = 'object'
        and jsonb_typeof(c->'plan') = 'number' and (c->>'plan')::numeric > 0 and not (public.coin_obj(d->'fin'->'demoPlans') ? coalesce(c->>'id', '')))
      when 'ai' then exists (select 1 from public.ai_usage u where u.user_id = p_user and u.n > 0)
      when 'push' then exists (select 1 from public.push_subscriptions s where s.user_id = p_user)
      when 'card' then exists (select 1 from public.profiles r where r.user_id = p_user)
      when 'friend' then exists (select 1 from public.friends f where p_user in (f.a, f.b) and f.ok)
      when 'tour' then public.fr_truthy(d->'settings'->'tourDone')
      else false end;
  elsif p[1] = 'a' then
    return case x
      when 'first' then (public.fr_calc(d, t)->>'tt')::int >= 1
      when 't50' then (public.fr_calc(d, t)->>'tt')::int >= 50
      when 't300' then (public.fr_calc(d, t)->>'tt')::int >= 300
      when 'm100' then (public.fr_calc(d, t)->>'th')::int >= 100
      when 'w7' then (public.coin_streak(p_user, d, t)->>'best')::int >= 7
      when 'w30' then (public.coin_streak(p_user, d, t)->>'best')::int >= 30
      when 'bio30' then (select count(*) from public.coin_days where user_id = p_user and k = 'b') >= 30
      when 'ops50' then (select count(*) from jsonb_array_elements(public.coin_arr(d->'fin'->'ops')) o where jsonb_typeof(o) = 'object' and not public.fr_truthy(o->'demo')) >= 50
      when 'save10k' then coalesce((select sum((o->>'amt')::numeric) from jsonb_array_elements(public.coin_arr(d->'fin'->'ops')) o
        where jsonb_typeof(o) = 'object' and not public.fr_truthy(o->'demo') and jsonb_typeof(o->'amt') = 'number'
          and exists (select 1 from jsonb_array_elements(public.coin_arr(d->'fin'->'cats')) c where jsonb_typeof(c) = 'object' and c->>'id' = o->>'cat' and c->>'g' = 'sav')), 0) >= 10000
      when 'notes10' then (select count(*) from jsonb_array_elements(public.coin_arr(d->'notes')) n where jsonb_typeof(n) = 'object' and not public.fr_truthy(n->'demo')) >= 10
      when 'goal1' then exists (select 1 from jsonb_array_elements(public.coin_arr(d->'goals')) g where jsonb_typeof(g) = 'object' and not public.fr_truthy(g->'demo'))
      -- 30 дней с Parsimony: с settings.since, но не раньше появления аккаунта (дату начала на устройстве можно поменять)
      when 'days30' then t - greatest(case when d->'settings'->>'since' ~ '^\d{4}-\d{2}-\d{2}$' then (d->'settings'->>'since')::date else t end,
        (select (u.created_at at time zone 'Europe/Moscow')::date from auth.users u where u.id = p_user)) + 1 >= 30
      else false end;
  elsif p[1] = 's' then
    return (public.coin_streak(p_user, d, t)->>'best')::int >= x::int;
  end if;
  return p[1] in ('q', 'i');   -- проверены в coins_claim
exception when others then return false;
end $$;

-- Всё своё: баланс, вещи, полученные награды (задания — за 10 дней), дни «вовремя» (ld — для подсчёта в приложении) и история
create or replace function public.coins_state() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  return jsonb_build_object(
    'bal', coalesce((select bal from public.coins where user_id = me), 0),
    'items', coalesce((select jsonb_object_agg(item, n) from public.coin_items where user_id = me), '{}'::jsonb),
    'free', (select count(*) from public.coin_items where user_id = me and free),
    'keys', coalesce((select jsonb_agg(key) from public.coin_log where user_id = me
      and (key ~ '^[asizpf]:' or (key ~ '^[dwq]:' and at > now() - interval '10 days') or (key ~ '^m:' and at > now() - interval '40 days'))), '[]'::jsonb),
    'ld', jsonb_build_object(
      'h', coalesce((select jsonb_agg(day order by day) from public.coin_days where user_id = me and k = 'h' and day > current_date - 800), '[]'::jsonb),
      'b', coalesce((select jsonb_agg(day order by day) from public.coin_days where user_id = me and k = 'b' and day > current_date - 45), '[]'::jsonb),
      'f', coalesce((select jsonb_agg(day order by day) from public.coin_days where user_id = me and k = 'f' and day > current_date - 45), '[]'::jsonb)),
    'lbn', (select count(*) from public.coin_days where user_id = me and k = 'b'),
    'log', coalesce((select jsonb_agg(jsonb_build_object('k', key, 'a', amt, 'n', note, 't', at) order by id desc)
      from (select id, key, amt, note, at from public.coin_log where user_id = me order by id desc limit 40) x), '[]'::jsonb));
end $$;

-- Забрать награду. Задание — только за сегодня (± день на часовые пояса) или эту неделю, не больше 3; месяца — с 1-го числа этого месяца,
-- не больше 2; бонус недели — когда в журнале за эту неделю 5 дней со всеми тремя заданиями дня; первые шаги — один раз;
-- друг — только настоящий друг, который уже пользуется приложением, до 5 друзей (было 10), монеты получают оба.
-- Условие задания, достижения, серии и первого шага сервер проверяет сам (coin_ok); не выполнено — 'early'
create or replace function public.coins_claim(p_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); amt int := public.coin_reward(p_key); p text[] := string_to_array(p_key, ':'); d date; them uuid; bl int;
begin
  if me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if amt is null then return jsonb_build_object('err', 'key'); end if;
  bl := public.coin_lock(me);
  if exists (select 1 from public.coin_log where user_id = me and key = p_key) then return jsonb_build_object('err', 'already'); end if;
  if p[1] in ('d', 'w', 'm', 'q') then
    begin d := p[2]::date; exception when others then return jsonb_build_object('err', 'key'); end;
    if p[2] <> d::text then return jsonb_build_object('err', 'key'); end if;
    if p[1] = 'd' and (d < current_date - 1 or d > current_date + 1) then return jsonb_build_object('err', 'late'); end if;
    if p[1] in ('w', 'q') and (extract(isodow from d) <> 1 or d < current_date - 7 or d > current_date + 1) then return jsonb_build_object('err', 'late'); end if;
    if p[1] = 'm' and (extract(day from d) <> 1 or d < date_trunc('month', current_date - 1)::date or d > date_trunc('month', current_date + 1)::date) then return jsonb_build_object('err', 'late'); end if;
    if p[1] in ('d', 'w') and (select count(*) from public.coin_log where user_id = me and key like p[1] || ':' || p[2] || ':%') >= 3 then return jsonb_build_object('err', 'limit'); end if;
    if p[1] = 'm' and (select count(*) from public.coin_log where user_id = me and key like 'm:' || p[2] || ':%') >= 2 then return jsonb_build_object('err', 'limit'); end if;
    if p[1] = 'q' and (select count(*) from (select 1 from public.coin_log where user_id = me and key like 'd:%'
        and split_part(key, ':', 2) between d::text and (d + 6)::text group by split_part(key, ':', 2) having count(*) >= 3) z) < 5 then return jsonb_build_object('err', 'early'); end if;
  elsif p[1] = 'i' then
    begin them := p[2]::uuid; exception when others then return jsonb_build_object('err', 'key'); end;
    if p[2] <> them::text or them = me then return jsonb_build_object('err', 'key'); end if;
    if not exists (select 1 from public.friends where ((a = me and b = them) or (a = them and b = me)) and ok) then return jsonb_build_object('err', 'friend'); end if;
    if coalesce((select rev from public.user_data where user_id = them), 0) < 3 then return jsonb_build_object('err', 'new'); end if;
    if (select count(*) from public.coin_log where user_id = me and key like 'i:%') >= 5 then return jsonb_build_object('err', 'limit'); end if;
  end if;
  if p[1] in ('d', 'w', 'm', 'f', 'a', 's') and not public.coin_ok(me, p_key) then return jsonb_build_object('err', 'early'); end if;
  perform public.coin_add(me, p_key, amt, null);
  if p[1] = 'i' then
    perform public.coin_lock(them);
    if (select count(*) from public.coin_log where user_id = them and key like 'i:%') < 5 then perform public.coin_add(them, 'i:' || me::text, amt, null); end if;
  end if;
  return jsonb_build_object('ok', true, 'amt', amt, 'bal', bl + amt);
end $$;

-- Купить вещь. Палитра, обложка, рамка — один раз; заморозок — не больше двух про запас
create or replace function public.coins_buy(p_item text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); pr int := public.coin_price(p_item); bl int; cnt int; k int;
begin
  if me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if pr is null then return jsonb_build_object('err', 'item'); end if;
  bl := public.coin_lock(me);
  select i.n into cnt from public.coin_items i where i.user_id = me and i.item = p_item;
  if p_item = 'frz' and coalesce(cnt, 0) >= 2 then return jsonb_build_object('err', 'max'); end if;
  if p_item <> 'frz' and cnt is not null then return jsonb_build_object('err', 'own'); end if;
  if bl < pr then return jsonb_build_object('err', 'money'); end if;
  select count(*) + 1 into k from public.coin_log where user_id = me and key like 'b:' || p_item || ':%';
  if not public.coin_add(me, 'b:' || p_item || ':' || k, -pr, null) then raise exception 'coin_log'; end if;   -- запись не легла — вещь не выдаётся
  insert into public.coin_items (user_id, item) values (me, p_item)
    on conflict (user_id, item) do update set n = public.coin_items.n + 1, at = now();
  return jsonb_build_object('ok', true, 'bal', bl - pr);
end $$;

-- Палитра бесплатно — три на выбор (Индиго — у всех и так)
create or replace function public.coins_pick(p_item text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); bl int;
begin
  if me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  -- бесплатно — только обычные палитры: тематические темы стоят дороже и берутся только за монеты
  if p_item !~ '^pal:' or coalesce(public.coin_price(p_item), 0) <> 200 then return jsonb_build_object('err', 'item'); end if;
  bl := public.coin_lock(me);
  if exists (select 1 from public.coin_items where user_id = me and item = p_item) then return jsonb_build_object('err', 'own'); end if;
  if (select count(*) from public.coin_items where user_id = me and free) >= 3 then return jsonb_build_object('err', 'limit'); end if;
  insert into public.coin_items (user_id, item, free) values (me, p_item, true);
  perform public.coin_add(me, 'p:' || p_item, 0, null);
  return jsonb_build_object('ok', true, 'bal', bl);
end $$;

-- Заморозка серии: прошедший день (не раньше чем 3 дня назад) не обрывает серию. Тратит одну заморозку, тот же день — бесплатно
create or replace function public.coins_freeze(p_day date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); cnt int;
begin
  if me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if p_day is null or p_day < current_date - 3 or p_day > current_date then return jsonb_build_object('err', 'day'); end if;
  perform public.coin_lock(me);
  if exists (select 1 from public.coin_log where user_id = me and key = 'z:' || p_day::text) then return jsonb_build_object('ok', true, 'already', true); end if;
  select i.n into cnt from public.coin_items i where i.user_id = me and i.item = 'frz';
  if coalesce(cnt, 0) < 1 then return jsonb_build_object('err', 'none'); end if;
  update public.coin_items set n = cnt - 1, at = now() where user_id = me and item = 'frz';
  perform public.coin_add(me, 'z:' || p_day::text, 0, null);
  return jsonb_build_object('ok', true, 'n', cnt - 1);
end $$;

-- Админка (функция admin, ключ сервера): начислить или списать (не ниже нуля) с пометкой. Из приложения не вызвать
create or replace function public.coins_admin(p_user uuid, p_amt int, p_note text) returns int
language plpgsql security definer set search_path = '' as $$
declare b int; a int; k int;
begin
  if p_amt is null or p_amt = 0 or abs(p_amt) > 100000 then raise exception 'amt'; end if;
  if not exists (select 1 from auth.users where id = p_user) then raise exception 'user'; end if;
  b := public.coin_lock(p_user);
  a := greatest(p_amt, -b);
  select count(*) + 1 into k from public.coin_log where user_id = p_user and key like 'adm:%';
  insert into public.coin_log (user_id, key, amt, note) values (p_user, 'adm:' || k, a, nullif(left(coalesce(p_note, ''), 200), ''));
  update public.coins set bal = bal + a, updated_at = now() where user_id = p_user;
  return b + a;
end $$;

revoke all on function public.coin_reward(text) from public, anon, authenticated;
revoke all on function public.coin_price(text) from public, anon, authenticated;
revoke all on function public.coin_add(uuid, text, int, text) from public, anon, authenticated;
revoke all on function public.coin_lock(uuid) from public, anon, authenticated;
revoke all on function public.coins_admin(uuid, int, text) from public, anon, authenticated;
revoke all on function public.coin_arr(jsonb) from public, anon, authenticated;
revoke all on function public.coin_obj(jsonb) from public, anon, authenticated;
revoke all on function public.coin_habs(jsonb) from public, anon, authenticated;
revoke all on function public.coin_hab_stat(jsonb, date) from public, anon, authenticated;
revoke all on function public.coin_hab_day(jsonb, date) from public, anon, authenticated;
revoke all on function public.coin_bio_day(jsonb, date) from public, anon, authenticated;
revoke all on function public.coin_fin_day(jsonb, date) from public, anon, authenticated;
revoke all on function public.coin_tasks(jsonb, date, date, boolean) from public, anon, authenticated;
revoke all on function public.coin_steps(jsonb, date, date) from public, anon, authenticated;
revoke all on function public.coin_notes(jsonb, date, date) from public, anon, authenticated;
revoke all on function public.coin_one(jsonb, date, date) from public, anon, authenticated;
revoke all on function public.coin_today(jsonb) from public, anon, authenticated;
revoke all on function public.coin_days_rec(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.coin_days_upd() from public, anon, authenticated;
revoke all on function public.coin_streak(uuid, jsonb, date) from public, anon, authenticated;
revoke all on function public.coin_ok(uuid, text) from public, anon, authenticated;
grant execute on function public.coins_admin(uuid, int, text) to service_role;
revoke all on function public.coins_state() from public, anon;
revoke all on function public.coins_claim(text) from public, anon;
revoke all on function public.coins_buy(text) from public, anon;
revoke all on function public.coins_pick(text) from public, anon;
revoke all on function public.coins_freeze(date) from public, anon;
grant execute on function public.coins_state() to authenticated;
grant execute on function public.coins_claim(text) to authenticated;
grant execute on function public.coins_buy(text) to authenticated;
grant execute on function public.coins_pick(text) to authenticated;
grant execute on function public.coins_freeze(date) to authenticated;
