import { describe, expect, it } from "vitest";
import { prepare } from "../plan";
import { multimodalSearchStarts, planMultimodal, suppressPointlessBikeHybrids, type MultimodalDependencies } from "../multimodal";
import type { Journey, LngLat, Network, PlanRequest, WalkingContext } from "../types";
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

const directBus: Journey = {
  legs: [
    { kind: "walk", fromStopId: null, toStopId: "A", metres: 600, minutes: 5, path: [origin, a] },
    { kind: "ride", lineId: "1", patternId: "one", fromIndex: 0, toIndex: 1, board: 18 * 60 + 7, alight: 18 * 60 + 19 },
    { kind: "walk", fromStopId: "B", toStopId: null, metres: 350, minutes: 3, path: [b, destination] },
  ],
  depart: 18 * 60 + 4, arrive: 18 * 60 + 22, walkMinutes: 8, transfers: 0,
};

const pointlessBikeBus: Journey = {
  legs: [
    { kind: "walk", fromStopId: null, toStopId: null, metres: 40, minutes: 1, path: [origin, dockA] },
    { kind: "bike", startStationId: "02", finishStationId: "01", depart: 18 * 60 + 5, arrive: 18 * 60 + 23,
      metres: 1377, minutes: 18, seconds: 1080, ascentMetres: 0, descentMetres: 0, path: [dockA, dockB], costLei: 0, stale: false },
    { kind: "walk", fromStopId: null, toStopId: "A", metres: 127, minutes: 2, path: [dockB, a] },
    { kind: "ride", lineId: "2", patternId: "two", fromIndex: 0, toIndex: 1, board: 18 * 60 + 36, alight: 18 * 60 + 48 },
    { kind: "walk", fromStopId: "B", toStopId: null, metres: 281, minutes: 4, path: [b, destination] },
  ],
  depart: 18 * 60 + 4, arrive: 18 * 60 + 52, walkMinutes: 7, transfers: 0,
};

describe("multimodal planner", () => {
  it("uses one exact start for a depart-at search", () => {
    expect(multimodalSearchStarts(request(8 * 60))).toEqual([480]);
  });

  it("stops an obsolete multimodal search before it schedules routing work", async () => {
    const controller = new AbortController();
    controller.abort();
    let walkCalls = 0;
    const found = await planMultimodal(prepare(network()), request(), walking, {
      availability: availability(),
      routes: {
        walk: async (...args) => { walkCalls += 1; return routes().walk(...args); },
        ride: routes().ride,
      },
      signal: controller.signal,
    });
    expect(found).toEqual([]);
    expect(walkCalls).toBe(0);
  });

  it("keeps a direct bike arrive-by option at the actual latest departure", async () => {
    const found = await planMultimodal(prepare(network()), {
      ...request(8 * 60, new Set(["no-bus"])), mode: "arriveBy",
    }, walking, deps());
    const directBike = found.find((journey) => journey.legs.some((leg) => leg.kind === "bike")
      && !journey.legs.some((leg) => leg.kind === "ride"));
    expect(directBike?.arrive).toBe(8 * 60);
  });

  it("finds an exact bike-to-bus arrive-by connection between sampled minutes", async () => {
    /* The useful departure is 07:59: walk ten minutes to the dock, ride five
       minutes, walk one minute, then catch the 08:15 bus. A 10-minute forward
       sweep checks 07:51 and 08:01, so it can never discover this connection. */
    const found = await planMultimodal(prepare(network()), {
      ...request(8 * 60 + 21), mode: "arriveBy",
    }, walking, deps());
    const mixed = found.find((journey) => journey.legs.some((leg) => leg.kind === "bike")
      && journey.legs.some((leg) => leg.kind === "ride"));

    expect(mixed).toMatchObject({ depart: 7 * 60 + 59, arrive: 8 * 60 + 21 });
    expect(mixed?.legs.map((leg) => leg.kind)).toEqual(["walk", "bike", "walk", "ride", "walk"]);
  });

  it("finds an exact bus-to-bike-to-bus arrive-by connection", async () => {
    const mixedNetwork = network();
    mixedNetwork.trips = [
      { patternId: "one", service: "weekday", start: 8 * 60 + 2 },
      { patternId: "two", service: "weekday", start: 8 * 60 + 18 },
    ];
    const found = await planMultimodal(prepare(mixedNetwork), {
      ...request(8 * 60 + 24), mode: "arriveBy",
    }, walking, deps());
    const mixed = found.find((journey) => journey.legs.map((leg) => leg.kind).join(",")
      === "walk,ride,walk,bike,walk,ride,walk");

    expect(mixed).toMatchObject({ depart: 8 * 60 + 1, arrive: 8 * 60 + 24 });
  });

  it("hides a bike-plus-bus detour when a bus is much faster for only one extra walking minute", () => {
    expect(suppressPointlessBikeHybrids([directBus, pointlessBikeBus])).toEqual([directBus]);
  });

  it("keeps a bike-plus-bus option when it materially reduces walking", () => {
    const helpfulBikeBus = { ...pointlessBikeBus, walkMinutes: 2 };
    expect(suppressPointlessBikeHybrids([directBus, helpfulBikeBus])).toEqual([directBus, helpfulBikeBus]);
  });

  it("returns a direct dock-to-dock bike journey in the common leg model", async () => {
    const found = await planMultimodal(prepare(network()), request(8 * 60, new Set(["no-bus"])), walking, deps());
    expect(found.map((journey) => journey.legs.map((leg) => leg.kind).join(","))).toContain("walk,bike,walk");
  });

  it("keeps the shorter walk when the same shape is also reachable via a detour stop", async () => {
    /* From the destination dock the rider can walk straight to the door, or
       wander to stop D first and walk on - the two merge to one long walk with
       an identical signature. The gentler one must survive, not whichever the
       search happened to write last. */
    const base = routes();
    const detourRoutes = {
      ...base,
      walk: async (from: LngLat, to: LngLat) =>
        key(from, to) === key(dockB, d) ? foot(dockB, d, 850, 11) : base.walk(from, to),
    };

    const found = await planMultimodal(
      prepare(network()), request(8 * 60, new Set(["no-bus"])), walking,
      { availability: availability(), routes: detourRoutes });

    const bikeJourney = found.find((journey) => journey.legs.some((leg) => leg.kind === "bike"));
    expect(bikeJourney).toBeDefined();
    expect(bikeJourney!.walkMinutes).toBe(20);
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

  it("does not expose internal platform-walk hops as separate walking instructions", async () => {
    const transferOnly = network();
    transferOnly.patterns = [{ id: "one", lineId: "1", shapeId: "one", headsign: { ro: "D", hu: "D" },
      stopIds: ["B", "D"], offsets: [0, 5], published: [true, true], shape: [b, d], shapeIndex: [0, 1] }];
    transferOnly.trips = [{ patternId: "one", service: "weekday", start: 8 * 60 + 2 }];
    transferOnly.walks = [{ from: "A", to: "B", metres: 50, seconds: 60, path: [a, b] }];
    const transferWalking: WalkingContext = {
      access: new Map([["A", foot(origin, a, 20, 1)]]),
      egress: new Map([["D", foot(d, destination, 20, 1)]]),
      direct: null,
    };
    const found = await planMultimodal(prepare(transferOnly), request(8 * 60), transferWalking,
      deps([]));
    const journey = found.find((item) => item.legs.some((leg) => leg.kind === "ride"));

    expect(journey?.legs.map((leg) => leg.kind)).toEqual(["walk", "ride", "walk"]);
    expect(journey?.legs[0]).toMatchObject({ kind: "walk", metres: 70, minutes: 2, toStopId: "B" });
  });

  it("never docks and immediately rents another bike without changing mode", async () => {
    const mid: LngLat = [25.7200, 45.8000];
    const chainedStations: BikeStation[] = [
      ...stations(),
      { id: "03", name: "03. Átmeneti dokk", address: "M", lat: mid[1], lng: mid[0],
        availableBikes: 2, freeDocks: 2, totalCapacity: 4, status: "Online" },
    ];
    const chainedRoutes = {
      walk: async (from: LngLat, to: LngLat) => {
        if (key(from, to) === key(origin, dockA)) return foot(from, to, 20, 1);
        if (key(from, to) === key(dockB, destination)) return foot(from, to, 20, 1);
        return null;
      },
      ride: async (from: LngLat, to: LngLat) => {
        const journey = `${from[0]}>${to[0]}`;
        if (journey === `${dockA[0]}>${mid[0]}` || journey === `${mid[0]}>${dockB[0]}`)
          return { ...foot(from, to, 500, 2), seconds: 120, ascentMetres: 0, descentMetres: 0 };
        if (journey === `${dockA[0]}>${dockB[0]}`)
          return { ...foot(from, to, 1000, 4), seconds: 240, ascentMetres: 0, descentMetres: 0 };
        return null;
      },
    };
    const found = await planMultimodal(prepare(network()), request(8 * 60, new Set(["no-bus"])), walking, {
      availability: availability(chainedStations), routes: chainedRoutes,
    });

    expect(found.every((journey) => journey.legs.every((leg, index) =>
      index === 0 || leg.kind !== "bike" || journey.legs[index - 1].kind !== "bike"))).toBe(true);
  });

  it("does not invent a bike leg without a bike at the pickup dock", async () => {
    const found = await planMultimodal(prepare(network()), request(), walking,
      deps(stations({ availableBikes: 0 })));
    expect(found.every((journey) => !journey.legs.some((leg) => leg.kind === "bike"))).toBe(true);
  });

  it("reaches a usable dock even when three nearer empty docks cannot lend a bike", async () => {
    const blocked = [1, 2, 3].map((number) => ({
      id: `blocked-${number}`, name: `Blocked ${number}`, address: "Blocked",
      lat: origin[1], lng: origin[0] + number / 100_000,
      availableBikes: 0, freeDocks: 4, totalCapacity: 4, status: "Online",
    }));
    const found = await planMultimodal(prepare(network()), request(8 * 60, new Set(["no-bus"])), walking,
      deps([...blocked, ...stations()]));

    expect(found.some((journey) => journey.legs.some((leg) => leg.kind === "bike"
      && leg.startStationId === "01" && leg.finishStationId === "02"))).toBe(true);
  });

  it("keeps a bike-to-bus connection when its serving platform is not among the nearest eight", async () => {
    const withNearbyIrrelevantStops = network();
    withNearbyIrrelevantStops.stops.push(...Array.from({ length: 8 }, (_, index) => ({
      id: `X${index}`, name: { ro: `X${index}`, hu: `X${index}` },
      at: [dockB[0] + (index + 1) / 100_000, dockB[1]] as LngLat,
      stationId: `X${index}`, zone: "city" as const,
    })));
    const found = await planMultimodal(prepare(withNearbyIrrelevantStops), request(8 * 60, new Set(["2"])), walking,
      deps());

    expect(found.some((journey) => journey.legs.map((leg) => leg.kind).join(",")
      === "walk,bike,walk,ride,walk")).toBe(true);
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
