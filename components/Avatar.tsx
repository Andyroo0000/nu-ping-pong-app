import { initials } from "@/lib/names";

export function Avatar({
  player,
  size = 40,
  className = "",
}: {
  player: { full_name?: string | null; username?: string | null };
  size?: number;
  className?: string;
}) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full bg-surface-2 font-bold ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.3)) }}
      aria-hidden
    >
      {initials(player)}
    </div>
  );
}
