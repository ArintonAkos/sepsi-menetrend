// Per-stop share card, Romanian twin of `/megallok/[slug]/opengraph-image`.
import { loadNetwork } from "@/lib/seo/network";
import { buildPlaces } from "@/lib/seo/places";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-static";

// Same slug set as the RO page route - keyed on the independent RO slug (R15).
export function generateStaticParams() {
  return buildPlaces(loadNetwork()).map((p) => ({ slug: p.slugRo }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { placeOg } = await import("@/lib/seo/og");
  return placeOg(slug, "ro");
}
