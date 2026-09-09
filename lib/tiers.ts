export interface Tier {
  /** 1-6, low to high. Drives how many pips the badge shows. */
  level: number;
  name: string;
  /** Fits where the full name won't, e.g. a leaderboard row on mobile. */
  short: string;
  min: number;
  max: number;
  /** CSS custom property holding this tier's accent colour. */
  color: string;
  /** One line on what it takes to get here, for the landing page ladder. */
  blurb: string;
}

// Grey → bronze → steel → gold → Northeastern red → black. The jump to red at
// Paddle Master is the point: the top two tiers wear the school colour.
export const TIERS: Tier[] = [
  {
    level: 1,
    name: "Rookie Husky",
    short: "Rookie",
    min: 0,
    max: 999,
    color: "var(--tier-1)",
    blurb: "Everyone starts here. Log a match and you're on the ladder.",
  },
  {
    level: 2,
    name: "Rally Regular",
    short: "Regular",
    min: 1000,
    max: 1199,
    color: "var(--tier-2)",
    blurb: "You show up and you keep the ball on the table.",
  },
  {
    level: 3,
    name: "Spin Doctor",
    short: "Spin",
    min: 1200,
    max: 1399,
    color: "var(--tier-3)",
    blurb: "Serves that curve and opponents who guess wrong.",
  },
  {
    level: 4,
    name: "Smash Specialist",
    short: "Smash",
    min: 1400,
    max: 1599,
    color: "var(--tier-4)",
    blurb: "Anything short gets put away. Loudly.",
  },
  {
    level: 5,
    name: "Paddle Master",
    short: "Master",
    min: 1600,
    max: 1799,
    color: "var(--tier-5)",
    blurb: "Top of the club. You're who people want to beat.",
  },
  {
    level: 6,
    name: "Husky Grandmaster",
    short: "Grandmaster",
    min: 1800,
    max: Infinity,
    color: "var(--tier-6)",
    blurb: "Rarefied air. Bring a towel and a second paddle.",
  },
];

export function tierForRating(rating: number): Tier {
  return TIERS.find((t) => rating >= t.min && rating <= t.max) ?? TIERS[0];
}

/** How far through the current tier a rating sits, 0-1. */
export function tierProgress(rating: number): number {
  const tier = tierForRating(rating);
  if (!Number.isFinite(tier.max)) return 1;
  return Math.min(1, Math.max(0, (rating - tier.min) / (tier.max - tier.min + 1)));
}

/** The rating needed for the next tier, or null at the top. */
export function nextTierAt(rating: number): { tier: Tier; needed: number } | null {
  const tier = tierForRating(rating);
  const next = TIERS.find((t) => t.level === tier.level + 1);
  return next ? { tier: next, needed: next.min - rating } : null;
}
