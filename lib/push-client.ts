/**
 * Web Push needs the VAPID public key as bytes, not base64url.
 *
 * Typed as Uint8Array<ArrayBuffer> because pushManager.subscribe() wants a
 * BufferSource backed by a real ArrayBuffer, and the default Uint8Array type
 * allows a SharedArrayBuffer.
 */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

/** A PushSubscription's keys, as the strings the server stores. */
export function subscriptionKeys(subscription: PushSubscription) {
  const raw = subscription.toJSON().keys;
  return { p256dh: raw?.p256dh ?? "", auth: raw?.auth ?? "" };
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS predates display-mode and uses this instead.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIos(): boolean {
  if (typeof window === "undefined") return false;
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

/**
 * Where the "add to home screen" control lives differs per browser, and
 * there's no API to ask — so it has to be sniffed to give instructions that
 * match what someone is actually looking at.
 *
 * `ios-other` matters most: only Safari can install a web app on iPhone, and
 * only an installed web app can receive notifications, so Chrome-on-iOS needs
 * telling before anything else.
 */
export type Platform =
  | "ios-safari"
  | "ios-other"
  | "samsung"
  | "android-firefox"
  | "android-chromium"
  | "desktop";

export function platform(): Platform {
  if (typeof window === "undefined") return "desktop";
  const ua = window.navigator.userAgent;

  if (isIos()) {
    // Every iOS browser is Safari underneath, so these prefixes are the only
    // way to tell them apart.
    return /CriOS|FxiOS|EdgiOS|OPT\//.test(ua) ? "ios-other" : "ios-safari";
  }

  if (/SamsungBrowser/.test(ua)) return "samsung";
  if (/Android/.test(ua)) {
    if (/Firefox/.test(ua)) return "android-firefox";
    return "android-chromium";
  }
  return "desktop";
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}
