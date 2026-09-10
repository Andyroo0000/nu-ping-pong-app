"use client";

import { useState } from "react";
import { PaddleIcon } from "@/components/PaddleIcon";
import { NMark } from "@/components/NMark";
import { completeOnboarding } from "@/app/actions";

type Step = {
  title: string;
  body: string;
  aside?: string;
};

/**
 * Four cards, shown once, the first time someone lands on the home page.
 *
 * Kept to four on purpose: nobody reads a tour. These cover the things that
 * are genuinely non-obvious — that a result needs the other player to confirm
 * it, that matchmaking is hall-based, that casual games exist at all — and
 * skip anything discoverable by looking at the screen.
 */
const STEPS: Step[] = [
  {
    title: "Everyone starts at 1,000",
    body: "Win and it goes up, lose and it goes down. Beating someone well above you is worth a lot; beating someone well below is worth almost nothing.",
    aside: "Six tiers to climb, from Rookie Husky to Husky Grandmaster.",
  },
  {
    title: "Say which hall you're in",
    body: "Tap Matchmaking, pick your hall, and you'll be paired with whoever's there. If nobody is, you get listed so the next person searching finds you — and you'll see who's playing in other halls.",
  },
  {
    title: "Keep score on your phone",
    body: "Start a scoreboard at the table and tap a side per point. Your opponent and anyone else in the club can follow the score live.",
    aside: "Games are to 11, win by two. The app handles that.",
  },
  {
    title: "Results need both players",
    body: "Whoever logs the score sends it to the other player to confirm. Ratings only move once they do — so nobody can quietly rate themselves up.",
    aside: "Playing for fun? Mark it casual and your rating doesn't move at all.",
  },
];

export function Welcome() {
  const [index, setIndex] = useState(0);
  const [closing, setClosing] = useState(false);
  const step = STEPS[index];
  const last = index === STEPS.length - 1;

  async function finish() {
    setClosing(true);
    // Fire and forget: the walkthrough should close the instant it's tapped,
    // and re-showing it once if the write fails is a trivial cost.
    await completeOnboarding();
  }

  if (closing) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-title"
    >
      <div className="pb-safe w-full max-w-sm overflow-hidden rounded-3xl border border-border-strong bg-bg">
        <div className="page-header px-6 pb-6 pt-7">
          <NMark size={40} />
          <div className="mt-3 text-[11px] font-bold uppercase tracking-wider text-white/50">
            Step {index + 1} of {STEPS.length}
          </div>
          <h2 id="welcome-title" className="mt-1 font-display text-2xl font-bold text-white">
            {step.title}
          </h2>
        </div>

        <div className="px-6 py-5">
          <p className="text-sm leading-relaxed text-text-dim">{step.body}</p>
          {step.aside && (
            <p className="mt-3 flex items-start gap-2 rounded-xl border border-nu-line bg-nu-wash px-3 py-2.5 text-[13px] leading-relaxed">
              <PaddleIcon size={15} color="var(--nu-accent)" className="mt-0.5 shrink-0" />
              {step.aside}
            </p>
          )}

          <div className="mt-5 flex items-center gap-1.5" aria-hidden>
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? "w-6 bg-nu" : "w-1.5 bg-surface-2"
                }`}
              />
            ))}
          </div>

          <div className="mt-5 flex gap-2.5">
            {last ? (
              <button
                type="button"
                onClick={finish}
                className="flex-1 rounded-xl bg-nu py-3.5 text-sm font-bold text-white transition-colors hover:bg-nu-deep"
              >
                Got it
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={finish}
                  className="rounded-xl border border-border-strong px-4 py-3.5 text-[13px] font-bold text-text-dim"
                >
                  Skip
                </button>
                <button
                  type="button"
                  onClick={() => setIndex((i) => i + 1)}
                  className="flex-1 rounded-xl bg-nu py-3.5 text-sm font-bold text-white transition-colors hover:bg-nu-deep"
                >
                  Next
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
