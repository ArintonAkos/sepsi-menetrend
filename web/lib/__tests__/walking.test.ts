import { afterEach, describe, expect, it, vi } from "vitest";
import type { Stop } from "@/lib/engine/types";

/** A dedicated worker speaking walking.worker.ts's message protocol: it answers
 *  every batch request with one entry per destination, and reports a graph-load
 *  failure the way the real worker does - an empty result carrying an error. */
class FakeWalkingWorker {
  static behaviour: "ok" | "graph-failed" | "worker-error" = "ok";
  private listeners = new Map<string, Array<(event: unknown) => void>>();

  addEventListener(type: string, listener: (event: unknown) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  removeEventListener() {}
  terminate() {}

  private fire(type: string, event: unknown) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  postMessage(request: { id: number; destinations?: unknown[]; origins?: unknown[] }) {
    queueMicrotask(() => {
      if (FakeWalkingWorker.behaviour === "worker-error") {
        this.fire("error", { message: "Importing a module script failed.",
          filename: "https://x/_next/static/chunks/dep.js", lineno: 1 });
        return;
      }
      if (FakeWalkingWorker.behaviour === "graph-failed") {
        this.fire("message", { data: { id: request.id, routes: [],
          error: "walking graph unavailable after 3 attempts: HTTP 404" } });
        return;
      }
      const count = (request.destinations ?? request.origins ?? []).length;
      this.fire("message", { data: { id: request.id, routes: Array.from({ length: count }, () => null) } });
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

  it("names the browser error when the worker script fails to start", async () => {
    useFakeWorker();
    FakeWalkingWorker.behaviour = "worker-error";
    const { walkingContext } = await import("@/lib/walking");

    await expect(
      walkingContext([25.78, 45.86], [25.79, 45.86], [stop("A", [25.785, 45.86])]),
    ).rejects.toThrow(/Importing a module script failed/);
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

  it("builds a fresh worker after a reset", async () => {
    const built: FakeWalkingWorker[] = [];
    class Tracked extends FakeWalkingWorker { constructor() { super(); built.push(this); } }
    Object.defineProperty(globalThis, "Worker",
      { configurable: true, writable: true, value: Tracked });
    const { routesFrom, resetWalkingRouter } = await import("@/lib/walking");

    await routesFrom([25.78, 45.86], [[25.785, 45.86]]);
    resetWalkingRouter();
    await routesFrom([25.78, 45.86], [[25.785, 45.86]]);

    expect(built).toHaveLength(2);
  });
});
