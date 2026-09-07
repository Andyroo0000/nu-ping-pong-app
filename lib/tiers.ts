export interface Tier {
  name: string;
  min: number;
  max: number;
}

// Mirrors the ladder shown on the landing page.
export const TIERS: Tier[] = [
  { name: "Rookie Husky", min: 0, max: 999 },
  { name: "Rally Regular", min: 1000, max: 1199 },
  { name: "Spin Doctor", min: 1200, max: 1399 },
  { name: "Smash Specialist", min: 1400, max: 1599 },
  { name: "Paddle Master", min: 1600, max: 1799 },
  { name: "Husky Grandmaster", min: 1800, max: Infinity },
];

export function tierForRating(rating: number): Tier {
  return TIERS.find((t) => rating >= t.min && rating <= t.max) ?? TIERS[0];
}
