"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { abandonLiveMatch, submitLiveMatch } from "@/app/actions";
import { applyPoint, applyUndo, gameLabel, gamesWon, type LiveGame } from "@/lib/live";

type Player = { id: string; name: string };
type Status = "live" | "finished" | "abandoned";

type Board = {
  bestOf: number;
  isRanked: boolean;
  games: LiveGame[];
  rally: boolean[];
  pointsA: number;
  pointsB: number;
  scorer: string;
  status: Status;
  matchId: string | null;
};

/**
 * The live scoreboard.
 *
 * Taps apply locally first and the server's realtime update reconciles a
 * moment later — at the table, a point has to register the instant you press
 * it, and waiting on a round trip mid-rally is unusable. The database stays
 * authoritative: every broadcast overwrites local state, so a disagreement
 * resolves the server's way within a moment.
 */
export function Scoreboard({
  liveId,
  viewerId,
  playerA,
  playerB,
  initial,
}: {
  liveId: string;
  viewerId: string;
  playerA: Player;
  playerB: Player;
  initial: Board;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [board, setBoard] = useState<Board>(initial);
  const [error, setError] = useState<string | null>(null);
  // Ignore our own echo while a tap is in flight, or the score visibly
  // bounces back and forth as the round trip lands.
  const pending = useRef(0);

  const isScorer = board.scorer === viewerId;
  const isPlayer = viewerId === playerA.id || viewerId === playerB.id;
  const won = gamesWon(board.games);

  const pull = useCallback(async () => {
    const { data } = await supabase
      .from("live_matches")
      .select("*")
      .eq("id", liveId)
      .maybeSingle();
    if (!data) return;
    setBoard({
      bestOf: data.best_of,
      isRanked: data.is_ranked,
      games: data.games ?? [],
      rally: data.rally ?? [],
      pointsA: data.points_a,
      pointsB: data.points_b,
      scorer: data.scorer,
      status: data.status,
      matchId: data.match_id,
    });
  }, [supabase, liveId]);

  useEffect(() => {
    const channel = supabase
      .channel(`live:${liveId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "live_matches", filter: `id=eq.${liveId}` },
        (payload) => {
          if (pending.current > 0) return;
          const row = payload.new as Record<string, unknown>;
          setBoard({
            bestOf: row.best_of as number,
            isRanked: row.is_ranked as boolean,
            games: (row.games as LiveGame[]) ?? [],
            rally: (row.rally as boolean[]) ?? [],
            pointsA: row.points_a as number,
            pointsB: row.points_b as number,
            scorer: row.scorer as string,
            status: row.status as Status,
            matchId: (row.match_id as string) ?? null,
          });
        }
      )
      .subscribe();

    // Safety net if Realtime isn't enabled on the project.
    const poll = setInterval(pull, 5000);
    return () => {
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [supabase, liveId, pull]);

  async function tap(forA: boolean) {
    if (!isScorer || board.status !== "live") return;
    setError(null);
    const optimistic = applyPoint(toState(board), forA);
    setBoard((b) => ({ ...b, ...fromState(optimistic) }));

    pending.current += 1;
    const { error: rpcError } = await supabase.rpc("live_point", {
      p_id: liveId,
      p_for_a: forA,
    });
    pending.current -= 1;
    if (rpcError) {
      setError(rpcError.message);
      await pull();
    }
  }

  async function undo() {
    if (!isScorer) return;
    setError(null);
    const optimistic = applyUndo(toState(board));
    setBoard((b) => ({ ...b, ...fromState(optimistic) }));

    pending.current += 1;
    const { error: rpcError } = await supabase.rpc("live_undo", { p_id: liveId });
    pending.current -= 1;
    if (rpcError) {
      setError(rpcError.message);
      await pull();
    }
  }

  async function takeOver() {
    setError(null);
    const { error: rpcError } = await supabase.rpc("take_scoring", { p_id: liveId });
    if (rpcError) setError(rpcError.message);
    await pull();
  }

  const over = board.status !== "live";

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col px-5 pb-safe-plus pt-5 text-white">
      <div className="flex items-center justify-between gap-3">
        <Link href="/home" className="text-[13px] font-bold text-white/60">
          ← Home
        </Link>
        <span className="text-[11px] font-bold uppercase tracking-wider text-white/45">
          {board.isRanked ? "Ranked" : "Casual"} · {gameLabel(toState(board))}
        </span>
      </div>

      {/* Games won so far. */}
      <div className="mt-5 flex items-center justify-center gap-2">
        {Array.from({ length: board.bestOf }).map((_, i) => {
          const g = board.games[i];
          return (
            <span
              key={i}
              className={`h-1.5 w-8 rounded-full ${
                !g ? "bg-white/15" : g.a > g.b ? "bg-nu-bright" : "bg-white/70"
              }`}
            />
          );
        })}
      </div>

      <div className="mt-6 grid flex-1 grid-cols-2 gap-3">
        <Side
          name={playerA.name}
          gamesWon={won.a}
          points={board.pointsA}
          accent
          disabled={!isScorer || over}
          onTap={() => tap(true)}
        />
        <Side
          name={playerB.name}
          gamesWon={won.b}
          points={board.pointsB}
          disabled={!isScorer || over}
          onTap={() => tap(false)}
        />
      </div>

      {board.games.length > 0 && (
        <div className="mt-4 flex flex-wrap justify-center gap-1.5">
          {board.games.map((g, i) => (
            <span
              key={i}
              className="rounded-md bg-white/10 px-2 py-1 font-display text-[11px] font-bold"
            >
              {g.a}–{g.b}
            </span>
          ))}
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-lg bg-white/10 px-3 py-2 text-[13px] font-semibold">{error}</p>
      )}

      <div className="mt-4 flex flex-col gap-2">
        {isScorer && !over && (
          <button
            type="button"
            onClick={undo}
            className="rounded-xl border border-white/25 py-3 text-[13px] font-bold text-white/80"
          >
            Undo last point
          </button>
        )}

        {!isScorer && isPlayer && !over && (
          <button
            type="button"
            onClick={takeOver}
            className="rounded-xl border border-white/25 py-3 text-[13px] font-bold text-white/80"
          >
            Take over scoring
          </button>
        )}

        {!isPlayer && (
          <p className="text-center text-xs text-white/45">
            You&rsquo;re watching. Only the players can score.
          </p>
        )}

        {over && board.status === "finished" && !board.matchId && isPlayer && (
          <ActionForm action={submitLiveMatch} hidden={{ liveId }}>
            <SubmitButton
              pendingLabel="Sending…"
              className="w-full rounded-xl bg-nu py-3.5 text-sm font-bold text-white"
            >
              Send for confirmation
            </SubmitButton>
          </ActionForm>
        )}

        {board.matchId && (
          <p className="rounded-xl bg-white/10 px-3.5 py-3 text-center text-[13px] font-semibold">
            Sent. Your opponent confirms it and then ratings move.
          </p>
        )}

        {isPlayer && !over && (
          <ActionForm action={abandonLiveMatch} hidden={{ liveId }}>
            <SubmitButton
              pendingLabel="…"
              className="w-full py-2 text-xs font-bold text-white/40"
            >
              Abandon this match
            </SubmitButton>
          </ActionForm>
        )}
      </div>
    </div>
  );
}

function Side({
  name,
  gamesWon,
  points,
  accent = false,
  disabled,
  onTap,
}: {
  name: string;
  gamesWon: number;
  points: number;
  accent?: boolean;
  disabled: boolean;
  onTap: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onTap}
      disabled={disabled}
      // A whole half of the screen: at the table you tap without aiming.
      className={`flex flex-col items-center justify-center rounded-2xl border py-8 transition-colors ${
        accent ? "border-nu-bright/50 bg-nu/20" : "border-white/15 bg-white/[0.06]"
      } ${disabled ? "" : "active:bg-white/20"}`}
    >
      <span className="max-w-full truncate px-2 text-[13px] font-bold text-white/70">{name}</span>
      <span className="mt-1 font-display text-[64px] font-bold leading-none tabular-nums">
        {points}
      </span>
      <span className="mt-2 text-[11px] font-bold uppercase tracking-wider text-white/45">
        {gamesWon} {gamesWon === 1 ? "game" : "games"}
      </span>
    </button>
  );
}

/* The shared rules in lib/live.ts speak LiveState; the row speaks snake_case. */
function toState(b: Board) {
  return {
    bestOf: b.bestOf,
    games: b.games,
    rally: b.rally,
    pointsA: b.pointsA,
    pointsB: b.pointsB,
    finished: b.status !== "live",
  };
}

function fromState(s: ReturnType<typeof toState>) {
  return {
    games: s.games,
    rally: s.rally,
    pointsA: s.pointsA,
    pointsB: s.pointsB,
    status: (s.finished ? "finished" : "live") as Status,
  };
}
