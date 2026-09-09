"use client";

import { useEffect } from "react";

/**
 * Registers the service worker. Required both for push delivery and for the
 * browser to consider the app installable.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // Registration competes with everything else on first load, and nothing
    // on screen depends on it, so let the page settle first.
    const id = window.setTimeout(() => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Blocked (private browsing, unsupported browser). The app works
        // fine without it — you just don't get notifications or install.
      });
    }, 1200);
    return () => window.clearTimeout(id);
  }, []);

  return null;
}
