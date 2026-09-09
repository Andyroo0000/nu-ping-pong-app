import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";

export type NavSummary = {
  username: string | null;
  unread: number;
  pendingChallenges: number;
};

const EMPTY: NavSummary = { username: null, unread: 0, pendingChallenges: 0 };

/**
 * Username plus the two badge counts, in one round trip.
 *
 * Wrapped in cache() because both the top nav and the bottom tab bar need the
 * same numbers, and they render on every signed-in page — without this they'd
 * each pay for their own query on every navigation.
 */
export const getNavSummary = cache(async (): Promise<NavSummary> => {
  const user = await getCurrentUser();
  if (!user) return EMPTY;

  const supabase = await createClient();
  const { data } = await supabase.rpc("nav_summary");
  const summary = data?.[0];
  if (!summary) return EMPTY;

  return {
    username: summary.username ?? null,
    unread: summary.unread ?? 0,
    pendingChallenges: summary.pending_challenges ?? 0,
  };
});
