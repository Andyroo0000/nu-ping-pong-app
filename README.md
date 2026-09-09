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
   - [`supabase/migrations/0004_hall_matchmaking.sql`](supabase/migrations/0004_hall_matchmaking.sql) —
     hall-scoped matching, joining a player who's waiting elsewhere, and the
     `active_queue` view.
   - [`supabase/migrations/0005_profiles_and_casual_play.sql`](supabase/migrations/0005_profiles_and_casual_play.sql) —
     profile pictures, bios, casual matches, and a **security fix**: see
     [Security model](#security-model).
   - [`supabase/migrations/0006_push_subscriptions.sql`](supabase/migrations/0006_push_subscriptions.sql) —
     push notification subscriptions and per-player toggles.
   - [`supabase/migrations/0007_direct_chats_blocks_reports.sql`](supabase/migrations/0007_direct_chats_blocks_reports.sql) —
     chatting without a challenge, blocking, and reporting.

   0002 through 0007 are additive: safe to run on a database that already has
   real players and matches in it. 0005 also creates the `avatars` storage
   bucket, so no manual setup is needed in the Storage dashboard.
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

For notifications you also need three more, all free:

```bash
npx web-push generate-vapid-keys
```

Put the pair in `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`, set
`VAPID_SUBJECT` to `mailto:` your email, and copy the **service_role** key from
Project Settings → API into `SUPABASE_SERVICE_ROLE_KEY`.

Add all four to Vercel under Settings → Environment Variables too, or
notifications will work locally and silently do nothing in production.

> `SUPABASE_SERVICE_ROLE_KEY` bypasses row level security on every table.
> It is server-only — never prefix it with `NEXT_PUBLIC_`, never import
> [`lib/supabase/admin.ts`](lib/supabase/admin.ts) from a Client Component.
> That file starts with `import "server-only"` so the build fails if you do.

With any of these missing, the app runs exactly as before with notifications
switched off, rather than erroring.

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
- **Home** (`app/home`) — the signed-in front door. Your tier progress, a
  "Needs you" block for challenges to answer and results to confirm, who's at
  the tables right now, the top of the ladder and where you sit. Ordered by
  urgency: anything waiting on you comes before anything else.
- **The Club** (`app/members`) — the directory. Filter by casual/competitive,
  hall, when they usually play, and year, or search by name. Completed profiles
  sort above blank ones, since a card with a photo and a line about someone is
  the entire point. It shares a toggle with the leaderboard
  ([`components/PeopleTabs.tsx`](components/PeopleTabs.tsx)): same people, two
  orderings — the ladder for who's winning, the directory for finding a person
  to play. A ladder sorted by rating is a hostile front door for a beginner;
  this is the friendly one.
- **Profiles** (`app/profile/edit`) — a photo, a short bio, year, home hall,
  when you usually play, and whether you're here for casual or competitive
  games. Photos go straight from the browser to Supabase Storage after being
  cropped square and shrunk to 512px on the device
  ([`lib/resize-image.ts`](lib/resize-image.ts)), so a 5MB phone photo lands as
  a ~40KB WebP and never crosses the server. Players without a photo or bio get
  a nudge on the matchmaking page.
- **Casual vs ranked** — when logging a match you pick *Ranked* (counts toward
  Elo) or *Casual* (doesn't). Both need the opponent's confirmation and both
  show on your profile; casual games are tallied separately by
  `casual_record()` and don't touch rating, win/loss, or your streak.
  Matchmaking prefers to pair like with like, so someone here to rally isn't
  handed to someone chasing a rating.
- **Ratings** — Elo computed server-side in SQL, base K = 32. Standard Elo
  already scales by the rating gap: at 1200 you gain +3 for beating an 800 and
  +29 for beating a 1600, and losses mirror it. On top of that, two multipliers
  weight *how* you won:

  | | |
  | --- | --- |
  | evidence | race to 1 game `0.60` · to 2 (best of 3) `1.00` · to 3+ `1.20` |
  | margin | won by 1 game `1.00` · by 2 `1.15` · by 3+ `1.30` |

  At equal ratings that runs from +10 for a single game to +25 for a 3-0 in a
  best-of-five, against a flat +16 before. **Evidence keys off the winner's
  game count, not the total played** — using the total made a 3-1 outrank a 3-0
  sweep, which is backwards. The winner's tally names the format.

  Match formats are one game, best of three, or best of five. The number shown
  while filling out the log-match form (`lib/elo.ts`) is a preview only; the
  database function is the source of truth, and the two must be kept in step.
- **Tiers** (`lib/tiers.ts`) — Rookie Husky → Rally Regular → Spin Doctor →
  Smash Specialist → Paddle Master → Husky Grandmaster, a cosmetic label
  derived from rating.
- **Matchmaking** (`app/matchmaking`) — one **Matchmaking** button that asks
  two questions: which hall you're in, and Quick play (one match) or Long play
  (sticking around). Then `find_match_in_hall`:
  - Lists you in that hall first, so two people searching at the same moment
    can still find each other.
  - Pairs you with someone already waiting **in that same hall**, preferring
    the same play style, then the closest rating, then whoever's waited
    longest. On a match you both land straight in a chat.
  - If that hall is empty you stay listed — anyone who searches it in the next
    two hours gets paired with you — and the page shows who's playing in
    *other* halls with a **Join** button (`pair_with_player`) so you can walk
    over to them.

  Halls come from [`lib/halls.ts`](lib/halls.ts) — edit that one list to add or
  rename a hall — with a "Somewhere else…" option that reveals a text box. The
  app doesn't ask how long you'll be around; that's easier to sort out in chat.
- **Challenges** (`send_challenge`) invite a specific player instead. They
  accept or decline from their own matchmaking page, and mutual challenges
  auto-accept rather than leaving two mirrored invitations hanging.
- **Who's online** ([`components/PresenceProvider.tsx`](components/PresenceProvider.tsx))
  — a green dot on anyone with the app open, plus a count in the nav. Built on
  Supabase Realtime Presence, so it costs **no database reads or writes and no
  polling**: everyone joins one shared channel and the Realtime server
  broadcasts the roster when it changes. Close the tab and the dot goes out a
  moment later, with nothing to clean up. The trade is that presence is
  in-memory only, so it can't answer "when were they last here" — that would
  need a `last_seen_at` column and a heartbeat.
- **Chat** (`app/chats`) — accepting a challenge or getting paired opens a
  two-person channel. Live via Supabase Realtime on `public.messages`, with a
  slow poll as a fallback. A new channel opens with a system message and a few
  icebreaker suggestions, since the point is helping people who don't know
  each other start talking. Unread counts come from `unread_summary()` and
  show in the nav.

### Look and feel

Northeastern red (`#c8102e`) carries the brand and everything else stays
quiet, so red means something when it appears: primary actions, the top two
tiers, live indicators, unread badges, and the mark. Neutral surfaces sit a
hair off pure grey, warmed toward the red hue — subtle enough that nobody
notices, but it stops the palette reading as the default grey-on-grey it
started as. White on red and red on white are both 5.9:1, clearing WCAG AA
for body text.

Tokens live in [`app/globals.css`](app/globals.css); use the Tailwind colours
rather than hardcoding hexes.

**Red is two tokens on purpose, and mixing them up is the easy mistake:**

| Token | Use for | Why |
| --- | --- | --- |
| `bg-nu` | Fills — buttons, badges | White text sits on it, so it has to stay dark. 5.9:1 in both themes. |
| `text-nu-accent` | Red *type* and icons | On a dark background `#c8102e` only manages 3.1:1, so dark mode lightens this one to clear AA while the fill stays put. |

**Dark mode** is a single `.dark` block. An inline script in the layout resolves
"system" against `prefers-color-scheme` and puts an explicit `dark` or `light`
class on `<html>` *before first paint* — without it, dark-mode visitors get a
white flash on every cold load, since the server can't know their preference.
Because the class is always explicit, Tailwind's `dark:` variant keys off it
(`@custom-variant` at the top of the stylesheet) and `ThemeToggle` needs no
React state at all: it reads the class on click, and both icons are swapped in
CSS. All six tier colours have dark variants — tier 6 inverts from near-black
to near-white, still the rarest-looking of the six.

**The mark** ([`components/NMark.tsx`](components/NMark.tsx)) is a slab N with a
paddle behind it and the ball resting in the N's upper notch. It has to read as
an "N" at 20px, so the paddle is a soft white wash that only becomes obvious at
larger sizes, and the ball has a red ring knocked out around it — without that
gap the white ball merges into the white letter and stops reading as a ball.
Regenerate the PWA icons from it if you change it; the generator inlines the
same paths with literal colours, since an icon file can't resolve CSS
variables.

**The landing hero** ([`components/HeroScene.tsx`](components/HeroScene.tsx)) is
the one screen allowed to be atmospheric: a table receding into the dark, a
paddle mid-swing on the back wall, a net in perspective and a ball in play. All
CSS and inline SVG — no images, no canvas, no animation library — so it still
ships inside the static shell. It's always dark regardless of theme, because a
light version looked like an empty page with a table drawn on it.

In-app pages carry the same motif inward without becoming a spectacle. Each
one opens with [`PageHeader`](components/PageHeader.tsx): a shallow dark banner
holding the title, one line of context and optionally a stat or a tab pair,
with the table edge in perspective along its bottom and the net band on the
very edge. It stays dark in both themes so the app reads as one place. The
content below stays light and quiet — that split is what keeps a leaderboard
readable while giving the page an identity.

Cards use the `.panel` class rather than a flat `bg-surface` box: a whisper of
gradient and a real shadow. A hairline border on flat white is most of what
made these screens look unfinished.

[`BackdropArt`](components/BackdropArt.tsx) puts a paddle faintly behind page
content. **It needs `isolate` on the page container** — a `z-index: -1` child
paints *behind* its parent's own background unless that parent is a stacking
context, so without it the backdrop is invisible.

**Background art is a paddle, not a husky, and that's deliberate.** Several
attempts at a husky silhouette read as a cat, then a shield badge, then a pair
of horns — at the opacities background art runs at (3–9%) an animal head is
ambiguous, while a paddle reads from its outline alone. It's also the right
motif for a ping pong club, and it avoids Northeastern's athletics husky, which
recognised student organisations are explicitly **not** permitted to use (see
[CSI's marketing policy](https://csi.studentlife.northeastern.edu/marketing-publications-policies/)).
If the club is ever recognised as a *club sport*, Athletics Marketing can create
an official lockup — that's the only legitimate route to the real mark.

Two traps in [`PaddleArt`](components/PaddleArt.tsx), both learned the hard
way: a ring inside the face turns the whole thing into a magnifying glass, and
the handle has to be long and narrow or it reads as a frying pan. The handle's
proportions are what say "paddle".

**Rank badges** ([`components/TierBadge.tsx`](components/TierBadge.tsx)) give
each of the six tiers its own accent, a paddle in that colour, and one pip per
level, so tiers are told apart at a glance and climbing one looks like
something. The ramp runs grey → bronze → steel → gold → **NU red** → black;
the jump to red at Paddle Master is the point, since the top two tiers wear the
school colour. `TierBadge` takes `sm`/`md`/`lg` and a `short` flag for tight
rows, `TierProgress` adds a meter toward the next tier, and `TierDot` is
icon-only. Tier names, ranges, colours and blurbs are all in
[`lib/tiers.ts`](lib/tiers.ts).

The paddle in [`components/PaddleIcon.tsx`](components/PaddleIcon.tsx) is drawn
bold and simple because it mostly renders at 11–16px, where thin strokes turn
to mush; the ball only appears at 18px and up, below which it's a sub-pixel dot
that muddies the silhouette. `NetRule` is the dashed table centre-line used to
divide sections.

**On trademarks:** the husky mark and the paddle are original drawings, not
reproductions of Northeastern's trademarked athletics logo or of Paws, and the
app describes itself as an independent student organisation in the footer. If
the club ever becomes officially affiliated, that's the point to ask the
university about using the real marks.

### Phones

Most of this gets used standing next to a table, so the phone layout is the
primary one, not an afterthought.

- **[`components/BottomTabsBar.tsx`](components/BottomTabsBar.tsx)** is the
  navigation below `sm`. The top nav hides its section links on narrow screens,
  which had left matchmaking — the whole point of the app — with no route to it
  at all on a phone. Tabs also sit in the thumb zone and are what make the
  installed app feel like an app. Each tab is 56px tall, past the 44px minimum
  tap target.
- **Safe areas.** Installed to an iPhone home screen the app draws edge to
  edge, so `viewportFit: "cover"` plus the `pb-safe` / `pb-tabs` / `pb-page`
  utilities keep the tab bar above the home indicator and the chat composer
  reachable. Without `viewportFit`, `env(safe-area-inset-*)` reports zero and
  none of it does anything.
- **Use `100dvh`, never `100vh`,** for full-height panes. On mobile browsers
  `100vh` includes the address bar, which pushed the chat message box off the
  bottom of the screen.
- The nav and the tab bar share one `nav_summary()` call via
  [`lib/nav-summary.ts`](lib/nav-summary.ts), wrapped in `cache()` — otherwise
  both would query on every navigation.

### Keeping page loads fast

**Partial Prerendering does most of the work.** `cacheComponents: true` in
[`next.config.ts`](next.config.ts) means every signed-in route builds to a
static HTML shell (`◐` in the build output) that's served immediately, with the
per-player parts streaming in behind `<Suspense>`. Before this, clicking a link
did nothing visible until auth and every database query had finished — which is
what made navigation feel slow even when the queries themselves were quick.

Two rules keep it that way:

- **A page function must not `await` anything.** The moment it touches
  `cookies()`, `params`, `searchParams`, or the database, the whole route stops
  being prerenderable. Put the data access in a child component inside
  `<Suspense>` and pass `params` down as the promise rather than awaiting it.
- **Give each boundary a real placeholder** from
  [`components/Skeletons.tsx`](components/Skeletons.tsx). The fallback is what
  ships in the static shell, so it's what people actually see first.

`next build` enforces both — a blocking route fails the build with the file and
the fix.

Round trips still matter for how fast the streamed content lands. Two things
keep that count down:

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

### Notifications and installing to a phone

Both are free, permanently. Web Push is a browser standard delivered by
Google's, Apple's and Mozilla's own push services at no cost and with no
signup — there is no Firebase project and no OneSignal account involved.

- **Install** — [`app/manifest.ts`](app/manifest.ts) plus icons in `public/`
  and the service worker at [`public/sw.js`](public/sw.js). The worker
  deliberately caches nothing: this app is almost entirely live data (who's
  online, who's waiting, unread counts), so serving a stale shell would show
  people a version of the club that isn't true. It has a pass-through `fetch`
  handler purely because Chrome requires one before offering to install.
- **Push** — subscriptions are stored per browser, so a phone and a laptop each
  get their own. Sending happens inline in the Server Action that already did
  the work, so there's no cron job or background worker. Notifications never
  throw: a failed push is not a reason for the challenge or message that
  triggered it to fail.
- **Three triggers**: someone challenges you (or accepts yours), a new chat
  message, and a match reported against you that needs confirming. Each has a
  per-player toggle on `profiles`, all defaulting on — but nothing is ever sent
  until someone explicitly taps "Turn on notifications", since no subscription
  exists before that.
- Notifications sharing a `tag` replace each other, so five messages in one
  conversation are one notification rather than five.

**On iPhone, push only works once the app is on the home screen** (iOS 16.4+).
Safari in a normal tab cannot receive it. `NotificationSettings` detects that
case and says so instead of claiming the browser is unsupported.

Two paths must never be redirected by the proxy: `/sw.js` and
`/manifest.webmanifest`. The browser fetches both without a session, and a 307
to `/login` silently kills installability and push with no visible error. They
are excluded in both [`proxy.ts`](proxy.ts) and the public-path list.

### Blocking and reporting

The app has photos, free-text bios and private chat between people who may not
know each other, so there has to be a way out that isn't "message the
organiser".

**Blocking is one-directional to create and mutual in effect.** You can see who
you've blocked; you can't see who has blocked you, and a blocked player is
never told. They just stop being able to reach you. It's enforced in the
database, not only hidden in the UI: `is_blocked_pair()` gates the message
insert policy, `send_challenge`, `find_match_in_hall`, `pair_with_player` and
`queue_elsewhere`, so a blocked player can't get through by calling the API
directly. Error messages are deliberately vague ("You can't challenge that
player") rather than confirming a block exists.

**Suggestions** (`app/feedback`) go into a `suggestions` table. Sending
anonymously stores a null author, so nobody — including the sender — can read
it back through the API; that's the point, since in a club this small an
attributed complaint is not really anonymous. Read them with:

```sql
select created_at, kind, body,
       coalesce((select username from profiles where id = author), '(anonymous)') as from_user
from suggestions where status = 'open' order by created_at desc;
```

**Reports** go into a `reports` table that only the reporter can read back.
Review them in the Supabase dashboard — `select * from reports where status =
'open'` — which uses the service role and bypasses RLS. There's no admin UI;
for a club this size a SQL query is the honest answer.

**Chatting without a challenge**: `open_direct_channel()` reuses the existing
two-person channel if there is one, so saying hello twice doesn't scatter the
history across two threads.

### Security model

Every new table has row level security on. Channels, their rosters, and their
messages are readable only by members — enforced through the
`is_channel_member()` security-definer helper so the `channel_members` policy
doesn't recurse into itself. Challenges are visible only to the two players
involved. Creating channels, adding members, and answering challenges all go
through security-definer functions rather than direct table writes, so a
client can't add itself to someone else's conversation.

**Row level security controls which rows a policy applies to, never which
columns.** 0001's "Users can update their own profile" policy therefore let any
signed-in player `PATCH` their own row with `{"rating": 9999, "wins": 500}` and
top the leaderboard. The anon key ships in the browser bundle, so that endpoint
is reachable by anyone with an account — nothing in the app ever did it, but the
ladder was writable. 0005 fixes it with column-level grants: `rating`, `wins`
and `losses` stay readable, but are writable only by `confirm_match()`, which
runs as the table owner. **If you add a column to `profiles` that players
should be able to edit, add it to that `grant update (...)` list** or saving
will fail.

Avatars live in a *public* storage bucket, so image URLs need no signing and a
plain `<img>` can load them. Paths are `<user-id>/<random>.webp`, so a URL
isn't guessable, but anyone holding one can open it without signing in — the
usual trade for avatars. Writes are confined to a folder named after your own
user id. To make them members-only, flip the bucket to private and switch
[`lib/avatar.ts`](lib/avatar.ts) to `createSignedUrl()`.

## Known simplifications

- No push/email notification when someone challenges you or sends a message —
  you find out from the badge in the nav next time you open the app.
- No admin/moderation tooling for disputed ("declined") matches or for
  reporting chat abuse; they just sit unresolved. Fine for a small club that
  can sort it out in person.
- Username is derived from the email prefix (`jdoe@northeastern.edu` → `jdoe`)
  and isn't editable in the UI yet. Display names come from the sign-up form
  and fall back to `@username` when unset.
- Reports have no admin UI — you read them with a SQL query, and removing
  someone's photo means deleting the row and the storage object by hand.
- Singles only — no doubles, and no tournament brackets.
- Notifications are push-only. Someone who never installs the app or declines
  the permission prompt still finds out from the nav badge and nothing else.
- Presence shows "online now" but never "last seen", so an empty club looks
  identical whether everyone left an hour ago or a week ago.
- The queue is a flat list — no per-table or per-time-slot scheduling, and
  no way to say when you'll arrive (only that you're there now).
