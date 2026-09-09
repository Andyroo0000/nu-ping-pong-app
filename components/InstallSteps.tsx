"use client";

import { platform, type Platform } from "@/lib/push-client";
import { useBrowserValue } from "@/lib/use-browser-value";

/**
 * How to add the app to a home screen, for whichever browser this actually is.
 *
 * "Tap Share" is useless on its own — most people have never needed to name
 * that icon, and it sits in a toolbar Safari hides while you scroll. So each
 * glyph is drawn inline at roughly the size it appears, and every step says
 * where on the screen to look.
 */
export function InstallSteps({ compact = false }: { compact?: boolean }) {
  const which = useBrowserValue<Platform>(platform, "desktop");

  if (which === "ios-other") {
    return (
      <div className="rounded-xl border border-border-strong bg-surface p-3.5">
        <div className="text-[13px] font-bold">Open this page in Safari first</div>
        <p className="mt-1 text-[13px] leading-relaxed text-text-dim">
          On iPhone, only Safari can add an app to your home screen — and only a home
          screen app can send you notifications. Copy this page&rsquo;s link, paste it into
          Safari, then come back here.
        </p>
      </div>
    );
  }

  return (
    <ol className={`flex flex-col ${compact ? "gap-2.5" : "gap-3"}`}>
      {STEPS[which].map((step, i) => (
        <Step key={i} number={i + 1}>
          {step}
        </Step>
      ))}
    </ol>
  );
}

/**
 * The last step, shared by every platform. `after` lets a platform put
 * something in front of it without the sentence reading "…, then Open …".
 */
function OpenFromIcon({ after }: { after?: string }) {
  return (
    <>
      {after ? `${after} then open ` : "Open "}
      <b>NU Ping Pong</b> from the new red husky icon on your home screen.
      <Hint>Notifications only work from that icon, not from a browser tab.</Hint>
    </>
  );
}

const STEPS: Record<Exclude<Platform, "ios-other">, React.ReactNode[]> = {
  "ios-safari": [
    <>
      Tap the <ShareGlyph /> <b>Share</b> button at the <b>bottom</b> of the screen.
      <Hint>
        Can&rsquo;t see it? Scroll up a little, or tap the very bottom edge — Safari hides
        that bar while you scroll down.
      </Hint>
    </>,
    <>
      Scroll down the menu and tap <PlusSquareGlyph /> <b>Add to Home Screen</b>.
      <Hint>It&rsquo;s partway down the list, below Copy and Bookmarks.</Hint>
    </>,
    <>
      Tap <b>Add</b> in the top-right corner.
    </>,
    <OpenFromIcon key="open" after="Close Safari," />,
  ],

  // Samsung Internet puts its menu at the bottom right and calls the item
  // "Add page to" rather than "Install".
  samsung: [
    <>
      Tap the <MenuGlyph /> <b>menu</b> (three lines) at the <b>bottom right</b>.
    </>,
    <>
      Tap <b>Add page to</b>, then <b>Home screen</b>.
      <Hint>
        Some versions show a <DownloadGlyph /> icon in the address bar instead — that
        works too.
      </Hint>
    </>,
    <>
      Tap <b>Add</b> to confirm.
    </>,
    <OpenFromIcon key="open" />,
  ],

  "android-chromium": [
    <>
      Tap the <DotsGlyph /> <b>menu</b> (three dots) at the <b>top right</b>.
    </>,
    <>
      Tap <b>Add to Home screen</b>, or <b>Install app</b> if you see that instead.
    </>,
    <>
      Tap <b>Install</b> to confirm.
    </>,
    <OpenFromIcon key="open" />,
  ],

  "android-firefox": [
    <>
      Tap the <DotsGlyph /> <b>menu</b> (three dots) at the <b>bottom right</b>.
    </>,
    <>
      Tap <b>Add to Home screen</b>.
    </>,
    <OpenFromIcon key="open" />,
  ],

  desktop: [
    <>
      Click the <DownloadGlyph /> <b>install</b> icon at the right-hand end of the address
      bar.
      <Hint>
        In Chrome or Edge. No icon? Open the browser menu and look for <b>Install</b> or{" "}
        <b>Apps → Install this site</b>.
      </Hint>
    </>,
    <>
      Click <b>Install</b> to confirm.
    </>,
    <>
      It opens in its own window from then on.
      <Hint>
        Notifications work in a normal tab on a computer, so installing here is optional —
        on an iPhone it isn&rsquo;t.
      </Hint>
    </>,
  ],
};

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

/*
  Glyphs flow as inline text with a small margin rather than sitting in a flex
  row: a flex container puts a gap either side of every child, which reads as a
  double space before the next word and pushes punctuation away.
*/
function Glyph({ children, stroke }: { children: React.ReactNode; stroke?: string }) {
  return (
    <span className="mx-0.5 inline-flex h-6 w-6 items-center justify-center rounded-md border border-border-strong bg-surface align-text-bottom">
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke={stroke ?? "currentColor"}
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {children}
      </svg>
    </span>
  );
}

/** iOS share glyph: a box with an arrow leaving the top. Rendered in iOS blue. */
function ShareGlyph() {
  return (
    <Glyph stroke="#0a84ff">
      <path d="M12 3v12" />
      <path d="m8 7 4-4 4 4" />
      <path d="M7 11H5.5A1.5 1.5 0 0 0 4 12.5v7A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5v-7a1.5 1.5 0 0 0-1.5-1.5H17" />
    </Glyph>
  );
}

function PlusSquareGlyph() {
  return (
    <Glyph>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" />
      <path d="M12 8.5v7M8.5 12h7" />
    </Glyph>
  );
}

function MenuGlyph() {
  return (
    <Glyph>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Glyph>
  );
}

function DotsGlyph() {
  return (
    <Glyph>
      <circle cx="12" cy="5" r="1.4" fill="currentColor" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" />
      <circle cx="12" cy="19" r="1.4" fill="currentColor" />
    </Glyph>
  );
}

/** Chrome/Edge's install affordance: a monitor with a down arrow. */
function DownloadGlyph() {
  return (
    <Glyph>
      <path d="M12 4v8" />
      <path d="m8.5 8.5 3.5 3.5 3.5-3.5" />
      <path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" />
    </Glyph>
  );
}
