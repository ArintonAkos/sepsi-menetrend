// The homepage's share card. `.tsx` only because `size`/`contentType`/
// `dynamic` are plain exports here too - the tree itself is built in
// `homeOg()`, same as every other page's card.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-static";

export default async function Image() {
  const { homeOg } = await import("@/lib/seo/og");
  return homeOg("hu");
}
