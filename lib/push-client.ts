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
 * Which browser this is on iOS. Only Safari can add a web app to the home
 * screen there, and only a home-screen web app can receive notifications — so
 * someone reading the install steps in Chrome needs telling before anything
 * else.
 */
export function iosBrowser(): "safari" | "chrome" | "firefox" | "edge" | "other" {
  if (typeof window === "undefined") return "other";
  const ua = window.navigator.userAgent;
  if (/CriOS/.test(ua)) return "chrome";
  if (/FxiOS/.test(ua)) return "firefox";
  if (/EdgiOS/.test(ua)) return "edge";
  if (/Safari/.test(ua)) return "safari";
  return "other";
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}
