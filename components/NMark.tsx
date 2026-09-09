/**
 * The club mark: a geometric slab N with a paddle behind it and the ball
 * resting in the N's upper notch.
 *
 * Original artwork — deliberately NOT a reproduction of Northeastern's
 * trademarked "N" or of Paws. It reads as "N" at 20px, and the paddle only
 * becomes obvious at larger sizes, which is the right way round: the mark has
 * to survive being a favicon first.
 */
export function NMark({
  size = 34,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <rect width="40" height="40" rx="10" fill="var(--nu-red)" />

      {/* Paddle, angled behind the letter. A soft white wash rather than a
          darker red — deep red on red was too low-contrast to read as a
          shape at all, and just looked like a printing smudge. */}
      <g transform="rotate(-24 20 20)" opacity="0.16">
        <ellipse cx="20" cy="16.5" rx="12.5" ry="13.5" fill="#fff" />
        <rect x="17" y="27.5" width="6" height="12" rx="3" fill="#fff" />
      </g>

      {/* Slab N */}
      <path
        d="M9 31.5V10.5h5.6l11.2 14.2V10.5H31V31.5h-5.6L14.2 17.3V31.5Z"
        fill="#fff"
      />

      {/* The ball, in the notch at the top right. The larger red circle
          underneath knocks a gap out of the letter — without it the white
          ball merges into the white N and stops reading as a ball. */}
      <circle cx="31.4" cy="8.6" r="5.3" fill="var(--nu-red)" />
      <circle cx="31.4" cy="8.6" r="3.5" fill="#fff" />
    </svg>
  );
}

/** Mark plus name, for navs and the login screen. */
export function Wordmark({
  size = 28,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <NMark size={size} />
      <span className="font-display text-base font-bold leading-none tracking-tight">
        NU <span className="text-nu-accent">Ping Pong</span>
      </span>
    </span>
  );
}
