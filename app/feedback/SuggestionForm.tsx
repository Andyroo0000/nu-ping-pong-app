"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ActionForm";
import { sendSuggestion } from "@/app/actions";
import type { ActionResult } from "@/app/actions";

const KINDS = [
  { value: "idea", label: "An idea" },
  { value: "bug", label: "Something's broken" },
  { value: "other", label: "Something else" },
];

export function SuggestionForm() {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    (_previous, formData) => sendSuggestion(formData),
    null
  );

  // Clearing the textarea after a successful send needs the form to remount,
  // otherwise the old text sits there looking unsent.
  const sent = Boolean(state?.ok);

  return (
    <form key={sent ? "sent" : "draft"} action={formAction} className="flex flex-col gap-4">
      <div>
        <label
          htmlFor="suggestion-kind"
          className="text-xs font-bold uppercase tracking-wide text-text-faint"
        >
          What kind of thing?
        </label>
        <select
          id="suggestion-kind"
          name="kind"
          defaultValue="idea"
          className="mt-2 w-full rounded-xl border border-border-strong bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-ink"
        >
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          htmlFor="suggestion-body"
          className="text-xs font-bold uppercase tracking-wide text-text-faint"
        >
          Tell us
        </label>
        <textarea
          id="suggestion-body"
          name="body"
          required
          rows={6}
          maxLength={2000}
          placeholder="The rating drops too fast after one bad night. Could casual matches show up on the ladder separately?"
          className="mt-2 w-full resize-y rounded-xl border border-border-strong bg-surface px-3.5 py-2.5 text-sm text-text outline-none focus:border-ink"
        />
      </div>

      <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border bg-surface px-3.5 py-3">
        <input
          type="checkbox"
          name="anonymous"
          className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--nu-red)]"
        />
        <span className="text-[13px] leading-relaxed">
          <span className="font-bold">Send anonymously</span>
          <span className="mt-0.5 block text-text-dim">
            Your name won&rsquo;t be attached. You won&rsquo;t be able to see it again either,
            so keep a copy if you want to follow up.
          </span>
        </span>
      </label>

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
        pendingLabel="Sending…"
        className="rounded-xl bg-nu py-3.5 text-sm font-bold text-white transition-colors hover:bg-nu-deep"
      >
        Send it
      </SubmitButton>
    </form>
  );
}
