/**
 * The white line down the middle of a table, used as a section divider. Small
 * thing, but it's the kind of detail that makes a page feel like it belongs to
 * a sport rather than to a dashboard template.
 */
export function NetRule({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className}`} aria-hidden>
      <div className="net-rule flex-1 rounded-full" />
      <svg width="12" height="12" viewBox="0 0 12 12" className="shrink-0">
        <circle cx="6" cy="6" r="5" fill="var(--nu-red)" opacity="0.85" />
      </svg>
      <div className="net-rule flex-1 rounded-full" />
    </div>
  );
}
