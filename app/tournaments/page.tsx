import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { Nav } from "@/components/Nav";
import { BackdropArt } from "@/components/BackdropArt";
import { BottomTabs } from "@/components/BottomTabs";
import { PageHeader } from "@/components/PageHeader";
import { PlayTabs } from "@/components/PlayTabs";
import { CardSkeleton, NavSkeleton } from "@/components/Skeletons";
import { NewTournament } from "./NewTournament";
import { FORMATS } from "@/lib/bracket";

export default function TournamentsPage() {
  return (
    <div className="pb-tabs relative isolate min-h-screen bg-bg">
      <BackdropArt />
      <Suspense fallback={<NavSkeleton />}>
        <Nav />
      </Suspense>
      <PageHeader
        eyebrow="Northeastern Club Table Tennis"
        title="Tournaments"
        subtitle="Add the players, pick a format, and the bracket builds itself."
      />

      <div className="mx-auto max-w-md px-6 pb-10">
        <PlayTabs />
        <NewTournament />
        <Suspense fallback={<CardSkeleton className="mt-5" />}>
          <TournamentList />
        </Suspense>
      </div>

      <Suspense fallback={null}>
        <BottomTabs />
      </Suspense>
    </div>
  );
}

async function TournamentList() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data: tournaments } = await supabase
    .from("tournaments")
    .select("id, name, format, mode, is_ranked, status, created_by, created_at")
    .order("created_at", { ascending: false })
    .limit(30);

  const list = tournaments ?? [];
  if (list.length === 0) {
    return (
      <p className="mt-5 rounded-2xl border border-border bg-surface p-6 text-center text-sm text-text-dim">
        No tournaments yet. Start one and the club can follow the bracket.
      </p>
    );
  }

  // One query for the entry counts rather than one per tournament.
  const { data: counts } = await supabase
    .from("tournament_entries")
    .select("tournament_id")
    .in(
      "tournament_id",
      list.map((t) => t.id)
    );
  const entryCount = new Map<string, number>();
  for (const row of counts ?? []) {
    entryCount.set(row.tournament_id, (entryCount.get(row.tournament_id) ?? 0) + 1);
  }

  const label = (format: string) =>
    FORMATS.find((f) => f.value === format)?.label ?? format;

  return (
    <div className="mt-5 flex flex-col gap-2.5">
      {list.map((t) => (
        <Link
          key={t.id}
          href={`/tournaments/${t.id}`}
          className="panel flex items-center gap-3 rounded-2xl p-3.5"
        >
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold">{t.name}</div>
            <div className="mt-0.5 truncate text-xs text-text-faint">
              {label(t.format)} · {t.mode === "doubles" ? "Doubles" : "Singles"} ·{" "}
              {entryCount.get(t.id) ?? 0} entered
              {t.is_ranked ? "" : " · casual"}
            </div>
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
              t.status === "running"
                ? "bg-nu text-white"
                : t.status === "complete"
                  ? "border border-border-strong text-text-faint"
                  : "bg-surface-2 text-text-dim"
            }`}
          >
            {t.status === "setup" ? "Entries open" : t.status === "running" ? "Live" : "Done"}
          </span>
        </Link>
      ))}
    </div>
  );
}
