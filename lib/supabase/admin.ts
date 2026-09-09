import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Supabase client using the service_role key, which bypasses row level
 * security. Needed for exactly one thing: reading the push subscriptions of
 * the player being notified, which their own RLS policy quite rightly hides
 * from everyone else.
 *
 * `import "server-only"` makes the build fail if this file is ever pulled into
 * a Client Component. Treat the key like a password — it can read and write
 * every table in the project.
 *
 * Returns null when the key isn't configured, so the app keeps working with
 * notifications simply switched off rather than crashing.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
