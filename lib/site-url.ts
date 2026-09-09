/**
 * The app's public origin, for the handful of places that need an absolute
 * URL rather than a relative one (metadata, social previews).
 *
 * Set NEXT_PUBLIC_SITE_URL once a custom domain is live so links point at the
 * real name rather than a deploy URL. VERCEL_URL is the per-deployment
 * hostname, which is right for previews and a fine fallback in production.
 * Nothing else in the app hardcodes a hostname — auth callbacks read the
 * request's own origin — so moving domains is a config change, not a code one.
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  const vercel = process.env.NEXT_PUBLIC_VERCEL_URL ?? process.env.VERCEL_URL;
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;

  return "http://localhost:3000";
}
