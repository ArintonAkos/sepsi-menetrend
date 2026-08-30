import { describe, it, expect } from "vitest";
import huImage, {
  generateStaticParams as huParams,
} from "@/app/vonalak/[id]/opengraph-image";
import roImage, {
  generateStaticParams as roParams,
} from "@/app/ro/linii/[id]/opengraph-image";

/** Invoke a route's default `Image({ params })` and read the bytes back. */
async function card(
  image: unknown,
  id: string,
): Promise<{ type: string | null; buf: Buffer }> {
  const res = await (
    image as (a: { params: Promise<{ id: string }> }) => Promise<Response>
  )({ params: Promise.resolve({ id }) });
  return { type: res.headers.get("content-type"), buf: Buffer.from(await res.arrayBuffer()) };
}

/** PNG magic bytes - Satori/resvg always emit a real PNG, never a data URL. */
const isPng = (buf: Buffer): boolean => buf.subarray(0, 4).toString("hex") === "89504e47";

describe("line OG card - Hungarian route", () => {
  it("renders a PNG for the first line param (brief's test)", async () => {
    const params = await huParams();
    const res = await (
      huImage as (a: { params: Promise<{ id: string }> }) => Promise<Response>
    )({ params: Promise.resolve(params[0]) });
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(isPng(Buffer.from(await res.arrayBuffer()))).toBe(true);
  });

  it("prerenders one card per line - all 12", async () => {
    expect(await huParams()).toHaveLength(12);
  });

  it("renders line 10 (Arcuș, black badge - not line 1's green)", async () => {
    const { type, buf } = await card(huImage, "10");
    expect(type).toBe("image/png");
    expect(isPng(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(2000);
  });

  it("renders the 1D D-variant card", async () => {
    const { type, buf } = await card(huImage, "1D");
    expect(type).toBe("image/png");
    expect(isPng(buf)).toBe(true);
  });
});

describe("line OG card - Romanian route", () => {
  it("enumerates the identical 12-line id set", async () => {
    const ro = (await roParams()).map((p) => p.id);
    const hu = (await huParams()).map((p) => p.id);
    expect(ro).toEqual(hu);
    expect(ro).toHaveLength(12);
  });

  it("renders a Romanian PNG for id 1", async () => {
    const { type, buf } = await card(roImage, "1");
    expect(type).toBe("image/png");
    expect(isPng(buf)).toBe(true);
  });
});
