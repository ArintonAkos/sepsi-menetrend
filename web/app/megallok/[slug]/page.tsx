import type { Metadata } from "next";
import PlacePage, { placeMetadata } from "@/components/seo/PlacePage";
import { loadNetwork } from "@/lib/seo/network";
import { buildPlaces } from "@/lib/seo/places";

/** One prerendered page per physical place, keyed on the HU-derived slug
 *  (Ruling R15 - the `/ro/` route enumerates `slugRo` instead). */
export function generateStaticParams() {
  return buildPlaces(loadNetwork()).map((p) => ({ slug: p.slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  return placeMetadata(slug, "hu");
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PlacePage lang="hu" slug={slug} />;
}
