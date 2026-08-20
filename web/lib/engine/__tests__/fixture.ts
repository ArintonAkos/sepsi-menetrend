import type { LngLat, Network } from "../types";

/** A deliberately tiny network: four stops on a line 1.5 km apart, so only the
 *  nearest one is walkable from each end and the routing is unambiguous.
 *
 *      A ──1── B ──1── C ──2── D
 *
 *  Line 1 runs A→B→C, line 2 runs C→D. Getting from A to D needs a change at C.
 */
const at = (lon: number): LngLat => [lon, 45.86];

export const ORIGIN: LngLat = [25.7601, 45.8601];   // next to A
export const NEAR_C: LngLat = [25.8001, 45.8601];   // next to C
export const NEAR_D: LngLat = [25.8201, 45.8601];   // next to D

export function fixture(): Network {
  return {
    version: "test", generated: "2026-08-19", validFrom: "2026-02-01",
    lines: [
      { id: "1", name: { ro: "Linia 1", hu: "1-es" }, colour: "#136F29", textColour: "#fff",
        light: "#136F29", lightText: "#fff", dark: "#136F29", darkText: "#fff" },
      { id: "2", name: { ro: "Linia 2", hu: "2-es" }, colour: "#DB4436", textColour: "#fff",
        light: "#DB4436", lightText: "#fff", dark: "#DB4436", darkText: "#fff" },
    ],
    stops: [
      { id: "A", name: { ro: "A", hu: "A" }, at: at(25.760), stationId: "A", zone: "city" },
      { id: "B", name: { ro: "B", hu: "B" }, at: at(25.780), stationId: "B", zone: "city" },
      { id: "C", name: { ro: "C", hu: "C" }, at: at(25.800), stationId: "C", zone: "city" },
      { id: "D", name: { ro: "D", hu: "D" }, at: at(25.820), stationId: "D", zone: "arcus" },
    ],
    stations: [],
    patterns: [
      { id: "P1", lineId: "1", shapeId: "S1", headsign: { ro: "spre C", hu: "C felé" },
        stopIds: ["A", "B", "C"], offsets: [0, 5, 10], published: [true, false, true],
        shape: [at(25.760), at(25.800)], shapeIndex: [0, 0, 1] },
      { id: "P2", lineId: "2", shapeId: "S2", headsign: { ro: "spre D", hu: "D felé" },
        stopIds: ["C", "D"], offsets: [0, 6], published: [true, true],
        shape: [at(25.800), at(25.820)], shapeIndex: [0, 1] },
    ],
    trips: [
      { patternId: "P1", service: "weekday", start: 8 * 60 },       // C at 08:10
      { patternId: "P1", service: "weekday", start: 8 * 60 + 30 },  // C at 08:40
      { patternId: "P1", service: "weekday", start: 9 * 60 },
      { patternId: "P1", service: "weekend", start: 10 * 60 },
      { patternId: "P2", service: "weekday", start: 8 * 60 + 41 },  // 1 min after P1 lands: too tight
      { patternId: "P2", service: "weekday", start: 8 * 60 + 45 },  // the one you can actually catch
      { patternId: "P2", service: "weekday", start: 9 * 60 + 15 },
      { patternId: "P2", service: "weekend", start: 10 * 60 + 20 },
    ],
    walks: [],
  };
}
