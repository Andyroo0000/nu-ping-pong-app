// Original geometric husky-head mark in Northeastern red — deliberately not a
// reproduction of Northeastern's trademarked athletics logo or of Paws. The
// ball tucked in the corner is what makes it this club's mark rather than a
// generic husky.
export function HuskyMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="32" height="32" rx="9" fill="var(--nu-red)" />
      <path d="M8 13 12 4 15 14Z" fill="#fff" />
      <path d="M26 13 22 4 19 14Z" fill="#fff" />
      <circle cx="17" cy="19" r="8.6" fill="#fff" />
      <circle cx="13.6" cy="17.6" r="1.25" fill="var(--nu-red-deep)" />
      <circle cx="20.4" cy="17.6" r="1.25" fill="var(--nu-red-deep)" />
      <path d="M15.6 22.2 17 24.6 18.4 22.2Z" fill="var(--nu-red-deep)" />
      {/* the ball */}
      <circle cx="28" cy="7.4" r="3.1" fill="#fff" />
      <circle cx="28" cy="7.4" r="3.1" stroke="var(--nu-red-deep)" strokeOpacity="0.35" />
    </svg>
  );
}

/** Wordmark for the nav: mark plus name, with the ball dotting the tone. */
export function Wordmark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <HuskyMark size={size} />
      <span className="font-display text-base font-bold leading-none tracking-tight">
        NU <span className="text-nu-accent">Ping Pong</span>
      </span>
    </span>
  );
}
