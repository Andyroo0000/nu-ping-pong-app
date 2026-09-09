"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { MatchGame } from "@/lib/database.types";
import { normalizePlayStyle, OTHER_HALL } from "@/lib/halls";
import { AVAILABILITY_VALUES, normalizePlayPreference, YEAR_VALUES } from "@/lib/profile";

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
    .select("username")
    .eq("id", user.id)
    .single();

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

  revalidatePath("/matchmaking");
  return { ok: true, message: "Challenge sent — you'll get a chat once they accept." };
}

export async function respondToChallenge(formData: FormData): Promise<ActionResult> {
  const challengeId = String(formData.get("challengeId") ?? "");
  const accept = String(formData.get("accept") ?? "") === "true";
  if (!challengeId) return { ok: false, error: "Missing challenge." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_challenge", {
    p_challenge_id: challengeId,
    p_accept: accept,
  });
  if (error) return { ok: false, error: error.message };

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

  revalidatePath(`/chats/${channelId}`);
  return { ok: true };
}
