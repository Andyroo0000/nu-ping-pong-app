import Link from "next/link";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { Avatar } from "@/components/Avatar";
import { TierBadge } from "@/components/TierBadge";
import { ChatSkeleton } from "@/components/Skeletons";
import { StartLive } from "@/components/StartLive";
import { OnlineAvatarWrapper, OnlineLabel } from "@/components/OnlineDot";
import { ChatRoom } from "./ChatRoom";
import { displayName } from "@/lib/names";

type Params = Promise<{ id: string }>;

// `params` is runtime data, so it's awaited inside the Suspense boundaries
// rather than here — awaiting it up front would stop the frame from being
// prerendered and put the whole page back behind the database.
export default function ChatPage({ params }: { params: Params }) {
  return (
    <div className="mx-auto flex h-[100dvh] max-w-md flex-col bg-bg">
      <Suspense fallback={<HeaderSkeleton />}>
        <ChatHeader params={params} />
      </Suspense>
      <Suspense fallback={<ChatSkeleton />}>
        <ChatBody params={params} />
      </Suspense>
    </div>
  );
}

async function loadChannel(channelId: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();

  // RLS only exposes channels the signed-in player belongs to, so a miss here
  // covers both "doesn't exist" and "not yours".
  const [{ data: channel }, { data: members }] = await Promise.all([
    supabase.from("channels").select("id, title, kind").eq("id", channelId).maybeSingle(),
    supabase
      .from("channel_members")
      .select("user_id, profiles(id, username, full_name, rating)")
      .eq("channel_id", channelId),
  ]);
  if (!channel) notFound();

  const roster = (members ?? [])
    .map((m) => m.profiles)
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  return {
    user,
    supabase,
    channel,
    roster,
    other: roster.find((p) => p.id !== user.id) ?? null,
  };
}

async function ChatHeader({ params }: { params: Params }) {
  const { id } = await params;
  const { channel, other } = await loadChannel(id);

  return (
    <header className="flex items-center gap-3 border-b border-border bg-bg-alt px-4 py-3">
      <BackLink />
      <OnlineAvatarWrapper userId={other?.id} dotSize={11}>
        <Avatar player={other ?? { username: channel.title ?? "?", full_name: null }} size={36} />
      </OnlineAvatarWrapper>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold">
          {other ? displayName(other) : (channel.title ?? "Conversation")}
        </div>
        {other && (
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <TierBadge rating={other.rating} size="sm" short />
            <OnlineLabel userId={other.id} />
          </div>
        )}
      </div>
      {other && (
        <div className="flex shrink-0 items-center gap-1.5">
          <StartLive opponentId={other.id} label="Score it" compact />
          <Link
            href={`/profile/${other.username}`}
            aria-label={`${displayName(other)}'s profile, where you can block or report them`}
            title="Profile, block or report"
            className="flex h-8 w-8 items-center justify-center rounded-full text-text-faint hover:bg-surface-2"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <circle cx="12" cy="5" r="1.6" />
              <circle cx="12" cy="12" r="1.6" />
              <circle cx="12" cy="19" r="1.6" />
            </svg>
          </Link>
        </div>
      )}
    </header>
  );
}

async function ChatBody({ params }: { params: Params }) {
  const { id: channelId } = await params;
  const { user, supabase, roster } = await loadChannel(channelId);

  const { data: messages } = await supabase
    .from("messages")
    .select("id, author_id, body, kind, created_at")
    .eq("channel_id", channelId)
    .order("created_at", { ascending: true })
    .limit(200);

  await supabase.rpc("mark_channel_read", { p_channel_id: channelId });

  return (
    <ChatRoom
      channelId={channelId}
      myId={user.id}
      initialMessages={messages ?? []}
      roster={roster.map((p) => ({
        id: p.id,
        username: p.username,
        full_name: p.full_name,
      }))}
    />
  );
}

function HeaderSkeleton() {
  return (
    <header className="flex items-center gap-3 border-b border-border bg-bg-alt px-4 py-3">
      <BackLink />
      <div className="h-9 w-9 animate-pulse rounded-full bg-surface-2" />
      <div className="flex-1">
        <div className="h-3.5 w-32 animate-pulse rounded bg-surface-2" />
        <div className="mt-2 h-3 w-20 animate-pulse rounded bg-surface-2" />
      </div>
    </header>
  );
}

function BackLink() {
  return (
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
  );
}
