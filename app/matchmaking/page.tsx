import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { Nav } from "@/components/Nav";
import { TierBadge } from "@/components/TierBadge";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { Avatar } from "@/components/Avatar";
import { CardSkeleton, NavSkeleton, RowsSkeleton } from "@/components/Skeletons";
import { MatchmakingForm } from "./MatchmakingForm";
import { displayName } from "@/lib/names";
import { playStyleLabel } from "@/lib/halls";
import {
  cancelChallenge,
  leaveQueue,
  pairWithPlayer,
  respondToChallenge,
  sendChallenge,
} from "@/app/actions";

const RANGE = 150;

type Params = Promise<{ hall?: string; style?: string; searched?: string }>;

type PlayerRef = {
  id?: string;
  username: string;
  full_name: string | null;
  rating: number;
};

// No data access in the page function, so this frame is prerendered and shows
// the moment you click through. Each section streams in on its own.
export default function MatchmakingPage({ searchParams }: { searchParams: Params }) {
  return (
    <div className="min-h-screen bg-bg">
      <Suspense fallback={<NavSkeleton />}>
        <Nav />
      </Suspense>
      <div className="mx-auto max-w-md px-6 py-10">
        <h1 className="font-display text-3xl font-bold">Find a Match</h1>
        <p className="mt-1 text-sm text-text-dim">
          Say which hall you&rsquo;re in and we&rsquo;ll pair you with someone there.
        </p>

        <Suspense fallback={<CardSkeleton className="mt-5" />}>
          <RatingCard />
        </Suspense>

        <Suspense fallback={<CardSkeleton className="mt-4" />}>
          <MatchmakingPanel searchParams={searchParams} />
        </Suspense>

        <Suspense fallback={null}>
          <Challenges />
        </Suspense>

        <Section title="Suggested Opponents">
          <Suspense fallback={<RowsSkeleton rows={3} />}>
            <Suggested />
          </Suspense>
        </Section>

        <Link
          href="/leaderboard"
          className="mt-7 block rounded-xl border border-border-strong py-3.5 text-center text-sm font-bold text-text-dim"
        >
          Browse Full Leaderboard
        </Link>
      </div>
    </div>
  );
}

async function requireMe() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const supabase = await createClient();
  const { data: me } = await supabase
    .from("profiles")
    .select("id, username, full_name, rating")
    .eq("id", user.id)
    .single();
  return { user, supabase, me, myRating: me?.rating ?? 1000 };
}

async function RatingCard() {
  const { myRating } = await requireMe();
  const low = myRating - RANGE;
  const high = myRating + RANGE;

  return (
    <div className="mt-5 rounded-2xl border border-border bg-surface p-4">
      <div className="text-xs font-bold text-text-faint">YOUR RATING</div>
      <div className="mt-0.5 font-display text-2xl font-bold">
        {myRating.toLocaleString()} <TierBadge rating={myRating} className="ml-1 align-middle" />
      </div>
      <div className="mt-3.5 flex justify-between text-xs font-bold text-text-faint">
        <span>Matching range</span>
        <span className="text-text">
          {low.toLocaleString()} – {high.toLocaleString()}
        </span>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-surface-2">
        <div className="h-full w-full rounded-full bg-ink-bright" />
      </div>
    </div>
  );
}

async function MatchmakingPanel({ searchParams }: { searchParams: Params }) {
  const [{ user, supabase }, { hall, style, searched }] = await Promise.all([
    requireMe(),
    searchParams,
  ]);

  const { data: myQueueEntry } = await supabase
    .from("active_queue")
    .select("location, note, play_style")
    .eq("user_id", user.id)
    .maybeSingle();

  const myHall = myQueueEntry?.location ?? hall ?? null;

  // Only look up who's elsewhere once a search has actually come up empty —
  // there's nothing to show before that.
  const { data: elsewhere } = searched
    ? await supabase.rpc("queue_elsewhere", { p_hall: myHall })
    : { data: null };

  return (
    <div className="mt-4 rounded-2xl border border-ink bg-ink-dim p-4">
      {searched && myHall ? (
        <>
          <div className="text-sm font-bold">Nobody&rsquo;s at {myHall} right now</div>
          <p className="mt-1 text-[13px] leading-relaxed text-text-dim">
            You&rsquo;re listed there
            {playStyleLabel(myQueueEntry?.play_style ?? style)
              ? ` for ${playStyleLabel(myQueueEntry?.play_style ?? style)!.toLowerCase()}`
              : ""}
            , so anyone who searches {myHall} in the next couple of hours gets paired with you.
          </p>

          {elsewhere && elsewhere.length > 0 ? (
            <div className="mt-4">
              <div className="mb-2 text-xs font-bold text-text-faint">
                PLAYING ELSEWHERE — GO JOIN THEM
              </div>
              <div className="flex flex-col gap-2.5">
                {elsewhere.map((p) => (
                  <Row
                    key={p.user_id}
                    player={p}
                    note={
                      [p.location, playStyleLabel(p.play_style), p.note]
                        .filter(Boolean)
                        .join(" · ") || null
                    }
                  >
                    <ActionForm action={pairWithPlayer} hidden={{ opponentId: p.user_id }} quiet>
                      <SubmitButton
                        pendingLabel="…"
                        className="whitespace-nowrap rounded-[9px] bg-ink px-3.5 py-2.5 text-xs font-bold text-white"
                      >
                        Join
                      </SubmitButton>
                    </ActionForm>
                  </Row>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-3 rounded-xl border border-border bg-surface p-3 text-[13px] text-text-dim">
              Nobody&rsquo;s waiting in any other hall either. Challenge someone below and
              they&rsquo;ll get a chat when they accept.
            </p>
          )}

          <div className="mt-3 flex flex-col gap-2">
            <MatchmakingForm defaultHall={myHall} defaultStyle={style} label="Search again" />
            <ActionForm action={leaveQueue} quiet>
              <SubmitButton
                pendingLabel="Leaving…"
                className="w-full rounded-xl border border-border-strong py-3 text-[13px] font-bold text-text-dim"
              >
                Take me off the list
              </SubmitButton>
            </ActionForm>
          </div>
        </>
      ) : myQueueEntry ? (
        <>
          <div className="text-sm font-bold">You&rsquo;re listed at {myQueueEntry.location}</div>
          <p className="mt-1 text-[13px] leading-relaxed text-text-dim">
            Anyone searching that hall gets paired with you. Search again to check for new
            arrivals.
          </p>
          <div className="mt-3.5 flex flex-col gap-2">
            <MatchmakingForm
              defaultHall={myQueueEntry.location}
              defaultStyle={myQueueEntry.play_style}
              label="Check for someone now"
            />
            <ActionForm action={leaveQueue} quiet>
              <SubmitButton
                pendingLabel="Leaving…"
                className="w-full rounded-xl border border-border-strong py-3 text-[13px] font-bold text-text-dim"
              >
                Take me off the list
              </SubmitButton>
            </ActionForm>
          </div>
        </>
      ) : (
        <>
          <div className="text-sm font-bold">Ready to play?</div>
          <p className="mt-1 text-[13px] leading-relaxed text-text-dim">
            Tell us your hall and we&rsquo;ll pair you with whoever&rsquo;s there. If it&rsquo;s
            empty we&rsquo;ll list you and show you who&rsquo;s playing elsewhere.
          </p>
          <div className="mt-3.5">
            <MatchmakingForm label="Matchmaking" />
          </div>
        </>
      )}
    </div>
  );
}

async function Challenges() {
  const { user, supabase } = await requireMe();

  const [{ data: incoming }, { data: outgoing }] = await Promise.all([
    supabase
      .from("challenges")
      .select(
        "id, note, created_at, challenger, profiles!challenges_challenger_fkey(username, full_name, rating)"
      )
      .eq("opponent", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    supabase
      .from("challenges")
      .select(
        "id, note, created_at, opponent, profiles!challenges_opponent_fkey(username, full_name, rating)"
      )
      .eq("challenger", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
  ]);

  return (
    <>
      {incoming && incoming.length > 0 && (
        <Section title={`Challenges for you (${incoming.length})`}>
          {incoming.map((c) => (
            <Row key={c.id} player={c.profiles as PlayerRef | null} note={c.note}>
              <div className="flex gap-2">
                <ActionForm
                  action={respondToChallenge}
                  hidden={{ challengeId: c.id, accept: "true" }}
                  quiet
                >
                  <SubmitButton
                    pendingLabel="…"
                    className="rounded-[9px] bg-ink px-3.5 py-2.5 text-xs font-bold text-white"
                  >
                    Accept
                  </SubmitButton>
                </ActionForm>
                <ActionForm
                  action={respondToChallenge}
                  hidden={{ challengeId: c.id, accept: "false" }}
                  quiet
                >
                  <SubmitButton
                    pendingLabel="…"
                    className="rounded-[9px] border border-border-strong px-3 py-2.5 text-xs font-bold text-text-dim"
                  >
                    Decline
                  </SubmitButton>
                </ActionForm>
              </div>
            </Row>
          ))}
        </Section>
      )}

      {outgoing && outgoing.length > 0 && (
        <Section title="Waiting on a reply">
          {outgoing.map((c) => (
            <Row key={c.id} player={c.profiles as PlayerRef | null} note={c.note}>
              <ActionForm action={cancelChallenge} hidden={{ challengeId: c.id }} quiet>
                <SubmitButton
                  pendingLabel="…"
                  className="rounded-[9px] border border-border-strong px-3 py-2.5 text-xs font-bold text-text-dim"
                >
                  Withdraw
                </SubmitButton>
              </ActionForm>
            </Row>
          ))}
        </Section>
      )}
    </>
  );
}

async function Suggested() {
  const { user, supabase, myRating } = await requireMe();

  const { data: candidates } = await supabase
    .from("profiles")
    .select("id, username, full_name, rating")
    .neq("id", user.id)
    .gte("rating", myRating - RANGE)
    .lte("rating", myRating + RANGE)
    .order("rating", { ascending: false })
    .limit(24);

  const suggested = (candidates ?? [])
    .sort((a, b) => Math.abs(a.rating - myRating) - Math.abs(b.rating - myRating))
    .slice(0, 12);

  if (suggested.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-surface p-4 text-sm text-text-dim">
        No one else is rated near you yet — check back once more players join, or{" "}
        <Link href="/leaderboard" className="font-bold underline">
          browse the whole ladder
        </Link>
        .
      </p>
    );
  }

  return (
    <>
      {suggested.map((p) => (
        <Row key={p.id} player={p}>
          <ActionForm action={sendChallenge} hidden={{ opponentId: p.id }} quiet>
            <SubmitButton
              pendingLabel="Sending…"
              className="whitespace-nowrap rounded-[9px] border border-ink-bright bg-ink-dim px-4 py-2.5 text-xs font-bold"
            >
              Challenge
            </SubmitButton>
          </ActionForm>
        </Row>
      ))}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-7">
      <div className="mb-3 text-base font-bold">{title}</div>
      <div className="flex flex-col gap-2.5">{children}</div>
    </div>
  );
}

function Row({
  player,
  note,
  children,
}: {
  player: PlayerRef | null;
  note?: string | null;
  children: React.ReactNode;
}) {
  const name = player ? displayName(player) : "Unknown player";
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-3.5 py-3">
      <Avatar player={player ?? { username: "?", full_name: null }} size={42} />
      <div className="min-w-0 flex-1">
        {player?.username ? (
          <Link
            href={`/profile/${player.username}`}
            className="truncate text-sm font-bold hover:underline"
          >
            {name}
          </Link>
        ) : (
          <div className="truncate text-sm font-bold">{name}</div>
        )}
        <div className="font-display text-[15px] font-bold">
          {player ? player.rating.toLocaleString() : "—"}
        </div>
        {note && <div className="mt-0.5 truncate text-xs text-text-dim">{note}</div>}
      </div>
      {children}
    </div>
  );
}
