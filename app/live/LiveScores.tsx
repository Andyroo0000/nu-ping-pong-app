"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * The point score on a row of the Playing-now list, kept current.
 *
 * Only the number is a Client Component: the rest of the list stays
 * server-rendered, so a page full of live matches costs one small subscription
 * per row rather than making the whole list client-side.
 */
export function LiveScores({
  liveId,
  initialA,
  initialB,
}: {
  liveId: string;
  initialA: number;
  initialB: number;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [score, setScore] = useState({ a: initialA, b: initialB });

  useEffect(() => {
    const channel = supabase
      .channel(`live-row:${liveId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "live_matches", filter: `id=eq.${liveId}` },
        (payload) => {
          const row = payload.new as { points_a: number; points_b: number };
          setScore({ a: row.points_a, b: row.points_b });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, liveId]);

  return (
    <div className="font-display text-xl font-bold tabular-nums">
      {score.a}–{score.b}
    </div>
  );
}
