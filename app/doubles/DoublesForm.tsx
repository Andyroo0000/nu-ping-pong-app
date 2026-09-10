"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PlayerPicker, type PickedPlayer, PICKER_COLUMNS } from "@/components/PlayerPicker";
import { TierBadge } from "@/components/TierBadge";
import { doublesRatingChange, doublesRatingNote, teamRating } from "@/lib/elo";
import { firstName } from "@/lib/names";
import { reportDoublesMatch, startLiveDoubles } from "@/app/actions";

type Me = {
  id: string;
  doubles_rating: number;
  doubles_played: number;
};

/**
 * Set up a doubles match, then either score it live or log a finished one.
 *
 * The four players come first and the choice of how to record it comes
 * second, because that's the order it happens at the table: you know who
 * you're playing with before you know whether anyone's holding a phone.
 */
export function DoublesForm() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // Set when matchmaking just formed a four, so the page can say so and link
  // to the group chat.
  const matched = searchParams.get("matched") === "1";
  const channelId = searchParams.get("channel");

  const [me, setMe] = useState<Me | null>(null);
  const [partner, setPartner] = useState<PickedPlayer | null>(null);
  const [opp1, setOpp1] = useState<PickedPlayer | null>(null);
  const [opp2, setOpp2] = useState<PickedPlayer | null>(null);

  const [how, setHow] = useState<"live" | "log">("live");
  const [matchKind, setMatchKind] = useState<"ranked" | "casual">("ranked");
  const [format, setFormat] = useState<1 | 3 | 5>(3);
  const [games, setGames] = useState<{ a: string; b: string }[]>([
    { a: "", b: "" },
    { a: "", b: "" },
    { a: "", b: "" },
  ]);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return router.push("/login");
      const { data } = await supabase
        .from("profiles")
        .select("id, doubles_rating, doubles_wins, doubles_losses")
        .eq("id", user.id)
        .single();
      setMe({
        id: user.id,
        doubles_rating: data?.doubles_rating ?? 1000,
        doubles_played: (data?.doubles_wins ?? 0) + (data?.doubles_losses ?? 0),
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Matchmaking hands over three ids, so the four are already decided by the
  // time you land here — one query, then the only thing left is to play.
  useEffect(() => {
    const ids = ["partner", "opp1", "opp2"].map((k) => searchParams.get(k));
    if (ids.some((id) => !id)) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select(PICKER_COLUMNS)
        .in("id", ids as string[]);
      if (!data) return;
      const find = (id: string | null) => data.find((p) => p.id === id) ?? null;
      setPartner(find(ids[0]));
      setOpp1(find(ids[1]));
      setOpp2(find(ids[2]));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const chosen = [me?.id, partner?.id, opp1?.id, opp2?.id].filter(Boolean) as string[];
  const ready = !!(partner && opp1 && opp2);

  function selectFormat(n: 1 | 3 | 5) {
    setFormat(n);
    setGames((prev) => Array.from({ length: n }, (_, i) => prev[i] ?? { a: "", b: "" }));
  }

  const filledGames = games
    .map((g) => ({ a: Number(g.a), b: Number(g.b) }))
    .filter((g) => g.a !== 0 || g.b !== 0)
    .filter((g) => !Number.isNaN(g.a) && !Number.isNaN(g.b) && g.a !== g.b);
  const gamesWonUs = filledGames.filter((g) => g.a > g.b).length;
  const gamesWonThem = filledGames.filter((g) => g.b > g.a).length;
  const hasResult = filledGames.length > 0 && gamesWonUs !== gamesWonThem;

  // What the confirmed result would do to your doubles rating. Mirrors
  // confirm_doubles_match, and the two are tested against each other.
  const preview =
    ready && hasResult && me && matchKind === "ranked"
      ? doublesRatingChange({
          myRating: me.doubles_rating,
          myMatchesPlayed: me.doubles_played,
          partnerRating: partner.doubles_rating,
          opponentRatings: [opp1.doubles_rating, opp2.doubles_rating],
          games: filledGames,
          side: "a",
        })
      : null;
  const note =
    ready && hasResult && me && matchKind === "ranked"
      ? doublesRatingNote({
          myMatchesPlayed: me.doubles_played,
          myRating: me.doubles_rating,
          partnerRating: partner.doubles_rating,
          opponentRatings: [opp1.doubles_rating, opp2.doubles_rating],
          games: filledGames,
          side: "a",
        })
      : null;

  function updateGame(i: number, side: "a" | "b", value: string) {
    setGames((prev) => prev.map((g, idx) => (idx === i ? { ...g, [side]: value } : g)));
  }

  function submitLog(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!ready) {
      setFormError("Pick a partner and both opponents first.");
      return;
    }
    if (!hasResult) {
      setFormError("Enter final scores for at least one game with no tie.");
      return;
    }
    const fd = new FormData();
    fd.set("partnerId", partner.id);
    fd.set("opponent1", opp1.id);
    fd.set("opponent2", opp2.id);
    fd.set("games", JSON.stringify(filledGames));
    fd.set("matchKind", matchKind);
    startTransition(async () => {
      const result = await reportDoublesMatch(fd);
      if (result?.ok === false) setFormError(result.error);
      else router.push("/home");
    });
  }

  function startLive() {
    setFormError(null);
    if (!ready) {
      setFormError("Pick a partner and both opponents first.");
      return;
    }
    const fd = new FormData();
    fd.set("partnerId", partner.id);
    fd.set("opponent1", opp1.id);
    fd.set("opponent2", opp2.id);
    fd.set("bestOf", String(format));
    fd.set("matchKind", matchKind);
    startTransition(async () => {
      const result = await startLiveDoubles(fd);
      // A success redirects, so anything returned here is a failure.
      if (result?.ok === false) setFormError(result.error);
    });
  }

  const ourTeam = me && partner ? teamRating(me.doubles_rating, partner.doubles_rating) : null;
  const theirTeam = opp1 && opp2 ? teamRating(opp1.doubles_rating, opp2.doubles_rating) : null;

  return (
    <div className="mx-auto max-w-md px-6 pb-10">
      {matched && (
        <div className="mt-5 rounded-2xl border-2 border-nu bg-nu-wash p-4">
          <div className="text-sm font-bold">You&rsquo;ve got a four</div>
          <p className="mt-1 text-[13px] leading-relaxed text-text-dim">
            Teams are picked and filled in below — strongest with weakest, so the game stays
            close. Start the scoreboard when you get to a table.
          </p>
          {channelId && (
            <Link
              href={`/chats/${channelId}`}
              className="mt-3 block rounded-xl border border-border-strong bg-bg py-2.5 text-center text-[13px] font-bold"
            >
              Open the group chat
            </Link>
          )}
        </div>
      )}

      <div className="panel mt-5 rounded-2xl p-4">
        <div className="text-sm font-bold">Your side</div>
        <div className="mt-3 flex flex-col gap-3">
          <div className="rounded-xl border border-nu-line bg-nu-wash px-3 py-2.5 text-sm font-bold">
            You
            {me && (
              <span className="ml-2 font-display text-text-dim">
                {me.doubles_rating.toLocaleString()}
              </span>
            )}
          </div>
          <PlayerPicker
            label="Your partner"
            value={partner}
            onChange={setPartner}
            exclude={chosen.filter((id) => id !== partner?.id)}
            showDoubles
          />
        </div>
      </div>

      <div className="panel mt-3 rounded-2xl p-4">
        <div className="text-sm font-bold">The other team</div>
        <div className="mt-3 flex flex-col gap-3">
          <PlayerPicker
            label="Opponent"
            value={opp1}
            onChange={setOpp1}
            exclude={chosen.filter((id) => id !== opp1?.id)}
            showDoubles
          />
          <PlayerPicker
            label="Their partner"
            value={opp2}
            onChange={setOpp2}
            exclude={chosen.filter((id) => id !== opp2?.id)}
            showDoubles
          />
        </div>
      </div>

      {ourTeam != null && theirTeam != null && (
        <div className="panel mt-3 flex items-center justify-between rounded-2xl px-4 py-3.5">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-text-faint">
              Your pair
            </div>
            <div className="font-display text-lg font-bold">{Math.round(ourTeam)}</div>
          </div>
          <span className="text-xs font-bold text-text-faint">v</span>
          <div className="text-right">
            <div className="text-[11px] font-bold uppercase tracking-wider text-text-faint">
              Their pair
            </div>
            <div className="font-display text-lg font-bold">{Math.round(theirTeam)}</div>
          </div>
        </div>
      )}

      <div className="mt-5 flex gap-1.5 rounded-[11px] bg-surface p-1">
        {[
          { value: "ranked" as const, label: "Ranked" },
          { value: "casual" as const, label: "Casual" },
        ].map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setMatchKind(option.value)}
            className={`flex-1 rounded-[9px] py-2.5 text-center text-[13px] font-bold ${
              matchKind === option.value ? "bg-surface-2 text-text" : "text-text-faint"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-text-faint">
        {matchKind === "ranked"
          ? "Moves everyone's doubles rating. Singles ratings never change."
          : "Recorded, but nobody's rating moves."}
      </p>

      <div className="mt-5 flex gap-1.5 rounded-[11px] bg-surface p-1">
        {[
          { value: "live" as const, label: "Score it live" },
          { value: "log" as const, label: "Log a finished match" },
        ].map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setHow(option.value)}
            className={`flex-1 rounded-[9px] py-2.5 text-center text-[13px] font-bold ${
              how === option.value ? "bg-surface-2 text-text" : "text-text-faint"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {how === "live" ? (
        <div className="mt-4">
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-text-faint">
            Format
          </div>
          <div className="flex gap-1.5 rounded-[11px] bg-surface p-1">
            {([1, 3, 5] as const).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => selectFormat(n)}
                className={`flex-1 rounded-[9px] py-2.5 text-center text-[13px] font-bold ${
                  format === n ? "bg-surface-2 text-text" : "text-text-faint"
                }`}
              >
                {n === 1 ? "One game" : `Best of ${n}`}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={startLive}
            disabled={isPending || !ready}
            className="mt-4 w-full rounded-xl bg-nu py-3.5 text-sm font-bold text-white transition-colors hover:bg-nu-deep disabled:opacity-50"
          >
            {isPending ? "Starting…" : "Start the scoreboard"}
          </button>
          <p className="mt-2 text-center text-xs text-text-faint">
            Anyone at the table can take over scoring, and the club can watch.
          </p>
        </div>
      ) : (
        <form onSubmit={submitLog} className="mt-4">
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-text-faint">
            Format
          </div>
          <div className="flex gap-1.5 rounded-[11px] bg-surface p-1">
            {([1, 3, 5] as const).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => selectFormat(n)}
                className={`flex-1 rounded-[9px] py-2.5 text-center text-[13px] font-bold ${
                  format === n ? "bg-surface-2 text-text" : "text-text-faint"
                }`}
              >
                {n === 1 ? "One game" : `Best of ${n}`}
              </button>
            ))}
          </div>

          <div className="mt-4 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-text-faint">
              <span className="w-12">Game</span>
              <span className="flex-1 text-center">
                You{partner ? ` & ${firstName(partner)}` : ""}
              </span>
              <span className="flex-1 text-center">
                {opp1 ? firstName(opp1) : "Them"}
                {opp2 ? ` & ${firstName(opp2)}` : ""}
              </span>
            </div>
            {games.map((g, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-12 text-sm font-bold text-text-dim">{i + 1}</span>
                <input
                  inputMode="numeric"
                  value={g.a}
                  onChange={(e) => updateGame(i, "a", e.target.value)}
                  className="flex-1 rounded-xl border border-border-strong bg-bg py-3 text-center font-display text-lg font-bold outline-none focus:border-nu"
                />
                <input
                  inputMode="numeric"
                  value={g.b}
                  onChange={(e) => updateGame(i, "b", e.target.value)}
                  className="flex-1 rounded-xl border border-border-strong bg-bg py-3 text-center font-display text-lg font-bold outline-none focus:border-nu"
                />
              </div>
            ))}
          </div>

          {hasResult && (
            <div className="panel mt-4 rounded-2xl p-4">
              <div className="text-sm font-bold">
                Your team {gamesWonUs > gamesWonThem ? "won" : "lost"}, {gamesWonUs}–
                {gamesWonThem}
              </div>
              {preview != null && me ? (
                <>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="font-display text-2xl font-bold">
                      {(me.doubles_rating + preview).toLocaleString()}
                    </span>
                    <span
                      className={`font-display text-sm font-bold ${
                        preview > 0 ? "text-live" : "text-nu-accent"
                      }`}
                    >
                      {preview > 0 ? "+" : ""}
                      {preview}
                    </span>
                    <TierBadge rating={me.doubles_rating + preview} size="sm" short />
                  </div>
                  {note && <p className="mt-2 text-xs text-text-dim">{note}</p>}
                </>
              ) : (
                <p className="mt-1 text-xs text-text-dim">Casual — no rating moves.</p>
              )}
            </div>
          )}

          {formError && (
            <p className="mt-3 rounded-xl border border-nu-line bg-nu-wash px-3 py-2.5 text-xs font-semibold">
              {formError}
            </p>
          )}

          <button
            type="submit"
            disabled={isPending || !ready}
            className="mt-4 w-full rounded-xl bg-nu py-3.5 text-sm font-bold text-white transition-colors hover:bg-nu-deep disabled:opacity-50"
          >
            {isPending ? "Sending…" : "Send to the other team"}
          </button>
          <p className="mt-2 text-center text-xs text-text-faint">
            Both teams have to agree, so one of them confirms it before anything moves.
          </p>
        </form>
      )}

      {how === "live" && formError && (
        <p className="mt-3 rounded-xl border border-nu-line bg-nu-wash px-3 py-2.5 text-xs font-semibold">
          {formError}
        </p>
      )}
    </div>
  );
}
