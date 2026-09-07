import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Nav } from "@/components/Nav";
import { TierBadge } from "@/components/TierBadge";

const RANGE = 150;

export default async function MatchmakingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await supabase
    .from("profiles")
    .select("id, rating")
    .eq("id", user.id)
    .single();

  const myRating = me?.rating ?? 1000;
  const low = myRating - RANGE;
  const high = myRating + RANGE;

  const { data: candidates } = await supabase
    .from("profiles")
    .select("id, username, full_name, rating")
    .neq("id", user.id)
    .gte("rating", low)
    .lte("rating", high)
    .order("rating", { ascending: false })
    .limit(12);

  const suggested = (candidates ?? []).sort(
    (a, b) => Math.abs(a.rating - myRating) - Math.abs(b.rating - myRating)
  );

  return (
    <div className="min-h-screen bg-bg">
      <Nav />
      <div className="mx-auto max-w-md px-6 py-10">
        <h1 className="font-display text-3xl font-bold">Find a Match</h1>

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

        <div className="mt-7">
          <div className="mb-3 text-base font-bold">Suggested Opponents</div>
          {suggested.length === 0 && (
            <p className="rounded-xl border border-border bg-surface p-4 text-sm text-text-dim">
              No one else is rated near you yet — check back once more players join.
            </p>
          )}
          <div className="flex flex-col gap-2.5">
            {suggested.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-3.5 py-3"
              >
                <div className="flex h-[42px] w-[42px] items-center justify-center rounded-full bg-surface-2 text-xs font-bold">
                  {initials(p.full_name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold">{p.full_name}</div>
                  <div className="font-display text-[15px] font-bold">
                    {p.rating.toLocaleString()}
                  </div>
                </div>
                <Link
                  href={`/log-match?opponent=${p.id}`}
                  className="whitespace-nowrap rounded-[9px] border border-ink-bright bg-ink-dim px-4 py-2.5 text-xs font-bold"
                >
                  Challenge
                </Link>
              </div>
            ))}
          </div>
        </div>

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

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
