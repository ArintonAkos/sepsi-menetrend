/** Bounded time-dependent search over the existing physical bus, foot and
 * SepsiBike networks. Every foot and bicycle geometry is supplied by the
 * offline routers; this module only combines those exact paths with GTFS
 * departure times. */
import { isBikeStationUsable, type BikeAvailability, type BikeRouteFunctions, type BikeStation } from "../sepsibike";
import { bikeFare, canStartBikeRide } from "../sepsibike-timing";
import { MAX_ACCESS_MINUTES, MAX_DIRECT_WALK, MAX_RIDES, MIN_TRANSFER, WALK_PACE, generalisedCost, recommendationFrontier, removeNoProgressLoops, type PlanContext } from "./plan";
import type { BikeLeg, Journey, Leg, LngLat, Minute, PlanRequest, RideLeg, WalkLeg, WalkingContext } from "./types";

/** Two rentals already cover first/last mile plus one transfer; a third makes
 * a city journey slower and explodes the state space without helping riders. */
const MAX_RENTALS = 2;

/** Depart-at has one exact starting point. Arrive-by uses the reverse search
 * below, so it likewise has no arbitrary time sampling. */
export function multimodalSearchStarts(request: PlanRequest): Minute[] {
  return [request.time];
}

const yieldToBrowser = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const monotonicNow = () => globalThis.performance?.now?.() ?? Date.now();

export interface MultimodalDependencies {
  availability: BikeAvailability;
  routes: BikeRouteFunctions;
  /** The UI cancels an obsolete search immediately when its inputs change. */
  signal?: AbortSignal;
  /** Optional worker batch endpoint.  It turns all walk candidates from one
   * node into one Dijkstra run instead of N identical graph searches. */
  walkFrom?: (from: LngLat, destinations: LngLat[], maxMetres?: number) => Promise<Array<{
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

/** A backward label keeps the latest moment at which the preceding vehicle
 * may reach a node, separately from the latest moment at which the rider may
 * simply walk or cycle there.  Only a preceding bus needs the interchange
 * buffer; the first walk from the door does not. */
interface ReverseLabel {
  at: `stop:${string}` | `dock:${string}`;
  latest: Minute;
  originLatest: Minute;
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

/** Platform nodes are useful to the search but not an instruction to the
 * rider. A chain of foot edges is one continuous walk, with its measured OSM
 * geometry retained end-to-end. */
function mergeAdjacentWalks(legs: Leg[]): Leg[] {
  const merged: Leg[] = [];
  for (const leg of legs) {
    const previous = merged.at(-1);
    if (leg.kind === "walk" && previous?.kind === "walk") {
      previous.toStopId = leg.toStopId;
      previous.metres += leg.metres;
      previous.minutes += leg.minutes;
      previous.path = [...previous.path, ...leg.path.slice(1)];
    } else {
      merged.push(leg.kind === "walk" ? { ...leg, path: [...leg.path] } : leg);
    }
  }
  return merged;
}

function toJourney(label: Label, fallbackDepart: Minute): Journey {
  const legs = mergeAdjacentWalks(label.legs);
  const rides = legs.filter((leg): leg is RideLeg => leg.kind === "ride");
  return {
    legs,
    depart: timedStart(legs, fallbackDepart),
    arrive: label.minute,
    walkMinutes: legs.reduce((total, leg) => total + (leg.kind === "walk" ? leg.minutes : 0), 0),
    transfers: Math.max(0, rides.length - 1),
  };
}

function signature(journey: Journey) {
  return journey.legs.map((leg) => leg.kind === "ride"
    ? `r:${leg.patternId}:${leg.fromIndex}>${leg.toIndex}`
    : leg.kind === "bike" ? `b:${leg.startStationId}>${leg.finishStationId}`
      : `w:${leg.fromStopId ?? "origin"}>${leg.toStopId ?? "destination"}`).join("|");
}

function readyAt(label: Label) {
  return label.minute + (label.legs.at(-1)?.kind === "ride" ? MIN_TRANSFER : 0);
}

const hasBike = (journey: Journey) => journey.legs.some((leg) => leg.kind === "bike");
const hasBus = (journey: Journey) => journey.legs.some((leg) => leg.kind === "ride");

/** The bounded arrive-by sweep finds the correct bike geometry but can land a
 * bike-only journey a few minutes early. With no vehicle timetable to catch,
 * that slack belongs to the rider: move the whole rental forward to the exact
 * requested arrival, while still respecting the 22:00 pickup limit. */
function alignDirectBikeWithDeadline(journey: Journey, request: PlanRequest): Journey {
  if (request.mode !== "arriveBy" || hasBus(journey) || !hasBike(journey)) return journey;
  const shift = request.time - journey.arrive;
  if (shift <= 0) return journey;
  const bike = journey.legs.find((leg): leg is BikeLeg => leg.kind === "bike");
  if (!bike || !canStartBikeRide(bike.depart + shift)) return journey;
  return {
    ...journey,
    depart: journey.depart + shift,
    arrive: request.time,
    legs: journey.legs.map((leg) => leg.kind === "bike"
      ? { ...leg, depart: leg.depart + shift, arrive: leg.arrive + shift }
      : { ...leg }),
  };
}

/** A bicycle is a useful connection only when it buys something tangible.
 *
 * The exhaustive multimodal search is deliberately allowed to find every
 * physically possible bike-to-bus combination.  But the result list is a
 * recommendation, not a dump of that search space.  Do not offer a long bike
 * detour merely to save one or two minutes on foot when a later-departing bus
 * reaches the destination materially earlier.  Three walking minutes remains
 * a real trade-off; five arrival minutes is enough to make the slow hybrid
 * clearly worse instead of merely different.
 */
export function suppressPointlessBikeHybrids(journeys: Journey[]): Journey[] {
  return journeys.filter((journey) => {
    if (!hasBike(journey) || !hasBus(journey)) return true;
    return !journeys.some((other) => other !== journey
      && !hasBike(other)
      && other.depart >= journey.depart
      && other.arrive + 5 <= journey.arrive
      && other.walkMinutes <= journey.walkMinutes + 3
      && other.transfers <= journey.transfers);
  });
}

/**
 * Exact arrive-by search across the three physical networks.
 *
 * This is deliberately the reverse counterpart of the forward multimodal
 * search below.  It starts at the requested arrival deadline, follows bus
 * calls backwards and asks the walking/bike routers only for edges that can
 * precede a viable tail.  Unlike a sweep of arbitrary start minutes, every
 * published bus time is therefore considered as a possible connection.
 */
async function planMultimodalArriveBy(
  ctx: PlanContext, request: PlanRequest, walking: WalkingContext,
  dependencies: MultimodalDependencies, limit: number,
): Promise<Journey[]> {
  const stations = dependencies.availability.stations;
  const stationById = new Map(stations.map((station) => [station.id, station]));
  const stale = dependencies.availability.stale || dependencies.availability.source !== "live";
  const usableOrigins = stations.filter((station) => isBikeStationUsable(station, "origin"));
  const usableDestinations = stations.filter((station) => isBikeStationUsable(station, "destination"));
  const allStops = [...ctx.stops.values()];
  const routeCache = new Map<string, Promise<{ metres: number; minutes: number; path: LngLat[] } | null>>();
  const bikeCache = new Map<string, Promise<Awaited<ReturnType<BikeRouteFunctions["ride"]>>>>();
  const walk = (from: LngLat, to: LngLat) => {
    const cacheKey = `w:${from.join(",")}>${to.join(",")}`;
    let route = routeCache.get(cacheKey);
    if (!route) { route = dependencies.routes.walk(from, to); routeCache.set(cacheKey, route); }
    return route;
  };
  const walksFrom = async (from: LngLat, destinations: LngLat[], maxMinutes = MAX_ACCESS_MINUTES) => {
    const cacheKeys = destinations.map((to) => `w:${from.join(",")}>${to.join(",")}`);
    const missing = destinations.filter((_, index) => !routeCache.has(cacheKeys[index]));
    if (missing.length && dependencies.walkFrom) {
      const routes = await dependencies.walkFrom(from, missing, maxMinutes * WALK_PACE);
      missing.forEach((to, index) => {
        routeCache.set(`w:${from.join(",")}>${to.join(",")}`, Promise.resolve(routes[index] ?? null));
      });
    }
    return Promise.all(destinations.map((to) => walk(from, to)));
  };
  const ride = (from: LngLat, to: LngLat) => {
    const cacheKey = `b:${from.join(",")}>${to.join(",")}`;
    let route = bikeCache.get(cacheKey);
    if (!route) { route = dependencies.routes.ride(from, to); bikeCache.set(cacheKey, route); }
    return route;
  };

  /* These are the only two door-to-network searches.  All later geometry is
     discovered lazily from a viable backwards label and cached by direction. */
  const originDockRoutes = await walksFrom(request.from, usableOrigins.map(pointOf));
  /* Pedestrian routing can be directed (stairs, crossings).  These are the
     forward dock -> door routes, so do not reverse a route requested in the
     opposite direction merely for batching convenience. */
  const destinationDockRoutes = await Promise.all(usableDestinations.map((station) =>
    walk(pointOf(station), request.to)));
  if (dependencies.signal?.aborted) return [];

  const queue: ReverseLabel[] = [];
  const best = new Map<string, ReverseLabel[]>();
  const enqueue = (candidate: ReverseLabel) => {
    if (candidate.latest < 0 || candidate.originLatest < 0) return;
    const state = `${candidate.at}|${candidate.rides}|${candidate.rentals}`;
    const prior = best.get(state) ?? [];
    if (prior.some((label) => label.latest >= candidate.latest
      && label.originLatest >= candidate.originLatest
      && label.walkMinutes <= candidate.walkMinutes)) return;
    best.set(state, prior.filter((label) => !(candidate.latest >= label.latest
      && candidate.originLatest >= label.originLatest
      && candidate.walkMinutes <= label.walkMinutes)).concat(candidate));
    queue.push(candidate);
  };

  for (const [id, route] of walking.egress) {
    if (!ctx.stops.has(id)) continue;
    enqueue({ at: stopNode(id), latest: request.time - route.minutes,
      originLatest: request.time - route.minutes,
      legs: [footLeg(id, null, route)], walkMinutes: route.minutes, rides: 0, rentals: 0 });
  }
  for (const [index, station] of usableDestinations.entries()) {
    const route = destinationDockRoutes[index];
    if (!route || route.minutes > MAX_ACCESS_MINUTES) continue;
    const finalWalk = footLeg(null, null, route);
    enqueue({ at: dockNode(station.id), latest: request.time - finalWalk.minutes,
      originLatest: request.time - finalWalk.minutes,
      legs: [finalWalk], walkMinutes: finalWalk.minutes, rides: 0, rentals: 0 });
  }

  const found = new Map<string, Journey>();
  const addJourney = (label: ReverseLabel, access: WalkLeg) => {
    if (access.minutes > label.originLatest) return;
    const legs = mergeAdjacentWalks([access, ...label.legs]);
    const rides = legs.filter((leg): leg is RideLeg => leg.kind === "ride");
    const journey: Journey = {
      legs,
      depart: label.originLatest - access.minutes,
      arrive: request.time,
      walkMinutes: legs.reduce((sum, leg) => sum + (leg.kind === "walk" ? leg.minutes : 0), 0),
      transfers: Math.max(0, rides.length - 1),
    };
    const normalised = rides.length ? removeNoProgressLoops(ctx, journey, request, walking) : journey;
    if (normalised.arrive <= request.time) found.set(signature(normalised), normalised);
  };

  let sliceEndsAt = monotonicNow() + 8;
  while (queue.length) {
    if (dependencies.signal?.aborted) return [];
    if (monotonicNow() >= sliceEndsAt) {
      await yieldToBrowser();
      if (dependencies.signal?.aborted) return [];
      sliceEndsAt = monotonicNow() + 8;
    }
    queue.sort((left, right) => right.originLatest - left.originLatest || left.walkMinutes - right.walkMinutes);
    const label = queue.shift()!;
    const current = best.get(`${label.at}|${label.rides}|${label.rentals}`) ?? [];
    if (!current.includes(label)) continue;

    if (label.at.startsWith("stop:")) {
      const id = stopId(label.at as `stop:${string}`);
      const stop = ctx.stops.get(id)!;
      const access = walking.access.get(id);
      if (access) addJourney(label, footLeg(null, id, access));

      /* Bus calls are hard timetable anchors.  We traverse every previous call
         on the same trip, never approximate a departure from an offset. */
      if (label.rides < MAX_RIDES) {
        /* callsAt intentionally omits a pattern's last call because a forward
           search cannot board there. Backwards we are alighting, so inspect
           every occurrence, including a terminal and a repeated loop stop. */
        for (const pattern of ctx.patterns.values()) {
          if (request.lines?.size && !request.lines.has(pattern.lineId)) continue;
          for (let callIndex = 1; callIndex < pattern.stopIds.length; callIndex++) {
            if (pattern.stopIds[callIndex] !== id) continue;
            for (const trip of ctx.tripsOf.get(pattern.id) ?? []) {
              if (trip.service !== request.service) continue;
              const alight = trip.start + pattern.offsets[callIndex];
              if (alight > label.latest) continue;
              for (let fromIndex = 0; fromIndex < callIndex; fromIndex++) {
                const board = trip.start + pattern.offsets[fromIndex];
                const rideLeg: RideLeg = { kind: "ride", lineId: pattern.lineId, patternId: pattern.id,
                  fromIndex, toIndex: callIndex, board, alight };
                enqueue({ at: stopNode(pattern.stopIds[fromIndex]), latest: board - MIN_TRANSFER,
                  originLatest: board, legs: [rideLeg, ...label.legs], walkMinutes: label.walkMinutes,
                  rides: label.rides + 1, rentals: label.rentals });
              }
            }
          }
        }
      }

      /* Incoming kerb walk (edge.to is the current stop). */
      for (const [from, edges] of ctx.walksFrom) {
        for (const edge of edges) {
          if (edge.to !== id) continue;
          const minutes = Math.max(1, Math.round(edge.seconds / 60));
          enqueue({ at: stopNode(from), latest: label.latest - MIN_TRANSFER - minutes,
            originLatest: label.originLatest - minutes,
            legs: [footLeg(from, id, { ...edge, minutes }), ...label.legs],
            walkMinutes: label.walkMinutes + minutes, rides: label.rides, rentals: label.rentals });
        }
      }

      /* A dock can precede this platform by a real walk, for example a bike
         return followed by the last bus.  Query dock -> stop (the forward
         direction) so one-way pedestrian restrictions remain respected. */
      const dockRoutes = await Promise.all(stations.map((station) => walk(pointOf(station), stop.at)));
      for (const [index, station] of stations.entries()) {
        const route = dockRoutes[index];
        if (!route || route.minutes > MAX_ACCESS_MINUTES) continue;
        enqueue({ at: dockNode(station.id), latest: label.latest - route.minutes,
          originLatest: label.originLatest - route.minutes,
          legs: [footLeg(null, id, route), ...label.legs],
          walkMinutes: label.walkMinutes + route.minutes, rides: label.rides, rentals: label.rentals });
      }
    } else {
      const finish = stationById.get(dockId(label.at as `dock:${string}`));
      if (!finish) continue;
      const originRoute = originDockRoutes[usableOrigins.findIndex((station) => station.id === finish.id)];
      if (originRoute && originRoute.minutes <= MAX_ACCESS_MINUTES) {
        addJourney(label, footLeg(null, null, originRoute));
      }

      /* A stop can precede a dock on foot before picking up a bike. */
      const stopRoutes = await Promise.all(allStops.map((stop) => walk(stop.at, pointOf(finish))));
      for (const [index, stop] of allStops.entries()) {
        const route = stopRoutes[index];
        if (!route || route.minutes > MAX_ACCESS_MINUTES) continue;
        enqueue({ at: stopNode(stop.id), latest: label.latest - MIN_TRANSFER - route.minutes,
          originLatest: label.originLatest - route.minutes,
          legs: [footLeg(stop.id, null, route), ...label.legs],
          walkMinutes: label.walkMinutes + route.minutes, rides: label.rides, rentals: label.rentals });
      }

      if (label.rentals < MAX_RENTALS && label.legs[0]?.kind !== "bike"
          && isBikeStationUsable(finish, "destination")) {
        for (const start of usableOrigins) {
          if (start.id === finish.id) continue;
          const route = await ride(pointOf(start), pointOf(finish));
          if (!route) continue;
          const terrain = route as typeof route & Partial<{
            seconds: number; ascentMetres: number; descentMetres: number;
          }>;
          const seconds = terrain.seconds ?? route.minutes * 60;
          const minutes = Math.max(1, Math.ceil(seconds / 60));
          const depart = label.originLatest - minutes;
          if (!canStartBikeRide(depart)) continue;
          const bike: BikeLeg = { kind: "bike", startStationId: start.id, finishStationId: finish.id,
            depart, arrive: label.originLatest, metres: route.metres, minutes, seconds,
            ascentMetres: terrain.ascentMetres ?? 0, descentMetres: terrain.descentMetres ?? 0,
            path: route.path, costLei: bikeFare(minutes), stale };
          enqueue({ at: dockNode(start.id), latest: depart, originLatest: depart,
            legs: [bike, ...label.legs], walkMinutes: label.walkMinutes,
            rides: label.rides, rentals: label.rentals + 1 });
        }
      }
    }
  }

  if (walking.direct && walking.direct.minutes <= MAX_DIRECT_WALK) {
    found.set("direct-walk", {
      legs: [footLeg(null, null, walking.direct)], depart: request.time - walking.direct.minutes,
      arrive: request.time, walkMinutes: walking.direct.minutes, transfers: 0,
    });
  }
  return recommendationFrontier(suppressPointlessBikeHybrids([...found.values()]))
    .sort((left, right) => generalisedCost(left, request) - generalisedCost(right, request)
      || right.depart - left.depart || left.arrive - right.arrive)
    .slice(0, limit);
}

/**
 * Plan direct bike, first/last-mile bike and bike-between-buses journeys.  The
 * Every usable dock and every physically reachable platform participates in
 * the search. Worker batch APIs keep that exhaustive city-scale comparison
 * inexpensive; no connection is discarded merely because its coordinates are
 * not among a small nearest-by-air-distance list.
 */
export async function planMultimodal(
  ctx: PlanContext, request: PlanRequest, walking: WalkingContext,
  dependencies: MultimodalDependencies, limit = 8,
): Promise<Journey[]> {
  if (request.mode === "arriveBy")
    return planMultimodalArriveBy(ctx, request, walking, dependencies, limit);
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
  const walksFrom = async (from: LngLat, destinations: LngLat[], maxMinutes = MAX_ACCESS_MINUTES) => {
    const keys = destinations.map((to) => `w:${from.join(",")}>${to.join(",")}`);
    const missing = destinations.filter((_, index) => !routeCache.has(keys[index]));
    if (missing.length && dependencies.walkFrom) {
      const routes = await dependencies.walkFrom(from, missing, maxMinutes * WALK_PACE);
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
  const ridesFrom = async (from: LngLat, destinations: LngLat[]) => {
    const keys = destinations.map((to) => `b:${from.join(",")}>${to.join(",")}`);
    const missing = destinations.filter((_, index) => !bikeCache.has(keys[index]));
    if (missing.length && dependencies.routes.ridesFrom) {
      const routes = await dependencies.routes.ridesFrom(from, missing);
      missing.forEach((to, index) => {
        const key = `b:${from.join(",")}>${to.join(",")}`;
        bikeCache.set(key, Promise.resolve(routes[index] ?? null));
      });
    }
    return Promise.all(destinations.map((to) => ride(from, to)));
  };
  const usableOrigins = stations.filter((station) => isBikeStationUsable(station, "origin"));
  const usableDestinations = stations.filter((station) => isBikeStationUsable(station, "destination"));
  const allStops = [...ctx.stops.values()];

  const found = new Map<string, Journey>();
  const starts = multimodalSearchStarts(request);
  /* Promise continuations alone run before input and painting. Budget each
     synchronous label slice too, otherwise a dense combination still makes a
     visibly frozen page even after the time-window bound above. */
  let sliceEndsAt = monotonicNow() + 8;

  for (const start of starts) {
    if (dependencies.signal?.aborted) return [];
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
    const initialDocks = usableOrigins;
    const initialRoutes = await walksFrom(request.from, initialDocks.map(pointOf));
    for (const [index, station] of initialDocks.entries()) {
      const route = initialRoutes[index];
      if (!route || route.minutes > MAX_ACCESS_MINUTES) continue;
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
      if (dependencies.signal?.aborted) return [];
      if (monotonicNow() >= sliceEndsAt) {
        await yieldToBrowser();
        if (dependencies.signal?.aborted) return [];
        sliceEndsAt = monotonicNow() + 8;
      }
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
        const nearbyDocks = usableOrigins;
        const nearbyDockRoutes = await walksFrom(stop.at, nearbyDocks.map(pointOf));
        for (const [index, station] of nearbyDocks.entries()) {
          const route = nearbyDockRoutes[index];
          if (!route || route.minutes > MAX_ACCESS_MINUTES) continue;
          enqueue({ at: dockNode(station.id), minute: readyAt(label) + route.minutes,
            legs: [...label.legs, footLeg(id, null, route)], walkMinutes: label.walkMinutes + route.minutes,
            rides: label.rides, rentals: label.rentals });
        }
      } else {
        const station = stationById.get(dockId(label.at as `dock:${string}`));
        if (!station) continue;
        const [endRoute] = await walksFrom(pointOf(station), [request.to]);
        if (endRoute) {
          const end: Label = { ...label, minute: label.minute + endRoute.minutes,
            legs: [...label.legs, footLeg(null, null, endRoute)], walkMinutes: label.walkMinutes + endRoute.minutes };
          const journey = removeNoProgressLoops(ctx, toJourney(end, start), request, walking);
          if (request.mode === "departAt" || journey.arrive <= request.time) found.set(signature(journey), journey);
        }
        const nearbyStops = allStops;
        const nearbyStopRoutes = await walksFrom(pointOf(station), nearbyStops.map((stop) => stop.at));
        for (const [index, stop] of nearbyStops.entries()) {
          const route = nearbyStopRoutes[index];
          if (!route || route.minutes > MAX_ACCESS_MINUTES) continue;
          enqueue({ at: stopNode(stop.id), minute: label.minute + route.minutes,
            legs: [...label.legs, footLeg(null, stop.id, route)], walkMinutes: label.walkMinutes + route.minutes,
            rides: label.rides, rentals: label.rentals });
        }
        /* Returning and immediately taking another bike at the same moment is
         * neither a transport-mode change nor a useful instruction. A second
         * rental remains possible after an actual walk or bus connection. */
        if (label.rentals < MAX_RENTALS && label.legs.at(-1)?.kind !== "bike"
            && isBikeStationUsable(station, "origin") && canStartBikeRide(label.minute)) {
          const finishes = usableDestinations.filter((finish) => finish.id !== station.id);
          const bikeRoutes = await ridesFrom(pointOf(station), finishes.map(pointOf));
          for (const [finishIndex, finish] of finishes.entries()) {
            const route = bikeRoutes[finishIndex];
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
    /* Give input, map gestures and React a chance between the bounded search
       runs. The actual map routing remains in workers; this prevents the
       combinator from monopolising the browser while it combines their paths. */
    await yieldToBrowser();
  }

  const candidates = suppressPointlessBikeHybrids(
    [...found.values()].map((journey) => alignDirectBikeWithDeadline(journey, request)));
  const all = recommendationFrontier(candidates)
    .sort((left, right) => generalisedCost(left, request) - generalisedCost(right, request)
      || (request.mode === "departAt" ? left.arrive - right.arrive || left.depart - right.depart
        : right.depart - left.depart || right.arrive - left.arrive));
  return all.slice(0, limit);
}
