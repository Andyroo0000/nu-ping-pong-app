# NU Ping Pong

An ELO-style ranked ladder for Northeastern's ping pong club: log matches,
climb the ladder, find your next opponent. Next.js (App Router) + Supabase.

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a new project (the
   free tier is plenty for a club).
2. In the SQL editor, run the migration at
   [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql).
   It creates the `profiles` / `matches` / `rating_history` tables, restricts
   sign-ups to `@northeastern.edu` addresses, and adds the `confirm_match` /
   `decline_match` functions that update Elo ratings (K = 32).
3. In **Authentication → Providers**, make sure **Email** is enabled and
   **Confirm email** is off (magic-link sign-in doesn't need it) — or leave it
   on if you'd rather players confirm their address first.
4. In **Authentication → URL Configuration**, add your dev and production
   URLs (e.g. `http://localhost:3000/**`) to the redirect allow list.

## 2. Configure the app

```bash
cp .env.local.example .env.local
```

Fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from
**Project Settings → API**.

## 3. Run it

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sign in with any
`@northeastern.edu` email — Supabase sends a magic link instead of a password.

## How it works

- **Auth** — magic-link sign-in (`app/login`), gated to `@northeastern.edu` by
  a Postgres trigger (`handle_new_user`) so even a direct API call can't
  create an account with another domain. A new user's profile starts at a
  1000 rating.
- **Reporting a match** (`app/log-match`) — either player can report a score.
  The match sits as `pending` until the *other* player confirms it from their
  profile page ("Awaiting Your Confirmation"). Ratings only change on
  confirmation, via the `confirm_match` Postgres function — this keeps the
  rating math atomic and stops a player from unilaterally rating themselves up.
- **Ratings** — standard Elo, K = 32, computed server-side in SQL. The number
  a player sees while filling out the log-match form (`lib/elo.ts`) is a
  preview only; the database function is the source of truth.
- **Tiers** (`lib/tiers.ts`) — Rookie Husky → Rally Regular → Spin Doctor →
  Smash Specialist → Paddle Master → Husky Grandmaster, purely a cosmetic
  label derived from rating.
- **Matchmaking** (`app/matchmaking`) — suggests opponents within ±150 rating
  points, closest first. There's no live "who's at the tables right now"
  presence indicator (that needs realtime infra); Challenge just deep-links
  into the log-match form with the opponent preselected.

## Known simplifications (v1)

- No push/email notification when someone reports a match against you — you
  find out by opening your profile.
- No admin/moderation tooling for disputed ("declined") matches; they just
  sit unresolved. Fine for a small club that can sort it out in person or in
  chat.
- Username is derived from the email prefix (`jdoe@northeastern.edu` →
  `jdoe`) and isn't editable in the UI yet.
