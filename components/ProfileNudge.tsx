import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { isProfileStarted } from "@/lib/profile";

/**
 * Shown until someone has a name plus a photo or a bio. A club where everyone
 * is an anonymous initials circle doesn't help anyone meet anyone, and the
 * moment people are looking for an opponent is when it's worth asking.
 */
export async function ProfileNudge() {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, bio, avatar_path")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || isProfileStarted(profile)) return null;

  return (
    <Link
      href="/profile/edit"
      className="mt-5 flex items-center gap-3 rounded-2xl border border-border-strong bg-surface p-4 hover:border-ink"
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold">Finish your profile</div>
        <p className="mt-1 text-[13px] leading-relaxed text-text-dim">
          Add a photo and a line about yourself so people know who they&rsquo;re about to play.
        </p>
      </div>
      <span className="shrink-0 text-lg font-bold text-text-faint" aria-hidden>
        →
      </span>
    </Link>
  );
}
