// Client-side mirror of the Elo math in confirm_match() (0012_*.sql).
// Used only for the "if confirmed" preview before submitting — the database
// function is the source of truth. Keep the two in step.

/** How much of `actual` comes from the game score rather than the result. */
const MARGIN_WEIGHT = 0.2;
/** Ranked matches before a player is considered placed. */
export const PLACEMENT_MATCHES = 10;
/** Matches floor_rating in confirm_match(). */
const FLOOR = 100;

export function expectedScore(ratingSelf: number, ratingOpponent: number): number {
  return 1 / (1 + Math.pow(10, (ratingOpponent - ratingSelf) / 400));
}

/**
 * K for a player, from experience then rating.
 *
 * Placements are the important part. Simulating a club showed the old flat
 * K=32 and this end up in the same place over a season — Elo converges to true
 * skill either way — but early on this separates people roughly 70% faster,
 * which is what fixes "everyone is in the same tier".
 *
 * The falloff above 1200 makes the top sticky: at 1800+ you only move
 * meaningfully against someone near your own level.
 */
export function eloK(rating: number, matchesPlayed: number): number {
  if (matchesPlayed < PLACEMENT_MATCHES) return 64;
  if (rating < 1200) return 32;
  if (rating < 1400) return 28;
  if (rating < 1600) return 24;
  if (rating < 1800) return 20;
  return 16;
}

/** A single game is weaker evidence than a best-of-five. */
function evidence(gamesWonWinner: number): number {
  return gamesWonWinner <= 1 ? 0.6 : gamesWonWinner === 2 ? 1.0 : 1.2;
}

/**
 * What actually happened, as a score between 0 and 1.
 *
 * Mostly "did you win", partly "by how much" — so a 3-0 beats a 3-2 without
 * margin overwhelming the result. Weighting margin any higher made a close win
 * between equals worth about +4, which reads as broken.
 */
function actualScore(won: boolean, gamesFor: number, gamesAgainst: number): number {
  const share = gamesFor / (gamesFor + gamesAgainst);
  return (1 - MARGIN_WEIGHT) * (won ? 1 : 0) + MARGIN_WEIGHT * share;
}

/**
 * Rating change for one player. Each side uses their own K, so the two are
 * not equal and the club's total rating is not conserved — that's the cost of
 * placements working, and it's the same trade FIDE makes.
 */
export function ratingChange(args: {
  myRating: number;
  myMatchesPlayed: number;
  opponentRating: number;
  gamesFor: number;
  gamesAgainst: number;
}): number {
  const { myRating, myMatchesPlayed, opponentRating, gamesFor, gamesAgainst } = args;
  const won = gamesFor > gamesAgainst;
  const k = eloK(myRating, myMatchesPlayed);
  const raw =
    k *
    evidence(Math.max(gamesFor, gamesAgainst)) *
    (actualScore(won, gamesFor, gamesAgainst) - expectedScore(myRating, opponentRating));

  if (won) return Math.max(1, Math.round(raw));
  const loss = Math.max(1, Math.round(-raw));
  return -Math.min(loss, Math.max(myRating - FLOOR, 0));
}

/** Plain-English note on why a result is worth what it is, for the preview. */
export function ratingNote(args: {
  myMatchesPlayed: number;
  myRating: number;
  opponentRating: number;
  gamesFor: number;
  gamesAgainst: number;
}): string | null {
  const { myMatchesPlayed, myRating, opponentRating, gamesFor, gamesAgainst } = args;
  const left = PLACEMENT_MATCHES - myMatchesPlayed;
  if (left > 0) {
    return `Placement match — ${left} to go. Your rating moves a lot until it settles.`;
  }
  const gap = opponentRating - myRating;
  if (gamesFor > gamesAgainst && gap >= 150) return "Beating someone above you is worth more.";
  if (gamesFor > gamesAgainst && gap <= -150) {
    return "They're well below you, so there's not much to gain.";
  }
  if (Math.abs(gamesFor - gamesAgainst) >= 3) return "Clean sweep — counts for a little more.";
  if (myRating >= 1600) return "Near the top, ratings move slowly by design.";
  return null;
}
