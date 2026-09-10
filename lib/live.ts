export type LiveGame = { a: number; b: number };

export type LiveState = {
  bestOf: number;
  games: LiveGame[];
  /** Current game's points in order; true means a point for player_a. */
  rally: boolean[];
  pointsA: number;
  pointsB: number;
  finished: boolean;
};

/**
 * Client mirror of live_point / live_undo in 0010_live_matches.sql.
 *
 * It exists so a tap feels instant: the phone applies the point locally and
 * the realtime update from the server reconciles a moment later. The database
 * remains the authority — if the two ever disagree, the server's row wins.
 * Keep the two in step.
 */

export const neededGames = (bestOf: number) => Math.floor(bestOf / 2) + 1;

export function gamesWon(games: LiveGame[]): { a: number; b: number } {
  return {
    a: games.filter((g) => g.a > g.b).length,
    b: games.filter((g) => g.b > g.a).length,
  };
}

/** A game is to 11 but has to be won by two, so 10-10 keeps going. */
function gameOver(a: number, b: number): boolean {
  return Math.max(a, b) >= 11 && Math.abs(a - b) >= 2;
}

export function applyPoint(state: LiveState, forA: boolean): LiveState {
  if (state.finished) return state;

  const pointsA = state.pointsA + (forA ? 1 : 0);
  const pointsB = state.pointsB + (forA ? 0 : 1);

  if (gameOver(pointsA, pointsB)) {
    const games = [...state.games, { a: pointsA, b: pointsB }];
    const won = gamesWon(games);
    return {
      ...state,
      games,
      rally: [],
      pointsA: 0,
      pointsB: 0,
      finished: Math.max(won.a, won.b) >= neededGames(state.bestOf),
    };
  }

  return { ...state, rally: [...state.rally, forA], pointsA, pointsB };
}

export function applyUndo(state: LiveState): LiveState {
  // Mid-game: drop the point that was actually scored, not a guess based on
  // who happens to be ahead.
  if (state.rally.length > 0) {
    const rally = state.rally.slice(0, -1);
    return {
      ...state,
      rally,
      pointsA: rally.filter(Boolean).length,
      pointsB: rally.filter((r) => !r).length,
      finished: false,
    };
  }

  // Start of a game: reopen the previous one, one point short. The real order
  // of that game's points is gone, so the rebuilt rally puts the loser's
  // points first and the winner's after — further undos then walk back the
  // winning run, which is what someone fixing a mistake expects.
  if (state.games.length > 0) {
    const games = state.games.slice(0, -1);
    const last = state.games[state.games.length - 1];
    const aWon = last.a > last.b;
    const pointsA = last.a - (aWon ? 1 : 0);
    const pointsB = last.b - (aWon ? 0 : 1);
    const loserPoints = aWon ? pointsB : pointsA;
    const winnerPoints = aWon ? pointsA : pointsB;
    return {
      ...state,
      games,
      rally: [
        ...Array.from({ length: loserPoints }, () => !aWon),
        ...Array.from({ length: winnerPoints }, () => aWon),
      ],
      pointsA,
      pointsB,
      finished: false,
    };
  }

  return state;
}

/** "Game 3 · best of 5", for the scoreboard caption. */
export function gameLabel(state: LiveState): string {
  const total = state.bestOf === 1 ? "one game" : `best of ${state.bestOf}`;
  if (state.finished) return `Match over · ${total}`;
  return `Game ${state.games.length + 1} · ${total}`;
}
