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
import { DoublesForm } from "./DoublesForm";
import { DoublesQueue } from "./DoublesQueue";

type Params = Promise<{
  hall?: string;
  searched?: string;
  waiting?: string;
  partner?: string;
  opp1?: string;
  opp2?: string;
  matched?: string;
  channel?: string;
}>;

// No await in the page function, so the frame prerenders and each section
// streams into it — same shape as every other page here.
export default function DoublesPage({ searchParams }: { searchParams: Params }) {
  return (
    <div className="pb-tabs relative isolate min-h-screen bg-bg">
      <BackdropArt />
      <Suspense fallback={<NavSkeleton />}>
        <Nav />
      </Suspense>
      <PageHeader
        eyebrow="Northeastern Club Table Tennis"
        title="Doubles"
        subtitle="A separate ladder — doubles results never touch your singles rating."
      />

      <div className="mx-auto max-w-md px-6">
        <PlayTabs />
        <Suspense fallback={<CardSkeleton className="mt-5" />}>
          <Queue searchParams={searchParams} />
        </Suspense>
      </div>

      <Suspense fallback={null}>
        <DoublesForm />
      </Suspense>

      <Suspense fallback={null}>
        <BottomTabs />
      </Suspense>
    </div>
  );
}

async function Queue({ searchParams }: { searchParams: Params }) {
  const [user, { hall, searched, waiting }] = await Promise.all([
    getCurrentUser(),
    searchParams,
  ]);
  if (!user) redirect("/login");

  const supabase = await createClient();
  const [{ data: myEntry }, { data: byHall }] = await Promise.all([
    supabase
      .from("active_queue")
      .select("location, mode")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase.rpc("doubles_waiting", { p_hall: null }),
  ]);

  // Only treat them as queued if it's the doubles queue they're in — someone
  // waiting for a singles match shouldn't be told they're waiting for doubles.
  const queuedForDoubles = myEntry?.mode === "doubles";

  return (
    <DoublesQueue
      defaultHall={queuedForDoubles ? myEntry?.location : (hall ?? null)}
      searched={queuedForDoubles || searched === "1"}
      waiting={
        waiting
          ? Number(waiting)
          : (byHall ?? []).find((h) => h.location === myEntry?.location)?.waiting
      }
      waitingByHall={byHall ?? []}
    />
  );
}
