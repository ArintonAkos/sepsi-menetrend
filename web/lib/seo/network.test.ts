import { describe, it, expect } from "vitest";
import { loadNetwork } from "./network";

describe("loadNetwork", () => {
  it("returns the same parsed feed on every call so routes.ts memos hit", () => {
    expect(loadNetwork()).toBe(loadNetwork());
  });

  it("parses the published feed", () => {
    expect(loadNetwork().lines.length).toBe(12);
  });
});
