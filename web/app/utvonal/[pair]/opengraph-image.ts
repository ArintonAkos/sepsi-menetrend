// Per-route share card. `.ts` (no JSX here) - the tree is built in `routeOg`.
import { loadNetwork } from "@/lib/seo/network";
import { notablePairs } from "@/lib/seo/routes";

// Inline literals, not the `OG_SIZE` import - a static import of `og.tsx` here
// would drag the RAPTOR engine into this route's module graph.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-static";

// Same slug set as the page route - one card per notable pair, HU slug (R15).
export function generateStaticParams() {
  return notablePairs(loadNetwork()).map((p) => ({ pair: p.slug }));
}

export default async function Image({ params }: { params: Promise<{ pair: string }> }) {
  const { pair } = await params;
  const { routeOg } = await import("@/lib/seo/og");
  return routeOg(pair, "hu");
}
