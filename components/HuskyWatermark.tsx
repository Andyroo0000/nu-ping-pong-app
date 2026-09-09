import { HuskySilhouette } from "@/components/HuskySilhouette";

/**
 * Barely-there husky behind an in-app page, so a short leaderboard doesn't
 * read as an empty white rectangle.
 *
 * Kept small, cropped into the top corner and very faint on purpose. A large
 * centred version read as a husky staring out of the page, which competes with
 * the content instead of sitting behind it — these are screens people read
 * while standing next to a table, not screens they admire. The landing page is
 * where the atmosphere lives.
 */
export function HuskyWatermark() {
  return (
    <div className="husky-watermark" aria-hidden>
      <HuskySilhouette className="absolute -right-20 -top-16 h-[260px] w-[260px] text-text/[0.032] sm:-right-24 sm:-top-20 sm:h-[340px] sm:w-[340px]"
        features={false}
      />
    </div>
  );
}
