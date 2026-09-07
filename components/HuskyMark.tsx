// Original geometric husky-head mark — not a reproduction of Northeastern's
// official trademarked athletics logo.
export function HuskyMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="32" height="32" rx="9" fill="var(--ink)" />
      <path d="M8 13 12 4 15 14Z" fill="oklch(99% 0 0)" />
      <path d="M26 13 22 4 19 14Z" fill="oklch(99% 0 0)" />
      <circle cx="17" cy="19" r="9" fill="oklch(99% 0 0)" />
      <circle cx="13.5" cy="17.5" r="1.3" fill="var(--ink)" />
      <circle cx="20.5" cy="17.5" r="1.3" fill="var(--ink)" />
      <path d="M15.5 22.5 17 25 18.5 22.5Z" fill="var(--ink)" />
    </svg>
  );
}
