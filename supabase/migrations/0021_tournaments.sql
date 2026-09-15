-- NU Ping Pong — tournaments: brackets, entries, and results.
--
-- Additive on top of 0020. Creates new tables and functions and changes no
-- existing data.
--
-- ---------------------------------------------------------------------------
-- Entries, not players
--
-- Every table and function here works on ENTRIES. An entry is one player in a
-- singles tournament and a pair in a doubles one, so the bracket never needs
-- to know which kind it's running — the difference is only in how an entry is
-- displayed and which results table a confirmed match lands in.
--
-- ---------------------------------------------------------------------------
-- The bracket is a linked list, not a formula
--
-- Each match stores where its winner goes (winner_to_key + slot) and, in
-- double elimination, where its loser goes. Advancing a result is then a
-- local write: put the winner in the slot the pointer names. The alternative
-- — re-deriving the whole bracket from results on every read — is where
-- bracket code usually goes wrong, because the derivation has to agree with
-- itself for byes, walkovers and the losers bracket all at once.
--
-- The structure itself is generated in lib/bracket.ts, where it can be tested
-- by simulating tournaments rather than by inspection. start_tournament()
-- takes that structure as JSON and writes the rows. It validates ownership
-- and that the entries belong to this tournament; it does NOT try to prove
-- the topology is a sane bracket, because a nonsensical bracket only ever
-- affects the organiser's own tournament, and ratings still need the
-- opponent's confirmation.
--
-- ---------------------------------------------------------------------------
-- Ratings stay honest
--
-- A ranked tournament match creates an ordinary PENDING match — the same row
-- reportMatch would create — so the rating only moves once the opponent
-- confirms. The bracket advances immediately either way.
--
-- That separation is deliberate. Letting a tournament write confirmed results
-- would reopen exactly the hole 0017 closed: create a tournament, add a
-- victim, type a win, collect rating with nobody agreeing to it. The bracket
-- is the organiser's call; a rating change needs the other player.
--
-- It also follows that only a PARTICIPANT can report a score, because 0017
-- requires the reporter to be player_a of the match they're reporting. For
-- a no-show or a retirement the organiser uses advance_tournament_match(),
-- which moves the bracket on with no score and no rating change.
-- ---------------------------------------------------------------------------

create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 80),
  format text not null check (format in ('single_elim', 'double_elim', 'round_robin')),
  mode text not null default 'singles' check (mode in ('singles', 'doubles')),
  is_ranked boolean not null default true,
  best_of integer not null default 3 check (best_of in (1, 3, 5)),
  status text not null default 'setup' check (status in ('setup', 'running', 'complete')),
  created_by uuid not null references public.profiles (id) on delete cascade,
  champion_entry uuid,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create index if not exists tournaments_status_idx on public.tournaments (status, created_at desc);

create table if not exists public.tournament_entries (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  player_1 uuid not null references public.profiles (id) on delete cascade,
  player_2 uuid references public.profiles (id) on delete cascade,
  seed integer,
  created_at timestamptz not null default now(),
  constraint entry_players_differ check (player_2 is null or player_2 <> player_1)
);

create index if not exists tournament_entries_tournament_idx
  on public.tournament_entries (tournament_id, seed nulls last);
-- A player can't hold two entries in the same tournament. Two partial indexes
-- rather than one, because the same player may sit in either column.
create unique index if not exists tournament_entries_p1_once
  on public.tournament_entries (tournament_id, player_1);
create unique index if not exists tournament_entries_p2_once
  on public.tournament_entries (tournament_id, player_2) where player_2 is not null;

alter table public.tournaments
  add constraint tournaments_champion_fkey
  foreign key (champion_entry) references public.tournament_entries (id) on delete set null;

create table if not exists public.tournament_matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  -- The generator's key ("w1-0", "l3-1", "gf"). Pointers reference keys
  -- rather than ids so a whole bracket can be inserted in one statement.
  key text not null,
  bracket text not null check (bracket in ('main', 'losers', 'final')),
  round integer not null,
  slot integer not null,
  entry_a uuid references public.tournament_entries (id) on delete cascade,
  entry_b uuid references public.tournament_entries (id) on delete cascade,
  winner_to_key text,
  winner_to_slot text check (winner_to_slot in ('a', 'b')),
  loser_to_key text,
  loser_to_slot text check (loser_to_slot in ('a', 'b')),
  games jsonb,
  games_won_a integer,
  games_won_b integer,
  winner_entry uuid references public.tournament_entries (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'done')),
  -- The rating-bearing match this produced, if the tournament is ranked.
  match_id uuid references public.matches (id) on delete set null,
  doubles_match_id uuid references public.doubles_matches (id) on delete set null,
  reported_by uuid references public.profiles (id) on delete set null,
  reported_at timestamptz,
  constraint tournament_match_key_once unique (tournament_id, key)
);

create index if not exists tournament_matches_tournament_idx
  on public.tournament_matches (tournament_id, bracket, round, slot);

alter table public.tournaments enable row level security;
alter table public.tournament_entries enable row level security;
alter table public.tournament_matches enable row level security;

-- Readable by the whole club: watching a bracket is the point.
drop policy if exists "Tournaments are viewable by club members" on public.tournaments;
create policy "Tournaments are viewable by club members"
  on public.tournaments for select to authenticated using (true);

drop policy if exists "Entries are viewable by club members" on public.tournament_entries;
create policy "Entries are viewable by club members"
  on public.tournament_entries for select to authenticated using (true);

drop policy if exists "Tournament matches are viewable by club members" on public.tournament_matches;
create policy "Tournament matches are viewable by club members"
  on public.tournament_matches for select to authenticated using (true);

-- No insert/update/delete policies anywhere: every write goes through the
-- security-definer functions below, which check who's allowed to do what.

-- ---------------------------------------------------------------------------
-- is_organiser — the one place "can I change this tournament" is decided.
-- ---------------------------------------------------------------------------
create or replace function public.is_organiser(p_tournament uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.tournaments
    where id = p_tournament and created_by = auth.uid()
  );
$$;

grant execute on function public.is_organiser(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- create_tournament
-- ---------------------------------------------------------------------------
create or replace function public.create_tournament(
  p_name text,
  p_format text,
  p_mode text default 'singles',
  p_is_ranked boolean default true,
  p_best_of integer default 3
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
    raise exception 'You must be signed in to create a tournament.';
  end if;
  if p_format not in ('single_elim', 'double_elim', 'round_robin') then
    raise exception 'Unknown format.';
  end if;
  if p_mode not in ('singles', 'doubles') then
    raise exception 'A tournament is singles or doubles.';
  end if;

  insert into public.tournaments (name, format, mode, is_ranked, best_of, created_by)
  values (trim(p_name), p_format, p_mode, coalesce(p_is_ranked, true), coalesce(p_best_of, 3), v_me)
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.create_tournament(text, text, text, boolean, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- add_tournament_entry — the organiser adds anyone; a player adds themselves.
--
-- Self-signup matters more than it looks: an organiser typing in twenty names
-- is the thing that stops a club tournament from happening.
-- ---------------------------------------------------------------------------
create or replace function public.add_tournament_entry(
  p_tournament uuid,
  p_player_1 uuid,
  p_player_2 uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  t public.tournaments;
  v_id uuid;
begin
  select * into t from public.tournaments where id = p_tournament;
  if not found then
    raise exception 'Tournament not found.';
  end if;
  if t.status <> 'setup' then
    raise exception 'That tournament has already started.';
  end if;
  if t.created_by <> v_me and v_me not in (p_player_1, coalesce(p_player_2, p_player_1)) then
    raise exception 'Only the organiser can enter someone else.';
  end if;

  if t.mode = 'doubles' and p_player_2 is null then
    raise exception 'A doubles tournament needs both players of a pair.';
  end if;
  if t.mode = 'singles' and p_player_2 is not null then
    raise exception 'A singles tournament takes one player per entry.';
  end if;
  if p_player_2 is not null and p_player_2 = p_player_1 then
    raise exception 'A pair needs two different players.';
  end if;
  if not exists (select 1 from public.profiles where id = p_player_1)
     or (p_player_2 is not null and not exists (select 1 from public.profiles where id = p_player_2)) then
    raise exception 'That player no longer exists.';
  end if;
  if p_player_2 is not null and public.is_blocked_pair(p_player_1, p_player_2) then
    raise exception 'Those two players have blocked each other.';
  end if;

  -- The unique indexes catch a repeat entry, but the message they give is
  -- unreadable, so check first and say something useful.
  if exists (
    select 1 from public.tournament_entries e
    where e.tournament_id = p_tournament
      and (p_player_1 in (e.player_1, e.player_2)
        or (p_player_2 is not null and p_player_2 in (e.player_1, e.player_2)))
  ) then
    raise exception 'One of those players is already entered.';
  end if;

  insert into public.tournament_entries (tournament_id, player_1, player_2)
  values (p_tournament, p_player_1, p_player_2)
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.add_tournament_entry(uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- remove_tournament_entry — the organiser, or withdrawing yourself.
-- ---------------------------------------------------------------------------
create or replace function public.remove_tournament_entry(p_entry uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  e public.tournament_entries;
  t public.tournaments;
begin
  select * into e from public.tournament_entries where id = p_entry;
  if not found then
    raise exception 'Entry not found.';
  end if;
  select * into t from public.tournaments where id = e.tournament_id;

  if t.status <> 'setup' then
    raise exception 'That tournament has already started.';
  end if;
  if t.created_by <> v_me and v_me not in (e.player_1, coalesce(e.player_2, e.player_1)) then
    raise exception 'You can only withdraw your own entry.';
  end if;

  delete from public.tournament_entries where id = p_entry;
end;
$$;

grant execute on function public.remove_tournament_entry(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- start_tournament — store the generated bracket and lock the field.
--
-- p_matches is the array from generateBracket(), and p_seeds is the entry ids
-- in seed order. Both come from the server action that generated them.
-- ---------------------------------------------------------------------------
create or replace function public.start_tournament(
  p_tournament uuid,
  p_matches jsonb,
  p_seeds uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.tournaments;
  v_entries integer;
  v_written integer;
begin
  select * into t from public.tournaments where id = p_tournament for update;
  if not found then
    raise exception 'Tournament not found.';
  end if;
  if t.created_by <> auth.uid() then
    raise exception 'Only the organiser can start this tournament.';
  end if;
  if t.status <> 'setup' then
    raise exception 'That tournament has already started.';
  end if;

  select count(*) into v_entries from public.tournament_entries where tournament_id = p_tournament;
  if v_entries < 2 then
    raise exception 'A tournament needs at least two entries.';
  end if;
  if t.format = 'double_elim' and v_entries < 3 then
    raise exception 'Double elimination needs at least three entries.';
  end if;

  if p_matches is null or jsonb_typeof(p_matches) <> 'array' or jsonb_array_length(p_matches) = 0 then
    raise exception 'No bracket was generated.';
  end if;

  -- Seeds, in the order the caller worked out.
  for i in 1 .. coalesce(array_length(p_seeds, 1), 0) loop
    update public.tournament_entries
      set seed = i
      where id = p_seeds[i] and tournament_id = p_tournament;
  end loop;

  -- Every entry named in the bracket has to belong to this tournament.
  -- Without this a crafted payload could pull an entry out of someone else's
  -- bracket, and the display would then leak a name into a tournament that
  -- player never entered.
  if exists (
    select 1
    from jsonb_array_elements(p_matches) as m
    cross join lateral (values (m->>'entryA'), (m->>'entryB')) as v(entry)
    where v.entry is not null
      and not exists (
        select 1 from public.tournament_entries e
        where e.id = v.entry::uuid and e.tournament_id = p_tournament
      )
  ) then
    raise exception 'That bracket refers to an entry from another tournament.';
  end if;

  insert into public.tournament_matches (
    tournament_id, key, bracket, round, slot, entry_a, entry_b,
    winner_to_key, winner_to_slot, loser_to_key, loser_to_slot
  )
  select
    p_tournament,
    m->>'key',
    m->>'bracket',
    (m->>'round')::integer,
    (m->>'slot')::integer,
    nullif(m->>'entryA', '')::uuid,
    nullif(m->>'entryB', '')::uuid,
    m#>>'{winnerTo,key}',
    m#>>'{winnerTo,slot}',
    m#>>'{loserTo,key}',
    m#>>'{loserTo,slot}'
  from jsonb_array_elements(p_matches) as m;

  get diagnostics v_written = row_count;

  update public.tournaments
    set status = 'running', started_at = now()
    where id = p_tournament;

  return v_written;
end;
$$;

grant execute on function public.start_tournament(uuid, jsonb, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- advance_bracket — internal: move a finished match's winner and loser on,
-- and finish the tournament if nothing is left.
-- ---------------------------------------------------------------------------
create or replace function public.advance_bracket(p_match uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.tournament_matches;
  v_loser uuid;
  v_left integer;
begin
  select * into m from public.tournament_matches where id = p_match;
  if m.winner_entry is null then
    return;
  end if;

  v_loser := case when m.winner_entry = m.entry_a then m.entry_b else m.entry_a end;

  if m.winner_to_key is not null then
    update public.tournament_matches
      set entry_a = case when m.winner_to_slot = 'a' then m.winner_entry else entry_a end,
          entry_b = case when m.winner_to_slot = 'b' then m.winner_entry else entry_b end
      where tournament_id = m.tournament_id and key = m.winner_to_key;
  end if;

  if m.loser_to_key is not null and v_loser is not null then
    update public.tournament_matches
      set entry_a = case when m.loser_to_slot = 'a' then v_loser else entry_a end,
          entry_b = case when m.loser_to_slot = 'b' then v_loser else entry_b end
      where tournament_id = m.tournament_id and key = m.loser_to_key;
  end if;

  -- Done when every match is played. The champion is the winner of the match
  -- that sends its winner nowhere — the final, whatever it's called in this
  -- format. Round robin has no such match, so it's decided on standings.
  select count(*) into v_left
  from public.tournament_matches
  where tournament_id = m.tournament_id and status = 'pending';

  if v_left = 0 then
    update public.tournaments t
      set status = 'complete',
          completed_at = now(),
          champion_entry = (
            select case
              when t.format = 'round_robin' then (
                select tm.winner_entry
                from public.tournament_matches tm
                where tm.tournament_id = t.id
                order by tm.round desc, tm.slot desc
                limit 1
              )
              else (
                select tm.winner_entry
                from public.tournament_matches tm
                where tm.tournament_id = t.id and tm.winner_to_key is null
                order by tm.round desc
                limit 1
              )
            end
          )
      where t.id = m.tournament_id;
  end if;
end;
$$;

revoke all on function public.advance_bracket(uuid) from public;

-- ---------------------------------------------------------------------------
-- report_tournament_match — a participant records the score.
--
-- The bracket moves straight away. If the tournament is ranked this also
-- creates the ordinary pending match that the opponent confirms, so ratings
-- keep needing two people to agree.
-- ---------------------------------------------------------------------------
create or replace function public.report_tournament_match(
  p_match uuid,
  p_games jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  m public.tournament_matches;
  t public.tournaments;
  ea public.tournament_entries;
  eb public.tournament_entries;
  v_mine_is_a boolean;
  v_games jsonb;
  v_won_a integer;
  v_won_b integer;
  v_won_mine integer;
  v_won_theirs integer;
  v_winner uuid;
  v_match_id uuid := null;
  v_doubles_id uuid := null;
  v_a1 uuid;
  v_a2 uuid;
  v_b1 uuid;
  v_b2 uuid;
begin
  select * into m from public.tournament_matches where id = p_match for update;
  if not found then
    raise exception 'Match not found.';
  end if;
  if m.status = 'done' then
    raise exception 'That match already has a result.';
  end if;
  if m.entry_a is null or m.entry_b is null then
    raise exception 'That match is still waiting for both places to be filled.';
  end if;

  select * into t from public.tournaments where id = m.tournament_id;
  select * into ea from public.tournament_entries where id = m.entry_a;
  select * into eb from public.tournament_entries where id = m.entry_b;

  v_mine_is_a := v_me in (ea.player_1, coalesce(ea.player_2, ea.player_1));
  if not v_mine_is_a and v_me not in (eb.player_1, coalesce(eb.player_2, eb.player_1)) then
    raise exception 'Only someone playing this match can report the score. The organiser can advance it without a score instead.';
  end if;

  if p_games is null or jsonb_typeof(p_games) <> 'array' or jsonb_array_length(p_games) = 0 then
    raise exception 'Enter a score for at least one game.';
  end if;

  -- Orient the scores to entry_a, whichever side reported them.
  if v_mine_is_a then
    v_games := p_games;
  else
    select jsonb_agg(jsonb_build_object('a', (g->>'b')::int, 'b', (g->>'a')::int) order by idx)
      into v_games
      from jsonb_array_elements(p_games) with ordinality as x(g, idx);
  end if;

  select count(*) filter (where (g->>'a')::int > (g->>'b')::int),
         count(*) filter (where (g->>'b')::int > (g->>'a')::int)
    into v_won_a, v_won_b
    from jsonb_array_elements(v_games) as x(g);

  if v_won_a = v_won_b then
    raise exception 'A match can''t end level — play a decider.';
  end if;

  v_winner := case when v_won_a > v_won_b then m.entry_a else m.entry_b end;

  -- The rating-bearing match, if this tournament counts. reported_by has to
  -- be player_a — see 0017 — so the reporting side is always team A there,
  -- which is why the scores get oriented a second time below.
  if t.is_ranked then
    v_won_mine := case when v_mine_is_a then v_won_a else v_won_b end;
    v_won_theirs := case when v_mine_is_a then v_won_b else v_won_a end;

    if t.mode = 'singles' then
      insert into public.matches (
        player_a, player_b, games, games_won_a, games_won_b, winner, reported_by, is_ranked
      )
      values (
        v_me,
        case when v_mine_is_a then eb.player_1 else ea.player_1 end,
        p_games,
        v_won_mine,
        v_won_theirs,
        case when v_won_mine > v_won_theirs
          then v_me
          else case when v_mine_is_a then eb.player_1 else ea.player_1 end
        end,
        v_me,
        true
      )
      returning id into v_match_id;
    else
      v_a1 := v_me;
      if v_mine_is_a then
        v_a2 := case when ea.player_1 = v_me then ea.player_2 else ea.player_1 end;
        v_b1 := eb.player_1;
        v_b2 := eb.player_2;
      else
        v_a2 := case when eb.player_1 = v_me then eb.player_2 else eb.player_1 end;
        v_b1 := ea.player_1;
        v_b2 := ea.player_2;
      end if;

      insert into public.doubles_matches (
        a1, a2, b1, b2, games, games_won_a, games_won_b, winner_team, reported_by, is_ranked
      )
      values (
        v_a1, v_a2, v_b1, v_b2, p_games, v_won_mine, v_won_theirs,
        case when v_won_mine > v_won_theirs then 'a' else 'b' end,
        v_me,
        true
      )
      returning id into v_doubles_id;
    end if;
  end if;

  update public.tournament_matches set
    games = v_games,
    games_won_a = v_won_a,
    games_won_b = v_won_b,
    winner_entry = v_winner,
    status = 'done',
    match_id = v_match_id,
    doubles_match_id = v_doubles_id,
    reported_by = v_me,
    reported_at = now()
  where id = p_match;

  perform public.advance_bracket(p_match);

  return jsonb_build_object(
    'winner_entry', v_winner,
    'needs_confirmation', (v_match_id is not null or v_doubles_id is not null)
  );
end;
$$;

grant execute on function public.report_tournament_match(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- advance_tournament_match — organiser only: a walkover, no score, no rating.
--
-- For a no-show or a retirement. Kept separate from reporting a score so that
-- "the bracket moved on" and "somebody's rating changed" can never be the
-- same action performed by someone who wasn't playing.
-- ---------------------------------------------------------------------------
create or replace function public.advance_tournament_match(
  p_match uuid,
  p_winner_entry uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.tournament_matches;
begin
  select * into m from public.tournament_matches where id = p_match for update;
  if not found then
    raise exception 'Match not found.';
  end if;
  if not public.is_organiser(m.tournament_id) then
    raise exception 'Only the organiser can advance a match without a score.';
  end if;
  if m.status = 'done' then
    raise exception 'That match already has a result.';
  end if;
  if p_winner_entry is null or p_winner_entry not in (m.entry_a, m.entry_b) then
    raise exception 'Pick which side goes through.';
  end if;

  update public.tournament_matches
    set winner_entry = p_winner_entry,
        status = 'done',
        reported_by = auth.uid(),
        reported_at = now()
    where id = p_match;

  perform public.advance_bracket(p_match);
end;
$$;

grant execute on function public.advance_tournament_match(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- delete_tournament — the organiser's, at any stage.
--
-- Entries and matches cascade. Any rating-bearing matches it created are
-- deliberately left alone: those are real results between real players who
-- confirmed them, and they don't stop being real because the bracket was
-- tidied away.
-- ---------------------------------------------------------------------------
create or replace function public.delete_tournament(p_tournament uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_organiser(p_tournament) then
    raise exception 'Only the organiser can delete this tournament.';
  end if;
  delete from public.tournaments where id = p_tournament;
end;
$$;

grant execute on function public.delete_tournament(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- tournament_standings — the table for a round robin.
--
-- Ordered by matches won, then games won minus games lost, then points won
-- minus points lost. Two tiebreaks because a round robin at a club regularly
-- ends with people level on matches, and "who won more games" is the ordering
-- everyone already expects from a group stage.
-- ---------------------------------------------------------------------------
create or replace function public.tournament_standings(p_tournament uuid)
returns table (
  entry_id uuid,
  played integer,
  won integer,
  lost integer,
  games_for integer,
  games_against integer,
  points_for integer,
  points_against integer
)
language sql
security definer
stable
set search_path = public
as $$
  with sides as (
    select m.entry_a as entry, m.winner_entry, m.games_won_a as gf, m.games_won_b as ga, m.games, true as is_a
    from public.tournament_matches m
    where m.tournament_id = p_tournament and m.status = 'done' and m.entry_a is not null
    union all
    select m.entry_b, m.winner_entry, m.games_won_b, m.games_won_a, m.games, false
    from public.tournament_matches m
    where m.tournament_id = p_tournament and m.status = 'done' and m.entry_b is not null
  )
  select
    e.id,
    count(s.entry)::integer,
    count(*) filter (where s.winner_entry = e.id)::integer,
    count(*) filter (where s.winner_entry is not null and s.winner_entry <> e.id)::integer,
    coalesce(sum(s.gf), 0)::integer,
    coalesce(sum(s.ga), 0)::integer,
    coalesce(sum(
      (select coalesce(sum((g->>(case when s.is_a then 'a' else 'b' end))::int), 0)
       from jsonb_array_elements(coalesce(s.games, '[]'::jsonb)) as g)
    ), 0)::integer,
    coalesce(sum(
      (select coalesce(sum((g->>(case when s.is_a then 'b' else 'a' end))::int), 0)
       from jsonb_array_elements(coalesce(s.games, '[]'::jsonb)) as g)
    ), 0)::integer
  from public.tournament_entries e
  left join sides s on s.entry = e.id
  where e.tournament_id = p_tournament
  group by e.id
  order by 3 desc, (coalesce(sum(s.gf), 0) - coalesce(sum(s.ga), 0)) desc, 2 desc;
$$;

grant execute on function public.tournament_standings(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Check it worked.
--
--   select to_regclass('public.tournaments') is not null as tables_created,
--          to_regproc('public.start_tournament') is not null as can_start,
--          to_regproc('public.report_tournament_match') is not null as can_report,
--          to_regproc('public.tournament_standings') is not null as has_standings;
--   -- expect true, true, true, true
-- ---------------------------------------------------------------------------
