-- NU Ping Pong — make a reported result mean what it says.
--
-- Additive on top of 0016. Existing rows are not touched or re-checked; see
-- the note on NOT VALID at the bottom.
--
-- ---------------------------------------------------------------------------
-- Two ways to give yourself rating, both closed here
--
-- Neither is reachable through the app — the log form always reports from
-- your own side, and computes the winner from the scores. Both are reachable
-- with a hand-made REST call, and the anon key is public by design (it ships
-- in the browser bundle), so anyone who opens devtools can make one. On a
-- club ladder that is a "someone will try it" risk rather than a theoretical
-- one.
--
-- 1. Confirm your own match.
--
--    The insert policy allows reported_by to be EITHER player, and
--    confirm_match lets player_b confirm. So seat yourself as player_b and
--    report a match you "won": you are both the reporter and the confirmer,
--    and the opponent never hears about it. Measured on a scratch database:
--    +38 rating with no input from the other player.
--
--    Fixed by requiring the reporter to be player_a. Then the confirm button
--    always belongs to the other person, which is what the rule was always
--    meant to be — confirm_match and decline_match already assume it.
--
-- 2. Report a loss and name yourself the winner.
--
--    `winner` was only constrained to be one of the two players, not to agree
--    with the score. So games 3-0 to your opponent with winner = you was a
--    valid row. It reads as a normal loss in every list, and the moment they
--    confirm it, you take the win. Measured: recorded as winner after losing
--    every game.
--
--    Fixed by deriving the winner from the game count in a check constraint.
--
-- Doubles was already safe from both: doubles_reporter_is_on_team_a puts the
-- reporter on team A, confirm_doubles_match requires team B, and the four
-- players are distinct — so one person can't be both ends. The winner_team
-- check below is added for the same reason as the singles one.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- games_won_from — games won by one side, counted from the scores.
--
-- Immutable so a check constraint can call it. Malformed scores make the cast
-- raise, which rejects the insert: for a constraint whose job is to keep
-- rubbish out, failing loudly is the right direction to fail.
-- ---------------------------------------------------------------------------
create or replace function public.games_won_from(p_games jsonb, p_for_a boolean)
returns integer
language sql
immutable
as $$
  select count(*)::integer
  from jsonb_array_elements(coalesce(p_games, '[]'::jsonb)) as t(g)
  where case
    when p_for_a then (g->>'a')::int > (g->>'b')::int
    else (g->>'b')::int > (g->>'a')::int
  end;
$$;

-- ---------------------------------------------------------------------------
-- matches
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'matches_reporter_is_player_a') then
    alter table public.matches
      add constraint matches_reporter_is_player_a
      check (reported_by = player_a) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'matches_winner_matches_score') then
    alter table public.matches
      add constraint matches_winner_matches_score
      check (winner = case when games_won_a > games_won_b then player_a else player_b end)
      not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'matches_no_tie') then
    alter table public.matches
      add constraint matches_no_tie check (games_won_a <> games_won_b) not valid;
  end if;

  -- games_won_a/b are what the rating actually uses — evidence keys off the
  -- winner's game count — so they can't be free-floating numbers next to the
  -- scores they're supposed to summarise.
  if not exists (select 1 from pg_constraint where conname = 'matches_games_won_match_games') then
    alter table public.matches
      add constraint matches_games_won_match_games
      check (
        games_won_a = public.games_won_from(games, true)
        and games_won_b = public.games_won_from(games, false)
      ) not valid;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- doubles_matches
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'doubles_winner_matches_score') then
    alter table public.doubles_matches
      add constraint doubles_winner_matches_score
      check (winner_team = case when games_won_a > games_won_b then 'a' else 'b' end)
      not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'doubles_no_tie') then
    alter table public.doubles_matches
      add constraint doubles_no_tie check (games_won_a <> games_won_b) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'doubles_games_won_match_games') then
    alter table public.doubles_matches
      add constraint doubles_games_won_match_games
      check (
        games_won_a = public.games_won_from(games, true)
        and games_won_b = public.games_won_from(games, false)
      ) not valid;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Now try to validate them against the rows already there.
--
-- Added NOT VALID above so this migration cannot fail on legacy data: every
-- NEW row is checked either way, which is the part that matters. Validation
-- is attempted separately, and a failure is reported as a notice rather than
-- aborting the script — a confirmed match from months ago that doesn't fit
-- shouldn't stop the hole being closed today.
--
-- Every row the app itself wrote should pass: reportMatch has always set
-- player_a and reported_by to the reporter, and derived the winner from the
-- scores.
-- ---------------------------------------------------------------------------
do $$
declare
  c record;
begin
  for c in
    select unnest(array[
      'matches_reporter_is_player_a',
      'matches_winner_matches_score',
      'matches_no_tie',
      'matches_games_won_match_games'
    ]) as name, 'public.matches' as tbl
    union all
    select unnest(array[
      'doubles_winner_matches_score',
      'doubles_no_tie',
      'doubles_games_won_match_games'
    ]) as name, 'public.doubles_matches' as tbl
  loop
    begin
      execute format('alter table %s validate constraint %I', c.tbl, c.name);
      raise notice 'validated %', c.name;
    exception when others then
      raise notice 'could NOT validate % (existing rows disagree): % — new rows are still checked', c.name, sqlerrm;
    end;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Check it worked. Every one of these should raise an error.
--
--   -- 1. seating yourself as player_b to confirm your own match
--   --    (run as any signed-in player, swapping in two real ids)
--   insert into public.matches
--     (player_a, player_b, games, games_won_a, games_won_b, winner, reported_by)
--   values ('<someone-else>', '<you>', '[{"a":0,"b":11}]'::jsonb, 0, 1, '<you>', '<you>');
--   -- expect: violates check constraint "matches_reporter_is_player_a"
--
--   -- 2. naming yourself the winner of a match you lost
--   insert into public.matches
--     (player_a, player_b, games, games_won_a, games_won_b, winner, reported_by)
--   values ('<you>', '<someone-else>', '[{"a":0,"b":11}]'::jsonb, 0, 1, '<you>', '<you>');
--   -- expect: violates check constraint "matches_winner_matches_score"
--
--   -- 3. game counts that don't match the scores
--   insert into public.matches
--     (player_a, player_b, games, games_won_a, games_won_b, winner, reported_by)
--   values ('<you>', '<someone-else>', '[{"a":11,"b":0}]'::jsonb, 3, 0, '<you>', '<you>');
--   -- expect: violates check constraint "matches_games_won_match_games"
--
--   -- and to see which constraints are in place and validated:
--   select conname, convalidated from pg_constraint
--   where conrelid in ('public.matches'::regclass, 'public.doubles_matches'::regclass)
--     and contype = 'c'
--   order by conname;
-- ---------------------------------------------------------------------------
