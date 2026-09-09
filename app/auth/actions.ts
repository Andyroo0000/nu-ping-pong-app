"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-next";
import type { ActionResult } from "@/app/actions";

const NU_DOMAIN = "@northeastern.edu";

/**
 * Auth runs as a Server Action rather than from the browser client on purpose.
 * signIn writes the session cookie, and a cookie mutation inside an action
 * makes Next re-render the page in the same response — so the redirect that
 * follows already carries the new session. Signing in from the browser and
 * then calling router.push() races that cookie write, which is what left the
 * page spinning until a manual reload.
 */
export async function signIn(formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(String(formData.get("next") ?? ""));

  const invalid = validateCredentials(email, password);
  if (invalid) return invalid;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return {
      ok: false,
      error: error.message.toLowerCase().includes("invalid login credentials")
        ? "That email and password don't match an account. Check your password, or create an account."
        : error.message,
    };
  }

  redirect(next);
}

export async function signUp(formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("fullName") ?? "").trim().slice(0, 80);
  const next = safeNext(String(formData.get("next") ?? ""));

  const invalid = validateCredentials(email, password);
  if (invalid) return invalid;
  if (!fullName) {
    return { ok: false, error: "Add your name so opponents know who they're playing." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });

  if (error) {
    return {
      ok: false,
      error: error.message.toLowerCase().includes("already registered")
        ? "There's already an account with that email — sign in instead."
        : error.message,
    };
  }

  // With "Confirm email" switched on in Supabase, signUp returns no session.
  // Redirecting anywhere protected would bounce straight back to /login and
  // look like a hang, so say what actually needs to happen.
  if (!data.session) {
    return {
      ok: true,
      message: `Almost there — we sent a confirmation link to ${email}. Open it, then sign in.`,
    };
  }

  redirect(next);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

function validateCredentials(email: string, password: string): ActionResult | null {
  if (!email.endsWith(NU_DOMAIN)) {
    return { ok: false, error: `NU Ping Pong is open to ${NU_DOMAIN} addresses only.` };
  }
  if (password.length < 6) {
    return { ok: false, error: "Password must be at least 6 characters." };
  }
  return null;
}
