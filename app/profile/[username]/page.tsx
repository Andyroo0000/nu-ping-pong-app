import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { Nav } from "@/components/Nav";
import { BottomTabs } from "@/components/BottomTabs";
import { TierProgress } from "@/components/TierBadge";
import { RatingChart } from "@/components/RatingChart";
import { Avatar } from "@/components/Avatar";
import { OnlineAvatarWrapper } from "@/components/OnlineDot";
import { NavSkeleton, ProfileSkeleton } from "@/components/Skeletons";
import { displayName, firstName } from "@/lib/names";
import { PlayerActions } from "@/components/PlayerActions";
import { availabilityLabels, playPreferenceLabel, yearLabel } from "@/lib/profile";
import { confirmMatch, declineMatch } from "@/app/actions";

type Params = Promise<{ username: string }>;

// Nav and the page frame are prerendered; the profile itself streams in.
// `params` is awaited inside the boundary so it doesn't block the shell.
export default function ProfilePage({ params }: { params: Params }) {
  return (
    <div className="pb-tabs min-h-screen bg-bg">
      <Suspense fallback={<NavSkeleton />}>
        <Nav />
      </Suspense>
      <Suspense fallback={<ProfileSkeleton />}>
        <ProfileBody params={params} />
      </Suspense>

      <Suspense fallback={null}>
        <BottomTabs />
      </Suspense>    </div>
  );
}

async function ProfileBody({ params }: { params: Params }) {
  const { username } = await params;
  const supabase = await createClient();

  const user = await getCurrentUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "id, username, full_name, rating, wins, losses, created_at, bio, year, home_hall, availability, play_preference, avatar_path"
    )
    .eq("username", username)
    .single();

  if (!profile) notFound();

  const isOwnProfile = user?.id === profile.id;

  const [
    { count: rank },
    { data: history },
    { data: matches },
    { data: pending },
    { data: casual },
    { data: blockRow },
  ] = await Promise.all([
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .gt("rating", profile.rating),
      supabase
        .from("rating_history")
        .select("rating, created_at")
        .eq("player_id", profile.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("matches")
        .select(
          "id, player_a, player_b, winner, rating_delta, confirmed_at, games_won_a, games_won_b, is_ranked, profiles_a:profiles!player_a(full_name, username), profiles_b:profiles!player_b(full_name, username)"
        )
        .or(`player_a.eq.${profile.id},player_b.eq.${profile.id}`)
        .eq("status", "confirmed")
        .order("confirmed_at", { ascending: false })
        .limit(10),
      supabase
        .from("matches")
        .select(
          "id, games_won_a, games_won_b, played_at, profiles_a:profiles!player_a(full_name, username)"
        )
        .eq("player_b", profile.id)
        .eq("status", "pending")
        .order("played_at", { ascending: false }),
      supabase.rpc("casual_record", { p_player: profile.id }),
      isOwnProfile
        ? Promise.resolve({ data: null })
        : supabase
            .from("blocks")
            .select("blocked")
            .eq("blocker", user?.id ?? "")
            .eq("blocked", profile.id)
            .maybeSingle(),
    ]);

  const casualRecord = casual?.[0] ?? { wins: 0, losses: 0 };
  const casualTotal = casualRecord.wins + casualRecord.losses;

  const totalMatches = profile.wins + profile.losses;
  const winRate = totalMatches > 0 ? Math.round((profile.wins / totalMatches) * 100) : 0;

  let streak = 0;
  const rankedMatches = (matches ?? []).filter((m) => m.is_ranked);
  {
    for (const m of rankedMatches) {
      const won = m.winner === profile.id;
      if (streak === 0) streak = won ? 1 : -1;
      else if ((streak > 0) === won) streak += won ? 1 : -1;
      else break;
    }
  }

  return (
    <div className="mx-auto max-w-md px-6 py-10">
        <div className="flex flex-col items-center text-center">
          <OnlineAvatarWrapper userId={profile.id} dotSize={16}>
            <Avatar
              player={profile}
              size={80}
              className="border-[3px] border-nu font-display text-2xl"
            />
          </OnlineAvatarWrapper>
          <div className="mt-3 text-xl font-bold">{displayName(profile)}</div>
          <div className="text-sm font-semibold text-text-faint">@{profile.username}</div>
          <div className="mt-3 font-display text-5xl font-bold tracking-tight text-nu-accent">
            {profile.rating.toLocaleString()}
          </div>
          <div className="text-sm font-semibold text-text-faint">
            Rank #{(rank ?? 0) + 1} overall
          </div>

          <TierProgress
            rating={profile.rating}
            className="mt-5 w-full rounded-2xl border border-border bg-surface p-4 text-left"
          />

          <div className="mt-3 flex flex-wrap justify-center gap-1.5">
            <Chip>{playPreferenceLabel(profile.play_preference)}</Chip>
            {yearLabel(profile.year) && <Chip>{yearLabel(profile.year)}</Chip>}
            {profile.home_hall && <Chip>{profile.home_hall}</Chip>}
          </div>

          {profile.bio && (
            <p className="mt-4 whitespace-pre-wrap text-left text-sm leading-relaxed text-text-dim">
              {profile.bio}
            </p>
          )}

          {availabilityLabels(profile.availability).length > 0 && (
            <div className="mt-4 w-full rounded-xl border border-border bg-surface p-3.5 text-left">
              <div className="text-xs font-bold text-text-faint">USUALLY PLAYS</div>
              <div className="mt-1.5 text-[13px] font-semibold">
                {availabilityLabels(profile.availability).join(" · ")}
              </div>
            </div>
          )}

          {isOwnProfile && (
            <Link
              href="/profile/edit"
              className="mt-4 rounded-xl border border-border-strong px-4 py-2.5 text-[13px] font-bold"
            >
              Edit profile
            </Link>
          )}
        </div>

        {user && !isOwnProfile && (
          <PlayerActions
            playerId={profile.id}
            firstName={firstName(profile)}
            isBlocked={Boolean(blockRow)}
          />
        )}

        <div className="mt-7 grid grid-cols-3 gap-2.5">
          <Stat value={`${winRate}%`} label="Win rate" />
          <Stat value={String(Math.abs(streak))} label={streak >= 0 ? "Win streak" : "Loss streak"} />
          <Stat value={String(totalMatches)} label="Ranked" />
        </div>

        {casualTotal > 0 && (
          <p className="mt-2.5 text-center text-xs font-semibold text-text-faint">
            Plus {casualRecord.wins}W–{casualRecord.losses}L in casual games, which don&rsquo;t
            affect rating.
          </p>
        )}

        {isOwnProfile && pending && pending.length > 0 && (
          <div className="mt-8">
            <div className="mb-2 text-base font-bold">Awaiting Your Confirmation</div>
            <div className="flex flex-col gap-3">
              {pending.map((m) => (
                <div key={m.id} className="rounded-xl border border-border-strong bg-surface p-4">
                  <div className="text-sm font-bold">
                    {m.profiles_a ? displayName(m.profiles_a) : "A player"} reported{" "}
                    {m.games_won_a}–{m.games_won_b}
                  </div>
                  <div className="mt-1 text-xs font-semibold text-text-faint">
                    {new Date(m.played_at).toLocaleDateString()}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <form action={confirmMatch} className="flex-1">
                      <input type="hidden" name="matchId" value={m.id} />
                      <button className="w-full rounded-lg bg-nu transition-colors hover:bg-nu-deep py-2 text-sm font-bold text-white">
                        Confirm
                      </button>
                    </form>
                    <form action={declineMatch} className="flex-1">
                      <input type="hidden" name="matchId" value={m.id} />
                      <button className="w-full rounded-lg border border-border-strong py-2 text-sm font-bold">
                        Dispute
                      </button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-8">
          <div className="text-base font-bold">Rating History</div>
          <div className="mt-3 rounded-2xl border border-border bg-surface p-4">
            <RatingChart points={(history ?? []).map((h) => h.rating)} />
          </div>
        </div>

        <div className="mt-8">
          <div className="mb-2 text-base font-bold">Recent Matches</div>
          {(!matches || matches.length === 0) && (
            <p className="text-sm text-text-dim">No confirmed matches yet.</p>
          )}
          {matches?.map((m) => {
            const won = m.winner === profile.id;
            const isA = m.player_a === profile.id;
            const opponent = isA ? m.profiles_b : m.profiles_a;
            const myGames = isA ? m.games_won_a : m.games_won_b;
            const oppGames = isA ? m.games_won_b : m.games_won_a;
            return (
              <div key={m.id} className="flex items-center gap-3 border-b border-border py-3 last:border-0">
                <div
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-extrabold ${
                    won ? "bg-ink text-bg" : "border-[1.5px] border-text-faint text-text-faint"
                  }`}
                >
                  {won ? "W" : "L"}
                </div>
                <Avatar player={opponent ?? { username: "?", full_name: null }} size={32} />
                <div className="flex-1">
                  <div className="text-sm font-bold">vs. {opponent ? displayName(opponent) : "Unknown"}</div>
                  <div className="text-xs font-semibold text-text-faint">
                    {myGames}–{oppGames} ·{" "}
                    {m.confirmed_at ? new Date(m.confirmed_at).toLocaleDateString() : ""}
                  </div>
                </div>
                {m.is_ranked ? (
                  <div
                    className={`font-display text-sm font-bold ${
                      won ? "text-text" : "text-text-faint"
                    }`}
                  >
                    {won ? "+" : "−"}
                    {m.rating_delta ?? 0}
                  </div>
                ) : (
                  <div className="text-[11px] font-bold text-text-faint">Casual</div>
                )}
              </div>
            );
          })}
        </div>

        {isOwnProfile && (
          <div className="mt-8 flex gap-2.5">
            <Link
              href="/log-match"
              className="flex-1 rounded-xl bg-nu transition-colors hover:bg-nu-deep py-3.5 text-center text-sm font-bold text-white"
            >
              Log a Match
            </Link>
            <Link
              href="/matchmaking"
              className="flex-1 rounded-xl border border-border-strong py-3.5 text-center text-sm font-bold"
            >
              Find an Opponent
            </Link>
          </div>
      )}
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border-strong bg-surface-2 px-3 py-1 text-xs font-bold">
      {children}
    </span>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-2 py-3.5 text-center">
      <div className="font-display text-lg font-bold">{value}</div>
      <div className="mt-0.5 text-[11px] font-semibold text-text-faint">{label}</div>
    </div>
  );
}

