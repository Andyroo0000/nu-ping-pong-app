"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { StartLive } from "@/components/StartLive";
import {
  blockPlayer,
  reportPlayer,
  sendChallenge,
  startChat,
  unblockPlayer,
} from "@/app/actions";

const REASONS = [
  { value: "harassment", label: "Harassment or abuse" },
  { value: "spam", label: "Spam" },
  { value: "fake-results", label: "Faking match results" },
  { value: "photo", label: "Inappropriate photo or bio" },
  { value: "other", label: "Something else" },
];

/**
 * Chat / Challenge, plus the safety controls behind a disclosure.
 *
 * Block and report are deliberately not buttons you can hit by accident, but
 * they're also not buried: the app has photos, free-text bios and private
 * chat between people who may not know each other, so there has to be a way
 * out that doesn't involve messaging the organiser.
 */
export function PlayerActions({
  playerId,
  firstName,
  isBlocked,
}: {
  playerId: string;
  firstName: string;
  isBlocked: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reporting, setReporting] = useState(false);

  if (isBlocked) {
    return (
      <div className="mt-6 rounded-2xl border border-border-strong bg-surface p-4">
        <div className="text-sm font-bold">You blocked {firstName}</div>
        <p className="mt-1 text-[13px] leading-relaxed text-text-dim">
          They can&rsquo;t message or challenge you, and you won&rsquo;t be matched together.
          They haven&rsquo;t been told.
        </p>
        <ActionForm action={unblockPlayer} hidden={{ otherId: playerId }} className="mt-3">
          <SubmitButton
            pendingLabel="Unblocking…"
            className="rounded-xl border border-border-strong px-4 py-2.5 text-[13px] font-bold text-text-dim"
          >
            Unblock
          </SubmitButton>
        </ActionForm>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <div className="flex gap-2.5">
        <ActionForm action={startChat} hidden={{ otherId: playerId }} className="flex-1" quiet>
          <SubmitButton
            pendingLabel="Opening…"
            className="w-full rounded-xl bg-nu py-3.5 text-sm font-bold text-white transition-colors hover:bg-nu-deep"
          >
            Chat
          </SubmitButton>
        </ActionForm>
        <ActionForm action={sendChallenge} hidden={{ opponentId: playerId }} className="flex-1" quiet>
          <SubmitButton
            pendingLabel="Sending…"
            className="w-full rounded-xl border border-border-strong py-3.5 text-sm font-bold"
          >
            Challenge
          </SubmitButton>
        </ActionForm>
      </div>

      <div className="mt-2.5">
        <StartLive opponentId={playerId} label="Playing now? Start scoring" />
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mt-3 w-full text-center text-xs font-bold text-text-faint underline"
      >
        {open ? "Never mind" : `Block or report ${firstName}`}
      </button>

      {open && (
        <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-border-strong bg-surface p-4">
          {!reporting ? (
            <>
              <div>
                <div className="text-[13px] font-bold">Block {firstName}</div>
                <p className="mt-1 text-xs leading-relaxed text-text-dim">
                  Stops them messaging or challenging you, and keeps matchmaking from
                  pairing you. They aren&rsquo;t told, and you can undo it any time.
                </p>
                <ActionForm action={blockPlayer} hidden={{ otherId: playerId }} className="mt-2.5">
                  <SubmitButton
                    pendingLabel="Blocking…"
                    className="rounded-xl border border-border-strong px-4 py-2.5 text-[13px] font-bold"
                  >
                    Block {firstName}
                  </SubmitButton>
                </ActionForm>
              </div>

              <div className="border-t border-border pt-3">
                <button
                  type="button"
                  onClick={() => setReporting(true)}
                  className="text-[13px] font-bold text-nu-accent underline"
                >
                  Report them to the organiser instead
                </button>
              </div>
            </>
          ) : (
            <ActionForm action={reportPlayer} hidden={{ otherId: playerId }}>
              <div className="text-[13px] font-bold">Report {firstName}</div>
              <p className="mt-1 text-xs leading-relaxed text-text-dim">
                Only the club organiser sees this. {firstName} isn&rsquo;t told.
              </p>
              <select
                name="reason"
                required
                defaultValue=""
                aria-label="Reason"
                className="mt-2.5 w-full rounded-xl border border-border-strong bg-bg px-3.5 py-2.5 text-sm outline-none focus:border-ink"
              >
                <option value="" disabled>
                  Pick a reason…
                </option>
                {REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              <textarea
                name="detail"
                rows={3}
                maxLength={1000}
                placeholder="Anything that would help (optional)"
                aria-label="Details"
                className="mt-2 w-full resize-y rounded-xl border border-border-strong bg-bg px-3.5 py-2.5 text-sm text-text outline-none focus:border-ink"
              />
              <div className="mt-2.5 flex gap-2">
                <SubmitButton
                  pendingLabel="Sending…"
                  className="rounded-xl bg-nu px-4 py-2.5 text-[13px] font-bold text-white"
                >
                  Send report
                </SubmitButton>
                <button
                  type="button"
                  onClick={() => setReporting(false)}
                  className="rounded-xl border border-border-strong px-4 py-2.5 text-[13px] font-bold text-text-dim"
                >
                  Back
                </button>
              </div>
            </ActionForm>
          )}
        </div>
      )}
    </div>
  );
}
