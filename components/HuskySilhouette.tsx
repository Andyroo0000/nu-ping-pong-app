/**
 * Geometric husky head, for use as large low-opacity background art. Original
 * artwork, not Northeastern's Paws.
 *
 * Drawn as one flat shape with cut-out eyes and snout so it still reads at low
 * opacity behind text, where internal shading would just turn to mud. Ears are
 * short and broad and the skull is wide on purpose — the first version had
 * tall narrow ears and read as a cat.
 */
export function HuskySilhouette({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M40 86 58 40l30 30a76 76 0 0 1 24 0l30-30 18 46a78 78 0 1 1-120 0Zm38 24a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm44 0a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-22 32-12 19h24Z"
        fill="currentColor"
      />
    </svg>
  );
}
