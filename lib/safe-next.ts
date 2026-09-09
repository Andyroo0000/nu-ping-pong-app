/**
 * Only ever redirect within this app. A `?next=` value arrives from the URL,
 * so it can't be trusted to be a path at all, let alone one of ours.
 */
export function safeNext(value: string | null | undefined): string {
  if (!value) return "/leaderboard";
  if (!value.startsWith("/") || value.startsWith("//")) return "/leaderboard";
  return value;
}
