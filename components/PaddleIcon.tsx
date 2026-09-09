/**
 * A table tennis paddle, used as the shape inside every rank badge so a tier
 * reads at a glance before you can make out the name.
 *
 * Drawn bold and simple because it's mostly rendered at 11-16px, where thin
 * strokes and fine detail turn into a smudge. The ball only appears at 18px
 * and up — below that it's a sub-pixel dot that just muddies the silhouette.
 */
export function PaddleIcon({
  size = 14,
  color = "currentColor",
  className = "",
}: {
  size?: number;
  color?: string;
  className?: string;
}) {
  const showBall = size >= 18;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <g transform={showBall ? "rotate(-28 11 12)" : "rotate(-28 12 12)"}>
        <ellipse
          cx={showBall ? 11 : 12}
          cy={showBall ? 9.6 : 9.8}
          rx="7.4"
          ry="8.2"
          fill={color}
        />
        <rect
          x={showBall ? 8.8 : 9.8}
          y="16.6"
          width="4.4"
          height="6.6"
          rx="2.2"
          fill={color}
        />
      </g>
      {showBall && (
        <circle
          cx="19.6"
          cy="4.6"
          r="3.4"
          fill="var(--bg)"
          stroke={color}
          strokeWidth="1.8"
        />
      )}
    </svg>
  );
}
