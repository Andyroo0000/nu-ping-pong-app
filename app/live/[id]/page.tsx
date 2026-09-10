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

  const seats = [live.player_a, live.player_b, live.partner_a, live.partner_b].filter(
    Boolean
  ) as string[];

  const { data: players } = await supabase
    .from("profiles")
    .select("id, username, full_name, rating, avatar_path")
    .in("id", seats);

  const named = (id: string | null, fallback: string) => {
    const found = id ? players?.find((p) => p.id === id) : null;
    return found ? displayName(found) : fallback;
  };
  // A side of the table is one name or two — the scoreboard only ever needs
  // to say who it's crediting a point to.
  const sideName = (player: string, partner: string | null, fallback: string) =>
    partner ? `${named(player, fallback)} & ${named(partner, "Partner")}` : named(player, fallback);

  return (
    <Scoreboard
      liveId={live.id}
      viewerId={user.id}
      seatIds={seats}
      playerA={{
        id: live.player_a,
        name: sideName(live.player_a, live.partner_a, "Player A"),
      }}
      playerB={{
        id: live.player_b,
        name: sideName(live.player_b, live.partner_b, "Player B"),
      }}
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
