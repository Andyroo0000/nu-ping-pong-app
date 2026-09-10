import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { Nav } from "@/components/Nav";
import { BackdropArt } from "@/components/BackdropArt";
import { BottomTabs } from "@/components/BottomTabs";
import { TierProgress, TierBadge } from "@/components/TierBadge";
import { Avatar } from "@/components/Avatar";
import { NetRule } from "@/components/NetRule";
import { PageHeader } from "@/components/PageHeader";
import { PaddleIcon } from "@/components/PaddleIcon";
import { InstallPrompt } from "@/components/InstallPrompt";
import { ProfileNudge } from "@/components/ProfileNudge";
import { LiveNow } from "@/components/LiveNow";
import { WelcomeGate } from "@/components/WelcomeGate";
import { HowToPlay } from "@/components/HowToPlay";
import { OnlineAvatarWrapper, OnlineCount } from "@/components/OnlineDot";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { CardSkeleton, NavSkeleton, RowsSkeleton } from "@/components/Skeletons";
import { confirmMatch, declineMatch, pairWithPlayer, respondToChallenge } from "@/app/actions";
import { displayName, firstName } from "@/lib/names";
import { playStyleLabel } from "@/lib/halls";

export default function HomePage() {
  return (
    <div className="pb-tabs relative isolate min-h-screen bg-bg">
      <BackdropArt />
      <Suspense fallback={<NavSkeleton />}>
        <Nav />
      </Suspense>

      <Suspense fallback={null}>
        <WelcomeGate />
      </Suspense>

      <Suspense fallback={<div className="page-header h-[132px]" />}>
        <HomeHeader />
      </Suspense>

      <div className="mx-auto max-w-md px-6 pb-8">
        <Suspense fallback={<CardSkeleton className="mt-5" />}>
          <Greeting />
        </Suspense>

        <InstallPrompt />

        <Suspense fallback={null}>
          <ProfileNudge />
        </Suspense>

        {/* A game in progress outranks everything — you're at the table. */}
        <Suspense fallback={null}>
          <LiveNow />
        </Suspense>

        {/* Then anything waiting on this player. */}
        <Suspense fallback={null}>
          <NeedsYou />
        </Suspense>

        <Suspense fallback={null}>
          <AtTheTables />
        </Suspense>

        <Suspense fallback={<RowsSkeleton rows={3} />}>
          <LadderPeek />
        </Suspense>

        <NetRule className="mt-8" />

        <div className="mt-8 grid grid-cols-2 gap-2.5">
          <Link
            href="/log-match"
            className="rounded-xl border border-border-strong py-3.5 text-center text-sm font-bold"
          >
            Log a match
          </Link>
          <Link
            href="/members"
            className="rounded-xl border border-border-strong py-3.5 text-center text-sm font-bold"
          >
            Browse the club
          </Link>
        </div>

        <div className="mt-2.5 grid grid-cols-2 gap-2.5">
          <HowToPlay className="rounded-xl border border-border py-3 text-center text-[13px] font-bold text-text-dim" />
          <Link
            href="/feedback"
            className="rounded-xl border border-border py-3 text-center text-[13px] font-bold text-text-dim"
          >
            Suggest something
          </Link>
        </div>
      </div>

      <Suspense fallback={null}>
        <BottomTabs />
      </Suspense>
    </div>
  );
}

async function me() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, full_name, rating, wins, losses, avatar_path")
    .eq("id", user.id)
    .single();
  return { user, supabase, profile };
}

async function HomeHeader() {
  const { profile } = await me();
  const record = profile ? profile.wins + profile.losses : 0;

  return (
    <PageHeader
      eyebrow="Northeastern Club Table Tennis"
      title={profile ? `Hey, ${firstName(profile)}` : "Hey"}
      subtitle={
        record === 0
          ? "No matches logged yet — your first one sets your rating moving."
          : `${profile?.wins}W–${profile?.losses}L across ${record} ranked ${
              record === 1 ? "match" : "matches"
            }.`
      }
      trailing={<OnlineCount className="text-white/70" />}
    />
  );
}

async function Greeting() {
  const { profile } = await me();

  return (
    <>
      {profile && (
        <TierProgress
          rating={profile.rating}
          className="panel mt-5 rounded-2xl p-4"
        />
      )}

      <Link
        href="/matchmaking"
        className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-nu py-4 text-[15px] font-bold text-white transition-colors hover:bg-nu-deep"
      >
        <PaddleIcon size={19} color="#fff" />
        Find a match
      </Link>
    </>
  );
}

/** Challenges to answer and results to confirm — the only truly urgent things. */
async function NeedsYou() {
  const { user, supabase } = await me();

  const [{ data: challenges }, { data: pending }] = await Promise.all([
    supabase
      .from("challenges")
      .select("id, note, profiles!challenges_challenger_fkey(username, full_name, rating, avatar_path)")
      .eq("opponent", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("matches")
      .select("id, games_won_a, games_won_b, is_ranked, profiles_a:profiles!player_a(full_name, username, avatar_path)")
      .eq("player_b", user.id)
      .eq("status", "pending")
      .order("played_at", { ascending: false })
      .limit(5),
  ]);

  const total = (challenges?.length ?? 0) + (pending?.length ?? 0);
  if (total === 0) return null;

  return (
    <div className="mt-7">
      <div className="mb-3 flex items-center gap-2 text-base font-bold">
        Needs you
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-nu px-1.5 text-[11px] font-bold text-white">
          {total}
        </span>
      </div>

      <div className="flex flex-col gap-2.5">
        {challenges?.map((c) => {
          const player = c.profiles;
          return (
            <div
              key={c.id}
              className="rounded-2xl border border-nu-line bg-nu-wash p-3.5"
            >
              <div className="flex items-center gap-3">
                <Avatar player={player ?? { username: "?", full_name: null }} size={38} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold">
                    {player ? displayName(player) : "A player"} challenged you
                  </div>
                  {c.note && (
                    <div className="mt-0.5 truncate text-xs text-text-dim">{c.note}</div>
                  )}
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <ActionForm
                  action={respondToChallenge}
                  hidden={{ challengeId: c.id, accept: "true" }}
                  className="flex-1"
                  quiet
                >
                  <SubmitButton
                    pendingLabel="…"
                    className="w-full rounded-lg bg-nu py-2.5 text-[13px] font-bold text-white"
                  >
                    Accept
                  </SubmitButton>
                </ActionForm>
                <ActionForm
                  action={respondToChallenge}
                  hidden={{ challengeId: c.id, accept: "false" }}
                  className="flex-1"
                  quiet
                >
                  <SubmitButton
                    pendingLabel="…"
                    className="w-full rounded-lg border border-border-strong py-2.5 text-[13px] font-bold text-text-dim"
                  >
                    Decline
                  </SubmitButton>
                </ActionForm>
              </div>
            </div>
          );
        })}

        {pending?.map((m) => (
          <div key={m.id} className="panel rounded-2xl p-3.5">
            <div className="flex items-center gap-3">
              <Avatar
                player={m.profiles_a ?? { username: "?", full_name: null }}
                size={38}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold">
                  {m.profiles_a ? displayName(m.profiles_a) : "A player"} reported{" "}
                  {m.games_won_a}–{m.games_won_b}
                </div>
                <div className="mt-0.5 text-xs text-text-dim">
                  {m.is_ranked ? "Ranked — confirming moves both ratings." : "Casual — no rating change."}
                </div>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <form action={confirmMatch} className="flex-1">
                <input type="hidden" name="matchId" value={m.id} />
                <button className="w-full rounded-lg bg-nu py-2.5 text-[13px] font-bold text-white">
                  Confirm
                </button>
              </form>
              <form action={declineMatch} className="flex-1">
                <input type="hidden" name="matchId" value={m.id} />
                <button className="w-full rounded-lg border border-border-strong py-2.5 text-[13px] font-bold text-text-dim">
                  Dispute
                </button>
              </form>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Who's waiting to play right now. */
async function AtTheTables() {
  const { supabase } = await me();

  const { data: queue } = await supabase.rpc("queue_elsewhere", { p_hall: null });
  const waiting = (queue ?? []).slice(0, 4);
  if (waiting.length === 0) return null;

  return (
    <div className="mt-7">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <span className="text-base font-bold">At the tables now</span>
        <Link href="/matchmaking" className="text-xs font-bold text-nu-accent underline">
          See all
        </Link>
      </div>
      <div className="flex flex-col gap-2.5">
        {waiting.map((p) => (
          <div
            key={p.user_id}
            className="panel flex items-center gap-3 rounded-2xl px-3.5 py-3"
          >
            <OnlineAvatarWrapper userId={p.user_id}>
              <Avatar player={p} size={40} />
            </OnlineAvatarWrapper>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold">{displayName(p)}</div>
              <div className="mt-0.5 truncate text-xs text-text-dim">
                {[p.location, playStyleLabel(p.play_style)].filter(Boolean).join(" · ")}
              </div>
            </div>
            <ActionForm action={pairWithPlayer} hidden={{ opponentId: p.user_id }} quiet>
              <SubmitButton
                pendingLabel="…"
                className="whitespace-nowrap rounded-[9px] bg-nu px-3.5 py-2.5 text-xs font-bold text-white"
              >
                Join
              </SubmitButton>
            </ActionForm>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Top of the ladder plus where you sit. */
async function LadderPeek() {
  const { user, supabase } = await me();

  const { data: players } = await supabase
    .from("profiles")
    .select("id, username, full_name, rating, avatar_path")
    .order("rating", { ascending: false })
    .limit(200);

  const ranked = players ?? [];
  if (ranked.length === 0) return null;

  const myIndex = ranked.findIndex((p) => p.id === user.id);
  const top = ranked.slice(0, 3);
  // Show yourself too when you're outside the top three.
  const showMine = myIndex >= 3;

  return (
    <div className="mt-7">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <span className="text-base font-bold">Top of the ladder</span>
        <Link href="/leaderboard" className="text-xs font-bold text-nu-accent underline">
          Full ladder
        </Link>
      </div>
      <div className="flex flex-col">
        {top.map((p, i) => (
          <Row key={p.id} rank={i + 1} player={p} isMe={p.id === user.id} />
        ))}
        {showMine && (
          <>
            <div className="py-1 text-center text-xs font-bold text-text-faint">···</div>
            <Row rank={myIndex + 1} player={ranked[myIndex]} isMe />
          </>
        )}
      </div>
    </div>
  );
}

function Row({
  rank,
  player,
  isMe,
}: {
  rank: number;
  player: { id: string; username: string; full_name: string | null; rating: number; avatar_path: string | null };
  isMe: boolean;
}) {
  return (
    <Link
      href={`/profile/${player.username}`}
      className={`flex items-center gap-3 border-b border-border py-2.5 last:border-0 ${
        isMe ? "-mx-3 rounded-xl border-b-0 bg-nu-wash px-3" : ""
      }`}
    >
      <span
        className={`w-5 shrink-0 font-display text-sm font-bold ${
          rank <= 3 ? "text-nu-accent" : "text-text-faint"
        }`}
      >
        {rank}
      </span>
      <Avatar player={player} size={34} />
      <span className="min-w-0 flex-1 truncate text-sm font-bold">{displayName(player)}</span>
      <TierBadge rating={player.rating} size="sm" short />
      <span className="shrink-0 font-display text-sm font-bold">
        {player.rating.toLocaleString()}
      </span>
    </Link>
  );
}
