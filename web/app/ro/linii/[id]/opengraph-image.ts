// Per-line share card, Romanian twin of `/vonalak/[id]/opengraph-image`.
import { OG_SIZE, OG_CONTENT_TYPE } from "@/lib/seo/og";
import { loadNetwork } from "@/lib/seo/network";
import { lineIdForSlug, lineSlug } from "@/lib/seo/slug";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const dynamic = "force-static";

// Same id set as the page route - the line id is language-independent.
export function generateStaticParams() {
  return loadNetwork().lines.map((l) => ({ id: lineSlug(l.id) }));
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const id = lineIdForSlug(loadNetwork().lines.map((l) => l.id), (await params).id);
  const { lineOg } = await import("@/lib/seo/og");
  return lineOg(id, "ro");
}
