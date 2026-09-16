-- NU Ping Pong — run a tournament off a sheet of names.
--
-- Additive on top of 0021.
--
-- ---------------------------------------------------------------------------
-- What changes
--
-- 0021 assumed players enter themselves and report their own scores. That's
-- the wrong shape for how a club night actually runs: one person has a list
-- of who turned up, makes the bracket, and keys in the scores as games
-- finish. Asking twenty people to each tap their way into a bracket first is
-- how a tournament doesn't start.
--
-- So three things:
--
-- 1. GUEST ENTRIES. An entry no longer has to be a club account. player_1 is
--    nullable and guest_name takes its place, which matters most at the first
--    few sessions — the organiser shouldn't have to make everyone sign up
--    before a bracket can exist. A guest entry can't carry a rating, so
--    matches involving one never produce a rating row.
--
-- 2. THE ORGANISER CAN KEY IN ANY SCORE. Not just matches they're playing in.
--
-- 3. RESULTS ARE PUBLISHED AT THE END, not as they're entered.
--    report_tournament_match no longer creates the rating-bearing match;
--    publish_tournament_results() does, in one go, and notifies every player
--    who needs to confirm. One batch of confirmations after the tournament
--    beats a trickle of them during it.
--
-- ---------------------------------------------------------------------------
-- The integrity property still holds
--
-- A published result is a PENDING match. Nobody's rating moves until the
-- other side confirms, so an organiser still cannot hand themselves rating —
-- which is the thing 0017 was about.
--
-- What does change is attribution. 0017 requires reported_by = player_a, so
-- a result the organiser keyed in is filed with the WINNING side as player_a
-- and the loser holding the confirm button. The organiser who actually typed
-- it is recorded on tournament_matches.reported_by, and the app says which
-- tournament a pending result came from, so nobody has to wonder why they're
-- being asked to confirm a match they don't remember reporting.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Guest entries
-- ---------------------------------------------------------------------------
alter table public.tournament_entries alter column player_1 drop not null;
alter table public.tournament_entries add column if not exists guest_name text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'entry_is_member_or_guest') then
    alter table public.tournament_entries
      add constraint entry_is_member_or_guest
      -- Either a club account (optionally a pair of them) or a typed-in name,
      -- never a mix: half-linked pairs would need every function here to
      -- decide what a rating means for one-and-a-half players.
      check (
        (player_1 is not null and guest_name is null)
        or (player_1 is null and player_2 is null
            and guest_name is not null
            and char_length(trim(guest_name)) between 1 and 60)
      );
  end if;
end;
$$;

-- The old unique indexes counted nulls as values worth being unique about.
drop index if exists public.tournament_entries_p1_once;
create unique index if not exists tournament_entries_p1_once
  on public.tournament_entries (tournament_id, player_1) where player_1 is not null;

alter table public.tournaments
  add column if not exists results_published_at timestamptz;

-- ---------------------------------------------------------------------------
-- add_tournament_guest — a name on the sheet, with no account behind it.
-- ---------------------------------------------------------------------------
create or replace function public.add_tournament_guest(
  p_tournament uuid,
  p_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.tournaments;
  v_name text := nullif(trim(coalesce(p_name, '')), '');
  v_id uuid;
begin
  select * into t from public.tournaments where id = p_tournament;
  if not found then
    raise exception 'Tournament not found.';
  end if;
  if t.created_by <> auth.uid() then
    raise exception 'Only the organiser can add a name.';
  end if;
  if t.status <> 'setup' then
    raise exception 'That tournament has already started.';
  end if;
  if v_name is null then
    raise exception 'Give the entry a name.';
  end if;
  if char_length(v_name) > 60 then
    raise exception 'That name is too long.';
  end if;
  if exists (
    select 1 from public.tournament_entries
    where tournament_id = p_tournament and lower(guest_name) = lower(v_name)
  ) then
    raise exception '% is already entered.', v_name;
  end if;

  insert into public.tournament_entries (tournament_id, guest_name)
  values (p_tournament, v_name)
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.add_tournament_guest(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- report_tournament_match — the organiser or a participant keys in a score.
--
-- No longer creates the rating-bearing match: that's publish_tournament_
-- results(). Recording a score and moving somebody's rating were happening in
-- one step, which is what forced only-participants-may-report. Splitting them
-- lets one person run the whole sheet.
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
  v_in_a boolean;
  v_in_b boolean;
  v_organiser boolean;
  v_games jsonb;
  v_won_a integer;
  v_won_b integer;
  v_winner uuid;
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

  v_organiser := t.created_by = v_me;
  v_in_a := ea.player_1 is not null and v_me in (ea.player_1, coalesce(ea.player_2, ea.player_1));
  v_in_b := eb.player_1 is not null and v_me in (eb.player_1, coalesce(eb.player_2, eb.player_1));

  if not (v_organiser or v_in_a or v_in_b) then
    raise exception 'Only the organiser or someone playing this match can enter the score.';
  end if;

  if p_games is null or jsonb_typeof(p_games) <> 'array' or jsonb_array_length(p_games) = 0 then
    raise exception 'Enter a score for at least one game.';
  end if;

  -- One rule: a player enters their own score first, the organiser reads the
  -- bracket top line first. Only the away side needs flipping — and an
  -- organiser who is also playing counts as a player, because the app shows
  -- them their own match with their own name on the first line.
  if v_in_b and not v_in_a then
    select jsonb_agg(jsonb_build_object('a', (g->>'b')::int, 'b', (g->>'a')::int) order by idx)
      into v_games
      from jsonb_array_elements(p_games) with ordinality as x(g, idx);
  else
    v_games := p_games;
  end if;

  select count(*) filter (where (g->>'a')::int > (g->>'b')::int),
         count(*) filter (where (g->>'b')::int > (g->>'a')::int)
    into v_won_a, v_won_b
    from jsonb_array_elements(v_games) as x(g);

  if v_won_a = v_won_b then
    raise exception 'A match can''t end level — play a decider.';
  end if;

  v_winner := case when v_won_a > v_won_b then m.entry_a else m.entry_b end;

  update public.tournament_matches set
    games = v_games,
    games_won_a = v_won_a,
    games_won_b = v_won_b,
    winner_entry = v_winner,
    status = 'done',
    reported_by = v_me,
    reported_at = now()
  where id = p_match;

  perform public.advance_bracket(p_match);

  return jsonb_build_object('winner_entry', v_winner, 'needs_confirmation', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- publish_tournament_results — turn the finished sheet into pending matches.
--
-- One pending match per played, ranked result between two club entries. Filed
-- with the winning side as player_a so the loser holds the confirm button,
-- which is what 0017 requires and also what you want: the person being asked
-- to agree is the person who might disagree.
--
-- Idempotent. A match that already produced a rating row is skipped, so
-- running it twice — or running it again after a late result is keyed in —
-- adds only what's new.
-- ---------------------------------------------------------------------------
create or replace function public.publish_tournament_results(p_tournament uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.tournaments;
  m record;
  ea public.tournament_entries;
  eb public.tournament_entries;
  v_win_entry uuid;
  v_lose_entry uuid;
  v_won_w integer;
  v_won_l integer;
  v_games jsonb;
  v_new_id uuid;
  v_sent integer := 0;
  v_skipped_guest integer := 0;
  v_skipped_done integer := 0;
begin
  select * into t from public.tournaments where id = p_tournament for update;
  if not found then
    raise exception 'Tournament not found.';
  end if;
  if t.created_by <> auth.uid() then
    raise exception 'Only the organiser can send the results out.';
  end if;
  if not t.is_ranked then
    raise exception 'This is a casual tournament — it doesn''t affect ratings.';
  end if;

  for m in
    select * from public.tournament_matches
    where tournament_id = p_tournament
      and status = 'done'
      and games is not null
      and winner_entry is not null
    order by round, slot
  loop
    if m.match_id is not null or m.doubles_match_id is not null then
      v_skipped_done := v_skipped_done + 1;
      continue;
    end if;

    select * into ea from public.tournament_entries where id = m.entry_a;
    select * into eb from public.tournament_entries where id = m.entry_b;

    -- A guest has no rating to move.
    if ea.player_1 is null or eb.player_1 is null then
      v_skipped_guest := v_skipped_guest + 1;
      continue;
    end if;

    v_win_entry := m.winner_entry;
    v_lose_entry := case when m.winner_entry = m.entry_a then m.entry_b else m.entry_a end;
    v_won_w := greatest(m.games_won_a, m.games_won_b);
    v_won_l := least(m.games_won_a, m.games_won_b);

    -- Orient the games to the winner, since the winner becomes player_a.
    if m.winner_entry = m.entry_a then
      v_games := m.games;
    else
      select jsonb_agg(jsonb_build_object('a', (g->>'b')::int, 'b', (g->>'a')::int) order by idx)
        into v_games
        from jsonb_array_elements(m.games) with ordinality as x(g, idx);
    end if;

    if t.mode = 'singles' then
      insert into public.matches (
        player_a, player_b, games, games_won_a, games_won_b, winner, reported_by, is_ranked
      )
      select
        w.player_1, l.player_1, v_games, v_won_w, v_won_l, w.player_1, w.player_1, true
      from public.tournament_entries w, public.tournament_entries l
      where w.id = v_win_entry and l.id = v_lose_entry
      returning id into v_new_id;

      update public.tournament_matches set match_id = v_new_id where id = m.id;
    else
      insert into public.doubles_matches (
        a1, a2, b1, b2, games, games_won_a, games_won_b, winner_team, reported_by, is_ranked
      )
      select
        w.player_1, w.player_2, l.player_1, l.player_2,
        v_games, v_won_w, v_won_l, 'a', w.player_1, true
      from public.tournament_entries w, public.tournament_entries l
      where w.id = v_win_entry and l.id = v_lose_entry
      returning id into v_new_id;

      update public.tournament_matches set doubles_match_id = v_new_id where id = m.id;
    end if;

    v_sent := v_sent + 1;
  end loop;

  update public.tournaments set results_published_at = now() where id = p_tournament;

  return jsonb_build_object(
    'sent', v_sent,
    'already_sent', v_skipped_done,
    'skipped_guests', v_skipped_guest
  );
end;
$$;

grant execute on function public.publish_tournament_results(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- pending_confirmations_for — who needs to confirm something from this
-- tournament, so the app can notify exactly them.
-- ---------------------------------------------------------------------------
create or replace function public.tournament_confirmers(p_tournament uuid)
returns table (player_id uuid)
language sql
security definer
stable
set search_path = public
as $$
  select distinct m.player_b
  from public.tournament_matches tm
  join public.matches m on m.id = tm.match_id
  where tm.tournament_id = p_tournament and m.status = 'pending'
  union
  select distinct x.player
  from public.tournament_matches tm
  join public.doubles_matches d on d.id = tm.doubles_match_id
  cross join lateral (values (d.b1), (d.b2)) as x(player)
  where tm.tournament_id = p_tournament and d.status = 'pending';
$$;

grant execute on function public.tournament_confirmers(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Check it worked.
--
--   select to_regproc('public.add_tournament_guest') is not null as can_add_names,
--          to_regproc('public.publish_tournament_results') is not null as can_publish,
--          exists (select 1 from information_schema.columns
--                  where table_schema='public' and table_name='tournament_entries'
--                    and column_name='guest_name') as has_guests;
--   -- expect true, true, true
-- ---------------------------------------------------------------------------
