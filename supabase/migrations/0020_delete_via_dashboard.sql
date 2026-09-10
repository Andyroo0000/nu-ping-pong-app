-- NU Ping Pong — make the dashboard's "Delete user" button work.
--
-- Additive on top of 0019. Changes no data on its own.
--
-- ---------------------------------------------------------------------------
-- Why 0019 wasn't enough
--
-- 0019 added delete_player(), which you have to call from the SQL editor. The
-- dashboard button doesn't call it — Authentication > Users runs its own
-- `delete from auth.users`, that cascades into public.profiles, and the same
-- ten foreign keys with no on-delete rule refuse. So the button still says
-- "Database error deleting user".
--
-- The fix is to put the cleanup on the profile row itself, as a BEFORE DELETE
-- trigger, so it runs no matter which way the deletion arrives:
--
--   * the dashboard button   -> auth.users cascade -> profiles -> trigger
--   * select delete_player() -> profiles -> trigger
--   * delete from public.profiles -> trigger
--
-- One implementation, three doors into it, and no way to delete a player and
-- leave the ladder wrong.
--
-- ---------------------------------------------------------------------------
-- The thing to understand before running this
--
-- After this migration, deleting a player DELETES THEIR MATCHES — from
-- everyone's history, not just theirs — and puts each opponent's rating back
-- to what it was before those matches. That's the only self-consistent way to
-- do it: leaving the matches would orphan them, and leaving the ratings would
-- credit people for games that no longer exist.
--
-- It is exact rather than approximate, because every confirmed match stores
-- the rating change it caused. But it is not reversible.
--
-- For a real person who leaves, anonymise_player() from 0019 is still the
-- better answer: their name and photo go, the results stay, and nobody else's
-- history develops holes. Deleting is for test accounts and duplicates.
--
-- ---------------------------------------------------------------------------
-- Privileges
--
-- cleanup_player_data is SECURITY DEFINER on purpose. The dashboard delete
-- arrives as supabase_auth_admin, which has no business writing to
-- public.matches — as an ordinary trigger the cleanup would fail on
-- permissions, which is just the original error wearing a different hat. As
-- definer it runs as the owner. It's revoked from public so it can't be
-- called directly.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- cleanup_player_data — everything that has to happen before a profile row
-- can be deleted. Extracted from 0019's delete_player so the trigger and the
-- function can't drift apart.
-- ---------------------------------------------------------------------------
create or replace function public.cleanup_player_data(p_player uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 1. Put every opponent's rating back, before anything is deleted: the
  --    stored deltas are the only record of what these matches did.
  --    rating_delta is the winner's gain and rating_delta_loser the loser's
  --    loss, both positive. Matches confirmed before 0012 have no
  --    rating_delta_loser, and both sides moved by the same amount then, so
  --    rating_delta is the correct fallback.
  update public.profiles p set
    rating = p.rating - x.delta,
    wins = greatest(p.wins - x.won, 0),
    losses = greatest(p.losses - x.lost, 0)
  from (
    select
      case when m.player_a = p_player then m.player_b else m.player_a end as id,
      sum(case
        when m.winner <> p_player then coalesce(m.rating_delta, 0)
        else -coalesce(m.rating_delta_loser, m.rating_delta, 0)
      end)::integer as delta,
      count(*) filter (where m.winner <> p_player)::integer as won,
      count(*) filter (where m.winner = p_player)::integer as lost
    from public.matches m
    where m.status = 'confirmed'
      and m.is_ranked
      and p_player in (m.player_a, m.player_b)
    group by 1
  ) x
  where p.id = x.id;

  -- Doubles deltas are already signed, so reversing is a plain subtraction.
  -- Win/loss comes from which team won rather than the delta's sign, because
  -- a player at the rating floor takes a 0 delta and still lost.
  update public.profiles p set
    doubles_rating = p.doubles_rating - x.delta,
    doubles_wins = greatest(p.doubles_wins - x.won, 0),
    doubles_losses = greatest(p.doubles_losses - x.lost, 0)
  from (
    select seat.id,
           sum(coalesce(seat.delta, 0))::integer as delta,
           count(*) filter (where seat.won)::integer as won,
           count(*) filter (where not seat.won)::integer as lost
    from public.doubles_matches d
    cross join lateral (
      values
        (d.a1, d.delta_a1, d.winner_team = 'a'),
        (d.a2, d.delta_a2, d.winner_team = 'a'),
        (d.b1, d.delta_b1, d.winner_team = 'b'),
        (d.b2, d.delta_b2, d.winner_team = 'b')
    ) as seat(id, delta, won)
    where d.status = 'confirmed'
      and d.is_ranked
      and p_player in (d.a1, d.a2, d.b1, d.b2)
      and seat.id <> p_player
    group by seat.id
  ) x
  where p.id = x.id;

  -- 2. Chats that only existed for this player. Their membership cascades on
  --    its own, but that leaves a one-person thread in someone's chat list
  --    forever. A group channel with two people left is still usable, so only
  --    channels dropping below two members go.
  with doomed as (
    select cm.channel_id
    from public.channel_members cm
    where cm.user_id = p_player
      and (
        select count(*) from public.channel_members x
        where x.channel_id = cm.channel_id and x.user_id <> p_player
      ) < 2
  )
  delete from public.channels c
  using doomed d
  where c.id = d.channel_id;

  -- 3. Rating history: theirs, plus everyone else's rows pointing at the
  --    matches about to go. rating_history.match_id has no on-delete rule, so
  --    this is what unblocks step 4.
  delete from public.rating_history rh
  where rh.player_id = p_player
     or rh.match_id in (
          select m.id from public.matches m where p_player in (m.player_a, m.player_b)
        )
     or rh.doubles_match_id in (
          select d.id from public.doubles_matches d
          where p_player in (d.a1, d.a2, d.b1, d.b2)
        );

  -- 4. The results themselves.
  delete from public.doubles_matches d where p_player in (d.a1, d.a2, d.b1, d.b2);
  delete from public.matches m where p_player in (m.player_a, m.player_b);

  -- Everything else referencing the profile already has an on-delete rule and
  -- goes with the row: queue entry, blocks, reports, push subscriptions, live
  -- matches, challenges, channel memberships. Messages and suggestions are
  -- `set null`, so what they wrote stays without an author.
end;
$$;

revoke all on function public.cleanup_player_data(uuid) from public;

-- ---------------------------------------------------------------------------
-- The trigger. BEFORE DELETE, so the profile row still exists while its
-- dependents are cleared.
-- ---------------------------------------------------------------------------
create or replace function public.profiles_before_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.cleanup_player_data(old.id);
  return old;
end;
$$;

revoke all on function public.profiles_before_delete() from public;

drop trigger if exists profiles_cleanup_before_delete on public.profiles;
create trigger profiles_cleanup_before_delete
  before delete on public.profiles
  for each row
  execute function public.profiles_before_delete();

-- ---------------------------------------------------------------------------
-- delete_player — now a thin wrapper. The trigger does the work; this counts
-- what's about to go so it can still tell you, and removes the login too.
-- ---------------------------------------------------------------------------
create or replace function public.delete_player(
  p_player uuid,
  p_delete_login boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
  v_singles integer;
  v_doubles integer;
  v_login_removed boolean := false;
begin
  select username into v_username from public.profiles where id = p_player;
  if v_username is null then
    raise exception 'No profile with id %', p_player;
  end if;

  -- Counted before the delete, since afterwards there's nothing to count.
  select count(*) into v_singles from public.matches m
  where p_player in (m.player_a, m.player_b);
  select count(*) into v_doubles from public.doubles_matches d
  where p_player in (d.a1, d.a2, d.b1, d.b2);

  delete from public.profiles where id = p_player;

  if p_delete_login then
    begin
      delete from auth.users where id = p_player;
      v_login_removed := true;
    exception when insufficient_privilege then
      raise notice 'Profile deleted, but the login could not be removed from here — delete it in Authentication > Users.';
    end;
  end if;

  return jsonb_build_object(
    'deleted', v_username,
    'singles_matches_removed', v_singles,
    'doubles_matches_removed', v_doubles,
    'login_removed', v_login_removed
  );
end;
$$;

revoke all on function public.delete_player(uuid, boolean) from public;

-- ---------------------------------------------------------------------------
-- After this, all three of these work and do the same thing:
--
--   * Authentication > Users > select the user > Delete
--   * select public.delete_player('<id>');
--   * delete from public.profiles where id = '<id>';
--
-- Check what a delete would take with it first:
--
--   select p.username,
--     (select count(*) from public.matches m
--      where p.id in (m.player_a, m.player_b)) as singles_matches,
--     (select count(*) from public.doubles_matches d
--      where p.id in (d.a1, d.a2, d.b1, d.b2)) as doubles_matches
--   from public.profiles p where p.username = 'the-username';
--
-- And confirm the trigger is in place:
--
--   select tgname, tgenabled from pg_trigger
--   where tgrelid = 'public.profiles'::regclass and not tgisinternal;
--   -- expect profiles_cleanup_before_delete, O
-- ---------------------------------------------------------------------------
