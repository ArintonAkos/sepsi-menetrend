import { WalkingRouter, type FootPath, type WalkingGraph } from "./walking-router";
import type { LngLat } from "./engine/types";

export interface BicycleGraph extends WalkingGraph {
  version: 2;
  elevationMetres: number[];
  /** Parallel to `edges`, one terrain-aware travel time per directed edge. */
  seconds: number[][];
}

export interface BicyclePath extends FootPath {
  seconds: number;
  ascentMetres: number;
  descentMetres: number;
}

/** The same exact OSM graph search as walking, at a conservative 15 km/h. */
export class BicycleRouter extends WalkingRouter {
  constructor(graph: BicycleGraph) {
    super(graph);
    if (graph.vertices.length !== graph.elevationMetres.length
        || graph.edges.length !== graph.seconds.length
        || graph.edges.some((edges, index) => edges.length !== graph.seconds[index]?.length)) {
      throw new Error("bicycle graph has mismatched terrain arrays");
    }
  }

  route(from: LngLat, to: LngLat): BicyclePath | null {
    const start = this.nearest(from);
    const finish = this.nearest(to);
    if (!start || !finish) return null;
    const { distance, previous } = this.dijkstra(start.vertex, this.graph.edges,
      (this.graph as BicycleGraph).seconds);
    const base = this.pathFromSearch(from, to, start, finish, distance, previous);
    if (!base) return null;

    const vertices: number[] = [];
    for (let node = finish.vertex; node !== -1; node = previous[node]) vertices.push(node);
    vertices.reverse();
    const elevation = (this.graph as BicycleGraph).elevationMetres;
    let ascentMetres = 0, descentMetres = 0, travelledMetres = 0;
    for (let i = 1; i < vertices.length; i++) {
      const fromVertex = vertices[i - 1], toVertex = vertices[i];
      const edge = this.graph.edges[fromVertex].indexOf(toVertex);
      if (edge < 0) throw new Error("bicycle search returned a missing edge");
      travelledMetres += this.graph.metres[fromVertex][edge];
      const delta = elevation[vertices[i]] - elevation[vertices[i - 1]];
      if (delta > 0) ascentMetres += delta;
      else descentMetres -= delta;
    }
    // Snapping the door to the closest OSM vertex is still ridden on a local
    // street. Its unknown slope uses the same flat city-bike baseline.
    const seconds = Math.round(distance[finish.vertex]
      + (start.metres + finish.metres) * 60 / 250);
    return { ...base, metres: Math.round(start.metres + travelledMetres + finish.metres),
      seconds, minutes: Math.max(1, Math.ceil(seconds / 60)),
      ascentMetres: Math.round(ascentMetres), descentMetres: Math.round(descentMetres) };
  }
}
