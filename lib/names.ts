// full_name is optional (players who signed up before the name field existed,
// or who skipped it), so every place that shows a player goes through here.

export function displayName(player: {
  full_name?: string | null;
  username?: string | null;
}): string {
  const full = player.full_name?.trim();
  if (full) return full;
  const username = player.username?.trim();
  if (username) return `@${username}`;
  return "Unknown player";
}

export function firstName(player: {
  full_name?: string | null;
  username?: string | null;
}): string {
  const name = displayName(player);
  return name.split(" ")[0];
}

export function initials(player: {
  full_name?: string | null;
  username?: string | null;
}): string {
  const source = player.full_name?.trim() || player.username?.trim() || "?";
  const letters = source
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("");
  return (letters || "?").toUpperCase();
}
