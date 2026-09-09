"use client";

import { useState } from "react";
import { HALL_GROUPS, OTHER_HALL } from "@/lib/halls";

const FIELD =
  "w-full rounded-xl border border-border-strong bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-ink";

/**
 * Hall dropdown with a free-text escape hatch, so the common case is two taps
 * but nobody is locked out of a spot that isn't on the list.
 */
export function HallPicker({ defaultValue }: { defaultValue?: string | null }) {
  const known = defaultValue && HALL_GROUPS.some((g) => g.halls.includes(defaultValue));
  const [choice, setChoice] = useState(
    defaultValue ? (known ? defaultValue : OTHER_HALL) : ""
  );

  return (
    <div className="flex flex-col gap-2">
      <select
        name="hall"
        value={choice}
        onChange={(e) => setChoice(e.target.value)}
        aria-label="Where are you playing?"
        className={FIELD}
      >
        <option value="">Where are you playing?</option>
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
    </div>
  );
}
