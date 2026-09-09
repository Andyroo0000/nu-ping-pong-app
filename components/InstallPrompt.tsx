"use client";

import { useEffect, useState } from "react";
import { isIos, isStandalone } from "@/lib/push-client";
import { InstallSteps } from "@/components/InstallSteps";
import { invalidateBrowserValues, useBrowserValue } from "@/lib/use-browser-value";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISSED_KEY = "nupp-install-dismissed";

/**
 * Nudge to add the app to the home screen. This matters more than it looks on
 * iPhone: Web Push only works there once the app is installed, so without this
 * step notifications silently never arrive.
 *
 * Chrome hands us a real install prompt; iOS has no such API, so all we can do
 * is describe the Share menu.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  // Read straight from the browser rather than mirroring it into state, so
  // nothing renders on the server that has to be corrected after mount.
  const dismissed = useBrowserValue(readDismissed, true);
  const standalone = useBrowserValue(isStandalone, true);
  const ios = useBrowserValue(isIos, false);

  // This effect only subscribes; Chrome fires the event when it decides the
  // app is installable, and the handler is where state gets set.
  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  function hide() {
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Nothing to do; it just reappears next visit.
    }
    invalidateBrowserValues();
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    hide();
  }

  if (dismissed || standalone) return null;
  // iOS has no install API, so all we can do there is describe the Share menu.
  const showIosHint = ios;
  if (!deferred && !showIosHint) return null;

  return (
    <div className="mt-5 flex items-start gap-3 rounded-2xl border border-nu-line bg-nu-wash p-4">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold">Put NU Ping Pong on your home screen</div>
        <p className="mt-1 text-[13px] leading-relaxed text-text-dim">
          {showIosHint
            ? "Opens like a real app — and on iPhone it's the only way to get notified when someone challenges you. Takes about 15 seconds:"
            : "Opens like an app, and it's how you get notified when someone challenges you."}
        </p>
        {showIosHint && (
          <div className="mt-3">
            <InstallSteps />
          </div>
        )}
        {deferred && (
          <button
            type="button"
            onClick={install}
            className="mt-3 rounded-xl bg-nu px-4 py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-nu-deep"
          >
            Install
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={hide}
        aria-label="Dismiss"
        className="shrink-0 rounded-full px-2 py-1 text-lg leading-none text-text-faint hover:bg-surface-2"
      >
        ×
      </button>
    </div>
  );
}

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    // Storage blocked — treat as dismissed rather than nagging every load.
    return true;
  }
}
