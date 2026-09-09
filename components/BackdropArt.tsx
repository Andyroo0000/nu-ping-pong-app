import { PaddleArt } from "@/components/PaddleArt";

/**
 * Faint paddle behind an in-app page, so a short leaderboard doesn't read as
 * an empty rectangle.
 *
 * Cropped into the top corner and kept quiet — these are screens people read
 * while standing next to a table, not screens they admire. The landing page is
 * where the atmosphere lives.
 *
 * Needs `isolate` on the page container: a `z-index: -1` child paints *behind*
 * its parent's own background unless that parent is a stacking context, so
 * without it this is invisible.
 */
export function BackdropArt() {
  return (
    <div className="backdrop-art" aria-hidden>
      <PaddleArt
        trajectory={false}
        className="absolute -right-16 -top-12 h-[240px] w-[240px] text-text/[0.045] sm:-right-20 sm:h-[320px] sm:w-[320px]"
      />
    </div>
  );
}
