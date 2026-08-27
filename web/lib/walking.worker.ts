/// <reference lib="webworker" />

import { loadWalkingGraph } from "./walking-graph";
import { WalkingRouter, type FootPath } from "./walking-router";
import type { LngLat } from "./engine/types";

type Request =
  | { id: number; type: "route"; from: LngLat; to: LngLat }
  | { id: number; type: "from"; from: LngLat; destinations: LngLat[]; maxMetres?: number }
  | { id: number; type: "to"; destination: LngLat; origins: LngLat[] };

type Response = { id: number; routes: Array<FootPath | null>; error?: string };

let router: Promise<WalkingRouter> | null = null;

function loadRouter() {
  if (!router) {
    router = loadWalkingGraph()
      .then((graph) => new WalkingRouter(graph))
      // a failed load must not stick: drop the rejected promise so the next
      // request starts a fresh attempt instead of replaying the old error
      .catch((error) => { router = null; throw error; });
  }
  return router;
}

self.addEventListener("message", async (event: MessageEvent<Request>) => {
  const request = event.data;
  try {
    const graph = await loadRouter();
    const routes = request.type === "route"
      ? [graph.route(request.from, request.to)]
      : request.type === "from"
        ? Number.isFinite(request.maxMetres)
          ? graph.routesFromWithin(request.from, request.destinations, request.maxMetres!)
          : graph.routesFrom(request.from, request.destinations)
        : graph.routesTo(request.destination, request.origins);
    (self as DedicatedWorkerGlobalScope).postMessage({ id: request.id, routes } satisfies Response);
  } catch (error) {
    (self as DedicatedWorkerGlobalScope).postMessage({
      id: request.id, routes: [], error: error instanceof Error ? error.message : "walking router failed",
    } satisfies Response);
  }
});
