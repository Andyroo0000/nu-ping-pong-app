/**
 * Large decorative paddle and ball, for background art.
 *
 * This replaced a husky silhouette that never read as a husky — at the
 * opacities background art runs at, an animal head is ambiguous, while a
 * paddle is unmistakable from its outline alone. It's also the right motif for
 * a ping pong club, and sidesteps the trademark question around Northeastern's
 * athletics husky entirely.
 *
 * Same proportions as the paddle in every tier badge, drawn large: a solid
 * face, a long narrow handle, and the ball caught mid-flight with its
 * trajectory behind it.
 */
export function PaddleArt({
  className = "",
  trajectory = true,
}: {
  className?: string;
  /** The dashed arc behind the ball. Drop it for tight crops. */
  trajectory?: boolean;
}) {
  return (
    <svg viewBox="0 0 220 220" fill="none" className={className} aria-hidden="true">
      {trajectory && (
        <path
          d="M14 206c26-54 62-92 108-116"
          stroke="currentColor"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray="3 22"
          opacity="0.7"
        />
      )}

      {/* Solid face, no inner ring. A ring inside the face reads as a lens
          and turns the whole thing into a magnifying glass. */}
      <g transform="rotate(-28 106 108)">
        <ellipse cx="106" cy="92" rx="58" ry="64" fill="currentColor" />
        {/* Handle long and narrow: the handle's proportions are what say
            "paddle" rather than "pan". */}
        <rect x="91" y="150" width="30" height="66" rx="15" fill="currentColor" />
      </g>

      {/* Ball kept small relative to the face, as it is in life. */}
      <circle cx="186" cy="40" r="13" fill="currentColor" />
    </svg>
  );
}
