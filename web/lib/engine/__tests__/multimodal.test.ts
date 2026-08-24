import { describe, expect, it } from "vitest";
import { prepare } from "../plan";
import { planMultimodal, type MultimodalDependencies } from "../multimodal";
import type { LngLat, Network, PlanRequest, WalkingContext } from "../types";
import type { BikeAvailability, BikeStation } from "../../sepsibike";
import type { FootPath } from "../../walking-router";

const origin: LngLat = [25.7000, 45.8000];
const a: LngLat = [25.7001, 45.8000];
const b: LngLat = [25.7100, 45.8000];
const c: LngLat = [25.7300, 45.8000];
const d: LngLat = [25.7400, 45.8000];
const destination: LngLat = [25.7401, 45.8000];
const dockA: LngLat = [25.7102, 45.8000];
const dockB: LngLat = [25.7298, 45.8000];

const foot = (from: LngLat, to: LngLat, metres: number, minutes: number): FootPath =>
  ({ path: [from, to], metres, minutes });
const key = (from: LngLat, to: LngLat) => `${from.join(",")}>${to.join(",")}`;

function network(): Network {
  return {
    version: "test", generated: "2026-08-25", validFrom: "2026-08-25",
    lines: ["1", "2"].map((id) => ({ id, name: { ro: id, hu: id }, colour: "#000",
      textColour: "#fff", light: "#000", lightText: "#fff", dark: "#000", darkText: "#fff" })),
    stops: [
      ["A", a], ["B", b], ["C", c], ["D", d],
    ].map(([id, at]) => ({ id: id as string, name: { ro: id as string, hu: id as string },
      at: at as LngLat, stationId: id as string, zone: "city" as const })),
    stations: [],
    patterns: [
      { id: "one", lineId: "1", shapeId: "one", headsign: { ro: "B", hu: "B" },
        stopIds: ["A", "B"], offsets: [0, 5], published: [true, true], shape: [a, b], shapeIndex: [0, 1] },
      { id: "two", lineId: "2", shapeId: "two", headsign: { ro: "D", hu: "D" },
        stopIds: ["C", "D"], offsets: [0, 5], published: [true, true], shape: [c, d], shapeIndex: [0, 1] },
    ],
    trips: [
      { patternId: "one", service: "weekday", start: 8 * 60 + 2 },
      { patternId: "one", service: "weekday", start: 22 * 60 + 2 },
      { patternId: "two", service: "weekday", start: 8 * 60 + 15 },
      { patternId: "two", service: "weekday", start: 22 * 60 + 15 },
    ],
    walks: [],
  };
}

const stations = (over: Partial<BikeStation> = {}): BikeStation[] => [
  { id: "01", name: "01. B dokk", address: "B", lat: dockA[1], lng: dockA[0],
    availableBikes: 2, freeDocks: 2, totalCapacity: 4, status: "Online", ...over },
  { id: "02", name: "02. C dokk", address: "C", lat: dockB[1], lng: dockB[0],
    availableBikes: 2, freeDocks: 2, totalCapacity: 4, status: "Online", ...over },
];

const routes = () => {
  const walks = new Map<string, FootPath>([
    [key(origin, a), foot(origin, a, 20, 1)],
    [key(b, dockA), foot(b, dockA, 30, 1)],
    [key(dockB, c), foot(dockB, c, 30, 1)],
    [key(d, destination), foot(d, destination, 20, 1)],
    [key(origin, dockA), foot(origin, dockA, 800, 10)],
    [key(dockB, destination), foot(dockB, destination, 800, 10)],
  ]);
  return {
    walk: async (from: LngLat, to: LngLat) => walks.get(key(from, to)) ?? null,
    ride: async (from: LngLat, to: LngLat) => from[0] === dockA[0] && to[0] === dockB[0]
      ? { ...foot(from, to, 1500, 5), seconds: 300, ascentMetres: 12, descentMetres: 4 }
      : null,
  };
};

const request = (time = 8 * 60, lines?: Set<string>): PlanRequest => ({
  from: origin, to: destination, time, service: "weekday", mode: "departAt", walkAversion: 0.35,
  lines,
});
const walking: WalkingContext = {
  access: new Map([["A", foot(origin, a, 20, 1)]]),
  egress: new Map([["D", foot(d, destination, 20, 1)]]),
  direct: null,
};
const availability = (docks = stations()): BikeAvailability => ({
  stations: docks, source: "live", fetchedAt: "2026-08-25T08:00:00Z", stale: false,
});
const deps = (docks = stations()): MultimodalDependencies => ({ availability: availability(docks), routes: routes() });

describe("multimodal planner", () => {
  it("returns a direct dock-to-dock bike journey in the common leg model", async () => {
    const found = await planMultimodal(prepare(network()), request(8 * 60, new Set(["no-bus"])), walking, deps());
    expect(found.map((journey) => journey.legs.map((leg) => leg.kind).join(","))).toContain("walk,bike,walk");
  });

  it("can use a docked bike between two bus legs", async () => {
    const found = await planMultimodal(prepare(network()), request(), walking, deps());
    const mixed = found.find((journey) => journey.legs.map((leg) => leg.kind).join(",")
      === "walk,ride,walk,bike,walk,ride,walk");

    expect(mixed).toBeDefined();
    expect(mixed?.legs.find((leg) => leg.kind === "bike")).toMatchObject({
      startStationId: "01", finishStationId: "02", costLei: 0, ascentMetres: 12,
    });
  });

  it("does not invent a bike leg without a bike at the pickup dock", async () => {
    const found = await planMultimodal(prepare(network()), request(), walking,
      deps(stations({ availableBikes: 0 })));
    expect(found.every((journey) => !journey.legs.some((leg) => leg.kind === "bike"))).toBe(true);
  });

  it("does not start a rental at 22:00", async () => {
    const found = await planMultimodal(prepare(network()), request(22 * 60), walking, deps());
    expect(found.every((journey) => !journey.legs.some((leg) => leg.kind === "bike"))).toBe(true);
  });

  it("does not invent a bike leg without a free destination dock", async () => {
    const docks = stations();
    docks[1] = { ...docks[1], freeDocks: 0 };
    const found = await planMultimodal(prepare(network()), request(), walking, deps(docks));
    expect(found.every((journey) => !journey.legs.some((leg) => leg.kind === "bike"))).toBe(true);
  });
});
