-- NU Ping Pong — doubles, with its own rating.
--
-- Additive on top of 0015. Safe to run on a database with real players and
-- matches: nothing here changes a singles rating, a singles match, or the
-- singles ladder.
--
-- ---------------------------------------------------------------------------
-- Two decisions worth explaining
--
-- 1. Doubles gets a SEPARATE rating (profiles.doubles_rating) rather than
--    feeding the singles number. Doubles is a different skill — positioning
--    and rotation matter more than a third-ball attack — and a shared number
--    would let a weak player carried by a strong partner collect singles
--    rating they didn't earn. The cost is that a new doubles rating means
--    nothing until people have played, which is why placements (K=64 for the
--    first ten) apply here too.
--
-- 2. Results live in a NEW table, but live scoring reuses live_matches.
--
--    matches has `winner uuid` — one player — and is referenced by
--    rating_history and challenges. Widening it would make winner ambiguous
--    and force every aggregate over profiles.wins/losses to know about
--    doubles. So doubles results get doubles_matches.
--
--    live_matches, though, never stores a winner: it's two sides, a and b,
--    and a game of doubles is scored exactly like a game of singles — to 11,
--    win by two, same rotation-agnostic tally. So it gains nullable
--    partner_a/partner_b, and live_point and live_undo need NO changes at
--    all. One scoreboard, one set of scoring rules, no chance of the two
--    drifting apart.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- The doubles rating
--
-- No column-level UPDATE grant, deliberately. 0005 revoked blanket update on
-- profiles and grants only the columns a player may edit; these three are
-- written by confirm_doubles_match and nothing else, exactly like rating.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists doubles_rating integer not null default 1000,
  add column if not exists doubles_wins integer not null default 0,
  add column if not exists doubles_losses integer not null default 0;

-- ---------------------------------------------------------------------------
-- doubles_matches
--
-- Teams are (a1, a2) and (b1, b2). The reporter is always on team A, which is
-- how the log form builds it — you pick your partner, then your opponents —
-- and it mirrors singles, where the reporter is player_a and player_b holds
-- the confirm button. Confirmation must come from the other team.
--
-- Four delta columns rather than one: each player's change uses their own K,
-- so a placement player and a settled one in the same match move by different
-- amounts. Storing one number would make three of them a lie.
-- ---------------------------------------------------------------------------
create table if not exists public.doubles_matches (
  id uuid primary key default gen_random_uuid(),
  a1 uuid not null references public.profiles (id),
  a2 uuid not null references public.profiles (id),
  b1 uuid not null references public.profiles (id),
  b2 uuid not null references public.profiles (id),
  games jsonb not null,
  games_won_a integer not null,
  games_won_b integer not null,
  -- A team wins, not a player.
  winner_team text not null check (winner_team in ('a', 'b')),
  reported_by uuid not null references public.profiles (id),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'declined')),
  is_ranked boolean not null default true,
  delta_a1 integer,
  delta_a2 integer,
  delta_b1 integer,
  delta_b2 integer,
  played_at timestamptz not null default now(),
  confirmed_at timestamptz,
  constraint doubles_four_distinct_players check (
    a1 <> a2 and b1 <> b2
    and a1 <> b1 and a1 <> b2
    and a2 <> b1 and a2 <> b2
  ),
  constraint doubles_reporter_is_on_team_a check (reported_by in (a1, a2))
);

create index if not exists doubles_matches_status_idx
  on public.doubles_matches (status, played_at desc);
create index if not exists doubles_matches_team_a_idx on public.doubles_matches (a1, a2);
create index if not exists doubles_matches_team_b_idx on public.doubles_matches (b1, b2);

alter table public.doubles_matches enable row level security;

drop policy if exists "Doubles matches are viewable by club members" on public.doubles_matches;
create policy "Doubles matches are viewable by club members"
  on public.doubles_matches for select
  to authenticated
  using (true);

drop policy if exists "A player can report a doubles match they played" on public.doubles_matches;
create policy "A player can report a doubles match they played"
  on public.doubles_matches for insert
  to authenticated
  with check (
    auth.uid() = reported_by
    and auth.uid() in (a1, a2)
  );

-- No update policy: confirming and declining go through the functions below.

-- ---------------------------------------------------------------------------
-- rating_history gains a mode, so the profile chart can show either ladder
-- without doubles results appearing as jumps in a singles graph.
-- ---------------------------------------------------------------------------
alter table public.rating_history
  add column if not exists mode text not null default 'singles',
  add column if not exists doubles_match_id uuid references public.doubles_matches (id);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'rating_history_mode_check'
  ) then
    alter table public.rating_history
      add constraint rating_history_mode_check check (mode in ('singles', 'doubles'));
  end if;
end;
$$;

create index if not exists rating_history_player_mode_idx
  on public.rating_history (player_id, mode, created_at);

-- ---------------------------------------------------------------------------
-- live_matches learns about partners.
--
-- Both null = singles. Both set = doubles. One set is meaningless, so the
-- constraint rules it out rather than leaving a half-doubles row possible.
-- ---------------------------------------------------------------------------
alter table public.live_matches
  add column if not exists partner_a uuid references public.profiles (id) on delete cascade,
  add column if not exists partner_b uuid references public.profiles (id) on delete cascade,
  -- match_id references matches, so a doubles result needs its own pointer.
  -- Without it submit_live_match has no way to tell it already ran, and
  -- tapping Submit twice would create two pending doubles matches.
  add column if not exists doubles_match_id uuid references public.doubles_matches (id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'live_partners_come_in_pairs') then
    alter table public.live_matches
      add constraint live_partners_come_in_pairs
      check ((partner_a is null) = (partner_b is null));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'live_partners_are_distinct') then
    alter table public.live_matches
      add constraint live_partners_are_distinct
      check (
        partner_a is null or (
          partner_a <> player_a and partner_a <> player_b and partner_a <> partner_b
          and partner_b <> player_a and partner_b <> player_b
        )
      );
  end if;
end;
$$;

-- The scorer may now be any of the four. Replacing the old two-player check.
alter table public.live_matches drop constraint if exists live_scorer_is_a_player;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'live_scorer_is_in_the_match') then
    alter table public.live_matches
      add constraint live_scorer_is_in_the_match
      -- Written this way on purpose: `scorer in (a, b, partner_a, partner_b)`
      -- is NULL rather than false for an outsider when the partners are null,
      -- and a check constraint passes on NULL. That would silently stop
      -- rejecting a scorer who isn't in the match at all.
      check (
        scorer in (player_a, player_b)
        or (partner_a is not null and scorer in (partner_a, partner_b))
      );
  end if;
end;
$$;

-- Backstops for "one live match per player", matching the two that already
-- exist on player_a and player_b. The real enforcement is in the start
-- functions, which check all four seats before inserting.
create unique index if not exists live_matches_one_per_partner_a
  on public.live_matches (partner_a) where status = 'live' and partner_a is not null;
create unique index if not exists live_matches_one_per_partner_b
  on public.live_matches (partner_b) where status = 'live' and partner_b is not null;

-- ---------------------------------------------------------------------------
-- live_seats — every player in a live match, singles or doubles.
--
-- Written once here so the checks below can't disagree about who counts as
-- being in a match. Doing it inline four times is how you end up with undo
-- allowing a partner that abandon doesn't.
-- ---------------------------------------------------------------------------
create or replace function public.live_seats(m public.live_matches)
returns uuid[]
language sql
immutable
as $$
  select array_remove(array[m.player_a, m.player_b, m.partner_a, m.partner_b], null);
$$;

-- ---------------------------------------------------------------------------
-- start_live_doubles — a scoreboard for four.
-- ---------------------------------------------------------------------------
create or replace function public.start_live_doubles(
  p_partner uuid,
  p_opponent_1 uuid,
  p_opponent_2 uuid,
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
  v_seat uuid;
  v_all uuid[];
begin
  if v_me is null then
    raise exception 'You must be signed in to start a match.';
  end if;

  v_all := array[v_me, p_partner, p_opponent_1, p_opponent_2];

  if p_partner is null or p_opponent_1 is null or p_opponent_2 is null then
    raise exception 'Doubles needs a partner and two opponents.';
  end if;
  if (select count(distinct x) from unnest(v_all) x) <> 4 then
    raise exception 'Doubles needs four different players.';
  end if;
  if (select count(*) from public.profiles where id = any(v_all)) <> 4 then
    raise exception 'One of those players no longer exists.';
  end if;
  if p_best_of not in (1, 3, 5) then
    raise exception 'Matches are one game, best of three, or best of five.';
  end if;

  -- Blocking has to hold across all six pairings, not just the two facing
  -- each other: being put on a table with someone you blocked is the thing
  -- blocking is for.
  foreach v_seat in array v_all loop
    if exists (
      select 1 from unnest(v_all) as t(other)
      where t.other <> v_seat and public.is_blocked_pair(v_seat, t.other)
    ) then
      raise exception 'Two of those players have blocked each other.';
    end if;
  end loop;

  -- Nobody can be in two live matches at once, in any seat.
  foreach v_seat in array v_all loop
    if exists (
      select 1 from public.live_matches l
      where l.status = 'live' and v_seat = any(public.live_seats(l))
    ) then
      if v_seat = v_me then
        raise exception 'You already have a match in progress. Finish or abandon it first.';
      end if;
      raise exception 'One of those players is already in a match right now.';
    end if;
  end loop;

  insert into public.live_matches
    (player_a, partner_a, player_b, partner_b, scorer, best_of, is_ranked)
  values (v_me, p_partner, p_opponent_1, p_opponent_2, v_me, p_best_of, p_is_ranked)
  returning id into v_id;

  -- Playing beats waiting.
  delete from public.queue_entries where user_id = any(v_all);

  return v_id;
end;
$$;

grant execute on function public.start_live_doubles(uuid, uuid, uuid, integer, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- take_scoring / abandon_live_match — widened to all four seats.
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
  if auth.uid() is null or not (auth.uid() = any(public.live_seats(m))) then
    raise exception 'You''re not in that match.';
  end if;

  update public.live_matches
    set scorer = auth.uid(), updated_at = now()
    where id = p_id;
end;
$$;

create or replace function public.abandon_live_match(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.live_matches;
begin
  select * into m from public.live_matches where id = p_id for update;
  if not found or m.status <> 'live'
     or auth.uid() is null or not (auth.uid() = any(public.live_seats(m))) then
    raise exception 'Couldn''t abandon that match.';
  end if;

  update public.live_matches
    set status = 'abandoned', updated_at = now()
    where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- submit_live_match — branches on whether this was doubles.
--
-- The flip is the same idea as before, extended: confirm_doubles_match needs
-- the reporter on team A, so if the submitter was on side b, both seats swap
-- along with the scores.
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
  v_flip boolean;
  v_a1 uuid;
  v_a2 uuid;
  v_b1 uuid;
  v_b2 uuid;
begin
  select * into m from public.live_matches where id = p_id for update;
  if not found then
    raise exception 'Match not found';
  end if;
  if m.match_id is not null then
    return m.match_id;
  end if;
  if m.doubles_match_id is not null then
    return m.doubles_match_id;
  end if;
  if auth.uid() is null or not (auth.uid() = any(public.live_seats(m))) then
    raise exception 'You''re not in that match.';
  end if;
  if jsonb_array_length(m.games) = 0 then
    raise exception 'No completed games to submit yet.';
  end if;

  v_reporter := auth.uid();
  v_flip := v_reporter in (m.player_b, m.partner_b);

  if v_flip then
    -- Flip every game so "a" is the reporting side's score.
    select jsonb_agg(
             jsonb_build_object('a', (g->>'b')::int, 'b', (g->>'a')::int)
             order by idx
           )
      into v_games
      from jsonb_array_elements(m.games) with ordinality as t(g, idx);
  else
    v_games := m.games;
  end if;

  select count(*) filter (where (g->>'a')::int > (g->>'b')::int),
         count(*) filter (where (g->>'b')::int > (g->>'a')::int)
    into v_won_reporter, v_won_other
    from jsonb_array_elements(v_games) as t(g);

  if v_won_reporter = v_won_other then
    raise exception 'That match is level — play a decider before submitting.';
  end if;

  if m.partner_a is null then
    v_other := case when v_reporter = m.player_a then m.player_b else m.player_a end;

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
  else
    -- Reporting side first, and the reporter first within it, so the row
    -- satisfies doubles_reporter_is_on_team_a however the four were seated.
    if v_flip then
      v_a1 := v_reporter;
      v_a2 := case when v_reporter = m.player_b then m.partner_b else m.player_b end;
      v_b1 := m.player_a;
      v_b2 := m.partner_a;
    else
      v_a1 := v_reporter;
      v_a2 := case when v_reporter = m.player_a then m.partner_a else m.player_a end;
      v_b1 := m.player_b;
      v_b2 := m.partner_b;
    end if;

    insert into public.doubles_matches (
      a1, a2, b1, b2, games, games_won_a, games_won_b,
      winner_team, reported_by, is_ranked
    )
    values (
      v_a1, v_a2, v_b1, v_b2, v_games, v_won_reporter, v_won_other,
      case when v_won_reporter > v_won_other then 'a' else 'b' end,
      v_reporter,
      m.is_ranked
    )
    returning id into v_match_id;
  end if;

  update public.live_matches
    set status = 'finished',
        match_id = case when m.partner_a is null then v_match_id end,
        doubles_match_id = case when m.partner_a is not null then v_match_id end,
        updated_at = now()
    where id = p_id;

  return v_match_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- confirm_doubles_match — the doubles ladder's only writer.
--
-- Same model as confirm_match: expected score from ratings, `actual` blended
-- with point margin, each player's own K. The one difference is that expected
-- comes from each TEAM's average rating.
--
-- Averaging is the standard approach and it has a known limitation worth
-- stating: a strong player partnered with a weak one is predicted as their
-- mean, so carrying someone to a win pays less than the strong player's
-- singles form would suggest, and the weak partner gains more (higher K).
-- Over many partners it averages out, which is what a doubles rating is
-- measuring — how well you do in doubles, not how good you are alone.
-- ---------------------------------------------------------------------------
create or replace function public.confirm_doubles_match(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.doubles_matches;
  rating_a1 integer;
  rating_a2 integer;
  rating_b1 integer;
  rating_b2 integer;
  played_a1 integer;
  played_a2 integer;
  played_b1 integer;
  played_b2 integer;
  team_a numeric;
  team_b numeric;
  games_a integer;
  games_b integer;
  share_a numeric;
  evidence numeric;
  expected_a numeric;
  actual_a numeric;
  actual_b numeric;
  a_won boolean;
  gain numeric;
  drop_ numeric;
  margin_weight constant numeric := 0.35;
  floor_rating constant integer := 100;
begin
  select * into m from public.doubles_matches where id = p_match_id for update;

  if not found then
    raise exception 'Match not found';
  end if;
  if m.status <> 'pending' then
    raise exception 'Match already resolved';
  end if;
  if auth.uid() not in (m.b1, m.b2) then
    raise exception 'Only the other team can confirm this match';
  end if;

  if not m.is_ranked then
    update public.doubles_matches
      set status = 'confirmed', confirmed_at = now(),
          delta_a1 = 0, delta_a2 = 0, delta_b1 = 0, delta_b2 = 0
      where id = p_match_id;
    return;
  end if;

  select doubles_rating, doubles_wins + doubles_losses into rating_a1, played_a1
    from public.profiles where id = m.a1;
  select doubles_rating, doubles_wins + doubles_losses into rating_a2, played_a2
    from public.profiles where id = m.a2;
  select doubles_rating, doubles_wins + doubles_losses into rating_b1, played_b1
    from public.profiles where id = m.b1;
  select doubles_rating, doubles_wins + doubles_losses into rating_b2, played_b2
    from public.profiles where id = m.b2;

  team_a := (rating_a1 + rating_a2) / 2.0;
  team_b := (rating_b1 + rating_b2) / 2.0;

  games_a := m.games_won_a;
  games_b := m.games_won_b;
  a_won := m.winner_team = 'a';

  evidence := case
    when greatest(games_a, games_b) <= 1 then 0.60
    when greatest(games_a, games_b) = 2 then 1.00
    else 1.20
  end;

  share_a := public.match_point_share(m.games, true);
  if share_a is null then
    share_a := games_a::numeric / (games_a + games_b);
  end if;

  expected_a := 1.0 / (1.0 + power(10.0, (team_b - team_a) / 400.0));

  actual_a := (1 - margin_weight) * (case when a_won then 1 else 0 end)
              + margin_weight * share_a;
  actual_b := (1 - margin_weight) * (case when a_won then 0 else 1 end)
              + margin_weight * (1 - share_a);

  -- The winning side's surplus and the losing side's shortfall, before each
  -- player's own K scales them.
  if a_won then
    gain := actual_a - expected_a;
    drop_ := (1 - expected_a) - actual_b;
  else
    gain := actual_b - (1 - expected_a);
    drop_ := expected_a - actual_a;
  end if;

  -- Winners: at least +1. Losers: at least -1, never below the floor.
  update public.doubles_matches set
    delta_a1 = case when a_won
      then greatest(round(public.elo_k(rating_a1, played_a1) * evidence * gain)::integer, 1)
      else -least(
             greatest(round(public.elo_k(rating_a1, played_a1) * evidence * drop_)::integer, 1),
             greatest(rating_a1 - floor_rating, 0))
      end,
    delta_a2 = case when a_won
      then greatest(round(public.elo_k(rating_a2, played_a2) * evidence * gain)::integer, 1)
      else -least(
             greatest(round(public.elo_k(rating_a2, played_a2) * evidence * drop_)::integer, 1),
             greatest(rating_a2 - floor_rating, 0))
      end,
    delta_b1 = case when a_won
      then -least(
             greatest(round(public.elo_k(rating_b1, played_b1) * evidence * drop_)::integer, 1),
             greatest(rating_b1 - floor_rating, 0))
      else greatest(round(public.elo_k(rating_b1, played_b1) * evidence * gain)::integer, 1)
      end,
    delta_b2 = case when a_won
      then -least(
             greatest(round(public.elo_k(rating_b2, played_b2) * evidence * drop_)::integer, 1),
             greatest(rating_b2 - floor_rating, 0))
      else greatest(round(public.elo_k(rating_b2, played_b2) * evidence * gain)::integer, 1)
      end,
    status = 'confirmed',
    confirmed_at = now()
  where id = p_match_id;

  -- Apply them. Reading the deltas back rather than recomputing means the
  -- number stored on the match and the number added to the profile cannot
  -- disagree.
  select * into m from public.doubles_matches where id = p_match_id;

  -- Win/loss comes from which team won, not from the sign of the delta: a
  -- player already at the rating floor takes a 0 delta and would otherwise
  -- have the loss go unrecorded.
  update public.profiles p set
    doubles_rating = p.doubles_rating + d.delta,
    doubles_wins = p.doubles_wins + case when d.won then 1 else 0 end,
    doubles_losses = p.doubles_losses + case when d.won then 0 else 1 end
  from (
    values (m.a1, m.delta_a1, a_won), (m.a2, m.delta_a2, a_won),
           (m.b1, m.delta_b1, not a_won), (m.b2, m.delta_b2, not a_won)
  ) as d(id, delta, won)
  where p.id = d.id;

  insert into public.rating_history (player_id, doubles_match_id, rating, mode)
  select p.id, p_match_id, p.doubles_rating, 'doubles'
  from public.profiles p
  where p.id in (m.a1, m.a2, m.b1, m.b2);
end;
$$;

grant execute on function public.confirm_doubles_match(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- decline_doubles_match — same rule as singles: the other team can dispute.
-- ---------------------------------------------------------------------------
create or replace function public.decline_doubles_match(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.doubles_matches
    set status = 'declined'
    where id = p_match_id
      and status = 'pending'
      and auth.uid() in (b1, b2);

  if not found then
    raise exception 'Couldn''t decline that match.';
  end if;
end;
$$;

grant execute on function public.decline_doubles_match(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- live_now — return type changes to carry partners, so it has to be dropped
-- first. Callers select by name, so adding columns is safe for them.
-- ---------------------------------------------------------------------------
drop function if exists public.live_now();

create or replace function public.live_now()
returns table (
  id uuid,
  player_a uuid,
  player_b uuid,
  name_a text,
  name_b text,
  avatar_a text,
  avatar_b text,
  partner_a uuid,
  partner_b uuid,
  name_partner_a text,
  name_partner_b text,
  avatar_partner_a text,
  avatar_partner_b text,
  is_doubles boolean,
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
         l.partner_a, l.partner_b,
         coalesce(pa.full_name, '@' || pa.username),
         coalesce(pb.full_name, '@' || pb.username),
         pa.avatar_path, pb.avatar_path,
         l.partner_a is not null,
         l.best_of, l.is_ranked, l.games, l.points_a, l.points_b, l.updated_at
  from public.live_matches l
  join public.profiles a on a.id = l.player_a
  join public.profiles b on b.id = l.player_b
  left join public.profiles pa on pa.id = l.partner_a
  left join public.profiles pb on pb.id = l.partner_b
  where l.status = 'live'
    and not exists (
      select 1 from unnest(public.live_seats(l)) seat
      where public.is_blocked_pair(auth.uid(), seat)
    )
  order by l.updated_at desc
  limit 20;
$$;

grant execute on function public.live_now() to authenticated;

-- ---------------------------------------------------------------------------
-- doubles_pending — matches waiting on you to confirm, for the home page.
-- ---------------------------------------------------------------------------
create or replace function public.doubles_pending()
returns table (
  id uuid,
  games_won_a integer,
  games_won_b integer,
  is_ranked boolean,
  reporter_name text,
  partner_name text,
  played_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select d.id, d.games_won_a, d.games_won_b, d.is_ranked,
         coalesce(r.full_name, '@' || r.username),
         coalesce(o.full_name, '@' || o.username),
         d.played_at
  from public.doubles_matches d
  join public.profiles r on r.id = d.reported_by
  -- The other member of the reporting team.
  join public.profiles o on o.id = case when d.reported_by = d.a1 then d.a2 else d.a1 end
  where d.status = 'pending'
    and auth.uid() in (d.b1, d.b2)
  order by d.played_at desc
  limit 10;
$$;

grant execute on function public.doubles_pending() to authenticated;

-- ---------------------------------------------------------------------------
-- Check it worked.
--
--   select count(*) as doubles_columns from information_schema.columns
--   where table_schema = 'public' and table_name = 'profiles'
--     and column_name in ('doubles_rating', 'doubles_wins', 'doubles_losses');
--   -- expect 3
--
--   select to_regclass('public.doubles_matches') is not null as table_created,
--          to_regproc('public.start_live_doubles') is not null as can_start,
--          to_regproc('public.confirm_doubles_match') is not null as can_confirm;
--   -- expect true, true, true
--
--   -- everyone starts level on the doubles ladder
--   select min(doubles_rating), max(doubles_rating), count(*) from public.profiles;
-- ---------------------------------------------------------------------------
