import Link from "next/link";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { Nav } from "@/components/Nav";
import { BackdropArt } from "@/components/BackdropArt";
import { BottomTabs } from "@/components/BottomTabs";
import { PageHeader } from "@/components/PageHeader";
import { CardSkeleton, NavSkeleton } from "@/components/Skeletons";
import { FORMATS } from "@/lib/bracket";
import { displayName } from "@/lib/names";
import { TournamentSetup } from "./TournamentSetup";
import { Bracket } from "./Bracket";
import { Standings } from "./Standings";
import { PublishResults } from "./PublishResults";

type Params = Promise<{ id: string }>;

export default function TournamentPage({ params }: { params: Params }) {
  return (
    <div className="pb-tabs relative isolate min-h-screen bg-bg">
      <BackdropArt />
      <Suspense fallback={<NavSkeleton />}>
        <Nav />
      </Suspense>
      <Suspense fallback={<div className="page-header h-[132px]" />}>
        <Body params={params} />
      </Suspense>
      <Suspense fallback={null}>
        <BottomTabs />
      </Suspense>
    </div>
  );
}

/** A tournament entry's name: one player, a pair, or a typed-in guest. */
export type EntryPlayer = { id: string; username: string; full_name: string | null };
export function entryLabel(
  entry: { player_1: string | null; player_2: string | null; guest_name: string | null },
  players: Map<string, EntryPlayer>
): string {
  if (!entry.player_1) return entry.guest_name ?? "Guest";
  const one = players.get(entry.player_1);
  const two = entry.player_2 ? players.get(entry.player_2) : null;
  const first = one ? displayName(one) : "Player";
  return two ? `${first} & ${displayName(two)}` : first;
}

async function Body({ params }: { params: Params }) {
  const [{ id }, user] = await Promise.all([params, getCurrentUser()]);
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!tournament) notFound();

  const { data: entries } = await supabase
    .from("tournament_entries")
    .select("id, player_1, player_2, guest_name, seed, created_at")
    .eq("tournament_id", id)
    .order("seed", { ascending: true, nullsFirst: false });

  const entryList = entries ?? [];
  const playerIds = [
    ...new Set(entryList.flatMap((e) => [e.player_1, e.player_2].filter(Boolean) as string[])),
  ];
  const { data: playerRows } = playerIds.length
    ? await supabase.from("profiles").select("id, username, full_name").in("id", playerIds)
    : { data: [] };
  const players = new Map((playerRows ?? []).map((p) => [p.id, p]));

  const isOrganiser = tournament.created_by === user.id;
  const format = FORMATS.find((f) => f.value === tournament.format);
  const champion = tournament.champion_entry
    ? entryList.find((e) => e.id === tournament.champion_entry)
    : null;

  return (
    <>
      <PageHeader
        eyebrow={`${format?.label ?? tournament.format} · ${
          tournament.mode === "doubles" ? "Doubles" : "Singles"
        }${tournament.is_ranked ? "" : " · casual"}`}
        title={tournament.name}
        subtitle={
          champion
            ? `Won by ${entryLabel(champion, players)}.`
            : tournament.status === "setup"
              ? `${entryList.length} entered. ${
                  isOrganiser ? "Start it when everyone's in." : "Waiting for the organiser."
                }`
              : `${entryList.length} in the draw.`
        }
      />

      <div className="mx-auto max-w-2xl px-6 pb-10">
        <Link
          href="/tournaments"
          className="mt-4 inline-block text-xs font-bold text-nu-accent underline"
        >
          All tournaments
        </Link>

        {tournament.status === "setup" ? (
          <TournamentSetup
            tournamentId={id}
            mode={tournament.mode}
            format={tournament.format}
            isOrganiser={isOrganiser}
            viewerId={user.id}
            entries={entryList.map((e) => ({
              id: e.id,
              label: entryLabel(e, players),
              isMine: e.player_1 === user.id || e.player_2 === user.id,
              isGuest: !e.player_1,
            }))}
          />
        ) : (
          <>
            {/* The organiser's last step: turn the sheet into results the
                players confirm. Only once the bracket is finished, so a
                half-played tournament can't send half its results. */}
            {isOrganiser && tournament.is_ranked && tournament.status === "complete" && (
              <PublishResults
                tournamentId={id}
                publishedAt={tournament.results_published_at}
              />
            )}

            <Suspense fallback={<CardSkeleton className="mt-5" />}>
              <Bracket
                tournamentId={id}
                viewerId={user.id}
                isOrganiser={isOrganiser}
                bestOf={tournament.best_of}
                isRanked={tournament.is_ranked}
                format={tournament.format}
              />
            </Suspense>
            {tournament.format === "round_robin" && (
              <Suspense fallback={null}>
                <Standings tournamentId={id} />
              </Suspense>
            )}
          </>
        )}
      </div>
    </>
  );
}
