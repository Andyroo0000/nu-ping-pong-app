import { createClient } from "@/lib/supabase/server";
import { displayName } from "@/lib/names";

/**
 * The round robin table.
 *
 * Ordered by matches won, then games won minus lost — the ordering is done in
 * tournament_standings() so the page and any other reader can't disagree
 * about who's top.
 */
export async function Standings({ tournamentId }: { tournamentId: string }) {
  const supabase = await createClient();
  const [{ data: rows }, { data: entries }] = await Promise.all([
    supabase.rpc("tournament_standings", { p_tournament: tournamentId }),
    supabase
      .from("tournament_entries")
      .select("id, player_1, player_2, guest_name, guest_name_2")
      .eq("tournament_id", tournamentId),
  ]);

  if (!rows?.length) return null;

  const entryList = entries ?? [];
  const playerIds = [
    ...new Set(entryList.flatMap((e) => [e.player_1, e.player_2].filter(Boolean) as string[])),
  ];
  const { data: playerRows } = playerIds.length
    ? await supabase.from("profiles").select("id, username, full_name").in("id", playerIds)
    : { data: [] };
  const players = new Map((playerRows ?? []).map((p) => [p.id, p]));
  const label = (entryId: string) => {
    const e = entryList.find((x) => x.id === entryId);
    if (!e) return "Entry";
    const one = e.player_1 ? players.get(e.player_1) : null;
    const two = e.player_2 ? players.get(e.player_2) : null;
    const first = one ? displayName(one) : (e.guest_name ?? "Player");
    const second = two ? displayName(two) : e.guest_name_2;
    return second ? `${first} & ${second}` : first;
  };

  return (
    <div className="mt-8">
      <div className="mb-3 text-base font-bold">Standings</div>
      <div className="panel overflow-hidden rounded-2xl">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-[11px] font-bold uppercase tracking-wider text-text-faint">
              <th className="px-3 py-2 text-left">#</th>
              <th className="px-1 py-2 text-left">Entry</th>
              <th className="px-2 py-2 text-right">W</th>
              <th className="px-2 py-2 text-right">L</th>
              <th className="px-3 py-2 text-right">Games</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.entry_id} className="border-b border-border last:border-0">
                <td className="px-3 py-2.5 font-display font-bold text-text-faint">{i + 1}</td>
                <td className="px-1 py-2.5 font-bold">{label(r.entry_id)}</td>
                <td className="px-2 py-2.5 text-right font-display font-bold">{r.won}</td>
                <td className="px-2 py-2.5 text-right font-display text-text-dim">{r.lost}</td>
                <td className="px-3 py-2.5 text-right font-display text-text-dim tabular-nums">
                  {r.games_for}–{r.games_against}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
