"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { firstName } from "@/lib/names";
import { clockTime } from "@/lib/time";
import type { MessageKind } from "@/lib/database.types";

export type ChatMessage = {
  id: number;
  author_id: string | null;
  body: string;
  kind: MessageKind;
  created_at: string;
};

type RosterEntry = { id: string; username: string; full_name: string | null };

const ICEBREAKERS = [
  "Hey! When are you free to play?",
  "What's your go-to serve?",
  "Want to warm up for 10 minutes first?",
  "How long have you been playing?",
];

export function ChatRoom({
  channelId,
  myId,
  initialMessages,
  roster,
}: {
  channelId: string;
  myId: string;
  initialMessages: ChatMessage[];
  roster: RosterEntry[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const person of roster) map.set(person.id, firstName(person));
    return map;
  }, [roster]);

  const merge = useCallback((incoming: ChatMessage[]) => {
    setMessages((current) => {
      const byId = new Map(current.map((m) => [m.id, m]));
      for (const m of incoming) byId.set(m.id, m);
      return [...byId.values()].sort((a, b) => a.id - b.id);
    });
  }, []);

  const refetch = useCallback(async () => {
    const { data } = await supabase
      .from("messages")
      .select("id, author_id, body, kind, created_at")
      .eq("channel_id", channelId)
      .order("created_at", { ascending: true })
      .limit(200);
    if (data) merge(data);
  }, [supabase, channelId, merge]);

  // Live updates. The slow poll is a safety net for the case where Realtime
  // isn't enabled on the Supabase project — without it the chat would look
  // broken rather than just slightly delayed.
  useEffect(() => {
    const subscription = supabase
      .channel(`messages:${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `channel_id=eq.${channelId}`,
        },
        (payload) => merge([payload.new as ChatMessage])
      )
      .subscribe();

    const poll = setInterval(refetch, 10_000);

    return () => {
      clearInterval(poll);
      supabase.removeChannel(subscription);
    };
  }, [supabase, channelId, merge, refetch]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  // Clear the unread badge on the way out, and whenever new messages land
  // while the player is looking at them.
  useEffect(() => {
    supabase.rpc("mark_channel_read", { p_channel_id: channelId });
  }, [supabase, channelId, messages.length]);

  async function send(body: string) {
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);

    const { data, error: insertError } = await supabase
      .from("messages")
      .insert({ channel_id: channelId, author_id: myId, body: text, kind: "user" })
      .select("id, author_id, body, kind, created_at")
      .single();

    if (insertError) {
      setError(insertError.message);
    } else {
      setDraft("");
      if (data) merge([data]);
    }
    setSending(false);
  }

  const showIcebreakers = messages.every((m) => m.kind === "system");

  return (
    <>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="flex flex-col gap-2.5">
          {messages.map((message) =>
            message.kind === "system" ? (
              <div
                key={message.id}
                className="mx-auto max-w-[85%] rounded-xl bg-surface px-3.5 py-2.5 text-center text-[13px] leading-relaxed text-text-dim"
              >
                {message.body}
              </div>
            ) : (
              <Bubble
                key={message.id}
                message={message}
                mine={message.author_id === myId}
                authorName={
                  message.author_id ? (nameById.get(message.author_id) ?? "Someone") : "Someone"
                }
              />
            )
          )}
        </div>

        {showIcebreakers && (
          <div className="mt-5">
            <div className="mb-2 text-center text-xs font-bold text-text-faint">
              NOT SURE WHAT TO SAY?
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {ICEBREAKERS.map((line) => (
                <button
                  key={line}
                  type="button"
                  onClick={() => send(line)}
                  disabled={sending}
                  className="rounded-full border border-border-strong bg-surface px-3.5 py-2 text-[13px] font-semibold text-text-dim disabled:opacity-50"
                >
                  {line}
                </button>
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
        className="border-t border-border bg-bg-alt px-4 py-3"
      >
        {error && <p className="mb-2 text-[13px] font-semibold text-text-dim">{error}</p>}
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(draft);
              }
            }}
            rows={1}
            maxLength={2000}
            placeholder="Message…"
            aria-label="Message"
            className="max-h-32 flex-1 resize-none rounded-2xl border border-border-strong bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-ink"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            className="rounded-full bg-nu transition-colors hover:bg-nu-deep px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </form>
    </>
  );
}

function Bubble({
  message,
  mine,
  authorName,
}: {
  message: ChatMessage;
  mine: boolean;
  authorName: string;
}) {
  return (
    <div className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
      {!mine && (
        <div className="mb-0.5 px-1 text-[11px] font-bold text-text-faint">{authorName}</div>
      )}
      <div
        className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-sm ${
          mine
            ? "bg-ink text-white"
            : "border border-border bg-surface text-text"
        }`}
      >
        {message.body}
      </div>
      {/* Rendered in the viewer's own timezone, which the server can't know. */}
      <div
        className="mt-0.5 px-1 text-[10px] font-semibold text-text-faint"
        suppressHydrationWarning
      >
        {clockTime(message.created_at)}
      </div>
    </div>
  );
}
