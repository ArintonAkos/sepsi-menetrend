/// <reference lib="webworker" />

import { BicycleRouter, type BicycleGraph, type BicyclePath } from "./bicycle-router";
import type { LngLat } from "./engine/types";

type Request = { id: number; from: LngLat; to: LngLat };
type Response = { id: number; route: BicyclePath | null; error?: string };

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
  const { id, from, to } = event.data;
  try {
    const route = (await loadRouter()).route(from, to);
    (self as DedicatedWorkerGlobalScope).postMessage({ id, route } satisfies Response);
  } catch (error) {
    (self as DedicatedWorkerGlobalScope).postMessage({
      id, route: null, error: error instanceof Error ? error.message : "bicycle router failed",
    } satisfies Response);
  }
});
