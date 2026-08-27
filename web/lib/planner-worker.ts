/** Browser-side protocol for the dedicated timetable planner.
 *
 * The static transit network is transferred once.  Each search thereafter is
 * a small, cloneable request; replacing it resolves the obsolete promise with
 * an empty list, so React can never paint an answer for old inputs. */
import type { Journey, Network, PlanRequest, WalkingContext } from "./engine/types";
import type { BikeAvailability } from "./sepsibike";

export interface TransitWorkerInput {
  network: Network;
  request: PlanRequest;
  walking: WalkingContext;
  /** Present only when the user has enabled SepsiBike alternatives. */
  bike?: BikeAvailability;
  limit?: number;
}

export type PlannerWorkerRequest =
  | { type: "init"; network: Network }
  | { type: "plan"; id: number; request: PlanRequest; walking: WalkingContext;
      bike?: BikeAvailability; limit?: number }
  | { type: "cancel"; id: number };

export type PlannerWorkerResponse =
  | { type: "result"; id: number; journeys: Journey[] }
  | { type: "error"; id: number; message: string };

interface Pending {
  resolve: (journeys: Journey[]) => void;
  reject: (error: Error) => void;
}

/** Exported so the UI keeps its deterministic in-process fallback for browsers
 * without dedicated workers (and the server-side test environment). */
export const plannerWorkerSupported = () =>
  typeof Worker !== "undefined" && typeof Worker.prototype?.terminate === "function";

export class PlannerWorkerClient {
  private worker: Worker | null = null;
  private networkVersion: string | null = null;
  private latestId = 0;
  private pending = new Map<number, Pending>();

  private ensureWorker(): Worker | null {
    if (this.worker) return this.worker;
    if (!plannerWorkerSupported()) return null;
    const worker = new Worker(new URL("./planner.worker.ts", import.meta.url));
    worker.addEventListener("message", (event: MessageEvent<PlannerWorkerResponse>) => {
      const message = event.data;
      const pending = this.pending.get(message?.id);
      if (!pending) return;
      /* A worker started from the shared bootstrap script can hear another
         worker's replies. Only "error" and "result" are ours; anything else
         belongs to a different worker that happens to share this id. */
      if (message.type === "error") {
        this.pending.delete(message.id);
        pending.reject(new Error(message.message));
      } else if (message.type === "result") {
        this.pending.delete(message.id);
        if (Array.isArray(message.journeys)) pending.resolve(message.journeys);
        else pending.reject(new Error("invalid planner worker response"));
      }
    });
    worker.addEventListener("error", () => {
      const error = new Error("planner worker failed");
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
      this.worker = null;
      this.networkVersion = null;
    });
    this.worker = worker;
    return worker;
  }

  plan(input: TransitWorkerInput): Promise<Journey[]> {
    const worker = this.ensureWorker();
    if (!worker) return Promise.resolve([]);

    if (this.latestId) {
      worker.postMessage({ type: "cancel", id: this.latestId } satisfies PlannerWorkerRequest);
      this.pending.get(this.latestId)?.resolve([]);
      this.pending.delete(this.latestId);
    }
    if (this.networkVersion !== input.network.version) {
      worker.postMessage({ type: "init", network: input.network } satisfies PlannerWorkerRequest);
      this.networkVersion = input.network.version;
    }

    const id = ++this.latestId;
    return new Promise<Journey[]>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.postMessage(({
        type: "plan", id, request: input.request, walking: input.walking,
        bike: input.bike, limit: input.limit,
      }) satisfies PlannerWorkerRequest);
    });
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null;
    this.networkVersion = null;
    for (const pending of this.pending.values()) pending.resolve([]);
    this.pending.clear();
  }
}
