// Per-stop share card. `.ts` (no JSX here) - the tree is built in `placeOg`.
import { loadNetwork } from "@/lib/seo/network";
import { buildPlaces } from "@/lib/seo/places";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-static";

// Same slug set as the page route - one card per physical place, HU slug.
export function generateStaticParams() {
  return buildPlaces(loadNetwork()).map((p) => ({ slug: p.slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { placeOg } = await import("@/lib/seo/og");
  return placeOg(slug, "hu");
}
