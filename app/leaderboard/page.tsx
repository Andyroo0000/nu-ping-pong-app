import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { Nav } from "@/components/Nav";
import { BottomTabs } from "@/components/BottomTabs";
import { TierBadge } from "@/components/TierBadge";
import { PeopleTabs } from "@/components/PeopleTabs";
import { OnlineAvatarWrapper } from "@/components/OnlineDot";
import { Avatar } from "@/components/Avatar";
import { LadderSkeleton, NavSkeleton } from "@/components/Skeletons";
import { displayName } from "@/lib/names";

// The page function itself does no data access, so this whole frame is
// prerendered into a static shell and served the instant you click through.
// The ladder streams into the <Suspense> slot when the query comes back.
export default function LeaderboardPage() {
  return (
    <div className="pb-tabs min-h-screen bg-bg">
      <Suspense fallback={<NavSkeleton />}>
        <Nav />
      </Suspense>
      <div className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="font-display text-3xl font-bold">Leaderboard</h1>
        <PeopleTabs />
        <Suspense fallback={<LadderSkeleton />}>
          <Ladder />
        </Suspense>
      </div>

      <Suspense fallback={null}>
        <BottomTabs />
      </Suspense>
    </div>
  );
}

async function Ladder() {
  const supabase = await createClient();
  const [user, { data: players }] = await Promise.all([
    getCurrentUser(),
    supabase
      .from("profiles")
      .select("id, username, full_name, rating, wins, losses")
      .order("rating", { ascending: false }),
  ]);

  const ranked = players ?? [];
  const myIndex = ranked.findIndex((p) => p.id === user?.id);
  const me = myIndex >= 0 ? ranked[myIndex] : null;

  return (
    <>
      <p className="mt-1 text-sm font-semibold text-text-faint">
        {ranked.length} ranked player{ranked.length === 1 ? "" : "s"}
      </p>

      <div className="mt-8 flex flex-col">
        {ranked.length === 0 && (
          <p className="rounded-xl border border-border bg-surface p-6 text-sm text-text-dim">
            No players yet — be the first to join and log a match.
          </p>
        )}

        {ranked.map((p, i) => (
          <Link
            key={p.id}
            href={`/profile/${p.username}`}
            className={`flex items-center gap-4 border-b border-border py-3 transition-colors hover:bg-surface ${
              p.id === user?.id ? "-mx-3 rounded-xl border-b-0 bg-nu-wash px-3 ring-1 ring-nu-line" : ""
            }`}
          >
            <RankNumber rank={i + 1} />
            <OnlineAvatarWrapper userId={p.id}>
              <Avatar player={p} size={40} />
            </OnlineAvatarWrapper>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold">{displayName(p)}</div>
              <TierBadge rating={p.rating} size="sm" short className="mt-1" />
            </div>
            <div className="shrink-0 text-right">
              <div
                className={`font-display text-base font-bold ${
                  p.id === user?.id ? "text-nu-accent" : ""
                }`}
              >
                {p.rating.toLocaleString()}
              </div>
              <div className="text-xs font-semibold text-text-faint">
                {p.wins}W–{p.losses}L
              </div>
            </div>
          </Link>
        ))}
      </div>

      {user && me && (
        <div className="sticky bottom-6 mt-8 flex items-center gap-3 rounded-2xl border-2 border-nu bg-bg p-4 shadow-(--card-shadow)">
          <RankNumber rank={myIndex + 1} />
          <div className="flex-1 text-sm font-bold">Your rank</div>
          <TierBadge rating={me.rating} size="sm" short />
          <div className="font-display text-base font-bold text-nu-accent">
            {me.rating.toLocaleString()}
          </div>
        </div>
      )}
    </>
  );
}

/** Top three get the school colour; everyone else stays quiet. */
function RankNumber({ rank }: { rank: number }) {
  const podium = rank <= 3;
  return (
    <div
      className={`flex w-6 shrink-0 justify-center font-display text-sm font-bold ${
        podium ? "text-nu-accent" : "text-text-faint"
      }`}
    >
      {rank}
    </div>
  );
}
