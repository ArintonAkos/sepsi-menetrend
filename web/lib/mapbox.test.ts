import { describe, it, expect } from "vitest";
import { bottomInset } from "./mapbox";

describe("the space kept clear under a fitted route", () => {
  it("clears the drawer, plus a margin", () => {
    expect(bottomInset(400, 900)).toBe(424);
  });

  it("never asks for more room than the map has", () => {
    // a drawer pulled almost to the top leaves nothing to fit a route into
    expect(bottomInset(880, 900)).toBe(Math.round(900 * 0.62) + 24);
  });

  it("keeps a floor, so a route never touches the bottom edge", () => {
    expect(bottomInset(0, 900)).toBe(40);
  });

  it("is a number whatever it is handed", () => {
    /* Mapbox rejects the entire padding object if one edge is not a number,
       and it reports that as "Invalid value for edge-insets". Both arguments
       come from things that can be missing for a frame: a container that has
       not been measured, and a drawer mid-drag. Math.min turns one undefined
       into a NaN that takes the whole fit down. */
    const bad = [NaN, Infinity, -Infinity, undefined, null] as unknown as number[];
    for (const covered of bad)
      for (const height of bad)
        expect(Number.isFinite(bottomInset(covered, height)),
               `bottomInset(${String(covered)}, ${String(height)})`).toBe(true);
    expect(Number.isFinite(bottomInset(-50, -900))).toBe(true);
  });
});
