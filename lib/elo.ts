// Client-side mirror of the Elo math in confirm_match() (0008_*.sql).
// Used only to render the "if confirmed" preview before submitting — the
// database function is the source of truth for the actual update.

const K = 32;
/** Matches floor_rating in confirm_match(). */
const FLOOR = 100;

export function expectedScore(ratingSelf: number, ratingOpponent: number): number {
  return 1 / (1 + Math.pow(10, (ratingOpponent - ratingSelf) / 400));
}

/**
 * How much a match counts, from how it was won.
 *
 * Standard Elo already handles the rating gap — beating someone far above you
 * pays much more than beating someone far below. These two multipliers add
 * what it ignores: how decisive the win was, and how much of a test the match
 * format was.
 *
 * `evidence` keys off the *winner's* game count, which names the format: 1 is
 * a single game, 2 a best of three, 3 a best of five. Using total games played
 * instead made a 3-1 outrank a 3-0 sweep, which is backwards.
 */
export function matchWeight(gamesWonWinner: number, gamesWonLoser: number): number {
  const evidence = gamesWonWinner <= 1 ? 0.6 : gamesWonWinner === 2 ? 1.0 : 1.2;
  const spread = Math.abs(gamesWonWinner - gamesWonLoser);
  const margin = spread <= 1 ? 1.0 : spread === 2 ? 1.15 : 1.3;
  return evidence * margin;
}

/** Signed rating change for the winner of a match; the loser's is its negation. */
export function winnerRatingDelta(
  ratingWinner: number,
  ratingLoser: number,
  gamesWonWinner: number,
  gamesWonLoser: number
): number {
  const expected = expectedScore(ratingWinner, ratingLoser);
  const weight = matchWeight(gamesWonWinner, gamesWonLoser);
  const raw = Math.max(1, Math.round(K * weight * (1 - expected)));
  // The winner can't gain more than the loser can drop, or the ladder would
  // mint rating points out of nothing once someone sits at the floor.
  return Math.min(raw, Math.max(ratingLoser - FLOOR, 0));
}

/** Plain-English note on why a result is worth what it is, for the preview. */
export function weightLabel(gamesWonWinner: number, gamesWonLoser: number): string | null {
  const spread = Math.abs(gamesWonWinner - gamesWonLoser);
  if (gamesWonWinner <= 1) return "Single game — counts for less than a full match";
  if (spread >= 3) return "Clean sweep — counts for more";
  if (spread === 2) return "Comfortable win — counts for a little more";
  return null;
}
