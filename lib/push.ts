import "server-only";

import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

export type PushKind = "challenge" | "message" | "confirmation";

export type PushPayload = {
  title: string;
  body: string;
  /** Where clicking the notification should land. */
  url: string;
  /** Notifications sharing a tag replace each other instead of stacking. */
  tag?: string;
};

// Selecting a dynamic column name defeats Supabase's type inference, so all
// three come back and the right one is picked here.
const PREFERENCE_COLUMN = {
  challenge: "notify_challenges",
  message: "notify_messages",
  confirmation: "notify_confirmations",
} as const satisfies Record<PushKind, string>;

let configured = false;

function configure(): boolean {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;

  if (!configured) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:admin@northeastern.edu",
      publicKey,
      privateKey
    );
    configured = true;
  }
  return true;
}

/**
 * Send a notification to every device a player has enabled, respecting their
 * per-kind preference.
 *
 * Never throws. A push failing is not a reason for the challenge or message
 * that triggered it to fail — the notification is a courtesy on top of an
 * action that already succeeded.
 */
export async function notify(userId: string, kind: PushKind, payload: PushPayload) {
  try {
    if (!configure()) return;

    const admin = createAdminClient();
    if (!admin) return;

    const { data: profile } = await admin
      .from("profiles")
      .select("notify_challenges, notify_messages, notify_confirmations")
      .eq("id", userId)
      .maybeSingle();

    if (!profile || profile[PREFERENCE_COLUMN[kind]] === false) return;

    const { data: subscriptions } = await admin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", userId);

    if (!subscriptions?.length) return;

    const body = JSON.stringify(payload);
    const dead: string[] = [];

    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            body
          );
        } catch (error) {
          // 404/410 mean the browser threw the subscription away — the app was
          // uninstalled, or notifications were revoked. Those rows are dead
          // weight and will never work again, so drop them.
          const status = (error as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) dead.push(sub.endpoint);
        }
      })
    );

    if (dead.length) {
      await admin.from("push_subscriptions").delete().in("endpoint", dead);
    }
  } catch {
    // Deliberately swallowed — see the note above.
  }
}

/** Trim a message to something that reads well in a notification. */
export function preview(text: string, max = 120): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}
