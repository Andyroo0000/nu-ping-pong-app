"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { MatchGame } from "@/lib/database.types";

export async function reportMatch(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const opponentId = String(formData.get("opponentId") ?? "");
  const gamesRaw = String(formData.get("games") ?? "[]");

  let games: MatchGame[];
  try {
    games = JSON.parse(gamesRaw);
  } catch {
    games = [];
  }

  if (!opponentId || opponentId === user.id) {
    throw new Error("Choose a valid opponent before submitting.");
  }
  if (games.length === 0 || games.some((g) => g.a === g.b)) {
    throw new Error("Enter a final score for at least one game.");
  }

  const gamesWonA = games.filter((g) => g.a > g.b).length;
  const gamesWonB = games.filter((g) => g.b > g.a).length;
  if (gamesWonA === gamesWonB) {
    throw new Error("A match can't end in a tie.");
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
  });
  if (insertError) throw new Error(insertError.message);

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
