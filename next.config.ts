import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Partial Prerendering: Next serves a static HTML shell immediately and
  // streams the per-player parts in when they're ready, instead of every
  // navigation waiting on auth + database round trips before anything paints.
  cacheComponents: true,
};

export default nextConfig;
