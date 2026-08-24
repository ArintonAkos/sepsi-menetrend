import { describe, expect, it } from "vitest";
import { BicycleRouter } from "./bicycle-router";
import { routeByBike } from "./bicycle";

const graph = {
  version: 2 as const,
  vertices: [[25.76, 45.86], [25.761, 45.86], [25.761, 45.861], [25.76, 45.861]] as [number, number][],
  edges: [[1], [2], [3], []],
  metres: [[80], [110], [80], []],
  elevationMetres: [100, 100, 110, 110],
  seconds: [[20], [40], [20], []],
};

describe("BicycleRouter", () => {
  it("follows the connected road route rather than a diagonal", () => {
    const route = new BicycleRouter(graph).route([25.76, 45.86], [25.76, 45.861]);

    expect(route).toMatchObject({ metres: 270, minutes: 2, seconds: 80,
      ascentMetres: 10, descentMetres: 0 });
    expect(route?.path).toEqual([
      [25.76, 45.86], [25.761, 45.86], [25.761, 45.861], [25.76, 45.861],
    ]);
  });

  it("does not invent a reverse path on a one-way bicycle road", () => {
    expect(new BicycleRouter(graph).route([25.76, 45.861], [25.76, 45.86])).toBeNull();
  });

  it("chooses a longer flat route over a shorter steep hill", () => {
    const terrain = {
      version: 2 as const,
      vertices: [[25.76, 45.86], [25.7605, 45.86], [25.76, 45.8606], [25.761, 45.8606]] as [number, number][],
      edges: [[1, 2], [3], [3], []],
      metres: [[70, 100], [70], [100], []],
      elevationMetres: [100, 125, 100, 100],
      seconds: [[80, 24], [80], [24], []],
    };

    const route = new BicycleRouter(terrain).route([25.76, 45.86], [25.761, 45.8606]);

    expect(route?.path).toEqual([terrain.vertices[0], terrain.vertices[2], terrain.vertices[3]]);
    expect(route?.ascentMetres).toBe(0);
  });

  it("fails closed when the browser has no worker support", async () => {
    const original = globalThis.Worker;
    Object.defineProperty(globalThis, "Worker", { configurable: true, value: undefined });
    await expect(routeByBike([25.76, 45.86], [25.76, 45.861])).resolves.toBeNull();
    Object.defineProperty(globalThis, "Worker", { configurable: true, value: original });
  });
});
