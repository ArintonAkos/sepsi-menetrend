import { afterEach, describe, expect, it, vi } from "vitest";
import { report } from "@/lib/telemetry";

describe("report", () => {
  afterEach(() => { delete (globalThis as Record<string, unknown>).gtag; });

  it("forwards a diagnostic event to gtag with its parameters", () => {
    const gtag = vi.fn();
    (globalThis as Record<string, unknown>).gtag = gtag;

    report("walking_graph_load_failed", { attempts: 3 });

    expect(gtag).toHaveBeenCalledWith("event", "walking_graph_load_failed", { attempts: 3 });
  });

  it("does nothing and does not throw when analytics has not loaded", () => {
    expect(() => report("app_reset")).not.toThrow();
  });

  it("swallows a gtag that throws", () => {
    (globalThis as Record<string, unknown>).gtag = () => { throw new Error("blocked"); };

    expect(() => report("plan_empty")).not.toThrow();
  });
});
