"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Avatar } from "@/components/Avatar";
import { createClient } from "@/lib/supabase/client";
import { resizeToAvatar } from "@/lib/resize-image";
import { HALL_GROUPS, OTHER_HALL } from "@/lib/halls";
import { AVAILABILITY, PLAY_PREFERENCES, YEARS } from "@/lib/profile";
import { saveProfile, setAvatarPath } from "@/app/actions";
import type { ActionResult } from "@/app/actions";

const FIELD =
  "w-full rounded-xl border border-border-strong bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-ink";

type Profile = {
  id: string;
  username: string;
  full_name: string | null;
  bio: string | null;
  year: string | null;
  home_hall: string | null;
  availability: string[];
  play_preference: string;
  avatar_path: string | null;
};

export function ProfileForm({ profile }: { profile: Profile }) {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    (_previous, formData) => saveProfile(formData),
    null
  );

  return (
    <>
      <AvatarField profile={profile} />

      <form action={formAction} className="mt-7 flex flex-col gap-5">
        <Field label="Name" hint="Shown everywhere instead of your username.">
          <input
            name="fullName"
            required
            maxLength={80}
            defaultValue={profile.full_name ?? ""}
            placeholder="Your name"
            className={FIELD}
          />
        </Field>

        <Field label="About you" hint="A couple of sentences. 400 characters max.">
          <textarea
            name="bio"
            rows={4}
            maxLength={400}
            defaultValue={profile.bio ?? ""}
            placeholder="Been playing since high school, mostly here to rally and meet people. Left-handed, terrible backhand."
            className={`${FIELD} resize-y`}
          />
        </Field>

        <Field label="Are you here to rally or to climb?">
          <div className="flex flex-col gap-1.5 rounded-[11px] bg-surface p-1 sm:flex-row">
            {PLAY_PREFERENCES.map((option) => (
              <label
                key={option.value}
                className="flex-1 cursor-pointer rounded-[9px] px-3 py-2.5 text-center has-checked:bg-surface-2"
              >
                <input
                  type="radio"
                  name="playPreference"
                  value={option.value}
                  defaultChecked={profile.play_preference === option.value}
                  className="sr-only"
                />
                <span className="block text-[13px] font-bold">{option.label}</span>
                <span className="mt-0.5 block text-[11px] font-semibold text-text-faint">
                  {option.blurb}
                </span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-text-dim">
            Matchmaking uses this to pair you with people looking for the same thing.
          </p>
        </Field>

        <Field label="Year">
          <select name="year" defaultValue={profile.year ?? ""} className={FIELD}>
            <option value="">Prefer not to say</option>
            {YEARS.map((y) => (
              <option key={y.value} value={y.value}>
                {y.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Home hall" hint="Helps people find someone who plays nearby.">
          <HallSelect defaultValue={profile.home_hall} />
        </Field>

        <Field label="When you usually play">
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {AVAILABILITY.map((slot) => (
              <label
                key={slot.value}
                className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-border bg-surface px-3 py-2.5 text-[13px] font-semibold has-checked:border-ink has-checked:bg-ink-dim"
              >
                <input
                  type="checkbox"
                  name="availability"
                  value={slot.value}
                  defaultChecked={profile.availability?.includes(slot.value)}
                  className="h-4 w-4 accent-[var(--ink)]"
                />
                {slot.label}
              </label>
            ))}
          </div>
        </Field>

        {state && !state.ok && (
          <p className="rounded-lg border border-border-strong bg-surface px-3 py-2.5 text-sm font-semibold">
            {state.error}
          </p>
        )}

        <SaveButton />
      </form>
    </>
  );
}

function AvatarField({ profile }: { profile: Profile }) {
  const [path, setPath] = useState(profile.avatar_path);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("Pick an image file.");
      return;
    }

    setBusy(true);
    try {
      // Resized in the browser, so a 5MB phone photo becomes a ~40KB square
      // before it ever goes over the network.
      const { blob, extension, type } = await resizeToAvatar(file);
      const objectPath = `${profile.id}/${crypto.randomUUID()}.${extension}`;

      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(objectPath, blob, { contentType: type, upsert: false });
      if (uploadError) throw new Error(uploadError.message);

      const fd = new FormData();
      fd.set("path", objectPath);
      const result = await setAvatarPath(fd);
      if (!result.ok) throw new Error(result.error);

      setPath(objectPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That upload didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("path", "");
    const result = await setAvatarPath(fd);
    if (result.ok) setPath(null);
    else setError(result.error);
    setBusy(false);
  }

  return (
    <div className="mt-7 flex items-center gap-4">
      <Avatar player={{ ...profile, avatar_path: path }} size={72} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap gap-2">
          <label
            className={`cursor-pointer rounded-xl bg-nu transition-colors hover:bg-nu-deep px-4 py-2.5 text-[13px] font-bold text-white ${
              busy ? "opacity-50" : ""
            }`}
          >
            {busy ? "Uploading…" : path ? "Change photo" : "Add a photo"}
            <input
              type="file"
              accept="image/*"
              disabled={busy}
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) upload(file);
              }}
            />
          </label>
          {path && (
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="rounded-xl border border-border-strong px-4 py-2.5 text-[13px] font-bold text-text-dim disabled:opacity-50"
            >
              Remove
            </button>
          )}
        </div>
        {error ? (
          <p className="mt-2 text-[13px] font-semibold text-text">{error}</p>
        ) : (
          <p className="mt-2 text-xs text-text-dim">
            Cropped to a square and shrunk on your device before it uploads.
          </p>
        )}
      </div>
    </div>
  );
}

function HallSelect({ defaultValue }: { defaultValue: string | null }) {
  const known = Boolean(defaultValue) && HALL_GROUPS.some((g) => g.halls.includes(defaultValue!));
  const [choice, setChoice] = useState(defaultValue ? (known ? defaultValue : OTHER_HALL) : "");

  return (
    <div className="flex flex-col gap-2">
      <select
        name="hall"
        value={choice}
        onChange={(e) => setChoice(e.target.value)}
        className={FIELD}
      >
        <option value="">Prefer not to say</option>
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
          placeholder="Where do you live?"
          aria-label="Other hall"
          className={FIELD}
        />
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-xs font-bold uppercase tracking-wide text-text-faint">{label}</div>
      {hint && <p className="mt-1 text-xs text-text-dim">{hint}</p>}
      <div className="mt-2">{children}</div>
    </div>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-xl bg-nu transition-colors hover:bg-nu-deep py-3.5 text-sm font-bold text-white disabled:opacity-50"
    >
      {pending ? "Saving…" : "Save profile"}
    </button>
  );
}
