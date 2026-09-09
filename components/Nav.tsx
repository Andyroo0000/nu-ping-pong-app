import Link from "next/link";
import { getNavSummary } from "@/lib/nav-summary";
import { Wordmark } from "@/components/NMark";
import { SignOutButton } from "@/components/SignOutButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { OnlineCount } from "@/components/OnlineDot";

export async function Nav() {
  // One round trip, shared with <BottomTabs /> via cache().
  const { username, unread, pendingChallenges: openChallenges } = await getNavSummary();

  return (
    <div className="flex items-center justify-between border-b-2 border-nu bg-bg-alt px-6 py-4">
      <Link href="/home">
        <Wordmark size={28} />
      </Link>
      <div className="hidden items-center gap-8 sm:flex">
        <NavLink href="/home">Home</NavLink>
        <NavLink href="/matchmaking" badge={openChallenges}>
          Matchmaking
        </NavLink>
        <NavLink href="/members">Club</NavLink>
        <NavLink href="/feedback">Suggest</NavLink>
        <NavLink href="/chats" badge={unread}>
          Chats
        </NavLink>
        <OnlineCount />
      </div>
      <div className="flex items-center gap-4">
        {/* Below `sm` these are all handled by <BottomTabs />, so the top bar
            keeps just the two controls that have nowhere else to live. */}
        {username && (
          <Link
            href={`/profile/${username}`}
            className="hidden text-sm font-semibold text-text-dim hover:text-text sm:inline"
          >
            My Profile
          </Link>
        )}
        <ThemeToggle />
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
        <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-nu px-1 text-[11px] font-bold text-white">
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </Link>
  );
}
