# NU Ping Pong

An ELO-style ranked ladder for Northeastern's ping pong club: log matches,
climb the ladder, find an opponent, and chat with them. Next.js (App Router)
+ Supabase.

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a new project (the
   free tier is plenty for a club).
2. In the SQL editor, run the migrations **in order**:
   - [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) —
     the `profiles` / `matches` / `rating_history` tables, the
     `@northeastern.edu` sign-up restriction, and the `confirm_match` /
     `decline_match` functions that update Elo ratings (K = 32).
   - [`supabase/migrations/0002_matchmaking_and_chat.sql`](supabase/migrations/0002_matchmaking_and_chat.sql) —
     the matchmaking queue, challenges, and chat channels.
   - [`supabase/migrations/0003_play_style_and_nav_summary.sql`](supabase/migrations/0003_play_style_and_nav_summary.sql) —
     quick/long play styles, and the `nav_summary()` function that collapses
     the nav's three queries into one.

   0002 and 0003 are additive: safe to run on a database that already has
   real players and matches in it.
3. In **Authentication → Providers**, enable **Email**. **Confirm email** can
   be on or off — the sign-up form handles both (with it on, players get a
   "check your email" message instead of being signed straight in).
4. In **Authentication → URL Configuration**, add your dev and production URLs
   (e.g. `http://localhost:3000/**`) to the redirect allow list.
5. Optional but recommended: **Database → Replication** → make sure the
   `supabase_realtime` publication includes `public.messages`. Migration 0002
   does this for you; the chat page falls back to a 10-second poll if realtime
   isn't available, so it works either way.

## 2. Configure the app

```bash
cp .env.local.example .env.local
```

Fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from
**Project Settings → API**.

## 3. Run it

```bash
npm install && npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and create an account with
any `@northeastern.edu` email and a password.

## How it works

- **Auth** — email + password (`app/login`), with separate *Sign in* and
  *Create account* modes. Restricted to `@northeastern.edu` by a Postgres
  trigger (`handle_new_user`) so even a direct API call can't create an
  account on another domain. New profiles start at a 1000 rating.
- **Reporting a match** (`app/log-match`) — either player can report a score.
  The match sits as `pending` until the *other* player confirms it from their
  profile page ("Awaiting Your Confirmation"). Ratings only change on
  confirmation, via the `confirm_match` Postgres function — this keeps the
  rating math atomic and stops a player from unilaterally rating themselves up.
- **Ratings** — standard Elo, K = 32, computed server-side in SQL. The number
  shown while filling out the log-match form (`lib/elo.ts`) is a preview only;
  the database function is the source of truth.
- **Tiers** (`lib/tiers.ts`) — Rookie Husky → Rally Regular → Spin Doctor →
  Smash Specialist → Paddle Master → Husky Grandmaster, a cosmetic label
  derived from rating.
- **Matchmaking** (`app/matchmaking`) — three ways to find someone:
  - *Quick play / Long play* (`find_match`) pairs you instantly with the
    closest-rated player waiting, preferring someone who wants the same kind
    of session — one match, or sticking around for a few. It's only a
    preference: being paired with anyone beats being paired with nobody.
  - *List yourself* (`join_queue`) puts you on the "at the tables now" list
    with a hall and your play style. Halls come from a dropdown built from
    [`lib/halls.ts`](lib/halls.ts) — edit that list to add or rename one —
    with a "Somewhere else…" option for spots that aren't on it. Entries
    expire after two hours so the list doesn't go stale; the app doesn't ask
    how long you'll be there, since that's easier to sort out in chat.
  - *Challenge* (`send_challenge`) invites a specific player. They accept or
    decline from their own matchmaking page. Mutual challenges auto-accept
    rather than leaving two mirrored invitations hanging.
- **Chat** (`app/chats`) — accepting a challenge or getting paired opens a
  two-person channel. Live via Supabase Realtime on `public.messages`, with a
  slow poll as a fallback. A new channel opens with a system message and a few
  icebreaker suggestions, since the point is helping people who don't know
  each other start talking. Unread counts come from `unread_summary()` and
  show in the nav.

### Keeping page loads fast

Every Supabase query is a network round trip, and they add up quickly when
they're serial. Two things keep the count down:

- `getCurrentUser()` in [`lib/auth.ts`](lib/auth.ts) is wrapped in React's
  `cache()`, so a page and the `<Nav />` it renders share one auth lookup
  instead of each doing their own. It uses `getClaims()` rather than
  `getUser()`: with asymmetric JWT signing keys the token is verified locally
  via WebCrypto and costs no round trip at all. **If your project still uses
  the legacy symmetric JWT secret, migrating to ECC keys in Project Settings →
  JWT Keys is the single biggest speed-up available** — it turns three
  auth round trips per navigation into zero.
- Page queries are issued with `Promise.all` rather than awaited one at a
  time, and the nav's data comes from a single `nav_summary()` call.

It's also worth checking that your Vercel region and Supabase region are on
the same coast. Every query pays that distance, several times per page.

### Security model

Every new table has row level security on. Channels, their rosters, and their
messages are readable only by members — enforced through the
`is_channel_member()` security-definer helper so the `channel_members` policy
doesn't recurse into itself. Challenges are visible only to the two players
involved. Creating channels, adding members, and answering challenges all go
through security-definer functions rather than direct table writes, so a
client can't add itself to someone else's conversation.

## Known simplifications

- No push/email notification when someone challenges you or sends a message —
  you find out from the badge in the nav next time you open the app.
- No admin/moderation tooling for disputed ("declined") matches or for
  reporting chat abuse; they just sit unresolved. Fine for a small club that
  can sort it out in person.
- Username is derived from the email prefix (`jdoe@northeastern.edu` → `jdoe`)
  and isn't editable in the UI yet. Display names come from the sign-up form
  and fall back to `@username` when unset.
- The queue is a flat list — no per-table or per-time-slot scheduling, and
  no way to say when you'll arrive (only that you're there now).
