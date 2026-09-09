import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type CurrentUser = { id: string; email: string | null };

/**
 * The signed-in player, or null.
 *
 * Two things make this faster than calling `supabase.auth.getUser()` directly
 * in every component:
 *
 * 1. `cache()` dedupes it per request, so a page and the <Nav /> it renders
 *    share one lookup instead of each paying for their own.
 * 2. `getClaims()` verifies the JWT locally via WebCrypto when the Supabase
 *    project uses asymmetric signing keys, so there's no round-trip to the
 *    Auth server at all. `getUser()` always makes that request. On a project
 *    still using the legacy symmetric secret, getClaims falls back to asking
 *    the server, so this is never less correct — just not as fast.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return {
    id: data.claims.sub,
    email: typeof data.claims.email === "string" ? data.claims.email : null,
  };
});
