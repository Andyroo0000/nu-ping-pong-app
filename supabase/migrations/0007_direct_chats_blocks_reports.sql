-- NU Ping Pong — say hello without a challenge, plus blocking and reporting.
--
-- Additive on top of 0006. Safe to run on a database with real data.

-- ---------------------------------------------------------------------------
-- blocks
--
-- Blocking is one-directional and private: the blocked player is never told,
-- and never sees a policy error. They simply stop being able to reach you.
-- ---------------------------------------------------------------------------
create table if not exists public.blocks (
  blocker uuid not null references public.profiles (id) on delete cascade,
  blocked uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  constraint no_self_block check (blocker <> blocked)
);

create index if not exists blocks_blocked_idx on public.blocks (blocked);

alter table public.blocks enable row level security;

-- You can see and manage the blocks you created. You cannot see who has
-- blocked you — that's the whole point.
drop policy if exists "Players manage their own blocks" on public.blocks;
create policy "Players manage their own blocks"
  on public.blocks for all
  to authenticated
  using (blocker = auth.uid())
  with check (blocker = auth.uid());

/**
 * True if either player has blocked the other. Security definer so it can see
 * blocks in both directions without exposing the rows themselves.
 */
create or replace function public.is_blocked_pair(p_a uuid, p_b uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.blocks
    where (blocker = p_a and blocked = p_b)
       or (blocker = p_b and blocked = p_a)
  );
$$;

grant execute on function public.is_blocked_pair(uuid, uuid) to authenticated;

/** Everyone the signed-in player can't interact with, in either direction. */
create or replace function public.blocked_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select blocked from public.blocks where blocker = auth.uid()
  union
  select blocker from public.blocks where blocked = auth.uid();
$$;

grant execute on function public.blocked_ids() to authenticated;

-- ---------------------------------------------------------------------------
-- reports — so there's a record to act on, rather than a DM to the organiser.
-- ---------------------------------------------------------------------------
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter uuid not null references public.profiles (id) on delete cascade,
  reported uuid not null references public.profiles (id) on delete cascade,
  reason text not null check (reason in ('harassment', 'spam', 'fake-results', 'photo', 'other')),
  detail text check (detail is null or char_length(detail) <= 1000),
  channel_id uuid references public.channels (id) on delete set null,
  status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  created_at timestamptz not null default now(),
  constraint no_self_report check (reporter <> reported)
);

create index if not exists reports_status_idx on public.reports (status, created_at desc);

alter table public.reports enable row level security;

-- A reporter can file a report and see their own. Nobody can read anyone
-- else's: reviewing happens in the Supabase dashboard, which uses the
-- service role and bypasses these policies.
drop policy if exists "Players file and read their own reports" on public.reports;
create policy "Players file and read their own reports"
  on public.reports for select
  to authenticated
  using (reporter = auth.uid());

drop policy if exists "Players can file a report" on public.reports;
create policy "Players can file a report"
  on public.reports for insert
  to authenticated
  with check (reporter = auth.uid());

-- ---------------------------------------------------------------------------
-- open_direct_channel — chat with someone without challenging them first.
--
-- Reuses the existing conversation if there is one, so saying hello twice
-- doesn't scatter history across two channels.
-- ---------------------------------------------------------------------------
create or replace function public.open_direct_channel(p_other uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_channel_id uuid;
begin
  if v_me is null then
    raise exception 'You must be signed in to start a chat.';
  end if;
  if p_other = v_me then
    raise exception 'You can''t message yourself.';
  end if;
  if not exists (select 1 from public.profiles where id = p_other) then
    raise exception 'That player no longer exists.';
  end if;
  if public.is_blocked_pair(v_me, p_other) then
    -- Deliberately vague: don't confirm to a blocked player that they were.
    raise exception 'You can''t start a chat with that player.';
  end if;

  -- An existing two-person channel containing exactly these two.
  select cm.channel_id into v_channel_id
  from public.channel_members cm
  join public.channel_members other
    on other.channel_id = cm.channel_id and other.user_id = p_other
  where cm.user_id = v_me
    and (select count(*) from public.channel_members x where x.channel_id = cm.channel_id) = 2
  limit 1;

  if v_channel_id is not null then
    return v_channel_id;
  end if;

  v_channel_id := public.open_direct_channel_create(v_me, p_other);
  return v_channel_id;
end;
$$;

grant execute on function public.open_direct_channel(uuid) to authenticated;

/**
 * Creates the channel for open_direct_channel. Separate from
 * open_match_channel because the opening system message shouldn't talk about
 * a match that nobody agreed to.
 */
create or replace function public.open_direct_channel_create(p_a uuid, p_b uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_channel_id uuid;
  name_a text;
  name_b text;
begin
  select coalesce(full_name, '@' || username) into name_a from public.profiles where id = p_a;
  select coalesce(full_name, '@' || username) into name_b from public.profiles where id = p_b;

  insert into public.channels (kind, title)
  values ('match', coalesce(name_a, 'Player') || ' & ' || coalesce(name_b, 'Player'))
  returning id into v_channel_id;

  insert into public.channel_members (channel_id, user_id)
  values (v_channel_id, p_a), (v_channel_id, p_b);

  insert into public.messages (channel_id, author_id, body, kind)
  values (
    v_channel_id,
    null,
    'Say hello. When you two play, one of you logs the score and the other confirms it.',
    'system'
  );

  return v_channel_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Blocking has to actually stop things, not just hide them.
-- ---------------------------------------------------------------------------

-- Messages: a blocked player's insert fails.
drop policy if exists "Members can post messages" on public.messages;
create policy "Members can post messages"
  on public.messages for insert
  to authenticated
  with check (
    author_id = auth.uid()
    and kind = 'user'
    and public.is_channel_member(channel_id)
    -- Nobody in this channel has blocked me, and I haven't blocked them.
    and not exists (
      select 1
      from public.channel_members cm
      where cm.channel_id = messages.channel_id
        and cm.user_id <> auth.uid()
        and public.is_blocked_pair(auth.uid(), cm.user_id)
    )
  );

create or replace function public.send_challenge(p_opponent uuid, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_existing public.challenges;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to send a challenge.';
  end if;
  if p_opponent = auth.uid() then
    raise exception 'You can''t challenge yourself.';
  end if;
  if not exists (select 1 from public.profiles where id = p_opponent) then
    raise exception 'That player no longer exists.';
  end if;
  if public.is_blocked_pair(auth.uid(), p_opponent) then
    raise exception 'You can''t challenge that player.';
  end if;

  select * into v_existing
  from public.challenges
  where challenger = p_opponent and opponent = auth.uid() and status = 'pending'
  limit 1;

  if found then
    return public.respond_challenge(v_existing.id, true);
  end if;

  insert into public.challenges (challenger, opponent, note)
  values (auth.uid(), p_opponent, nullif(trim(coalesce(p_note, '')), ''))
  on conflict (challenger, opponent) where status = 'pending'
  do update set note = excluded.note, created_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.send_challenge(uuid, text) to authenticated;

-- Matchmaking skips anyone either side has blocked.
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
    and not public.is_blocked_pair(v_me, q.user_id)
  order by
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
  if public.is_blocked_pair(v_me, p_opponent) then
    raise exception 'You can''t pair with that player.';
  end if;

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

-- Blocked players drop out of the "playing elsewhere" list too.
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
    and not public.is_blocked_pair(auth.uid(), q.user_id)
  order by abs(p.rating - coalesce(
    (select rating from public.profiles where id = auth.uid()), 1000
  )), q.joined_at
  limit 25;
$$;

grant execute on function public.queue_elsewhere(text) to authenticated;
