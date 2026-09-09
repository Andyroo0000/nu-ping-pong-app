// Where the club plays. Add or rename entries here — the matchmaking form
// builds its dropdown straight from this list, and anything not covered is
// handled by the "Somewhere else" option's free-text box.

export const HALL_GROUPS: { label: string; halls: string[] }[] = [
  {
    label: "Residence halls",
    halls: [
      "Orchard Meadow Hall",
      "Warren Olney Hall",
      "Mary Morse Hall",
      "Ege Hall",
      "Reinhardt Hall",
      "White Hall",
    ],
  },
  {
    label: "Apartments & houses",
    halls: [
      "Prospect Hill Apartments",
      "Underwood Apartments",
      "Clare Springs House",
      "Vivian Stephenson House",
      "Joan Danforth House",
      "Courtyard Townhouses",
    ],
  },
];

/** Sentinel value for the "Somewhere else" dropdown option. */
export const OTHER_HALL = "__other__";

export const HALLS: string[] = HALL_GROUPS.flatMap((group) => group.halls);

export const PLAY_STYLES = [
  {
    value: "quick",
    label: "Quick play",
    blurb: "One match and done",
  },
  {
    value: "long",
    label: "Long play",
    blurb: "Sticking around for a few",
  },
] as const;

export type PlayStyle = (typeof PLAY_STYLES)[number]["value"];

export function playStyleLabel(value: string | null | undefined): string | null {
  return PLAY_STYLES.find((style) => style.value === value)?.label ?? null;
}

export function normalizePlayStyle(value: unknown): PlayStyle {
  return value === "quick" ? "quick" : "long";
}
