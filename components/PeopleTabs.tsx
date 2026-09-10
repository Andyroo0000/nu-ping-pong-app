"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * The ladder and the directory are the same people ordered two ways, so they
 * sit side by side rather than in separate corners of the app. The ladder
 * sorted by rating is a hostile front door for someone who just wants to find
 * a person to play; the directory is that front door.
 */
export function PeopleTabs() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode");
  const tabs = [
    { href: "/leaderboard", label: "Singles", active: pathname === "/leaderboard" && mode !== "doubles" },
    { href: "/leaderboard?mode=doubles", label: "Doubles", active: pathname === "/leaderboard" && mode === "doubles" },
    { href: "/members", label: "Directory", active: pathname === "/members" },
  ];

  return (
    <div className="mt-4 flex gap-1.5 rounded-[11px] bg-surface p-1">
      {tabs.map((tab) => {
        const active = tab.active;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`flex-1 rounded-[9px] py-2.5 text-center text-xs font-bold sm:text-[13px] ${
              active ? "bg-surface-2 text-text" : "text-text-faint"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
