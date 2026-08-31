import type { Metadata } from "next";
import PlacePage, { placeMetadata } from "@/components/seo/PlacePage";
import { loadNetwork } from "@/lib/seo/network";
import { buildPlaces } from "@/lib/seo/places";

/** Same physical places as the HU route, keyed on the HU-derived slug
 *  (Ruling R15) - proper nouns don't translate, so the English category
 *  path carries the Hungarian place slug, not `slugRo`. */
export function generateStaticParams() {
  return buildPlaces(loadNetwork()).map((p) => ({ slug: p.slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  return placeMetadata(slug, "en");
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PlacePage lang="en" slug={slug} />;
}
