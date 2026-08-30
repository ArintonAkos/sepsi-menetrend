import { describe, it, expect } from "vitest";
import huImage, {
  generateStaticParams as huParams,
} from "@/app/megallok/[slug]/opengraph-image";
import roImage, {
  generateStaticParams as roParams,
} from "@/app/ro/statii/[slug]/opengraph-image";

/** Invoke a route's default `Image({ params })` and read the bytes back. */
async function card(
  image: unknown,
  slug: string,
): Promise<{ type: string | null; buf: Buffer }> {
  const res = await (
    image as (a: { params: Promise<{ slug: string }> }) => Promise<Response>
  )({ params: Promise.resolve({ slug }) });
  return { type: res.headers.get("content-type"), buf: Buffer.from(await res.arrayBuffer()) };
}

/** PNG magic bytes - Satori/resvg always emit a real PNG, never a data URL. */
const isPng = (buf: Buffer): boolean => buf.subarray(0, 4).toString("hex") === "89504e47";

describe("place OG card - Hungarian route", () => {
  it("prerenders one card per physical place (> 40)", async () => {
    const params = await huParams();
    expect(params.length).toBeGreaterThan(40);
    expect(new Set(params.map((p) => p.slug)).size).toBe(params.length);
  });

  it("renders a PNG for the first place param (brief's test)", async () => {
    const params = await huParams();
    const res = await (
      huImage as (a: { params: Promise<{ slug: string }> }) => Promise<Response>
    )({ params: Promise.resolve(params[0]) });
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(isPng(Buffer.from(await res.arrayBuffer()))).toBe(true);
  });

  it("renders the Sepsi Aréna card - a place served by two lines (5 · 6)", async () => {
    const { type, buf } = await card(huImage, "sepsi-arena");
    expect(type).toBe("image/png");
    expect(isPng(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(2000);
  });

  it("renders a single-line place card (Borvíz utca - line 9)", async () => {
    const { type, buf } = await card(huImage, "borviz-utca");
    expect(type).toBe("image/png");
    expect(isPng(buf)).toBe(true);
  });
});

describe("place OG card - Romanian route", () => {
  it("enumerates one RO card per place, keyed on slugRo", async () => {
    const params = await roParams();
    expect(params.length).toBe((await huParams()).length);
    expect(params.some((p) => p.slug === "arena-sepsi")).toBe(true);
    expect(params.some((p) => p.slug === "sepsi-arena")).toBe(false);
  });

  it("renders a Romanian PNG for arena-sepsi (slugRo of Sepsi Aréna)", async () => {
    const { type, buf } = await card(roImage, "arena-sepsi");
    expect(type).toBe("image/png");
    expect(isPng(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(2000);
  });
});
