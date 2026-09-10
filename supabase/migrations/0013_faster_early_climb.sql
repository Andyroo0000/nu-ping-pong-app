-- NU Ping Pong — quicker promotions in the lower tiers.
--
-- Additive on top of 0012. Existing confirmed matches are untouched.
--
-- ---------------------------------------------------------------------------
-- Why, and why K alone wasn't the answer
--
-- The complaint was that ranking up takes too many games early on. Modelling a
-- 1000-rated player winning 3-1 against equals showed raising K barely moves
-- it: 9 wins to the first promotion either way. As you climb above your
-- opponents, `expected` rises and each win is worth less, which K can't undo.
--
-- The real problem was the tier boundaries. They sat 200 points apart from
-- 1000, which put most of the ladder out of reach: 74 wins to 1400, and 1600
-- was unreachable outright, because you cannot rate 1600 by beating 1000s.
-- Elo is relative, so tiers have to fit the spread a small club actually
-- occupies. Those boundaries are refitted in lib/tiers.ts (no schema change);
-- from a 1000 start against an improving field it's now roughly 2 wins to the
-- first promotion, 7 to the next, then 14 and 32.
--
-- This migration does the smaller half: the K bands are realigned to the new
-- tier boundaries and lifted a little at the bottom, so the lower tiers move
-- briskly and the top stays sticky.
--
--   old   <1200 32 | <1400 28 | <1600 24 | <1800 20 | 1800+ 16
--   new   <1050 40 | <1200 34 | <1350 28 | <1525 22 | 1525+ 18
--
-- Placements are unchanged at 64 for the first ten ranked matches.
-- ---------------------------------------------------------------------------
create or replace function public.elo_k(p_rating integer, p_played integer)
returns numeric
language sql
immutable
as $$
  select case
    when p_played < 10 then 64      -- placements: move fast while unknown
    when p_rating < 1050 then 40
    when p_rating < 1200 then 34
    when p_rating < 1350 then 28
    when p_rating < 1525 then 22
    else 18                         -- the top is meant to be sticky
  end::numeric;
$$;
