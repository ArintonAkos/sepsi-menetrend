import { describe, expect, it } from "vitest";
import { bikeStationsToPlaces, findBikeOption, isBikeStationUsable, normaliseBikeStations } from "./sepsibike";
import snapshot from "../public/data/sepsibike.json";

const arena = {
  StationName: "06. Sepsi Aréna",
  Address: "Sepsi Aréna",
  Latitude: 45.88173,
  Longitude: 25.80662,
  OcuppiedSpots: 11,
  EmptyDoors: 17,
  Status: "Online",
};

describe("SepsiBike station data", () => {
  it("normalises the official station field names", () => {
    expect(normaliseBikeStations([arena], 1)).toEqual([{
      id: "06", name: "06. Sepsi Aréna", address: "Sepsi Aréna",
      lat: 45.88173, lng: 25.80662,
      availableBikes: 11, freeDocks: 17, totalCapacity: 28, status: "Online",
    }]);
  });

  it("rejects duplicate station ids instead of publishing a partial live map", () => {
    expect(() => normaliseBikeStations([arena, { ...arena, Address: "duplicate" }], 2))
      .toThrow(/duplicate/i);
  });

  it("requires a working bike at the origin and an empty dock at the destination", () => {
    expect(isBikeStationUsable({ ...arena, status: "Offline" }, "origin")).toBe(false);
    expect(isBikeStationUsable({ ...arena, OcuppiedSpots: 0 }, "origin")).toBe(false);
    expect(isBikeStationUsable({ ...arena, EmptyDoors: 0 }, "destination")).toBe(false);
    expect(isBikeStationUsable(arena, "destination")).toBe(true);
  });

  it("ships a dated 17-station snapshot rather than treating old counts as live", () => {
    expect(snapshot).toMatchObject({ snapshotAt: expect.any(String) });
    expect(Array.isArray((snapshot as { stations?: unknown }).stations)).toBe(true);
    expect((snapshot as { stations: unknown[] }).stations).toHaveLength(17);
  });

  it("makes docks locally searchable by bicycle aliases", () => {
    expect(bikeStationsToPlaces([normaliseBikeStations([arena], 1)[0]])[0]).toMatchObject({
      kind: "bikeStation", hu: "Sepsi Aréna", aliases: expect.arrayContaining(["kerékpár", "dock"]),
    });
  });

  it("does not offer a bike journey when no bike can be borrowed", async () => {
    const stations = normaliseBikeStations([
      { ...arena, OcuppiedSpots: 0 },
      { ...arena, StationName: "07. Kaufland", Longitude: 25.80086 },
    ], 2);
    await expect(findBikeOption([25.79, 45.86], [25.80, 45.87], {
      stations, source: "live", fetchedAt: new Date().toISOString(), stale: false,
    }, unreachableRoutes)).resolves.toBeNull();
  });

  it("does not promise a free trip after 25 minutes of riding", async () => {
    const stations = normaliseBikeStations([
      arena,
      { ...arena, StationName: "07. Kaufland", Longitude: 25.80086 },
    ], 2);
    const option = await findBikeOption([25.79, 45.86], [25.80, 45.87], {
      stations, source: "live", fetchedAt: new Date().toISOString(), stale: false,
    }, {
      walk: async (from, to) => ({ path: [from, to], metres: 80, minutes: 1 }),
      ride: async (from, to) => ({ path: [from, to], metres: 6500, minutes: 26 }),
    });
    expect(option).toMatchObject({ totalMinutes: 28, isFreeEstimate: false, stale: false });
  });
});

const unreachableRoutes = {
  walk: async () => null,
  ride: async () => null,
};
