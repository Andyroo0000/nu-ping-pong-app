/**
 * Public URL for an avatar stored in the "avatars" bucket.
 *
 * Built by hand rather than via supabase.storage.getPublicUrl() so that
 * Server Components can render an <img> without constructing a Supabase
 * client — the bucket is public, so the URL shape is all that's needed.
 */
export function avatarUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/avatars/${path}`;
}
