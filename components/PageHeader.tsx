import { HuskySilhouette } from "@/components/HuskySilhouette";

/**
 * Dark banner at the top of an in-app page: title, a line of context, and
 * optionally something trailing (a stat, a toggle).
 *
 * Carries the landing page's table motif inward — the net line along the
 * bottom edge, the husky in the corner — so the app feels like the same place
 * as the front door. The content below stays light and quiet, which is the
 * split that keeps a leaderboard readable while giving the page an identity.
 */
export function PageHeader({
  title,
  subtitle,
  eyebrow,
  trailing,
  children,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  /** Sits opposite the title — a stat, a count, an online indicator. */
  trailing?: React.ReactNode;
  /** Sits under the title, inside the banner — tabs, a search box. */
  children?: React.ReactNode;
}) {
  return (
    <div className="page-header relative isolate overflow-hidden">
      {/* Featureless and cropped: see HuskySilhouette on why. */}
      <HuskySilhouette className="pointer-events-none absolute -right-12 -top-20 h-[230px] w-[230px] text-white/[0.07] sm:-right-6 sm:-top-24 sm:h-[290px] sm:w-[290px]"
        features={false}
      />

      {/* Table edge running along the bottom, in perspective. */}
      <svg
        className="pointer-events-none absolute inset-x-0 bottom-0 h-14 w-full"
        viewBox="0 0 1200 56"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path d="M520 0h160l520 56H0Z" fill="var(--nu-red)" fillOpacity="0.22" />
        <path d="M596 0h8l10 56h-28Z" fill="#fff" fillOpacity="0.12" />
      </svg>

      {/* The net's top band, along the very bottom edge. */}
      <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/25" aria-hidden />

      <div className="relative mx-auto max-w-2xl px-6 pb-7 pt-7">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {eyebrow && (
              <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-white/50">
                {eyebrow}
              </div>
            )}
            <h1 className="font-display text-[26px] font-bold leading-tight text-white sm:text-3xl">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-white/65">
                {subtitle}
              </p>
            )}
          </div>
          {trailing && <div className="shrink-0 pt-1">{trailing}</div>}
        </div>
        {children && <div className="mt-4">{children}</div>}
      </div>
    </div>
  );
}
