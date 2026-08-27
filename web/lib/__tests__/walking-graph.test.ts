import { describe, expect, it, vi } from "vitest";
import { loadWalkingGraph } from "@/lib/walking-graph";
import type { WalkingGraph } from "@/lib/walking-router";

const graph: WalkingGraph = {
  version: 1,
  vertices: [[25.76, 45.86], [25.761, 45.86]],
  edges: [[1], [0]],
  metres: [[80], [80]],
};

const ok = () =>
  new Response(JSON.stringify(graph), { status: 200, headers: { "content-type": "application/json" } });

describe("loadWalkingGraph", () => {
  it("returns the graph from the first successful fetch", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(ok());

    await expect(loadWalkingGraph(fetchFn, { delayMs: 0 })).resolves.toEqual(graph);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0][0]).toBe("/data/walking-graph.json");
  });

  it("retries with a cache-busting request after a network failure", async () => {
    const fetchFn = vi.fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(ok());

    await expect(loadWalkingGraph(fetchFn, { delayMs: 0 })).resolves.toEqual(graph);

    expect(fetchFn).toHaveBeenCalledTimes(2);
    const [retryUrl, retryInit] = fetchFn.mock.calls[1];
    expect(retryUrl).toMatch(/^\/data\/walking-graph\.json\?/);
    expect(retryInit).toMatchObject({ cache: "reload" });
  });

  it("retries a non-ok response instead of accepting an error page", async () => {
    const fetchFn = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("<html>404</html>", { status: 404 }))
      .mockResolvedValueOnce(ok());

    await expect(loadWalkingGraph(fetchFn, { delayMs: 0 })).resolves.toEqual(graph);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("retries a truncated or non-graph body (a poisoned cache entry)", async () => {
    const fetchFn = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('{"vertices": "not an array"}', { status: 200 }))
      .mockResolvedValueOnce(ok());

    await expect(loadWalkingGraph(fetchFn, { delayMs: 0 })).resolves.toEqual(graph);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("throws after every attempt fails", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(loadWalkingGraph(fetchFn, { delayMs: 0, attempts: 3 }))
      .rejects.toThrow(/walking graph/i);
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });
});
