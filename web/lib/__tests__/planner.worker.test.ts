import { afterEach, describe, expect, it, vi } from "vitest";
import { fixture } from "@/lib/engine/__tests__/fixture";

/** The worker module registers a `message` listener on `self` at import time
 *  and replies through `self.postMessage`. Emulate just enough of that. */
function harness() {
  let handler: ((event: { data: unknown }) => unknown) | null = null;
  const posted: Array<Record<string, unknown>> = [];
  vi.stubGlobal("self", {
    addEventListener: (type: string, listener: (event: { data: unknown }) => unknown) => {
      if (type === "message") handler = listener;
    },
    postMessage: (message: Record<string, unknown>) => { posted.push(message); },
  });
  return {
    posted,
    send: (data: unknown) => Promise.resolve(handler?.({ data })),
  };
}

describe("planner.worker", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

  it("replies with an error when asked to plan before it has a network", async () => {
    const worker = harness();
    await import("@/lib/planner.worker");

    await worker.send({ type: "plan", id: 7, request: {}, walking: {} });

    expect(worker.posted).toContainEqual(expect.objectContaining({ type: "error", id: 7 }));
  });

  it("replies with an error when the network cannot be prepared", async () => {
    const worker = harness();
    await import("@/lib/planner.worker");

    await worker.send({ type: "init", network: { stops: null } });
    await worker.send({ type: "plan", id: 3, request: {}, walking: {} });

    expect(worker.posted).toContainEqual(expect.objectContaining({ type: "error", id: 3 }));
  });

  it("plans normally once a valid network has been supplied", async () => {
    const worker = harness();
    await import("@/lib/planner.worker");

    await worker.send({ type: "init", network: fixture() });
    await worker.send({
      type: "plan", id: 1,
      request: { from: [25.76, 45.86], to: [25.80, 45.86], time: 480,
        mode: "departAt", service: "weekday", walkAversion: 0.35 },
      walking: { access: new Map(), egress: new Map(), direct: null },
    });

    expect(worker.posted).toContainEqual(expect.objectContaining({ type: "result", id: 1 }));
  });
});
