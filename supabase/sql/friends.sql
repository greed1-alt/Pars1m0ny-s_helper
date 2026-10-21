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
-- Общий список лидеров (21 октября 2026) — только по желанию: rank = true, его включает сам человек
alter table public.profiles add column if not exists rank boolean not null default false;
alter table public.profiles enable row level security;
-- Код приглашения меняет только invite_new(): прав на изменение этого столбца у приложения нет
revoke all on public.profiles from anon, authenticated;
grant select, delete on public.profiles to authenticated;
grant insert (user_id, nick, name, ava, feed, rank), update (user_id, nick, name, ava, feed, rank) on public.profiles to authenticated;

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

-- ---- Пуш о заявках (21 октября 2026): очередь, её разбирает функция reminders раз в минуту ----
-- req — «Имя зовёт вас в друзья», ok — «Имя теперь в друзьях». Пишут только функции ниже; читает и отмечает отправленным только сервер
create table if not exists public.fr_notify (
  id bigint generated always as identity primary key,
  to_uid uuid not null references auth.users (id) on delete cascade,
  from_uid uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('req', 'ok')),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists fr_notify_new on public.fr_notify (id) where sent_at is null;
alter table public.fr_notify enable row level security;
revoke all on public.fr_notify from anon, authenticated;
-- Одно и то же — не чаще раза в час (позвал, отозвал, позвал снова — второй пуш не уйдёт)
create or replace function public.fr_notify_add(p_to uuid, p_from uuid, p_kind text) returns void
language sql security definer set search_path = '' as $$
  insert into public.fr_notify (to_uid, from_uid, kind)
  select p_to, p_from, p_kind
  where not exists (select 1 from public.fr_notify n where n.to_uid = p_to and n.from_uid = p_from and n.kind = p_kind and n.created_at > now() - interval '1 hour')
$$;
revoke all on function public.fr_notify_add(uuid, uuid, text) from public, anon, authenticated;

-- ---- Честные очки (21 октября 2026): сервер сам считает числа из записей человека (user_data) — подделать их приложением нельзя ----
-- Те же правила, что в приложении: неделя — frWeekStats (js/friends.js), за всё время — profileStats, серия — habitStreaks (js/pages.js).
-- Тест node tools/test-friends.mjs сверяет с кодом приложения на случайных записях. Правда в JS — «истина» (0, '', false, null — нет)
create or replace function public.fr_truthy(j jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select j is not null and j not in ('null'::jsonb, 'false'::jsonb, '0'::jsonb, '""'::jsonb)
$$;
create or replace function public.fr_calc(d jsonb, today date) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  mon date := today - ((extract(isodow from today)::int + 6) % 7);
  ms text := mon::text; ts text := today::text;
  e jsonb; h jsonb; lg jsonb; k text; v jsonb; dz jsonb;
  wt int := 0; wh int := 0; tt int := 0; th int := 0;
  hs jsonb[] := '{}'; st text[] := '{}'; first text := ts; m text;
  dd date; dk text; pl int; dn int; run int := 0; best int := 0; i int;
begin
  -- Задачи: за неделю — без примеров; за всё время — все (как в профиле)
  if jsonb_typeof(d->'events') = 'array' then
    for e in select * from jsonb_array_elements(d->'events') loop
      continue when jsonb_typeof(e) <> 'object' or not public.fr_truthy(e->'task');
      if jsonb_typeof(e->'repeat') = 'object' and coalesce(e->'repeat'->>'type', '') not in ('', 'none') then
        if jsonb_typeof(e->'doneDates') = 'array' then
          tt := tt + jsonb_array_length(e->'doneDates');
          if not public.fr_truthy(e->'demo') then
            select wt + count(*) into wt from jsonb_array_elements(e->'doneDates') y
              where jsonb_typeof(y) = 'string' and (y #>> '{}') collate "C" >= ms collate "C" and (y #>> '{}') collate "C" <= ts collate "C";
          end if;
        end if;
      elsif public.fr_truthy(e->'done') then
        tt := tt + 1;
        if not public.fr_truthy(e->'demo') and jsonb_typeof(e->'date') = 'string' and (e->>'date') collate "C" >= ms collate "C" and (e->>'date') collate "C" <= ts collate "C" then wt := wt + 1; end if;
      end if;
    end loop;
  end if;
  -- Привычки: отметки за неделю (по дням, без примеров) и за всё время; ежедневные — для серии
  if jsonb_typeof(d->'habits') = 'array' then
    for h in select * from jsonb_array_elements(d->'habits') loop
      continue when jsonb_typeof(h) <> 'object';
      lg := case when jsonb_typeof(h->'log') = 'object' then h->'log' else '{}'::jsonb end;
      th := th + (select count(*) from jsonb_object_keys(lg));
      if not public.fr_truthy(h->'demo') then
        for k, v in select * from jsonb_each(lg) loop
          if public.fr_truthy(v) and k ~ '^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$' and k collate "C" >= ms collate "C" and k collate "C" <= ts collate "C" then wh := wh + 1; end if;
        end loop;
      end if;
      if h->>'kind' = 'daily' then
        m := coalesce(h->>'from', ts);
        for k in select jsonb_object_keys(lg) loop
          if k ~ '^\d{4}-\d{2}-\d{2}$' and k collate "C" < m collate "C" then m := k; end if;
        end loop;
        m := left(m, 8) || '01';
        hs := hs || jsonb_build_object('log', lg, 'days', case when jsonb_typeof(h->'days') = 'array' then h->'days' else '[]'::jsonb end);
        st := st || m;
        if m collate "C" < first collate "C" then first := m; end if;
      end if;
    end loop;
  end if;
  -- Серия: дни подряд, когда выполнены все запланированные ежедневные привычки; сегодня серию не обрывает
  if coalesce(array_length(hs, 1), 0) > 0 then
    if first collate "C" < (today - 730)::text collate "C" then first := (today - 730)::text; end if;
    begin dd := first::date; exception when others then dd := today; end;
    while dd <= today loop
      dk := dd::text; pl := 0; dn := 0;
      for i in 1 .. array_length(hs, 1) loop
        dz := hs[i]->'days';
        if dk collate "C" >= st[i] collate "C" and (jsonb_array_length(dz) = 0 or dz @> jsonb_build_array((extract(isodow from dd)::int + 6) % 7)) then
          pl := pl + 1;
          if public.fr_truthy(hs[i]->'log'->dk) then dn := dn + 1; end if;
        end if;
      end loop;
      if pl > 0 and dn = pl then run := run + 1; best := greatest(best, run);
      elsif pl > 0 and dd <> today then run := 0; end if;
      dd := dd + 1;
    end loop;
  end if;
  return jsonb_build_object('w', ms, 't', wt, 'h', wh, 's', run, 'b', best, 'tt', tt, 'th', th, 'at', ts);
end $$;
revoke all on function public.fr_truthy(jsonb) from public, anon, authenticated;
revoke all on function public.fr_calc(jsonb, date) from public, anon, authenticated;

-- Посчитанное — в fr_stats (каждый видит только свою строку; друзьям — через функции ниже). Считается при каждом сохранении записей
create table if not exists public.fr_stats (
  user_id uuid primary key references auth.users (id) on delete cascade,
  st jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.fr_stats enable row level security;
revoke all on public.fr_stats from anon, authenticated;
grant select on public.fr_stats to authenticated;
drop policy if exists "fr_stats: read own" on public.fr_stats;
create policy "fr_stats: read own" on public.fr_stats for select to authenticated using ((select auth.uid()) = user_id);
-- «Сегодня» — в часовом поясе человека (settings.tz); ошибка подсчёта никогда не мешает сохранить записи
create or replace function public.fr_stats_set(p_user uuid, p_data jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare today date;
begin
  begin today := (now() at time zone coalesce(p_data->'settings'->>'tz', 'Europe/Moscow'))::date;
  exception when others then today := (now() at time zone 'Europe/Moscow')::date; end;
  insert into public.fr_stats (user_id, st, updated_at) values (p_user, public.fr_calc(p_data, today), now())
    on conflict (user_id) do update set st = excluded.st, updated_at = excluded.updated_at;
exception when others then null;
end $$;
revoke all on function public.fr_stats_set(uuid, jsonb) from public, anon, authenticated;
create or replace function public.fr_stats_upd() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.fr_stats_set(new.user_id, new.data);
  return null;
end $$;
revoke all on function public.fr_stats_upd() from public, anon, authenticated;
drop trigger if exists fr_stats_upd on public.user_data;
create trigger fr_stats_upd after insert or update of data on public.user_data
  for each row execute function public.fr_stats_upd();
-- Сразу посчитать для всех, у кого уже есть записи
do $$ declare r record; begin
  for r in select user_id, data from public.user_data loop perform public.fr_stats_set(r.user_id, r.data); end loop;
end $$;

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
    update public.friends set ok = true where a = them and b = me;
    perform public.fr_notify_add(them, me, 'ok'); return 'accepted';
  end if;
  if exists (select 1 from public.friends where (a = me and b = them) or (a = them and b = me)) then return 'already'; end if;
  if (select count(*) from public.friends where a = me and not ok) >= 30
     or (select count(*) from public.friends where me in (a, b)) >= 300 then return 'limit'; end if;
  insert into public.friends (a, b) values (me, them);
  perform public.fr_notify_add(them, me, 'req');
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
  perform public.fr_notify_add(them, me, 'ok');
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
  if not found then return false; end if;
  perform public.fr_notify_add(p_uid, auth.uid(), 'ok');
  return true;
end $$;
create or replace function public.friend_remove(p_uid uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.friends where (a = auth.uid() and b = p_uid) or (a = p_uid and b = auth.uid());
  return found;
end $$;

-- Мои друзья и заявки: 'ok' — друг (с лентой), 'in' — зовут меня, 'out' — я позвал (ленты нет, пока не примут); since — с какого дня.
-- drop — потому что изменился состав столбцов (since, 21 октября 2026): create or replace так не умеет
drop function if exists public.friends_list();
create function public.friends_list()
returns table (uid uuid, nick text, name text, ava jsonb, state text, feed jsonb, updated_at timestamptz, since timestamptz, st jsonb)
language sql stable security definer set search_path = '' as $$
  select o.uid, p.nick, p.name, p.ava,
    case when f.ok then 'ok' when f.a = auth.uid() then 'out' else 'in' end,
    case when f.ok then p.feed end, case when f.ok then p.updated_at end, f.created_at,
    case when f.ok then (select s.st from public.fr_stats s where s.user_id = o.uid) end
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
-- Общий список: только те, кто включил rank; только ник, имя, значок и числа (неделя и за всё время) — календарей и профиля тут нет.
-- uid — только у друзей и у себя (чтобы открыть страницу друга); 500 недавно обновлённых карточек
drop function if exists public.leaders_all();   -- st добавлен 21 октября 2026: состав столбцов изменился
create function public.leaders_all()
returns table (uid uuid, nick text, name text, ava jsonb, wk jsonb, tot jsonb, at text, me boolean, rel text, st jsonb)
language sql stable security definer set search_path = '' as $$
  select case when f.ok or p.user_id = auth.uid() then p.user_id end, p.nick, p.name, p.ava,
    jsonb_build_object('w', p.feed->'wk'->'w', 't', p.feed->'wk'->'t', 'h', p.feed->'wk'->'h', 's', p.feed->'wk'->'s'),
    jsonb_build_object('t', p.feed->'tot'->'t', 'h', p.feed->'tot'->'h'),
    p.feed->>'at', p.user_id = auth.uid(),
    case when p.user_id = auth.uid() then 'me' when f.ok then 'ok' when f.a = auth.uid() then 'out' when f.b = auth.uid() then 'in' else '' end,
    (select s.st from public.fr_stats s where s.user_id = p.user_id)
  from public.profiles p
  left join public.friends f on (f.a = auth.uid() and f.b = p.user_id) or (f.b = auth.uid() and f.a = p.user_id)
  where auth.uid() is not null and p.rank
  order by p.updated_at desc
  limit 500
$$;
revoke all on function public.leaders_all() from public, anon;
grant execute on function public.leaders_all() to authenticated;
revoke all on function public.friends_list() from public, anon;
grant execute on function public.friend_find(text) to authenticated;
grant execute on function public.friend_add(text) to authenticated;
grant execute on function public.friend_invite_peek(text) to authenticated;
grant execute on function public.friend_invite_use(text) to authenticated;
grant execute on function public.invite_new() to authenticated;
grant execute on function public.friend_accept(uuid) to authenticated;
grant execute on function public.friend_remove(uuid) to authenticated;
grant execute on function public.friends_list() to authenticated;
