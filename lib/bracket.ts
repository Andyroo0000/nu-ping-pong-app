// Bracket generation for tournaments.
//
// Everything here works on ENTRIES, not players. An entry is one player in a
// singles tournament and a pair in a doubles one, so a bracket never needs to
// know which it's running — the difference lives entirely in how an entry is
// displayed.
//
// A generated bracket is a flat list of matches joined by pointers: each match
// says where its winner goes and, in double elimination, where its loser goes.
// That's what makes advancing a result a local operation — write the winner
// into the slot the pointer names — instead of re-deriving the whole bracket
// from results every time, which is where bracket code usually goes wrong.
//
// Matches are keyed by strings here ("w1-0", "l3-1") and turned into rows by
// start_tournament(). Keys mean the generator can be tested on its own,
// without a database.

export type TournamentFormat = "single_elim" | "double_elim" | "round_robin";

/** Which half of a bracket a match belongs to. */
export type BracketSide = "main" | "losers" | "final";

export type SlotName = "a" | "b";

export type Pointer = { key: string; slot: SlotName };

export type BracketMatch = {
  key: string;
  bracket: BracketSide;
  round: number;
  slot: number;
  entryA: string | null;
  entryB: string | null;
  winnerTo: Pointer | null;
  loserTo: Pointer | null;
};

/**
 * Standard bracket seeding order.
 *
 * Returns the seed that belongs in each position, so the top seeds start as
 * far apart as possible: 1 and 2 can only meet in the final, 1 and 3 only in
 * the semi, and so on. Built by repeatedly mirroring — the property falls out
 * of the construction rather than being a table someone typed in.
 *
 *   size 4 -> [1, 4, 2, 3]
 *   size 8 -> [1, 8, 4, 5, 2, 7, 3, 6]
 */
export function seedOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const mirror = order.length * 2 + 1;
    order = order.flatMap((seed) => [seed, mirror - seed]);
  }
  return order;
}

/** Smallest power of two that fits everyone. */
export function bracketSize(entrants: number): number {
  let size = 1;
  while (size < entrants) size *= 2;
  return Math.max(size, 2);
}

/**
 * Resolve byes and walkovers.
 *
 * A match that can only ever receive one entrant isn't a match. Working that
 * out needs more than looking at who's seated: most bracket slots are filled
 * later by the winner or loser of some earlier match, so what matters is how
 * many SOURCES a match has — entrants already seated plus live matches
 * pointing at it.
 *
 * With one source the match is dropped and its source is rewired straight to
 * wherever the winner would have gone. That rewiring is the part that earns
 * its keep in double elimination: 17 entrants in a 32 bracket means 15 byes,
 * so most first-round winners-bracket matches never happen, and the
 * losers-bracket matches waiting on their losers would sit unplayable
 * forever. Rewiring turns each of those into a bye in the losers bracket,
 * which is what actually happens at a real tournament.
 *
 * Run as a fixpoint because collapsing one match can starve the next.
 */
function resolveByes(matches: BracketMatch[]): BracketMatch[] {
  const byKey = new Map(matches.map((m) => [m.key, m]));
  const dropped = new Set<string>();
  const live = () => matches.filter((m) => !dropped.has(m.key));

  let changed = true;
  let guard = 0;
  while (changed && guard++ < 1000) {
    changed = false;

    for (const m of live()) {
      // A match with nowhere to send a winner is the title match; collapsing
      // it would throw away the champion.
      if (!m.winnerTo) continue;

      const seated: SlotName[] = [];
      if (m.entryA) seated.push("a");
      if (m.entryB) seated.push("b");

      const feeders: { from: BracketMatch; which: "winnerTo" | "loserTo" }[] = [];
      for (const f of live()) {
        if (f.key === m.key) continue;
        if (f.winnerTo?.key === m.key) feeders.push({ from: f, which: "winnerTo" });
        if (f.loserTo?.key === m.key) feeders.push({ from: f, which: "loserTo" });
      }

      if (seated.length + feeders.length > 1) continue;

      if (seated.length === 1) {
        // Someone is already sitting here alone: advance them.
        const who = seated[0] === "a" ? m.entryA! : m.entryB!;
        const next = byKey.get(m.winnerTo.key);
        if (next) {
          if (m.winnerTo.slot === "a") next.entryA = who;
          else next.entryB = who;
        }
      } else if (feeders.length === 1) {
        // Whoever arrives would be alone, so send them on instead.
        const { from, which } = feeders[0];
        from[which] = m.winnerTo;
      }
      // With no sources at all the match simply never happens.

      dropped.add(m.key);
      changed = true;
      break;
    }
  }

  return live();
}

/** Single elimination. `entries` is in seed order, strongest first. */
export function singleElimination(entries: string[]): BracketMatch[] {
  if (entries.length < 2) return [];
  const size = bracketSize(entries.length);
  const rounds = Math.log2(size);
  const matches: BracketMatch[] = [];

  for (let round = 1; round <= rounds; round++) {
    const count = size / 2 ** round;
    for (let slot = 0; slot < count; slot++) {
      matches.push({
        key: `w${round}-${slot}`,
        bracket: round === rounds ? "final" : "main",
        round,
        slot,
        entryA: null,
        entryB: null,
        winnerTo:
          round < rounds
            ? { key: `w${round + 1}-${Math.floor(slot / 2)}`, slot: slot % 2 === 0 ? "a" : "b" }
            : null,
        loserTo: null,
      });
    }
  }

  // Seat the entrants. A position whose seed is past the end of the list is a
  // bye, left null for resolveByes to collapse.
  const order = seedOrder(size);
  for (let position = 0; position < size; position++) {
    const seed = order[position];
    const entry = seed <= entries.length ? entries[seed - 1] : null;
    if (!entry) continue;
    const match = matches[Math.floor(position / 2)];
    if (position % 2 === 0) match.entryA = entry;
    else match.entryB = entry;
  }

  return resolveByes(matches);
}

/**
 * Double elimination.
 *
 * The winners bracket is a single-elimination bracket. The losers bracket
 * alternates between two kinds of round:
 *
 *   odd  — losers-bracket survivors play each other (the field halves)
 *   even — each survivor meets someone just dropped from the winners bracket
 *
 * For a bracket of size S = 2^k that gives 2k-2 losers rounds, and the whole
 * thing has 2N-2 matches for N entrants.
 *
 * Drop-in order is reversed on each even round. Without that, the player who
 * lost to the top seed in round one keeps meeting the same opponents on the
 * way back up, which is the thing a losers bracket exists to avoid.
 *
 * There's no bracket reset: if the losers-bracket finalist wins the grand
 * final they take the title, rather than forcing a decider. Club tournaments
 * essentially always do it this way — a reset means the winners-bracket
 * finalist has to be beaten twice in a row on the same evening.
 */
export function doubleElimination(entries: string[]): BracketMatch[] {
  if (entries.length < 2) return [];
  const size = bracketSize(entries.length);
  const k = Math.log2(size);
  // Two entrants have nowhere to drop to — see the note in matchCount().
  if (k < 2) return singleElimination(entries);

  const matches: BracketMatch[] = [];
  const push = (m: BracketMatch) => {
    matches.push(m);
    return m;
  };

  // --- Winners bracket.
  for (let round = 1; round <= k; round++) {
    const count = size / 2 ** round;
    for (let slot = 0; slot < count; slot++) {
      push({
        key: `w${round}-${slot}`,
        bracket: "main",
        round,
        slot,
        entryA: null,
        entryB: null,
        winnerTo:
          round < k
            ? { key: `w${round + 1}-${Math.floor(slot / 2)}`, slot: slot % 2 === 0 ? "a" : "b" }
            : { key: "gf", slot: "a" },
        loserTo: null,
      });
    }
  }

  // --- Losers bracket: 2k-2 rounds, sizes S/4, S/4, S/8, S/8, ... 1, 1.
  //
  // Rounds come in pairs, so the pair index is what sets the size: rounds
  // 2j-1 and 2j both hold S/2^(j+1) matches, for j = 1..k-1. Summed that's
  // S-2 losers matches, which with S-1 in the winners bracket and the grand
  // final gives 2S-2 — the count double elimination is supposed to have.
  const lbRounds = 2 * k - 2;
  const lbCount = (round: number) => size / 2 ** (Math.ceil(round / 2) + 1);

  for (let round = 1; round <= lbRounds; round++) {
    const count = lbCount(round);
    for (let slot = 0; slot < count; slot++) {
      const isLast = round === lbRounds;
      push({
        key: `l${round}-${slot}`,
        bracket: "losers",
        round,
        slot,
        entryA: null,
        entryB: null,
        winnerTo: isLast
          ? { key: "gf", slot: "b" }
          : round % 2 === 1
            ? // Odd -> even: the field doesn't shrink, position is kept.
              { key: `l${round + 1}-${slot}`, slot: "a" }
            : // Even -> odd: two survivors pair up.
              { key: `l${round + 1}-${Math.floor(slot / 2)}`, slot: slot % 2 === 0 ? "a" : "b" },
        loserTo: null,
      });
    }
  }

  // --- Grand final.
  push({
    key: "gf",
    bracket: "final",
    round: k + 1,
    slot: 0,
    entryA: null,
    entryB: null,
    winnerTo: null,
    loserTo: null,
  });

  const byKey = new Map(matches.map((m) => [m.key, m]));

  // --- Where losers go.
  //
  // Winners round 1 losers fill the first losers round, two per match.
  const lb1 = lbCount(1);
  for (let slot = 0; slot < size / 2; slot++) {
    const target = `l1-${Math.floor(slot / 2) % Math.max(lb1, 1)}`;
    const m = byKey.get(`w1-${slot}`)!;
    m.loserTo = { key: target, slot: slot % 2 === 0 ? "a" : "b" };
  }

  // Winners round r (r >= 2) losers drop into losers round 2(r-1), reversed.
  for (let r = 2; r <= k; r++) {
    const lbRound = 2 * (r - 1);
    const count = lbCount(lbRound);
    const wbCount = size / 2 ** r;
    for (let slot = 0; slot < wbCount; slot++) {
      const target = count - 1 - (slot % count);
      const m = byKey.get(`w${r}-${slot}`)!;
      m.loserTo = { key: `l${lbRound}-${target}`, slot: "b" };
    }
  }

  // --- Seat the entrants, same seeding as single elimination.
  const order = seedOrder(size);
  for (let position = 0; position < size; position++) {
    const seed = order[position];
    const entry = seed <= entries.length ? entries[seed - 1] : null;
    if (!entry) continue;
    const m = byKey.get(`w1-${Math.floor(position / 2)}`)!;
    if (position % 2 === 0) m.entryA = entry;
    else m.entryB = entry;
  }

  return resolveByes(matches);
}

/**
 * Round robin — everyone plays everyone once.
 *
 * Rounds come from the circle method, so each round is a set of matches that
 * can all be played at the same time on different tables. With an odd number
 * of entrants one sits out each round, which is what the empty slot means.
 */
export function roundRobin(entries: string[]): BracketMatch[] {
  if (entries.length < 2) return [];
  const list = [...entries];
  if (list.length % 2 === 1) list.push("__bye__");

  const n = list.length;
  const rounds = n - 1;
  const half = n / 2;
  const matches: BracketMatch[] = [];

  // Fix the first entrant and rotate the rest.
  let rotation = list.slice(1);

  for (let round = 1; round <= rounds; round++) {
    const lineup = [list[0], ...rotation];
    let slot = 0;
    for (let i = 0; i < half; i++) {
      const a = lineup[i];
      const b = lineup[n - 1 - i];
      if (a === "__bye__" || b === "__bye__") continue;
      matches.push({
        key: `r${round}-${slot}`,
        bracket: "main",
        round,
        slot,
        // Alternate who is listed first, so nobody is always "player A".
        entryA: round % 2 === 0 ? b : a,
        entryB: round % 2 === 0 ? a : b,
        winnerTo: null,
        loserTo: null,
      });
      slot++;
    }
    rotation = [rotation[rotation.length - 1], ...rotation.slice(0, -1)];
  }

  return matches;
}

export function generateBracket(
  format: TournamentFormat,
  entries: string[]
): BracketMatch[] {
  switch (format) {
    case "single_elim":
      return singleElimination(entries);
    case "double_elim":
      return doubleElimination(entries);
    case "round_robin":
      return roundRobin(entries);
  }
}

/** How many matches a format will produce, for the create screen. */
export function matchCount(format: TournamentFormat, entrants: number): number {
  if (entrants < 2) return 0;
  switch (format) {
    case "single_elim":
      return entrants - 1;
    case "double_elim":
      // With two entrants there's no losers bracket to drop into: they'd play
      // again, and if the loser won the rematch both would have one loss and
      // need a decider — which is the bracket reset this deliberately doesn't
      // do. So two entrants is one match, and doubleElimination() falls back
      // to single elimination to match.
      return entrants === 2 ? 1 : 2 * entrants - 2;
    case "round_robin":
      return (entrants * (entrants - 1)) / 2;
  }
}

export const FORMATS: { value: TournamentFormat; label: string; blurb: string }[] = [
  {
    value: "single_elim",
    label: "Single elimination",
    blurb: "Lose once and you're out. Quickest to run — everyone plays at least one match.",
  },
  {
    value: "double_elim",
    label: "Double elimination",
    blurb:
      "You have to lose twice to go out, so one bad game doesn't end your night. Needs at least three entrants.",
  },
  {
    value: "round_robin",
    label: "Round robin",
    blurb: "Everyone plays everyone. Fairest, but the match count climbs fast.",
  },
];
