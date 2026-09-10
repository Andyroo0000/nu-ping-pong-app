"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { MatchGame } from "@/lib/database.types";
import { normalizePlayStyle, OTHER_HALL } from "@/lib/halls";
import { AVAILABILITY_VALUES, normalizePlayPreference, YEAR_VALUES } from "@/lib/profile";
import { notify, preview } from "@/lib/push";
import { displayName } from "@/lib/names";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

/**
 * Validation problems come back as a value rather than a thrown error: an
 * uncaught throw inside a Server Action reaches the browser as an opaque
 * "an error occurred" digest in production, which tells the player nothing.
 */
export async function reportMatch(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const opponentId = String(formData.get("opponentId") ?? "");
  const gamesRaw = String(formData.get("games") ?? "[]");
  // Ranked unless the player explicitly said casual, so an unfamiliar or
  // missing value can never silently stop a result from counting.
  const isRanked = String(formData.get("matchKind") ?? "ranked") !== "casual";

  let games: MatchGame[];
  try {
    games = JSON.parse(gamesRaw);
  } catch {
    games = [];
  }

  if (!opponentId || opponentId === user.id) {
    return { ok: false, error: "Choose a valid opponent before submitting." };
  }
  if (!Array.isArray(games) || games.length === 0) {
    return { ok: false, error: "Enter a final score for at least one game." };
  }
  if (games.length > 7) {
    return { ok: false, error: "That's more games than any supported format." };
  }
  if (
    games.some(
      (g) =>
        !Number.isInteger(g?.a) ||
        !Number.isInteger(g?.b) ||
        g.a < 0 ||
        g.b < 0 ||
        g.a > 99 ||
        g.b > 99 ||
        g.a === g.b
    )
  ) {
    return {
      ok: false,
      error: "Every game needs two whole scores, and a game can't be a tie.",
    };
  }

  const gamesWonA = games.filter((g) => g.a > g.b).length;
  const gamesWonB = games.filter((g) => g.b > g.a).length;
  if (gamesWonA === gamesWonB) {
    return { ok: false, error: "A match can't end in a tie." };
  }
  const winner = gamesWonA > gamesWonB ? user.id : opponentId;

  const { error: insertError } = await supabase.from("matches").insert({
    player_a: user.id,
    player_b: opponentId,
    games,
    games_won_a: gamesWonA,
    games_won_b: gamesWonB,
    winner,
    reported_by: user.id,
    is_ranked: isRanked,
  });
  if (insertError) return { ok: false, error: insertError.message };

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, full_name")
    .eq("id", user.id)
    .single();

  const me = profile ? displayName(profile) : "Someone";
  await notify(opponentId, "confirmation", {
    title: "Confirm a result",
    body: `${me} reported a ${isRanked ? "ranked" : "casual"} match ${gamesWonA}–${gamesWonB}. Confirm or dispute it.`,
    url: `/profile/${profile?.username ?? ""}`,
    tag: "confirmation",
  });

  revalidatePath("/leaderboard");
  redirect(`/profile/${profile?.username ?? ""}`);
}

export async function confirmMatch(formData: FormData) {
  const matchId = String(formData.get("matchId") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_match", { p_match_id: matchId });
  if (error) throw new Error(error.message);
  revalidatePath("/leaderboard");
  revalidatePath("/profile/[username]", "page");
}

export async function declineMatch(formData: FormData) {
  const matchId = String(formData.get("matchId") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("decline_match", { p_match_id: matchId });
  if (error) throw new Error(error.message);
  revalidatePath("/profile/[username]", "page");
}

// ---------------------------------------------------------------------------
// Matchmaking
// ---------------------------------------------------------------------------

export async function sendChallenge(formData: FormData): Promise<ActionResult> {
  const opponentId = String(formData.get("opponentId") ?? "");
  const note = String(formData.get("note") ?? "").slice(0, 280);
  if (!opponentId) return { ok: false, error: "Pick someone to challenge first." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("send_challenge", {
    p_opponent: opponentId,
    p_note: note || null,
  });
  if (error) return { ok: false, error: error.message };

  const me = await currentPlayerName(supabase);
  await notify(opponentId, "challenge", {
    title: "New challenge",
    body: note ? `${me} challenged you: ${preview(note, 80)}` : `${me} challenged you to a match.`,
    url: "/matchmaking",
    tag: "challenge",
  });

  revalidatePath("/matchmaking");
  return { ok: true, message: "Challenge sent — you'll get a chat once they accept." };
}

export async function respondToChallenge(formData: FormData): Promise<ActionResult> {
  const challengeId = String(formData.get("challengeId") ?? "");
  const accept = String(formData.get("accept") ?? "") === "true";
  if (!challengeId) return { ok: false, error: "Missing challenge." };

  const supabase = await createClient();

  // Read who to tell before responding — accepting clears the pending row.
  const { data: challenge } = await supabase
    .from("challenges")
    .select("challenger")
    .eq("id", challengeId)
    .maybeSingle();

  const { error } = await supabase.rpc("respond_challenge", {
    p_challenge_id: challengeId,
    p_accept: accept,
  });
  if (error) return { ok: false, error: error.message };

  if (accept && challenge?.challenger) {
    const me = await currentPlayerName(supabase);
    await notify(challenge.challenger, "challenge", {
      title: "Match on",
      body: `${me} accepted your challenge. Your chat is open.`,
      url: "/chats",
      tag: "challenge",
    });
  }

  revalidatePath("/matchmaking");
  revalidatePath("/chats");
  return {
    ok: true,
    message: accept ? "Match on — your chat is ready." : "Challenge declined.",
  };
}

export async function cancelChallenge(formData: FormData): Promise<ActionResult> {
  const challengeId = String(formData.get("challengeId") ?? "");
  const supabase = await createClient();
  const { error } = await supabase
    .from("challenges")
    .update({ status: "cancelled", responded_at: new Date().toISOString() })
    .eq("id", challengeId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/matchmaking");
  return { ok: true, message: "Challenge withdrawn." };
}

/** The dropdown posts a sentinel when the player chose "Somewhere else". */
function readHall(formData: FormData): string | null {
  const hall = String(formData.get("hall") ?? "").trim();
  if (hall === OTHER_HALL) {
    return String(formData.get("otherHall") ?? "").trim().slice(0, 120) || null;
  }
  return hall.slice(0, 120) || null;
}

// Takes FormData it doesn't need so it can be used with <form action={…}>.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function leaveQueue(_formData?: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("leave_queue");
  if (error) return { ok: false, error: error.message };

  revalidatePath("/matchmaking");
  return { ok: true, message: "You've left the queue." };
}

/**
 * Get listed in a hall and try to pair with someone already waiting there.
 * On a match, drops both players straight into the chat. With nobody else in
 * that hall, the player stays listed and lands back on the matchmaking page,
 * which then shows who's playing elsewhere.
 */
export async function findMatchInHall(formData: FormData): Promise<ActionResult> {
  const hall = readHall(formData);
  const playStyle = normalizePlayStyle(formData.get("playStyle"));
  if (!hall) return { ok: false, error: "Pick which hall you're playing in first." };

  const supabase = await createClient();
  const { data: channelId, error } = await supabase.rpc("find_match_in_hall", {
    p_hall: hall,
    p_play_style: playStyle,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/matchmaking");
  revalidatePath("/chats");

  if (!channelId) {
    const params = new URLSearchParams({ hall, style: playStyle, searched: "1" });
    redirect(`/matchmaking?${params}`);
  }
  redirect(`/chats/${channelId}`);
}

/** "Someone's playing over at Mary Morse" — join them right now. */
export async function pairWithPlayer(formData: FormData): Promise<ActionResult> {
  const opponentId = String(formData.get("opponentId") ?? "");
  if (!opponentId) return { ok: false, error: "Pick someone to join." };

  const supabase = await createClient();
  const { data: channelId, error } = await supabase.rpc("pair_with_player", {
    p_opponent: opponentId,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/matchmaking");
  revalidatePath("/chats");
  redirect(`/chats/${channelId}`);
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export async function saveProfile(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const fullName = String(formData.get("fullName") ?? "").trim().slice(0, 80);
  if (!fullName) {
    return { ok: false, error: "Add your name so people know who they're playing." };
  }

  const bio = String(formData.get("bio") ?? "").trim().slice(0, 400);
  const yearRaw = String(formData.get("year") ?? "");
  const homeHall = readHall(formData);
  const availability = formData
    .getAll("availability")
    .map(String)
    .filter((slot) => AVAILABILITY_VALUES.includes(slot));

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: fullName,
      bio: bio || null,
      year: YEAR_VALUES.includes(yearRaw) ? yearRaw : null,
      home_hall: homeHall,
      availability,
      play_preference: normalizePlayPreference(formData.get("playPreference")),
    })
    .eq("id", user.id);
  if (error) return { ok: false, error: error.message };

  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .single();

  revalidatePath("/leaderboard");
  revalidatePath("/matchmaking");
  if (profile?.username) revalidatePath(`/profile/${profile.username}`);
  redirect(`/profile/${profile?.username ?? ""}`);
}

/**
 * Record a freshly uploaded avatar. The file itself goes straight from the
 * browser to Supabase Storage — routing megabytes through a Server Action
 * would be slower and runs into request body limits — so this only saves the
 * resulting path and clears out the previous file.
 */
export async function setAvatarPath(formData: FormData): Promise<ActionResult> {
  const path = String(formData.get("path") ?? "").trim();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Storage policies already confine writes to a folder named after the
  // player's id; check it here too so a stray path can't be recorded.
  if (path && !path.startsWith(`${user.id}/`)) {
    return { ok: false, error: "That image doesn't belong to your profile." };
  }

  const { data: existing } = await supabase
    .from("profiles")
    .select("avatar_path, username")
    .eq("id", user.id)
    .single();

  const { error } = await supabase
    .from("profiles")
    .update({ avatar_path: path || null })
    .eq("id", user.id);
  if (error) return { ok: false, error: error.message };

  if (existing?.avatar_path && existing.avatar_path !== path) {
    await supabase.storage.from("avatars").remove([existing.avatar_path]);
  }

  revalidatePath("/leaderboard");
  revalidatePath("/matchmaking");
  if (existing?.username) revalidatePath(`/profile/${existing.username}`);
  return { ok: true };
}

export async function sendMessage(formData: FormData): Promise<ActionResult> {
  const channelId = String(formData.get("channelId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!channelId) return { ok: false, error: "Missing channel." };
  if (!body) return { ok: false, error: "Type a message first." };
  if (body.length > 2000) return { ok: false, error: "That message is too long (2,000 max)." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("messages")
    .insert({ channel_id: channelId, author_id: user.id, body, kind: "user" });
  if (error) return { ok: false, error: error.message };

  await notifyChannel(supabase, channelId, user.id, body);

  revalidatePath(`/chats/${channelId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Direct chats, blocking, reporting
// ---------------------------------------------------------------------------

/** Chat with someone without challenging them. Reuses an existing thread. */
export async function startChat(formData: FormData): Promise<ActionResult> {
  const otherId = String(formData.get("otherId") ?? "");
  if (!otherId) return { ok: false, error: "Pick someone to message." };

  const supabase = await createClient();
  const { data: channelId, error } = await supabase.rpc("open_direct_channel", {
    p_other: otherId,
  });
  if (error) return { ok: false, error: error.message };
  if (!channelId) return { ok: false, error: "Couldn't open that chat." };

  revalidatePath("/chats");
  redirect(`/chats/${channelId}`);
}

export async function blockPlayer(formData: FormData): Promise<ActionResult> {
  const otherId = String(formData.get("otherId") ?? "");
  if (!otherId) return { ok: false, error: "Missing player." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (otherId === user.id) return { ok: false, error: "You can't block yourself." };

  const { error } = await supabase
    .from("blocks")
    .upsert({ blocker: user.id, blocked: otherId }, { onConflict: "blocker,blocked" });
  if (error) return { ok: false, error: error.message };

  // Any pending challenge between them is void now, in either direction.
  await supabase
    .from("challenges")
    .update({ status: "cancelled", responded_at: new Date().toISOString() })
    .eq("status", "pending")
    .eq("challenger", user.id)
    .eq("opponent", otherId);

  revalidateEverywhere();
  return { ok: true, message: "Blocked. They can't message or challenge you." };
}

export async function unblockPlayer(formData: FormData): Promise<ActionResult> {
  const otherId = String(formData.get("otherId") ?? "");
  if (!otherId) return { ok: false, error: "Missing player." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("blocks")
    .delete()
    .eq("blocker", user.id)
    .eq("blocked", otherId);
  if (error) return { ok: false, error: error.message };

  revalidateEverywhere();
  return { ok: true, message: "Unblocked." };
}

export async function reportPlayer(formData: FormData): Promise<ActionResult> {
  const reported = String(formData.get("otherId") ?? "");
  const reason = String(formData.get("reason") ?? "");
  const detail = String(formData.get("detail") ?? "").trim().slice(0, 1000);
  const channelId = String(formData.get("channelId") ?? "");

  const VALID = ["harassment", "spam", "fake-results", "photo", "other"];
  if (!reported) return { ok: false, error: "Missing player." };
  if (!VALID.includes(reason)) return { ok: false, error: "Pick a reason." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (reported === user.id) return { ok: false, error: "You can't report yourself." };

  const { error } = await supabase.from("reports").insert({
    reporter: user.id,
    reported,
    reason,
    detail: detail || null,
    channel_id: channelId || null,
  });
  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    message: "Reported. The club organiser will see this. Block them too if you'd rather not hear from them.",
  };
}

/** A block changes who shows up almost everywhere, so refresh the lot. */
function revalidateEverywhere() {
  revalidatePath("/home");
  revalidatePath("/members");
  revalidatePath("/matchmaking");
  revalidatePath("/chats");
  revalidatePath("/profile/[username]", "page");
}

/**
 * Send the organiser a suggestion or a bug report.
 *
 * Anonymous is a real option: the point is to hear what people actually think,
 * and someone worried about being identified in a small club just won't send
 * anything. Anonymous rows have a null author, so nobody — including the
 * sender — can read them back through the API.
 */
export async function sendSuggestion(formData: FormData): Promise<ActionResult> {
  const body = String(formData.get("body") ?? "").trim().slice(0, 2000);
  const kindRaw = String(formData.get("kind") ?? "idea");
  const anonymous = String(formData.get("anonymous") ?? "") === "on";

  if (!body) return { ok: false, error: "Write something first." };

  const kind = ["idea", "bug", "other"].includes(kindRaw) ? kindRaw : "idea";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("suggestions")
    .insert({ author: anonymous ? null : user.id, kind, body });
  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    message: anonymous
      ? "Sent anonymously. Thanks — it goes straight to the organiser."
      : "Sent. Thanks — it goes straight to the organiser.",
  };
}

/** Mark the walkthrough as seen, so it doesn't come back. */
export async function completeOnboarding(): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("profiles")
    .update({ onboarded_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/home");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Live scoreboards
// ---------------------------------------------------------------------------

/** Start (or resume) a live scoreboard against someone, then open it. */
export async function startLiveMatch(formData: FormData): Promise<ActionResult> {
  const opponentId = String(formData.get("opponentId") ?? "");
  const bestOf = Number(formData.get("bestOf") ?? 3);
  const isRanked = String(formData.get("matchKind") ?? "ranked") !== "casual";
  if (!opponentId) return { ok: false, error: "Pick someone to play." };

  const supabase = await createClient();
  const { data: liveId, error } = await supabase.rpc("start_live_match", {
    p_opponent: opponentId,
    p_best_of: [1, 3, 5].includes(bestOf) ? bestOf : 3,
    p_is_ranked: isRanked,
  });
  if (error) return { ok: false, error: error.message };

  const me = await currentPlayerName(supabase);
  await notify(opponentId, "challenge", {
    title: "Match started",
    body: `${me} started a scoreboard for your match. Follow along or take over scoring.`,
    url: `/live/${liveId}`,
    tag: "live",
  });

  revalidatePath("/home");
  redirect(`/live/${liveId}`);
}

/**
 * Turn a finished scoreboard into a pending match for the opponent to
 * confirm. Ratings still only move on confirmation — a scoreboard is a way to
 * keep score, not a way to skip agreement.
 */
export async function submitLiveMatch(formData: FormData): Promise<ActionResult> {
  const liveId = String(formData.get("liveId") ?? "");
  if (!liveId) return { ok: false, error: "Missing match." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_live_match", { p_id: liveId });
  if (error) return { ok: false, error: error.message };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: live } = await supabase
    .from("live_matches")
    .select("player_a, player_b")
    .eq("id", liveId)
    .maybeSingle();

  const other =
    live && user ? (live.player_a === user.id ? live.player_b : live.player_a) : null;
  if (other) {
    const me = await currentPlayerName(supabase);
    await notify(other, "confirmation", {
      title: "Confirm a result",
      body: `${me} submitted your match. Confirm or dispute it.`,
      url: "/home",
      tag: "confirmation",
    });
  }

  revalidatePath("/home");
  revalidatePath("/leaderboard");
  return { ok: true, message: "Sent for confirmation." };
}

export async function abandonLiveMatch(formData: FormData): Promise<ActionResult> {
  const liveId = String(formData.get("liveId") ?? "");
  if (!liveId) return { ok: false, error: "Missing match." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("abandon_live_match", { p_id: liveId });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/home");
  redirect("/home");
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

async function currentPlayerName(supabase: ServerSupabase): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "Someone";
  const { data } = await supabase
    .from("profiles")
    .select("full_name, username")
    .eq("id", user.id)
    .maybeSingle();
  return data ? displayName(data) : "Someone";
}

async function notifyChannel(
  supabase: ServerSupabase,
  channelId: string,
  authorId: string,
  body: string
) {
  const [{ data: members }, name] = await Promise.all([
    supabase.from("channel_members").select("user_id").eq("channel_id", channelId),
    currentPlayerName(supabase),
  ]);

  const recipients = (members ?? [])
    .map((m) => m.user_id)
    .filter((id) => id !== authorId);

  await Promise.all(
    recipients.map((id) =>
      notify(id, "message", {
        title: name,
        body: preview(body),
        url: `/chats/${channelId}`,
        // Tagged per channel, so five messages from one person replace each
        // other instead of stacking five notifications.
        tag: `chat-${channelId}`,
      })
    )
  );
}

/** Store a browser's push subscription so the server can reach this player. */
export async function savePushSubscription(formData: FormData): Promise<ActionResult> {
  const endpoint = String(formData.get("endpoint") ?? "");
  const p256dh = String(formData.get("p256dh") ?? "");
  const auth = String(formData.get("auth") ?? "");
  const userAgent = String(formData.get("userAgent") ?? "").slice(0, 300);

  if (!endpoint || !p256dh || !auth) {
    return { ok: false, error: "That subscription looked incomplete. Try again." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      endpoint,
      user_id: user.id,
      p256dh,
      auth,
      user_agent: userAgent || null,
      last_used_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" }
  );
  if (error) return { ok: false, error: error.message };

  return { ok: true, message: "Notifications are on for this device." };
}

export async function deletePushSubscription(formData: FormData): Promise<ActionResult> {
  const endpoint = String(formData.get("endpoint") ?? "");
  if (!endpoint) return { ok: false, error: "Missing subscription." };

  const supabase = await createClient();
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  if (error) return { ok: false, error: error.message };

  return { ok: true, message: "Notifications are off for this device." };
}

/** Prove to someone that it works, right after they turn it on. */
export async function sendTestPush(): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await notify(user.id, "challenge", {
    title: "Notifications are on",
    body: "This is what a challenge will look like. See you at the tables.",
    url: "/matchmaking",
    tag: "test",
  });
  return { ok: true, message: "Sent — check your notifications." };
}
