-- NU Ping Pong — measure margin in points instead of games.
--
-- Additive on top of 0014. Existing confirmed matches are untouched; only
-- future confirmations use the new margin.
--
-- ---------------------------------------------------------------------------
-- Why
--
-- Rating already pays for surprise: `expected` is the prediction and every
-- delta is K x (actual - expected), so a 400-point favourite gains 2 for
-- winning and loses 20 for losing. That part works and isn't touched here.
--
-- What didn't work was margin. It was measured in games won, which cannot
-- tell these apart:
--
--   result                       games   game share   point share
--   3-0, all 11-2                  3-0       1.00         0.85
--   3-0, all 11-9                  3-0       1.00         0.55
--   3-2, won the close ones        3-2       0.60         0.51
--   3-2, blew a 2-0 lead           3-2       0.60         0.55
--
-- Being annihilated and losing three 11-9 games paid exactly the same. Since
-- matches.games already stores every game's point score — the log form asks
-- for it and the live scoreboard records every rally — the finer measure was
-- already sitting in the table. Nothing new has to be collected.
--
-- The weight also goes 0.2 -> 0.35, because point share sits much closer to
-- 0.5 than game share does: a 3-0 sweep is game share 1.00 but often point
-- share 0.6, so the same weight on a smaller signal would have made margin
-- matter less than before rather than more.
--
-- ---------------------------------------------------------------------------
-- What this is worth, and what it isn't
--
-- Two placed 1200s, best-of-five:
--
--   annihilated in 11-2s   +15   (loser -15)
--   three tight 11-9s      +12   (loser -12)
--   close win between equals  +11
--
-- So roughly 3-4 points between a demolition and a nail-biter. That's the
-- realistic ceiling, not a shortfall: pushing the weight past ~0.35 drops a
-- hard-fought win between equals into single digits, which reads as broken,
-- and margin starts overruling who actually won. An 11-9 game is real
-- information, but modest information.
--
-- Two things measured over 16 simulated seasons of 4,000 matches each, so
-- nobody has to rediscover them:
--
-- 1. This does NOT make the ladder more accurate. Rating-vs-true-skill sits
--    at r = 0.990 with game margin and r = 0.992 with point margin, and the
--    number of players in exactly the right order is 15.2 vs 15.1 out of 24 —
--    all inside the noise. Elo converges on skill whatever the margin term
--    does; the ladder was already at the ceiling. The reason to do this is
--    that the payout should reflect what happened at the table, which it
--    didn't when a demolition and three 11-9 games paid the same. Don't sell
--    it as an accuracy fix, and don't reach for a bigger weight expecting
--    accuracy — 0.40 is no better than 0.20.
--
-- 2. A favourite can now win and gain almost nothing. Point share sits nearer
--    0.5 than game share, so for a heavy favourite `actual` can land below
--    `expected` and the raw delta goes negative — the floor then pays +1. A
--    1500 beating a 1200 on a 51-50 point split is exactly this. It fires on
--    0.37% of wins, and it's the behaviour asked for (predicted to win big,
--    barely won, gained nothing), but it's worth knowing it exists before
--    someone reports it as a bug.
--
-- Winrate was considered as a second input and rejected on measurement, not
-- taste. Under pairing that matches this app — matchmaking puts you with
-- someone near your own rating — adding a winrate term improved prediction by
-- 0.0-0.7%, because when everyone plays near-equals everyone drifts toward
-- 50% and the gap carries no signal. Worse, simulating a player of exactly
-- median skill who only plays the bottom third of the club put them 1st of 21
-- by winrate and 7th of 21 by rating: winrate pays for an easy schedule.
-- Rating is already accumulated performance against the field, so a winrate
-- term counts the same evidence twice and adds a reason to duck good players.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- match_point_share — one side's share of all points played.
--
-- Returns null when the games array carries no point totals, so the caller
-- can fall back to game share rather than silently treating it as 0.
--
-- The ->> casts are deliberate: submit_live_match used to store flipped
-- scores as JSON strings (fixed below), and old rows still hold them. ->>
-- gives text either way, so this reads both shapes correctly.
-- ---------------------------------------------------------------------------
create or replace function public.match_point_share(p_games jsonb, p_for_a boolean)
returns numeric
language sql
immutable
as $$
  with totals as (
    select
      coalesce(sum((g->>'a')::numeric), 0) as a,
      coalesce(sum((g->>'b')::numeric), 0) as b
    from jsonb_array_elements(coalesce(p_games, '[]'::jsonb)) as t(g)
  )
  select case
    when a + b = 0 then null
    when p_for_a then a / (a + b)
    else b / (a + b)
  end
  from totals;
$$;

-- ---------------------------------------------------------------------------
-- confirm_match — same model as 0012, with margin taken from points.
-- ---------------------------------------------------------------------------
create or replace function public.confirm_match(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.matches;
  loser uuid;
  rating_winner integer;
  rating_loser integer;
  played_winner integer;
  played_loser integer;
  games_winner integer;
  games_loser integer;
  share_winner numeric;
  evidence numeric;
  expected_winner numeric;
  actual_winner numeric;
  actual_loser numeric;
  delta_w integer;
  delta_l integer;
  margin_weight constant numeric := 0.35;
  floor_rating constant integer := 100;
begin
  select * into m from public.matches where id = p_match_id for update;

  if not found then
    raise exception 'Match not found';
  end if;
  if m.status <> 'pending' then
    raise exception 'Match already resolved';
  end if;
  if auth.uid() <> m.player_b then
    raise exception 'Only the reported opponent can confirm this match';
  end if;

  -- A casual match is a real, confirmed result on both players' profiles. It
  -- just doesn't touch ratings or win/loss records.
  if not m.is_ranked then
    update public.matches
      set status = 'confirmed', confirmed_at = now(), rating_delta = 0,
          rating_delta_loser = 0
      where id = p_match_id;
    return;
  end if;

  loser := case when m.winner = m.player_a then m.player_b else m.player_a end;

  select rating, wins + losses into rating_winner, played_winner
    from public.profiles where id = m.winner;
  select rating, wins + losses into rating_loser, played_loser
    from public.profiles where id = loser;

  if m.winner = m.player_a then
    games_winner := m.games_won_a;
    games_loser := m.games_won_b;
  else
    games_winner := m.games_won_b;
    games_loser := m.games_won_a;
  end if;

  -- A single game is weaker evidence than a best-of-five. Keyed off the
  -- winner's game count, which names the format.
  evidence := case
    when games_winner <= 1 then 0.60
    when games_winner = 2 then 1.00
    else 1.20
  end;

  -- Margin, in points. Game share is the fallback for a match whose games
  -- array holds no scores — nothing writes one today, but a rating function
  -- shouldn't depend on that staying true.
  share_winner := public.match_point_share(m.games, m.winner = m.player_a);
  if share_winner is null then
    share_winner := games_winner::numeric / (games_winner + games_loser);
  end if;

  expected_winner := 1.0 / (1.0 + power(10.0, (rating_loser - rating_winner) / 400.0));

  actual_winner := (1 - margin_weight) + margin_weight * share_winner;
  actual_loser := margin_weight * (1 - share_winner);

  -- Each player's own K: this is what makes placements and the falloff work,
  -- and what stops the two deltas being equal.
  delta_w := greatest(
    round(public.elo_k(rating_winner, played_winner) * evidence
          * (actual_winner - expected_winner))::integer, 1);
  delta_l := greatest(
    round(public.elo_k(rating_loser, played_loser) * evidence
          * ((1 - expected_winner) - actual_loser))::integer, 1);

  -- Never take anyone below the floor.
  delta_l := least(delta_l, greatest(rating_loser - floor_rating, 0));

  update public.profiles set rating = rating + delta_w, wins = wins + 1
    where id = m.winner;
  update public.profiles set rating = rating - delta_l, losses = losses + 1
    where id = loser;

  update public.matches
    set status = 'confirmed', confirmed_at = now(),
        rating_delta = delta_w, rating_delta_loser = delta_l
    where id = p_match_id;

  insert into public.rating_history (player_id, match_id, rating)
  select id, p_match_id, rating from public.profiles where id in (m.player_a, m.player_b);
end;
$$;

-- ---------------------------------------------------------------------------
-- submit_live_match — store flipped scores as numbers.
--
-- Unchanged except for the flip: `jsonb_build_object('a', g->>'b')` stored
-- "11" rather than 11, because ->> returns text. It never showed, since only
-- games_won_a/b were read and those were computed with ::int casts — but as
-- of this migration matches.games decides ratings, so the column's type
-- shouldn't be an accident. ::int inside the build makes it a JSON number.
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
    select jsonb_agg(
             jsonb_build_object('a', (g->>'b')::int, 'b', (g->>'a')::int)
             order by idx
           )
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

-- Normalise the rows the old flip already wrote. match_point_share reads
-- either shape, so this is tidiness rather than a fix — but it means every
-- row in the column has one type from here on.
update public.matches m
set games = norm.games
from (
  select
    x.id,
    jsonb_agg(
      jsonb_build_object('a', (g->>'a')::int, 'b', (g->>'b')::int)
      order by idx
    ) as games
  from public.matches x
  cross join lateral jsonb_array_elements(x.games) with ordinality as t(g, idx)
  where jsonb_typeof(g->'a') = 'string' or jsonb_typeof(g->'b') = 'string'
  group by x.id
) norm
where m.id = norm.id;

-- ---------------------------------------------------------------------------
-- Check it worked.
--
--   -- point share, from a 3-0 in 11-2s and a 3-0 in 11-9s
--   select public.match_point_share(
--            '[{"a":11,"b":2},{"a":11,"b":2},{"a":11,"b":2}]'::jsonb, true) as annihilation,
--          public.match_point_share(
--            '[{"a":11,"b":9},{"a":11,"b":9},{"a":11,"b":9}]'::jsonb, true) as three_tight;
--   -- expect roughly 0.846 and 0.550
--
--   -- no string scores left anywhere
--   select count(*) from public.matches m
--   cross join lateral jsonb_array_elements(m.games) as t(g)
--   where jsonb_typeof(g->'a') = 'string' or jsonb_typeof(g->'b') = 'string';
--   -- expect 0
-- ---------------------------------------------------------------------------
