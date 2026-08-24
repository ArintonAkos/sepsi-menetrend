import { describe, it, expect, vi } from "vitest";
import { readLang, writeLang, LANG_KEY } from "./lang";

describe("language persistence and detection", () => {
  it("defaults to hu when nothing is stored and store is empty", () => {
    const store = { getItem: () => null };
    expect(readLang(store)).toBe("hu");
  });

  it("reads stored preference from store", () => {
    const store = { getItem: (k: string) => (k === LANG_KEY ? "ro" : null) };
    expect(readLang(store)).toBe("ro");
  });

  it("accepts English from local preference", () => {
    const store = { getItem: (k: string) => (k === LANG_KEY ? "en" : null) };
    expect(readLang(store)).toBe("en");
  });

  it("writes language choice to store", () => {
    const mockSet = vi.fn();
    const store = { setItem: mockSet };
    writeLang(store, "ro");
    expect(mockSet).toHaveBeenCalledWith(LANG_KEY, "ro");
  });

  it("handles storage exceptions gracefully", () => {
    const store = {
      getItem: () => { throw new Error("quota"); },
      setItem: () => { throw new Error("quota"); },
    };
    expect(readLang(store)).toBe("hu");
    expect(() => writeLang(store, "ro")).not.toThrow();
  });
});
