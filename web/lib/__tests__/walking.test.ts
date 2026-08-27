import { afterEach, describe, expect, it, vi } from "vitest";
import type { Stop } from "@/lib/engine/types";

/** A dedicated worker speaking walking.worker.ts's message protocol: it answers
 *  every batch request with one entry per destination, and reports a graph-load
 *  failure the way the real worker does - an empty result carrying an error. */
class FakeWalkingWorker {
  static behaviour: "ok" | "graph-failed" = "ok";
  private listeners = new Map<string, Array<(event: { data: unknown }) => void>>();

  addEventListener(type: string, listener: (event: { data: unknown }) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  removeEventListener() {}
  terminate() {}

  postMessage(request: { id: number; destinations?: unknown[]; origins?: unknown[] }) {
    const emit = (data: unknown) => {
      for (const listener of this.listeners.get("message") ?? []) listener({ data });
    };
    queueMicrotask(() => {
      if (FakeWalkingWorker.behaviour === "graph-failed") {
        emit({ id: request.id, routes: [], error: "walking graph unavailable after 3 attempts: HTTP 404" });
        return;
      }
      const count = (request.destinations ?? request.origins ?? []).length;
      emit({ id: request.id, routes: Array.from({ length: count }, () => null) });
    });
  }
}

const stop = (id: string, at: [number, number]): Stop =>
  ({ id, at, name: { hu: id, ro: id } } as unknown as Stop);

describe("walkingContext", () => {
  const realWorker = globalThis.Worker;

  afterEach(() => {
    Object.defineProperty(globalThis, "Worker",
      { configurable: true, writable: true, value: realWorker });
    FakeWalkingWorker.behaviour = "ok";
    vi.resetModules();
  });

  const useFakeWorker = () =>
    Object.defineProperty(globalThis, "Worker",
      { configurable: true, writable: true, value: FakeWalkingWorker });

  it("rejects when the pedestrian graph cannot be loaded", async () => {
    useFakeWorker();
    FakeWalkingWorker.behaviour = "graph-failed";
    const { walkingContext } = await import("@/lib/walking");

    await expect(
      walkingContext([25.78, 45.86], [25.79, 45.86], [stop("A", [25.785, 45.86])]),
    ).rejects.toThrow(/walking graph/i);
  });

  it("resolves with an empty context when the graph loads but no stop is in range", async () => {
    useFakeWorker();
    FakeWalkingWorker.behaviour = "ok";
    const { walkingContext } = await import("@/lib/walking");

    const context = await walkingContext(
      [25.78, 45.86], [25.79, 45.86], [stop("A", [25.785, 45.86])]);

    expect(context.access.size).toBe(0);
    expect(context.egress.size).toBe(0);
  });
});
