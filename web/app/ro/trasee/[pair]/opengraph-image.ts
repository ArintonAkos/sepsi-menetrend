// Per-route share card, Romanian twin of `/utvonal/[pair]/opengraph-image`.
import { loadNetwork } from "@/lib/seo/network";
import { notablePairs } from "@/lib/seo/routes";

// Inline literals, not the `OG_SIZE` import - a static import of `og.tsx` here
// would drag the RAPTOR engine into this route's module graph.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-static";

// Same pairs as the HU route - keyed on the independent RO slug (R15).
export function generateStaticParams() {
  return notablePairs(loadNetwork()).map((p) => ({ pair: p.slugRo }));
}

export default async function Image({ params }: { params: Promise<{ pair: string }> }) {
  const { pair } = await params;
  const { routeOg } = await import("@/lib/seo/og");
  return routeOg(pair, "ro");
}
