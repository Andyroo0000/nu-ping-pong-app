import { Suspense } from "react";
import { Nav } from "@/components/Nav";
import { BackdropArt } from "@/components/BackdropArt";
import { BottomTabs } from "@/components/BottomTabs";
import { PageHeader } from "@/components/PageHeader";
import { PlayTabs } from "@/components/PlayTabs";
import { NavSkeleton } from "@/components/Skeletons";
import { DoublesForm } from "./DoublesForm";

// No await in the page function, so the frame prerenders and the form streams
// into it — same shape as every other page here.
export default function DoublesPage() {
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
