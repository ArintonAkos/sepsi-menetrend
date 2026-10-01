import { describe, it, expect } from "vitest";
import { formatRevised, revisedOn } from "./freshness";
import { allPages } from "./urls";

describe("freshness", () => {
  it("formats the revision day per language", () => {
    expect(formatRevised("2026-10-01", "hu")).toBe("2026. október 1.");
    expect(formatRevised("2026-10-01", "ro")).toBe("1 octombrie 2026");
    expect(formatRevised("2026-10-01", "en")).toBe("1 October 2026");
  });

  it("is what the sitemap reports as lastmod", () => {
    const day = revisedOn();
    expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Set(allPages().map((p) => p.lastModified))).toEqual(new Set([day]));
  });
});
