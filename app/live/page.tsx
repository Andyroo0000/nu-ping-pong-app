import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { Nav } from "@/components/Nav";
import { BottomTabs } from "@/components/BottomTabs";
import { BackdropArt } from "@/components/BackdropArt";
import { PageHeader } from "@/components/PageHeader";
import { PlayTabs } from "@/components/PlayTabs";
import { Avatar } from "@/components/Avatar";
import { OnlineAvatarWrapper } from "@/components/OnlineDot";
import { NavSkeleton, RowsSkeleton } from "@/components/Skeletons";
import { LiveScores } from "./LiveScores";
import { gamesWon } from "@/lib/live";

export default function LivePage() {
  return (
    <div className="pb-tabs relative isolate min-h-screen bg-bg">
      <BackdropArt />
      <Suspense fallback={<NavSkeleton />}>
        <Nav />
      </Suspense>

      <PageHeader
        eyebrow="Active matches"
        title="Playing now"
        subtitle="Every match being scored right now. Tap one to follow the points as they happen."
      />

      <div className="mx-auto max-w-md px-6 pb-10">
        <PlayTabs />
        <Suspense fallback={<RowsSkeleton rows={2} />}>
          <Matches />
        </Suspense>
      </div>

      <Suspense fallback={null}>
        <BottomTabs />
      </Suspense>
    </div>
  );
}

async function Matches() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data: live } = await supabase.rpc("live_now");
  const matches = live ?? [];

  if (matches.length === 0) {
    return (
      <div className="mt-6 rounded-2xl border border-border bg-surface p-6 text-center">
        <p className="text-sm text-text-dim">
          Nothing being played right now. Start a scoreboard when you get to a table and the
          club can follow along.
        </p>
        <Link
          href="/matchmaking"
          className="mt-4 inline-block rounded-xl bg-nu px-5 py-3 text-sm font-bold text-white"
        >
          Find a match
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-5 flex flex-col gap-2.5">
      {matches.map((m) => {
        const won = gamesWon(m.games ?? []);
        const mine = m.player_a === user.id || m.player_b === user.id;
        return (
          <Link
            key={m.id}
            href={`/live/${m.id}`}
            className={`flex items-center gap-3 rounded-2xl p-3.5 ${
              mine ? "border-2 border-nu bg-nu-wash" : "panel border"
            }`}
          >
            <div className="flex shrink-0 -space-x-2">
              <OnlineAvatarWrapper userId={m.player_a}>
                <Avatar
                  player={{ username: m.name_a, full_name: m.name_a, avatar_path: m.avatar_a }}
                  size={34}
                />
              </OnlineAvatarWrapper>
              <Avatar
                player={{ username: m.name_b, full_name: m.name_b, avatar_path: m.avatar_b }}
                size={34}
                className="ring-2 ring-bg"
              />
            </div>

            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold">
                {m.name_a} <span className="text-text-faint">v</span> {m.name_b}
              </div>
              <div className="mt-0.5 text-xs font-semibold text-text-faint">
                {won.a}–{won.b} in games
                {m.best_of > 1 ? ` · best of ${m.best_of}` : " · one game"}
                {m.is_ranked ? "" : " · casual"}
              </div>
            </div>

            <div className="shrink-0 text-right">
              {/* Scores refresh live without reloading the page. */}
              <LiveScores
                liveId={m.id}
                initialA={m.points_a}
                initialB={m.points_b}
              />
              <div className="text-[10px] font-bold uppercase tracking-wider text-nu-accent">
                {mine ? "Resume" : "Watch"}
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
