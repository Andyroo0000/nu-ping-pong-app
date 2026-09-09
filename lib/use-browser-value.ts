"use client";

import { useSyncExternalStore } from "react";

const CHANGE_EVENT = "nupp-browser-value";

/** Tell every useBrowserValue to re-read after you change something. */
export function invalidateBrowserValues() {
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => window.removeEventListener(CHANGE_EVENT, onChange);
}

/**
 * Read a synchronous browser-only value (localStorage, matchMedia, a UA sniff)
 * in a way that's safe to server-render.
 *
 * The obvious version — read it in a useEffect and setState — triggers a
 * cascading render on every mount, which React now warns about. This is the
 * sanctioned API for it: `serverValue` is what renders during SSR and the
 * first hydration pass, then React swaps in the real reading.
 *
 * Only use this for primitives; useSyncExternalStore requires the snapshot to
 * be referentially stable between reads.
 */
export function useBrowserValue<T extends string | number | boolean>(
  read: () => T,
  serverValue: T
): T {
  return useSyncExternalStore(subscribe, read, () => serverValue);
}
