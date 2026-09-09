"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const PresenceContext = createContext<Set<string>>(new Set());

/**
 * Who currently has the app open, via Supabase Realtime Presence.
 *
 * Presence state lives in the Realtime server's memory, not in Postgres, so
 * this costs no database reads or writes and no polling — everyone joins one
 * shared channel and the server broadcasts the roster when it changes. That
 * also means it's genuinely "right now": close the tab and the dot goes out a
 * moment later, with nothing to clean up.
 *
 * The trade is that it can't answer "when were they last here" — nothing is
 * stored. If you want "active 20m ago", that needs a last_seen_at column and
 * a heartbeat.
 */
export function PresenceProvider({ children }: { children: React.ReactNode }) {
  const [online, setOnline] = useState<Set<string>>(new Set());

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    (async () => {
      // Read the session client-side rather than passing the id down from a
      // Server Component: the layout wraps the static landing page too, and
      // making it await auth would stop that page being prerendered.
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      channel = supabase.channel("club-presence", {
        config: { presence: { key: user.id } },
      });

      channel
        .on("presence", { event: "sync" }, () => {
          if (!channel) return;
          setOnline(new Set(Object.keys(channel.presenceState())));
        })
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            await channel?.track({ at: Date.now() });
          }
        });
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  return <PresenceContext.Provider value={online}>{children}</PresenceContext.Provider>;
}

export function useIsOnline(userId: string | null | undefined): boolean {
  const online = useContext(PresenceContext);
  return Boolean(userId && online.has(userId));
}

export function useOnlineCount(): number {
  return useContext(PresenceContext).size;
}

/** Everyone online right now, for filtering server-rendered lists client-side. */
export function useOnlineIds(): Set<string> {
  return useContext(PresenceContext);
}

export function usePresenceReady(): boolean {
  const online = useContext(PresenceContext);
  return useMemo(() => online.size > 0, [online]);
}
