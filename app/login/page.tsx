"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "working" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
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
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      setStatus("error");
      return;
    }

    setStatus("working");
    const supabase = createClient();

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (!signInError) {
      router.push(next);
      router.refresh();
      return;
    }

    // No account yet with this email/password — create one.
    if (signInError.message.toLowerCase().includes("invalid login credentials")) {
      const { error: signUpError } = await supabase.auth.signUp({ email, password });
      if (signUpError) {
        setError(signUpError.message);
        setStatus("error");
        return;
      }
      router.push(next);
      router.refresh();
      return;
    }

    setError(signInError.message);
    setStatus("error");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <HuskyMark size={40} />
          <h1 className="font-display text-2xl font-bold">Sign in to NU Ping Pong</h1>
          <p className="text-sm text-text-dim">
            Use your Northeastern email. First time here? The same form creates your account.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@northeastern.edu"
            className="rounded-xl border border-border-strong bg-surface px-4 py-3 text-sm outline-none focus:border-ink"
          />
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="rounded-xl border border-border-strong bg-surface px-4 py-3 text-sm outline-none focus:border-ink"
          />
          {error && <p className="text-sm font-medium text-text">{error}</p>}
          <button
            type="submit"
            disabled={status === "working"}
            className="rounded-xl bg-ink px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {status === "working" ? "Working…" : "Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
