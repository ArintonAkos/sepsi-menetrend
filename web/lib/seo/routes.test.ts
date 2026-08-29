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

  it("hands out an equal but independent list every call", () => {
    const first = notablePairs(net);
    const second = notablePairs(net);
    expect(second).toEqual(first);
    // a fresh array - a consumer sorting or splicing it cannot corrupt the memo
    expect(second).not.toBe(first);
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

  it("pins the representative journey for Árkos központ → Autoliv end to end", () => {
    // Exact feed-derived values, like lines.test.ts - locks the walking-context
    // build, the ride-leg mapping and the boardFor wiring in one shot. `pair.a`
    // is the name-slug-first place, i.e. Árkos központ.
    const pair = routeBySlug(net, "arkos-kozpont-autoliv");
    expect(pair).toBeDefined();
    expect(pair!.a.name.hu).toBe("Árkos központ");

    const summary = journeyBetween(net, pair!.a, pair!.b, "hu");
    expect(summary).toEqual({
      legs: [
        { lineLabel: "10-es busz", fromName: "Árkos központ", toName: "Csíki utca 2", rideMin: 7, stops: 6 },
        { lineLabel: "2D-s busz", fromName: "Csíki utca 2", toName: "Autoliv", rideMin: 11, stops: 5 },
      ],
      walkMin: 2,
      totalMin: 32,
      transfers: 1,
      firstDep: 330,
      lastDep: 1290,
    });
  });
});
