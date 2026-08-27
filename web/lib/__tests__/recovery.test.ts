import { afterEach, describe, expect, it, vi } from "vitest";
import { resetApp } from "@/lib/recovery";

describe("resetApp", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("deletes every cache, unregisters every worker, then reloads", async () => {
    const deleted: string[] = [];
    const unregister = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("caches", {
      keys: async () => ["sepsi-1", "sepsi-2"],
      delete: async (name: string) => { deleted.push(name); return true; },
    });
    vi.stubGlobal("navigator", {
      serviceWorker: {
        getRegistrations: async () => [{ unregister }, { unregister }],
      },
    });
    const reload = vi.fn();

    await resetApp(reload);

    expect(deleted.sort()).toEqual(["sepsi-1", "sepsi-2"]);
    expect(unregister).toHaveBeenCalledTimes(2);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("reloads even when the cache and service worker APIs are absent", async () => {
    vi.stubGlobal("caches", undefined);
    vi.stubGlobal("navigator", undefined);
    const reload = vi.fn();

    await resetApp(reload);

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("reloads even when clearing storage throws", async () => {
    vi.stubGlobal("caches", { keys: async () => { throw new Error("blocked"); } });
    const reload = vi.fn();

    await resetApp(reload);

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("reports the reset for diagnostics", async () => {
    const gtag = vi.fn();
    vi.stubGlobal("gtag", gtag);

    await resetApp(vi.fn());

    expect(gtag).toHaveBeenCalledWith("event", "app_reset", undefined);
  });
});
