-- NU Ping Pong — remember who has seen the walkthrough.
--
-- Additive on top of 0010. Safe to run on a database with real data.

-- Stored on the profile rather than in localStorage so it follows the player
-- to their phone: someone who signed up on a laptop shouldn't be walked
-- through the app again the first time they open it at the tables.
alter table public.profiles
  add column if not exists onboarded_at timestamptz;

-- Column-level UPDATE grants are additive, so this adds to the list from 0006
-- rather than replacing it. Without this the player can't mark it done —
-- see the note in 0005 about why profiles has per-column grants at all.
grant update (onboarded_at) on public.profiles to authenticated;

-- Everyone already using the app has effectively been onboarded; don't
-- ambush them with a walkthrough for features they've been using for weeks.
update public.profiles
  set onboarded_at = now()
  where onboarded_at is null;
