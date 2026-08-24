/** Browser entry point for the bundled bicycle graph. */
import type { LngLat } from "./engine/types";
import type { BicyclePath } from "./bicycle-router";

type RequestInput =
  | { type: "route"; from: LngLat; to: LngLat }
  | { type: "from"; from: LngLat; destinations: LngLat[] };
type Request = RequestInput & { id: number };
type Response = { id: number; routes: Array<BicyclePath | null>; error?: string };

let worker: Worker | null = null;
let requestId = 0;
const pending = new Map<number, { resolve: (paths: Array<BicyclePath | null>) => void;
                                   reject: (error: Error) => void }>();
const cache = new Map<string, BicyclePath | null>();

const coordinateKey = (point: LngLat) => `${point[0].toFixed(5)},${point[1].toFixed(5)}`;

function routingWorker() {
  if (worker) return worker;
  worker = new Worker(new URL("./bicycle.worker.ts", import.meta.url));
  worker.addEventListener("message", (event: MessageEvent<Response>) => {
    const request = pending.get(event.data.id);
    if (!request) return;
    pending.delete(event.data.id);
    if (event.data.error) request.reject(new Error(event.data.error));
    else request.resolve(event.data.routes);
  });
  worker.addEventListener("error", () => {
    const error = new Error("bicycle router worker failed");
    for (const request of pending.values()) request.reject(error);
    pending.clear();
    worker = null;
  });
  return worker;
}

function ask(request: RequestInput): Promise<Array<BicyclePath | null>> {
  if (typeof Worker === "undefined") return Promise.resolve([]);
  const id = ++requestId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    routingWorker().postMessage({ ...request, id } satisfies Request);
  });
}

/** A real bicycle path or null; routing failure never turns into a diagonal. */
export async function routeByBike(from: LngLat, to: LngLat): Promise<BicyclePath | null> {
  const key = `${coordinateKey(from)}>${coordinateKey(to)}`;
  const known = cache.get(key);
  if (known !== undefined) return known;
  try {
    const path = (await ask({ type: "route", from, to }))[0] ?? null;
    cache.set(key, path);
    return path;
  } catch {
    return null;
  }
}

/** All candidate return docks from one pickup share one terrain-aware graph
 * search in the worker. Paths remain cached individually for later map draws. */
export async function routesByBikeFrom(from: LngLat, destinations: LngLat[]) {
  const unknown: LngLat[] = [];
  for (const to of destinations) {
    const hit = cache.get(`${coordinateKey(from)}>${coordinateKey(to)}`);
    if (hit === undefined) unknown.push(to);
  }
  if (unknown.length) {
    try {
      const routes = await ask({ type: "from", from, destinations: unknown });
      unknown.forEach((to, index) => cache.set(`${coordinateKey(from)}>${coordinateKey(to)}`, routes[index] ?? null));
    } catch {
      unknown.forEach((to) => cache.set(`${coordinateKey(from)}>${coordinateKey(to)}`, null));
    }
  }
  return destinations.map((to) => cache.get(`${coordinateKey(from)}>${coordinateKey(to)}`) ?? null);
}
