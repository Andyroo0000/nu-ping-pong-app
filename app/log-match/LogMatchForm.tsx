"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { winnerRatingDelta } from "@/lib/elo";
import { displayName, firstName, initials } from "@/lib/names";
import { reportMatch } from "@/app/actions";

type OpponentOption = {
  id: string;
  username: string;
  full_name: string | null;
  rating: number;
};

export function LogMatchForm() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [myId, setMyId] = useState<string | null>(null);
  const [myRating, setMyRating] = useState<number | null>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<OpponentOption[]>([]);
  const [opponent, setOpponent] = useState<OpponentOption | null>(null);

  const [matchKind, setMatchKind] = useState<"ranked" | "casual">("ranked");
  const [format, setFormat] = useState<3 | 5>(3);
  const [games, setGames] = useState<{ a: string; b: string }[]>([
    { a: "", b: "" },
    { a: "", b: "" },
    { a: "", b: "" },
  ]);
  const [formError, setFormError] = useState<string | null>(null);

  // Load the signed-in player's own rating.
  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return router.push("/login");
      setMyId(user.id);
      const { data } = await supabase
        .from("profiles")
        .select("rating")
        .eq("id", user.id)
        .single();
      setMyRating(data?.rating ?? 1000);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Preselect an opponent passed from the matchmaking page.
  useEffect(() => {
    const opponentId = searchParams.get("opponent");
    if (!opponentId) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, username, full_name, rating")
        .eq("id", opponentId)
        .single();
      if (data) setOpponent(data);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function selectFormat(n: 3 | 5) {
    setFormat(n);
    setGames((prev) => Array.from({ length: n }, (_, i) => prev[i] ?? { a: "", b: "" }));
  }

  useEffect(() => {
    const handle = setTimeout(async () => {
      if (query.trim().length < 2 || !myId) {
        setResults([]);
        return;
      }
      // Plenty of players have no full name set, so search usernames too.
      // Commas and parens would break PostgREST's `or` filter grammar.
      const term = query.trim().replace(/[,()*]/g, "");
      if (!term) {
        setResults([]);
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("id, username, full_name, rating")
        .or(`full_name.ilike.%${term}%,username.ilike.%${term}%`)
        .neq("id", myId)
        .limit(5);
      setResults(data ?? []);
    }, 200);
    return () => clearTimeout(handle);
  }, [query, myId, supabase]);

  const filledGames = games
    .map((g) => ({ a: Number(g.a), b: Number(g.b) }))
    .filter((g) => g.a !== 0 || g.b !== 0)
    .filter((g) => !Number.isNaN(g.a) && !Number.isNaN(g.b) && g.a !== g.b);

  const gamesWonMe = filledGames.filter((g) => g.a > g.b).length;
  const gamesWonOpp = filledGames.filter((g) => g.b > g.a).length;
  const iWon = gamesWonMe > gamesWonOpp;
  const hasResult = filledGames.length > 0 && gamesWonMe !== gamesWonOpp;

  const isRanked = matchKind === "ranked";
  let myNewRating: number | null = null;
  let oppNewRating: number | null = null;
  let delta = 0;
  if (isRanked && hasResult && myRating != null && opponent) {
    delta = iWon
      ? winnerRatingDelta(myRating, opponent.rating)
      : -winnerRatingDelta(opponent.rating, myRating);
    myNewRating = myRating + delta;
    oppNewRating = opponent.rating - delta;
  }

  function updateGame(i: number, side: "a" | "b", value: string) {
    setGames((prev) => prev.map((g, idx) => (idx === i ? { ...g, [side]: value } : g)));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!opponent) {
      setFormError("Choose an opponent first.");
      return;
    }
    if (!hasResult) {
      setFormError("Enter final scores for at least one game with no tie.");
      return;
    }
    const fd = new FormData();
    fd.set("opponentId", opponent.id);
    fd.set("games", JSON.stringify(filledGames));
    fd.set("matchKind", matchKind);
    // The callback has to be awaited inside the transition, otherwise
    // isPending flips back to false immediately and the button never shows
    // that anything is happening.
    startTransition(async () => {
      try {
        const result = await reportMatch(fd);
        if (result && !result.ok) setFormError(result.error);
      } catch {
        setFormError("Couldn't submit that match. Check your connection and try again.");
      }
    });
  }

  return (
    <div className="mx-auto min-h-screen max-w-md bg-bg px-6 pb-10">
      <div className="flex items-center gap-3 py-5">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Go back"
          className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-surface-2"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <div className="text-lg font-bold">Log Match</div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <div>
          <Label>Opponent</Label>
          {opponent ? (
            <div className="mt-2 flex items-center gap-3 rounded-2xl border border-border bg-surface px-3.5 py-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-xs font-bold">
                {initials(opponent)}
              </div>
              <div className="flex-1">
                <div className="text-[15px] font-bold">{displayName(opponent)}</div>
                <div className="text-xs font-semibold text-text-faint">
                  {opponent.rating.toLocaleString()} rating
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpponent(null)}
                className="text-[13px] font-bold underline"
              >
                Change
              </button>
            </div>
          ) : (
            <div className="relative mt-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or username…"
                className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-ink"
              />
              {results.length > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-xl border border-border-strong bg-bg shadow-lg">
                  {results.map((r) => (
                    <button
                      type="button"
                      key={r.id}
                      onClick={() => {
                        setOpponent(r);
                        setResults([]);
                        setQuery("");
                      }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface"
                    >
                      <span className="text-sm font-bold">{displayName(r)}</span>
                      <span className="text-xs text-text-faint">{r.rating}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div>
          <Label>Match type</Label>
          <div className="mt-2 flex gap-1.5 rounded-[11px] bg-surface p-1">
            {(
              [
                { value: "ranked", label: "Ranked", blurb: "Counts toward your rating" },
                { value: "casual", label: "Casual", blurb: "Just for fun, no rating change" },
              ] as const
            ).map((option) => (
              <button
                type="button"
                key={option.value}
                onClick={() => setMatchKind(option.value)}
                aria-pressed={matchKind === option.value}
                className={`flex-1 rounded-[9px] px-2 py-2.5 ${
                  matchKind === option.value ? "bg-surface-2 text-text" : "text-text-faint"
                }`}
              >
                <span className="block text-[13px] font-bold">{option.label}</span>
                <span className="mt-0.5 block text-[10px] font-semibold text-text-faint">
                  {option.blurb}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label>Format</Label>
          <div className="mt-2 flex gap-1.5 rounded-[11px] bg-surface p-1">
            {[3, 5].map((n) => (
              <button
                type="button"
                key={n}
                onClick={() => selectFormat(n as 3 | 5)}
                className={`flex-1 rounded-[9px] py-2.5 text-[13px] font-bold ${
                  format === n ? "bg-surface-2 text-text" : "text-text-faint"
                }`}
              >
                Best of {n}
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label>Game Scores</Label>
          <div className="mt-2 flex flex-col gap-2.5">
            {games.map((g, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3.5 py-2.5"
              >
                <div className="flex-1 text-sm font-bold text-text-dim">Game {i + 1}</div>
                <ScoreInput value={g.a} onChange={(v) => updateGame(i, "a", v)} />
                <div className="font-bold text-text-faint">–</div>
                <ScoreInput value={g.b} onChange={(v) => updateGame(i, "b", v)} />
              </div>
            ))}
          </div>
        </div>

        {hasResult && (
          <div className="flex items-center gap-2.5 rounded-xl border border-border-strong bg-surface-2 px-4 py-3.5">
            <CheckIcon />
            <div className="text-sm font-bold">
              You {iWon ? "won" : "lost"}, {gamesWonMe}–{gamesWonOpp}
            </div>
          </div>
        )}

        {hasResult && !isRanked && (
          <p className="rounded-xl border border-border bg-surface px-4 py-3.5 text-[13px] text-text-dim">
            Casual game — it&rsquo;ll show on both your profiles once
            {opponent ? ` ${firstName(opponent)}` : " your opponent"} confirms, but nobody&rsquo;s
            rating moves.
          </p>
        )}

        {isRanked && hasResult && opponent && myRating != null && (
          <div className="rounded-2xl border border-border bg-surface p-4">
            <div className="mb-3 text-xs font-bold text-text-faint">IF CONFIRMED</div>
            <PreviewRow label="You" from={myRating} to={myNewRating!} />
            <PreviewRow
              label={firstName(opponent)}
              from={opponent.rating}
              to={oppNewRating!}
              className="mt-3"
            />
          </div>
        )}

        {formError && <p className="text-sm font-semibold text-text">{formError}</p>}

        <div>
          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-xl bg-ink py-4 text-[15px] font-bold text-white disabled:opacity-50"
          >
            {isPending ? "Sending…" : "Send for Confirmation"}
          </button>
          {opponent && (
            <p className="mt-3 text-center text-xs font-semibold leading-relaxed text-text-faint">
              {firstName(opponent)} will need to confirm this result before ratings
              update.
            </p>
          )}
        </div>
      </form>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-xs font-bold uppercase tracking-wide text-text-faint">{children}</label>
  );
}

function ScoreInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      inputMode="numeric"
      pattern="[0-9]*"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))}
      className="h-11 w-11 rounded-[9px] border border-border-strong bg-surface-2 text-center font-display text-[17px] font-bold outline-none focus:border-ink"
    />
  );
}

function PreviewRow({
  label,
  from,
  to,
  className = "",
}: {
  label: string;
  from: number;
  to: number;
  className?: string;
}) {
  const diff = to - from;
  return (
    <div className={`flex items-center justify-between ${className}`}>
      <div className="text-sm font-semibold">{label}</div>
      <div className="flex items-center gap-2 font-display text-[15px] font-bold">
        <span className="text-text-faint">{from.toLocaleString()}</span>
        <ArrowIcon />
        <span>{to.toLocaleString()}</span>
        <span className="text-text-faint text-[13px]">
          ({diff >= 0 ? "+" : "−"}
          {Math.abs(diff)})
        </span>
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" strokeWidth="2">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

