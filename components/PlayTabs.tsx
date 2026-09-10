"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Finding a game and watching the games already happening are two halves of
 * the same thing, so they sit side by side — the same idiom the ladder and the
 * directory use, which keeps the bottom bar at five tabs.
 */
export function PlayTabs({ liveCount = 0 }: { liveCount?: number }) {
  const pathname = usePathname();
  const tabs = [
    { href: "/matchmaking", label: "Find a match", badge: 0 },
    { href: "/live", label: "Playing now", badge: liveCount },
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
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-[9px] py-2.5 text-center text-[13px] font-bold ${
              active ? "bg-surface-2 text-text" : "text-text-faint"
            }`}
          >
            {tab.label}
            {tab.badge > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-nu px-1 text-[10px] font-bold text-white">
                {tab.badge}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
