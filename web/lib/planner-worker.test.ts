import { afterEach, describe, expect, it } from "vitest";
import { PlannerWorkerClient } from "./planner-worker";
import { fixture, NEAR_C, ORIGIN } from "./engine/__tests__/fixture";
import type { Journey, PlanRequest, WalkingContext } from "./engine/types";
import type { BikeAvailability } from "./sepsibike";

type Listener = (event: MessageEvent<{ type: string; id?: number; journeys?: Journey[] }>) => void;

class FakeWorker {
  static instance: FakeWorker | null = null;
  readonly posted: unknown[] = [];
  private listeners = new Map<string, Listener[]>();

  constructor() { FakeWorker.instance = this; }
  addEventListener(type: string, listener: Listener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  postMessage(message: unknown) { this.posted.push(message); }
  terminate() {}
  emit(data: { type: string; id?: number; journeys?: Journey[] }) {
    for (const listener of this.listeners.get("message") ?? []) listener({ data } as MessageEvent<typeof data>);
  }
}

const request = (time = 8 * 60): PlanRequest => ({
  from: ORIGIN, to: NEAR_C, time, mode: "departAt", service: "weekday", walkAversion: 0.35,
});
const walking: WalkingContext = {
  access: new Map([["A", { metres: 80, minutes: 1, path: [ORIGIN, [25.760, 45.86]] }]]),
  egress: new Map([["C", { metres: 80, minutes: 1, path: [[25.800, 45.86], NEAR_C] }]]),
  direct: null,
};
const bike: BikeAvailability = {
  source: "live", fetchedAt: "2026-08-26T08:00:00.000Z", stale: false,
  stations: [{ id: "01", name: "Dock", address: "Dock", lat: 45.86, lng: 25.76,
    availableBikes: 1, freeDocks: 1, totalCapacity: 2, status: "online" }],
};

describe("PlannerWorkerClient", () => {
  const originalWorker = globalThis.Worker;
  afterEach(() => {
    Object.defineProperty(globalThis, "Worker", { configurable: true, value: originalWorker });
    FakeWorker.instance = null;
  });

  it("initializes once and discards the stale answer after a newer request", async () => {
    Object.defineProperty(globalThis, "Worker", { configurable: true, value: FakeWorker });
    const client = new PlannerWorkerClient();

    const first = client.plan({ network: fixture(), request: request(), walking });
    const worker = FakeWorker.instance!;
    const second = client.plan({ network: fixture(), request: request(8 * 60 + 5), walking, bike });

    expect(worker.posted).toMatchObject([
      { type: "init", network: expect.objectContaining({ version: "test" }) },
      { type: "plan", id: 1, request: expect.objectContaining({ time: 480 }) },
      { type: "cancel", id: 1 },
      { type: "plan", id: 2, request: expect.objectContaining({ time: 485 }), bike },
    ]);

    worker.emit({ type: "result", id: 1, journeys: [{ legs: [], depart: 0, arrive: 1, walkMinutes: 0, transfers: 0 }] });
    worker.emit({ type: "result", id: 2, journeys: [{ legs: [], depart: 2, arrive: 3, walkMinutes: 0, transfers: 0 }] });

    await expect(first).resolves.toEqual([]);
    await expect(second).resolves.toEqual([{ legs: [], depart: 2, arrive: 3, walkMinutes: 0, transfers: 0 }]);
  });

  it("rejects a malformed successful worker response instead of resolving undefined", async () => {
    Object.defineProperty(globalThis, "Worker", { configurable: true, value: FakeWorker });
    const client = new PlannerWorkerClient();

    const planned = client.plan({ network: fixture(), request: request(), walking });
    FakeWorker.instance!.emit({ type: "result", id: 1 });

    await expect(planned).rejects.toThrow("invalid planner worker response");
  });

  it("ignores a foreign worker message that only shares the request id", async () => {
    Object.defineProperty(globalThis, "Worker", { configurable: true, value: FakeWorker });
    const client = new PlannerWorkerClient();

    const planned = client.plan({ network: fixture(), request: request(), walking });
    // a walking-worker reply that happens to carry the same id, then the real one
    FakeWorker.instance!.emit({ id: 1, routes: [] } as never);
    FakeWorker.instance!.emit({ type: "result", id: 1,
      journeys: [{ legs: [], depart: 5, arrive: 6, walkMinutes: 0, transfers: 0 }] });

    await expect(planned).resolves.toEqual(
      [{ legs: [], depart: 5, arrive: 6, walkMinutes: 0, transfers: 0 }]);
  });
});
