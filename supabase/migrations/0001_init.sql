-- NU Ping Pong — initial schema
-- Run this in the Supabase SQL editor (or `supabase db push`) on a fresh project.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique not null,
  full_name text not null,
  rating integer not null default 1000,
  wins integer not null default 0,
  losses integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Profiles are viewable by club members"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- matches
-- games is an array like [{"a":11,"b":7},{"a":9,"b":11},{"a":11,"b":6}]
-- a/b scores refer to player_a / player_b respectively.
-- ---------------------------------------------------------------------------
create table public.matches (
  id uuid primary key default gen_random_uuid(),
  player_a uuid not null references public.profiles (id),
  player_b uuid not null references public.profiles (id),
  games jsonb not null,
  games_won_a integer not null,
  games_won_b integer not null,
  winner uuid not null references public.profiles (id),
  reported_by uuid not null references public.profiles (id),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'declined')),
  rating_delta integer,
  played_at timestamptz not null default now(),
  confirmed_at timestamptz,
  constraint different_players check (player_a <> player_b),
  constraint winner_is_a_participant check (winner = player_a or winner = player_b),
  constraint reporter_is_a_participant check (reported_by = player_a or reported_by = player_b)
);

alter table public.matches enable row level security;

create policy "Matches are viewable by club members"
  on public.matches for select
  to authenticated
  using (true);

create policy "A player can report a match they took part in"
  on public.matches for insert
  to authenticated
  with check (
    auth.uid() = reported_by
    and auth.uid() in (player_a, player_b)
  );

-- No update policy: confirming/declining a match only happens through the
-- security-definer functions below, which check who is allowed to act.

-- ---------------------------------------------------------------------------
-- rating_history — one row per player per confirmed match, for the profile chart
-- ---------------------------------------------------------------------------
create table public.rating_history (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.profiles (id),
  match_id uuid references public.matches (id),
  rating integer not null,
  created_at timestamptz not null default now()
);

alter table public.rating_history enable row level security;

create policy "Rating history is viewable by club members"
  on public.rating_history for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- New signups: restrict to @northeastern.edu and create a profile row
-- ---------------------------------------------------------------------------
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email !~* '@northeastern\.edu$' then
    raise exception 'Only @northeastern.edu email addresses may join NU Ping Pong.';
  end if;

  insert into public.profiles (id, username, full_name, rating)
  values (
    new.id,
    split_part(new.email, '@', 1),
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    1000
  );

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- confirm_match — opponent confirms a reported result; ratings update here.
-- Standard Elo, K = 32.
-- ---------------------------------------------------------------------------
create function public.confirm_match(p_match_id uuid)
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
  delta := round(k * (1.0 - expected_winner));
  if delta < 1 then
    delta := 1;
  end if;

  update public.profiles set rating = rating + delta, wins = wins + 1 where id = m.winner;
  update public.profiles set rating = greatest(rating - delta, 100), losses = losses + 1 where id = loser;

  update public.matches
    set status = 'confirmed', confirmed_at = now(), rating_delta = delta
    where id = p_match_id;

  insert into public.rating_history (player_id, match_id, rating)
  select id, p_match_id, rating from public.profiles where id in (m.player_a, m.player_b);
end;
$$;

grant execute on function public.confirm_match(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- decline_match — opponent disputes a reported result; no rating change.
-- ---------------------------------------------------------------------------
create function public.decline_match(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.matches;
begin
  select * into m from public.matches where id = p_match_id for update;

  if not found then
    raise exception 'Match not found';
  end if;
  if m.status <> 'pending' then
    raise exception 'Match already resolved';
  end if;
  if auth.uid() <> m.player_b then
    raise exception 'Only the reported opponent can decline this match';
  end if;

  update public.matches set status = 'declined' where id = p_match_id;
end;
$$;

grant execute on function public.decline_match(uuid) to authenticated;
