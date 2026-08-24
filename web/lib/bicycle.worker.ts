/// <reference lib="webworker" />

import { BicycleRouter, type BicycleGraph, type BicyclePath } from "./bicycle-router";
import type { LngLat } from "./engine/types";

type Request =
  | { id: number; type: "route"; from: LngLat; to: LngLat }
  | { id: number; type: "from"; from: LngLat; destinations: LngLat[] };
type Response = { id: number; routes: Array<BicyclePath | null>; error?: string };

let router: Promise<BicycleRouter> | null = null;

function loadRouter() {
  router ??= fetch("/data/bicycle-graph.json")
    .then((response) => {
      if (!response.ok) throw new Error(`bicycle graph: HTTP ${response.status}`);
      return response.json() as Promise<BicycleGraph>;
    })
    .then((graph) => new BicycleRouter(graph));
  return router;
}

self.addEventListener("message", async (event: MessageEvent<Request>) => {
  const request = event.data;
  try {
    const graph = await loadRouter();
    const routes = request.type === "route"
      ? [graph.route(request.from, request.to)]
      : graph.routesFrom(request.from, request.destinations);
    (self as DedicatedWorkerGlobalScope).postMessage({ id: request.id, routes } satisfies Response);
  } catch (error) {
    (self as DedicatedWorkerGlobalScope).postMessage({
      id: request.id, routes: [], error: error instanceof Error ? error.message : "bicycle router failed",
    } satisfies Response);
  }
});
