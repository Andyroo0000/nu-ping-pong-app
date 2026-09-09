import { initials } from "@/lib/names";
import { avatarUrl } from "@/lib/avatar";

type AvatarPlayer = {
  full_name?: string | null;
  username?: string | null;
  avatar_path?: string | null;
};

export function Avatar({
  player,
  size = 40,
  className = "",
}: {
  player: AvatarPlayer;
  size?: number;
  className?: string;
}) {
  const url = avatarUrl(player.avatar_path);

  if (url) {
    return (
      // A plain <img>: these are small, already-resized squares on a Supabase
      // CDN, so next/image's optimiser would add a hop without saving bytes.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        className={`shrink-0 rounded-full bg-surface-2 object-cover ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

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
