// The vocabulary behind the profile form and the badges on a profile page.
// Values here are mirrored by check constraints in migration 0005, so adding
// an option means adding it in both places.

export const YEARS = [
  { value: "first-year", label: "First-year" },
  { value: "sophomore", label: "Sophomore" },
  { value: "junior", label: "Junior" },
  { value: "senior", label: "Senior" },
  { value: "grad", label: "Grad student" },
  { value: "faculty", label: "Faculty" },
  { value: "staff", label: "Staff" },
] as const;

export const AVAILABILITY = [
  { value: "weekday-morning", label: "Weekday mornings" },
  { value: "weekday-afternoon", label: "Weekday afternoons" },
  { value: "weekday-evening", label: "Weekday evenings" },
  { value: "weekend-morning", label: "Weekend mornings" },
  { value: "weekend-afternoon", label: "Weekend afternoons" },
  { value: "weekend-evening", label: "Weekend evenings" },
] as const;

export const PLAY_PREFERENCES = [
  {
    value: "casual",
    label: "Casual",
    blurb: "Here to rally and meet people",
  },
  {
    value: "competitive",
    label: "Competitive",
    blurb: "Here to climb the ladder",
  },
  {
    value: "both",
    label: "Both",
    blurb: "Happy either way",
  },
] as const;

export type Year = (typeof YEARS)[number]["value"];
export type AvailabilitySlot = (typeof AVAILABILITY)[number]["value"];
export type PlayPreference = (typeof PLAY_PREFERENCES)[number]["value"];

export const YEAR_VALUES = YEARS.map((y) => y.value) as readonly string[];
export const AVAILABILITY_VALUES = AVAILABILITY.map((a) => a.value) as readonly string[];

export function yearLabel(value: string | null | undefined): string | null {
  return YEARS.find((y) => y.value === value)?.label ?? null;
}

export function availabilityLabels(values: string[] | null | undefined): string[] {
  if (!values?.length) return [];
  // Keep the canonical order rather than however they came out of the array.
  return AVAILABILITY.filter((slot) => values.includes(slot.value)).map((slot) => slot.label);
}

export function playPreferenceLabel(value: string | null | undefined): string {
  return PLAY_PREFERENCES.find((p) => p.value === value)?.label ?? "Both";
}

export function normalizePlayPreference(value: unknown): PlayPreference {
  return value === "casual" || value === "competitive" ? value : "both";
}

/** Enough filled in that the player isn't a blank card to everyone else. */
export function isProfileStarted(profile: {
  full_name?: string | null;
  bio?: string | null;
  avatar_path?: string | null;
}): boolean {
  return Boolean(profile.full_name?.trim() && (profile.bio?.trim() || profile.avatar_path));
}
