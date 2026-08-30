import { describe, it, expect } from "vitest";
import { pickName, SEO_LANGS } from "./lang";

describe("pickName", () => {
  const n = { hu: "Vasútállomás", ro: "Gara" };
  it("returns the language's own name for hu and ro", () => {
    expect(pickName(n, "hu")).toBe("Vasútállomás");
    expect(pickName(n, "ro")).toBe("Gara");
  });
  it("falls back to the Hungarian name for en", () => {
    expect(pickName(n, "en")).toBe("Vasútállomás");
  });
});

describe("SEO_LANGS", () => {
  it("is hu, ro, en in that order", () => {
    expect([...SEO_LANGS]).toEqual(["hu", "ro", "en"]);
  });
});
