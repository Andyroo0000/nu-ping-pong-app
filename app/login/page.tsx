"use client";

import { Suspense, useActionState, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { NMark } from "@/components/NMark";
import { SubmitButton } from "@/components/ActionForm";
import { signIn, signUp } from "@/app/auth/actions";
import { safeNext } from "@/lib/safe-next";
import type { ActionResult } from "@/app/actions";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

type Mode = "signin" | "signup";

function LoginForm() {
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"));

  const [mode, setMode] = useState<Mode>(
    searchParams.get("mode") === "signup" ? "signup" : "signin"
  );
  const isSignUp = mode === "signup";

  // Held in state so a rejected attempt re-renders with what was typed
  // instead of making the player enter their email again. The password is
  // deliberately not kept.
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");

  // One state slot per mode so switching tabs doesn't carry the other form's
  // error along with it.
  const [signInState, signInAction] = useActionState<ActionResult | null, FormData>(
    (_previous, formData) => signIn(formData),
    null
  );
  const [signUpState, signUpAction] = useActionState<ActionResult | null, FormData>(
    (_previous, formData) => signUp(formData),
    null
  );
  const state = isSignUp ? signUpState : signInState;

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Link href="/" aria-label="NU Ping Pong home">
            <NMark size={44} />
          </Link>
          <h1 className="font-display text-2xl font-bold">
            {isSignUp ? "Join NU Ping Pong" : "Sign in to NU Ping Pong"}
          </h1>
          <p className="text-sm text-text-dim">
            {isSignUp
              ? "Create your account with your Northeastern email. You'll start at a 1,000 rating."
              : "Welcome back. Use the Northeastern email you signed up with."}
          </p>
        </div>

        <div className="mb-5 flex gap-1.5 rounded-[11px] bg-surface p-1">
          {(["signin", "signup"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={`flex-1 rounded-[9px] py-2.5 text-[13px] font-bold ${
                mode === m ? "bg-surface-2 text-text" : "text-text-faint"
              }`}
            >
              {m === "signin" ? "Sign in" : "Create account"}
            </button>
          ))}
        </div>

        <form
          key={mode}
          action={isSignUp ? signUpAction : signInAction}
          className="flex flex-col gap-3"
        >
          <input type="hidden" name="next" value={next} />
          {isSignUp && (
            <input
              type="text"
              name="fullName"
              required
              maxLength={80}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Full name"
              autoComplete="name"
              className="rounded-xl border border-border-strong bg-surface px-4 py-3 text-sm outline-none focus:border-ink"
            />
          )}
          <input
            type="email"
            name="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@northeastern.edu"
            autoComplete="email"
            className="rounded-xl border border-border-strong bg-surface px-4 py-3 text-sm outline-none focus:border-ink"
          />
          <input
            type="password"
            name="password"
            required
            minLength={6}
            placeholder={isSignUp ? "Pick a new password" : "Password"}
            autoComplete={isSignUp ? "new-password" : "current-password"}
            className="rounded-xl border border-border-strong bg-surface px-4 py-3 text-sm outline-none focus:border-ink"
          />

          {/*
            The real risk with any club-run site is password reuse, not the
            storage: passwords are hashed by Supabase and nobody here can read
            them. So the warning is about not reusing one, and says why.
          */}
          {isSignUp && (
            <p className="flex items-start gap-2 rounded-xl border border-nu-line bg-nu-wash px-3 py-2.5 text-[13px] leading-relaxed">
              <ShieldIcon />
              <span>
                <span className="font-bold">Make up a new password for this site.</span>{" "}
                Don&rsquo;t reuse your Northeastern login or a password from anywhere else — this
                is a student-run club app, not a university system.
              </span>
            </p>
          )}

          {state && !state.ok && (
            <p className="rounded-lg border border-border-strong bg-surface px-3 py-2.5 text-sm font-semibold">
              {state.error}
            </p>
          )}
          {state?.ok && state.message && (
            <p className="rounded-lg border border-ink bg-ink-dim px-3 py-2.5 text-sm font-semibold">
              {state.message}
            </p>
          )}

          <SubmitButton
            pendingLabel="Working…"
            className="rounded-xl bg-nu transition-colors hover:bg-nu-deep px-4 py-3 text-sm font-bold text-white"
          >
            {isSignUp ? "Create account" : "Sign in"}
          </SubmitButton>
        </form>

        <p className="mt-5 text-center text-sm text-text-dim">
          {isSignUp ? "Already have an account? " : "New to the club? "}
          <button
            type="button"
            onClick={() => setMode(isSignUp ? "signin" : "signup")}
            className="font-bold underline"
          >
            {isSignUp ? "Sign in" : "Create an account"}
          </button>
        </p>
      </div>
    </div>
  );
}

function ShieldIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--nu-accent)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mt-0.5 shrink-0"
      aria-hidden
    >
      <path d="M12 3 5 6v6c0 5 3 8 7 9 4-1 7-4 7-9V6Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}
