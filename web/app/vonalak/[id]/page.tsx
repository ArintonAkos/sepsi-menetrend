import type { Metadata } from "next";
import LinePage, { lineMetadata } from "@/components/seo/LinePage";
import { loadNetwork } from "@/lib/seo/network";
import { lineIdForSlug, lineSlug } from "@/lib/seo/slug";

/** One prerendered page per `Line.id`; the URL segment is the lowercased id ("1D" -> "1d", see `lineSlug`). */
export function generateStaticParams() {
  return loadNetwork().lines.map((l) => ({ id: lineSlug(l.id) }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
  const id = lineIdForSlug(loadNetwork().lines.map((l) => l.id), (await params).id);
  return lineMetadata(id, "hu");
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const id = lineIdForSlug(loadNetwork().lines.map((l) => l.id), (await params).id);
  return <LinePage lang="hu" id={id} />;
}
