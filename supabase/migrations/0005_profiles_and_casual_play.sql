-- NU Ping Pong — introductions and casual play.
--
-- Profile pictures, bios, year, home hall and availability, plus matches that
-- can be logged as casual so they show up without moving anyone's rating.
--
-- Additive on top of 0004. Safe to run on a database with real data.

-- ---------------------------------------------------------------------------
-- Introductory profile fields
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists bio text,
  add column if not exists year text,
  add column if not exists home_hall text,
  add column if not exists availability text[] not null default '{}',
  add column if not exists play_preference text not null default 'both',
  add column if not exists avatar_path text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_bio_length_check') then
    alter table public.profiles add constraint profiles_bio_length_check
      check (bio is null or char_length(bio) <= 400);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'profiles_year_check') then
    alter table public.profiles add constraint profiles_year_check
      check (year is null or year in (
        'first-year', 'sophomore', 'junior', 'senior', 'grad', 'faculty', 'staff'
      ));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'profiles_play_preference_check') then
    alter table public.profiles add constraint profiles_play_preference_check
      check (play_preference in ('casual', 'competitive', 'both'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'profiles_availability_check') then
    alter table public.profiles add constraint profiles_availability_check
      check (availability <@ array[
        'weekday-morning', 'weekday-afternoon', 'weekday-evening',
        'weekend-morning', 'weekend-afternoon', 'weekend-evening'
      ]::text[]);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Lock down which columns a player may write.
--
-- Row level security decides which *rows* a policy applies to, never which
-- *columns*. 0001's "Users can update their own profile" policy therefore let
-- any signed-in player PATCH their own row with {"rating": 9999, "wins": 500}
-- straight through the REST API — the anon key ships in the browser bundle, so
-- that endpoint is reachable by anyone. Nothing in the app ever did it, but
-- the ladder was writable.
--
-- Column-level grants are the fix: rating, wins and losses stay readable but
-- become writable only by confirm_match(), which is security definer and runs
-- as the table owner.
-- ---------------------------------------------------------------------------
revoke update on public.profiles from authenticated;

grant update (full_name, bio, year, home_hall, availability, play_preference, avatar_path)
  on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Casual matches — logged and confirmed like any other, but no rating change.
-- ---------------------------------------------------------------------------
alter table public.matches
  add column if not exists is_ranked boolean not null default true;

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

  expected_winner := 1.0 / (1.0 + power(10.0, (rating_loser - rating_winner) / 400.0));
  delta := greatest(round(k * (1.0 - expected_winner))::integer, 1);
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

-- ---------------------------------------------------------------------------
-- casual_record — casual wins and losses, which aren't tracked on profiles.
-- ---------------------------------------------------------------------------
create or replace function public.casual_record(p_player uuid)
returns table (wins integer, losses integer)
language sql
security definer
stable
set search_path = public
as $$
  select
    count(*) filter (where m.winner = p_player)::integer,
    count(*) filter (where m.winner <> p_player)::integer
  from public.matches m
  where m.status = 'confirmed'
    and not m.is_ranked
    and p_player in (m.player_a, m.player_b);
$$;

grant execute on function public.casual_record(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Matchmaking also prefers to pair like with like: someone who's here for a
-- relaxed game shouldn't be handed to someone chasing a rating. Still only a
-- preference — a match beats no match.
-- ---------------------------------------------------------------------------
create or replace function public.find_match_in_hall(
  p_hall text,
  p_play_style text default 'long'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_hall text := nullif(trim(coalesce(p_hall, '')), '');
  v_style text := case when p_play_style = 'quick' then 'quick' else 'long' end;
  v_my_rating integer;
  v_my_pref text;
  v_opponent uuid;
  v_channel_id uuid;
begin
  if v_me is null then
    raise exception 'You must be signed in to find a match.';
  end if;
  if v_hall is null then
    raise exception 'Pick which hall you''re playing in first.';
  end if;

  select rating, play_preference into v_my_rating, v_my_pref
  from public.profiles where id = v_me;
  if v_my_rating is null then
    raise exception 'Your profile is not set up yet.';
  end if;

  -- Searching is the same thing as joining: get listed before looking, so two
  -- people searching the same hall at once can still see each other.
  insert into public.queue_entries (user_id, location, play_style, joined_at, expires_at)
  values (v_me, v_hall, v_style, now(), now() + interval '2 hours')
  on conflict (user_id) do update
    set location = excluded.location,
        play_style = excluded.play_style,
        joined_at = now(),
        expires_at = excluded.expires_at;

  select q.user_id into v_opponent
  from public.queue_entries q
  join public.profiles p on p.id = q.user_id
  where q.user_id <> v_me
    and q.expires_at > now()
    and q.location = v_hall
  order by
    -- 'both' sits happily with anyone; only casual-versus-competitive counts
    -- as a mismatch worth sorting down.
    (v_my_pref <> 'both' and p.play_preference <> 'both' and p.play_preference <> v_my_pref),
    (q.play_style <> v_style),
    abs(p.rating - v_my_rating),
    q.joined_at
  limit 1
  for update of q skip locked;

  if v_opponent is null then
    return null;
  end if;

  v_channel_id := public.open_match_channel(v_me, v_opponent);

  insert into public.challenges (challenger, opponent, status, channel_id, responded_at)
  values (v_me, v_opponent, 'accepted', v_channel_id, now());

  delete from public.queue_entries where user_id in (v_me, v_opponent);

  return v_channel_id;
end;
$$;

grant execute on function public.find_match_in_hall(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Profile pictures — a public "avatars" bucket.
--
-- Public means the image URLs need no signing, which is what lets an <img>
-- tag and Next's image optimiser load them directly. Paths are
-- <user-id>/<random>.<ext>, so a URL isn't guessable, but anyone holding one
-- can open it without signing in. That's the usual trade for avatars; if you
-- ever need them members-only, flip `public` to false and switch the app to
-- createSignedUrl().
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars', 'avatars', true, 2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = true,
      file_size_limit = 2097152,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- A player may only write inside a folder named after their own user id.
drop policy if exists "Avatars are readable by anyone" on storage.objects;
create policy "Avatars are readable by anyone"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "Players upload their own avatar" on storage.objects;
create policy "Players upload their own avatar"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Players replace their own avatar" on storage.objects;
create policy "Players replace their own avatar"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Players delete their own avatar" on storage.objects;
create policy "Players delete their own avatar"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
