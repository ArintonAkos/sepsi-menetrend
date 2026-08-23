/** The search index as it actually ships. These are the queries riders got
 *  wrong answers to on other tools, so they are the ones worth locking in. */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildIndex, search, type IndexedPlace, type Place } from "../search";

let index: IndexedPlace[];

beforeAll(() => {
  const raw = JSON.parse(readFileSync(
    resolve(import.meta.dirname, "../../../public/data/places.json"), "utf8"));
  index = buildIndex(raw.places as Place[]);
});

const names = (q: string, n = 3) => search(index, q, n).map((p) => p.hu);
const top = (q: string) => names(q, 1)[0] ?? null;

describe("the shipped place index", () => {
  it("is big enough to be worth shipping and small enough to ship", () => {
    expect(index.length).toBeGreaterThan(700);
    const bytes = readFileSync(
      resolve(import.meta.dirname, "../../../public/data/places.json")).byteLength;
    expect(bytes).toBeLessThan(120_000);
  });

  it("finds the mall people could not find before", () => {
    // OSM spells it "Centre"; riders type "Center". Both spellings must land on
    // the mall - and the bus stop 104 m away is the more useful answer here,
    // so it is allowed to rank first.
    for (const query of ["sepsi value center", "value center", "Sepsi Value Centre"]) {
      const hits = names(query, 4).join(" | ");
      expect(hits).toMatch(/Value Centre|Bevásárlóközpont/);
    }
  });

  it("puts the stop at the mall ahead of the mall building", () => {
    // someone planning a journey wants the stop, not the shopfront
    expect(top("sepsi value center")).toBe("Bevásárlóközpont");
  });

  it("knows the names riders use instead of the official ones", () => {
    expect(names("söröző").join(" ")).toMatch(/Söröző|Sport utca/);
    expect(names("ANL").join(" ")).toMatch(/Gyöngyvirág/);
    expect(names("kórház").join(" ")).toMatch(/Kórház/);
  });

  it("takes the query in either language", () => {
    expect(top("gara")).toBe("Vasútállomás");
    expect(top("Piata Libertatii")).toBe("Szabadság tér");
    expect(top("Vasútállomás")).toBe("Vasútállomás");
  });

  it("does not need accents", () => {
    expect(top("csiki utca")).toMatch(/Csíki/);
    expect(top("gyongyvirag")).toMatch(/Gyöngyvirág/);
    expect(top("arkos")).toMatch(/Árkos/);
  });

  it("survives a typo", () => {
    expect(top("vasutalomas")).toBe("Vasútállomás");
  });

  it("finds a street by its Hungarian name", () => {
    expect(top("stadion utca")).toBe("Stadion utca");
  });

  it("prefers a bus stop when the name matches both a stop and a street", () => {
    expect(search(index, "Csíki utca 1", 1)[0].kind).toBe("stop");
  });

  it("stays quiet for somewhere else entirely", () => {
    expect(search(index, "Kolozsvár főtér")).toHaveLength(0);
    expect(search(index, "Budapest")).toHaveLength(0);
  });

  it("answers fast enough for every keystroke", () => {
    const t0 = performance.now();
    for (const q of ["s", "se", "sep", "seps", "sepsi", "sepsi v", "sepsi val"])
      search(index, q);
    expect((performance.now() - t0) / 7).toBeLessThan(60);
  });
});
