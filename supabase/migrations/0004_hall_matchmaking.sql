-- NU Ping Pong — hall-first matchmaking.
--
-- Looking for a match now means: say which hall you're in, get listed there,
-- and get paired with someone else in that same hall. If nobody's there, you
-- stay listed and the app shows who's playing in other halls so you can go
-- join them.
--
-- Additive on top of 0003. Safe to run on a database with real data.

-- ---------------------------------------------------------------------------
-- find_match_in_hall — list me in this hall, then try to pair me with someone
-- already waiting there. Returns the new channel id, or null if I'm now
-- waiting alone (in which case my queue entry stays put so others find me).
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
  v_opponent uuid;
  v_channel_id uuid;
begin
  if v_me is null then
    raise exception 'You must be signed in to find a match.';
  end if;
  if v_hall is null then
    raise exception 'Pick which hall you''re playing in first.';
  end if;

  select rating into v_my_rating from public.profiles where id = v_me;
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

  -- Same hall only. Prefer someone who wants the same kind of session, then
  -- the closest rating, then whoever has been waiting longest.
  select q.user_id into v_opponent
  from public.queue_entries q
  join public.profiles p on p.id = q.user_id
  where q.user_id <> v_me
    and q.expires_at > now()
    and q.location = v_hall
  order by
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
-- pair_with_player — "someone's playing over at Mary Morse, join them".
-- They're already waiting, so this pairs immediately rather than sending a
-- challenge they'd have to accept.
-- ---------------------------------------------------------------------------
create or replace function public.pair_with_player(p_opponent uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_channel_id uuid;
  v_waiting boolean;
begin
  if v_me is null then
    raise exception 'You must be signed in to do that.';
  end if;
  if p_opponent = v_me then
    raise exception 'You can''t pair with yourself.';
  end if;

  -- Lock their queue row so two people can't both claim the same player.
  select true into v_waiting
  from public.queue_entries
  where user_id = p_opponent and expires_at > now()
  for update skip locked;

  if not coalesce(v_waiting, false) then
    raise exception 'They just got picked up by someone else — try another player.';
  end if;

  v_channel_id := public.open_match_channel(v_me, p_opponent);

  insert into public.challenges (challenger, opponent, status, channel_id, responded_at)
  values (v_me, p_opponent, 'accepted', v_channel_id, now());

  delete from public.queue_entries where user_id in (v_me, p_opponent);

  return v_channel_id;
end;
$$;

grant execute on function public.pair_with_player(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- active_queue — queue entries that haven't expired, so the app doesn't have
-- to send its own idea of "now" with every query. security_invoker keeps the
-- underlying table's row level security applying as the querying player.
-- ---------------------------------------------------------------------------
create or replace view public.active_queue
with (security_invoker = true) as
  select user_id, location, note, play_style, joined_at, expires_at
  from public.queue_entries
  where expires_at > now();

grant select on public.active_queue to authenticated;

-- ---------------------------------------------------------------------------
-- queue_elsewhere — who's waiting in a hall other than mine, with their
-- profile, ordered by how close their rating is to mine. One call instead of
-- a query plus a client-side join.
-- ---------------------------------------------------------------------------
create or replace function public.queue_elsewhere(p_hall text default null)
returns table (
  user_id uuid,
  username text,
  full_name text,
  rating integer,
  location text,
  note text,
  play_style text,
  joined_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select q.user_id, p.username, p.full_name, p.rating,
         q.location, q.note, q.play_style, q.joined_at
  from public.queue_entries q
  join public.profiles p on p.id = q.user_id
  where q.user_id <> auth.uid()
    and q.expires_at > now()
    and (p_hall is null or q.location is distinct from p_hall)
  order by abs(p.rating - coalesce(
    (select rating from public.profiles where id = auth.uid()), 1000
  )), q.joined_at
  limit 25;
$$;

grant execute on function public.queue_elsewhere(text) to authenticated;

-- Matching is now hall-scoped, so the location column is worth indexing.
create index if not exists queue_entries_location_idx
  on public.queue_entries (location) where location is not null;
