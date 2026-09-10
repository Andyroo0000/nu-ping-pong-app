-- NU Ping Pong — removing a player, properly.
--
-- Additive on top of 0018. Creates two admin functions and changes no data on
-- its own.
--
-- ---------------------------------------------------------------------------
-- Why "Delete user" in the dashboard fails
--
-- profiles.id references auth.users on delete cascade, so deleting the login
-- tries to delete the profile — and ten foreign keys have no on-delete rule
-- and refuse:
--
--   matches.player_a, player_b, winner, reported_by
--   doubles_matches.a1, a2, b1, b2, reported_by
--   rating_history.player_id
--
-- Postgres reports that as "Database error deleting user", which says nothing
-- about which constraint or why. There's a second layer behind it too:
-- rating_history.match_id and .doubles_match_id have no on-delete rule
-- either, so the matches can't go until the history rows referencing them do.
--
-- Rather than making everything cascade — which would silently erase results
-- from other people's history the moment anyone was deleted — deletion is an
-- explicit operation with an explicit order.
--
-- ---------------------------------------------------------------------------
-- Two different jobs
--
-- delete_player() is for test accounts and duplicates: the player and their
-- results go, and every opponent's rating is put back to where it was before
-- those matches. That last part is what makes hard deletion safe for the
-- ladder, and it's only possible because every confirmed match stores the
-- rating change it caused — rating_delta / rating_delta_loser for singles,
-- and all four deltas for doubles. So the reversal is exact, not estimated.
--
-- anonymise_player() is for a real person who leaves and wants their data
-- gone. Their name, bio, hall and photo are removed, and their results stay
-- as "Former player" so nobody else's history develops holes and no rating
-- has to move. For most requests this is the right one: someone leaving the
-- club has no interest in rewriting everyone else's record.
--
-- ---------------------------------------------------------------------------
-- Who can run these
--
-- Nobody, through the app. Postgres grants EXECUTE on a new function to
-- PUBLIC by default, and a security-definer function that deletes any player
-- by id would be the worst hole in the schema — so both are revoked from
-- public, anon and authenticated below, leaving them to the table owner. In
-- practice: the Supabase SQL editor.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- delete_player — remove a player, their results, and the rating those
-- results moved. Returns a summary of what went.
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
  v_singles integer := 0;
  v_doubles integer := 0;
  v_channels integer := 0;
  v_history integer := 0;
  v_login_removed boolean := false;
begin
  select username into v_username from public.profiles where id = p_player;
  if v_username is null then
    raise exception 'No profile with id %', p_player;
  end if;

  -- -------------------------------------------------------------------------
  -- 1. Put every opponent's rating back.
  --
  -- Before anything is deleted, because the stored deltas are the only record
  -- of what these matches did. rating_delta is the winner's gain and
  -- rating_delta_loser the loser's loss, both positive; matches confirmed
  -- before 0012 have no rating_delta_loser, and back then the two sides moved
  -- by the same amount, so rating_delta is the correct fallback.
  -- -------------------------------------------------------------------------
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
  -- a player at the rating floor can take a 0 delta and still have lost.
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

  -- -------------------------------------------------------------------------
  -- 2. Chats that only existed for this player.
  --
  -- Their membership would cascade on its own, but that leaves a one-person
  -- thread sitting in the other player's chat list forever. A group channel
  -- with two people left in it is still a usable chat, so only channels that
  -- would drop below two members go.
  -- -------------------------------------------------------------------------
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
  get diagnostics v_channels = row_count;

  -- -------------------------------------------------------------------------
  -- 3. Rating history — theirs, and everyone else's rows that point at the
  --    matches about to be deleted. rating_history.match_id has no on-delete
  --    rule, so this is what actually unblocks step 4.
  -- -------------------------------------------------------------------------
  delete from public.rating_history rh
  where rh.player_id = p_player
     or rh.match_id in (
          select m.id from public.matches m where p_player in (m.player_a, m.player_b)
        )
     or rh.doubles_match_id in (
          select d.id from public.doubles_matches d
          where p_player in (d.a1, d.a2, d.b1, d.b2)
        );
  get diagnostics v_history = row_count;

  -- 4. The results themselves.
  delete from public.doubles_matches d where p_player in (d.a1, d.a2, d.b1, d.b2);
  get diagnostics v_doubles = row_count;

  delete from public.matches m where p_player in (m.player_a, m.player_b);
  get diagnostics v_singles = row_count;

  -- 5. The profile. Everything left — queue entry, blocks, reports, push
  --    subscriptions, live matches, challenges, channel memberships — has an
  --    on-delete rule already and goes with it. Messages and suggestions are
  --    `set null`, so what they wrote stays without an author.
  delete from public.profiles where id = p_player;

  -- 6. The login, so the dashboard doesn't still list them.
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
    'rating_history_rows_removed', v_history,
    'chats_removed', v_channels,
    'login_removed', v_login_removed
  );
end;
$$;

revoke all on function public.delete_player(uuid, boolean) from public;

-- ---------------------------------------------------------------------------
-- anonymise_player — strip the personal data, keep the results.
-- ---------------------------------------------------------------------------
create or replace function public.anonymise_player(p_player uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
  v_new_username text;
  v_avatar text;
begin
  select username, avatar_path into v_username, v_avatar
  from public.profiles where id = p_player;
  if v_username is null then
    raise exception 'No profile with id %', p_player;
  end if;

  -- username is unique and shows up in every URL, so it becomes something
  -- stable and meaningless rather than being blanked.
  v_new_username := 'former-' || substr(replace(p_player::text, '-', ''), 1, 8);

  update public.profiles set
    username = v_new_username,
    full_name = 'Former player',
    bio = null,
    year = null,
    home_hall = null,
    availability = '{}',
    play_preference = 'both',
    avatar_path = null
  where id = p_player;

  -- Anything that only exists to reach them, or that they wrote about someone
  -- else, goes. Their results and ratings stay.
  delete from public.push_subscriptions where user_id = p_player;
  delete from public.queue_entries where user_id = p_player;
  delete from public.blocks where blocker = p_player or blocked = p_player;
  delete from public.messages where author_id = p_player and kind = 'user';
  delete from public.reports where reporter = p_player;

  return jsonb_build_object(
    'was', v_username,
    'now', v_new_username,
    'avatar_to_delete', coalesce(v_avatar, '(none)'),
    'note', 'Results and ratings kept. Delete the avatar file in Storage > avatars, and the login in Authentication > Users if they want it gone.'
  );
end;
$$;

revoke all on function public.anonymise_player(uuid) from public;

-- ---------------------------------------------------------------------------
-- How to use these
--
--   -- find the id
--   select id, username, full_name, rating, wins, losses
--   from public.profiles where username = 'the-username';
--
--   -- see what a delete would take with it, BEFORE deleting
--   select
--     (select count(*) from public.matches
--      where '<id>' in (player_a::text, player_b::text)) as singles_matches,
--     (select count(*) from public.doubles_matches
--      where '<id>' in (a1::text, a2::text, b1::text, b2::text)) as doubles_matches;
--
--   -- a test account: remove them and put every opponent's rating back
--   select public.delete_player('<id>');
--
--   -- a real person leaving: keep the results, remove the person
--   select public.anonymise_player('<id>');
--
-- Both are owner-only, so they work in the SQL editor and nowhere else.
-- Neither can be called from the app.
-- ---------------------------------------------------------------------------
