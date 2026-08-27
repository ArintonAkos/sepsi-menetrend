/// <reference lib="webworker" />

import { planWithWalking, prepare, type PlanContext } from "./engine/plan";
import { planMultimodal } from "./engine/multimodal";
import { routeByBike, routesByBikeFrom } from "./bicycle";
import { routeOnFoot, routesFrom } from "./walking";
import type { PlannerWorkerRequest, PlannerWorkerResponse } from "./planner-worker";

let context: PlanContext | null = null;
let initError: string | null = null;
const cancelled = new Set<number>();
const controllers = new Map<number, AbortController>();

self.addEventListener("message", async (event: MessageEvent<PlannerWorkerRequest>) => {
  const message = event.data;
  if (message.type === "init") {
    try {
      context = prepare(message.network);
      initError = null;
    } catch (error) {
      context = null;
      initError = error instanceof Error ? error.message : "planner init failed";
    }
    return;
  }
  if (message.type === "cancel") {
    cancelled.add(message.id);
    controllers.get(message.id)?.abort();
    return;
  }
  if (cancelled.has(message.id)) return;
  /* A plan with no context used to be dropped in silence, and the promise on
     the other side then never settled - the "stuck on planning" report. Answer
     it, so the UI can recover instead of waiting forever. */
  if (!context) {
    (self as DedicatedWorkerGlobalScope).postMessage({
      type: "error", id: message.id,
      message: initError ?? "planner not initialised",
    } satisfies PlannerWorkerResponse);
    return;
  }

  try {
    const controller = new AbortController();
    controllers.set(message.id, controller);
    const journeys = message.bike
      ? await planMultimodal(context, message.request, message.walking, {
          availability: message.bike,
          routes: { walk: routeOnFoot, ride: routeByBike, ridesFrom: routesByBikeFrom },
          walkFrom: routesFrom,
          signal: controller.signal,
        }, message.limit)
      : planWithWalking(context, message.request, message.walking, message.limit);
    controllers.delete(message.id);
    if (cancelled.delete(message.id)) return;
    (self as DedicatedWorkerGlobalScope).postMessage({
      type: "result", id: message.id, journeys,
    } satisfies PlannerWorkerResponse);
  } catch (error) {
    controllers.delete(message.id);
    if (cancelled.delete(message.id)) return;
    (self as DedicatedWorkerGlobalScope).postMessage({
      type: "error", id: message.id,
      message: error instanceof Error ? error.message : "planner worker failed",
    } satisfies PlannerWorkerResponse);
  }
});
