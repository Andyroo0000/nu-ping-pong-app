"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { startLiveMatch } from "@/app/actions";

/**
 * Opens a live scoreboard against someone. Collapsed to one button until
 * tapped, because the format and ranked/casual choice only matter once you've
 * decided to actually play.
 */
export function StartLive({
  opponentId,
  label = "Start scoring",
  compact = false,
}: {
  opponentId: string;
  label?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          compact
            ? "whitespace-nowrap rounded-[9px] bg-nu px-3.5 py-2.5 text-xs font-bold text-white"
            : "w-full rounded-xl bg-nu py-3.5 text-sm font-bold text-white transition-colors hover:bg-nu-deep"
        }
      >
        {label}
      </button>
    );
  }

  return (
    <ActionForm action={startLiveMatch} hidden={{ opponentId }} className="flex flex-col gap-2">
      <div className="flex gap-1.5 rounded-[11px] bg-surface p-1">
        {[
          { value: "1", label: "One game" },
          { value: "3", label: "Best of 3" },
          { value: "5", label: "Best of 5" },
        ].map((option, i) => (
          <label
            key={option.value}
            className="flex-1 cursor-pointer rounded-[9px] py-2 text-center text-[13px] font-bold text-text-dim has-checked:bg-surface-2 has-checked:text-text"
          >
            <input
              type="radio"
              name="bestOf"
              value={option.value}
              defaultChecked={i === 1}
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

      <SubmitButton
        pendingLabel="Starting…"
        className="rounded-xl bg-nu py-3.5 text-sm font-bold text-white transition-colors hover:bg-nu-deep"
      >
        Start the scoreboard
      </SubmitButton>
    </ActionForm>
  );
}
