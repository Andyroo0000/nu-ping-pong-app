"use client";

import { useState } from "react";
import { HALL_GROUPS, OTHER_HALL } from "@/lib/halls";

export const HALL_FIELD =
  "w-full rounded-xl border border-border-strong bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-ink";

/**
 * "Which hall are you in?" — a dropdown of the residence halls, with a free
 * text fallback for anywhere else.
 *
 * The fallback matters more than it looks: people play in lounges, the rec
 * centre and rooms that aren't on any list, and a dropdown alone would leave
 * them unable to say where they are. Posts `hall`, plus `otherHall` when
 * "Somewhere else" is chosen — readHall() in app/actions.ts folds the two.
 *
 * Shared by singles matchmaking and the doubles queue so the two can't drift
 * into offering different places to play.
 */
export function HallSelect({ defaultValue }: { defaultValue?: string | null }) {
  const known = Boolean(defaultValue) && HALL_GROUPS.some((g) => g.halls.includes(defaultValue!));
  const [choice, setChoice] = useState(defaultValue ? (known ? defaultValue : OTHER_HALL) : "");

  return (
    <>
      <select
        name="hall"
        required
        value={choice}
        onChange={(e) => setChoice(e.target.value)}
        aria-label="Which hall are you playing in?"
        className={HALL_FIELD}
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
          className={HALL_FIELD}
        />
      )}
    </>
  );
}
