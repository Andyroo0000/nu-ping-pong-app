import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { Nav } from "@/components/Nav";
import { TierBadge } from "@/components/TierBadge";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { Avatar } from "@/components/Avatar";
import { HallPicker } from "./HallPicker";
import { QuickMatchButtons } from "./QuickMatchButtons";
import { displayName, firstName } from "@/lib/names";
import { PLAY_STYLES, playStyleLabel } from "@/lib/halls";
import {
  cancelChallenge,
  findMatchNow,
  joinQueue,
  leaveQueue,
  respondToChallenge,
  sendChallenge,
} from "@/app/actions";

const RANGE = 150;

export const dynamic = "force-dynamic";

type PlayerRef = {
  id?: string;
  username: string;
  full_name: string | null;
  rating: number;
};

export default async function MatchmakingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  // The suggested-opponent range depends on your own rating, so that one
  // query has to wait. Everything else goes out at the same time — done
  // sequentially this page was six round trips deep.
  const { data: me } = await supabase
    .from("profiles")
    .select("id, username, full_name, rating")
    .eq("id", user.id)
    .single();

  const myRating = me?.rating ?? 1000;
  const low = myRating - RANGE;
  const high = myRating + RANGE;

  const [
    { data: myQueueEntry },
    { data: queue },
    { data: incoming },
    { data: outgoing },
    { data: candidates },
  ] = await Promise.all([
    supabase.from("queue_entries").select("*").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("queue_entries")
      .select(
        "user_id, location, note, play_style, joined_at, profiles(username, full_name, rating)"
      )
      .neq("user_id", user.id)
      .gt("expires_at", nowIso)
      .order("joined_at", { ascending: true })
      .limit(25),
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
    supabase
      .from("profiles")
      .select("id, username, full_name, rating")
      .neq("id", user.id)
      .gte("rating", low)
      .lte("rating", high)
      .order("rating", { ascending: false })
      .limit(24),
  ]);

  const inQueue = Boolean(myQueueEntry);
  const pendingOpponentIds = new Set([
    ...(incoming ?? []).map((c) => c.challenger),
    ...(outgoing ?? []).map((c) => c.opponent),
  ]);
  const queuedIds = new Set((queue ?? []).map((q) => q.user_id));

  // Closest rating first, and don't re-suggest people already handled above.
  const suggested = (candidates ?? [])
    .filter((p) => !pendingOpponentIds.has(p.id) && !queuedIds.has(p.id))
    .sort((a, b) => Math.abs(a.rating - myRating) - Math.abs(b.rating - myRating))
    .slice(0, 12);

  const waitingCount = queue?.length ?? 0;

  return (
    <div className="min-h-screen bg-bg">
      <Nav />
      <div className="mx-auto max-w-md px-6 py-10">
        <h1 className="font-display text-3xl font-bold">Find a Match</h1>
        <p className="mt-1 text-sm text-text-dim">
          Pair up with someone at your level — you&rsquo;ll get a chat to sort out the details.
        </p>

        {/* RATING + RANGE */}
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

        {/* PLAY NOW */}
        <div className="mt-4 rounded-2xl border border-ink bg-ink-dim p-4">
          <div className="text-sm font-bold">
            {inQueue ? "You're at the tables" : "Playing right now?"}
          </div>
          <p className="mt-1 text-[13px] leading-relaxed text-text-dim">
            {inQueue && myQueueEntry
              ? `Listed at ${myQueueEntry.location ?? "the tables"}${
                  playStyleLabel(myQueueEntry.play_style)
                    ? ` for ${playStyleLabel(myQueueEntry.play_style)!.toLowerCase()}`
                    : ""
                }. `
              : "Pick how much you want to play and we'll pair you with whoever's waiting. "}
            {waitingCount > 0
              ? `${waitingCount} other player${waitingCount === 1 ? "" : "s"} waiting.`
              : "Nobody else is waiting yet."}
          </p>

          <ActionForm action={findMatchNow} className="mt-3.5">
            <QuickMatchButtons />
          </ActionForm>

          {inQueue ? (
            <ActionForm action={leaveQueue} className="mt-2">
              <SubmitButton
                pendingLabel="Leaving…"
                className="w-full rounded-xl border border-border-strong py-3 text-[13px] font-bold text-text-dim"
              >
                Leave the queue
              </SubmitButton>
            </ActionForm>
          ) : (
            <details className="mt-2">
              <summary className="cursor-pointer list-none rounded-xl border border-border-strong py-3 text-center text-[13px] font-bold text-text-dim">
                Or list yourself so others can find you
              </summary>
              <ActionForm action={joinQueue} className="mt-2 flex flex-col gap-2">
                <HallPicker />
                <div className="flex gap-1.5 rounded-[11px] bg-surface p-1">
                  {PLAY_STYLES.map((style, i) => (
                    <label
                      key={style.value}
                      className="flex-1 cursor-pointer rounded-[9px] py-2 text-center text-[13px] font-bold text-text-dim has-checked:bg-surface-2 has-checked:text-text"
                    >
                      <input
                        type="radio"
                        name="playStyle"
                        value={style.value}
                        defaultChecked={i === 0}
                        className="sr-only"
                      />
                      {style.label}
                    </label>
                  ))}
                </div>
                <input
                  name="note"
                  placeholder="Anything to add? e.g. happy to teach a beginner"
                  maxLength={280}
                  className="rounded-xl border border-border-strong bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-ink"
                />
                <SubmitButton
                  pendingLabel="Joining…"
                  className="rounded-xl bg-ink py-3 text-sm font-bold text-white"
                >
                  I&rsquo;m in
                </SubmitButton>
              </ActionForm>
            </details>
          )}
        </div>

        {/* INCOMING CHALLENGES */}
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

        {/* SENT CHALLENGES */}
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

        {/* AT THE TABLES NOW */}
        {queue && queue.length > 0 && (
          <Section title="At the tables now">
            {queue.map((q) => (
              <Row
                key={q.user_id}
                player={q.profiles as PlayerRef | null}
                note={
                  [playStyleLabel(q.play_style), q.location, q.note].filter(Boolean).join(" · ") ||
                  null
                }
              >
                <ChallengeButton opponentId={q.user_id} label="Play" />
              </Row>
            ))}
          </Section>
        )}

        {/* SUGGESTED */}
        <Section title="Suggested Opponents">
          {suggested.length === 0 ? (
            <p className="rounded-xl border border-border bg-surface p-4 text-sm text-text-dim">
              No one else is rated near you yet — check back once more players join, or{" "}
              <Link href="/leaderboard" className="font-bold underline">
                browse the whole ladder
              </Link>
              .
            </p>
          ) : (
            suggested.map((p) => (
              <Row key={p.id} player={p}>
                <ChallengeButton opponentId={p.id} label="Challenge" />
              </Row>
            ))
          )}
        </Section>

        <Link
          href="/leaderboard"
          className="mt-7 block rounded-xl border border-border-strong py-3.5 text-center text-sm font-bold text-text-dim"
        >
          Browse Full Leaderboard
        </Link>

        {me && (
          <p className="mt-4 text-center text-xs text-text-faint">
            Signed in as {firstName(me)} · @{me.username}
          </p>
        )}
      </div>
    </div>
  );
}

function ChallengeButton({ opponentId, label }: { opponentId: string; label: string }) {
  return (
    <ActionForm action={sendChallenge} hidden={{ opponentId }} quiet>
      <SubmitButton
        pendingLabel="Sending…"
        className="whitespace-nowrap rounded-[9px] border border-ink-bright bg-ink-dim px-4 py-2.5 text-xs font-bold"
      >
        {label}
      </SubmitButton>
    </ActionForm>
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
