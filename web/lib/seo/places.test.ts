import { describe, it, expect } from "vitest";
import { loadNetwork } from "./network";
import { buildPlaces, placeOf, NOTABLE_PLACE_SLUGS } from "./places";

const net = loadNetwork();
const places = buildPlaces(net);

describe("buildPlaces", () => {
  it("merges opposite-kerb stops that share a name and sit close together", () => {
    // P1 and P3 are both "Csíki utca 2" / "Str. Ciucului 2", ~20 m apart
    const p1 = placeOf(places, "P1");
    const p3 = placeOf(places, "P3");
    expect(p1).toBeDefined();
    expect(p1).toBe(p3);
    expect(p1!.stopIds).toEqual(expect.arrayContaining(["P1", "P3"]));
  });
  it("keeps distinct places distinct and gives every place a unique slug", () => {
    const slugs = places.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(places.length).toBeGreaterThan(40);
    expect(places.length).toBeLessThan(net.stops.length);
  });

  it("carries an independent, unique Romanian slug for every place", () => {
    const slugsRo = places.map((p) => p.slugRo);
    expect(slugsRo.every((s) => s.length > 0)).toBe(true);
    expect(new Set(slugsRo).size).toBe(slugsRo.length);
    // one RO slug per HU slug - same clustering, only the name string differs
    expect(slugsRo.length).toBe(places.length);
    // the RO slug is derived from name.ro exactly as slug is from name.hu
    const arena = places.find((p) => p.slug === "sepsi-arena")!;
    expect(arena.name.ro).toBe("Arena Sepsi");
    expect(arena.slugRo).toBe("arena-sepsi");
    const station = places.find((p) => p.slug === "vasutallomas")!;
    expect(station.slugRo).toBe("gara-cfr");
  });
  it("carries both language names", () => {
    const arena = places.find((p) => p.name.hu.includes("Aréna"));
    expect(arena?.name.ro).toMatch(/Arena/);
  });
  it("every notable slug points at a real place", () => {
    const known = new Set(places.map((p) => p.slug));
    for (const slug of NOTABLE_PLACE_SLUGS) expect(known).toContain(slug);
  });
});
