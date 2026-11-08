-- Parsimony: страница человека по нику (8 ноября 2026, «страница по нику для всех»). Выполнять ПОСЛЕ friends.sql. Повторный запуск безопасен.
-- Решения пользователя: открыть страницу может только вошедший (без входа — отказ); всегда видно то же, что в поиске по нику: ник, имя,
-- значок, рамка и обложка (без фото); по выбору человека (настройка карточки «Видно всем по нику» → feed.pub, по умолчанию всё выключено):
-- достижения (pub.ach), итоги за всё время (pub.tot — числа сервера из fr_stats), девиз и «Обо мне» (pub.about — только если открыто и друзьям,
-- то есть есть в feed.me). Календарь, день рождения, город, неделя — никогда. id человека отдаётся только другу и себе (как в leaders_all).
create or replace function public.profile_page(p_nick text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := auth.uid(); p record; rel text := ''; st jsonb; pub jsonb;
begin
  if me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select user_id, nick, name, ava, feed into p from public.profiles where nick = lower(ltrim(btrim(coalesce(p_nick, '')), '@'));
  if not found then return null; end if;
  if p.user_id = me then rel := 'me';
  else select case when f.ok then 'ok' when f.a = me then 'out' else 'in' end into rel
    from public.friends f where (f.a = me and f.b = p.user_id) or (f.b = me and f.a = p.user_id);
    rel := coalesce(rel, '');
  end if;
  pub := case when jsonb_typeof(p.feed->'pub') = 'object' then p.feed->'pub' else '{}'::jsonb end;
  select s.st into st from public.fr_stats s where s.user_id = p.user_id;
  return jsonb_strip_nulls(jsonb_build_object(
    'nick', p.nick, 'name', p.name, 'ava', p.ava, 'rel', rel,
    'uid', case when rel in ('ok', 'me') then p.user_id end,
    'ach', case when public.fr_truthy(pub->'ach') and jsonb_typeof(p.feed->'ach') = 'array' then p.feed->'ach' end,
    'tot', case when public.fr_truthy(pub->'tot') then jsonb_build_object(
      't', coalesce(st->'tt', p.feed->'tot'->'t'), 'h', coalesce(st->'th', p.feed->'tot'->'h'), 'b', coalesce(st->'b', p.feed->'tot'->'b'), 's', p.feed->'tot'->'s') end,
    'm', case when public.fr_truthy(pub->'about') then p.feed->'me'->'m' end,
    'ab', case when public.fr_truthy(pub->'about') then p.feed->'me'->'ab' end));
end $$;
revoke all on function public.profile_page(text) from public, anon;
grant execute on function public.profile_page(text) to authenticated;
