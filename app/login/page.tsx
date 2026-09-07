"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { HuskyMark } from "@/components/HuskyMark";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/leaderboard";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email.toLowerCase().endsWith("@northeastern.edu")) {
      setError("NU Ping Pong is open to @northeastern.edu addresses only.");
      setStatus("error");
      return;
    }

    setStatus("sending");
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });

    if (signInError) {
      setError(signInError.message);
      setStatus("error");
      return;
    }
    setStatus("sent");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <HuskyMark size={40} />
          <h1 className="font-display text-2xl font-bold">Sign in to NU Ping Pong</h1>
          <p className="text-sm text-text-dim">
            Use your Northeastern email — we&rsquo;ll send a magic link, no password needed.
          </p>
        </div>

        {status === "sent" ? (
          <div className="rounded-xl border border-border-strong bg-surface p-5 text-center text-sm font-medium">
            Check <span className="font-bold">{email}</span> for a sign-in link.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@northeastern.edu"
              className="rounded-xl border border-border-strong bg-surface px-4 py-3 text-sm outline-none focus:border-ink"
            />
            {error && <p className="text-sm font-medium text-text">{error}</p>}
            <button
              type="submit"
              disabled={status === "sending"}
              className="rounded-xl bg-ink px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {status === "sending" ? "Sending…" : "Send Magic Link"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
