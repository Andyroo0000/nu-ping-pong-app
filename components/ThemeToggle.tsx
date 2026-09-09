"use client";

import { useEffect } from "react";

export const THEME_KEY = "nupp-theme";

/**
 * Runs before first paint from a blocking inline <script>, and always lands on
 * an explicit `dark` or `light` class — resolving "system" here rather than in
 * CSS. That keeps the stylesheet to a single `.dark` block, lets Tailwind's
 * `dark:` variant key off the class, and means the toggle below needs no React
 * state: it reads the class at click time and both icons are swapped in CSS.
 *
 * Without this script, a dark-mode visitor gets a white flash on every cold
 * load, because the server has no way to know their preference.
 *
 * Kept as a string because it has to be injected, not imported.
 */
export const THEME_SCRIPT = `
(function () {
  var root = document.documentElement;
  var stored = null;
  try { stored = localStorage.getItem(${JSON.stringify(THEME_KEY)}); } catch (e) {}
  var dark = stored === 'dark' || (stored !== 'light' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches);
  root.classList.add(dark ? 'dark' : 'light');
})();
`;

export function ThemeToggle() {
  // Someone on "system" who flips their OS theme while the tab is open should
  // follow along; an explicit choice should not be overridden.
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => {
      let stored: string | null = null;
      try {
        stored = localStorage.getItem(THEME_KEY);
      } catch {
        // Storage blocked; treat as "no explicit preference".
      }
      if (stored === "dark" || stored === "light") return;
      const root = document.documentElement;
      root.classList.remove("dark", "light");
      root.classList.add(e.matches ? "dark" : "light");
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  function toggle() {
    const root = document.documentElement;
    const next = root.classList.contains("dark") ? "light" : "dark";
    root.classList.remove("dark", "light");
    root.classList.add(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Private browsing — the toggle still works, it just won't be remembered.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="flex h-8 w-8 items-center justify-center rounded-full text-text-dim transition-colors hover:bg-surface-2 hover:text-text"
    >
      {/* Both icons render; CSS shows the right one, so there's no state to
          hydrate and no icon flash. */}
      <span className="dark:hidden">
        <MoonIcon />
        <span className="sr-only">Switch to dark mode</span>
      </span>
      <span className="hidden dark:block">
        <SunIcon />
        <span className="sr-only">Switch to light mode</span>
      </span>
    </button>
  );
}

function MoonIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}
