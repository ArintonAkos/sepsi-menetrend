import type { Metadata } from "next";
import PlacePage, { placeMetadata } from "@/components/seo/PlacePage";
import { loadNetwork } from "@/lib/seo/network";
import { buildPlaces } from "@/lib/seo/places";

/** Same physical places as the HU route, but keyed on the RO-derived slug
 *  (Ruling R15) - Romanian speakers do not search the Hungarian name. */
export function generateStaticParams() {
  return buildPlaces(loadNetwork()).map((p) => ({ slug: p.slugRo }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  return placeMetadata(slug, "ro");
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PlacePage lang="ro" slug={slug} />;
}
