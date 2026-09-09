"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { HALL_GROUPS, OTHER_HALL, PLAY_STYLES } from "@/lib/halls";
import { findMatchInHall } from "@/app/actions";
import type { ActionResult } from "@/app/actions";

const FIELD =
  "w-full rounded-xl border border-border-strong bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-ink";

/**
 * One button that opens the two questions matchmaking actually needs — which
 * hall, and how much you want to play — then searches that hall.
 */
export function MatchmakingForm({
  defaultHall,
  defaultStyle,
  label = "Matchmaking",
}: {
  defaultHall?: string | null;
  defaultStyle?: string | null;
  label?: string;
}) {
  const [open, setOpen] = useState(Boolean(defaultHall));
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    (_previous, formData) => findMatchInHall(formData),
    null
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-xl bg-ink py-3.5 text-sm font-bold text-white"
      >
        {label}
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <HallSelect defaultValue={defaultHall} />
      <div className="flex gap-1.5 rounded-[11px] bg-surface p-1">
        {PLAY_STYLES.map((style) => (
          <label
            key={style.value}
            className="flex-1 cursor-pointer rounded-[9px] px-2 py-2 text-center text-[13px] font-bold text-text-dim has-checked:bg-surface-2 has-checked:text-text"
          >
            <input
              type="radio"
              name="playStyle"
              value={style.value}
              defaultChecked={
                defaultStyle ? defaultStyle === style.value : style.value === "quick"
              }
              className="sr-only"
            />
            <span className="block">{style.label}</span>
            <span className="mt-0.5 block text-[10px] font-semibold text-text-faint">
              {style.blurb}
            </span>
          </label>
        ))}
      </div>
      {state && !state.ok && (
        <p className="text-[13px] font-semibold text-text-dim">{state.error}</p>
      )}
      <SearchButton label={label} />
    </form>
  );
}

function SearchButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-xl bg-ink py-3.5 text-sm font-bold text-white disabled:opacity-50"
    >
      {pending ? "Looking for someone…" : label}
    </button>
  );
}

function HallSelect({ defaultValue }: { defaultValue?: string | null }) {
  const known = Boolean(defaultValue) && HALL_GROUPS.some((g) => g.halls.includes(defaultValue!));
  const [choice, setChoice] = useState(
    defaultValue ? (known ? defaultValue : OTHER_HALL) : ""
  );

  return (
    <>
      <select
        name="hall"
        required
        value={choice}
        onChange={(e) => setChoice(e.target.value)}
        aria-label="Which hall are you playing in?"
        className={FIELD}
      >
        <option value="">Which hall are you in?</option>
        {HALL_GROUPS.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.halls.map((hall) => (
              <option key={hall} value={hall}>
                {hall}
              </option>
            ))}
          </optgroup>
        ))}
        <option value={OTHER_HALL}>Somewhere else…</option>
      </select>

      {choice === OTHER_HALL && (
        <input
          name="otherHall"
          defaultValue={known ? "" : (defaultValue ?? "")}
          maxLength={120}
          required
          placeholder="Where? e.g. rec center, 3rd floor lounge"
          aria-label="Other location"
          className={FIELD}
        />
      )}
    </>
  );
}
