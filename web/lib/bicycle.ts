/** Browser entry point for the bundled bicycle graph. */
import type { LngLat } from "./engine/types";
import type { BicyclePath } from "./bicycle-router";

type Response = { id: number; route: BicyclePath | null; error?: string };

let worker: Worker | null = null;
let requestId = 0;
const pending = new Map<number, { resolve: (path: BicyclePath | null) => void;
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
    else request.resolve(event.data.route);
  });
  worker.addEventListener("error", () => {
    const error = new Error("bicycle router worker failed");
    for (const request of pending.values()) request.reject(error);
    pending.clear();
    worker = null;
  });
  return worker;
}

/** A real bicycle path or null; routing failure never turns into a diagonal. */
export async function routeByBike(from: LngLat, to: LngLat): Promise<BicyclePath | null> {
  const key = `${coordinateKey(from)}>${coordinateKey(to)}`;
  const known = cache.get(key);
  if (known !== undefined) return known;
  if (typeof Worker === "undefined") return null;
  const id = ++requestId;
  try {
    const path = await new Promise<BicyclePath | null>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      routingWorker().postMessage({ id, from, to });
    });
    cache.set(key, path);
    return path;
  } catch {
    return null;
  }
}
