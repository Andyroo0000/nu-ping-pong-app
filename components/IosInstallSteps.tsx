"use client";

import { iosBrowser } from "@/lib/push-client";
import { useBrowserValue } from "@/lib/use-browser-value";

/**
 * Step-by-step instructions for adding the app to an iPhone home screen.
 *
 * "Tap Share" is useless on its own — most people have never needed to name
 * that icon, and it sits in a toolbar Safari hides while you scroll. So the
 * glyph is drawn inline at the size it actually appears, and each step says
 * where on the screen to look.
 */
export function IosInstallSteps({ compact = false }: { compact?: boolean }) {
  const browser = useBrowserValue(iosBrowser, "safari");

  if (browser !== "safari") {
    return (
      <div className="rounded-xl border border-border-strong bg-surface p-3.5">
        <div className="text-[13px] font-bold">Open this page in Safari first</div>
        <p className="mt-1 text-[13px] leading-relaxed text-text-dim">
          On iPhone, only Safari can add an app to your home screen — and only a home
          screen app can send you notifications. Copy this page&rsquo;s link, paste it into
          Safari, then come back to these steps.
        </p>
      </div>
    );
  }

  return (
    <ol className={`flex flex-col ${compact ? "gap-2.5" : "gap-3"}`}>
      <Step number={1}>
        Tap the <ShareGlyph /> <b>Share</b> button at the <b>bottom</b> of the screen.
        <Hint>
          Can&rsquo;t see it? Scroll up a little, or tap the very bottom edge — Safari hides
          that bar while you scroll down.
        </Hint>
      </Step>

      <Step number={2}>
        Scroll down the menu and tap <AddGlyph /> <b>Add to Home Screen</b>.
        <Hint>It&rsquo;s partway down the list, below Copy and Bookmarks.</Hint>
      </Step>

      <Step number={3}>
        Tap <b>Add</b> in the top-right corner.
      </Step>

      <Step number={4}>
        Close Safari and open <b>NU Ping Pong</b> from the red husky icon on your home
        screen.
        <Hint>
          Notifications only work from that icon — not from a Safari tab. This is an Apple
          rule, not ours.
        </Hint>
      </Step>
    </ol>
  );
}

function Step({ number, children }: { number: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-nu text-[11px] font-bold text-white">
        {number}
      </span>
      <div className="min-w-0 flex-1 text-[13px] leading-relaxed">{children}</div>
    </li>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-xs leading-relaxed text-text-faint">{children}</p>;
}

/** iOS share glyph: a box with an arrow leaving the top. */
function ShareGlyph() {
  return (
    <span className="mx-0.5 inline-flex h-6 w-6 items-center justify-center rounded-md border border-border-strong bg-surface align-text-bottom">
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#0a84ff"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M12 3v12" />
        <path d="m8 7 4-4 4 4" />
        <path d="M7 11H5.5A1.5 1.5 0 0 0 4 12.5v7A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5v-7a1.5 1.5 0 0 0-1.5-1.5H17" />
      </svg>
      <span className="sr-only">Share</span>
    </span>
  );
}

/** The "Add to Home Screen" row icon: a rounded square with a plus. */
function AddGlyph() {
  return (
    <span className="mx-0.5 inline-flex h-6 w-6 items-center justify-center rounded-md border border-border-strong bg-surface align-text-bottom">
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" />
        <path d="M12 8.5v7M8.5 12h7" />
      </svg>
      <span className="sr-only">Add to Home Screen</span>
    </span>
  );
}
