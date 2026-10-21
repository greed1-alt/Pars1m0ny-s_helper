-- Parsimony: друзья (21 октября 2026)
-- Выполнить один раз: Supabase → SQL Editor → новый сниппет → вставить всё → Run. Повторный запуск безопасен.
-- Старая версия приложения про эти таблицы не знает и работает как раньше.
--
-- profiles — карточка человека для друзей: ник (один на всех), имя, значок, «лента» — то, что он сам разрешил показывать друзьям
--            (выбранные календари и числа недели для таблицы), и код ссылки-приглашения. Пишет её только сам человек.
-- friends  — дружба: кто кого позвал (a → b) и принято ли (ok).
-- Чужие карточки видны только через функции ниже: по нику — имя и значок (чтобы узнать человека), ленту — только принятым друзьям.
-- Удаление аккаунта удаляет и карточку, и все дружбы (on delete cascade).

-- ---- Недоступные ники и имена: та же проверка, что nameBad в js/names.js (тест: node tools/test-friends.mjs) ----
-- Списки — копия NB_* из names.js. Меняете там — поменяйте и здесь, тест сверит.
create or replace function public.name_forms(s text) returns text[]
language plpgsql immutable set search_path = '' as $$
declare
  nb_safe text[] := array['хлеб','колеб','треб','греб','скреб','стеб','небу','страху','психу','педикюр','педикул','спидр','упорн','спорн','жоплин','бадминтон','badminton','huey','uporn','sporn'];
  di_k text[] := array['shch','sch','sh','ch','zh','kh','ts','ya','yu','yo','ye','ja','ju'];
  di_v text[] := array['щ','щ','ш','ч','ж','х','ц','я','ю','е','е','я','ю'];
  w text; x text; y text; tr text := ''; i int := 1; j int; hit boolean; out text[] := '{}';
begin
  foreach w in array nb_safe loop s := replace(s, w, ' '); end loop;
  -- транслит: сначала сочетания (shch, sh, zh…), слева направо, как регулярное выражение в names.js
  while i <= char_length(s) loop
    hit := false;
    for j in 1 .. array_length(di_k, 1) loop
      if substr(s, i, char_length(di_k[j])) = di_k[j] then tr := tr || di_v[j]; i := i + char_length(di_k[j]); hit := true; exit; end if;
    end loop;
    if not hit then tr := tr || substr(s, i, 1); i := i + 1; end if;
  end loop;
  foreach x in array array[
    s,
    translate(s, '01346abcehkminoprtuxy@$', 'оизчбавсенкмипоргтихуас'),   -- латиница и цифры, похожие на русские буквы (NB_VIS)
    translate(tr, '01346abvgdezijklmnoprstufhcxywq@$', 'оизчбабвгдезижклмнопрстуфхцхивкас')   -- транслит по буквам (NB_TR)
  ] loop
    x := regexp_replace(x, '[ьъ]', '', 'g');
    foreach w in array nb_safe loop x := replace(x, w, ' '); end loop;
    foreach y in array array[x, regexp_replace(x, '(.)\1+', '\1', 'g')] loop
      out := out || y || regexp_replace(y, '[^a-zа-я ]', '', 'g');
    end loop;
  end loop;
  return out;
end $$;

-- '' — можно; 'rude' — грубое; 'reserved' — похоже на служебное
create or replace function public.name_bad(p text) returns text
language plpgsql immutable set search_path = '' as $$
declare
  nb_any text[] := array['хуи','хуе','хуя','хую','пизд','пезд','ебан','ебат','ебал','ебаш','ебну','ебуч','ебет','ебис','ебош','ебло','еблан','уеб','заеб','выеб','наеб','поеб','отеб','разеб','долбое','долбае','бляд','блят','мудак','мудил','мудач','залуп','мандавош','гандон','гондон','шлюх','шлух','шалав','херня','нахер','похер','пидор','пидар','пидр','педераст','педрил','педик','говн','дермо','дроч','сран','ублюд','жоп','минет','порн','трахат','трахал','трахну','трахни','ниггер','гитлер','нацист','фашист','зигхаил','террорист','fuck','bullshit','bitch','asshole','whore','slut','porn','penis','retard','faggot','motherf','nigger','nigga','hitler','siegheil'];
  nb_start text[] := array['бля','cunt','pussy','twat','shit','wank'];
  nb_exact text[] := array['сука','сукин','сучка','сучара','сучонок','жид','жиды','чурка','чурки','негр','негры','хач','игил','cock','dick','fag','nazi','nazis'];
  nb_res_any text[] := array['админ','admin','модератор','moderator','поддержк','support','парсимон','parsimony','официальн','official'];
  nb_res_exact text[] := array['root','system','null','undefined','mod','moder','модер'];
  low text; toks text[]; whole text[]; words text[] := '{}'; t text;
begin
  low := regexp_replace(coalesce(p, ''), '([a-zа-яё])([A-ZА-ЯЁ])', '\1 \2', 'g');   -- BigAdmin → big admin
  low := lower(translate(low, 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ', 'абвгдеёжзийклмнопрстуфхцчшщъыьэюя'));
  low := regexp_replace(normalize(low, NFKD), '[̀-ͯ]', '', 'g');   -- й → и, ё → е
  toks := array(select x from regexp_split_to_table(low, '[^a-zа-я0-9@$]+') x where x <> '');
  if coalesce(cardinality(toks), 0) = 0 then return ''; end if;
  whole := public.name_forms(array_to_string(toks, ''));
  foreach t in array toks loop words := words || public.name_forms(t); end loop;
  words := array(select x from unnest(words || whole) f2, regexp_split_to_table(f2, ' ') x where x <> '');
  if exists (select 1 from unnest(whole) f1, unnest(nb_any) w1 where strpos(f1, w1) > 0)
     or strpos(regexp_replace(low, '[^0-9]', '', 'g'), '1488') > 0
     or exists (select 1 from unnest(words) w2 where w2 = any(nb_exact) or exists (select 1 from unnest(nb_start) s2 where starts_with(w2, s2))) then
    return 'rude';
  end if;
  if exists (select 1 from unnest(whole) f1, unnest(nb_res_any) w1 where strpos(f1, w1) > 0)
     or exists (select 1 from unnest(words) w2 where w2 = any(nb_res_exact)) then
    return 'reserved';
  end if;
  return '';
end $$;
revoke all on function public.name_forms(text) from public, anon;
revoke all on function public.name_bad(text) from public, anon;
grant execute on function public.name_forms(text) to authenticated;
grant execute on function public.name_bad(text) to authenticated;

-- ---- Карточка для друзей ----
create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  nick text unique check (nick ~ '^[a-z0-9_.]{3,24}$'),
  name text not null default '' check (char_length(name) <= 40),
  ava jsonb not null default '{}'::jsonb check (octet_length(ava::text) < 300),
  feed jsonb not null default '{}'::jsonb check (octet_length(feed::text) < 300000),   -- не больше ~300 КБ
  invite text not null unique default replace(gen_random_uuid()::text, '-', ''),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
-- Код приглашения меняет только invite_new(): прав на изменение этого столбца у приложения нет
revoke all on public.profiles from anon, authenticated;
grant select, delete on public.profiles to authenticated;
grant insert (user_id, nick, name, ava, feed), update (user_id, nick, name, ava, feed) on public.profiles to authenticated;

drop policy if exists "profiles: read own" on public.profiles;
drop policy if exists "profiles: insert own" on public.profiles;
drop policy if exists "profiles: update own" on public.profiles;
drop policy if exists "profiles: delete own" on public.profiles;
create policy "profiles: read own" on public.profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy "profiles: insert own" on public.profiles for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "profiles: update own" on public.profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "profiles: delete own" on public.profiles for delete to authenticated using ((select auth.uid()) = user_id);

-- Админы (сам Parsimony): им можно служебные ники и имена — admin, parsimony, поддержка; грубые — никому.
-- Добавляет только владелец проекта здесь, в SQL Editor (у приложения прав на запись нет):
--   insert into public.admins (user_id) select id from auth.users where email = 'почта@пример.ru' on conflict do nothing;
-- Каждый видит только свою строку — так приложение узнаёт, что вы админ, и не мешает вводить такой ник
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;
grant select on public.admins to authenticated;
drop policy if exists "admins: read own" on public.admins;
create policy "admins: read own" on public.admins for select to authenticated using ((select auth.uid()) = user_id);

-- Ник — проверка на сервере (обойти приложение не выйдет); недоступное имя друзья просто не увидят.
-- Служебное (reserved) пропускается только админу: строку admins триггер видит по тем же правилам — только свою
create or replace function public.profiles_check() returns trigger
language plpgsql set search_path = '' as $$
declare adm boolean := exists (select 1 from public.admins where user_id = auth.uid()); r text;
begin
  new.updated_at := now();
  if new.nick is not null and (tg_op = 'INSERT' or new.nick is distinct from old.nick) then
    r := public.name_bad(new.nick);
    if r = 'rude' or (r = 'reserved' and not adm) then raise exception 'nick_bad' using errcode = '22023'; end if;
  end if;
  if tg_op = 'INSERT' or new.name is distinct from old.name then
    r := public.name_bad(new.name);
    if r = 'rude' or (r = 'reserved' and not adm) then new.name := ''; end if;
  end if;
  return new;
end $$;
drop trigger if exists profiles_check on public.profiles;
create trigger profiles_check before insert or update on public.profiles
  for each row execute function public.profiles_check();

-- ---- Дружба ----
create table if not exists public.friends (
  a uuid not null references auth.users (id) on delete cascade,   -- кто позвал
  b uuid not null references auth.users (id) on delete cascade,   -- кого позвали
  ok boolean not null default false,                               -- принято
  created_at timestamptz not null default now(),
  primary key (a, b),
  check (a <> b)
);
create unique index if not exists friends_pair on public.friends (least(a, b), greatest(a, b));   -- одна пара — одна строка
create index if not exists friends_b on public.friends (b);
alter table public.friends enable row level security;
revoke all on public.friends from anon, authenticated;
grant select on public.friends to authenticated;   -- менять — только функциями ниже
drop policy if exists "friends: read own" on public.friends;
create policy "friends: read own" on public.friends for select to authenticated using ((select auth.uid()) in (a, b));

-- Найти человека по нику: имя, значок и кто он мне ('me', 'ok' — друг, 'out' — я позвал, 'in' — позвали меня, '' — никто)
create or replace function public.friend_find(p_nick text)
returns table (nick text, name text, ava jsonb, rel text)
language sql stable security definer set search_path = '' as $$
  select p.nick, p.name, p.ava,
    case when p.user_id = auth.uid() then 'me' when f.ok then 'ok' when f.a = auth.uid() then 'out' when f.b = auth.uid() then 'in' else '' end
  from public.profiles p
  left join public.friends f on (f.a = auth.uid() and f.b = p.user_id) or (f.b = auth.uid() and f.a = p.user_id)
  where auth.uid() is not null and p.nick = lower(ltrim(btrim(p_nick), '@'))
$$;

-- Позвать в друзья по нику. Ответ: 'sent' — заявка ушла; 'accepted' — он уже звал меня, теперь друзья;
-- 'already' — уже друзья или заявка уже есть; 'notfound'; 'self'; 'noprofile' — у меня ещё нет карточки; 'limit' — слишком много заявок
create or replace function public.friend_add(p_nick text) returns text
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); them uuid;
begin
  if me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where user_id = me) then return 'noprofile'; end if;
  select user_id into them from public.profiles where nick = lower(ltrim(btrim(p_nick), '@'));
  if them is null then return 'notfound'; end if;
  if them = me then return 'self'; end if;
  if exists (select 1 from public.friends where a = them and b = me and not ok) then
    update public.friends set ok = true where a = them and b = me; return 'accepted';
  end if;
  if exists (select 1 from public.friends where (a = me and b = them) or (a = them and b = me)) then return 'already'; end if;
  if (select count(*) from public.friends where a = me and not ok) >= 30
     or (select count(*) from public.friends where me in (a, b)) >= 300 then return 'limit'; end if;
  insert into public.friends (a, b) values (me, them);
  return 'sent';
end $$;

-- Ссылка-приглашение: кто прислал ссылку, тот уже согласен — друзья сразу, без заявки
create or replace function public.friend_invite_peek(p_code text)
returns table (nick text, name text, ava jsonb, rel text)
language sql stable security definer set search_path = '' as $$
  select p.nick, p.name, p.ava,
    case when p.user_id = auth.uid() then 'me' when f.ok then 'ok' when f.a = auth.uid() then 'out' when f.b = auth.uid() then 'in' else '' end
  from public.profiles p
  left join public.friends f on (f.a = auth.uid() and f.b = p.user_id) or (f.b = auth.uid() and f.a = p.user_id)
  where auth.uid() is not null and p_code ~ '^[0-9a-f]{32}$' and p.invite = p_code
$$;
create or replace function public.friend_invite_use(p_code text) returns text
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); them uuid;
begin
  if me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where user_id = me) then return 'noprofile'; end if;
  if p_code !~ '^[0-9a-f]{32}$' then return 'notfound'; end if;
  select user_id into them from public.profiles where invite = p_code;
  if them is null then return 'notfound'; end if;
  if them = me then return 'self'; end if;
  if exists (select 1 from public.friends where ((a = me and b = them) or (a = them and b = me)) and ok) then return 'already'; end if;
  if (select count(*) from public.friends where me in (a, b)) >= 300 then return 'limit'; end if;
  update public.friends set ok = true where (a = me and b = them) or (a = them and b = me);
  if not found then insert into public.friends (a, b, ok) values (them, me, true); end if;
  return 'accepted';
end $$;
-- Новая ссылка-приглашение (старая перестаёт работать)
create or replace function public.invite_new() returns text
language sql security definer set search_path = '' as $$
  update public.profiles set invite = replace(gen_random_uuid()::text, '-', '') where user_id = auth.uid() returning invite
$$;

-- Принять заявку / убрать друга, отклонить или отозвать заявку
create or replace function public.friend_accept(p_uid uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.friends set ok = true where a = p_uid and b = auth.uid() and not ok;
  return found;
end $$;
create or replace function public.friend_remove(p_uid uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.friends where (a = auth.uid() and b = p_uid) or (a = p_uid and b = auth.uid());
  return found;
end $$;

-- Мои друзья и заявки: 'ok' — друг (с лентой), 'in' — зовут меня, 'out' — я позвал (ленты нет, пока не примут)
create or replace function public.friends_list()
returns table (uid uuid, nick text, name text, ava jsonb, state text, feed jsonb, updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select o.uid, p.nick, p.name, p.ava,
    case when f.ok then 'ok' when f.a = auth.uid() then 'out' else 'in' end,
    case when f.ok then p.feed end, case when f.ok then p.updated_at end
  from public.friends f
  cross join lateral (select case when f.a = auth.uid() then f.b else f.a end as uid) o
  left join public.profiles p on p.user_id = o.uid
  where auth.uid() in (f.a, f.b)
$$;

revoke all on function public.friend_find(text) from public, anon;
revoke all on function public.friend_add(text) from public, anon;
revoke all on function public.friend_invite_peek(text) from public, anon;
revoke all on function public.friend_invite_use(text) from public, anon;
revoke all on function public.invite_new() from public, anon;
revoke all on function public.friend_accept(uuid) from public, anon;
revoke all on function public.friend_remove(uuid) from public, anon;
revoke all on function public.friends_list() from public, anon;
grant execute on function public.friend_find(text) to authenticated;
grant execute on function public.friend_add(text) to authenticated;
grant execute on function public.friend_invite_peek(text) to authenticated;
grant execute on function public.friend_invite_use(text) to authenticated;
grant execute on function public.invite_new() to authenticated;
grant execute on function public.friend_accept(uuid) to authenticated;
grant execute on function public.friend_remove(uuid) to authenticated;
grant execute on function public.friends_list() to authenticated;
