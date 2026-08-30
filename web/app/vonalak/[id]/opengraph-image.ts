// Per-line share card. `.ts` (no JSX here) - the tree is built in `lineOg`.
import { OG_SIZE, OG_CONTENT_TYPE } from "@/lib/seo/og";
import { loadNetwork } from "@/lib/seo/network";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const dynamic = "force-static";

// Same id set as the page route - one card per `Line.id`, id used verbatim.
export function generateStaticParams() {
  return loadNetwork().lines.map((l) => ({ id: l.id }));
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { lineOg } = await import("@/lib/seo/og");
  return lineOg(id, "hu");
}
