import Link from "next/link";
import { Wordmark } from "@/components/HuskyMark";
import { NetRule } from "@/components/NetRule";
import { PaddleIcon } from "@/components/PaddleIcon";
import { TIERS } from "@/lib/tiers";
import { TierBadge } from "@/components/TierBadge";

export default function LandingPage() {
  return (
    <div className="bg-bg">
      {/* NAV */}
      <div className="flex h-[76px] items-center justify-between border-b-2 border-nu bg-bg-alt px-6 sm:px-16">
        <Wordmark size={34} className="[&_span]:text-lg" />
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
            className="rounded-[10px] bg-nu px-6 py-3.5 text-sm font-bold text-white transition-colors hover:bg-nu-deep"
          >
            Join the Club
          </Link>
        </div>
      </div>

      {/* HERO */}
      <div className="relative overflow-hidden">
        <div className="table-glow pointer-events-none absolute inset-0" />
        <div className="relative mx-auto grid max-w-6xl grid-cols-1 items-center gap-16 px-6 py-24 sm:px-16 md:grid-cols-2 md:py-28">
          <div className="flex flex-col gap-6">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-nu-line bg-nu-wash px-3.5 py-1.5 text-[13px] font-semibold text-text-dim">
              <span className="h-2 w-2 rounded-full bg-nu" />
              Northeastern Club Table Tennis
            </div>
            <h1 className="font-display text-6xl font-bold leading-[1.03] tracking-tight sm:text-7xl">
              Every rally
              <br />
              <span className="text-nu-accent">counts.</span>
            </h1>
            <p className="max-w-md text-lg leading-relaxed text-text-dim">
              Log your matches, climb the ladder, and find your next opponent — an
              ELO-style ranking system built for Northeastern&rsquo;s ping pong club.
            </p>
            <div className="mt-1 flex items-center gap-4">
              <Link href="/login?mode=signup" className="rounded-[10px] bg-nu px-6 py-3.5 text-[15px] font-bold text-white transition-colors hover:bg-nu-deep">
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
            <div className="w-full max-w-[340px] rounded-[20px] border border-border-strong bg-bg p-7 shadow-[0_30px_60px_-20px_oklch(0%_0%_0%_/_0.18)] dark:shadow-none">
              <div className="flex items-center gap-3.5">
                <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-nu bg-nu-wash font-display text-lg font-bold text-nu-accent">
                  JP
                </div>
                <div>
                  <div className="text-[17px] font-bold">Jordan Park</div>
                  <div className="mt-1.5">
                    <TierBadge rating={1742} size="sm" />
                  </div>
                </div>
              </div>
              <div className="mt-5">
                <div className="font-display text-5xl font-bold tracking-tight text-nu-accent">1,742</div>
                <div className="text-[13px] font-semibold text-text-faint">Rank #12 overall</div>
              </div>
              <svg className="mt-4" width="100%" height="70" viewBox="0 0 284 70" fill="none">
                <path
                  d="M0 50 L36 44 L72 52 L108 30 L144 36 L180 18 L216 24 L252 8 L284 14"
                  stroke="var(--nu-red)"
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
          <h2 className="font-display text-3xl font-bold tracking-tight">Three steps to your first rating.</h2>
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
                <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-nu-line bg-nu-wash">
                  <PaddleIcon size={22} color="var(--nu-red)" />
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
          <h2 className="font-display text-3xl font-bold tracking-tight">
            Six tiers. One ladder.
          </h2>
          <p className="mt-3 max-w-lg text-text-dim">
            Every ranked match moves your rating — and every tier is a milestone worth bragging
            about. Play casually instead and your rating stays put.
          </p>
          <div className="mt-11 flex flex-col gap-2.5">
            {TIERS.map((tier) => (
              <div
                key={tier.name}
                className="flex items-center gap-4 rounded-2xl border bg-surface p-4"
                style={{
                  borderColor: `color-mix(in oklab, ${tier.color} 32%, transparent)`,
                  background: `linear-gradient(90deg, color-mix(in oklab, ${tier.color} 7%, var(--surface)), var(--surface) 45%)`,
                }}
              >
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                  style={{ background: `color-mix(in oklab, ${tier.color} 16%, var(--bg))` }}
                >
                  <PaddleIcon size={24} color={tier.color} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                    <span className="text-[15px] font-bold" style={{ color: tier.color }}>
                      {tier.name}
                    </span>
                    <span className="font-display text-xs font-bold text-text-faint">
                      {Number.isFinite(tier.max) ? `${tier.min}–${tier.max}` : `${tier.min}+`}
                    </span>
                  </div>
                  <p className="mt-1 text-[13px] leading-relaxed text-text-dim">{tier.blurb}</p>
                </div>
                <div className="hidden shrink-0 items-center gap-[3px] sm:flex" aria-hidden>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <span
                      key={i}
                      className="block h-1.5 w-1.5 rounded-full"
                      style={{
                        background: tier.color,
                        opacity: i < tier.level ? 1 : 0.2,
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* FOOTER CTA */}
      <div className="border-t border-border bg-bg-alt px-6 py-24 text-center sm:px-16">
        <NetRule className="mx-auto mb-12 max-w-sm" />
        <h2 className="font-display text-4xl font-bold">Ready to play?</h2>
        <p className="mt-4 text-text-dim">Open to all Northeastern students, faculty, and staff.</p>
        <Link
          href="/login?mode=signup"
          className="mt-8 inline-block rounded-[10px] bg-nu px-6 py-3.5 text-[15px] font-bold text-white transition-colors hover:bg-nu-deep"
        >
          Join the Club
        </Link>
        <div className="mx-auto mt-16 max-w-2xl border-t border-border pt-7 text-xs text-text-faint">
          © NU Ping Pong Club — an independent student organization,
          not affiliated with Northeastern Athletics.
        </div>
      </div>
    </div>
  );
}
