"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { FORMATS, matchCount } from "@/lib/bracket";
import { createTournament } from "@/app/actions";
import type { ActionResult } from "@/app/actions";

const FIELD =
  "w-full rounded-xl border border-border-strong bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-nu";

/**
 * Collapsed to one button until tapped. The format matters most, so it gets
 * the explanation — most people have played in a bracket without ever being
 * told what "double elimination" means.
 */
export function NewTournament() {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<(typeof FORMATS)[number]["value"]>("single_elim");
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    (_previous, formData) => createTournament(formData),
    null
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-5 w-full rounded-xl bg-nu py-3.5 text-sm font-bold text-white transition-colors hover:bg-nu-deep"
      >
        Start a tournament
      </button>
    );
  }

  const chosen = FORMATS.find((f) => f.value === format)!;

  return (
    <form action={formAction} className="mt-5 flex flex-col gap-2.5">
      <input
        name="name"
        required
        maxLength={80}
        placeholder="Name it — e.g. Friday night bracket"
        className={FIELD}
      />

      <div className="flex flex-col gap-1.5">
        {FORMATS.map((f) => (
          <label
            key={f.value}
            className={`cursor-pointer rounded-xl border px-3.5 py-2.5 ${
              format === f.value ? "border-nu bg-nu-wash" : "border-border"
            }`}
          >
            <input
              type="radio"
              name="format"
              value={f.value}
              checked={format === f.value}
              onChange={() => setFormat(f.value)}
              className="sr-only"
            />
            <span className="block text-sm font-bold">{f.label}</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-text-dim">{f.blurb}</span>
          </label>
        ))}
      </div>

      <div className="flex gap-1.5 rounded-[11px] bg-surface p-1">
        {[
          { value: "singles", label: "Singles" },
          { value: "doubles", label: "Doubles" },
        ].map((option, i) => (
          <label
            key={option.value}
            className="flex-1 cursor-pointer rounded-[9px] py-2 text-center text-[13px] font-bold text-text-dim has-checked:bg-surface-2 has-checked:text-text"
          >
            <input
              type="radio"
              name="mode"
              value={option.value}
              defaultChecked={i === 0}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>

      <div className="flex gap-1.5 rounded-[11px] bg-surface p-1">
        {[
          { value: "ranked", label: "Ranked" },
          { value: "casual", label: "Casual" },
        ].map((option, i) => (
          <label
            key={option.value}
            className="flex-1 cursor-pointer rounded-[9px] py-2 text-center text-[13px] font-bold text-text-dim has-checked:bg-surface-2 has-checked:text-text"
          >
            <input
              type="radio"
              name="matchKind"
              value={option.value}
              defaultChecked={i === 0}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>
      <p className="text-xs text-text-faint">
        Ranked tournament matches move ratings once the loser confirms the score, the same as any
        other match.
      </p>

      <div className="flex gap-1.5 rounded-[11px] bg-surface p-1">
        {[1, 3, 5].map((n, i) => (
          <label
            key={n}
            className="flex-1 cursor-pointer rounded-[9px] py-2 text-center text-[13px] font-bold text-text-dim has-checked:bg-surface-2 has-checked:text-text"
          >
            <input
              type="radio"
              name="bestOf"
              value={String(n)}
              defaultChecked={i === 1}
              className="sr-only"
            />
            {n === 1 ? "One game" : `Best of ${n}`}
          </label>
        ))}
      </div>

      <p className="rounded-xl border border-border bg-surface px-3 py-2.5 text-xs leading-relaxed text-text-dim">
        {chosen.label} with 8 entrants is {matchCount(chosen.value, 8)} matches; with 16 it&rsquo;s{" "}
        {matchCount(chosen.value, 16)}.
      </p>

      {state?.ok === false && (
        <p className="text-xs font-semibold text-nu-accent">{state.error}</p>
      )}

      <Submit />
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-xs font-bold text-text-faint"
      >
        Cancel
      </button>
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-xl bg-nu py-3.5 text-sm font-bold text-white transition-colors hover:bg-nu-deep disabled:opacity-60"
    >
      {pending ? "Creating…" : "Create it"}
    </button>
  );
}
