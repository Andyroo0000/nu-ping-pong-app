export function RatingChart({ points }: { points: number[] }) {
  if (points.length < 2) {
    return (
      <div className="flex h-[120px] items-center justify-center text-sm text-text-faint">
        Play a few matches to see your rating history.
      </div>
    );
  }

  const w = 322;
  const h = 120;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = Math.max(max - min, 1);

  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * w;
    const y = h - ((p - min) / range) * (h - 20) - 10;
    return [x, y] as const;
  });

  const path = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x} ${y}`).join(" ");
  const area = `${path} L${w} ${h} L0 ${h} Z`;
  const last = coords[coords.length - 1];

  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} fill="none">
      <line x1="0" y1={h * 0.25} x2={w} y2={h * 0.25} stroke="var(--border)" strokeWidth="1" />
      <line x1="0" y1={h * 0.5} x2={w} y2={h * 0.5} stroke="var(--border)" strokeWidth="1" />
      <line x1="0" y1={h * 0.75} x2={w} y2={h * 0.75} stroke="var(--border)" strokeWidth="1" />
      <path d={area} fill="url(#ratingGradient)" />
      <path d={path} stroke="var(--ink-bright)" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="4" fill="var(--ink-bright)" />
      <defs>
        <linearGradient id="ratingGradient" x1="0" y1="0" x2="0" y2={h}>
          <stop offset="0%" stopColor="var(--ink-bright)" stopOpacity="0.25" />
          <stop offset="100%" stopColor="var(--ink-bright)" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}
