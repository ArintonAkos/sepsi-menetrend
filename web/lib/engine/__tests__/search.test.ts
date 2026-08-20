import { describe, it, expect } from "vitest";
import { buildIndex, search, editDistance, tokenise } from "../search";
import type { Place } from "../search";

const places: Place[] = [
  { kind: "place",  ro: "Sepsi Value Centre", hu: "Sepsi Value Centre", at: [25.7986, 45.8697] },
  { kind: "stop",   ro: "Str. Sporturilor", hu: "Sport utca", at: [25.78, 45.86], aliases: ["Söröző"] },
  { kind: "stop",   ro: "Str. Lăcrămioarei 1", hu: "Gyöngyvirág utca 1", at: [25.79, 45.87], aliases: ["ANL"] },
  { kind: "stop",   ro: "Gara CFR", hu: "Vasútállomás", at: [25.78, 45.85] },
  { kind: "street", ro: "Strada Stadionului", hu: "Stadion utca", at: [25.777, 45.862] },
  { kind: "street", ro: "Piața Libertății", hu: "Szabadság tér", at: [25.787, 45.864] },
  { kind: "stop",   ro: "Arena Sepsi", hu: "Sepsi Aréna", at: [25.807, 45.882] },
];
const index = buildIndex(places);
const first = (q: string) => search(index, q)[0]?.hu ?? null;

describe("editDistance", () => {
  it("counts a transposition as one step", () => {
    expect(editDistance("center", "centre")).toBe(1);
  });
  it("gives up early on lengths that cannot match", () => {
    expect(editDistance("a", "abcdefg")).toBe(3);
  });
});

describe("search", () => {
  it("finds the mall despite the British spelling in OSM", () => {
    expect(first("sepsi value center")).toBe("Sepsi Value Centre");
    expect(first("value center")).toBe("Sepsi Value Centre");
  });
  it("ignores accents in either direction", () => {
    expect(first("csiki")).toBe(null);            // not in this fixture
    expect(first("vasutallomas")).toBe("Vasútállomás");
    expect(first("Piata Libertatii")).toBe("Szabadság tér");
  });
  it("matches the Romanian name and shows the Hungarian one", () => {
    expect(first("gara")).toBe("Vasútállomás");
  });
  it("honours rider nicknames the operator does not use", () => {
    expect(first("söröző")).toBe("Sport utca");
    expect(first("sorozo")).toBe("Sport utca");
    expect(first("ANL")).toBe("Gyöngyvirág utca 1");
  });
  it("finds a street by its Hungarian name", () => {
    expect(first("stadion utca")).toBe("Stadion utca");
  });
  it("prefers a stop over a street when both match", () => {
    expect(search(index, "sepsi")[0].kind).toBe("stop");
  });
  it("returns nothing rather than noise for an unrelated query", () => {
    expect(search(index, "Budapest Keleti")).toHaveLength(0);
  });
  it("ignores an empty query", () => {
    expect(search(index, "   ")).toHaveLength(0);
  });
});

describe("tokenise", () => {
  it("splits on punctuation so 'Str.' does not glue to the name", () => {
    expect(tokenise("Str. Lăcrămioarei 1")).toEqual(["str", "lacramioarei", "1"]);
  });
});
