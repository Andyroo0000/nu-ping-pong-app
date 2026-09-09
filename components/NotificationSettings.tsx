"use client";

import { useEffect, useState } from "react";
import {
  isIos,
  isStandalone,
  pushSupported,
  subscriptionKeys,
  urlBase64ToUint8Array,
} from "@/lib/push-client";
import { deletePushSubscription, savePushSubscription, sendTestPush } from "@/app/actions";
import { invalidateBrowserValues, useBrowserValue } from "@/lib/use-browser-value";
import { IosInstallSteps } from "@/components/IosInstallSteps";

type State = "checking" | "unsupported" | "ios-needs-install" | "off" | "on" | "blocked";

/** Everything that can be decided synchronously, without touching the SW. */
type Support = "checking" | "unsupported" | "ios-needs-install" | "blocked" | "ready";

function readSupport(): Support {
  if (!pushSupported()) {
    // On iPhone the push API only exists once the app is on the home screen,
    // so say that rather than "your browser doesn't support this".
    return isIos() && !isStandalone() ? "ios-needs-install" : "unsupported";
  }
  return Notification.permission === "denied" ? "blocked" : "ready";
}

export function NotificationSettings() {
  const support = useBrowserValue<Support>(readSupport, "checking");
  // Whether this browser already has a subscription can only be answered
  // asynchronously, so it's the one thing that lives in state — and it's set
  // from the promise callback, never synchronously during the effect.
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (support !== "ready") return;
    let alive = true;
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((existing) => {
        if (alive) setSubscribed(Boolean(existing));
      })
      .catch(() => {
        if (alive) setSubscribed(false);
      });
    return () => {
      alive = false;
    };
  }, [support]);

  const state: State =
    support !== "ready" ? support : subscribed === null ? "checking" : subscribed ? "on" : "off";

  async function turnOn() {
    setBusy(true);
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        // Re-reads Notification.permission, which is what "blocked" keys off.
        invalidateBrowserValues();
        return;
      }

      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) throw new Error("Notifications aren't configured on the server yet.");

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });

      const { p256dh, auth } = subscriptionKeys(subscription);
      const fd = new FormData();
      fd.set("endpoint", subscription.endpoint);
      fd.set("p256dh", p256dh);
      fd.set("auth", auth);
      fd.set("userAgent", navigator.userAgent);

      const result = await savePushSubscription(fd);
      if (!result.ok) throw new Error(result.error);

      setSubscribed(true);
      setMessage("Notifications are on for this device.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Couldn't turn notifications on.");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    setMessage(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const fd = new FormData();
        fd.set("endpoint", subscription.endpoint);
        await deletePushSubscription(fd);
        await subscription.unsubscribe();
      }
      setSubscribed(false);
      setMessage("Notifications are off for this device.");
    } catch {
      setMessage("Couldn't turn notifications off. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    const result = await sendTestPush();
    setMessage(result.ok ? (result.message ?? "Sent.") : result.error);
    setBusy(false);
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="text-sm font-bold">Notifications on this device</div>
      <p className="mt-1 text-[13px] leading-relaxed text-text-dim">
        {copy(state)}
      </p>

      {state === "ios-needs-install" && (
        <div className="mt-3.5">
          <IosInstallSteps compact />
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {state === "off" && (
          <button
            type="button"
            onClick={turnOn}
            disabled={busy}
            className="rounded-xl bg-nu px-4 py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-nu-deep disabled:opacity-50"
          >
            {busy ? "Turning on…" : "Turn on notifications"}
          </button>
        )}
        {state === "on" && (
          <>
            <button
              type="button"
              onClick={test}
              disabled={busy}
              className="rounded-xl bg-nu px-4 py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-nu-deep disabled:opacity-50"
            >
              Send a test
            </button>
            <button
              type="button"
              onClick={turnOff}
              disabled={busy}
              className="rounded-xl border border-border-strong px-4 py-2.5 text-[13px] font-bold text-text-dim disabled:opacity-50"
            >
              Turn off
            </button>
          </>
        )}
      </div>

      {message && <p className="mt-2.5 text-[13px] font-semibold text-text-dim">{message}</p>}

      {state === "on" && (
        <p className="mt-3 text-xs text-text-faint">
          Turned on per device, so do this again on your phone if you set it up on a laptop.
        </p>
      )}
    </div>
  );
}

function copy(state: State): string {
  switch (state) {
    case "checking":
      return "Checking…";
    case "on":
      return "You'll be told when someone challenges you, sends a message, or reports a match that needs your confirmation.";
    case "off":
      return "Get told when someone challenges you, sends a message, or reports a match waiting on you.";
    case "ios-needs-install":
      return "On iPhone, notifications only work once NU Ping Pong is on your home screen. Here's how:";
    case "blocked":
      return "Your browser is blocking notifications for this site. On iPhone: Settings → Notifications → NU Ping Pong. On a computer: click the icon at the left of the address bar → Notifications → Allow. Then reload this page.";
    case "unsupported":
      return "This browser can't do web notifications. Try Chrome, Edge, Firefox, or Safari on a recent iPhone.";
  }
}
