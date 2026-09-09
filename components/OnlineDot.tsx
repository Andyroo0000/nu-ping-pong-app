"use client";

import { useIsOnline, useOnlineCount } from "@/components/PresenceProvider";

/**
 * Green dot for a player who has the app open. Rendered as a client component
 * so server-rendered lists can stay server-rendered — only the dot itself
 * needs to know about presence.
 */
export function OnlineDot({
  userId,
  size = 11,
  className = "",
  /** Draw a ring in the page background, for sitting on top of an avatar. */
  ring = false,
}: {
  userId: string | null | undefined;
  size?: number;
  className?: string;
  ring?: boolean;
}) {
  const online = useIsOnline(userId);
  if (!online) return null;

  return (
    <span
      className={`live-dot block shrink-0 rounded-full bg-live ${className}`}
      style={{
        width: size,
        height: size,
        boxShadow: ring ? "0 0 0 2px var(--bg)" : undefined,
      }}
      title="Online now"
      aria-label="Online now"
      role="img"
    />
  );
}

/** Avatar with the dot pinned to its bottom-right. */
export function OnlineAvatarWrapper({
  userId,
  children,
  dotSize = 12,
}: {
  userId: string | null | undefined;
  children: React.ReactNode;
  dotSize?: number;
}) {
  return (
    <span className="relative inline-flex shrink-0">
      {children}
      <span className="absolute -bottom-0.5 -right-0.5">
        <OnlineDot userId={userId} size={dotSize} ring />
      </span>
    </span>
  );
}

/** "4 online now" — hidden entirely when nobody is. */
export function OnlineCount({ className = "" }: { className?: string }) {
  const count = useOnlineCount();
  if (count === 0) return null;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-bold text-text-dim ${className}`}>
      <span className="live-dot block h-2 w-2 rounded-full bg-live" />
      {count} online now
    </span>
  );
}

/** Inline "Online now" / nothing, for a chat header. */
export function OnlineLabel({ userId }: { userId: string | null | undefined }) {
  const online = useIsOnline(userId);
  if (!online) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-bold" style={{ color: "var(--live)" }}>
      <span className="live-dot block h-1.5 w-1.5 rounded-full bg-live" />
      Online now
    </span>
  );
}
