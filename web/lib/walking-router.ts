import type { LngLat } from "./engine/types";

export interface WalkingGraph {
  version: 1;
  vertices: LngLat[];
  edges: number[][];
  metres: number[][];
}

export interface FootPath {
  path: LngLat[];
  metres: number;
  minutes: number;
}

const WALKING_METRES_PER_MINUTE = 80;
const MAX_SNAP_METRES = 90;

export function metresBetween(a: LngLat, b: LngLat): number {
  const latitude = (a[1] + b[1]) / 2 * Math.PI / 180;
  return Math.hypot((a[0] - b[0]) * Math.cos(latitude) * 111_320,
                    (a[1] - b[1]) * 111_320);
}

class MinQueue {
  private values: Array<[number, number]> = [];

  push(value: [number, number]) {
    this.values.push(value);
    for (let i = this.values.length - 1; i > 0;) {
      const parent = (i - 1) >> 1;
      if (this.values[parent][0] <= value[0]) break;
      this.values[i] = this.values[parent];
      this.values[parent] = value;
      i = parent;
    }
  }

  pop(): [number, number] | undefined {
    const first = this.values[0];
    const last = this.values.pop();
    if (!first || !last || this.values.length === 0) return first;
    let i = 0;
    while (i * 2 + 1 < this.values.length) {
      let child = i * 2 + 1;
      if (child + 1 < this.values.length && this.values[child + 1][0] < this.values[child][0]) child++;
      if (this.values[child][0] >= last[0]) break;
      this.values[i] = this.values[child];
      i = child;
    }
    this.values[i] = last;
    return first;
  }
}

/** In-memory Dijkstra router over the OSM graph.  It deliberately has no DOM,
 * so it can run identically in a worker and in deterministic unit tests. */
export class WalkingRouter {
  private readonly reverseEdges: number[][];
  private readonly reverseMetres: number[][];

  constructor(private readonly graph: WalkingGraph) {
    if (graph.vertices.length !== graph.edges.length || graph.edges.length !== graph.metres.length)
      throw new Error("walking graph has mismatched vertex and edge arrays");
    this.reverseEdges = graph.vertices.map(() => []);
    this.reverseMetres = graph.vertices.map(() => []);
    for (let from = 0; from < graph.vertices.length; from++) {
      for (let edge = 0; edge < graph.edges[from].length; edge++) {
        const to = graph.edges[from][edge];
        this.reverseEdges[to].push(from);
        this.reverseMetres[to].push(graph.metres[from][edge]);
      }
    }
  }

  route(from: LngLat, to: LngLat): FootPath | null {
    const start = this.nearest(from);
    const finish = this.nearest(to);
    if (!start || !finish) return null;
    const { distance, previous } = this.dijkstra(start.vertex);
    return this.pathFromSearch(from, to, start, finish, distance, previous);
  }

  /** Every access walk uses a single Dijkstra search from the chosen origin. */
  routesFrom(from: LngLat, destinations: LngLat[]): Array<FootPath | null> {
    const start = this.nearest(from);
    if (!start) return destinations.map(() => null);
    const { distance, previous } = this.dijkstra(start.vertex);
    return destinations.map((to) => {
      const finish = this.nearest(to);
      return finish ? this.pathFromSearch(from, to, start, finish, distance, previous) : null;
    });
  }

  /** Every egress walk uses one reverse search from the chosen destination. */
  routesTo(destination: LngLat, origins: LngLat[]): Array<FootPath | null> {
    const finish = this.nearest(destination);
    if (!finish) return origins.map(() => null);
    const { distance, previous } = this.dijkstra(finish.vertex, this.reverseEdges, this.reverseMetres);
    return origins.map((from) => {
      const start = this.nearest(from);
      return start ? this.pathFromSearch(from, destination, start, finish, distance, previous, true) : null;
    });
  }

  private pathFromSearch(from: LngLat, to: LngLat,
                         start: { vertex: number; metres: number },
                         finish: { vertex: number; metres: number },
                         distance: Float64Array, previous: Int32Array,
                         reverseSearch = false): FootPath | null {
    const reached = reverseSearch ? start.vertex : finish.vertex;
    if (!Number.isFinite(distance[reached])) return null;

    const vertices: number[] = [];
    for (let node = reached; node !== -1; node = previous[node]) vertices.push(node);
    if (!reverseSearch) vertices.reverse();
    const path: LngLat[] = [from];
    for (const node of vertices) {
      const point = this.graph.vertices[node];
      if (point[0] !== path[path.length - 1][0] || point[1] !== path[path.length - 1][1]) path.push(point);
    }
    if (to[0] !== path[path.length - 1][0] || to[1] !== path[path.length - 1][1]) path.push(to);
    const metres = Math.round(start.metres + distance[reached] + finish.metres);
    return { path, metres, minutes: Math.max(1, Math.ceil(metres / WALKING_METRES_PER_MINUTE)) };
  }

  private nearest(point: LngLat): { vertex: number; metres: number } | null {
    let bestVertex = -1;
    let bestMetres = Infinity;
    for (let i = 0; i < this.graph.vertices.length; i++) {
      const distance = metresBetween(point, this.graph.vertices[i]);
      if (distance < bestMetres) { bestVertex = i; bestMetres = distance; }
    }
    return bestMetres <= MAX_SNAP_METRES ? { vertex: bestVertex, metres: bestMetres } : null;
  }

  private dijkstra(source: number, edges = this.graph.edges, lengths = this.graph.metres) {
    const distance = new Float64Array(this.graph.vertices.length);
    distance.fill(Infinity);
    const previous = new Int32Array(this.graph.vertices.length);
    previous.fill(-1);
    distance[source] = 0;
    const queue = new MinQueue();
    queue.push([0, source]);
    for (let next = queue.pop(); next; next = queue.pop()) {
      const [cost, node] = next;
      if (cost !== distance[node]) continue;
      for (let i = 0; i < edges[node].length; i++) {
        const neighbour = edges[node][i];
        const alternative = cost + lengths[node][i];
        if (alternative >= distance[neighbour]) continue;
        distance[neighbour] = alternative;
        previous[neighbour] = node;
        queue.push([alternative, neighbour]);
      }
    }
    return { distance, previous };
  }
}
