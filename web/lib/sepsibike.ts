/** Shared SepsiBike contract used by the static app and the Netlify endpoint.
 *
 * The upstream GloBikes page is HTML and its property names are not ours. Keep
 * that boundary here so a changed upstream page cannot leak malformed station
 * data into the map or planner.
 */
export interface BikeStation {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  availableBikes: number;
  freeDocks: number;
  totalCapacity: number;
  status: string;
}

export interface BikeAvailability {
  stations: BikeStation[];
  source: "live" | "snapshot";
  fetchedAt: string;
  stale: boolean;
}

export interface BikeSnapshot {
  snapshotAt: string;
  stations: BikeStation[];
}

import type { Place } from "./engine/search";
import { metresBetween, type FootPath } from "./walking-router";
import type { LngLat } from "./engine/types";

interface OfficialStation {
  StationName: unknown;
  Address: unknown;
  Latitude: unknown;
  Longitude: unknown;
  OcuppiedSpots: unknown;
  EmptyDoors: unknown;
  Status: unknown;
}

const finiteNonNegative = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

/** Turn the official spelling (including its OcuppiedSpots typo) into ours. */
export function normaliseBikeStations(raw: unknown, expectedCount = 17): BikeStation[] {
  if (!Array.isArray(raw) || raw.length !== expectedCount)
    throw new Error(`expected ${expectedCount} SepsiBike stations`);

  const ids = new Set<string>();
  return raw.map((value) => {
    const station = value as OfficialStation;
    if (typeof station.StationName !== "string" || typeof station.Address !== "string"
      || typeof station.Status !== "string" || !finiteNonNegative(station.OcuppiedSpots)
      || !finiteNonNegative(station.EmptyDoors) || typeof station.Latitude !== "number"
      || typeof station.Longitude !== "number" || !Number.isFinite(station.Latitude)
      || !Number.isFinite(station.Longitude)) {
      throw new Error("invalid SepsiBike station");
    }
    const id = station.StationName.match(/^\s*(\d+)\./)?.[1]?.padStart(2, "0");
    if (!id) throw new Error("invalid SepsiBike station id");
    if (ids.has(id)) throw new Error(`duplicate SepsiBike station id: ${id}`);
    ids.add(id);
    return {
      id,
      name: station.StationName,
      address: station.Address,
      lat: station.Latitude,
      lng: station.Longitude,
      availableBikes: station.OcuppiedSpots,
      freeDocks: station.EmptyDoors,
      totalCapacity: station.OcuppiedSpots + station.EmptyDoors,
      status: station.Status,
    };
  });
}

type StationInventory = Pick<BikeStation, "status" | "availableBikes" | "freeDocks">
  | Pick<OfficialStation, "Status" | "OcuppiedSpots" | "EmptyDoors">;

const inventory = (station: StationInventory) => {
  if ("status" in station) return station;
  return {
    status: typeof station.Status === "string" ? station.Status : "",
    availableBikes: station.OcuppiedSpots,
    freeDocks: station.EmptyDoors,
  };
};

/** A dock can be used only if it is online and has the relevant physical slot. */
export function isBikeStationUsable(station: StationInventory, role: "origin" | "destination") {
  const state = inventory(station);
  if (state.status.toLowerCase() !== "online") return false;
  const count = role === "origin" ? state.availableBikes : state.freeDocks;
  return typeof count === "number" && Number.isFinite(count) && count > 0;
}

/** Docks are normal coordinate places: discoverable offline, never bus stops. */
export function bikeStationsToPlaces(stations: BikeStation[]): Place[] {
  return stations.map((station) => ({
    kind: "bikeStation",
    ro: station.name.replace(/^\d+\.\s*/, ""),
    hu: station.name.replace(/^\d+\.\s*/, ""),
    at: [station.lng, station.lat],
    detail: station.address,
    aliases: ["bicikli", "kerékpár", "bike", "dock", "dokkoló", "stație", station.address],
  }));
}

export interface BikeRouteFunctions {
  walk(from: LngLat, to: LngLat): Promise<FootPath | null>;
  ride(from: LngLat, to: LngLat): Promise<FootPath | null>;
}

export interface BikeJourneyOption {
  start: BikeStation;
  finish: BikeStation;
  access: FootPath;
  ride: FootPath;
  egress: FootPath;
  totalMinutes: number;
  stale: boolean;
  isFreeEstimate: boolean;
}

const at = (station: BikeStation): LngLat => [station.lng, station.lat];
const MAX_CANDIDATES_PER_SIDE = 3;

/** Whether counts should be shown as last-known rather than live availability. */
export function isBikeAvailabilityStale(availability: BikeAvailability, now = Date.now()) {
  const fetched = Date.parse(availability.fetchedAt);
  return availability.stale || availability.source !== "live"
    || !Number.isFinite(fetched) || now - fetched > 5 * 60_000;
}

/**
 * Compare only the nearest few docks by geometry, then calculate every shown
 * minute on the actual OSM graph. This caps worker work without ever showing a
 * straight-line journey or a dock that cannot lend/receive a bike.
 */
export async function findBikeOption(from: LngLat, to: LngLat,
                                     availability: BikeAvailability,
                                     routes: BikeRouteFunctions): Promise<BikeJourneyOption | null> {
  const starts = availability.stations
    .filter((station) => isBikeStationUsable(station, "origin"))
    .sort((a, b) => metresBetween(from, at(a)) - metresBetween(from, at(b)))
    .slice(0, MAX_CANDIDATES_PER_SIDE);
  const finishes = availability.stations
    .filter((station) => isBikeStationUsable(station, "destination"))
    .sort((a, b) => metresBetween(to, at(a)) - metresBetween(to, at(b)))
    .slice(0, MAX_CANDIDATES_PER_SIDE);
  if (!starts.length || !finishes.length) return null;

  const stale = isBikeAvailabilityStale(availability);
  let best: BikeJourneyOption | null = null;
  for (const start of starts) {
    const access = await routes.walk(from, at(start));
    if (!access) continue;
    for (const finish of finishes) {
      if (start.id === finish.id) continue;
      const [ride, egress] = await Promise.all([
        routes.ride(at(start), at(finish)),
        routes.walk(at(finish), to),
      ]);
      if (!ride || !egress) continue;
      const candidate: BikeJourneyOption = {
        start, finish, access, ride, egress,
        totalMinutes: access.minutes + ride.minutes + egress.minutes,
        stale,
        isFreeEstimate: ride.minutes <= 25,
      };
      if (!best || candidate.totalMinutes < best.totalMinutes
        || (candidate.totalMinutes === best.totalMinutes && candidate.ride.metres < best.ride.metres)) {
        best = candidate;
      }
    }
  }
  return best;
}
