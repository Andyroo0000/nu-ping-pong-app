"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { ActionResult } from "@/app/actions";

type ActionFormProps = {
  action: (formData: FormData) => Promise<ActionResult>;
  /** Values posted alongside the form's own inputs. */
  hidden?: Record<string, string | number>;
  className?: string;
  children: React.ReactNode;
  /** Hide the success message (useful when the page itself shows the change). */
  quiet?: boolean;
};

/**
 * A form wired to a Server Action that returns an ActionResult, so the button
 * can show a pending state and any error lands next to the control that caused
 * it instead of blowing up the page.
 */
export function ActionForm({
  action,
  hidden,
  className = "",
  children,
  quiet = false,
}: ActionFormProps) {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    (_previous, formData) => action(formData),
    null
  );

  return (
    <form action={formAction} className={className}>
      {Object.entries(hidden ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={String(value)} />
      ))}
      {children}
      {state && !state.ok && (
        <p className="mt-2 text-[13px] font-semibold text-text-dim">{state.error}</p>
      )}
      {state && state.ok && state.message && !quiet && (
        <p className="mt-2 text-[13px] font-semibold text-text-dim">{state.message}</p>
      )}
    </form>
  );
}

/** Submit button that disables itself while the enclosing form is submitting. */
export function SubmitButton({
  children,
  pendingLabel,
  className = "",
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${className} disabled:opacity-50`}>
      {pending ? (pendingLabel ?? "Working…") : children}
    </button>
  );
}
