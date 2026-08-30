import type { Metadata } from "next";
import RoutePage, { routeMetadata, routeNetwork } from "@/components/seo/RoutePage";
import { notablePairs } from "@/lib/seo/routes";

/** Same unordered notable pairs as the HU route, keyed on the RO-derived pair
 *  slug (Ruling R15) - Romanian speakers do not search the Hungarian names. */
export function generateStaticParams() {
  return notablePairs(routeNetwork()).map((p) => ({ pair: p.slugRo }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ pair: string }> },
): Promise<Metadata> {
  const { pair } = await params;
  return routeMetadata(pair, "ro");
}

export default async function Page({ params }: { params: Promise<{ pair: string }> }) {
  const { pair } = await params;
  return <RoutePage lang="ro" pair={pair} />;
}
