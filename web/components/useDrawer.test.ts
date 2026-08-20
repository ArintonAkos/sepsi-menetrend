import { describe, it, expect, beforeAll } from "vitest";
import { SNAPS } from "./useDrawer";

beforeAll(() => Object.defineProperty(window, "innerHeight", { value: 800, configurable: true }));

/** The snapping rule on its own, without a component around it. */
const nearest = (height: number) => {
  let index = 0, best = Infinity;
  SNAPS.forEach((fraction, i) => {
    const gap = Math.abs(fraction * 800 - height);
    if (gap < best) { best = gap; index = i; }
  });
  return index;
};

describe("the drawer's resting heights", () => {
  it("leaves the map visible at every one of them", () => {
    for (const fraction of SNAPS) expect(fraction).toBeLessThan(1);
    expect(SNAPS[0]).toBeLessThan(0.5);          // the peek keeps the map dominant
  });

  it("is ordered and distinct, so dragging always changes something", () => {
    for (let i = 1; i < SNAPS.length; i++) {
      expect(SNAPS[i]).toBeGreaterThan(SNAPS[i - 1]);
      expect(SNAPS[i] - SNAPS[i - 1]).toBeGreaterThan(0.1);
    }
  });

  it("settles on whichever height the drag ended nearest", () => {
    expect(nearest(0)).toBe(0);                  // dragged all the way down
    expect(nearest(SNAPS[0] * 800)).toBe(0);
    expect(nearest(SNAPS[1] * 800 - 10)).toBe(1);
    expect(nearest(SNAPS[2] * 800 + 200)).toBe(2);   // past the top, still the top
  });

  it("puts the midpoint between two heights on the nearer one", () => {
    const between = ((SNAPS[0] + SNAPS[1]) / 2) * 800;
    expect(nearest(between - 20)).toBe(0);
    expect(nearest(between + 20)).toBe(1);
  });
});
