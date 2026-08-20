/** Query translation. Mapbox indexes the villages under their Romanian names,
 *  so a Hungarian address has to be re-asked before it can be found. */
import { describe, it, expect } from "vitest";
import { insideArea, romanianForm, type Area, type NamePair } from "./geocode";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const pairs: NamePair[] = [
  { hu: "Szotyor", ro: "Coșeni" },
  { hu: "Szotyor 1", ro: "Coșeni 1" },
  { hu: "Kilyén", ro: "Chilieni" },
  { hu: "Vasútállomás", ro: "Gara CFR" },
  { hu: "Csíki utca", ro: "Strada Ciucului" },
  { hu: "Motel Calypso", ro: "Motel Calypso" },   // same in both
];

/* The rest of the query is normalised (lowercased, accents stripped) because
   that is what the matcher works on; the substituted name keeps its proper
   spelling, which is the part the geocoder has to recognise. */
describe("romanianForm", () => {
  it("swaps the village name and keeps the house number", () => {
    expect(romanianForm("Szotyor 73", pairs)).toBe("Coșeni 73");
  });

  it("survives Hungarian address noise", () => {
    expect(romanianForm("Szotyor nr. 73", pairs)).toBe("Coșeni nr 73");
  });

  it("ignores accents and case in the query", () => {
    expect(romanianForm("KILYEN 12", pairs)).toBe("Chilieni 12");
  });

  it("prefers the longest name that matches", () => {
    // "Szotyor 1" must win over the bare "Szotyor"
    expect(romanianForm("Szotyor 1", pairs)).toBe("Coșeni 1");
  });

  it("leaves a query alone when nothing needs translating", () => {
    expect(romanianForm("Strada Stadionului 41", pairs)).toBeNull();
    expect(romanianForm("Motel Calypso", pairs)).toBeNull();
  });

  it("does not translate a name that is already Romanian", () => {
    expect(romanianForm("Coșeni 73", pairs)).toBeNull();
  });

  it("handles an empty query", () => {
    expect(romanianForm("", pairs)).toBeNull();
    expect(romanianForm("   ", pairs)).toBeNull();
  });

  it("translates a multi-word name inside a longer query", () => {
    expect(romanianForm("Csíki utca 5", pairs)).toBe("Strada Ciucului 5");
  });
});

describe("the search area", () => {
  const built = JSON.parse(readFileSync(
    resolve(import.meta.dirname, "../public/data/places.json"), "utf8"));
  const net = JSON.parse(readFileSync(
    resolve(import.meta.dirname, "../public/data/network.json"), "utf8"));
  const area: Area = {
    box: built.bbox, reach: built.reach,
    stops: net.stops.map((s: { at: [number, number] }) => s.at),
  };

  it("holds every stop, with room to walk to one", () => {
    for (const stop of net.stops) {
      expect(insideArea(stop.at, area), `${stop.name.ro} is outside`).toBe(true);
    }
  });

  it("keeps every searchable place inside it", () => {
    for (const place of built.places) {
      expect(insideArea(place.at, area), `${place.ro} is outside`).toBe(true);
    }
  });

  it("stops where the buses do", () => {
    expect(insideArea([26.10, 45.65], area)).toBe(false);   // towards Brașov
    expect(insideArea([19.04, 47.50], area)).toBe(false);   // Budapest
  });

  it("is much smaller than the rectangle it is requested over", () => {
    /* The box has to reach Sugásfürdő in the west and Arcuș in the north.
       Most of what that encloses is farther than a walk from any bus, which is
       why the area is measured to the nearest stop instead. */
    const k = Math.cos((45.865 * Math.PI) / 180);
    const step = 0.003;
    let inBox = 0, inReach = 0;
    for (let lat = area.box[1]; lat <= area.box[3]; lat += step) {
      for (let lon = area.box[0]; lon <= area.box[2]; lon += step) {
        inBox++;
        if (insideArea([lon, lat], area)) inReach++;
      }
    }
    expect(inBox).toBeGreaterThan(100);
    expect(inReach / inBox).toBeLessThan(0.5);   // over half the box is dropped
    expect(k).toBeGreaterThan(0);
  });
});
