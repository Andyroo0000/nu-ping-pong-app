import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Avatar } from "@/components/Avatar";
import { TierBadge } from "@/components/TierBadge";
import { ChatRoom } from "./ChatRoom";
import { displayName } from "@/lib/names";

export const dynamic = "force-dynamic";

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // RLS only exposes channels the signed-in player belongs to, so a miss here
  // covers both "doesn't exist" and "not yours".
  const { data: channel } = await supabase
    .from("channels")
    .select("id, title, kind")
    .eq("id", id)
    .maybeSingle();
  if (!channel) notFound();

  const [{ data: members }, { data: messages }] = await Promise.all([
    supabase
      .from("channel_members")
      .select("user_id, profiles(id, username, full_name, rating)")
      .eq("channel_id", id),
    supabase
      .from("messages")
      .select("id, author_id, body, kind, created_at")
      .eq("channel_id", id)
      .order("created_at", { ascending: true })
      .limit(200),
  ]);

  await supabase.rpc("mark_channel_read", { p_channel_id: id });

  const roster = (members ?? [])
    .map((m) => m.profiles)
    .filter((p): p is NonNullable<typeof p> => Boolean(p));
  const other = roster.find((p) => p.id !== user.id) ?? null;

  return (
    <div className="mx-auto flex h-screen max-w-md flex-col bg-bg">
      <header className="flex items-center gap-3 border-b border-border bg-bg-alt px-4 py-3">
        <Link
          href="/chats"
          aria-label="Back to chats"
          className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-surface-2"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--text)"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
        </Link>
        <Avatar player={other ?? { username: channel.title ?? "?", full_name: null }} size={36} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold">
            {other ? displayName(other) : (channel.title ?? "Conversation")}
          </div>
          {other && (
            <div className="mt-0.5 flex items-center gap-1.5 text-xs font-semibold text-text-faint">
              {other.rating.toLocaleString()}
              <TierBadge rating={other.rating} />
            </div>
          )}
        </div>
        {other && (
          <Link
            href={`/log-match?opponent=${other.id}`}
            className="whitespace-nowrap rounded-[9px] border border-ink-bright bg-ink-dim px-3 py-2 text-xs font-bold"
          >
            Log score
          </Link>
        )}
      </header>

      <ChatRoom
        channelId={id}
        myId={user.id}
        initialMessages={messages ?? []}
        roster={roster.map((p) => ({
          id: p.id,
          username: p.username,
          full_name: p.full_name,
        }))}
      />
    </div>
  );
}
