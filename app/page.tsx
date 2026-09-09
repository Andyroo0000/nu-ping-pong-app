import Link from "next/link";
import { HuskyMark } from "@/components/HuskyMark";
import { TIERS } from "@/lib/tiers";

export default function LandingPage() {
  return (
    <div className="bg-bg">
      {/* NAV */}
      <div className="flex h-[76px] items-center justify-between border-b border-border bg-bg-alt px-6 sm:px-16">
        <div className="flex items-center gap-3">
          <HuskyMark />
          <span className="font-display text-lg font-bold tracking-tight">NU Ping Pong</span>
        </div>
        <div className="hidden items-center gap-10 md:flex">
          <Link href="/leaderboard" className="text-sm font-semibold text-text-dim hover:text-text">
            Leaderboard
          </Link>
          <Link href="/matchmaking" className="text-sm font-semibold text-text-dim hover:text-text">
            Matchmaking
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/login?mode=signin"
            className="hidden px-1 py-2 text-sm font-semibold text-text-dim hover:text-text sm:inline"
          >
            Sign In
          </Link>
          <Link
            href="/login?mode=signup"
            className="rounded-[10px] bg-ink px-6 py-3.5 text-sm font-bold text-white"
          >
            Join the Club
          </Link>
        </div>
      </div>

      {/* HERO */}
      <div className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute -right-40 -top-52 h-[800px] w-[800px] rounded-full"
          style={{ background: "radial-gradient(circle, oklch(0% 0 0 / 0.05), transparent 70%)" }}
        />
        <div className="relative mx-auto grid max-w-6xl grid-cols-1 items-center gap-16 px-6 py-24 sm:px-16 md:grid-cols-2 md:py-28">
          <div className="flex flex-col gap-6">
            <div className="inline-flex w-fit items-center gap-2 rounded-full bg-surface-2 px-3.5 py-1.5 text-[13px] font-semibold text-text-dim">
              <span className="h-2 w-2 rounded-full bg-ink" />
              Northeastern Club Table Tennis
            </div>
            <h1 className="font-display text-6xl font-bold leading-[1.03] tracking-tight sm:text-7xl">
              Every rally
              <br />
              counts.
            </h1>
            <p className="max-w-md text-lg leading-relaxed text-text-dim">
              Log your matches, climb the ladder, and find your next opponent — an
              ELO-style ranking system built for Northeastern&rsquo;s ping pong club.
            </p>
            <div className="mt-1 flex items-center gap-4">
              <Link href="/login?mode=signup" className="rounded-[10px] bg-ink px-6 py-3.5 text-[15px] font-bold text-white">
                Join the Club
              </Link>
              <Link
                href="/leaderboard"
                className="rounded-[10px] border border-border-strong px-6 py-3.5 text-[15px] font-bold"
              >
                View Leaderboard →
              </Link>
            </div>
          </div>

          <div className="flex justify-center">
            <div className="w-full max-w-[340px] rounded-[20px] border border-border-strong bg-white p-7 shadow-[0_30px_60px_-20px_oklch(0%_0%_0%_/_0.18)]">
              <div className="flex items-center gap-3.5">
                <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-ink-bright bg-ink-dim font-display text-lg font-bold">
                  JP
                </div>
                <div>
                  <div className="text-[17px] font-bold">Jordan Park</div>
                  <div className="mt-1.5 inline-flex items-center rounded-full border border-border-strong bg-surface-2 px-3 py-1 text-xs font-bold">
                    Paddle Master
                  </div>
                </div>
              </div>
              <div className="mt-5">
                <div className="font-display text-5xl font-bold tracking-tight">1,742</div>
                <div className="text-[13px] font-semibold text-text-faint">Rank #12 overall</div>
              </div>
              <svg className="mt-4" width="100%" height="70" viewBox="0 0 284 70" fill="none">
                <path
                  d="M0 50 L36 44 L72 52 L108 30 L144 36 L180 18 L216 24 L252 8 L284 14"
                  stroke="var(--ink-bright)"
                  strokeWidth="3"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* HOW IT WORKS */}
      <div className="border-y border-border bg-surface px-6 py-20 sm:px-16">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-3xl font-bold tracking-tight">Three steps to your first rating.</h2>
          <p className="mt-3 max-w-lg text-text-dim">
            No sign-up sheets, no spreadsheets — just play and log.
          </p>
          <div className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-3">
            {[
              {
                title: "Create your profile",
                body: "Sign up with your Northeastern email and start at 1,000 rating, same as everyone else.",
              },
              {
                title: "Log every match",
                body: "Enter the score after you play. Your opponent confirms it, then ratings update automatically.",
              },
              {
                title: "Climb the ladder",
                body: "Chase the next tier, find opponents near your rating, and see how you stack up club-wide.",
              },
            ].map((step) => (
              <div key={step.title} className="flex flex-col gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-ink-dim text-lg font-bold">
                  •
                </div>
                <h3 className="text-lg font-bold">{step.title}</h3>
                <p className="text-[15px] leading-relaxed text-text-dim">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* TIER LADDER */}
      <div className="px-6 py-20 sm:px-16">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-3xl font-bold tracking-tight">Six tiers. One ladder.</h2>
          <p className="mt-3 max-w-lg text-text-dim">
            Every match moves your rating — and every tier is a milestone worth bragging about.
          </p>
          <div className="mt-11 grid grid-cols-2 items-end gap-3 sm:grid-cols-6">
            {TIERS.map((tier, i) => (
              <div key={tier.name} className="flex flex-col gap-3">
                <div
                  className="rounded-xl border bg-surface"
                  style={{
                    height: 64 + i * 18,
                    borderColor: i === TIERS.length - 1 ? "var(--ink)" : "var(--border)",
                    borderWidth: i === TIERS.length - 1 ? 1.5 : 1,
                    background:
                      i === TIERS.length - 1
                        ? "linear-gradient(180deg, var(--ink-dim), var(--surface))"
                        : undefined,
                  }}
                />
                <div className="text-sm font-bold">{tier.name}</div>
                <div className="text-xs font-semibold text-text-faint">
                  {tier.max === Infinity ? `${tier.min}+` : `${tier.min}–${tier.max}`}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* FOOTER CTA */}
      <div className="border-t border-border bg-bg-alt px-6 py-24 text-center sm:px-16">
        <h2 className="text-4xl font-bold">Ready to play?</h2>
        <p className="mt-4 text-text-dim">Open to all Northeastern students, faculty, and staff.</p>
        <Link
          href="/login?mode=signup"
          className="mt-8 inline-block rounded-[10px] bg-ink px-6 py-3.5 text-[15px] font-bold text-white"
        >
          Join the Club
        </Link>
        <div className="mx-auto mt-16 max-w-2xl border-t border-border pt-7 text-xs text-text-faint">
          © {new Date().getFullYear()} NU Ping Pong Club — an independent student organization,
          not affiliated with Northeastern Athletics.
        </div>
      </div>
    </div>
  );
}
