import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { Scoreboard } from "./Scoreboard";
import { displayName } from "@/lib/names";

type Params = Promise<{ id: string }>;

// The board itself is behind Suspense so the dark frame paints instantly —
// this is a page people open mid-rally.
export default function LivePage({ params }: { params: Params }) {
  return (
    <div className="page-header min-h-[100dvh]">
      <Suspense fallback={<div className="h-[100dvh]" />}>
        <Board params={params} />
      </Suspense>
    </div>
  );
}

async function Board({ params }: { params: Params }) {
  const [{ id }, user] = await Promise.all([params, getCurrentUser()]);
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data: live } = await supabase
    .from("live_matches")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!live) notFound();

  const { data: players } = await supabase
    .from("profiles")
    .select("id, username, full_name, rating, avatar_path")
    .in("id", [live.player_a, live.player_b]);

  const a = players?.find((p) => p.id === live.player_a) ?? null;
  const b = players?.find((p) => p.id === live.player_b) ?? null;

  return (
    <Scoreboard
      liveId={live.id}
      viewerId={user.id}
      playerA={{ id: live.player_a, name: a ? displayName(a) : "Player A" }}
      playerB={{ id: live.player_b, name: b ? displayName(b) : "Player B" }}
      initial={{
        bestOf: live.best_of,
        isRanked: live.is_ranked,
        games: live.games ?? [],
        rally: live.rally ?? [],
        pointsA: live.points_a,
        pointsB: live.points_b,
        scorer: live.scorer,
        status: live.status,
        matchId: live.match_id,
      }}
    />
  );
}
