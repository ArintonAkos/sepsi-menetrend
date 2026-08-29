import { describe, it, expect } from "vitest";
import { loadNetwork } from "./network";
import { buildPlaces, NOTABLE_PLACE_SLUGS } from "./places";
import { notablePairs, routeBySlug, journeyBetween, pairSlug } from "./routes";

const net = loadNetwork();

describe("notablePairs", () => {
  it("produces canonical, order-independent slugs and no duplicates", () => {
    const pairs = notablePairs(net);
    const slugs = pairs.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);

    // canonical & order-independent
    const notable = buildPlaces(net).filter((p) => NOTABLE_PLACE_SLUGS.includes(p.slug));
    const [x, y] = notable;
    // pair slug is the same whichever way round the two places are given
    expect(pairSlug(x, y)).toBe(pairSlug(y, x));
    // and every published pair is the same object found from either end
    const p = pairs[0];
    expect(pairSlug(p.a, p.b)).toBe(pairSlug(p.b, p.a));
    expect(routeBySlug(net, pairSlug(p.b, p.a))).toBe(p);

    expect(pairs.length).toBeGreaterThan(30);
  });

  it("routeBySlug is an equality lookup, not a parse", () => {
    expect(routeBySlug(net, "no-such-route-pair")).toBeUndefined();
  });
});

describe("journeyBetween", () => {
  it("computes a real journey with at least one bus leg for a known pair", () => {
    const pairs = notablePairs(net);
    const withBus = pairs
      .map((p) => journeyBetween(net, p.a, p.b, "hu"))
      .filter((j) => j && j.legs.some((l) => l.lineLabel));
    expect(withBus.length).toBeGreaterThan(0);
    expect(withBus[0]!.totalMin).toBeGreaterThan(0);
  });
});
