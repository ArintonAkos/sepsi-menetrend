// The RO homepage's share card - see app/opengraph-image.tsx.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-static";

export default async function Image() {
  const { homeOg } = await import("@/lib/seo/og");
  return homeOg("ro");
}
