import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { Nav } from "@/components/Nav";
import { BottomTabs } from "@/components/BottomTabs";
import { NavSkeleton, ProfileSkeleton } from "@/components/Skeletons";
import { ProfileForm } from "./ProfileForm";
import { InstallPrompt } from "@/components/InstallPrompt";
import { NotificationSettings } from "@/components/NotificationSettings";

export default function EditProfilePage() {
  return (
    <div className="pb-tabs min-h-screen bg-bg">
      <Suspense fallback={<NavSkeleton />}>
        <Nav />
      </Suspense>
      <Suspense fallback={<ProfileSkeleton />}>
        <EditProfileBody />
      </Suspense>

      <Suspense fallback={null}>
        <BottomTabs />
      </Suspense>    </div>
  );
}

async function EditProfileBody() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "id, username, full_name, bio, year, home_hall, availability, play_preference, avatar_path"
    )
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");

  return (
    <div className="mx-auto max-w-md px-6 py-10">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="font-display text-3xl font-bold">Your profile</h1>
        <Link
          href={`/profile/${profile.username}`}
          className="shrink-0 text-sm font-bold text-text-dim underline"
        >
          View
        </Link>
      </div>
      <p className="mt-1 text-sm text-text-dim">
        This is what people see before they ask you for a game. A photo and a line about
        yourself go a long way.
      </p>

      <InstallPrompt />

      <div className="mt-6">
        <NotificationSettings />
      </div>

      <ProfileForm profile={profile} />
    </div>
  );
}
