import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { HuskyMark } from "@/components/HuskyMark";
import { SignOutButton } from "@/components/SignOutButton";

const LINKS = [
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/matchmaking", label: "Matchmaking" },
];

export async function Nav() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let username: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .single();
    username = profile?.username ?? null;
  }

  return (
    <div className="flex items-center justify-between border-b border-border bg-bg-alt px-6 py-4">
      <Link href="/leaderboard" className="flex items-center gap-3">
        <HuskyMark size={28} />
        <span className="font-display text-base font-bold tracking-tight">NU Ping Pong</span>
      </Link>
      <div className="hidden items-center gap-8 sm:flex">
        {LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="text-sm font-semibold text-text-dim hover:text-text">
            {link.label}
          </Link>
        ))}
      </div>
      <div className="flex items-center gap-4">
        {username && (
          <Link href={`/profile/${username}`} className="text-sm font-semibold text-text-dim hover:text-text">
            My Profile
          </Link>
        )}
        <SignOutButton />
      </div>
    </div>
  );
}
