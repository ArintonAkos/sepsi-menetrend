import { describe, it, expect } from "vitest";
import { read, write, KEY } from "./consent";

class FakeStorage implements Pick<Storage, "getItem" | "setItem"> {
  private data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
}

describe("consent storage", () => {
  it("reads null when nothing has been stored yet", () => {
    expect(read(new FakeStorage())).toBeNull();
  });

  it("reads null when storage is unavailable", () => {
    expect(read(null)).toBeNull();
  });

  it("round-trips a granted choice", () => {
    const store = new FakeStorage();
    write(store, "granted");
    expect(read(store)).toBe("granted");
  });

  it("round-trips a denied choice", () => {
    const store = new FakeStorage();
    write(store, "denied");
    expect(read(store)).toBe("denied");
  });

  it("ignores a value written by something else", () => {
    const store = new FakeStorage();
    store.setItem(KEY, "yes-please");
    expect(read(store)).toBeNull();
  });

  it("does not throw when storage rejects the write", () => {
    const store = {
      setItem: () => { throw new Error("quota exceeded"); },
    };
    expect(() => write(store, "granted")).not.toThrow();
  });
});
