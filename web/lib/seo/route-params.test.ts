import { describe, it, expect } from "vitest";
import { generateStaticParams as huParams } from "@/app/utvonal/[pair]/page";
import { generateStaticParams as roParams } from "@/app/ro/trasee/[pair]/page";
import { generateStaticParams as enParams } from "@/app/en/routes/[pair]/page";
import { loadNetwork } from "@/lib/seo/network";
import { notablePairs, pairSlug } from "@/lib/seo/routes";

/** Both dynamic route routes prerender one page per unordered notable pair, but
 *  each language enumerates its own slug (Ruling R15): the HU route emits
 *  `p.slug`, the RO route `p.slugRo`. Same pair set, so the same count. Reverse
 *  ("unsorted") guesses are never emitted - a hand-typed reverse slug 404s,
 *  which is acceptable because nothing ever links it. */
describe("route page static params", () => {
  it("emits > 30 unique HU pair slugs", async () => {
    const slugs = (await huParams()).map((p) => p.pair);
    expect(slugs.length).toBeGreaterThan(30);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("emits the same number of unique RO pair slugs", async () => {
    const hu = (await huParams()).map((p) => p.pair);
    const ro = (await roParams()).map((p) => p.pair);
    expect(ro.length).toBeGreaterThan(30);
    expect(new Set(ro).size).toBe(ro.length);
    expect(ro.length).toBe(hu.length);
  });

  it("resolves every HU slug by p.slug and every RO slug by p.slugRo", async () => {
    const pairs = notablePairs(loadNetwork());
    for (const { pair } of await huParams()) {
      expect(pairs.find((p) => p.slug === pair)).toBeTruthy();
    }
    for (const { pair } of await roParams()) {
      expect(pairs.find((p) => p.slugRo === pair)).toBeTruthy();
    }
  });

  it("emits the HU pair slugs on the EN route, resolved by p.slug", async () => {
    const pairs = notablePairs(loadNetwork());
    const hu = (await huParams()).map((p) => p.pair);
    const en = (await enParams()).map((p) => p.pair);

    // English category path, Hungarian pair slug (R15) - identical to the HU set
    expect(en).toEqual(hu);
    for (const { pair } of await enParams()) {
      expect(pairs.find((p) => p.slug === pair)).toBeTruthy();
    }
  });

  it("builds an order-independent canonical pair slug", () => {
    const { a, b } = notablePairs(loadNetwork())[0];
    expect(pairSlug(a, b)).toBe(pairSlug(b, a));
  });
});
