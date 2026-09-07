// Client-side mirror of the Elo math in confirm_match() (0001_init.sql).
// Used only to render the "if confirmed" rating preview before submitting —
// the database function is the source of truth for the actual update.

const K = 32;

export function expectedScore(ratingSelf: number, ratingOpponent: number): number {
  return 1 / (1 + Math.pow(10, (ratingOpponent - ratingSelf) / 400));
}

/** Signed rating change for the winner of a match; the loser's is its negation. */
export function winnerRatingDelta(ratingWinner: number, ratingLoser: number): number {
  const expected = expectedScore(ratingWinner, ratingLoser);
  return Math.max(1, Math.round(K * (1 - expected)));
}
