import { createClient } from "@/lib/supabase/server";
import { displayName } from "@/lib/names";
import { ReportTournamentMatch } from "./ReportTournamentMatch";

const SIDE_LABEL: Record<string, string> = {
  main: "Winners",
  losers: "Losers bracket",
  final: "Final",
};

/**
 * The bracket, grouped by half and round.
 *
 * Rendered as a list of rounds rather than a drawn tree: a tree needs
 * horizontal space that a phone doesn't have, and the thing people actually
 * want from a bracket on a phone is "which match is mine and what's the
 * score". Round headings carry the structure instead.
 */
export async function Bracket({
  tournamentId,
  viewerId,
  isOrganiser,
  bestOf,
  isRanked,
  format,
}: {
  tournamentId: string;
  viewerId: string;
  isOrganiser: boolean;
  bestOf: number;
  isRanked: boolean;
  format: string;
}) {
  const supabase = await createClient();
  const [{ data: matches }, { data: entries }] = await Promise.all([
    supabase
      .from("tournament_matches")
      .select(
        "id, key, bracket, round, slot, entry_a, entry_b, games_won_a, games_won_b, winner_entry, status, match_id, doubles_match_id"
      )
      .eq("tournament_id", tournamentId)
      .order("bracket", { ascending: true })
      .order("round", { ascending: true })
      .order("slot", { ascending: true }),
    supabase
      .from("tournament_entries")
      .select("id, player_1, player_2, guest_name, guest_name_2, seed")
      .eq("tournament_id", tournamentId),
  ]);

  const matchList = matches ?? [];
  const entryList = entries ?? [];
  const playerIds = [
    ...new Set(entryList.flatMap((e) => [e.player_1, e.player_2].filter(Boolean) as string[])),
  ];
  const { data: playerRows } = playerIds.length
    ? await supabase.from("profiles").select("id, username, full_name").in("id", playerIds)
    : { data: [] };
  const players = new Map((playerRows ?? []).map((p) => [p.id, p]));

  const entryById = new Map(entryList.map((e) => [e.id, e]));
  const label = (entryId: string | null) => {
    if (!entryId) return null;
    const e = entryById.get(entryId);
    if (!e) return null;
    const one = e.player_1 ? players.get(e.player_1) : null;
    const two = e.player_2 ? players.get(e.player_2) : null;
    const first = one ? displayName(one) : (e.guest_name ?? "Player");
    const second = two ? displayName(two) : e.guest_name_2;
    return second ? `${first} & ${second}` : first;
  };
  const amIn = (entryId: string | null) => {
    if (!entryId) return false;
    const e = entryById.get(entryId);
    return !!e && (e.player_1 === viewerId || e.player_2 === viewerId);
  };

  if (matchList.length === 0) {
    return (
      <p className="mt-5 rounded-2xl border border-border bg-surface p-6 text-center text-sm text-text-dim">
        No bracket yet.
      </p>
    );
  }

  // Winners, then losers, then the final — the order you read a bracket in.
  const order = ["main", "losers", "final"];
  const groups = order
    .filter((side) => matchList.some((m) => m.bracket === side))
    .map((side) => ({
      side,
      rounds: [...new Set(matchList.filter((m) => m.bracket === side).map((m) => m.round))]
        .sort((a, b) => a - b)
        .map((round) => ({
          round,
          matches: matchList.filter((m) => m.bracket === side && m.round === round),
        })),
    }));

  const roundName = (side: string, round: number, total: number) => {
    if (side === "final") return format === "double_elim" ? "Grand final" : "Final";
    if (format === "round_robin") return `Round ${round}`;
    if (side === "main" && round === total) return "Final";
    if (side === "main" && round === total - 1) return "Semi-finals";
    return `Round ${round}`;
  };

  return (
    <div className="mt-5 flex flex-col gap-7">
      {groups.map(({ side, rounds }) => (
        <div key={side}>
          {groups.length > 1 && (
            <div className="mb-3 text-base font-bold">{SIDE_LABEL[side] ?? side}</div>
          )}
          <div className="flex flex-col gap-5">
            {rounds.map(({ round, matches: roundMatches }) => (
              <div key={round}>
                <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-text-faint">
                  {roundName(side, round, rounds.length)}
                </div>
                <div className="flex flex-col gap-2">
                  {roundMatches.map((m) => {
                    const a = label(m.entry_a);
                    const b = label(m.entry_b);
                    const ready = !!m.entry_a && !!m.entry_b;
                    const iAmIn = amIn(m.entry_a) || amIn(m.entry_b);
                    // The organiser keys in scores for the whole sheet, not
                    // just their own matches — one person running a club
                    // night is the normal case.
                    const canReport = m.status === "pending" && ready && (iAmIn || isOrganiser);
                    const awaySide = amIn(m.entry_b) && !amIn(m.entry_a);
                    const aWon = m.winner_entry && m.winner_entry === m.entry_a;
                    const bWon = m.winner_entry && m.winner_entry === m.entry_b;
                    const mineHere = amIn(m.entry_a) || amIn(m.entry_b);

                    return (
                      <div
                        key={m.id}
                        className={`rounded-2xl p-3.5 ${
                          mineHere && m.status === "pending"
                            ? "border-2 border-nu bg-nu-wash"
                            : "panel border"
                        }`}
                      >
                        <Side
                          name={a}
                          won={!!aWon}
                          games={m.games_won_a}
                          done={m.status === "done"}
                        />
                        <div className="my-1 h-px bg-border" />
                        <Side
                          name={b}
                          won={!!bWon}
                          games={m.games_won_b}
                          done={m.status === "done"}
                        />

                        {m.status === "done" && !m.games_won_a && !m.games_won_b && (
                          <p className="mt-2 text-[11px] font-semibold text-text-faint">
                            Advanced without a score
                          </p>
                        )}
                        {m.status === "done" && isRanked && (m.match_id || m.doubles_match_id) && (
                          <p className="mt-2 text-[11px] text-text-faint">
                            Sent for confirmation — the rating moves when the loser agrees.
                          </p>
                        )}

                        {canReport && (
                          <ReportTournamentMatch
                            matchId={m.id}
                            tournamentId={tournamentId}
                            bestOf={bestOf}
                            // Whoever is entering puts their own score first;
                            // the organiser reads the bracket top line first.
                            // report_tournament_match applies the same rule.
                            myLabel={(awaySide ? b : a) ?? "Top"}
                            theirLabel={(awaySide ? a : b) ?? "Bottom"}
                          />
                        )}

                        {m.status === "pending" && ready && isOrganiser && (
                          <ReportTournamentMatch
                            matchId={m.id}
                            tournamentId={tournamentId}
                            bestOf={bestOf}
                            organiserOnly
                            entryA={m.entry_a!}
                            entryB={m.entry_b!}
                            myLabel={a ?? "A"}
                            theirLabel={b ?? "B"}
                          />
                        )}

                        {!ready && m.status === "pending" && (
                          <p className="mt-2 text-[11px] font-semibold text-text-faint">
                            Waiting on an earlier match
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Side({
  name,
  won,
  games,
  done,
}: {
  name: string | null;
  won: boolean;
  games: number | null;
  done: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`min-w-0 flex-1 truncate text-sm ${
          won ? "font-bold" : done ? "text-text-faint" : "font-semibold"
        }`}
      >
        {name ?? <span className="text-text-faint">TBD</span>}
      </span>
      {games != null && (
        <span className="shrink-0 font-display text-sm font-bold tabular-nums">{games}</span>
      )}
      {won && (
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-nu-accent">
          through
        </span>
      )}
    </div>
  );
}
