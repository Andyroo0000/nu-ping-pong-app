-- NU Ping Pong — mixed teams, bulk entry, and random pairing.
--
-- Additive on top of 0022.
--
-- ---------------------------------------------------------------------------
-- Why the entry model has to change
--
-- 0022 let an entry be EITHER a club account or a typed-in name, never a mix.
-- That holds up for singles and falls over the moment you want random doubles
-- teams from a sheet of names: shuffle a list that's half club members and
-- half guests and most of the teams it produces are one of each. The old
-- constraint rejected exactly those.
--
-- So an entry is now two SLOTS, and each slot is independently either a club
-- account or a name:
--
--   slot 1   player_1  or  guest_name      (required)
--   slot 2   player_2  or  guest_name_2    (doubles only)
--
-- which gives, without special cases: a singles member, a singles guest, a
-- pair of members, a pair of guests, and a member partnered with a guest.
--
-- ---------------------------------------------------------------------------
-- What a guest costs
--
-- Nothing about the bracket — guests play, advance and win like anyone else.
-- What they can't do is carry a rating, because there's no account to move.
-- So publish_tournament_results now skips any match where EITHER side has a
-- guest in EITHER slot. Before this it only checked slot 1, which was fine
-- when a mixed team couldn't exist and would have tried to insert a doubles
-- result with a null player the moment one could.
-- ---------------------------------------------------------------------------

-- This builds directly on 0022's guest_name column. Run out of order, the
-- first thing you'd see is `column "guest_name" does not exist` from inside a
-- check constraint, which says nothing about which migration is missing.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tournament_entries'
      and column_name = 'guest_name'
  ) then
    raise exception
      'Run 0022_tournament_run_sheet.sql first — this migration extends the guest_name column it adds.';
  end if;
end;
$$;

alter table public.tournament_entries add column if not exists guest_name_2 text;

alter table public.tournament_entries drop constraint if exists entry_is_member_or_guest;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'entry_slots_are_valid') then
    alter table public.tournament_entries
      add constraint entry_slots_are_valid
      check (
        -- Slot one is filled, exactly one way.
        ((player_1 is not null) <> (guest_name is not null))
        -- Slot two is empty, or filled exactly one way.
        and (
          (player_2 is null and guest_name_2 is null)
          or ((player_2 is not null) <> (guest_name_2 is not null))
        )
        and (guest_name is null or char_length(trim(guest_name)) between 1 and 60)
        and (guest_name_2 is null or char_length(trim(guest_name_2)) between 1 and 60)
        -- A guest can't partner themselves.
        and (
          guest_name is null or guest_name_2 is null
          or lower(trim(guest_name)) <> lower(trim(guest_name_2))
        )
      );
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- add_tournament_entries — a whole field in one call.
--
-- p_entries is an array of {player_1, guest_1, player_2, guest_2}, any of
-- which may be absent. One call rather than one per entry because the caller
-- is usually pasting a sheet or shuffling twenty names into ten teams, and
-- twenty round trips to insert them is the kind of thing that makes an
-- organiser give up halfway.
--
-- Validation is per-entry and the whole call is one transaction, so a field
-- with a mistake in it lands as nothing rather than as half a draw.
-- ---------------------------------------------------------------------------
create or replace function public.add_tournament_entries(
  p_tournament uuid,
  p_entries jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.tournaments;
  e jsonb;
  v_p1 uuid;
  v_p2 uuid;
  v_g1 text;
  v_g2 text;
  v_count integer := 0;
  v_seen_players uuid[] := array[]::uuid[];
  v_seen_guests text[] := array[]::text[];
  v_slot uuid;
begin
  select * into t from public.tournaments where id = p_tournament for update;
  if not found then
    raise exception 'Tournament not found.';
  end if;
  if t.created_by <> auth.uid() then
    raise exception 'Only the organiser can add entries.';
  end if;
  if t.status <> 'setup' then
    raise exception 'That tournament has already started.';
  end if;
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' then
    raise exception 'No entries given.';
  end if;

  -- Everyone already entered, so a second paste doesn't duplicate the field.
  select coalesce(array_agg(x.p), array[]::uuid[]) into v_seen_players
  from (
    select player_1 as p from public.tournament_entries
    where tournament_id = p_tournament and player_1 is not null
    union all
    select player_2 from public.tournament_entries
    where tournament_id = p_tournament and player_2 is not null
  ) x;

  select coalesce(array_agg(lower(trim(x.g))), array[]::text[]) into v_seen_guests
  from (
    select guest_name as g from public.tournament_entries
    where tournament_id = p_tournament and guest_name is not null
    union all
    select guest_name_2 from public.tournament_entries
    where tournament_id = p_tournament and guest_name_2 is not null
  ) x;

  for e in select * from jsonb_array_elements(p_entries) loop
    v_p1 := nullif(e->>'player_1', '')::uuid;
    v_p2 := nullif(e->>'player_2', '')::uuid;
    v_g1 := nullif(trim(coalesce(e->>'guest_1', '')), '');
    v_g2 := nullif(trim(coalesce(e->>'guest_2', '')), '');

    if v_p1 is null and v_g1 is null then
      raise exception 'Every entry needs at least one player.';
    end if;
    if v_p1 is not null and v_g1 is not null then
      raise exception 'An entry slot is a club account or a name, not both.';
    end if;
    if v_p2 is not null and v_g2 is not null then
      raise exception 'An entry slot is a club account or a name, not both.';
    end if;

    if t.mode = 'doubles' and v_p2 is null and v_g2 is null then
      raise exception 'A doubles tournament needs two people per entry.';
    end if;
    if t.mode = 'singles' and (v_p2 is not null or v_g2 is not null) then
      raise exception 'A singles tournament takes one person per entry.';
    end if;

    if v_p1 is not null and v_p2 is not null and v_p1 = v_p2 then
      raise exception 'A pair needs two different people.';
    end if;

    -- Nobody may appear twice, in either slot, across the whole field.
    foreach v_slot in array array_remove(array[v_p1, v_p2], null) loop
      if v_slot = any(v_seen_players) then
        raise exception 'Someone is entered twice: %',
          (select coalesce(full_name, '@' || username) from public.profiles where id = v_slot);
      end if;
      v_seen_players := v_seen_players || v_slot;
    end loop;

    if v_g1 is not null then
      if lower(v_g1) = any(v_seen_guests) then
        raise exception '% is entered twice.', v_g1;
      end if;
      v_seen_guests := v_seen_guests || lower(v_g1);
    end if;
    if v_g2 is not null then
      if lower(v_g2) = any(v_seen_guests) then
        raise exception '% is entered twice.', v_g2;
      end if;
      v_seen_guests := v_seen_guests || lower(v_g2);
    end if;

    if v_p1 is not null and not exists (select 1 from public.profiles where id = v_p1) then
      raise exception 'That player no longer exists.';
    end if;
    if v_p2 is not null and not exists (select 1 from public.profiles where id = v_p2) then
      raise exception 'That player no longer exists.';
    end if;
    if v_p1 is not null and v_p2 is not null and public.is_blocked_pair(v_p1, v_p2) then
      raise exception 'Two of those players have blocked each other.';
    end if;

    insert into public.tournament_entries
      (tournament_id, player_1, player_2, guest_name, guest_name_2)
    values (p_tournament, v_p1, v_p2, v_g1, v_g2);

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.add_tournament_entries(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- publish_tournament_results — skip anything with a guest anywhere in it.
--
-- Otherwise a mixed team would reach the doubles insert with a null partner,
-- which the not-null constraint would reject and take the rest of the
-- publish with it.
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

    -- Every seat that will be needed has to be a real account.
    if ea.player_1 is null or eb.player_1 is null
       or (t.mode = 'doubles' and (ea.player_2 is null or eb.player_2 is null)) then
      v_skipped_guest := v_skipped_guest + 1;
      continue;
    end if;

    v_win_entry := m.winner_entry;
    v_lose_entry := case when m.winner_entry = m.entry_a then m.entry_b else m.entry_a end;
    v_won_w := greatest(m.games_won_a, m.games_won_b);
    v_won_l := least(m.games_won_a, m.games_won_b);

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
      select w.player_1, l.player_1, v_games, v_won_w, v_won_l, w.player_1, w.player_1, true
      from public.tournament_entries w, public.tournament_entries l
      where w.id = v_win_entry and l.id = v_lose_entry
      returning id into v_new_id;

      update public.tournament_matches set match_id = v_new_id where id = m.id;
    else
      insert into public.doubles_matches (
        a1, a2, b1, b2, games, games_won_a, games_won_b, winner_team, reported_by, is_ranked
      )
      select w.player_1, w.player_2, l.player_1, l.player_2,
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

-- ---------------------------------------------------------------------------
-- Check it worked.
--
--   select exists (select 1 from information_schema.columns
--                  where table_schema='public' and table_name='tournament_entries'
--                    and column_name='guest_name_2') as has_mixed_teams,
--          to_regproc('public.add_tournament_entries') is not null as can_bulk_add;
--   -- expect true, true
-- ---------------------------------------------------------------------------
