/// <reference lib="webworker" />

import { planWithWalking, prepare, type PlanContext } from "./engine/plan";
import { planMultimodal } from "./engine/multimodal";
import { routeByBike, routesByBikeFrom } from "./bicycle";
import { routeOnFoot, routesFrom } from "./walking";
import type { PlannerWorkerRequest, PlannerWorkerResponse } from "./planner-worker";

let context: PlanContext | null = null;
const cancelled = new Set<number>();
const controllers = new Map<number, AbortController>();

self.addEventListener("message", async (event: MessageEvent<PlannerWorkerRequest>) => {
  const message = event.data;
  if (message.type === "init") {
    context = prepare(message.network);
    return;
  }
  if (message.type === "cancel") {
    cancelled.add(message.id);
    controllers.get(message.id)?.abort();
    return;
  }
  if (!context || cancelled.has(message.id)) return;

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
