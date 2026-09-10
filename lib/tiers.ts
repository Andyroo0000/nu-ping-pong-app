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

// Standard ladder ranks. The top one keeps Northeastern red, so the ladder
// still ends somewhere that belongs to this club rather than to every ranked
// game ever made.
//
// The boundaries are fitted to the rating range a small club actually
// occupies, not to round numbers. They were originally 200 points apart
// starting at 1000, which made the top half of the ladder unreachable:
// modelling a 1000-rated player showed 74 wins to reach 1400 and *never* to
// 1600, because you cannot rate 1600 by beating 1000s — Elo is relative.
// Narrower early bands give a promotion after about two wins and the next
// after seven, then it stretches out, so climbing stays quick at the bottom
// and means something at the top.
export const TIERS: Tier[] = [
  {
    level: 1,
    name: "Bronze",
    short: "Bronze",
    min: 0,
    max: 899,
    color: "var(--tier-1)",
    blurb: "Everyone starts above this. Drop here and there's only one way to go.",
  },
  {
    level: 2,
    name: "Silver",
    short: "Silver",
    min: 900,
    max: 1049,
    color: "var(--tier-2)",
    blurb: "Where you begin. Win a couple and you're already climbing.",
  },
  {
    level: 3,
    name: "Gold",
    short: "Gold",
    min: 1050,
    max: 1199,
    color: "var(--tier-3)",
    blurb: "You keep the ball on the table and you punish a loose serve.",
  },
  {
    level: 4,
    name: "Platinum",
    short: "Plat",
    min: 1200,
    max: 1349,
    color: "var(--tier-4)",
    blurb: "Spin you can read and spin you can hide. Anything short gets put away.",
  },
  {
    level: 5,
    name: "Diamond",
    short: "Diamond",
    min: 1350,
    max: 1524,
    color: "var(--tier-5)",
    blurb: "Top of the club. You're who everyone wants a game against.",
  },
  {
    level: 6,
    name: "Master",
    short: "Master",
    min: 1525,
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
