import type { MetadataRoute } from "next";

export const dynamic = "force-static";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sepsimenetrend.ro";

/** One page, honestly declared. The planner is a single screen; listing routes
 *  that do not exist would be worse than a short sitemap. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE}/terms/`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE}/privacy/`, changeFrequency: "monthly", priority: 0.5 },
  ];
}
