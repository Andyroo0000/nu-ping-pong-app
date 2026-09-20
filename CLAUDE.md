@AGENTS.md

# Design constraints

This app already has a design system. Most UI work is **applying** it, not
inventing. Read `app/globals.css` before writing any markup — it is the source
of truth and it is commented with the reasoning behind each decision.

## Colour: tokens only

Every colour is a semantic token exposed through `@theme inline`. Use
`bg-surface`, `text-text-dim`, `border-border`, `bg-nu`, `text-nu-accent`.

Never write:

- raw hex or `oklch()` in a component
- Tailwind's default palette (`gray-500`, `slate-200`, `red-600`, `zinc-*`)
- `text-white` / `bg-white` / `text-black`

Those all break dark mode, because dark mode works by re-pointing the tokens —
a hardcoded value simply doesn't follow. If you need a colour that no token
covers, add the token to both `:root` and `.dark` and explain why in a comment.

### The two reds are not interchangeable

- `bg-nu` — **fills.** White text sits on it, so it stays dark in both themes.
- `text-nu-accent` — **red type and icons** on the page background. Dark mode
  lightens this one to hold 4.5:1; the fill does not move.

Using `text-nu` for type gives you 3.1:1 red-on-dark that nobody can read at
night. This is the single easiest mistake to make in this codebase.

### `bg-ink` requires `text-bg`

`--ink` is near-black in light mode and near-white in dark. Anything sitting on
`bg-ink` must use `text-bg` (its opposite in both themes), never `text-white`.

## Reuse the primitives before inventing

`globals.css` already defines these. Check the list before hand-rolling:

| Class | Use |
|---|---|
| `.panel` | The standard card. Gradient + border + real shadow, dark-mode variant included |
| `.page-header` | In-app page banner — stays dark in both themes on purpose |
| `.hero-scene` | Landing hero only. Always dark; it's a title screen |
| `.net-rule` | Section divider — the white line down the middle of a table |
| `.table-glow` | Faint texture for large empty areas |
| `.backdrop-art` | Page backdrop. Needs `isolate` on the parent or it paints behind it |
| `.live-dot` | Pulse for the online-now indicator |

## Shape

- `rounded-xl` is the default. `rounded-2xl` for large panels, `rounded-full`
  for pills, avatars, and badges. Don't reach past `rounded-2xl`.
- Segmented controls use a `rounded-[11px]` track with `p-1` and `rounded-[9px]`
  segments, so the inner corners nest inside the outer ones. Match that when you
  build another one — see `app/doubles/DoublesForm.tsx`.

## Type

- `font-display` (Space Grotesk) — headings, scores, numerals, tier labels.
- `font-sans` (Manrope) — everything else. Set on `<body>`, so it's the default.
- This is a **dense, mobile-first** app: `text-sm` and `text-xs` carry almost
  every screen. `text-2xl`+ is for page titles and live scores only. If you find
  yourself writing `text-4xl` in a list or a card, that's the wrong instinct.

## Depth and motion

- **No Tailwind shadow utilities.** There is exactly one `shadow-lg` in the
  whole codebase. Depth comes from `.panel` and `--card-shadow`. `shadow-lg` on
  every card is the most recognisable tell of generated UI.
- Keyframes live in `globals.css`, not inline styles. Give them a comment
  explaining the timing choice, like `ball-flight` and `ball-bounce` do.
- A global `prefers-reduced-motion` block already neutralises animation. Don't
  re-implement it per component, and don't defeat it with JS-driven animation.
- Motion earns its place by communicating state — live, loading, arriving. Decoration
  that loops forever in the corner of a screen people read is noise.

## Things that make this look AI-generated — don't

- Three-column feature-card grids with an icon, a bold heading, and two lines of
  filler underneath.
- Purple/blue gradient heroes. The brand is Northeastern red, used sparingly;
  red means primary action, top tier, live, or the mark — never chrome.
- Emoji as bullets, section markers, or iconography. There are real icon
  components in `components/` (`PaddleIcon`, `NMark`, `TierBadge`, `OnlineDot`).
- Glassmorphism, `backdrop-blur` on everything, glow borders.
- Filler copy — "Seamlessly track your progress", "Elevate your game". Write
  what the screen actually does, in the voice of a club, not a SaaS landing page.
- Uniform spacing everywhere. Hierarchy comes from *deliberate* gaps: tight
  inside a group, generous between groups.
- Centring everything. Most of this app is left-aligned lists and tables,
  because that is what it is.

## Before saying a UI change is done

Run the dev server and look at it. Don't ask the user to check.

- Both themes. The theme script sets an explicit class before first paint, so
  `dark:` keys off `.dark` — toggle it and screenshot both.
- Narrow viewport first. This is a PWA people open on a phone at a ping pong
  table; the desktop view is the secondary case.
- Check the console for hydration warnings — theme and presence both touch
  browser-only state.
