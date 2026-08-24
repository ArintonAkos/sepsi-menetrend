import { describe, expect, it } from "vitest";
import { BicycleRouter } from "./bicycle-router";
import { routeByBike } from "./bicycle";

const graph = {
  version: 1 as const,
  vertices: [[25.76, 45.86], [25.761, 45.86], [25.761, 45.861], [25.76, 45.861]] as [number, number][],
  edges: [[1], [2], [3], []],
  metres: [[80], [110], [80], []],
};

describe("BicycleRouter", () => {
  it("follows the connected road route rather than a diagonal", () => {
    const route = new BicycleRouter(graph).route([25.76, 45.86], [25.76, 45.861]);

    expect(route).toMatchObject({ metres: 270, minutes: 2 });
    expect(route?.path).toEqual([
      [25.76, 45.86], [25.761, 45.86], [25.761, 45.861], [25.76, 45.861],
    ]);
  });

  it("does not invent a reverse path on a one-way bicycle road", () => {
    expect(new BicycleRouter(graph).route([25.76, 45.861], [25.76, 45.86])).toBeNull();
  });

  it("fails closed when the browser has no worker support", async () => {
    const original = globalThis.Worker;
    Object.defineProperty(globalThis, "Worker", { configurable: true, value: undefined });
    await expect(routeByBike([25.76, 45.86], [25.76, 45.861])).resolves.toBeNull();
    Object.defineProperty(globalThis, "Worker", { configurable: true, value: original });
  });
});
