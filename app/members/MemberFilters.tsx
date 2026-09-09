"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { HALLS } from "@/lib/halls";
import { AVAILABILITY, PLAY_PREFERENCES, YEARS } from "@/lib/profile";

const FIELD =
  "rounded-xl border border-border-strong bg-surface px-3 py-2.5 text-[13px] outline-none focus:border-ink";

export function MemberFilters({ resultCount }: { resultCount: number }) {
  const router = useRouter();
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");

  function set(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(next.size ? `/members?${next}` : "/members", { scroll: false });
  }

  // Debounced so typing doesn't fire a query per keystroke.
  useEffect(() => {
    const current = params.get("q") ?? "";
    if (query === current) return;
    const handle = setTimeout(() => set("q", query.trim()), 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const active = ["hall", "pref", "when", "year", "q"].filter((k) => params.get(k));

  return (
    <div className="mt-4">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name…"
        aria-label="Search members by name"
        className={`w-full ${FIELD}`}
      />

      <div className="mt-2 grid grid-cols-2 gap-2">
        <select
          value={params.get("pref") ?? ""}
          onChange={(e) => set("pref", e.target.value)}
          aria-label="Casual or competitive"
          className={FIELD}
        >
          <option value="">Anyone</option>
          {PLAY_PREFERENCES.filter((p) => p.value !== "both").map((p) => (
            <option key={p.value} value={p.value}>
              {p.label} players
            </option>
          ))}
        </select>

        <select
          value={params.get("hall") ?? ""}
          onChange={(e) => set("hall", e.target.value)}
          aria-label="Hall"
          className={FIELD}
        >
          <option value="">Any hall</option>
          {HALLS.map((hall) => (
            <option key={hall} value={hall}>
              {hall}
            </option>
          ))}
        </select>

        <select
          value={params.get("when") ?? ""}
          onChange={(e) => set("when", e.target.value)}
          aria-label="When they play"
          className={FIELD}
        >
          <option value="">Any time</option>
          {AVAILABILITY.map((slot) => (
            <option key={slot.value} value={slot.value}>
              {slot.label}
            </option>
          ))}
        </select>

        <select
          value={params.get("year") ?? ""}
          onChange={(e) => set("year", e.target.value)}
          aria-label="Year"
          className={FIELD}
        >
          <option value="">Any year</option>
          {YEARS.map((y) => (
            <option key={y.value} value={y.value}>
              {y.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-3">
        <span className="text-xs font-semibold text-text-faint">
          {resultCount} {resultCount === 1 ? "player" : "players"}
        </span>
        {active.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              router.replace("/members", { scroll: false });
            }}
            className="text-xs font-bold text-nu-accent underline"
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
