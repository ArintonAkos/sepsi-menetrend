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
