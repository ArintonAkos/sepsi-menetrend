import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

type Listener = (event: unknown) => void;

/** Load public/sw.js into a throwaway context with a scriptable environment,
 *  and hand back the hooks a test needs to drive one fetch event. */
function bootServiceWorker(options: {
  cached?: (url: string) => Response | undefined;
  fetch: (request: { url: string }) => Promise<Response>;
}) {
  const listeners = new Map<string, Listener>();
  const put = vi.fn<(request: unknown, response: Response) => Promise<void>>()
    .mockResolvedValue(undefined);
  const store = {
    match: vi.fn(async (request: { url: string }) => options.cached?.(request.url)),
    put,
  };
  const caches = {
    open: vi.fn().mockResolvedValue(store),
    match: vi.fn(async (request: { url: string } | string) =>
      options.cached?.(typeof request === "string" ? request : request.url)),
    keys: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(true),
  };
  const fetch = vi.fn(options.fetch);
  const self = {
    location: { origin: "https://sepsimenetrend.ro" },
    addEventListener: (name: string, listener: Listener) => listeners.set(name, listener),
    skipWaiting: vi.fn().mockResolvedValue(undefined),
    clients: { claim: vi.fn().mockResolvedValue(undefined) },
  };
  const script = readFileSync(resolve(import.meta.dirname, "../public/sw.js"), "utf8");
  runInNewContext(script, { self, caches, fetch, Response, URL, Promise });

  const waitUntil: Promise<unknown>[] = [];
  const dispatch = (request: { method: string; mode: string; url: string }) => {
    let response: Promise<Response> | undefined;
    listeners.get("fetch")!({
      request,
      respondWith: (next: Promise<Response>) => { response = next; },
      waitUntil: (promise: Promise<unknown>) => { waitUntil.push(promise); },
    });
    return response;
  };
  return { dispatch, fetch, put, caches, waitUntil };
}

const dataRequest = { method: "GET", mode: "cors",
  url: "https://sepsimenetrend.ro/data/walking-graph.json" };

describe("offline worker", () => {
  it("revalidates an online navigation instead of accepting the HTTP cache", async () => {
    const { dispatch, fetch } = bootServiceWorker({
      fetch: async () => new Response("fresh shell"),
    });

    const response = dispatch({ method: "GET", mode: "navigate",
      url: "https://sepsimenetrend.ro/?from=a&to=b" });

    await expect(response).resolves.toBeInstanceOf(Response);
    expect(fetch).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://sepsimenetrend.ro/?from=a&to=b" }),
      { cache: "no-store" });
  });

  it("serves a cached data file at once and refreshes it in the background", async () => {
    const { dispatch, fetch, put, waitUntil } = bootServiceWorker({
      cached: () => new Response("stale graph", { status: 200 }),
      fetch: async () => new Response("fresh graph", { status: 200 }),
    });

    const response = dispatch(dataRequest);

    expect(await (await response)!.text()).toBe("stale graph");
    await Promise.all(waitUntil);
    expect(fetch).toHaveBeenCalledWith(expect.objectContaining({ url: dataRequest.url }));
    expect(put).toHaveBeenCalledWith(expect.objectContaining({ url: dataRequest.url }),
      expect.any(Response));
  });

  it("fetches and caches a data file that has never been cached", async () => {
    const { dispatch, put } = bootServiceWorker({
      cached: () => undefined,
      fetch: async () => new Response("fresh graph", { status: 200 }),
    });

    const response = dispatch(dataRequest);

    expect(await (await response)!.text()).toBe("fresh graph");
    expect(put).toHaveBeenCalledWith(expect.objectContaining({ url: dataRequest.url }),
      expect.any(Response));
  });

  it("keeps serving the cached data file when the background refresh fails", async () => {
    const { dispatch, put, waitUntil } = bootServiceWorker({
      cached: () => new Response("stale graph", { status: 200 }),
      fetch: async () => { throw new TypeError("offline"); },
    });

    const response = dispatch(dataRequest);

    expect(await (await response)!.text()).toBe("stale graph");
    await Promise.allSettled(waitUntil);
    expect(put).not.toHaveBeenCalled();
  });

  it("does not overwrite a good data cache entry with an error response", async () => {
    const { dispatch, put, waitUntil } = bootServiceWorker({
      cached: () => new Response("stale graph", { status: 200 }),
      fetch: async () => new Response("<html>500</html>", { status: 500 }),
    });

    dispatch(dataRequest);
    await Promise.allSettled(waitUntil);

    expect(put).not.toHaveBeenCalled();
  });

  it("still returns the shell when writing it to the cache fails", async () => {
    const boot = bootServiceWorker({ fetch: async () => new Response("fresh shell") });
    boot.put.mockRejectedValue(new Error("quota"));

    const response = boot.dispatch({ method: "GET", mode: "navigate",
      url: "https://sepsimenetrend.ro/?from=a&to=b" });

    expect(await (await response)!.text()).toBe("fresh shell");
    await Promise.allSettled(boot.waitUntil);
  });

  it("never writes the / shell when navigating to a content page", async () => {
    /* The ~370 bilingual SEO pages are ordinary navigations too. Only "/" may
       own the shell cache; a content page written to "/" would clobber the
       planner shell for every rider on their next launch. */
    const { dispatch, put, waitUntil } = bootServiceWorker({
      fetch: async () => new Response("line 1 timetable"),
    });

    const response = dispatch({ method: "GET", mode: "navigate",
      url: "https://sepsimenetrend.ro/vonalak/1/" });

    expect(await (await response)!.text()).toBe("line 1 timetable");
    await Promise.allSettled(waitUntil);
    expect(put).not.toHaveBeenCalled();
  });

  it("shows the offline card, not the planner shell, for a content page offline", async () => {
    const offlineCard = new Response("offline card");
    const { dispatch, caches } = bootServiceWorker({
      cached: (url) => (url === "/offline.html" ? offlineCard : undefined),
      fetch: async () => { throw new TypeError("offline"); },
    });

    const response = dispatch({ method: "GET", mode: "navigate",
      url: "https://sepsimenetrend.ro/vonalak/1/" });

    expect(await response).toBe(offlineCard);
    expect(caches.match).toHaveBeenCalledWith("/offline.html");
    expect(caches.match).not.toHaveBeenCalledWith("/");
  });

  it("still serves the cached / shell for a root navigation offline", async () => {
    const shell = new Response("cached shell");
    const { dispatch } = bootServiceWorker({
      cached: (url) => (url === "/" ? shell : undefined),
      fetch: async () => { throw new TypeError("offline"); },
    });

    const response = dispatch({ method: "GET", mode: "navigate",
      url: "https://sepsimenetrend.ro/" });

    expect(await response).toBe(shell);
  });

  it("treats a shared /?from=...&to=... planner link as the shell offline", async () => {
    /* url.pathname of a shared deep link is still "/", so it keeps the shell
       treatment - only real content paths take the new branch. */
    const shell = new Response("cached shell");
    const { dispatch } = bootServiceWorker({
      cached: (url) => (url === "/" ? shell : undefined),
      fetch: async () => { throw new TypeError("offline"); },
    });

    const response = dispatch({ method: "GET", mode: "navigate",
      url: "https://sepsimenetrend.ro/?from=a&to=b" });

    expect(await response).toBe(shell);
  });

  it("does not write the / shell when navigating to the terms page", async () => {
    const { dispatch, put, waitUntil } = bootServiceWorker({
      fetch: async () => new Response("terms page"),
    });

    const response = dispatch({ method: "GET", mode: "navigate",
      url: "https://sepsimenetrend.ro/felhasznalasi-feltetelek/" });

    expect(await (await response)!.text()).toBe("terms page");
    await Promise.allSettled(waitUntil);
    expect(put).not.toHaveBeenCalled();
  });

  it("always fetches the worker bootstrap fresh and never caches it", async () => {
    /* Every worker is started from this one script with only the URL fragment
       different; the Cache API matches ignoring the fragment, so a cached copy
       would be handed to the wrong worker. */
    const { dispatch, fetch, put, caches } = bootServiceWorker({
      cached: () => new Response("someone else's bootstrap", { status: 200 }),
      fetch: async () => new Response("fresh bootstrap", { status: 200 }),
    });

    const response = dispatch({ method: "GET", mode: "cors",
      url: "https://sepsimenetrend.ro/_next/static/chunks/turbopack-worker-abc123.js#params=%5B%5D" });

    expect(await (await response)!.text()).toBe("fresh bootstrap");
    expect(fetch).toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
    expect(caches.match).not.toHaveBeenCalled();
  });
});
