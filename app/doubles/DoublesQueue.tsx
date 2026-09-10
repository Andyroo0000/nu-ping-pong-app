"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { HallSelect } from "@/components/HallSelect";
import { findDoublesInHall } from "@/app/actions";
import type { ActionResult } from "@/app/actions";

/**
 * "Find me a doubles game" — join the queue for a hall and wait for four.
 *
 * You queue alone, not as a pair: if you already had a partner you wouldn't
 * need matchmaking, you'd just set the match up below. This is for turning up
 * on your own and getting a game.
 */
export function DoublesQueue({
  defaultHall,
  searched,
  waiting,
  waitingByHall,
}: {
  defaultHall?: string | null;
  searched?: boolean;
  waiting?: number;
  waitingByHall: { location: string; waiting: number }[];
}) {
  const [open, setOpen] = useState(Boolean(searched));
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    (_previous, formData) => findDoublesInHall(formData),
    null
  );

  return (
    <div className="mt-5 rounded-2xl border-2 border-nu-line bg-nu-wash p-4">
      <div className="text-sm font-bold">Turn up on your own?</div>
      <p className="mt-1 text-[13px] leading-relaxed text-text-dim">
        Join the doubles queue for your hall. When four people are waiting, teams get picked
        automatically — strongest with weakest, so the game stays close.
      </p>

      {searched && (
        <p className="mt-3 rounded-xl border border-border-strong bg-bg px-3 py-2.5 text-[13px] font-semibold">
          You&rsquo;re in the queue
          {defaultHall ? ` at ${defaultHall}` : ""}.{" "}
          {waiting != null && waiting < 4
            ? `${waiting} waiting — ${4 - waiting} more needed.`
            : "Waiting for a four."}
          <span className="mt-1 block font-normal text-text-faint">
            You&rsquo;ll get a notification the moment it fills. Your spot lasts two hours.
          </span>
        </p>
      )}

      {waitingByHall.length > 0 && (
        <div className="mt-3">
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-text-faint">
            Already waiting
          </div>
          <div className="flex flex-col gap-1">
            {waitingByHall.map((h) => (
              <div
                key={h.location}
                className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-[13px]"
              >
                <span className="min-w-0 truncate font-semibold">{h.location}</span>
                <span className="shrink-0 font-bold text-text-dim">
                  {h.waiting} of 4
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {open ? (
        <form action={formAction} className="mt-3 flex flex-col gap-2">
          <HallSelect defaultValue={defaultHall} />
          <Submit />
          {state?.ok === false && (
            <p className="text-xs font-semibold text-nu-accent">{state.error}</p>
          )}
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 w-full rounded-xl bg-nu py-3.5 text-sm font-bold text-white transition-colors hover:bg-nu-deep"
        >
          Find me a doubles game
        </button>
      )}

      <Link
        href="/chats"
        className="mt-2 block text-center text-xs font-bold text-nu-accent underline"
      >
        Your chats
      </Link>
    </div>
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
      {pending ? "Looking for a four…" : "Join the doubles queue"}
    </button>
  );
}
