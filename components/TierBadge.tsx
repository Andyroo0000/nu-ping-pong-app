import { tierForRating } from "@/lib/tiers";

export function TierBadge({ rating, className = "" }: { rating: number; className?: string }) {
  const tier = tierForRating(rating);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-border-strong bg-surface-2 px-3 py-1 text-xs font-bold text-text ${className}`}
    >
      {tier.name}
    </span>
  );
}
