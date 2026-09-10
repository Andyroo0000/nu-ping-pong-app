-- NU Ping Pong — live scoreboards the club can watch.
--
-- You're at the table with your phone. One player taps a point at a time; the
-- score broadcasts to the other player and to anyone else in the club who
-- wants to follow along. When the match is done it becomes a normal pending
-- match for the opponent to confirm, so nothing about rating changes.
--
-- Additive on top of 0009. Safe to run on a database with real data.

-- ---------------------------------------------------------------------------
-- live_matches
--
-- `scorer` is the single source of authority: exactly one person's taps count.
-- Letting both phones write would double-count points the moment two people
-- both reach for their phone after a rally. The other player can take over
-- scoring, which moves authority rather than sharing it.
--
-- `games` holds completed games as [{"a":11,"b":7}], oriented to player_a and
-- player_b on this row — never to the scorer, who may change mid-match.
--
-- `rally` is the current game's points in order, true meaning a point for
-- player_a. It exists so undo can take back the point that was actually
-- scored. Deriving it from the score instead — decrement whoever is ahead —
-- is wrong the moment the trailing player scores: at 5-3 with B scoring last,
-- that guesses A. points_a/points_b are kept alongside it so the scoreboard
-- and the realtime payload don't have to recount the array.
-- ---------------------------------------------------------------------------
create table if not exists public.live_matches (
  id uuid primary key default gen_random_uuid(),
  player_a uuid not null references public.profiles (id) on delete cascade,
  player_b uuid not null references public.profiles (id) on delete cascade,
  scorer uuid not null references public.profiles (id) on delete cascade,
  best_of integer not null default 3 check (best_of in (1, 3, 5)),
  is_ranked boolean not null default true,
  games jsonb not null default '[]'::jsonb,
  rally jsonb not null default '[]'::jsonb,
  points_a integer not null default 0 check (points_a >= 0),
  points_b integer not null default 0 check (points_b >= 0),
  status text not null default 'live' check (status in ('live', 'finished', 'abandoned')),
  -- The pending match this became, once finished.
  match_id uuid references public.matches (id) on delete set null,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint live_different_players check (player_a <> player_b),
  constraint live_scorer_is_a_player check (scorer in (player_a, player_b))
);

create index if not exists live_matches_status_idx
  on public.live_matches (status, updated_at desc);
create index if not exists live_matches_players_idx
  on public.live_matches (player_a, player_b);

-- Only one live match per player at a time, so "your active game" is always
-- unambiguous and an abandoned one can't linger behind a new one.
create unique index if not exists live_matches_one_per_player_a
  on public.live_matches (player_a) where status = 'live';
create unique index if not exists live_matches_one_per_player_b
  on public.live_matches (player_b) where status = 'live';

alter table public.live_matches enable row level security;

-- Watchable by the whole club: that's the feature. Writes go through the
-- functions below, which check who's allowed to do what.
drop policy if exists "Club members can watch live matches" on public.live_matches;
create policy "Club members can watch live matches"
  on public.live_matches for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- start_live_match
-- ---------------------------------------------------------------------------
create or replace function public.start_live_match(
  p_opponent uuid,
  p_best_of integer default 3,
  p_is_ranked boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_id uuid;
begin
  if v_me is null then
    raise exception 'You must be signed in to start a match.';
  end if;
  if p_opponent = v_me then
    raise exception 'You can''t play yourself.';
  end if;
  if not exists (select 1 from public.profiles where id = p_opponent) then
    raise exception 'That player no longer exists.';
  end if;
  if public.is_blocked_pair(v_me, p_opponent) then
    raise exception 'You can''t start a match with that player.';
  end if;
  if p_best_of not in (1, 3, 5) then
    raise exception 'Matches are one game, best of three, or best of five.';
  end if;

  -- Resume rather than refuse if these two already have one going.
  select id into v_id
  from public.live_matches
  where status = 'live'
    and ((player_a = v_me and player_b = p_opponent)
      or (player_a = p_opponent and player_b = v_me));
  if v_id is not null then
    return v_id;
  end if;

  if exists (
    select 1 from public.live_matches
    where status = 'live' and v_me in (player_a, player_b)
  ) then
    raise exception 'You already have a match in progress. Finish or abandon it first.';
  end if;
  if exists (
    select 1 from public.live_matches
    where status = 'live' and p_opponent in (player_a, player_b)
  ) then
    raise exception 'They''re already in a match right now.';
  end if;

  insert into public.live_matches (player_a, player_b, scorer, best_of, is_ranked)
  values (v_me, p_opponent, v_me, p_best_of, p_is_ranked)
  returning id into v_id;

  -- Playing beats waiting: drop both out of the queue.
  delete from public.queue_entries where user_id in (v_me, p_opponent);

  return v_id;
end;
$$;

grant execute on function public.start_live_match(uuid, integer, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- live_point — add a point, and roll the game or match over if that won it.
--
-- All the rules live here rather than in the app: a game is to 11 but must be
-- won by two, so 10-10 keeps going. Doing this server-side means two phones
-- can't disagree about whether a game ended.
-- ---------------------------------------------------------------------------
create or replace function public.live_point(p_id uuid, p_for_a boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.live_matches;
  new_a integer;
  new_b integer;
  won_a integer;
  won_b integer;
  needed integer;
  new_rally jsonb;
begin
  select * into m from public.live_matches where id = p_id for update;
  if not found then
    raise exception 'Match not found';
  end if;
  if m.status <> 'live' then
    raise exception 'That match is already over.';
  end if;
  if auth.uid() <> m.scorer then
    raise exception 'Only whoever is keeping score can add points.';
  end if;

  new_a := m.points_a + case when p_for_a then 1 else 0 end;
  new_b := m.points_b + case when p_for_a then 0 else 1 end;
  new_rally := m.rally || to_jsonb(p_for_a);

  -- Game over? To 11, win by two.
  if greatest(new_a, new_b) >= 11 and abs(new_a - new_b) >= 2 then
    won_a := (select count(*) from jsonb_array_elements(m.games) g
              where (g->>'a')::int > (g->>'b')::int)
             + case when new_a > new_b then 1 else 0 end;
    won_b := (select count(*) from jsonb_array_elements(m.games) g
              where (g->>'b')::int > (g->>'a')::int)
             + case when new_b > new_a then 1 else 0 end;

    needed := (m.best_of / 2) + 1;

    update public.live_matches
      set games = m.games || jsonb_build_object('a', new_a, 'b', new_b),
          rally = '[]'::jsonb,
          points_a = 0,
          points_b = 0,
          status = case when greatest(won_a, won_b) >= needed then 'finished' else 'live' end,
          updated_at = now()
      where id = p_id;
    return;
  end if;

  update public.live_matches
    set rally = new_rally, points_a = new_a, points_b = new_b, updated_at = now()
    where id = p_id;
end;
$$;

grant execute on function public.live_point(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- live_undo — take back the point that was actually scored.
--
-- Mis-taps are constant when you're holding a paddle, so undo also has to
-- work across a game boundary: a wrong tap that ends a game would otherwise
-- be unrecoverable.
--
-- Reopening a completed game rebuilds a rally from its score, losing the real
-- order of that game's points. The scoreline is what's on screen, so that's
-- acceptable; the loser's points are laid down first so further undos walk
-- back the winner's closing run, which is what someone correcting a mistake
-- expects.
-- ---------------------------------------------------------------------------
create or replace function public.live_undo(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.live_matches;
  last_game jsonb;
  a_won boolean;
  reopened_a integer;
  reopened_b integer;
begin
  select * into m from public.live_matches where id = p_id for update;
  if not found then
    raise exception 'Match not found';
  end if;
  if m.status = 'abandoned' then
    raise exception 'That match was abandoned.';
  end if;
  if auth.uid() <> m.scorer then
    raise exception 'Only whoever is keeping score can undo.';
  end if;

  -- Mid-game: drop the last point actually recorded.
  if jsonb_array_length(m.rally) > 0 then
    update public.live_matches
      set rally = m.rally - (jsonb_array_length(m.rally) - 1),
          points_a = (select count(*) from jsonb_array_elements(
                        m.rally - (jsonb_array_length(m.rally) - 1)) r
                      where r::text = 'true'),
          points_b = (select count(*) from jsonb_array_elements(
                        m.rally - (jsonb_array_length(m.rally) - 1)) r
                      where r::text = 'false'),
          updated_at = now()
      where id = p_id;
    return;
  end if;

  -- Start of a game: reopen the previous one, one point short.
  if jsonb_array_length(m.games) > 0 then
    last_game := m.games -> (jsonb_array_length(m.games) - 1);
    a_won := (last_game->>'a')::int > (last_game->>'b')::int;
    reopened_a := (last_game->>'a')::int - case when a_won then 1 else 0 end;
    reopened_b := (last_game->>'b')::int - case when a_won then 0 else 1 end;

    update public.live_matches
      set games = m.games - (jsonb_array_length(m.games) - 1),
          rally = (
            select coalesce(jsonb_agg(v order by ord), '[]'::jsonb)
            from (
              -- Loser's points first, winner's after, so the next undo walks
              -- back the winning run.
              select (not a_won) as v, g as ord
                from generate_series(1, case when a_won then reopened_b else reopened_a end) g
              union all
              select a_won,
                     (case when a_won then reopened_b else reopened_a end) + g
                from generate_series(1, case when a_won then reopened_a else reopened_b end) g
            ) seq
          ),
          points_a = reopened_a,
          points_b = reopened_b,
          status = 'live',
          updated_at = now()
      where id = p_id;
    return;
  end if;

  raise exception 'Nothing to undo yet.';
end;
$$;

grant execute on function public.live_undo(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- take_scoring — move authority to the other player.
-- ---------------------------------------------------------------------------
create or replace function public.take_scoring(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.live_matches;
begin
  select * into m from public.live_matches where id = p_id for update;
  if not found then
    raise exception 'Match not found';
  end if;
  if auth.uid() not in (m.player_a, m.player_b) then
    raise exception 'You''re not in that match.';
  end if;

  update public.live_matches
    set scorer = auth.uid(), updated_at = now()
    where id = p_id;
end;
$$;

grant execute on function public.take_scoring(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- submit_live_match — turn a finished scoreboard into a pending match.
--
-- The games array is oriented to this row's player_a/player_b, but
-- confirm_match() requires the *reporter* to be player_a and the confirmer to
-- be player_b. So if the scorer is player_b, the score is flipped on the way
-- out. Getting this backwards would hand the wrong person the confirm button
-- and silently invert every result.
-- ---------------------------------------------------------------------------
create or replace function public.submit_live_match(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.live_matches;
  v_reporter uuid;
  v_other uuid;
  v_games jsonb;
  v_won_reporter integer;
  v_won_other integer;
  v_match_id uuid;
begin
  select * into m from public.live_matches where id = p_id for update;
  if not found then
    raise exception 'Match not found';
  end if;
  if m.match_id is not null then
    return m.match_id;
  end if;
  if auth.uid() not in (m.player_a, m.player_b) then
    raise exception 'You''re not in that match.';
  end if;
  if jsonb_array_length(m.games) = 0 then
    raise exception 'No completed games to submit yet.';
  end if;

  v_reporter := auth.uid();
  v_other := case when v_reporter = m.player_a then m.player_b else m.player_a end;

  if v_reporter = m.player_a then
    v_games := m.games;
  else
    -- Flip every game so "a" is the reporter's score.
    select jsonb_agg(jsonb_build_object('a', g->>'b', 'b', g->>'a') order by idx)
      into v_games
      from jsonb_array_elements(m.games) with ordinality as t(g, idx);
  end if;

  select count(*) filter (where (g->>'a')::int > (g->>'b')::int),
         count(*) filter (where (g->>'b')::int > (g->>'a')::int)
    into v_won_reporter, v_won_other
    from jsonb_array_elements(v_games) as t(g);

  if v_won_reporter = v_won_other then
    raise exception 'That match is level — play a decider before submitting.';
  end if;

  insert into public.matches (
    player_a, player_b, games, games_won_a, games_won_b, winner, reported_by, is_ranked
  )
  values (
    v_reporter,
    v_other,
    v_games,
    v_won_reporter,
    v_won_other,
    case when v_won_reporter > v_won_other then v_reporter else v_other end,
    v_reporter,
    m.is_ranked
  )
  returning id into v_match_id;

  update public.live_matches
    set status = 'finished', match_id = v_match_id, updated_at = now()
    where id = p_id;

  return v_match_id;
end;
$$;

grant execute on function public.submit_live_match(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- abandon_live_match — walk away without a result.
-- ---------------------------------------------------------------------------
create or replace function public.abandon_live_match(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.live_matches
    set status = 'abandoned', updated_at = now()
    where id = p_id
      and status = 'live'
      and auth.uid() in (player_a, player_b);

  if not found then
    raise exception 'Couldn''t abandon that match.';
  end if;
end;
$$;

grant execute on function public.abandon_live_match(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- live_now — what the club can watch, newest activity first.
-- ---------------------------------------------------------------------------
create or replace function public.live_now()
returns table (
  id uuid,
  player_a uuid,
  player_b uuid,
  name_a text,
  name_b text,
  avatar_a text,
  avatar_b text,
  best_of integer,
  is_ranked boolean,
  games jsonb,
  points_a integer,
  points_b integer,
  updated_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select l.id, l.player_a, l.player_b,
         coalesce(a.full_name, '@' || a.username),
         coalesce(b.full_name, '@' || b.username),
         a.avatar_path, b.avatar_path,
         l.best_of, l.is_ranked, l.games, l.points_a, l.points_b, l.updated_at
  from public.live_matches l
  join public.profiles a on a.id = l.player_a
  join public.profiles b on b.id = l.player_b
  where l.status = 'live'
    and not public.is_blocked_pair(auth.uid(), l.player_a)
    and not public.is_blocked_pair(auth.uid(), l.player_b)
  order by l.updated_at desc
  limit 20;
$$;

grant execute on function public.live_now() to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime — the scoreboard subscribes to its own row.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'No supabase_realtime publication — skipping realtime setup.';
    return;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'live_matches'
  ) then
    alter publication supabase_realtime add table public.live_matches;
  end if;
end;
$$;

-- An UPDATE only carries the columns Postgres knows changed unless the table
-- publishes full rows, and the scoreboard needs every column on every tick.
alter table public.live_matches replica identity full;
