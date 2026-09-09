// Placeholders that go in the prerendered static shell. They're what makes a
// navigation feel immediate: the page frame paints straight away and the
// per-player data streams into these slots when the database answers.

function Shimmer({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-surface-2 ${className}`} />;
}

export function NavSkeleton() {
  return (
    <div className="flex items-center justify-between border-b-2 border-nu bg-bg-alt px-6 py-4">
      <div className="flex items-center gap-3">
        <Shimmer className="h-7 w-7 rounded-full" />
        <Shimmer className="h-4 w-32" />
      </div>
      <div className="hidden items-center gap-8 sm:flex">
        <Shimmer className="h-3.5 w-20" />
        <Shimmer className="h-3.5 w-24" />
        <Shimmer className="h-3.5 w-12" />
      </div>
      <div className="flex items-center gap-4">
        <Shimmer className="h-3.5 w-16" />
        <Shimmer className="h-3.5 w-16" />
      </div>
    </div>
  );
}

export function LadderSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="mt-8 flex flex-col">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-border py-3">
          <Shimmer className="h-3.5 w-3" />
          <Shimmer className="h-10 w-10 shrink-0 rounded-full" />
          <div className="flex-1">
            <Shimmer className="h-3.5 w-36" />
            <Shimmer className="mt-2 h-3 w-24" />
          </div>
          <div className="flex flex-col items-end gap-2">
            <Shimmer className="h-4 w-12" />
            <Shimmer className="h-3 w-14" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`rounded-2xl border border-border bg-surface p-4 ${className}`}>
      <Shimmer className="h-3 w-24" />
      <Shimmer className="mt-2 h-7 w-28" />
      <Shimmer className="mt-4 h-1.5 w-full rounded-full" />
    </div>
  );
}

export function RowsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2.5">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-3.5 py-3"
        >
          <Shimmer className="h-[42px] w-[42px] shrink-0 rounded-full" />
          <div className="flex-1">
            <Shimmer className="h-3.5 w-32" />
            <Shimmer className="mt-2 h-3.5 w-16" />
          </div>
          <Shimmer className="h-9 w-20 rounded-[9px]" />
        </div>
      ))}
    </div>
  );
}

export function ProfileSkeleton() {
  return (
    <div className="mx-auto max-w-md px-6 py-10">
      <div className="flex flex-col items-center gap-3">
        <Shimmer className="h-20 w-20 rounded-full" />
        <Shimmer className="h-5 w-40" />
        <Shimmer className="h-3.5 w-24" />
        <Shimmer className="h-11 w-32" />
      </div>
      <div className="mt-7 grid grid-cols-3 gap-2.5">
        {Array.from({ length: 3 }).map((_, i) => (
          <Shimmer key={i} className="h-[74px] rounded-xl" />
        ))}
      </div>
      <Shimmer className="mt-8 h-[152px] rounded-2xl" />
    </div>
  );
}

export function ChatSkeleton() {
  const widths = ["w-[70%]", "w-[45%]", "w-[60%]", "w-[35%]"];
  return (
    <div className="flex-1 space-y-3 px-4 py-4">
      {widths.map((width, i) => (
        <div key={i} className={i % 2 ? "flex justify-end" : ""}>
          <Shimmer className={`h-10 rounded-2xl ${width}`} />
        </div>
      ))}
    </div>
  );
}
