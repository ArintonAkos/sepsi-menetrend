import { describe, it, expect } from "vitest";
import huImage, {
  generateStaticParams as huParams,
} from "@/app/utvonal/[pair]/opengraph-image";
import roImage, {
  generateStaticParams as roParams,
} from "@/app/ro/trasee/[pair]/opengraph-image";
import { routeOg } from "./og";
import { loadNetwork } from "./network";
import { notablePairs } from "./routes";

/** Invoke a route's default `Image({ params })` and read the bytes back. */
async function card(
  image: unknown,
  pair: string,
): Promise<{ type: string | null; buf: Buffer }> {
  const res = await (
    image as (a: { params: Promise<{ pair: string }> }) => Promise<Response>
  )({ params: Promise.resolve({ pair }) });
  return { type: res.headers.get("content-type"), buf: Buffer.from(await res.arrayBuffer()) };
}

/** PNG magic bytes - Satori/resvg always emit a real PNG, never a data URL. */
const isPng = (buf: Buffer): boolean => buf.subarray(0, 4).toString("hex") === "89504e47";

describe("route OG card - Hungarian route", () => {
  it("prerenders one card per notable pair (> 30), keyed on the HU slug, unique", async () => {
    const params = await huParams();
    expect(params.length).toBeGreaterThan(30);
    expect(new Set(params.map((p) => p.pair)).size).toBe(params.length);
  });

  it("renders a PNG for a real pair slug (arkos-kozpont-vasutallomas)", async () => {
    const { type, buf } = await card(huImage, "arkos-kozpont-vasutallomas");
    expect(type).toBe("image/png");
    expect(isPng(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(2000);
  });

  it("renders a PNG for the first pair param (brief's test)", async () => {
    const params = await huParams();
    const res = await (
      huImage as (a: { params: Promise<{ pair: string }> }) => Promise<Response>
    )({ params: Promise.resolve(params[0]) });
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(isPng(Buffer.from(await res.arrayBuffer()))).toBe(true);
  });
});

describe("route OG card - Romanian route", () => {
  it("enumerates the same pair count, keyed on the independent RO slug", async () => {
    const ro = await roParams();
    const hu = await huParams();
    expect(ro.length).toBe(hu.length);
    expect(new Set(ro.map((p) => p.pair)).size).toBe(ro.length);
    // RO slugs are their own strings, not the HU ones (Ruling R15).
    expect(ro.some((p) => p.pair === "centru-arcus-gara-cfr")).toBe(true);
  });

  it("renders a Romanian PNG for centru-arcus-gara-cfr (slugRo of the same pair)", async () => {
    const { type, buf } = await card(roImage, "centru-arcus-gara-cfr");
    expect(type).toBe("image/png");
    expect(isPng(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(2000);
  });
});

describe("route OG card - English", () => {
  it("renders an English route card with a plain arrow heading", async () => {
    const net = loadNetwork();
    const pair = notablePairs(net)[0];
    const img = await routeOg(pair.slug, "en");
    expect(img.status).toBe(200);
  });
});
