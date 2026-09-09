"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PaddleIcon } from "@/components/PaddleIcon";

export function BottomTabsBar({
  username,
  unread,
  challenges,
}: {
  username: string | null;
  unread: number;
  challenges: number;
}) {
  const pathname = usePathname();

  const tabs = [
    { href: "/leaderboard", label: "Ladder", icon: <TrophyIcon />, badge: 0 },
    { href: "/matchmaking", label: "Play", icon: <PaddleIcon size={22} />, badge: challenges },
    { href: "/chats", label: "Chats", icon: <ChatIcon />, badge: unread },
    {
      href: username ? `/profile/${username}` : "/profile/edit",
      label: "You",
      icon: <PersonIcon />,
      badge: 0,
    },
  ];

  return (
    // pb-safe keeps the tabs above the iPhone home indicator when installed.
    <nav
      className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg-alt/95 backdrop-blur sm:hidden"
      aria-label="Sections"
    >
      <ul className="mx-auto flex max-w-md">
        {tabs.map((tab) => {
          const active =
            tab.href === "/leaderboard"
              ? pathname === "/leaderboard"
              : pathname.startsWith(tab.href.split("?")[0]) ||
                (tab.label === "You" && pathname.startsWith("/profile"));

          return (
            <li key={tab.label} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                // 56px tall: comfortably past the 44px minimum tap target.
                className={`relative flex h-14 flex-col items-center justify-center gap-0.5 text-[10px] font-bold ${
                  active ? "text-nu-accent" : "text-text-faint"
                }`}
              >
                <span className="relative">
                  {tab.icon}
                  {tab.badge > 0 && (
                    <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-nu px-1 text-[10px] font-bold text-white">
                      {tab.badge > 9 ? "9+" : tab.badge}
                    </span>
                  )}
                </span>
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function TrophyIcon() {
  return (
    <Icon>
      <path d="M8 4h8v4a4 4 0 0 1-8 0Z" />
      <path d="M8 5H5.5A1.5 1.5 0 0 0 4 6.5C4 9 6 10 8 10M16 5h2.5A1.5 1.5 0 0 1 20 6.5C20 9 18 10 16 10" />
      <path d="M12 12v4M9 20h6M10 16h4l.5 4h-5Z" />
    </Icon>
  );
}

function ChatIcon() {
  return (
    <Icon>
      <path d="M20 12a7.5 7.5 0 0 1-11 6.6L4.5 20l1.3-4A7.5 7.5 0 1 1 20 12Z" />
    </Icon>
  );
}

function PersonIcon() {
  return (
    <Icon>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </Icon>
  );
}

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}
