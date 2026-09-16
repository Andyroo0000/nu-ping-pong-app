"use client";

import { useState, useTransition } from "react";
import { publishTournamentResults } from "@/app/actions";

/**
 * Send the finished tournament's results out for confirmation.
 *
 * Deliberately a separate, deliberate step rather than something that happens
 * as each score is keyed in: the organiser is at a table with a phone running
 * the whole bracket, and twenty players each getting a notification mid-event
 * is noise. One batch at the end is the thing people actually want.
 *
 * Safe to press twice — publish_tournament_results skips anything already
 * sent, so a late correction can be sent with another tap.
 */
export function PublishResults({
  tournamentId,
  publishedAt,
}: {
  tournamentId: string;
  publishedAt: string | null;
}) {
  const [isPending, startWork] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <div className="mt-5 rounded-2xl border-2 border-nu bg-nu-wash p-4">
      <div className="text-sm font-bold">
        {publishedAt ? "Results sent" : "Send the results out"}
      </div>
      <p className="mt-1 text-[13px] leading-relaxed text-text-dim">
        {publishedAt
          ? "Each player was asked to confirm their own results. Ratings move as they do. Send again if you've keyed in a correction since."
          : "Every player gets their results to confirm. Ratings only move once they do — and guest entries are skipped, since a typed-in name has no rating."}
      </p>

      {result && (
        <p
          className={`mt-3 rounded-xl border px-3 py-2.5 text-xs font-semibold ${
            result.ok ? "border-border-strong bg-bg" : "border-nu-line"
          }`}
        >
          {result.text}
        </p>
      )}

      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          setResult(null);
          const fd = new FormData();
          fd.set("tournamentId", tournamentId);
          startWork(async () => {
            const r = await publishTournamentResults(fd);
            setResult({
              ok: r.ok !== false,
              text: r.ok === false ? r.error : (r.message ?? "Sent."),
            });
          });
        }}
        className="mt-3 w-full rounded-xl bg-nu py-3 text-sm font-bold text-white transition-colors hover:bg-nu-deep disabled:opacity-60"
      >
        {isPending ? "Sending…" : publishedAt ? "Send again" : "Send for confirmation"}
      </button>
    </div>
  );
}
