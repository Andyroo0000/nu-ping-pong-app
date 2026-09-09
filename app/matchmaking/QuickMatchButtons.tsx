"use client";

import { useFormStatus } from "react-dom";
import { useState } from "react";
import { PLAY_STYLES } from "@/lib/halls";

/**
 * Two submit buttons in one form, each carrying its own play style as the
 * button's name/value — so no client state is needed to say which kind of
 * session the player wants. The click is tracked only to show the pending
 * label on the button that was actually pressed.
 */
export function QuickMatchButtons() {
  const { pending } = useFormStatus();
  const [clicked, setClicked] = useState<string | null>(null);

  return (
    <div className="flex gap-2">
      {PLAY_STYLES.map((style, i) => (
        <button
          key={style.value}
          type="submit"
          name="playStyle"
          value={style.value}
          disabled={pending}
          onClick={() => setClicked(style.value)}
          className={`flex-1 rounded-xl px-3 py-3 text-center disabled:opacity-50 ${
            i === 0
              ? "bg-ink text-white"
              : "border border-ink-bright bg-surface text-text"
          }`}
        >
          <span className="block text-sm font-bold">
            {pending && clicked === style.value ? "Finding…" : style.label}
          </span>
          <span
            className={`mt-0.5 block text-[11px] font-semibold ${
              i === 0 ? "text-white/70" : "text-text-faint"
            }`}
          >
            {style.blurb}
          </span>
        </button>
      ))}
    </div>
  );
}
