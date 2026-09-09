-- NU Ping Pong — rating weighted by how the match went, plus a suggestion box.
--
-- Additive on top of 0007. Safe to run on a database with real data. Existing
-- confirmed matches are untouched; only future confirmations use the new
-- weighting.

-- ---------------------------------------------------------------------------
-- suggestions — a way to tell the organiser something without finding them.
-- ---------------------------------------------------------------------------
create table if not exists public.suggestions (
  id uuid primary key default gen_random_uuid(),
  -- Null when sent anonymously. Also null if the account is later deleted.
  author uuid references public.profiles (id) on delete set null,
  kind text not null default 'idea' check (kind in ('idea', 'bug', 'other')),
  body text not null check (char_length(body) between 1 and 2000),
  status text not null default 'open'
    check (status in ('open', 'planned', 'done', 'declined')),
  created_at timestamptz not null default now()
);

create index if not exists suggestions_status_idx
  on public.suggestions (status, created_at desc);

alter table public.suggestions enable row level security;

-- Anyone signed in may send one. You can read back the ones you signed your
-- name to; anonymous ones are readable by nobody through the API. Reviewing
-- happens in the Supabase dashboard, which uses the service role.
drop policy if exists "Players can send a suggestion" on public.suggestions;
create policy "Players can send a suggestion"
  on public.suggestions for insert
  to authenticated
  with check (author is null or author = auth.uid());

drop policy if exists "Players read their own suggestions" on public.suggestions;
create policy "Players read their own suggestions"
  on public.suggestions for select
  to authenticated
  using (author = auth.uid());

-- ---------------------------------------------------------------------------
-- confirm_match — Elo weighted by how decisive the match was.
--
-- Standard Elo already accounts for the rating gap: beating someone 400 above
-- you is worth ~29 points and beating someone 400 below is worth ~3. That part
-- needed no change. What it ignored is *how* you won — a 3-0 sweep counted the
-- same as scraping 3-2 — and it treated a single game as equal evidence to a
-- best-of-five.
--
-- Two multipliers on K fix that, both derived from the games won rather than a
-- declared format, so they can't disagree with the score that was entered:
--
--   evidence  race to 1 game 0.60 | to 2 (best of 3) 1.00 | to 3+ 1.20
--   margin    won by 1 game 1.00 | by 2 1.15 | by 3+ 1.30
--
-- Evidence keys off the *winner's* game count, not the total played. Using the
-- total made a 3-1 (four games, so "more evidence") outrank a 3-0 sweep, which
-- is exactly backwards. The winner's tally names the format: 1 is a single
-- game, 2 is a best of three, 3 is a best of five.
--
-- At equal ratings that spans +10 for a single game to +25 for a 3-0 in a
-- best-of-five, against the flat +16 before.
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
  expected_winner numeric;
  winner_games integer;
  game_margin integer;
  evidence numeric;
  margin numeric;
  k_effective numeric;
  delta integer;
  k constant integer := 32;
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
      set status = 'confirmed', confirmed_at = now(), rating_delta = 0
      where id = p_match_id;
    return;
  end if;

  loser := case when m.winner = m.player_a then m.player_b else m.player_a end;

  select rating into rating_winner from public.profiles where id = m.winner;
  select rating into rating_loser from public.profiles where id = loser;

  winner_games := greatest(m.games_won_a, m.games_won_b);
  game_margin := abs(m.games_won_a - m.games_won_b);

  evidence := case
    when winner_games <= 1 then 0.60
    when winner_games = 2 then 1.00
    else 1.20
  end;

  margin := case
    when game_margin <= 1 then 1.00
    when game_margin = 2 then 1.15
    else 1.30
  end;

  k_effective := k * evidence * margin;

  expected_winner := 1.0 / (1.0 + power(10.0, (rating_loser - rating_winner) / 400.0));
  delta := greatest(round(k_effective * (1.0 - expected_winner))::integer, 1);
  -- Never take a player below the floor, and never award more than was taken.
  delta := least(delta, greatest(rating_loser - floor_rating, 0));

  update public.profiles set rating = rating + delta, wins = wins + 1 where id = m.winner;
  update public.profiles set rating = rating - delta, losses = losses + 1 where id = loser;

  update public.matches
    set status = 'confirmed', confirmed_at = now(), rating_delta = delta
    where id = p_match_id;

  insert into public.rating_history (player_id, match_id, rating)
  select id, p_match_id, rating from public.profiles where id in (m.player_a, m.player_b);
end;
$$;
