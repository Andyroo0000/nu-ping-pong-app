import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { HuskyMark } from "@/components/HuskyMark";
import { SignOutButton } from "@/components/SignOutButton";

export async function Nav() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let username: string | null = null;
  let unread = 0;
  let openChallenges = 0;

  if (user) {
    const [{ data: profile }, { data: unreadRows }, { count: challengeCount }] = await Promise.all([
      supabase.from("profiles").select("username").eq("id", user.id).single(),
      supabase.rpc("unread_summary"),
      supabase
        .from("challenges")
        .select("id", { count: "exact", head: true })
        .eq("opponent", user.id)
        .eq("status", "pending"),
    ]);
    username = profile?.username ?? null;
    unread = (unreadRows ?? []).reduce((total, row) => total + row.unread, 0);
    openChallenges = challengeCount ?? 0;
  }

  return (
    <div className="flex items-center justify-between border-b border-border bg-bg-alt px-6 py-4">
      <Link href="/leaderboard" className="flex items-center gap-3">
        <HuskyMark size={28} />
        <span className="font-display text-base font-bold tracking-tight">NU Ping Pong</span>
      </Link>
      <div className="hidden items-center gap-8 sm:flex">
        <NavLink href="/leaderboard">Leaderboard</NavLink>
        <NavLink href="/matchmaking" badge={openChallenges}>
          Matchmaking
        </NavLink>
        <NavLink href="/chats" badge={unread}>
          Chats
        </NavLink>
      </div>
      <div className="flex items-center gap-4">
        {/* On narrow screens the section links collapse; chats still needs to
            be reachable, since that's where a new match shows up. */}
        <Link href="/chats" className="relative text-sm font-semibold text-text-dim sm:hidden">
          Chats
          {unread > 0 && <Dot />}
        </Link>
        {username && (
          <Link
            href={`/profile/${username}`}
            className="text-sm font-semibold text-text-dim hover:text-text"
          >
            My Profile
          </Link>
        )}
        <SignOutButton />
      </div>
    </div>
  );
}

function NavLink({
  href,
  badge = 0,
  children,
}: {
  href: string;
  badge?: number;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-1.5 text-sm font-semibold text-text-dim hover:text-text"
    >
      {children}
      {badge > 0 && (
        <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-ink px-1 text-[11px] font-bold text-white">
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </Link>
  );
}

function Dot() {
  return (
    <span className="absolute -right-1.5 -top-0.5 h-2 w-2 rounded-full bg-ink" aria-hidden />
  );
}
