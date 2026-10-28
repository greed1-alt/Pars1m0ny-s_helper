-- Parsimony: ParsiCoins — внутренняя валюта, задания и магазин (28 октября 2026)
-- Выполнить один раз ПОСЛЕ friends.sql: Supabase → SQL Editor → новый сниппет → вставить всё → Run. Повторный запуск безопасен.
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
  qd text[] := array['t3','tall','hall','fin','bio','note','plan','goal'];   -- задания дня
  qw text[] := array['t15','h5','f5','b5','g3','n3','pw'];                   -- задания недели
  ach_k text[] := array['first','t50','t300','w7','w30','m100','bio30','ops50','save10k','notes10','goal1','days30'];
  ach_v int[] := array[10,30,80,30,100,30,40,30,50,20,10,50];
  st_k text[] := array['3','7','14','30','60','100'];
  st_v int[] := array[10,25,40,80,120,200];
  q_d int := 5; q_w int := 20; inv int := 50;
begin
  if p_key is null or char_length(p_key) > 80 then return null; end if;
  if p[1] = 'd' and cardinality(p) = 3 and p[3] = any (qd) then return q_d; end if;
  if p[1] = 'w' and cardinality(p) = 3 and p[3] = any (qw) then return q_w; end if;
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
  pal_k text[] := array['sky','midnight','ocean','mint','sage','olive','sand','mocha','coral','rose','plum','lavender','classic'];
  cv_k text[] := array['boreal','neon','gold','cosmos','seaset','berry'];
  fm_k text[] := array['gold','fire','ice','neon','sakura','emerald','rainbow'];
  fm_v int[] := array[200,200,200,200,200,200,300];
  pal_p int := 200; cv_p int := 150; frz_p int := 50;
begin
  if p_item = 'frz' then return frz_p; end if;
  if cardinality(p) <> 2 then return null; end if;
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

-- Всё своё: баланс, вещи, полученные награды (задания — за 10 дней) и история
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
      and (key ~ '^[asizp]:' or (key ~ '^[dw]:' and at > now() - interval '10 days'))), '[]'::jsonb),
    'log', coalesce((select jsonb_agg(jsonb_build_object('k', key, 'a', amt, 'n', note, 't', at) order by id desc)
      from (select id, key, amt, note, at from public.coin_log where user_id = me order by id desc limit 40) x), '[]'::jsonb));
end $$;

-- Забрать награду. Задание — только за сегодня (± день на часовые пояса) или эту неделю, не больше 3; друг — только настоящий друг,
-- который уже пользуется приложением, до 10 друзей, монеты получают оба
create or replace function public.coins_claim(p_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); amt int := public.coin_reward(p_key); p text[] := string_to_array(p_key, ':'); d date; them uuid; bl int;
begin
  if me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if amt is null then return jsonb_build_object('err', 'key'); end if;
  bl := public.coin_lock(me);
  if exists (select 1 from public.coin_log where user_id = me and key = p_key) then return jsonb_build_object('err', 'already'); end if;
  if p[1] in ('d', 'w') then
    begin d := p[2]::date; exception when others then return jsonb_build_object('err', 'key'); end;
    if p[2] <> d::text then return jsonb_build_object('err', 'key'); end if;
    if p[1] = 'd' and (d < current_date - 1 or d > current_date + 1) then return jsonb_build_object('err', 'late'); end if;
    if p[1] = 'w' and (extract(isodow from d) <> 1 or d < current_date - 7 or d > current_date + 1) then return jsonb_build_object('err', 'late'); end if;
    if (select count(*) from public.coin_log where user_id = me and key like p[1] || ':' || p[2] || ':%') >= 3 then return jsonb_build_object('err', 'limit'); end if;
  elsif p[1] = 'i' then
    begin them := p[2]::uuid; exception when others then return jsonb_build_object('err', 'key'); end;
    if p[2] <> them::text or them = me then return jsonb_build_object('err', 'key'); end if;
    if not exists (select 1 from public.friends where ((a = me and b = them) or (a = them and b = me)) and ok) then return jsonb_build_object('err', 'friend'); end if;
    if coalesce((select rev from public.user_data where user_id = them), 0) < 3 then return jsonb_build_object('err', 'new'); end if;
    if (select count(*) from public.coin_log where user_id = me and key like 'i:%') >= 10 then return jsonb_build_object('err', 'limit'); end if;
  end if;
  perform public.coin_add(me, p_key, amt, null);
  if p[1] = 'i' then
    perform public.coin_lock(them);
    if (select count(*) from public.coin_log where user_id = them and key like 'i:%') < 10 then perform public.coin_add(them, 'i:' || me::text, amt, null); end if;
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
  perform public.coin_add(me, 'b:' || p_item || ':' || k, -pr, null);
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
  if p_item !~ '^pal:' or public.coin_price(p_item) is null then return jsonb_build_object('err', 'item'); end if;
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
