import Link from "next/link";
import { Suspense } from "react";
import { Nav } from "@/components/Nav";
import { BottomTabs } from "@/components/BottomTabs";
import { BackdropArt } from "@/components/BackdropArt";
import { PageHeader } from "@/components/PageHeader";
import { NavSkeleton } from "@/components/Skeletons";
import { SuggestionForm } from "./SuggestionForm";

// No data access in the page, so the whole frame is prerendered.
export default function FeedbackPage() {
  return (
    <div className="pb-tabs relative isolate min-h-screen bg-bg">
      <BackdropArt />
      <Suspense fallback={<NavSkeleton />}>
        <Nav />
      </Suspense>

      <PageHeader
        eyebrow="Suggestions"
        title="Tell us anything"
        subtitle="Something broken, something missing, a rule that feels wrong — it all helps."
      />

      <div className="mx-auto max-w-md px-6 pb-10">
        <div className="mt-6">
          <SuggestionForm />
        </div>

        <p className="mt-6 text-xs leading-relaxed text-text-faint">
          Nobody in the club sees this except the organiser. If you&rsquo;d rather report a
          specific player, use the block or report option on{" "}
          <Link href="/members" className="font-bold underline">
            their profile
          </Link>{" "}
          instead — that gets handled separately.
        </p>
      </div>

      <Suspense fallback={null}>
        <BottomTabs />
      </Suspense>
    </div>
  );
}
