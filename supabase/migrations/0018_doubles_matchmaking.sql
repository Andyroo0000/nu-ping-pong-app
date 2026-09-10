-- NU Ping Pong — matchmaking for doubles, and doubles match history.
--
-- Additive on top of 0017. Safe to run on a database with real data. The
-- singles functions are rewritten here, but only to add `mode = 'singles'`
-- to what they already did — see the note below for why that isn't optional.
--
-- ---------------------------------------------------------------------------
-- How a doubles match forms
--
-- Singles matchmaking pairs two people, so "search" and "get paired" are the
-- same moment. Doubles needs four, which makes it a gathering problem: you
-- join a doubles queue for your hall, and the fourth person to join is the
-- one who triggers the match for everyone.
--
-- You queue ALONE, not as a pair. Queueing as a pre-arranged pair would mean
-- you already have a partner, and then you don't need matchmaking — you'd use
-- the Doubles page directly, which already works. The point of a queue is to
-- find people you didn't come with.
--
-- Teams are then balanced rather than random: the four are sorted by doubles
-- rating and split 1st+4th against 2nd+3rd. Random teams in a group with any
-- spread produce a blowout about a third of the time; this pairs the strongest
-- player with the weakest, which is the closest split available from four
-- people and is what anyone organising a table does by instinct.
--
-- ---------------------------------------------------------------------------
-- Why the singles functions had to change
--
-- queue_entries has one row per player, so a player is either looking for
-- singles or looking for doubles — which is the behaviour you want, and it's
-- why mode lives on the queue row rather than in a second table.
--
-- But it means find_match_in_hall would happily pair a singles seeker with
-- someone waiting for doubles, and pair_with_player's "Join" button would
-- drag a doubles seeker into a singles match. Both now filter on mode. This
-- is the one part of this migration that touches working code, so the bodies
-- below are otherwise character-for-character what 0007 left behind.
-- ---------------------------------------------------------------------------

alter table public.queue_entries
  add column if not exists mode text not null default 'singles';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'queue_entries_mode_check') then
    alter table public.queue_entries
      add constraint queue_entries_mode_check check (mode in ('singles', 'doubles'));
  end if;
end;
$$;

create index if not exists queue_entries_mode_location_idx
  on public.queue_entries (mode, location) where location is not null;

-- ---------------------------------------------------------------------------
-- find_match_in_hall — as 0007, now singles-only.
-- ---------------------------------------------------------------------------
create or replace function public.find_match_in_hall(
  p_hall text,
  p_play_style text default 'long'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_hall text := nullif(trim(coalesce(p_hall, '')), '');
  v_style text := case when p_play_style = 'quick' then 'quick' else 'long' end;
  v_my_rating integer;
  v_my_pref text;
  v_opponent uuid;
  v_channel_id uuid;
begin
  if v_me is null then
    raise exception 'You must be signed in to find a match.';
  end if;
  if v_hall is null then
    raise exception 'Pick which hall you''re playing in first.';
  end if;

  select rating, play_preference into v_my_rating, v_my_pref
  from public.profiles where id = v_me;
  if v_my_rating is null then
    raise exception 'Your profile is not set up yet.';
  end if;

  insert into public.queue_entries (user_id, location, play_style, mode, joined_at, expires_at)
  values (v_me, v_hall, v_style, 'singles', now(), now() + interval '2 hours')
  on conflict (user_id) do update
    set location = excluded.location,
        play_style = excluded.play_style,
        mode = 'singles',
        joined_at = now(),
        expires_at = excluded.expires_at;

  select q.user_id into v_opponent
  from public.queue_entries q
  join public.profiles p on p.id = q.user_id
  where q.user_id <> v_me
    and q.expires_at > now()
    and q.location = v_hall
    and q.mode = 'singles'
    and not public.is_blocked_pair(v_me, q.user_id)
  order by
    (v_my_pref <> 'both' and p.play_preference <> 'both' and p.play_preference <> v_my_pref),
    (q.play_style <> v_style),
    abs(p.rating - v_my_rating),
    q.joined_at
  limit 1
  for update of q skip locked;

  if v_opponent is null then
    return null;
  end if;

  v_channel_id := public.open_match_channel(v_me, v_opponent);

  insert into public.challenges (challenger, opponent, status, channel_id, responded_at)
  values (v_me, v_opponent, 'accepted', v_channel_id, now());

  delete from public.queue_entries where user_id in (v_me, v_opponent);

  return v_channel_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- pair_with_player — as 0007, but it won't drag a doubles seeker into a
-- singles match.
-- ---------------------------------------------------------------------------
create or replace function public.pair_with_player(p_opponent uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_channel_id uuid;
  v_waiting boolean;
begin
  if v_me is null then
    raise exception 'You must be signed in to do that.';
  end if;
  if p_opponent = v_me then
    raise exception 'You can''t pair with yourself.';
  end if;
  if public.is_blocked_pair(v_me, p_opponent) then
    raise exception 'You can''t pair with that player.';
  end if;

  select true into v_waiting
  from public.queue_entries
  where user_id = p_opponent
    and expires_at > now()
    and mode = 'singles'
  for update skip locked;

  if not coalesce(v_waiting, false) then
    raise exception 'They just got picked up by someone else — try another player.';
  end if;

  v_channel_id := public.open_match_channel(v_me, p_opponent);

  insert into public.challenges (challenger, opponent, status, channel_id, responded_at)
  values (v_me, p_opponent, 'accepted', v_channel_id, now());

  delete from public.queue_entries where user_id in (v_me, p_opponent);

  return v_channel_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- active_queue / queue_elsewhere — carry the mode through.
--
-- Both change return shape, so they're dropped first. queue_elsewhere gets a
-- p_mode parameter with a default; the old one-argument call still resolves,
-- but the old function must go or `queue_elsewhere('hall')` would be
-- ambiguous between the two.
-- ---------------------------------------------------------------------------
create or replace view public.active_queue
with (security_invoker = true) as
  select user_id, location, note, play_style, mode, joined_at, expires_at
  from public.queue_entries
  where expires_at > now();

grant select on public.active_queue to authenticated;

drop function if exists public.queue_elsewhere(text);

create or replace function public.queue_elsewhere(
  p_hall text default null,
  p_mode text default 'singles'
)
returns table (
  user_id uuid,
  username text,
  full_name text,
  rating integer,
  doubles_rating integer,
  location text,
  note text,
  play_style text,
  mode text,
  joined_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select q.user_id, p.username, p.full_name, p.rating, p.doubles_rating,
         q.location, q.note, q.play_style, q.mode, q.joined_at
  from public.queue_entries q
  join public.profiles p on p.id = q.user_id
  where q.user_id <> auth.uid()
    and q.expires_at > now()
    and (p_hall is null or q.location is distinct from p_hall)
    and (p_mode is null or q.mode = p_mode)
    and not public.is_blocked_pair(auth.uid(), q.user_id)
  order by abs(p.rating - coalesce(
    (select rating from public.profiles where id = auth.uid()), 1000
  )), q.joined_at
  limit 25;
$$;

grant execute on function public.queue_elsewhere(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- find_doubles_in_hall — join the doubles queue for a hall, and form a match
-- if this makes four.
--
-- Returns one row either way: `matched` says whether it happened, `waiting`
-- is how many are in that queue now (counting you), so the UI can say
-- "2 waiting — 2 more needed" without a second query.
--
-- Candidates are gathered greedily and each one is checked against everyone
-- already picked, not just against the caller. Blocking has to hold across
-- all six pairings at a table of four; filtering only on "blocked with me"
-- would happily seat two people who blocked each other.
-- ---------------------------------------------------------------------------
create or replace function public.find_doubles_in_hall(p_hall text)
returns table (
  matched boolean,
  waiting integer,
  channel_id uuid,
  partner uuid,
  opponent_1 uuid,
  opponent_2 uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_hall text := nullif(trim(coalesce(p_hall, '')), '');
  v_picked uuid[] := array[]::uuid[];
  v_cand uuid;
  v_four uuid[];
  v_ordered uuid[];
  v_team_a uuid[];
  v_team_b uuid[];
  v_channel uuid;
  v_names text;
  v_waiting integer;
begin
  if v_me is null then
    raise exception 'You must be signed in to find a match.';
  end if;
  if v_hall is null then
    raise exception 'Pick which hall you''re playing in first.';
  end if;
  if not exists (select 1 from public.profiles where id = v_me) then
    raise exception 'Your profile is not set up yet.';
  end if;

  -- Get listed before looking, so four people searching at once still find
  -- each other rather than all seeing an empty queue.
  insert into public.queue_entries (user_id, location, mode, joined_at, expires_at)
  values (v_me, v_hall, 'doubles', now(), now() + interval '2 hours')
  on conflict (user_id) do update
    set location = excluded.location,
        mode = 'doubles',
        joined_at = now(),
        expires_at = excluded.expires_at;

  -- Longest waiting first: a queue people can be skipped in isn't a queue.
  for v_cand in
    select q.user_id
    from public.queue_entries q
    where q.user_id <> v_me
      and q.expires_at > now()
      and q.location = v_hall
      and q.mode = 'doubles'
    order by q.joined_at
    for update of q skip locked
  loop
    if public.is_blocked_pair(v_me, v_cand) then
      continue;
    end if;
    if exists (
      select 1 from unnest(v_picked) as t(other)
      where public.is_blocked_pair(t.other, v_cand)
    ) then
      continue;
    end if;
    v_picked := v_picked || v_cand;
    exit when array_length(v_picked, 1) = 3;
  end loop;

  select count(*)::integer into v_waiting
  from public.queue_entries q
  where q.expires_at > now() and q.location = v_hall and q.mode = 'doubles';

  if coalesce(array_length(v_picked, 1), 0) < 3 then
    return query select false, v_waiting, null::uuid, null::uuid, null::uuid, null::uuid;
    return;
  end if;

  v_four := array[v_me] || v_picked;

  -- Balanced teams: strongest with weakest.
  select array_agg(id order by doubles_rating desc, id) into v_ordered
  from public.profiles where id = any(v_four);

  v_team_a := array[v_ordered[1], v_ordered[4]];
  v_team_b := array[v_ordered[2], v_ordered[3]];

  -- A four-person channel. channel_between() requires exactly two members, so
  -- this can never be mistaken for anyone's private chat.
  select string_agg(coalesce(full_name, '@' || username), ', ' order by doubles_rating desc)
    into v_names
  from public.profiles where id = any(v_four);

  insert into public.channels (kind, title)
  values ('match', 'Doubles: ' || coalesce(v_names, 'four players'))
  returning id into v_channel;

  insert into public.channel_members (channel_id, user_id)
  select v_channel, x from unnest(v_four) as t(x);

  insert into public.messages (channel_id, author_id, body, kind)
  values (
    v_channel,
    null,
    'Doubles is on. Teams are balanced by doubles rating: '
      || (select string_agg(coalesce(p.full_name, '@' || p.username), ' & ')
          from public.profiles p where p.id = any(v_team_a))
      || ' against '
      || (select string_agg(coalesce(p.full_name, '@' || p.username), ' & ')
          from public.profiles p where p.id = any(v_team_b))
      || '. Sort out a table here, then one of you starts the scoreboard.',
    'system'
  );

  delete from public.queue_entries where user_id = any(v_four);

  -- Everything from here is from the caller's point of view.
  return query
  select
    true,
    v_waiting,
    v_channel,
    case when v_me = any(v_team_a)
      then (select x from unnest(v_team_a) as t(x) where x <> v_me)
      else (select x from unnest(v_team_b) as t(x) where x <> v_me) end,
    case when v_me = any(v_team_a) then v_team_b[1] else v_team_a[1] end,
    case when v_me = any(v_team_a) then v_team_b[2] else v_team_a[2] end;
end;
$$;

grant execute on function public.find_doubles_in_hall(text) to authenticated;

-- ---------------------------------------------------------------------------
-- doubles_waiting — how many are in the doubles queue for a hall, so the page
-- can show the state before anyone commits to joining.
-- ---------------------------------------------------------------------------
create or replace function public.doubles_waiting(p_hall text default null)
returns table (location text, waiting integer)
language sql
security definer
stable
set search_path = public
as $$
  select q.location, count(*)::integer
  from public.queue_entries q
  where q.expires_at > now()
    and q.mode = 'doubles'
    and q.location is not null
    and (p_hall is null or q.location = p_hall)
  group by q.location
  order by count(*) desc, q.location;
$$;

grant execute on function public.doubles_waiting(text) to authenticated;

-- ---------------------------------------------------------------------------
-- doubles_history — one player's confirmed doubles matches, from their side.
--
-- Written as a function rather than a PostgREST select because the useful
-- shape needs four profile joins plus "which team was I on" and "what did
-- this do to MY rating" — all four deltas are stored, and picking the right
-- one is the whole point.
-- ---------------------------------------------------------------------------
create or replace function public.doubles_history(p_player uuid, p_limit integer default 10)
returns table (
  id uuid,
  confirmed_at timestamptz,
  won boolean,
  is_ranked boolean,
  games_won_mine integer,
  games_won_theirs integer,
  my_delta integer,
  partner_name text,
  partner_username text,
  opponent_1_name text,
  opponent_2_name text
)
language sql
security definer
stable
set search_path = public
as $$
  with mine as (
    select d.*,
           (p_player in (d.a1, d.a2)) as on_team_a
    from public.doubles_matches d
    where d.status = 'confirmed'
      and p_player in (d.a1, d.a2, d.b1, d.b2)
  ),
  sided as (
    select
      m.id,
      m.confirmed_at,
      m.is_ranked,
      (m.winner_team = 'a') = m.on_team_a as won,
      case when m.on_team_a then m.games_won_a else m.games_won_b end as games_won_mine,
      case when m.on_team_a then m.games_won_b else m.games_won_a end as games_won_theirs,
      case
        when p_player = m.a1 then m.delta_a1
        when p_player = m.a2 then m.delta_a2
        when p_player = m.b1 then m.delta_b1
        else m.delta_b2
      end as my_delta,
      case
        when p_player = m.a1 then m.a2
        when p_player = m.a2 then m.a1
        when p_player = m.b1 then m.b2
        else m.b1
      end as partner_id,
      case when m.on_team_a then m.b1 else m.a1 end as opp1_id,
      case when m.on_team_a then m.b2 else m.a2 end as opp2_id
    from mine m
  )
  select s.id, s.confirmed_at, s.won, s.is_ranked,
         s.games_won_mine, s.games_won_theirs, s.my_delta,
         coalesce(pt.full_name, '@' || pt.username),
         pt.username,
         coalesce(o1.full_name, '@' || o1.username),
         coalesce(o2.full_name, '@' || o2.username)
  from sided s
  join public.profiles pt on pt.id = s.partner_id
  join public.profiles o1 on o1.id = s.opp1_id
  join public.profiles o2 on o2.id = s.opp2_id
  order by s.confirmed_at desc nulls last
  limit greatest(coalesce(p_limit, 10), 1);
$$;

grant execute on function public.doubles_history(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Check it worked.
--
--   -- the queue knows about modes
--   select column_name from information_schema.columns
--   where table_schema='public' and table_name='queue_entries' and column_name='mode';
--
--   -- the new functions exist
--   select to_regproc('public.find_doubles_in_hall') is not null as can_queue,
--          to_regproc('public.doubles_waiting') is not null as can_count,
--          to_regproc('public.doubles_history') is not null as has_history;
--   -- expect true, true, true
--
--   -- and singles matchmaking still only sees singles
--   select prosrc like '%mode = ''singles''%' as filters_mode
--   from pg_proc where proname = 'find_match_in_hall';
--   -- expect true
-- ---------------------------------------------------------------------------
