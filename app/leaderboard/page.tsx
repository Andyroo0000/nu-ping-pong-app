import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Nav } from "@/components/Nav";
import { TierBadge } from "@/components/TierBadge";

export default async function LeaderboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: players } = await supabase
    .from("profiles")
    .select("id, username, full_name, rating, wins, losses")
    .order("rating", { ascending: false });

  const ranked = players ?? [];
  const myIndex = ranked.findIndex((p) => p.id === user?.id);
  const me = myIndex >= 0 ? ranked[myIndex] : null;

  return (
    <div className="min-h-screen bg-bg">
      <Nav />
      <div className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="font-display text-3xl font-bold">Leaderboard</h1>
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
              className={`flex items-center gap-4 border-b border-border py-3 ${
                p.id === user?.id ? "bg-surface-2" : ""
              }`}
            >
              <div className="w-6 shrink-0 text-sm font-bold text-text-faint">{i + 1}</div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-bold">
                {initials(p.full_name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold">{p.full_name}</div>
                <TierBadge rating={p.rating} className="mt-1" />
              </div>
              <div className="shrink-0 text-right">
                <div className="font-display text-base font-bold">{p.rating.toLocaleString()}</div>
                <div className="text-xs font-semibold text-text-faint">
                  {p.wins}W–{p.losses}L
                </div>
              </div>
            </Link>
          ))}
        </div>

        {user && me && (
          <div className="sticky bottom-6 mt-8 flex items-center gap-3 rounded-2xl border border-ink bg-surface-2 p-4">
            <div className="w-6 shrink-0 text-sm font-bold text-ink">{myIndex + 1}</div>
            <div className="flex-1 text-sm font-bold">Your rank</div>
            <div className="font-display text-base font-bold">{me.rating.toLocaleString()}</div>
          </div>
        )}
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
