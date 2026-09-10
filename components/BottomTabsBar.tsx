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
    { href: "/home", label: "Home", icon: <HomeIcon />, badge: 0 },
    { href: "/matchmaking", label: "Play", icon: <PaddleIcon size={22} />, badge: challenges },
    { href: "/members", label: "Club", icon: <PeopleIcon />, badge: 0 },
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
          // "Club" owns the ladder too, since the two are a toggle pair.
          const active =
            tab.label === "You"
              ? pathname.startsWith("/profile")
              : tab.label === "Club"
                ? pathname === "/members" || pathname === "/leaderboard"
                : tab.label === "Play"
                  ? pathname.startsWith("/matchmaking") || pathname.startsWith("/live")
                  : pathname.startsWith(tab.href);

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

function HomeIcon() {
  return (
    <Icon>
      <path d="M4 10.5 12 4l8 6.5" />
      <path d="M6 9.8V20h12V9.8" />
      <path d="M10 20v-5h4v5" />
    </Icon>
  );
}

function PeopleIcon() {
  return (
    <Icon>
      <circle cx="9.5" cy="8.5" r="3.1" />
      <path d="M3.5 19.5a6 6 0 0 1 12 0" />
      <path d="M16 6.2a3.1 3.1 0 0 1 0 5.9M18 13.6a5.4 5.4 0 0 1 2.5 4.4" />
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
