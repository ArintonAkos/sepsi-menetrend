import { describe, expect, it } from "vitest";
import { WalkingRouter, type WalkingGraph } from "@/lib/walking-router";
import realGraph from "@/public/data/walking-graph.json";

const graph: WalkingGraph = {
  version: 1,
  vertices: [[25.76, 45.86], [25.761, 45.86], [25.761, 45.861], [25.76, 45.861]],
  edges: [[1], [0, 2], [1, 3], [2]],
  metres: [[80], [80, 110], [110, 80], [80]],
};

describe("WalkingRouter", () => {
  it("uses the graph detour instead of the straight-line shortcut", () => {
    const router = new WalkingRouter(graph);

    const route = router.route([25.76, 45.86], [25.76, 45.861]);

    expect(route?.metres).toBe(270);
    expect(route?.path).toEqual([
      [25.76, 45.86], [25.761, 45.86], [25.761, 45.861], [25.76, 45.861],
    ]);
  });

  it("returns no route when either endpoint cannot reach the mapped network", () => {
    const router = new WalkingRouter(graph);

    expect(router.route([25.70, 45.80], [25.76, 45.861])).toBeNull();
  });

  it("calculates all stop access walks from one graph search", () => {
    const router = new WalkingRouter(graph);

    const routes = router.routesFrom([25.76, 45.86], [[25.761, 45.861], [25.76, 45.861]]);

    expect(routes.map((route) => route?.metres)).toEqual([190, 270]);
  });

  it("only explores the exact walking-transfer radius when requested", () => {
    const router = new WalkingRouter(graph) as WalkingRouter & {
      routesFromWithin(from: [number, number], destinations: [number, number][], maxMetres: number): Array<unknown>;
    };

    const routes = router.routesFromWithin([25.76, 45.86], [
      [25.76, 45.861],
      [25.761, 45.86],
    ], 200) as Array<{ metres: number } | null>;

    expect(routes).toEqual([null, expect.objectContaining({ metres: 80 })]);
  });

  it("reconstructs egress walks from the stop, not as a diagonal to the destination", () => {
    const router = new WalkingRouter(graph);

    const [route] = router.routesTo([25.76, 45.861], [[25.76, 45.86]]);

    expect(route?.metres).toBe(270);
    expect(route?.path).toEqual([
      [25.76, 45.86], [25.761, 45.86], [25.761, 45.861], [25.76, 45.861],
    ]);
  });

  it("has a real pedestrian route from the centre to Sepsi Arena", () => {
    const router = new WalkingRouter(realGraph as WalkingGraph);
    const from: [number, number] = [25.7866, 45.8636]; // Casa cu Arcade / Lábasház
    const to: [number, number] = [25.8071, 45.8822];   // Arena Sepsi

    const route = router.route(from, to);

    expect(route).not.toBeNull();
    expect(route!.metres).toBeGreaterThan(2_500);
    expect(route!.path.length).toBeGreaterThan(20);
  });

  it("does not turn the N. Iorga to Sepsi Arena egress into a 29 metre diagonal", () => {
    const router = new WalkingRouter(realGraph as WalkingGraph);

    const [route] = router.routesTo(
      [25.8071, 45.8822],
      [[25.7948, 45.8580]], // N. Iorga sugárút 1
    );

    expect(route).not.toBeNull();
    expect(route!.metres).toBeGreaterThan(2_500);
    expect(route!.path.length).toBeGreaterThan(20);
  });
});
