import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { Nav } from "@/components/Nav";
import { BackdropArt } from "@/components/BackdropArt";
import { BottomTabs } from "@/components/BottomTabs";
import { TierBadge } from "@/components/TierBadge";
import { PeopleTabs } from "@/components/PeopleTabs";
import { PageHeader } from "@/components/PageHeader";
import { OnlineAvatarWrapper } from "@/components/OnlineDot";
import { Avatar } from "@/components/Avatar";
import { LadderSkeleton, NavSkeleton } from "@/components/Skeletons";
import { displayName } from "@/lib/names";
import { PLACEMENT_MATCHES } from "@/lib/elo";

// `?mode=doubles` switches which ladder this is. A query parameter rather than
// a second route because it's the same page, the same layout and the same
// query with one column swapped — two routes would be two copies to keep in
// step for no gain.
type Params = Promise<{ mode?: string }>;

// The page function itself does no data access, so this whole frame is
// prerendered into a static shell and served the instant you click through.
// The ladder streams into the <Suspense> slot when the query comes back.
export default function LeaderboardPage({ searchParams }: { searchParams: Params }) {
  return (
    <div className="pb-tabs relative isolate min-h-screen bg-bg">
      <BackdropArt />
      <Suspense fallback={<NavSkeleton />}>
        <Nav />
      </Suspense>
      <PageHeader
        eyebrow="Northeastern Club Table Tennis"
        title="The Ladder"
        subtitle="Every ranked match moves you. Casual games leave it alone."
      />

      <div className="mx-auto max-w-2xl px-6 pb-10">
        <Suspense fallback={<div className="mt-4 h-[46px] rounded-[11px] bg-surface" />}>
          <PeopleTabs />
        </Suspense>
        <Suspense fallback={<LadderSkeleton />}>
          <Ladder searchParams={searchParams} />
        </Suspense>
      </div>

      <Suspense fallback={null}>
        <BottomTabs />
      </Suspense>
    </div>
  );
}

async function Ladder({ searchParams }: { searchParams: Params }) {
  const { mode } = await searchParams;
  const doubles = mode === "doubles";
  const supabase = await createClient();
  const [user, { data: players }] = await Promise.all([
    getCurrentUser(),
    supabase
      .from("profiles")
      .select(
        "id, username, full_name, rating, wins, losses, doubles_rating, doubles_wins, doubles_losses, avatar_path"
      )
      .order(doubles ? "doubles_rating" : "rating", { ascending: false }),
  ]);

  // One shape for both ladders, so everything below reads the same either way.
  const ranked = (players ?? []).map((p) => ({
    ...p,
    shownRating: doubles ? p.doubles_rating : p.rating,
    shownWins: doubles ? p.doubles_wins : p.wins,
    shownLosses: doubles ? p.doubles_losses : p.losses,
  }));
  const myIndex = ranked.findIndex((p) => p.id === user?.id);
  const me = myIndex >= 0 ? ranked[myIndex] : null;

  return (
    <>
      <p className="mt-1 text-sm font-semibold text-text-faint">
        {ranked.length} player{ranked.length === 1 ? "" : "s"}
        {doubles ? " on the doubles ladder" : " ranked"}
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
              <span className="mt-1 flex items-center gap-1.5">
                <TierBadge rating={p.shownRating} size="sm" short />
                {p.shownWins + p.shownLosses < PLACEMENT_MATCHES && (
                  <span
                    className="rounded-full border border-border-strong px-1.5 py-0.5 text-[10px] font-bold text-text-faint"
                    title="Still in placement matches — rating hasn't settled"
                  >
                    P
                  </span>
                )}
              </span>
            </div>
            <div className="shrink-0 text-right">
              <div
                className={`font-display text-base font-bold ${
                  p.id === user?.id ? "text-nu-accent" : ""
                }`}
              >
                {p.shownRating.toLocaleString()}
              </div>
              <div className="text-xs font-semibold text-text-faint">
                {p.shownWins}W–{p.shownLosses}L
              </div>
            </div>
          </Link>
        ))}
      </div>

      {user && me && (
        <div className="sticky bottom-6 mt-8 flex items-center gap-3 rounded-2xl border-2 border-nu bg-bg p-4 shadow-(--card-shadow)">
          <RankNumber rank={myIndex + 1} />
          <div className="flex-1 text-sm font-bold">
            Your {doubles ? "doubles " : ""}rank
          </div>
          <TierBadge rating={me.shownRating} size="sm" short />
          <div className="font-display text-base font-bold text-nu-accent">
            {me.shownRating.toLocaleString()}
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
