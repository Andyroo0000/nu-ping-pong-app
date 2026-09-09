"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The ladder and the directory are the same people ordered two ways, so they
 * sit side by side rather than in separate corners of the app. The ladder
 * sorted by rating is a hostile front door for someone who just wants to find
 * a person to play; the directory is that front door.
 */
export function PeopleTabs() {
  const pathname = usePathname();
  const tabs = [
    { href: "/leaderboard", label: "Ladder" },
    { href: "/members", label: "Directory" },
  ];

  return (
    <div className="mt-4 flex gap-1.5 rounded-[11px] bg-surface p-1">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`flex-1 rounded-[9px] py-2.5 text-center text-[13px] font-bold ${
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
