import { HuskySilhouette } from "@/components/HuskySilhouette";

/**
 * The landing hero: a table receding into the dark, a husky watching over it,
 * and a ball in play.
 *
 * The rest of the app is deliberately quiet and light — it's a tool you use
 * standing next to a table. This one screen is allowed to be atmospheric,
 * because it's the only one whose job is to make someone want to join.
 *
 * All CSS and inline SVG: no images to load, no canvas, no animation library,
 * and the whole thing still ships inside the static shell. The global
 * prefers-reduced-motion rule freezes the ball for anyone who asks for that.
 */
export function HeroScene({ children }: { children: React.ReactNode }) {
  return (
    <div className="hero-scene relative isolate overflow-hidden">
      {/* Husky, watching from the back wall. */}
      <HuskySilhouette className="pointer-events-none absolute -top-4 right-[-14%] h-[380px] w-[380px] text-white/[0.05] sm:right-[-2%] sm:top-2 sm:h-[480px] sm:w-[480px]" />

      {/* The table, in perspective, meeting the horizon. */}
      <svg
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[46%] w-full"
        viewBox="0 0 1200 320"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="tableTop" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              stopColor="var(--nu-red-deep)"
              stopOpacity="0.85"
            />
            <stop offset="100%" stopColor="var(--nu-red)" stopOpacity="0.28" />
          </linearGradient>
        </defs>
        {/* Trapezoid: narrow at the horizon, wide at the viewer. */}
        <path d="M470 0h260l470 320H0Z" fill="url(#tableTop)" />
        {/* Centre line running away from you. */}
        <path d="M598 0h4l14 320h-32Z" fill="#fff" fillOpacity="0.14" />
        {/* Table edges. */}
        <path
          d="M470 0h260l470 320h-40L710 12H490L40 320H0Z"
          fill="#fff"
          fillOpacity="0.1"
        />
      </svg>

      {/* The net, sitting across the table roughly where its surface is
          widest on screen. Trapezoid clip so it follows the perspective
          instead of reading as a flat band laid over the top. */}
      <div
        className="pointer-events-none absolute bottom-[27%] left-1/2 h-[46px] w-[62%] -translate-x-1/2 border-t-[3px] border-white/40 bg-[repeating-linear-gradient(to_right,rgba(255,255,255,0.15)_0_1.5px,transparent_1.5px_8px),repeating-linear-gradient(to_bottom,rgba(255,255,255,0.15)_0_1.5px,transparent_1.5px_8px)]"
        style={{ clipPath: "polygon(11% 0, 89% 0, 100% 100%, 0 100%)" }}
        aria-hidden
      />

      {/* Ball in play. */}
      <div
        className="ball-flight pointer-events-none absolute bottom-[31%] left-0"
        aria-hidden
      >
        <div className="ball-bounce">
          <div className="h-3.5 w-3.5 rounded-full bg-white shadow-[0_0_18px_4px_rgba(255,255,255,0.45)]" />
        </div>
      </div>

      {/* Vignette, so the content stays readable over all of it. */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_20%_20%,transparent_20%,rgba(0,0,0,0.55)_100%)]" />

      <div className="relative">{children}</div>
    </div>
  );
}
