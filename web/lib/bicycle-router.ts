import { WalkingRouter, type FootPath, type WalkingGraph } from "./walking-router";
import type { LngLat } from "./engine/types";

export type BicycleGraph = WalkingGraph;
export type BicyclePath = FootPath;

/** The same exact OSM graph search as walking, at a conservative 15 km/h. */
export class BicycleRouter extends WalkingRouter {
  constructor(graph: BicycleGraph) {
    super(graph, 250);
  }

  route(from: LngLat, to: LngLat): BicyclePath | null {
    return super.route(from, to);
  }
}
