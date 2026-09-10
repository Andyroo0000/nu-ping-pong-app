import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { Welcome } from "@/components/Welcome";

/**
 * Shows the walkthrough only to players who haven't seen it.
 *
 * The flag lives on the profile rather than in localStorage so it follows
 * someone between their laptop and their phone.
 */
export async function WelcomeGate() {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("onboarded_at")
    .eq("id", user.id)
    .maybeSingle();

  if (!data || data.onboarded_at) return null;
  return <Welcome />;
}
