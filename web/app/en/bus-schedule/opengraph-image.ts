// Per-page share card. `.ts` (no JSX here) - the tree is built in `guideOg`.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-static";

export default async function Image() {
  const { guideOg } = await import("@/lib/seo/og");
  return guideOg("pillar", "en");
}
