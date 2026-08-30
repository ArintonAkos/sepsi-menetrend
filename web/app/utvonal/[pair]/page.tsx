import type { Metadata } from "next";
import RoutePage, { routeMetadata, routeNetwork } from "@/components/seo/RoutePage";
import { notablePairs } from "@/lib/seo/routes";

/** One prerendered page per unordered notable pair, keyed on the HU-derived
 *  pair slug (Ruling R15 - the `/ro/` route enumerates `slugRo` instead). Only
 *  canonical slugs are emitted; a hand-typed reverse guess 404s. */
export function generateStaticParams() {
  return notablePairs(routeNetwork()).map((p) => ({ pair: p.slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ pair: string }> },
): Promise<Metadata> {
  const { pair } = await params;
  return routeMetadata(pair, "hu");
}

export default async function Page({ params }: { params: Promise<{ pair: string }> }) {
  const { pair } = await params;
  return <RoutePage lang="hu" pair={pair} />;
}
