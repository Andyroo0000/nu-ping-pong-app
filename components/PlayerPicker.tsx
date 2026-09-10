"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/Avatar";
import { displayName } from "@/lib/names";

export type PickedPlayer = {
  id: string;
  username: string;
  full_name: string | null;
  rating: number;
  wins: number;
  losses: number;
  doubles_rating: number;
  doubles_wins: number;
  doubles_losses: number;
  avatar_path: string | null;
};

/** Exported so a caller preselecting a player fetches the same shape. */
export const PICKER_COLUMNS =
  "id, username, full_name, rating, wins, losses, doubles_rating, doubles_wins, doubles_losses, avatar_path";

/**
 * Search-and-pick one player.
 *
 * `exclude` is the ids already chosen elsewhere on the form, so the same
 * person can't be put on both sides of a doubles table — catching it here
 * beats letting the database reject the whole match after they've typed the
 * scores in.
 */
export function PlayerPicker({
  label,
  value,
  onChange,
  exclude = [],
  showDoubles = false,
}: {
  label: string;
  value: PickedPlayer | null;
  onChange: (player: PickedPlayer | null) => void;
  exclude?: string[];
  showDoubles?: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickedPlayer[]>([]);

  useEffect(() => {
    const handle = setTimeout(async () => {
      if (query.trim().length < 2) {
        setResults([]);
        return;
      }
      // Commas, parens and stars would break PostgREST's `or` filter grammar.
      const term = query.trim().replace(/[,()*]/g, "");
      if (!term) {
        setResults([]);
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select(PICKER_COLUMNS)
        .or(`full_name.ilike.%${term}%,username.ilike.%${term}%`)
        .limit(6);
      setResults(data ?? []);
    }, 200);
    return () => clearTimeout(handle);
  }, [query, supabase]);

  const rating = (p: PickedPlayer) => (showDoubles ? p.doubles_rating : p.rating);
  const shown = results.filter((p) => !exclude.includes(p.id));

  if (value) {
    return (
      <div>
        <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-text-faint">
          {label}
        </div>
        <div className="panel flex items-center gap-3 rounded-xl px-3 py-2.5">
          <Avatar player={value} size={34} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold">{displayName(value)}</div>
            <div className="text-xs text-text-faint">
              {rating(value).toLocaleString()}
              {showDoubles ? " doubles" : ""}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setQuery("");
            }}
            className="shrink-0 rounded-lg border border-border-strong px-2.5 py-1.5 text-xs font-bold text-text-dim"
          >
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-text-faint">
        {label}
      </label>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search a name or username"
        className="w-full rounded-xl border border-border-strong bg-bg px-3.5 py-3 text-sm outline-none placeholder:text-text-faint focus:border-nu"
      />
      {shown.length > 0 && (
        <div className="mt-1.5 flex flex-col gap-1">
          {shown.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                onChange(p);
                setQuery("");
                setResults([]);
              }}
              className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5 text-left hover:border-nu"
            >
              <Avatar player={p} size={30} />
              <span className="min-w-0 flex-1 truncate text-sm font-bold">{displayName(p)}</span>
              <span className="shrink-0 font-display text-sm font-bold text-text-dim">
                {rating(p).toLocaleString()}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
