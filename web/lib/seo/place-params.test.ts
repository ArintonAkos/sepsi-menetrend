import { describe, it, expect } from "vitest";
import { generateStaticParams as huParams } from "@/app/megallok/[slug]/page";
import { generateStaticParams as roParams } from "@/app/ro/statii/[slug]/page";
import { generateStaticParams as enParams } from "@/app/en/stops/[slug]/page";
import { loadNetwork } from "./network";
import { buildPlaces } from "./places";

/** Both place routes prerender one page per physical place, but the segment is
 *  the HU slug on `/megallok/` and the independent RO slug on `/ro/statii/`
 *  (Ruling R15) - Romanian speakers never search the Hungarian word. */
describe("place page static params", () => {
  it("prerenders one HU param per physical place, all unique", async () => {
    const params = await huParams();
    expect(params.length).toBeGreaterThan(40);
    expect(new Set(params.map((p) => p.slug)).size).toBe(params.length);
  });

  it("prerenders one RO param per physical place, all unique", async () => {
    const params = await roParams();
    expect(params.length).toBeGreaterThan(40);
    expect(new Set(params.map((p) => p.slug)).size).toBe(params.length);
  });

  it("keys the HU route on `slug` and the RO route on `slugRo`", async () => {
    const places = buildPlaces(loadNetwork());
    const hu = new Set((await huParams()).map((p) => p.slug));
    const ro = new Set((await roParams()).map((p) => p.slug));

    for (const p of places) {
      expect(hu.has(p.slug)).toBe(true);
      expect(ro.has(p.slugRo)).toBe(true);
    }

    // the two slug fields genuinely diverge for real places
    const split = places.filter((p) => p.slug !== p.slugRo);
    expect(split.length).toBeGreaterThan(0);

    // a concrete anchor: Sepsi Aréna / Arena Sepsi
    const arena = places.find((p) => p.slug === "sepsi-arena");
    expect(arena?.slugRo).toBe("arena-sepsi");
    expect(hu.has("sepsi-arena")).toBe(true);
    expect(hu.has("arena-sepsi")).toBe(false);
    expect(ro.has("arena-sepsi")).toBe(true);
    expect(ro.has("sepsi-arena")).toBe(false);
  });

  it("keys the EN route on the HU `slug`, never `slugRo`", async () => {
    const places = buildPlaces(loadNetwork());
    const en = new Set((await enParams()).map((p) => p.slug));
    const hu = new Set((await huParams()).map((p) => p.slug));
    const ro = new Set((await roParams()).map((p) => p.slug));

    // the EN route enumerates exactly the HU slug set (English category path,
    // Hungarian proper-noun slug), never the RO-derived slug set
    expect(en).toEqual(hu);
    expect(en).not.toEqual(ro);
    for (const p of places) expect(en.has(p.slug)).toBe(true);

    // the Sepsi Aréna anchor: EN carries the Hungarian slug, not the Romanian
    expect(en.has("sepsi-arena")).toBe(true);
    expect(en.has("arena-sepsi")).toBe(false);
  });
});
