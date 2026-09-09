import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { Nav } from "@/components/Nav";
import { Avatar } from "@/components/Avatar";
import { displayName } from "@/lib/names";
import { relativeTime } from "@/lib/time";

export const dynamic = "force-dynamic";

type Member = {
  channel_id: string;
  user_id: string;
  profiles: { username: string; full_name: string | null; rating: number } | null;
};

export default async function ChatsPage() {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("channel_members")
    .select("channel_id, channels(id, title, kind, last_message_at)")
    .eq("user_id", user.id);

  const channels = (memberships ?? [])
    .map((m) => m.channels)
    .filter((c): c is NonNullable<typeof c> => Boolean(c))
    .sort((a, b) => b.last_message_at.localeCompare(a.last_message_at));

  const channelIds = channels.map((c) => c.id);

  const [{ data: others }, { data: recent }, { data: unread }] = await Promise.all([
    channelIds.length
      ? supabase
          .from("channel_members")
          .select("channel_id, user_id, profiles(username, full_name, rating)")
          .in("channel_id", channelIds)
          .neq("user_id", user.id)
      : Promise.resolve({ data: [] as Member[] }),
    channelIds.length
      ? supabase
          .from("messages")
          .select("channel_id, body, created_at, kind")
          .in("channel_id", channelIds)
          .order("created_at", { ascending: false })
          .limit(200)
      : Promise.resolve({ data: [] }),
    supabase.rpc("unread_summary"),
  ]);

  const membersByChannel = new Map<string, Member[]>();
  for (const m of (others ?? []) as Member[]) {
    membersByChannel.set(m.channel_id, [...(membersByChannel.get(m.channel_id) ?? []), m]);
  }

  const lastMessageByChannel = new Map<string, { body: string; created_at: string }>();
  for (const m of recent ?? []) {
    if (!lastMessageByChannel.has(m.channel_id)) lastMessageByChannel.set(m.channel_id, m);
  }

  const unreadByChannel = new Map((unread ?? []).map((u) => [u.channel_id, u.unread]));

  return (
    <div className="min-h-screen bg-bg">
      <Nav />
      <div className="mx-auto max-w-md px-6 py-10">
        <h1 className="font-display text-3xl font-bold">Chats</h1>
        <p className="mt-1 text-sm text-text-dim">
          A channel opens automatically whenever a challenge is accepted.
        </p>

        {channels.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-border bg-surface p-6 text-center">
            <p className="text-sm text-text-dim">
              No chats yet. Pair up with someone and you&rsquo;ll get one here.
            </p>
            <Link
              href="/matchmaking"
              className="mt-4 inline-block rounded-xl bg-ink px-5 py-3 text-sm font-bold text-white"
            >
              Find a match
            </Link>
          </div>
        ) : (
          <div className="mt-7 flex flex-col gap-2.5">
            {channels.map((channel) => {
              const members = membersByChannel.get(channel.id) ?? [];
              const other = members[0]?.profiles ?? null;
              const last = lastMessageByChannel.get(channel.id);
              const count = unreadByChannel.get(channel.id) ?? 0;
              const title = other
                ? displayName(other)
                : (channel.title ?? "Conversation");

              return (
                <Link
                  key={channel.id}
                  href={`/chats/${channel.id}`}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-3.5 py-3 hover:border-border-strong"
                >
                  <Avatar player={other ?? { username: title, full_name: null }} size={42} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="truncate text-sm font-bold">{title}</div>
                      <div className="shrink-0 text-[11px] font-semibold text-text-faint">
                        {relativeTime(channel.last_message_at)}
                      </div>
                    </div>
                    <div className="mt-0.5 truncate text-[13px] text-text-dim">
                      {last?.body ?? "No messages yet"}
                    </div>
                  </div>
                  {count > 0 && (
                    <div className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-ink px-1.5 text-[11px] font-bold text-white">
                      {count > 99 ? "99+" : count}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
