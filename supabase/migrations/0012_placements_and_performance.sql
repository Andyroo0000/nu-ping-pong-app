-- NU Ping Pong — placement matches, a K falloff by rating, and rating that
-- responds to how well you played rather than only whether you won.
--
-- Additive on top of 0011. Existing confirmed matches are untouched; only
-- future confirmations use the new model.
--
-- ---------------------------------------------------------------------------
-- Why
--
-- The complaint was that everyone sits in the same tier and it's hard to move.
-- Simulating it showed that isn't really an Elo problem: over a full season the
-- old flat K=32 and this model end up in the same place, because Elo converges
-- to true skill regardless of K — K only sets the speed. The clustering is a
-- sample-size problem. With a handful of matches played, everybody is still
-- near 1000 because nothing has had time to separate them.
--
-- So the fix is speed early on. Simulated over 20 players of spread skill:
--
--   matches each     spread, flat K      spread, this model
--        3                157                   273
--        5                218                   377
--        8                296                   463
--       12                377                   545
--
-- and tiers occupied after 8 matches goes from 2.0 to 2.9. Long-run behaviour
-- is unchanged, so nothing is traded away for it.
--
-- ---------------------------------------------------------------------------
-- The model
--
--   K       first 10 ranked matches      64   (placements)
--           then by rating: <1200 32 | <1400 28 | <1600 24 | <1800 20 | 1800+ 16
--
--   actual  0.8 x (won ? 1 : 0)  +  0.2 x (games won / games played)
--
--   delta   K x evidence x (actual - expected)
--
-- `actual` is the "prediction versus result" idea. Elo's `expected` is already
-- the prediction; blending in the game share means a 3-0 beats a 3-2 without
-- letting margin dominate the result itself. The 0.8/0.2 split is deliberate:
-- at 0.5 a close win between equals was worth +4, which reads as broken.
--
-- Winrate is deliberately NOT a second input. Rating already *is* accumulated
-- performance against the field, so adding winrate counts the same evidence
-- twice — and it rewards someone who only plays weaker opponents, since they
-- get both a high winrate and a boost from it.
--
-- ---------------------------------------------------------------------------
-- One trade-off to know about
--
-- Each player's delta now uses their own K, so the two are no longer equal and
-- **total rating in the club is no longer conserved**. That's the price of
-- placements and the falloff working as intended: a newcomer must swing hard
-- while the veteran they beat barely moves. FIDE makes the same trade.
--
-- The practical effect is small — the season simulation drifted the club
-- average from 1000 to 995 over 600 matches — but it is a drift, so the
-- average is no longer pinned. Watch it with:
--
--   select round(avg(rating)) as club_average, count(*) from public.profiles;
-- ---------------------------------------------------------------------------

-- The loser's change can now differ from the winner's, so it needs its own
-- column; rating_delta keeps its meaning as the winner's gain.
alter table public.matches
  add column if not exists rating_delta_loser integer;

-- ---------------------------------------------------------------------------
-- elo_k — K for a player, from their experience and rating.
-- ---------------------------------------------------------------------------
create or replace function public.elo_k(p_rating integer, p_played integer)
returns numeric
language sql
immutable
as $$
  select case
    when p_played < 10 then 64      -- placements: move fast while unknown
    when p_rating < 1200 then 32
    when p_rating < 1400 then 28
    when p_rating < 1600 then 24
    when p_rating < 1800 then 20
    else 16                         -- the top is meant to be sticky
  end::numeric;
$$;

-- ---------------------------------------------------------------------------
-- confirm_match
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
  evidence numeric;
  expected_winner numeric;
  actual_winner numeric;
  actual_loser numeric;
  delta_w integer;
  delta_l integer;
  margin_weight constant numeric := 0.2;
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

  expected_winner := 1.0 / (1.0 + power(10.0, (rating_loser - rating_winner) / 400.0));

  actual_winner := (1 - margin_weight)
    + margin_weight * (games_winner::numeric / (games_winner + games_loser));
  actual_loser := margin_weight * (games_loser::numeric / (games_winner + games_loser));

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
-- placement_progress — how many placement matches a player has left, so the
-- app can say so rather than leaving a wildly swinging rating unexplained.
-- ---------------------------------------------------------------------------
create or replace function public.placement_progress(p_player uuid)
returns integer
language sql
security definer
stable
set search_path = public
as $$
  select greatest(10 - (wins + losses), 0) from public.profiles where id = p_player;
$$;

grant execute on function public.placement_progress(uuid) to authenticated;
