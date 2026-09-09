/**
 * Geometric husky head, for large low-opacity background art. Original
 * artwork, not Northeastern's Paws.
 *
 * Ears are short and broad and the skull is wide on purpose — the first
 * version had tall narrow ears and read as a cat.
 *
 * `features` draws the eyes and snout as cut-outs. Turn it off for anything
 * that gets cropped: a partial head with two cropped eye holes in the corner
 * of a banner reads as random dark blobs, where the bare skull-and-ears
 * outline still reads as a husky from any angle.
 */
export function HuskySilhouette({
  className = "",
  features = true,
}: {
  className?: string;
  features?: boolean;
}) {
  const OUTLINE = "M40 86 58 40l30 30a76 76 0 0 1 24 0l30-30 18 46a78 78 0 1 1-120 0Z";
  const FEATURES =
    "Zm38 24a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm44 0a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-22 32-12 19h24Z";

  return (
    <svg viewBox="0 0 200 200" fill="none" className={className} aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d={features ? OUTLINE + FEATURES : OUTLINE}
        fill="currentColor"
      />
    </svg>
  );
}
