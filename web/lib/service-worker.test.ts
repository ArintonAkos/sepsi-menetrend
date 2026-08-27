import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

/** A navigation is the HTML shell.  It must revalidate on the network even
 * when a worker already controls the tab: otherwise an old shell can name
 * JavaScript files from a deploy that Netlify has since removed. */
describe("offline worker", () => {
  it("revalidates an online navigation instead of accepting the HTTP cache", async () => {
    const listeners = new Map<string, (event: any) => void>();
    const fetch = vi.fn().mockResolvedValue(new Response("fresh shell"));
    const put = vi.fn().mockResolvedValue(undefined);
    const caches = {
      open: vi.fn().mockResolvedValue({ put }),
      match: vi.fn().mockResolvedValue(undefined),
      keys: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue(true),
    };
    const self = {
      location: { origin: "https://sepsimenetrend.ro" },
      addEventListener: (name: string, listener: (event: any) => void) => listeners.set(name, listener),
      skipWaiting: vi.fn().mockResolvedValue(undefined),
      clients: { claim: vi.fn().mockResolvedValue(undefined) },
    };
    const script = readFileSync(resolve(import.meta.dirname, "../public/sw.js"), "utf8");
    runInNewContext(script, { self, caches, fetch, Response, URL, Promise });

    let response: Promise<Response> | undefined;
    const request = { method: "GET", mode: "navigate", url: "https://sepsimenetrend.ro/?from=a&to=b" };
    listeners.get("fetch")!({ request, respondWith: (next: Promise<Response>) => { response = next; } });

    await expect(response).resolves.toBeInstanceOf(Response);
    expect(fetch).toHaveBeenCalledWith(request, { cache: "no-store" });
  });
});
