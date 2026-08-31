import type { Metadata } from "next";
import RoutePage, { routeMetadata } from "@/components/seo/RoutePage";
import { loadNetwork } from "@/lib/seo/network";
import { notablePairs } from "@/lib/seo/routes";

/** Same unordered notable pairs as the HU route, keyed on the HU-derived pair
 *  slug (Ruling R15) - the English category path carries the Hungarian pair
 *  slug, not `slugRo`. Only canonical slugs are emitted; a reverse guess 404s. */
export function generateStaticParams() {
  return notablePairs(loadNetwork()).map((p) => ({ pair: p.slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ pair: string }> },
): Promise<Metadata> {
  const { pair } = await params;
  return routeMetadata(pair, "en");
}

export default async function Page({ params }: { params: Promise<{ pair: string }> }) {
  const { pair } = await params;
  return <RoutePage lang="en" pair={pair} />;
}
