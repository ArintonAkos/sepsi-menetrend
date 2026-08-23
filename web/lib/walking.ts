/** Browser interface to the bundled OSM pedestrian graph.
 *
 * The graph is loaded once inside a Web Worker, so route searches never block
 * React rendering.  This replaces the former Mapbox request: no token, no
 * per-search internet request, and no licence restriction on caching paths.
 */
import type { LngLat, Stop, WalkingContext } from "./engine/types";
import type { FootPath } from "./walking-router";

export type { FootPath } from "./walking-router";

type RequestInput =
  | { type: "route"; from: LngLat; to: LngLat }
  | { type: "from"; from: LngLat; destinations: LngLat[] }
  | { type: "to"; destination: LngLat; origins: LngLat[] };
type Request = RequestInput & { id: number };
type Response = { id: number; routes: Array<FootPath | null>; error?: string };

let worker: Worker | null = null;
let requestId = 0;
const pending = new Map<number, { resolve: (routes: Array<FootPath | null>) => void;
                                    reject: (reason: Error) => void }>();
const cache = new Map<string, FootPath | null>();
const contextCache = new Map<string, WalkingContext>();

function routingWorker() {
  if (worker) return worker;
  worker = new Worker(new URL("./walking.worker.ts", import.meta.url));
  worker.addEventListener("message", (event: MessageEvent<Response>) => {
    const request = pending.get(event.data.id);
    if (!request) return;
    pending.delete(event.data.id);
    if (event.data.error) request.reject(new Error(event.data.error));
    else request.resolve(event.data.routes);
  });
  worker.addEventListener("error", () => {
    const error = new Error("walking router worker failed");
    for (const request of pending.values()) request.reject(error);
    pending.clear();
    worker = null;
  });
  return worker;
}

function ask(request: RequestInput): Promise<Array<FootPath | null>> {
  if (typeof Worker === "undefined") return Promise.resolve([]);
  const id = ++requestId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    routingWorker().postMessage({ ...request, id } satisfies Request);
  });
}

const coordinateKey = (point: LngLat) => `${point[0].toFixed(5)},${point[1].toFixed(5)}`;
const routeKey = (from: LngLat, to: LngLat) => `${coordinateKey(from)}>${coordinateKey(to)}`;

/** A real path on the downloaded OSM graph.  A failed/aborted lookup never
 * falls back to a made-up straight-line route. */
export async function routeOnFoot(from: LngLat, to: LngLat,
                                  signal?: AbortSignal): Promise<FootPath | null> {
  const key = routeKey(from, to);
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  if (signal?.aborted) return null;
  try {
    const routes = await ask({ type: "route", from, to });
    if (signal?.aborted) return null;
    const route = routes[0] ?? null;
    cache.set(key, route);
    return route;
  } catch {
    return null;
  }
}

export async function routesFrom(point: LngLat, stops: LngLat[]) {
  try { return await ask({ type: "from", from: point, destinations: stops }); }
  catch { return stops.map(() => null); }
}

export async function routesTo(point: LngLat, stops: LngLat[]) {
  try { return await ask({ type: "to", destination: point, origins: stops }); }
  catch { return stops.map(() => null); }
}

/** Find all the pedestrian inputs for transit planning before RAPTOR runs.
 *
 * Two graph searches cover every candidate: one outward from the origin and
 * one reverse search from the destination.  The result is deliberately cached
 * by the two coordinates for this browser session; changing only departure
 * time, day, or preferences therefore performs no additional walking search.
 */
export async function walkingContext(from: LngLat, to: LngLat, stops: Stop[]): Promise<WalkingContext> {
  const key = `${coordinateKey(from)}>${coordinateKey(to)}`;
  const cached = contextCache.get(key);
  if (cached) return cached;

  const positions = stops.map((stop) => stop.at);
  const [outward, inward] = await Promise.all([
    routesFrom(from, [...positions, to]),
    routesTo(to, positions),
  ]);
  const direct = outward.pop() ?? null;
  const access = new Map<string, FootPath>();
  const egress = new Map<string, FootPath>();
  for (let i = 0; i < stops.length; i++) {
    const there = outward[i];
    const back = inward[i];
    // Fifteen minutes is the product boundary for reaching a bus, but the
    // direct walk remains available up to the engine's separate 40-minute cap.
    if (there && there.minutes <= 15) access.set(stops[i].id, there);
    if (back && back.minutes <= 15) egress.set(stops[i].id, back);
  }
  const context = { access, egress, direct };
  contextCache.set(key, context);
  return context;
}

/** A leg still holding the planner's straight-line fallback rather than OSM. */
export const isStraightLine = (path: LngLat[]) => path.length <= 2;
