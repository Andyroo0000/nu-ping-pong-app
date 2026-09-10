import { tierForRating, tierProgress, nextTierAt, type Tier } from "@/lib/tiers";
import { PaddleIcon } from "@/components/PaddleIcon";

type Size = "sm" | "md" | "lg";

const SIZES: Record<Size, { pad: string; text: string; icon: number; gap: string }> = {
  sm: { pad: "px-2 py-0.5", text: "text-[11px]", icon: 11, gap: "gap-1" },
  md: { pad: "px-2.5 py-1", text: "text-xs", icon: 13, gap: "gap-1.5" },
  lg: { pad: "px-3.5 py-1.5", text: "text-sm", icon: 16, gap: "gap-2" },
};

/**
 * The rank badge. Each tier gets its own accent colour, a paddle in that
 * colour, and one pip per level, so the six tiers are told apart at a glance
 * and climbing one actually looks like something.
 */
export function TierBadge({
  rating,
  size = "md",
  short = false,
  className = "",
}: {
  rating: number;
  size?: Size;
  /** Use the abbreviated tier name — for tight rows. */
  short?: boolean;
  className?: string;
}) {
  const tier = tierForRating(rating);
  const s = SIZES[size];

  return (
    <span
      className={`inline-flex items-center ${s.gap} ${s.pad} rounded-full border font-bold ${s.text} ${className}`}
      style={{
        color: tier.color,
        borderColor: `color-mix(in oklab, ${tier.color} 38%, transparent)`,
        background: `color-mix(in oklab, ${tier.color} 9%, var(--bg))`,
      }}
      title={`${tier.name} · ${tier.min}${Number.isFinite(tier.max) ? `–${tier.max}` : "+"}`}
    >
      <PaddleIcon size={s.icon} color={tier.color} />
      {short ? tier.short : tier.name}
      <Pips level={tier.level} color={tier.color} />
    </span>
  );
}

function Pips({ level, color }: { level: number; color: string }) {
  return (
    <span className="ml-0.5 inline-flex items-center gap-[2px]" aria-hidden>
      {Array.from({ length: 6 }).map((_, i) => (
        <span
          key={i}
          className="block h-[3px] w-[3px] rounded-full"
          style={{
            background: color,
            opacity: i < level ? 1 : 0.22,
          }}
        />
      ))}
    </span>
  );
}

/**
 * The badge plus a progress bar toward the next tier. For profile pages, where
 * "how close am I?" is the thing people actually want to know.
 */
export function TierProgress({ rating, className = "" }: { rating: number; className?: string }) {
  const tier = tierForRating(rating);
  const progress = tierProgress(rating);
  const next = nextTierAt(rating);

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-3">
        <TierBadge rating={rating} size="lg" />
        <div className="shrink-0 text-right text-[11px] font-bold text-text-faint">
          {next ? (
            <>
              {next.needed} to{" "}
              <span style={{ color: next.tier.color }}>{next.tier.short}</span>
            </>
          ) : (
            "Top rank"
          )}
        </div>
      </div>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{
            width: `${Math.round(progress * 100)}%`,
            background: `linear-gradient(90deg, color-mix(in oklab, ${tier.color} 55%, white), ${tier.color})`,
          }}
        />
      </div>
    </div>
  );
}

/** Icon-only badge for very tight spots. */
export function TierDot({ rating, size = 18 }: { rating: number; size?: number }) {
  const tier: Tier = tierForRating(rating);
  return (
    <span
      className="inline-flex items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        background: `color-mix(in oklab, ${tier.color} 14%, var(--bg))`,
      }}
      title={tier.name}
    >
      <PaddleIcon size={Math.round(size * 0.66)} color={tier.color} />
    </span>
  );
}
