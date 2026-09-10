"use client";

import { useState } from "react";
import { Welcome } from "@/components/Welcome";

/**
 * Re-opens the walkthrough on demand.
 *
 * The same four cards as the first run, rather than a separate rules page:
 * one copy to keep correct, and the thing people want to look up again is
 * exactly what the walkthrough already says.
 */
export function HowToPlay({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        How to play
      </button>
      {open && <Welcome onClose={() => setOpen(false)} />}
    </>
  );
}
