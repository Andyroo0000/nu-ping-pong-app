import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NU Ping Pong",
    short_name: "NU Ping Pong",
    description:
      "Northeastern's ping pong ladder — log matches, climb the tiers, and find someone to play right now.",
    start_url: "/leaderboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#c8102e",
    categories: ["sports", "social"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Android crops this to whatever shape the launcher uses, so the husky
      // sits inside the safe zone with red bleeding to the edges.
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Find a match", url: "/matchmaking" },
      { name: "Chats", url: "/chats" },
      { name: "Log a match", url: "/log-match" },
    ],
  };
}
