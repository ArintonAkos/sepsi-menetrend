/** Bounded time-dependent search over the existing physical bus, foot and
 * SepsiBike networks.  Every foot and bicycle geometry is supplied by the
 * offline routers; this module only combines those exact paths with GTFS
 * departure times. */
import { isBikeStationUsable, type BikeAvailability, type BikeRouteFunctions, type BikeStation } from "../sepsibike";
import { bikeFare, canStartBikeRide } from "../sepsibike-timing";
import { metresBetween } from "../walking-router";
import { MAX_DIRECT_WALK, MAX_RIDES, MIN_TRANSFER, generalisedCost, removeNoProgressLoops, type PlanContext } from "./plan";
import type { BikeLeg, Journey, Leg, LngLat, Minute, PlanRequest, RideLeg, WalkLeg, WalkingContext } from "./types";

/** Two rentals already cover first/last mile plus one transfer; a third makes
 * a city journey slower and explodes the state space without helping riders. */
const MAX_RENTALS = 2;
/** Candidate selection limits router work, never path geometry: every selected
 * connection is still accepted only after an exact OSM route succeeds. */
const NEAREST_DOCKS = 3;
const NEAREST_STOPS = 8;
const BIKE_FINISH_CANDIDATES = 2;

export interface MultimodalDependencies {
  availability: BikeAvailability;
  routes: BikeRouteFunctions;
  /** Optional worker batch endpoint.  It turns all walk candidates from one
   * node into one Dijkstra run instead of N identical graph searches. */
  walkFrom?: (from: LngLat, destinations: LngLat[]) => Promise<Array<{
    metres: number; minutes: number; path: LngLat[];
  } | null>>;
}

interface Label {
  at: `stop:${string}` | `dock:${string}`;
  minute: Minute;
  legs: Leg[];
  walkMinutes: Minute;
  rides: number;
  rentals: number;
}

const pointOf = (station: BikeStation): LngLat => [station.lng, station.lat];
const stopNode = (id: string): `stop:${string}` => `stop:${id}`;
const dockNode = (id: string): `dock:${string}` => `dock:${id}`;
const stopId = (node: `stop:${string}`) => node.slice(5);
const dockId = (node: `dock:${string}`) => node.slice(5);

function footLeg(fromStopId: string | null, toStopId: string | null,
                 route: { metres: number; minutes: number; path: LngLat[] }): WalkLeg {
  return { kind: "walk", fromStopId, toStopId, ...route };
}

function timedStart(legs: Leg[], fallback: Minute): Minute {
  let walked = 0;
  for (const leg of legs) {
    if (leg.kind === "walk") { walked += leg.minutes; continue; }
    return (leg.kind === "ride" ? leg.board : leg.depart) - walked;
  }
  return fallback;
}

function toJourney(label: Label, fallbackDepart: Minute): Journey {
  const rides = label.legs.filter((leg): leg is RideLeg => leg.kind === "ride");
  return {
    legs: label.legs,
    depart: timedStart(label.legs, fallbackDepart),
    arrive: label.minute,
    walkMinutes: label.walkMinutes,
    transfers: Math.max(0, rides.length - 1),
  };
}

function signature(journey: Journey) {
  return journey.legs.map((leg) => leg.kind === "ride"
    ? `r:${leg.patternId}:${leg.fromIndex}>${leg.toIndex}`
    : leg.kind === "bike" ? `b:${leg.startStationId}>${leg.finishStationId}`
      : `w:${leg.fromStopId ?? "origin"}>${leg.toStopId ?? "destination"}`).join("|");
}

function nearest<T>(from: LngLat, values: T[], at: (value: T) => LngLat, limit: number): T[] {
  return [...values].sort((left, right) => metresBetween(from, at(left)) - metresBetween(from, at(right)))
    .slice(0, limit);
}

function readyAt(label: Label) {
  return label.minute + (label.legs.at(-1)?.kind === "ride" ? MIN_TRANSFER : 0);
}

/**
 * Plan direct bike, first/last-mile bike and bike-between-buses journeys.  The
 * only approximating step is pruning which potential connection to ask the
 * router about; no selected leg ever falls back to a diagonal or guessed time.
 */
export async function planMultimodal(
  ctx: PlanContext, request: PlanRequest, walking: WalkingContext,
  dependencies: MultimodalDependencies, limit = 8,
): Promise<Journey[]> {
  const stations = dependencies.availability.stations;
  const stationById = new Map(stations.map((station) => [station.id, station]));
  const stale = dependencies.availability.stale || dependencies.availability.source !== "live";
  const routeCache = new Map<string, Promise<{ metres: number; minutes: number; path: LngLat[] } | null>>();
  const bikeCache = new Map<string, Promise<Awaited<ReturnType<BikeRouteFunctions["ride"]>>>>();
  const walk = (from: LngLat, to: LngLat) => {
    const key = `w:${from.join(",")}>${to.join(",")}`;
    let route = routeCache.get(key);
    if (!route) { route = dependencies.routes.walk(from, to); routeCache.set(key, route); }
    return route;
  };
  const walksFrom = async (from: LngLat, destinations: LngLat[]) => {
    const keys = destinations.map((to) => `w:${from.join(",")}>${to.join(",")}`);
    const missing = destinations.filter((_, index) => !routeCache.has(keys[index]));
    if (missing.length && dependencies.walkFrom) {
      const routes = await dependencies.walkFrom(from, missing);
      missing.forEach((to, index) => {
        const key = `w:${from.join(",")}>${to.join(",")}`;
        routeCache.set(key, Promise.resolve(routes[index] ?? null));
      });
    }
    return Promise.all(destinations.map((to) => walk(from, to)));
  };
  const ride = (from: LngLat, to: LngLat) => {
    const key = `b:${from.join(",")}>${to.join(",")}`;
    let route = bikeCache.get(key);
    if (!route) { route = dependencies.routes.ride(from, to); bikeCache.set(key, route); }
    return route;
  };
  const usableOrigins = stations.filter((station) => isBikeStationUsable(station, "origin"));
  const usableDestinations = stations.filter((station) => isBikeStationUsable(station, "destination"));
  const stopCandidates = (from: LngLat) => nearest(from, [...ctx.stops.values()], (stop) => stop.at, NEAREST_STOPS);
  const dockCandidates = (from: LngLat) => nearest(from, stations, pointOf, NEAREST_DOCKS);
  const bikeFinishCandidates = (from: LngLat) => {
    const combined = [...nearest(from, usableDestinations, pointOf, BIKE_FINISH_CANDIDATES),
      ...nearest(request.to, usableDestinations, pointOf, BIKE_FINISH_CANDIDATES)];
    return [...new Map(combined.map((station) => [station.id, station])).values()];
  };

  const found = new Map<string, Journey>();
  const starts = request.mode === "departAt" ? [request.time]
    : Array.from({ length: 121 }, (_, index) => request.time - 120 + index).filter((minute) => minute >= 0);

  for (const start of starts) {
    const queue: Label[] = [];
    const best = new Map<string, Label[]>();
    const enqueue = (label: Label) => {
      const key = `${label.at}|${label.rides}|${label.rentals}`;
      const prior = best.get(key) ?? [];
      if (prior.some((other) => other.minute <= label.minute && other.walkMinutes <= label.walkMinutes)) return;
      best.set(key, prior.filter((other) => !(label.minute <= other.minute && label.walkMinutes <= other.walkMinutes)).concat(label));
      queue.push(label);
    };

    for (const [id, route] of walking.access) {
      if (!ctx.stops.has(id)) continue;
      enqueue({ at: stopNode(id), minute: start + route.minutes,
        legs: [footLeg(null, id, route)], walkMinutes: route.minutes, rides: 0, rentals: 0 });
    }
    const initialDocks = dockCandidates(request.from);
    const initialRoutes = await walksFrom(request.from, initialDocks.map(pointOf));
    for (const [index, station] of initialDocks.entries()) {
      const route = initialRoutes[index];
      if (!route) continue;
      enqueue({ at: dockNode(station.id), minute: start + route.minutes,
        legs: [footLeg(null, null, route)], walkMinutes: route.minutes, rides: 0, rentals: 0 });
    }
    if (walking.direct && walking.direct.minutes <= MAX_DIRECT_WALK) {
      const direct: Journey = {
        legs: [footLeg(null, null, walking.direct)], depart: start,
        arrive: start + walking.direct.minutes, walkMinutes: walking.direct.minutes, transfers: 0,
      };
      if (request.mode === "departAt" || direct.arrive <= request.time) found.set(signature(direct), direct);
    }

    while (queue.length) {
      queue.sort((left, right) => left.minute - right.minute || left.walkMinutes - right.walkMinutes);
      const label = queue.shift()!;
      const current = best.get(`${label.at}|${label.rides}|${label.rentals}`) ?? [];
      if (!current.includes(label)) continue;

      if (label.at.startsWith("stop:")) {
        const id = stopId(label.at as `stop:${string}`);
        const stop = ctx.stops.get(id)!;
        const egress = walking.egress.get(id);
        if (egress) {
          const end: Label = { ...label, minute: label.minute + egress.minutes,
            legs: [...label.legs, footLeg(id, null, egress)], walkMinutes: label.walkMinutes + egress.minutes };
          const journey = removeNoProgressLoops(ctx, toJourney(end, start), request, walking);
          if (request.mode === "departAt" || journey.arrive <= request.time) found.set(signature(journey), journey);
        }
        for (const transfer of ctx.walksFrom.get(id) ?? []) {
          const minutes = Math.max(1, Math.round(transfer.seconds / 60));
          enqueue({ at: stopNode(transfer.to), minute: readyAt(label) + minutes,
            legs: [...label.legs, footLeg(id, transfer.to, { ...transfer, minutes })],
            walkMinutes: label.walkMinutes + minutes, rides: label.rides, rentals: label.rentals });
        }
        if (label.rides < MAX_RIDES) {
          for (const call of ctx.callsAt.get(id) ?? []) {
            const pattern = ctx.patterns.get(call.patternId)!;
            if (request.lines?.size && !request.lines.has(pattern.lineId)) continue;
            const trip = (ctx.tripsOf.get(pattern.id) ?? []).find((candidate) =>
              candidate.service === request.service && candidate.start + pattern.offsets[call.index] >= readyAt(label));
            if (!trip) continue;
            for (let index = call.index + 1; index < pattern.stopIds.length; index++) {
              const arrival = trip.start + pattern.offsets[index];
              const rideLeg: RideLeg = { kind: "ride", lineId: pattern.lineId, patternId: pattern.id,
                fromIndex: call.index, toIndex: index,
                board: trip.start + pattern.offsets[call.index], alight: arrival };
              enqueue({ at: stopNode(pattern.stopIds[index]), minute: arrival,
                legs: [...label.legs, rideLeg], walkMinutes: label.walkMinutes,
                rides: label.rides + 1, rentals: label.rentals });
            }
          }
        }
        const nearbyDocks = dockCandidates(stop.at);
        const nearbyDockRoutes = await walksFrom(stop.at, nearbyDocks.map(pointOf));
        for (const [index, station] of nearbyDocks.entries()) {
          const route = nearbyDockRoutes[index];
          if (!route) continue;
          enqueue({ at: dockNode(station.id), minute: readyAt(label) + route.minutes,
            legs: [...label.legs, footLeg(id, null, route)], walkMinutes: label.walkMinutes + route.minutes,
            rides: label.rides, rentals: label.rentals });
        }
      } else {
        const station = stationById.get(dockId(label.at as `dock:${string}`));
        if (!station) continue;
        const endRoute = await walk(pointOf(station), request.to);
        if (endRoute) {
          const end: Label = { ...label, minute: label.minute + endRoute.minutes,
            legs: [...label.legs, footLeg(null, null, endRoute)], walkMinutes: label.walkMinutes + endRoute.minutes };
          const journey = removeNoProgressLoops(ctx, toJourney(end, start), request, walking);
          if (request.mode === "departAt" || journey.arrive <= request.time) found.set(signature(journey), journey);
        }
        const nearbyStops = stopCandidates(pointOf(station));
        const nearbyStopRoutes = await walksFrom(pointOf(station), nearbyStops.map((stop) => stop.at));
        for (const [index, stop] of nearbyStops.entries()) {
          const route = nearbyStopRoutes[index];
          if (!route) continue;
          enqueue({ at: stopNode(stop.id), minute: label.minute + route.minutes,
            legs: [...label.legs, footLeg(null, stop.id, route)], walkMinutes: label.walkMinutes + route.minutes,
            rides: label.rides, rentals: label.rentals });
        }
        if (label.rentals < MAX_RENTALS && isBikeStationUsable(station, "origin") && canStartBikeRide(label.minute)) {
          for (const finish of bikeFinishCandidates(pointOf(station))) {
            if (finish.id === station.id) continue;
            const route = await ride(pointOf(station), pointOf(finish));
            if (!route) continue;
            const terrain = route as typeof route & Partial<{
              seconds: number; ascentMetres: number; descentMetres: number;
            }>;
            const seconds = terrain.seconds ?? route.minutes * 60;
            const minutes = Math.max(1, Math.ceil(seconds / 60));
            const bike: BikeLeg = { kind: "bike", startStationId: station.id, finishStationId: finish.id,
              depart: label.minute, arrive: label.minute + minutes, metres: route.metres, minutes, seconds,
              ascentMetres: terrain.ascentMetres ?? 0,
              descentMetres: terrain.descentMetres ?? 0,
              path: route.path, costLei: bikeFare(minutes), stale };
            enqueue({ at: dockNode(finish.id), minute: bike.arrive, legs: [...label.legs, bike],
              walkMinutes: label.walkMinutes, rides: label.rides, rentals: label.rentals + 1 });
          }
        }
      }
    }
  }

  const all = [...found.values()].filter((journey) => ![...found.values()].some((other) => other !== journey
    && other.depart >= journey.depart && other.arrive <= journey.arrive
    && other.walkMinutes <= journey.walkMinutes && other.transfers <= journey.transfers
    && (other.depart > journey.depart || other.arrive < journey.arrive
      || other.walkMinutes < journey.walkMinutes || other.transfers < journey.transfers)))
    .sort((left, right) => generalisedCost(left, request) - generalisedCost(right, request)
      || (request.mode === "departAt" ? left.arrive - right.arrive || left.depart - right.depart
        : right.depart - left.depart || right.arrive - left.arrive));
  return all.slice(0, limit);
}
