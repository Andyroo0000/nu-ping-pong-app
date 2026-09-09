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

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}
