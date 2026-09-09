import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { Nav } from "@/components/Nav";
import { HuskyWatermark } from "@/components/HuskyWatermark";
import { BottomTabs } from "@/components/BottomTabs";
import { PeopleTabs } from "@/components/PeopleTabs";
import { TierBadge } from "@/components/TierBadge";
import { Avatar } from "@/components/Avatar";
import { OnlineAvatarWrapper } from "@/components/OnlineDot";
import { NavSkeleton, RowsSkeleton } from "@/components/Skeletons";
import { MemberFilters } from "./MemberFilters";
import { displayName } from "@/lib/names";
import { AVAILABILITY_VALUES, availabilityLabels, playPreferenceLabel, yearLabel } from "@/lib/profile";
import { HALLS } from "@/lib/halls";

type Params = Promise<{
  q?: string;
  hall?: string;
  pref?: string;
  when?: string;
  year?: string;
}>;

export default function MembersPage({ searchParams }: { searchParams: Params }) {
  return (
    <div className="pb-tabs relative isolate min-h-screen bg-bg">
      <HuskyWatermark />
      <Suspense fallback={<NavSkeleton />}>
        <Nav />
      </Suspense>
      <div className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="font-display text-3xl font-bold">The Club</h1>
        <p className="mt-1 text-sm text-text-dim">
          Everyone who plays. Find someone near you, at your level, free when you are.
        </p>
        <PeopleTabs />

        <Suspense fallback={<RowsSkeleton rows={5} />}>
          <Directory searchParams={searchParams} />
        </Suspense>
      </div>

      <Suspense fallback={null}>
        <BottomTabs />
      </Suspense>
    </div>
  );
}

async function Directory({ searchParams }: { searchParams: Params }) {
  const [user, filters] = await Promise.all([getCurrentUser(), searchParams]);
  if (!user) redirect("/login");

  const supabase = await createClient();

  let request = supabase
    .from("profiles")
    .select(
      "id, username, full_name, rating, wins, losses, bio, year, home_hall, availability, play_preference, avatar_path"
    );

  // Only trust values that are actually in our own vocabularies — these come
  // from the URL, so anything could be in them.
  const term = (filters.q ?? "").trim().replace(/[,()*]/g, "").slice(0, 60);
  if (term) request = request.or(`full_name.ilike.%${term}%,username.ilike.%${term}%`);

  if (filters.hall && HALLS.includes(filters.hall)) {
    request = request.eq("home_hall", filters.hall);
  }
  if (filters.pref === "casual" || filters.pref === "competitive") {
    // Someone who's happy either way belongs in both lists.
    request = request.in("play_preference", [filters.pref, "both"]);
  }
  if (filters.when && AVAILABILITY_VALUES.includes(filters.when)) {
    request = request.contains("availability", [filters.when]);
  }
  if (filters.year) {
    request = request.eq("year", filters.year);
  }

  const [{ data: players }, { data: blocked }] = await Promise.all([
    request.order("rating", { ascending: false }).limit(200),
    supabase.rpc("blocked_ids"),
  ]);

  // Blocking is mutual in effect: neither side sees the other in the club list.
  const hidden = new Set(blocked ?? []);

  // People who've filled in a profile first — a card with a photo and a line
  // about themselves is the whole point of the page.
  const members = (players ?? [])
    .filter((p) => !hidden.has(p.id))
    .sort((a, b) => score(b) - score(a));

  return (
    <>
      <MemberFilters resultCount={members.length} />

      {members.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-border bg-surface p-5 text-sm text-text-dim">
          Nobody matches that yet. Try clearing a filter — the club is still small.
        </p>
      ) : (
        <div className="mt-5 flex flex-col gap-2.5">
          {members.map((p) => {
            const when = availabilityLabels(p.availability);
            return (
              <Link
                key={p.id}
                href={`/profile/${p.username}`}
                className="flex gap-3.5 rounded-2xl border border-border bg-surface p-3.5 transition-colors hover:border-border-strong"
              >
                <OnlineAvatarWrapper userId={p.id}>
                  <Avatar player={p} size={48} />
                </OnlineAvatarWrapper>

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-bold">
                      {displayName(p)}
                      {p.id === user.id && (
                        <span className="ml-1.5 text-[11px] font-bold text-text-faint">you</span>
                      )}
                    </span>
                    <span className="shrink-0 font-display text-sm font-bold text-text-dim">
                      {p.rating.toLocaleString()}
                    </span>
                  </div>

                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <TierBadge rating={p.rating} size="sm" short />
                    <Chip>{playPreferenceLabel(p.play_preference)}</Chip>
                    {p.home_hall && <Chip>{p.home_hall}</Chip>}
                    {yearLabel(p.year) && <Chip>{yearLabel(p.year)}</Chip>}
                  </div>

                  {p.bio && (
                    <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-text-dim">
                      {p.bio}
                    </p>
                  )}

                  {when.length > 0 && (
                    <p className="mt-1.5 truncate text-xs text-text-faint">
                      Plays {when.join(" · ").toLowerCase()}
                    </p>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

/** Completed profiles rank above blank ones; rating breaks ties. */
function score(p: {
  avatar_path: string | null;
  bio: string | null;
  full_name: string | null;
  rating: number;
}): number {
  let s = 0;
  if (p.avatar_path) s += 2_000_000;
  if (p.bio?.trim()) s += 1_000_000;
  if (p.full_name?.trim()) s += 500_000;
  return s + p.rating;
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[11px] font-bold text-text-dim">
      {children}
    </span>
  );
}
