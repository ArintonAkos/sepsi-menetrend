/** Shared SepsiBike contract used by the static app and the Netlify endpoint.
 *
 * The upstream GloBikes page is HTML and its property names are not ours. Keep
 * that boundary here so a changed upstream page cannot leak malformed station
 * data into the map or planner.
 */
import type { Place } from "./engine/search";
import { metresBetween, type FootPath } from "./walking-router";
import type { LngLat } from "./engine/types";
import { isBikeStationUsable } from "./sepsibike-contract";
import type { BikeAvailability, BikeStation } from "./sepsibike-contract";

export { isBikeStationUsable, normaliseBikeStations } from "./sepsibike-contract";
export type { BikeAvailability, BikeSnapshot, BikeStation } from "./sepsibike-contract";

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
  /** Optional worker batch. All returns from one dock use one weighted
   * bicycle-graph search instead of one complete search per destination. */
  ridesFrom?(from: LngLat, destinations: LngLat[]): Promise<Array<FootPath | null>>;
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
