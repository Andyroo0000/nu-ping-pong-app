-- NU Ping Pong — Web Push subscriptions.
--
-- One row per browser a player has turned notifications on in, so someone with
-- a phone and a laptop gets both. Additive on top of 0005.

create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- A player can only ever see or touch their own subscriptions. Nobody can read
-- anyone else's: an endpoint plus its keys is all that's needed to push to
-- that device, so these are credentials, not public data.
--
-- The server sends notifications with the service_role key, which bypasses RLS
-- — that key is server-only and must never reach the browser.
drop policy if exists "Players manage their own push subscriptions" on public.push_subscriptions;
create policy "Players manage their own push subscriptions"
  on public.push_subscriptions for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Per-player switches. Everything defaults on, but a subscription only exists
-- once someone has granted permission, so nothing is sent until they opt in.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists notify_challenges boolean not null default true,
  add column if not exists notify_messages boolean not null default true,
  add column if not exists notify_confirmations boolean not null default true;

-- These are player-editable, and column-level grants (see 0005) mean a new
-- column is not writable until it's added to this list.
grant update (
  full_name, bio, year, home_hall, availability, play_preference, avatar_path,
  notify_challenges, notify_messages, notify_confirmations
) on public.profiles to authenticated;
