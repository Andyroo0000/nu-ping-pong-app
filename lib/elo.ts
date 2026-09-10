// Client-side mirror of the Elo math in confirm_match() (0012_*.sql).
// Used only for the "if confirmed" preview before submitting — the database
// function is the source of truth. Keep the two in step.

/**
 * How much of `actual` comes from the margin rather than the result.
 *
 * 0.35 rather than 0.2 because margin is now point share, which sits much
 * closer to 0.5 than game share does — a sweep is game share 1.00 but often
 * point share 0.6, so the old weight on the smaller signal would have made
 * margin matter less than before. Past ~0.35 a hard-fought win between
 * equals falls into single digits and margin starts overruling who won.
 */
const MARGIN_WEIGHT = 0.35;
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
 * The bands line up with the tier boundaries in lib/tiers.ts, and the falloff
 * makes the top sticky: at 1525+ you only move meaningfully against someone
 * near your own level.
 *
 * Raising K is not, on its own, how you make ranking up faster — modelling
 * showed it barely changes the wins needed for a promotion, because climbing
 * above your opponents shrinks every win. Tier width is the lever; see the
 * note in lib/tiers.ts.
 */
export function eloK(rating: number, matchesPlayed: number): number {
  if (matchesPlayed < PLACEMENT_MATCHES) return 64;
  if (rating < 1050) return 40;
  if (rating < 1200) return 34;
  if (rating < 1350) return 28;
  if (rating < 1525) return 22;
  return 18;
}

/** A single game is weaker evidence than a best-of-five. */
function evidence(gamesWonWinner: number): number {
  return gamesWonWinner <= 1 ? 0.6 : gamesWonWinner === 2 ? 1.0 : 1.2;
}

/**
 * What actually happened, as a score between 0 and 1.
 *
 * Mostly "did you win", partly "by how much" — so a 3-0 beats a 3-2 without
 * margin overwhelming the result. `share` is the share of all POINTS played,
 * not games: game share can't tell a 3-0 in 11-2s from a 3-0 in 11-9s, which
 * meant being annihilated and losing three tight games paid the same.
 */
function actualScore(won: boolean, share: number): number {
  return (1 - MARGIN_WEIGHT) * (won ? 1 : 0) + MARGIN_WEIGHT * share;
}

/**
 * Games and points from one player's side of a match.
 *
 * Both the games won and the point totals come from the same array, so a
 * caller can't pass a game count that disagrees with the points — which is
 * the one way the preview could drift from what the database will do.
 */
export function tally(
  games: { a: number; b: number }[],
  side: "a" | "b"
): { gamesFor: number; gamesAgainst: number; pointsFor: number; pointsAgainst: number } {
  let gamesFor = 0;
  let gamesAgainst = 0;
  let pointsFor = 0;
  let pointsAgainst = 0;
  for (const g of games) {
    const mine = side === "a" ? g.a : g.b;
    const theirs = side === "a" ? g.b : g.a;
    pointsFor += mine;
    pointsAgainst += theirs;
    if (mine > theirs) gamesFor++;
    else if (theirs > mine) gamesAgainst++;
  }
  return { gamesFor, gamesAgainst, pointsFor, pointsAgainst };
}

/**
 * Mirrors match_point_share(): the winner's share of all points, falling back
 * to game share when no point totals were recorded.
 */
function marginShare(t: {
  gamesFor: number;
  gamesAgainst: number;
  pointsFor: number;
  pointsAgainst: number;
}): number {
  const points = t.pointsFor + t.pointsAgainst;
  if (points > 0) return t.pointsFor / points;
  return t.gamesFor / (t.gamesFor + t.gamesAgainst);
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
  games: { a: number; b: number }[];
  /** Which side of `games` is mine. */
  side: "a" | "b";
}): number {
  const { myRating, myMatchesPlayed, opponentRating, games, side } = args;
  const t = tally(games, side);
  const won = t.gamesFor > t.gamesAgainst;
  const k = eloK(myRating, myMatchesPlayed);
  const raw =
    k *
    evidence(Math.max(t.gamesFor, t.gamesAgainst)) *
    (actualScore(won, marginShare(t)) - expectedScore(myRating, opponentRating));

  if (won) return Math.max(1, Math.round(raw));
  const loss = Math.max(1, Math.round(-raw));
  return -Math.min(loss, Math.max(myRating - FLOOR, 0));
}

/** Plain-English note on why a result is worth what it is, for the preview. */
export function ratingNote(args: {
  myMatchesPlayed: number;
  myRating: number;
  opponentRating: number;
  games: { a: number; b: number }[];
  side: "a" | "b";
}): string | null {
  const { myMatchesPlayed, myRating, opponentRating, games, side } = args;
  const left = PLACEMENT_MATCHES - myMatchesPlayed;
  if (left > 0) {
    return `Placement match — ${left} to go. Your rating moves a lot until it settles.`;
  }
  const t = tally(games, side);
  const won = t.gamesFor > t.gamesAgainst;
  const gap = opponentRating - myRating;
  if (won && gap >= 150) return "Beating someone above you is worth more.";
  if (won && gap <= -150) return "They're well below you, so there's not much to gain.";

  // Margin is measured in points now, so the note should be too — a 3-0 in
  // 11-9s isn't the sweep the game score makes it look like.
  const share = marginShare(t);
  if (won && share >= 0.62) return "You won most of the points too — worth a little more.";
  if (won && share <= 0.54) return "Close on points, so it's worth a little less.";
  if (!won && share <= 0.38) return "One-sided on points, so it costs a little more.";
  if (!won && share >= 0.46) return "You were right there on points — it costs a little less.";
  if (myRating >= 1350) return "Near the top, ratings move slowly by design.";
  return null;
}

// ---------------------------------------------------------------------------
// Doubles
//
// A second ladder, mirroring confirm_doubles_match() in 0016_doubles.sql. The
// model is the same as singles — expected score, point margin, each player's
// own K — with one change: expected comes from each TEAM's average rating.
// ---------------------------------------------------------------------------

/** Team strength, as the doubles Elo sees it. */
export function teamRating(a: number, b: number): number {
  return (a + b) / 2;
}

/**
 * Rating change for one player in a doubles match.
 *
 * Averaging the pair is the standard approach, and it has a limitation worth
 * knowing: a strong player partnered with a weak one is predicted as their
 * mean, so carrying someone pays less than that player's singles form would
 * suggest, and the weaker partner gains more because their K is higher. Over
 * a few different partners it evens out — a doubles rating measures how you
 * do in doubles, not how good you are on your own.
 */
export function doublesRatingChange(args: {
  myRating: number;
  myMatchesPlayed: number;
  partnerRating: number;
  opponentRatings: [number, number];
  games: { a: number; b: number }[];
  /** Which side of `games` my team is. */
  side: "a" | "b";
}): number {
  const { myRating, myMatchesPlayed, partnerRating, opponentRatings, games, side } = args;
  const t = tally(games, side);
  const won = t.gamesFor > t.gamesAgainst;
  const mine = teamRating(myRating, partnerRating);
  const theirs = teamRating(opponentRatings[0], opponentRatings[1]);
  const raw =
    eloK(myRating, myMatchesPlayed) *
    evidence(Math.max(t.gamesFor, t.gamesAgainst)) *
    (actualScore(won, marginShare(t)) - expectedScore(mine, theirs));

  if (won) return Math.max(1, Math.round(raw));
  const loss = Math.max(1, Math.round(-raw));
  return -Math.min(loss, Math.max(myRating - FLOOR, 0));
}

/** Plain-English note for the doubles preview. */
export function doublesRatingNote(args: {
  myMatchesPlayed: number;
  myRating: number;
  partnerRating: number;
  opponentRatings: [number, number];
  games: { a: number; b: number }[];
  side: "a" | "b";
}): string | null {
  const { myMatchesPlayed, myRating, partnerRating, opponentRatings, games, side } = args;
  const left = PLACEMENT_MATCHES - myMatchesPlayed;
  if (left > 0) {
    return `Doubles placement — ${left} to go. Your doubles rating moves a lot until it settles.`;
  }
  const t = tally(games, side);
  const won = t.gamesFor > t.gamesAgainst;
  const gap = teamRating(opponentRatings[0], opponentRatings[1]) - teamRating(myRating, partnerRating);
  if (won && gap >= 150) return "You beat the stronger pair — worth more.";
  if (won && gap <= -150) return "You were the favourites, so there's not much to gain.";
  if (Math.abs(myRating - partnerRating) >= 250) {
    return "Uneven pair — expectations sit at your average, so you're judged together.";
  }
  return null;
}
