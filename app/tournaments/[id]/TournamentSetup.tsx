"use client";

import { useState, useTransition } from "react";
import { PlayerPicker, type PickedPlayer } from "@/components/PlayerPicker";
import {
  addTournamentEntry,
  deleteTournament,
  removeTournamentEntry,
  startTournament,
} from "@/app/actions";
import { matchCount, type TournamentFormat } from "@/lib/bracket";

type Entry = { id: string; label: string; isMine: boolean };

/**
 * Entries, before the bracket exists.
 *
 * Anyone can enter themselves and the organiser can enter anyone, which is
 * the difference between a tournament that happens and one where somebody
 * has to type in twenty names.
 */
export function TournamentSetup({
  tournamentId,
  mode,
  format,
  isOrganiser,
  entries,
}: {
  tournamentId: string;
  mode: "singles" | "doubles";
  format: string;
  isOrganiser: boolean;
  viewerId: string;
  entries: Entry[];
}) {
  const [isPending, startWork] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [player1, setPlayer1] = useState<PickedPlayer | null>(null);
  const [player2, setPlayer2] = useState<PickedPlayer | null>(null);

  const doubles = mode === "doubles";
  const enough = entries.length >= (format === "double_elim" ? 3 : 2);

  function run(fn: () => Promise<{ ok: boolean; error?: string } | void>) {
    setError(null);
    startWork(async () => {
      const result = (await fn()) as { ok?: boolean; error?: string } | undefined;
      if (result?.ok === false) setError(result.error ?? "That didn't work.");
    });
  }

  function addEntry(p1: string, p2?: string | null) {
    const fd = new FormData();
    fd.set("tournamentId", tournamentId);
    fd.set("player1", p1);
    if (p2) fd.set("player2", p2);
    run(async () => {
      const r = await addTournamentEntry(fd);
      if (r.ok) {
        setPlayer1(null);
        setPlayer2(null);
      }
      return r;
    });
  }

  return (
    <div className="mt-5">
      <div className="panel rounded-2xl p-4">
        <div className="text-sm font-bold">
          {doubles ? "Add a pair" : "Add a player"}
        </div>
        <p className="mt-1 text-xs text-text-dim">
          {isOrganiser
            ? "You can add anyone in the club."
            : "You can add yourself. Only the organiser can enter other people."}
        </p>
        <div className="mt-3 flex flex-col gap-3">
          <PlayerPicker
            label={doubles ? "Player one" : "Player"}
            value={player1}
            onChange={setPlayer1}
            exclude={player2 ? [player2.id] : []}
            showDoubles={doubles}
          />
          {doubles && (
            <PlayerPicker
              label="Their partner"
              value={player2}
              onChange={setPlayer2}
              exclude={player1 ? [player1.id] : []}
              showDoubles
            />
          )}
          <button
            type="button"
            disabled={isPending || !player1 || (doubles && !player2)}
            onClick={() => addEntry(player1!.id, player2?.id)}
            className="rounded-xl bg-nu py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {isPending ? "Adding…" : doubles ? "Enter this pair" : "Enter this player"}
          </button>
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-base font-bold">
            {entries.length} {doubles ? (entries.length === 1 ? "pair" : "pairs") : "entered"}
          </span>
          {enough && (
            <span className="text-xs font-semibold text-text-faint">
              {matchCount(format as TournamentFormat, entries.length)} matches
            </span>
          )}
        </div>
        {entries.length === 0 ? (
          <p className="rounded-xl border border-border bg-surface p-4 text-sm text-text-dim">
            Nobody yet.
          </p>
        ) : (
          <div className="flex flex-col">
            {entries.map((e, i) => (
              <div
                key={e.id}
                className={`flex items-center gap-3 border-b border-border py-2.5 last:border-0 ${
                  e.isMine ? "-mx-3 rounded-xl border-b-0 bg-nu-wash px-3" : ""
                }`}
              >
                <span className="w-5 shrink-0 font-display text-sm font-bold text-text-faint">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-bold">{e.label}</span>
                {(isOrganiser || e.isMine) && (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => {
                      const fd = new FormData();
                      fd.set("entryId", e.id);
                      fd.set("tournamentId", tournamentId);
                      run(async () => removeTournamentEntry(fd));
                    }}
                    className="shrink-0 rounded-lg border border-border-strong px-2.5 py-1.5 text-xs font-bold text-text-dim"
                  >
                    {e.isMine && !isOrganiser ? "Withdraw" : "Remove"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {error && (
        <p className="mt-3 rounded-xl border border-nu-line bg-nu-wash px-3 py-2.5 text-xs font-semibold">
          {error}
        </p>
      )}

      {isOrganiser && (
        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            disabled={isPending || !enough}
            onClick={() => {
              const fd = new FormData();
              fd.set("tournamentId", tournamentId);
              run(async () => startTournament(fd));
            }}
            className="w-full rounded-xl bg-nu py-3.5 text-sm font-bold text-white transition-colors hover:bg-nu-deep disabled:opacity-50"
          >
            {isPending ? "Building the bracket…" : "Start the tournament"}
          </button>
          {!enough && (
            <p className="text-center text-xs text-text-faint">
              {format === "double_elim"
                ? "Double elimination needs at least three entries."
                : "Needs at least two entries."}
            </p>
          )}
          <p className="text-center text-xs text-text-faint">
            Seeding is by rating, so the strongest entries start apart. Entries close once it
            starts.
          </p>
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              const fd = new FormData();
              fd.set("tournamentId", tournamentId);
              run(async () => deleteTournament(fd));
            }}
            className="mt-2 text-xs font-bold text-text-faint underline"
          >
            Delete this tournament
          </button>
        </div>
      )}
    </div>
  );
}
