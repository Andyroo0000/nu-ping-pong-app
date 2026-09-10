import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { gamesWon } from "@/lib/live";

/**
 * Matches being played right now, for anyone to follow. Your own game comes
 * first and reads as "resume", since that's the one you need.
 */
export async function LiveNow() {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data: live } = await supabase.rpc("live_now");
  if (!live?.length) return null;

  const mine = live.filter((m) => m.player_a === user.id || m.player_b === user.id);
  const others = live.filter((m) => m.player_a !== user.id && m.player_b !== user.id);

  return (
    <div className="mt-7">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <span className="flex items-center gap-2 text-base font-bold">
          <span className="live-dot block h-2 w-2 rounded-full bg-live" />
          {mine.length > 0 ? "Your game" : "Being played now"}
        </span>
        <Link href="/live" className="text-xs font-bold text-nu-accent underline">
          See all
        </Link>
      </div>

      <div className="flex flex-col gap-2.5">
        {[...mine, ...others].map((m) => {
          const won = gamesWon(m.games ?? []);
          const isMine = m.player_a === user.id || m.player_b === user.id;
          return (
            <Link
              key={m.id}
              href={`/live/${m.id}`}
              className={`flex items-center gap-3 rounded-2xl p-3.5 ${
                isMine ? "border-2 border-nu bg-nu-wash" : "panel border"
              }`}
            >
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
                <div className="font-display text-xl font-bold tabular-nums">
                  {m.points_a}–{m.points_b}
                </div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-nu-accent">
                  {isMine ? "Resume" : "Watch"}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
