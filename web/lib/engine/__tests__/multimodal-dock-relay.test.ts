import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prepare, planWithWalking } from "../plan";
import { planMultimodal } from "../multimodal";
import { WalkingRouter } from "../../walking-router";
import { BicycleRouter } from "../../bicycle-router";
import type { LngLat, Network, PlanRequest, RideLeg, WalkingContext } from "../types";
import type { WalkingGraph } from "../../walking-router";
import type { BicycleGraph } from "../../bicycle-router";

/** Regression: with SepsiBike on, the planner used bike docks as free
 *  pedestrian waypoints - origin -> walk to dock -> walk to a far stop ->
 *  board a pointless 3-minute bus - for a trip that is a 10-minute walk. The
 *  walk-only planner never did this because its access set is capped at 15
 *  minutes; the multimodal search reached the same far stops on foot via a
 *  dock. Reported for Vadász utca 11 -> Szemerja végállomás at 23:11. */

const data = <T>(name: string): T =>
  JSON.parse(readFileSync(join(process.cwd(), "public/data", name), "utf8"));
const net = data<Network>("network.json");
const graph = data<WalkingGraph>("walking-graph.json");
const bikeGraph = data<BicycleGraph>("bicycle-graph.json");
const bikes = data<{ stations: unknown[] }>("sepsibike.json").stations;

const FROM: LngLat = [25.773452, 45.864635];
const TO: LngLat = [25.779293, 45.867935];

function context(): WalkingContext {
  const router = new WalkingRouter(graph);
  const positions = net.stops.map((s) => s.at);
  const outward = router.routesFrom(FROM, [...positions, TO]);
  const inward = router.routesTo(TO, positions);
  const direct = outward.pop() ?? null;
  const access = new Map(), egress = new Map();
  for (let i = 0; i < net.stops.length; i++) {
    if (outward[i] && outward[i]!.minutes <= 15) access.set(net.stops[i].id, outward[i]);
    if (inward[i] && inward[i]!.minutes <= 15) egress.set(net.stops[i].id, inward[i]);
  }
  return { access, egress, direct } as unknown as WalkingContext;
}

const request = (): PlanRequest => ({
  from: FROM, to: TO, time: 23 * 60 + 11, service: "weekday",
  mode: "departAt", walkAversion: 0.35, lines: new Set(net.lines.map((l) => l.id)),
} as unknown as PlanRequest);

describe("multimodal dock-relay regression", () => {
  it("a late-night short walk stays a walk with SepsiBike on", async () => {
    const ctx = prepare(net);
    const walking = context();
    const accessMinutes = (stopId: string) => walking.access.get(stopId)?.minutes ?? Infinity;
    const router = new WalkingRouter(graph);
    const bike = new BicycleRouter(bikeGraph);

    const onFoot = planWithWalking(ctx, request(), walking, 8);
    expect(onFoot).toHaveLength(1);
    expect(onFoot[0].legs.every((l) => l.kind === "walk")).toBe(true);

    const deps = {
      availability: { stations: bikes, stale: false, source: "live" as const,
        fetchedAt: new Date().toISOString() },
      routes: {
        walk: (f: LngLat, t: LngLat) => Promise.resolve(router.route(f, t)),
        ride: (f: LngLat, t: LngLat) => Promise.resolve(bike.route(f, t)),
        ridesFrom: (f: LngLat, ds: LngLat[]) => Promise.resolve(bike.routesFrom(f, ds)),
      },
      walkFrom: (f: LngLat, ds: LngLat[]) => Promise.resolve(router.routesFrom(f, ds)),
    };
    const multimodal = await planMultimodal(ctx, request(), walking, deps as never, 8);

    // no journey that boards a bus at a stop the rider only reached on foot
    // outside the 15-minute access set (i.e. via a dock used as a footpath)
    for (const j of multimodal) {
      const firstRide = j.legs.find((l): l is RideLeg => l.kind === "ride");
      const bikedBefore = firstRide
        && j.legs.slice(0, j.legs.indexOf(firstRide)).some((l) => l.kind === "bike");
      if (firstRide && !bikedBefore) {
        const boardStop = net.patterns.find((p) => p.id === firstRide.patternId)!
          .stopIds[firstRide.fromIndex];
        expect(accessMinutes(boardStop)).toBeLessThanOrEqual(15);
      }
    }

    // and the whole trip still comes back as just the walk
    expect(multimodal).toHaveLength(1);
    expect(multimodal[0].legs.every((l) => l.kind === "walk")).toBe(true);
  });
});
