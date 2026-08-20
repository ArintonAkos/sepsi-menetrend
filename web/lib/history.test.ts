import { describe, it, expect } from "vitest";
import { forget, read, remember, write, KEY, LIMIT, type Recent } from "./history";

const place = (name: string, lon: number, lat = 45.86) => ({ name, at: [lon, lat] as [number, number] });

describe("remember", () => {
  it("puts the newest first", () => {
    let list: Recent[] = [];
    list = remember(list, place("Vasútállomás", 25.78), 1);
    list = remember(list, place("Sepsi Aréna", 25.80), 2);
    expect(list.map((r) => r.name)).toEqual(["Sepsi Aréna", "Vasútállomás"]);
  });

  it("moves a repeat to the front instead of duplicating it", () => {
    let list: Recent[] = [];
    list = remember(list, place("Vasútállomás", 25.78), 1);
    list = remember(list, place("Sepsi Aréna", 25.80), 2);
    list = remember(list, place("Vasútállomás", 25.78), 3);
    expect(list).toHaveLength(2);
    expect(list[0].name).toBe("Vasútállomás");
  });

  it("treats the same spot as the same place whatever it is called", () => {
    // the two languages give one stop two names; the coordinate decides
    let list = remember([], place("Gara CFR", 25.78), 1);
    list = remember(list, place("Vasútállomás", 25.78), 2);
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("Vasútállomás");
  });

  it("keeps only the most recent handful", () => {
    let list: Recent[] = [];
    for (let i = 0; i < LIMIT + 5; i++) list = remember(list, place(`P${i}`, 25.7 + i / 1000), i);
    expect(list).toHaveLength(LIMIT);
    expect(list[0].name).toBe(`P${LIMIT + 4}`);
  });
});

describe("forget", () => {
  it("removes one entry and leaves the rest", () => {
    let list = remember([], place("A", 25.78), 1);
    list = remember(list, place("B", 25.79), 2);
    expect(forget(list, place("A", 25.78)).map((r) => r.name)).toEqual(["B"]);
  });
});

describe("storage", () => {
  const fake = () => {
    let value: string | null = null;
    return { getItem: () => value, setItem: (_: string, v: string) => { value = v; } };
  };

  it("round-trips", () => {
    const store = fake();
    write(store, remember([], place("Vasútállomás", 25.78), 1));
    expect(read(store).map((r) => r.name)).toEqual(["Vasútállomás"]);
  });

  it("ignores rubbish rather than throwing", () => {
    expect(read({ getItem: () => "not json" })).toEqual([]);
    expect(read({ getItem: () => '{"nope":1}' })).toEqual([]);
    expect(read({ getItem: () => '[{"name":"x"}]' })).toEqual([]);
    // an entry with no name renders as a blank row nobody can identify
    expect(read({ getItem: () => '[{"name":"","at":[25.8,45.8],"used":1}]' })).toEqual([]);
    expect(read({ getItem: () => '[{"name":"   ","at":[25.8,45.8],"used":1}]' })).toEqual([]);
    expect(read({ getItem: () => null })).toEqual([]);
    expect(read(null)).toEqual([]);
  });

  it("survives storage that refuses to write", () => {
    // private browsing, or a full quota
    expect(() => write({ setItem: () => { throw new Error("nope"); } }, [])).not.toThrow();
    expect(() => write(null, [])).not.toThrow();
  });

  it("uses one key, so clearing it clears everything", () => {
    const store = fake();
    write(store, remember([], place("A", 25.78), 1));
    expect(KEY).toBe("sepsi.recent");
    expect(store.getItem()).toContain("A");
  });
});

describe("nameless places", () => {
  it("are not stored, because a blank row tells nobody anything", () => {
    const list = remember([], { name: "", at: [25.8, 45.86] }, 1);
    expect(list).toEqual([]);
    expect(remember([], { name: "   ", at: [25.8, 45.86] }, 1)).toEqual([]);
  });
});
