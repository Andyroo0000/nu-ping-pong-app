-- NU Ping Pong — matchmaking queue, challenges, and chat channels.
-- Additive on top of 0001_init.sql. Safe to run on a database that already
-- has 0001 applied (nothing here drops or rewrites existing data).

-- ---------------------------------------------------------------------------
-- channels — one text channel per accepted challenge / instant pairing.
-- ---------------------------------------------------------------------------
create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'match' check (kind in ('match', 'club')),
  title text,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create table if not exists public.channel_members (
  channel_id uuid not null references public.channels (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default 'epoch',
  primary key (channel_id, user_id)
);

create index if not exists channel_members_user_idx on public.channel_members (user_id);

create table if not exists public.messages (
  id bigint generated always as identity primary key,
  channel_id uuid not null references public.channels (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  body text not null check (char_length(body) between 1 and 2000),
  kind text not null default 'user' check (kind in ('user', 'system')),
  created_at timestamptz not null default now()
);

create index if not exists messages_channel_idx on public.messages (channel_id, created_at desc);

-- ---------------------------------------------------------------------------
-- challenges — "want to play?" invitations between two players.
-- ---------------------------------------------------------------------------
create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  challenger uuid not null references public.profiles (id) on delete cascade,
  opponent uuid not null references public.profiles (id) on delete cascade,
  note text,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  channel_id uuid references public.channels (id) on delete set null,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint challenge_different_players check (challenger <> opponent)
);

create index if not exists challenges_opponent_idx on public.challenges (opponent, status);
create index if not exists challenges_challenger_idx on public.challenges (challenger, status);

-- Only one open challenge per direction at a time.
create unique index if not exists challenges_one_open_per_pair
  on public.challenges (challenger, opponent)
  where status = 'pending';

-- ---------------------------------------------------------------------------
-- queue_entries — "I'm at the tables right now, pair me with someone."
-- ---------------------------------------------------------------------------
create table if not exists public.queue_entries (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  location text,
  note text,
  joined_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '2 hours'
);

create index if not exists queue_entries_expires_idx on public.queue_entries (expires_at);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.channels enable row level security;
alter table public.channel_members enable row level security;
alter table public.messages enable row level security;
alter table public.challenges enable row level security;
alter table public.queue_entries enable row level security;

-- Membership check lives in a security-definer function so that the
-- channel_members select policy doesn't recurse into itself.
create or replace function public.is_channel_member(p_channel_id uuid, p_user uuid default auth.uid())
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.channel_members
    where channel_id = p_channel_id and user_id = p_user
  );
$$;

grant execute on function public.is_channel_member(uuid, uuid) to authenticated;

drop policy if exists "Members can read their channels" on public.channels;
create policy "Members can read their channels"
  on public.channels for select
  to authenticated
  using (public.is_channel_member(id));

drop policy if exists "Members can read the roster" on public.channel_members;
create policy "Members can read the roster"
  on public.channel_members for select
  to authenticated
  using (public.is_channel_member(channel_id));

drop policy if exists "Members can update their own read marker" on public.channel_members;
create policy "Members can update their own read marker"
  on public.channel_members for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Members can leave a channel" on public.channel_members;
create policy "Members can leave a channel"
  on public.channel_members for delete
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Members can read messages" on public.messages;
create policy "Members can read messages"
  on public.messages for select
  to authenticated
  using (public.is_channel_member(channel_id));

drop policy if exists "Members can post messages" on public.messages;
create policy "Members can post messages"
  on public.messages for insert
  to authenticated
  with check (
    author_id = auth.uid()
    and kind = 'user'
    and public.is_channel_member(channel_id)
  );

-- Challenges are visible to the two people involved, nobody else.
drop policy if exists "Players can read their own challenges" on public.challenges;
create policy "Players can read their own challenges"
  on public.challenges for select
  to authenticated
  using (auth.uid() in (challenger, opponent));

-- Creating / responding happens through the security-definer functions below,
-- except cancelling, which the challenger may do directly.
drop policy if exists "Challengers can cancel their own challenge" on public.challenges;
create policy "Challengers can cancel their own challenge"
  on public.challenges for update
  to authenticated
  using (auth.uid() = challenger and status = 'pending')
  with check (auth.uid() = challenger and status = 'cancelled');

-- The queue is public to club members: seeing who is around is the point.
drop policy if exists "Club members can see the queue" on public.queue_entries;
create policy "Club members can see the queue"
  on public.queue_entries for select
  to authenticated
  using (true);

drop policy if exists "Players manage their own queue entry" on public.queue_entries;
create policy "Players manage their own queue entry"
  on public.queue_entries for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Keep channels.last_message_at fresh so the chat list can sort by activity.
-- ---------------------------------------------------------------------------
create or replace function public.bump_channel_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.channels
    set last_message_at = new.created_at
    where id = new.channel_id;
  return new;
end;
$$;

drop trigger if exists on_message_created on public.messages;
create trigger on_message_created
  after insert on public.messages
  for each row execute function public.bump_channel_activity();

-- ---------------------------------------------------------------------------
-- open_match_channel — internal helper: create a 2-person channel with a
-- system message to break the ice.
-- ---------------------------------------------------------------------------
create or replace function public.open_match_channel(p_a uuid, p_b uuid)
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
  select full_name into name_a from public.profiles where id = p_a;
  select full_name into name_b from public.profiles where id = p_b;

  insert into public.channels (kind, title)
  values ('match', coalesce(name_a, 'Player') || ' & ' || coalesce(name_b, 'Player'))
  returning id into v_channel_id;

  insert into public.channel_members (channel_id, user_id)
  values (v_channel_id, p_a), (v_channel_id, p_b);

  insert into public.messages (channel_id, author_id, body, kind)
  values (
    v_channel_id,
    null,
    'You two are matched! Sort out a time and a table here. '
      || 'When you''re done playing, one of you logs the score and the other confirms it.',
    'system'
  );

  return v_channel_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- send_challenge — invite a specific player.
-- ---------------------------------------------------------------------------
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

  -- If they already challenged you, treat this as accepting instead of
  -- leaving two mirrored invitations hanging around.
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

-- ---------------------------------------------------------------------------
-- respond_challenge — accept (opens a chat channel) or decline.
-- Returns the challenge id.
-- ---------------------------------------------------------------------------
create or replace function public.respond_challenge(p_challenge_id uuid, p_accept boolean)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.challenges;
  v_channel_id uuid;
begin
  select * into c from public.challenges where id = p_challenge_id for update;

  if not found then
    raise exception 'Challenge not found.';
  end if;
  if c.opponent <> auth.uid() then
    raise exception 'Only the challenged player can respond to this.';
  end if;
  if c.status <> 'pending' then
    raise exception 'This challenge has already been answered.';
  end if;

  if not p_accept then
    update public.challenges
      set status = 'declined', responded_at = now()
      where id = c.id;
    return c.id;
  end if;

  v_channel_id := public.open_match_channel(c.challenger, c.opponent);

  update public.challenges
    set status = 'accepted', responded_at = now(), channel_id = v_channel_id
    where id = c.id;

  -- Both players are now busy with each other; take them out of the queue.
  delete from public.queue_entries where user_id in (c.challenger, c.opponent);

  return c.id;
end;
$$;

grant execute on function public.respond_challenge(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- join_queue / leave_queue
-- ---------------------------------------------------------------------------
create or replace function public.join_queue(
  p_location text default null,
  p_note text default null,
  p_minutes integer default 90
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to join the queue.';
  end if;

  insert into public.queue_entries (user_id, location, note, joined_at, expires_at)
  values (
    auth.uid(),
    nullif(trim(coalesce(p_location, '')), ''),
    nullif(trim(coalesce(p_note, '')), ''),
    now(),
    now() + (least(greatest(coalesce(p_minutes, 90), 15), 480) || ' minutes')::interval
  )
  on conflict (user_id) do update
    set location = excluded.location,
        note = excluded.note,
        joined_at = now(),
        expires_at = excluded.expires_at;
end;
$$;

grant execute on function public.join_queue(text, text, integer) to authenticated;

create or replace function public.leave_queue()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.queue_entries where user_id = auth.uid();
$$;

grant execute on function public.leave_queue() to authenticated;

-- ---------------------------------------------------------------------------
-- find_match — pair me right now with the closest-rated player in the queue.
-- Returns the new channel id, or null if nobody is waiting.
-- ---------------------------------------------------------------------------
create or replace function public.find_match()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_my_rating integer;
  v_opponent uuid;
  v_channel_id uuid;
begin
  if v_me is null then
    raise exception 'You must be signed in to find a match.';
  end if;

  select rating into v_my_rating from public.profiles where id = v_me;
  if v_my_rating is null then
    raise exception 'Your profile is not set up yet.';
  end if;

  -- Lock the queue rows we're about to consume so two people pressing the
  -- button at the same moment can't both grab the same opponent.
  select q.user_id into v_opponent
  from public.queue_entries q
  join public.profiles p on p.id = q.user_id
  where q.user_id <> v_me
    and q.expires_at > now()
  order by abs(p.rating - v_my_rating), q.joined_at
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

grant execute on function public.find_match() to authenticated;

-- ---------------------------------------------------------------------------
-- mark_channel_read — used by the chat page to clear the unread badge.
-- ---------------------------------------------------------------------------
create or replace function public.mark_channel_read(p_channel_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.channel_members
    set last_read_at = now()
    where channel_id = p_channel_id and user_id = auth.uid();
$$;

grant execute on function public.mark_channel_read(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- unread_summary — one row per channel with the unread count, for the nav
-- badge and the chat list.
-- ---------------------------------------------------------------------------
create or replace function public.unread_summary()
returns table (channel_id uuid, unread integer)
language sql
security definer
stable
set search_path = public
as $$
  select cm.channel_id,
         (
           select count(*)::integer
           from public.messages m
           where m.channel_id = cm.channel_id
             and m.created_at > cm.last_read_at
             and coalesce(m.author_id, '00000000-0000-0000-0000-000000000000'::uuid) <> cm.user_id
         )
  from public.channel_members cm
  where cm.user_id = auth.uid();
$$;

grant execute on function public.unread_summary() to authenticated;

-- ---------------------------------------------------------------------------
-- Fixes to 0001 behaviour
-- ---------------------------------------------------------------------------

-- Seed rating_history at signup so the profile chart has a starting point
-- instead of staying empty until the second confirmed match. Also keeps the
-- @northeastern.edu restriction and the full_name from signup metadata.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
  v_suffix integer := 0;
begin
  if new.email !~* '@northeastern\.edu$' then
    raise exception 'Only @northeastern.edu email addresses may join NU Ping Pong.';
  end if;

  v_username := lower(split_part(new.email, '@', 1));
  while exists (select 1 from public.profiles where username = v_username) loop
    v_suffix := v_suffix + 1;
    v_username := lower(split_part(new.email, '@', 1)) || v_suffix::text;
  end loop;

  insert into public.profiles (id, username, full_name, rating)
  values (
    new.id,
    v_username,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
    1000
  );

  insert into public.rating_history (player_id, match_id, rating)
  values (new.id, null, 1000);

  return new;
end;
$$;

-- full_name is optional now (it falls back to the username in the UI), and a
-- profile row must be able to exist before the player fills in their name.
alter table public.profiles alter column full_name drop not null;

-- Elo: 0001 gave the winner the full delta even when the loser was clamped at
-- the rating floor, which quietly minted rating points. Apply the same amount
-- to both sides.
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
-- Realtime — the chat page subscribes to new rows in public.messages.
-- ---------------------------------------------------------------------------
-- The chat page also polls every 10 seconds, so it still works if this block
-- is skipped because the project has no supabase_realtime publication.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'No supabase_realtime publication — skipping realtime setup.';
    return;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'challenges'
  ) then
    alter publication supabase_realtime add table public.challenges;
  end if;
end;
$$;
