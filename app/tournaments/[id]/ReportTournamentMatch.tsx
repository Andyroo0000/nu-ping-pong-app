"use client";

import { useState, useTransition } from "react";
import { advanceTournamentMatch, reportTournamentMatch } from "@/app/actions";

/**
 * Enter a tournament match's score, or — for the organiser on a match they're
 * not in — send one side through without one.
 *
 * Scores are always entered from the reporter's own point of view, which is
 * how every other score entry in the app works. report_tournament_match
 * flips them to the bracket's orientation, so "my score first" holds even
 * when you're the away side of the draw.
 */
export function ReportTournamentMatch({
  matchId,
  tournamentId,
  bestOf,
  myLabel,
  theirLabel,
  organiserOnly = false,
  entryA,
  entryB,
}: {
  matchId: string;
  tournamentId: string;
  bestOf: number;
  meFirst?: boolean;
  myLabel: string;
  theirLabel: string;
  organiserOnly?: boolean;
  entryA?: string;
  entryB?: string;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startWork] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [games, setGames] = useState<{ a: string; b: string }[]>(
    Array.from({ length: bestOf }, () => ({ a: "", b: "" }))
  );

  const filled = games
    .map((g) => ({ a: Number(g.a), b: Number(g.b) }))
    .filter((g) => g.a !== 0 || g.b !== 0)
    .filter((g) => !Number.isNaN(g.a) && !Number.isNaN(g.b) && g.a !== g.b);
  const wonMine = filled.filter((g) => g.a > g.b).length;
  const wonTheirs = filled.filter((g) => g.b > g.a).length;
  const hasResult = filled.length > 0 && wonMine !== wonTheirs;

  function submit() {
    setError(null);
    const fd = new FormData();
    fd.set("matchId", matchId);
    fd.set("tournamentId", tournamentId);
    fd.set("games", JSON.stringify(filled));
    startWork(async () => {
      const r = await reportTournamentMatch(fd);
      if (r.ok === false) setError(r.error);
      else setOpen(false);
    });
  }

  function advance(winner: string) {
    setError(null);
    const fd = new FormData();
    fd.set("matchId", matchId);
    fd.set("tournamentId", tournamentId);
    fd.set("winnerEntry", winner);
    startWork(async () => {
      const r = await advanceTournamentMatch(fd);
      if (r.ok === false) setError(r.error);
      else setOpen(false);
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`mt-3 w-full rounded-xl py-2.5 text-[13px] font-bold ${
          organiserOnly
            ? "border border-border-strong text-text-dim"
            : "bg-nu text-white transition-colors hover:bg-nu-deep"
        }`}
      >
        {organiserOnly ? "Advance without a score" : "Enter the score"}
      </button>
    );
  }

  if (organiserOnly) {
    return (
      <div className="mt-3 flex flex-col gap-2">
        <p className="text-xs text-text-dim">
          Only someone playing can enter a score. For a no-show, send one side through — no rating
          changes.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={isPending}
            onClick={() => advance(entryA!)}
            className="flex-1 truncate rounded-xl border border-border-strong py-2.5 text-[13px] font-bold"
          >
            {myLabel}
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => advance(entryB!)}
            className="flex-1 truncate rounded-xl border border-border-strong py-2.5 text-[13px] font-bold"
          >
            {theirLabel}
          </button>
        </div>
        {error && <p className="text-xs font-semibold text-nu-accent">{error}</p>}
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs font-bold text-text-faint"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-text-faint">
        <span className="w-8">Game</span>
        <span className="flex-1 truncate text-center">{myLabel}</span>
        <span className="flex-1 truncate text-center">{theirLabel}</span>
      </div>
      {games.map((g, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-8 text-sm font-bold text-text-dim">{i + 1}</span>
          <input
            inputMode="numeric"
            value={g.a}
            onChange={(e) =>
              setGames((prev) => prev.map((x, idx) => (idx === i ? { ...x, a: e.target.value } : x)))
            }
            className="flex-1 rounded-xl border border-border-strong bg-bg py-2.5 text-center font-display font-bold outline-none focus:border-nu"
          />
          <input
            inputMode="numeric"
            value={g.b}
            onChange={(e) =>
              setGames((prev) => prev.map((x, idx) => (idx === i ? { ...x, b: e.target.value } : x)))
            }
            className="flex-1 rounded-xl border border-border-strong bg-bg py-2.5 text-center font-display font-bold outline-none focus:border-nu"
          />
        </div>
      ))}
      {hasResult && (
        <p className="text-xs font-semibold">
          {wonMine > wonTheirs ? "You win" : "They win"} {Math.max(wonMine, wonTheirs)}–
          {Math.min(wonMine, wonTheirs)}
        </p>
      )}
      {error && <p className="text-xs font-semibold text-nu-accent">{error}</p>}
      <button
        type="button"
        disabled={isPending || !hasResult}
        onClick={submit}
        className="rounded-xl bg-nu py-3 text-sm font-bold text-white disabled:opacity-50"
      >
        {isPending ? "Saving…" : "Save the result"}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-xs font-bold text-text-faint"
      >
        Cancel
      </button>
    </div>
  );
}
