/** Journey planning.
 *
 *  A round-based search (RAPTOR): round k holds the best arrival reachable
 *  using k rides. That is worth the machinery over hand-written "direct / one
 *  change / two changes" branches, because the branches are where the earlier
 *  prototype grew its bugs - each one repeated the boarding rules slightly
 *  differently.
 *
 *  Arrive-by runs the same forward search from each plausible departure and
 *  keeps what lands in time. On a network of ~100 stops and a few hundred trips
 *  that costs microseconds, and it avoids maintaining a second, mirrored search
 *  that would drift out of step with this one.
 */
import type {
  Journey, Leg, LngLat, Minute, Network, Pattern, PlanRequest, RideLeg, ServiceId,
  Stop, Trip, Walk, WalkingContext, WalkingLeg,
} from "./types";

/** Minutes a rider needs between alighting and boarding at the same place. */
export const MIN_TRANSFER: Minute = 2;
/** Rides per journey. Three lines is already more than anyone will accept here. */
export const MAX_RIDES = 3;
/** Walking pace, metres per minute - about 4.8 km/h. */
export const WALK_PACE = 80;
/** Straight-line distances underestimate real paths; scale them. */
export const DETOUR = 1.35;
/** Furthest we will make someone walk to reach the first stop. */
export const MAX_ACCESS_MINUTES: Minute = 15;
/** Furthest a whole trip is worth suggesting on foot.
 *  Past about three kilometres nobody opening a bus timetable wants to be told
 *  to walk, and the suggestion stops being help and becomes noise. */
export const MAX_DIRECT_WALK: Minute = 40;

export interface PlanContext {
  net: Network;
  stops: Map<string, Stop>;
  patterns: Map<string, Pattern>;
  /** Every (pattern, index) that calls at a stop. */
  callsAt: Map<string, Array<{ patternId: string; index: number }>>;
  /** Trips of a pattern, ordered by departure. */
  tripsOf: Map<string, Trip[]>;
  walksFrom: Map<string, Walk[]>;
}

export function prepare(net: Network): PlanContext {
  const stops = new Map(net.stops.map((s) => [s.id, s]));
  const patterns = new Map(net.patterns.map((p) => [p.id, p]));
  const callsAt = new Map<string, Array<{ patternId: string; index: number }>>();
  for (const p of net.patterns) {
    p.stopIds.forEach((sid, index) => {
      if (index === p.stopIds.length - 1) return;          // cannot board at the end
      const list = callsAt.get(sid) ?? [];
      list.push({ patternId: p.id, index });
      callsAt.set(sid, list);
    });
  }
  const tripsOf = new Map<string, Trip[]>();
  for (const t of net.trips) {
    const list = tripsOf.get(t.patternId) ?? [];
    list.push(t);
    tripsOf.set(t.patternId, list);
  }
  for (const list of tripsOf.values()) list.sort((a, b) => a.start - b.start);

  const walksFrom = new Map<string, Walk[]>();
  for (const w of net.walks) {
    (walksFrom.get(w.from) ?? walksFrom.set(w.from, []).get(w.from)!).push(w);
    const back: Walk = { ...w, from: w.to, to: w.from, path: [...w.path].reverse() };
    (walksFrom.get(back.from) ?? walksFrom.set(back.from, []).get(back.from)!).push(back);
  }
  return { net, stops, patterns, callsAt, tripsOf, walksFrom };
}

export function metresBetween(a: LngLat, b: LngLat): number {
  const lat = ((a[1] + b[1]) / 2) * (Math.PI / 180);
  return Math.hypot((a[0] - b[0]) * Math.cos(lat) * 111320, (a[1] - b[1]) * 111320);
}

/** Stops a rider can reach on foot from a point, with the walk it takes.
 *  Straight line times a detour factor - the real path comes from the router
 *  once a journey is chosen, and only changes the drawing, not the ranking. */
export function stopsNear(
  ctx: PlanContext, at: LngLat, maxMinutes = MAX_ACCESS_MINUTES,
): Array<{ stop: Stop; minutes: Minute; metres: number }> {
  const out: Array<{ stop: Stop; minutes: Minute; metres: number }> = [];
  for (const stop of ctx.stops.values()) {
    const metres = metresBetween(at, stop.at) * DETOUR;
    const minutes = Math.max(1, Math.round(metres / WALK_PACE));
    if (minutes <= maxMinutes) out.push({ stop, minutes, metres: Math.round(metres) });
  }
  return out.sort((a, b) => a.minutes - b.minutes);
}

type Hop =
  | { kind: "origin" }
  | { kind: "walk"; fromStopId: string | null; toStopId: string | null;
      metres: number; minutes: Minute; path: LngLat[] }
  | { kind: "ride"; patternId: string; trip: Trip; fromIndex: number; toIndex: number };

interface Label { arrival: Minute; hop: Hop; prev: string | null; round: number }

/** One forward search. Returns the best label per stop per round. */
function raptor(ctx: PlanContext, origin: LngLat, departAfter: Minute, service: string,
                allowed: Set<string> | undefined,
                exactAccess?: ReadonlyMap<string, WalkingLeg>): Map<string, Label>[] {
  const rounds: Map<string, Label>[] = [new Map()];
  /* Best arrival *by bus*. Deliberately not seeded with the walk from the
     origin, though that is the textbook thing to do.
     Pruning against those walk times is sound arithmetic and the wrong answer
     here: this planner only ever returns journeys containing a ride, so a stop
     you could stroll to by 00:45 had every bus to it discarded as "no
     improvement" - and the rider was handed some worse itinerary that happened
     to reach a different stop. Dr. Office to Kaufland was the case that showed
     it: both kerbs at the far end sit exactly fifteen minutes' walk away, so
     the 06:49 arrival was never recorded and the only surviving option rode ten
     minutes further round the loop to land sixteen metres further from the
     door. Walking really is better there - but that is an answer to offer, not
     a reason to hide the buses. */
  const best = new Map<string, Minute>();

  if (exactAccess) {
    for (const [stopId, walk] of exactAccess) {
      if (!ctx.stops.has(stopId)) continue;
      rounds[0].set(stopId, {
        arrival: departAfter + walk.minutes, prev: null, round: 0,
        hop: { kind: "walk", fromStopId: null, toStopId: stopId, ...walk },
      });
    }
  } else {
    for (const { stop, minutes, metres } of stopsNear(ctx, origin)) {
      rounds[0].set(stop.id, {
        arrival: departAfter + minutes, prev: null, round: 0,
        hop: { kind: "walk", fromStopId: null, toStopId: stop.id, metres, minutes,
               path: [origin, stop.at] },
      });
    }
  }
  let marked = new Set(rounds[0].keys());

  for (let k = 1; k <= MAX_RIDES && marked.size; k++) {
    const here = new Map<string, Label>();
    rounds.push(here);

    // the earliest point on each pattern that a marked stop lets us join
    const entries = new Map<string, number>();
    for (const sid of marked) {
      for (const call of ctx.callsAt.get(sid) ?? []) {
        const p = ctx.patterns.get(call.patternId)!;
        if (allowed && allowed.size && !allowed.has(p.lineId)) continue;
        if (!ctx.tripsOf.get(p.id)?.some((t) => t.service === service)) continue;
        const cur = entries.get(call.patternId);
        if (cur === undefined || call.index < cur) entries.set(call.patternId, call.index);
      }
    }

    const improved = new Set<string>();
    for (const [patternId, start] of entries) {
      const p = ctx.patterns.get(patternId)!;
      let trip: Trip | null = null;
      let boardIndex = -1;

      for (let i = start; i < p.stopIds.length; i++) {
        const sid = p.stopIds[i];
        if (trip) {
          const arrival = trip.start + p.offsets[i];
          /* Two different questions, and they were being answered by one test.
             `best` decides whether this is worth exploring further; the round's
             own map decides what can be built from it. Tying them together
             meant a two-ride chain could not end at a stop a one-ride chain had
             already reached no later - so a rider who changed onto the 6 was
             put off it early and left with a ten-minute walk, while the same
             bus carried on to a stop two minutes from the door. The arrival was
             no better, but the journey was, and it could not be expressed. */
          const already = here.get(sid);
          if (!already || arrival < already.arrival) {
            here.set(sid, {
              arrival, prev: p.stopIds[boardIndex], round: k,
              hop: { kind: "ride", patternId, trip, fromIndex: boardIndex, toIndex: i },
            });
          }
          if (arrival < (best.get(sid) ?? Infinity)) {
            best.set(sid, arrival);
            improved.add(sid);      // only a genuine gain is worth expanding
          }
        }
        // can we board here, or catch an earlier trip than the one we are on?
        const prior = rounds[k - 1].get(sid);
        if (!prior) continue;
        const ready = prior.arrival + (prior.hop.kind === "ride" ? MIN_TRANSFER : 0);
        const candidate = ctx.tripsOf.get(patternId)
          ?.filter((t) => t.service === service)
          .find((t) => t.start + p.offsets[i] >= ready) ?? null;
        if (candidate) {
          if (!trip || candidate.start < trip.start) {
            trip = candidate;
            boardIndex = i;
          } else if (candidate.start === trip.start) {
            const curPrior = rounds[k - 1].get(p.stopIds[boardIndex]);
            const curIsWalk = curPrior?.hop.kind === "walk" && curPrior?.hop.fromStopId !== null;
            const newIsRide = prior.hop.kind === "ride";
            if (curIsWalk && newIsRide) {
              boardIndex = i;
            }
          }
        }
      }
    }

    // then walk between nearby stops - this is what makes opposite kerbs work
    for (const sid of [...improved]) {
      const from = here.get(sid)!;
      for (const w of ctx.walksFrom.get(sid) ?? []) {
        const minutes = Math.max(1, Math.round(w.seconds / 60));
        const arrival = from.arrival + MIN_TRANSFER + minutes;
        if (arrival < (best.get(w.to) ?? Infinity)) {
          best.set(w.to, arrival);
          here.set(w.to, {
            arrival, prev: sid, round: k,
            hop: { kind: "walk", fromStopId: sid, toStopId: w.to, metres: w.metres,
                   minutes, path: w.path },
          });
        }
      }
    }
    marked = new Set(here.keys());
  }
  return rounds;
}

function rebuild(rounds: Map<string, Label>[], stopId: string, round: number): Hop[] | null {
  const chain: Hop[] = [];
  let sid: string | null = stopId;
  let k = round;
  while (k >= 0 && sid) {
    const label: Label | undefined = rounds[k].get(sid);
    if (!label) return null;
    chain.unshift(label.hop);
    if (label.hop.kind === "walk" && label.hop.fromStopId === null) return chain;
    sid = label.prev;
    if (label.hop.kind === "ride") k--;
  }
  return chain.length ? chain : null;
}

/** Board at the last pass, not the first.
 *
 *  Several lines run a spur: out to a village and back the same way, so the
 *  bus calls at the same stop twice. Boarding on the first pass means riding
 *  the spur for nothing - same arrival, but the rider has to be at the stop
 *  earlier and sits through the detour. Moving the boarding to the last call
 *  before alighting is free: it cannot change when the journey ends.
 */
function boardLate(pattern: Pattern, fromIndex: number, toIndex: number): number {
  const stopId = pattern.stopIds[fromIndex];
  let best = fromIndex;
  for (let i = fromIndex + 1; i < toIndex; i++) {
    if (pattern.stopIds[i] === stopId) best = i;
  }
  return best;
}

/** Board at the call nearest the rider, not the first one the search reached.
 *
 *  RAPTOR joins a pattern at the earliest index that catches the trip, and only
 *  moves the boarding when a *strictly earlier* trip becomes catchable. On a
 *  route that doubles back that is wrong: line 3 runs down to Szotyor 2 and
 *  turns round, so someone standing at Szotyor 2 was sent 305 m up the road to
 *  Szotyor 1 to catch the bus that reaches them a minute later anyway.
 *
 *  Any later call on the same trip is free - the bus is at every downstream
 *  stop at the same minute either way - so re-seating can only shorten the walk
 *  and let the rider leave later. Ties go to the later index, which is what
 *  makes a stop the route calls at twice board on the second pass.
 */
function boardNearest(ctx: PlanContext, pattern: Pattern, fromIndex: number,
                      toIndex: number, origin: LngLat): number {
  let best = fromIndex;
  let shortest = Infinity;
  for (let i = fromIndex; i < toIndex; i++) {
    const stop = ctx.stops.get(pattern.stopIds[i]);
    if (!stop) continue;
    const metres = metresBetween(origin, stop.at);
    if (metres <= shortest) { best = i; shortest = metres; }
  }
  return best;
}

/** The walk from a point to a point, the way stopsNear measures it. */
function onFoot(from: LngLat, to: LngLat): { minutes: Minute; metres: number } {
  const metres = Math.round(metresBetween(from, to) * DETOUR);
  return { metres, minutes: Math.max(1, Math.round(metres / WALK_PACE)) };
}

/** The same journey, but staying on the bus to the stop nearest the door.
 *
 *  Round 0 seeds every walkable stop with the time you could reach it on foot,
 *  and the scan only records a ride that beats it. So when a stop near the
 *  destination is also walkable from the origin - slowly, but walkable - the
 *  ride to it is never written down, and the rider is dropped early and told to
 *  walk the rest. Unlike boarding later, riding further is not free: it arrives
 *  later, so this is offered alongside the original rather than replacing it,
 *  and the ranking decides which one a rider is shown first.
 */
function stayOn(ctx: PlanContext, chain: Hop[], destination: LngLat): Hop[] | null {
  const last = chain[chain.length - 1];
  if (last?.kind !== "ride") return null;
  const p = ctx.patterns.get(last.patternId);
  if (!p) return null;
  const here = ctx.stops.get(p.stopIds[last.toIndex]);
  if (!here) return null;
  /* Weighed, not just measured. Picking whichever later stop happens to be
     nearest the door is how a rider ends up riding ten minutes further round a
     loop to land sixteen metres closer - the minutes on the bus were never
     counted against the metres saved. Both are minutes; compare them. */
  const spend = (at: LngLat, extra: Minute) =>
    extra + (metresBetween(at, destination) * DETOUR) / WALK_PACE;
  let best = last.toIndex;
  let cheapest = spend(here.at, 0);
  for (let i = last.toIndex + 1; i < p.stopIds.length; i++) {
    const stop = ctx.stops.get(p.stopIds[i]);
    if (!stop) continue;
    const cost = spend(stop.at, p.offsets[i] - p.offsets[last.toIndex]);
    if (cost < cheapest) { best = i; cheapest = cost; }
  }
  if (best === last.toIndex) return null;
  return [...chain.slice(0, -1), { ...last, toIndex: best }];
}

function toJourney(ctx: PlanContext, chain: Hop[], destination: LngLat,
                   egress: WalkingLeg, at: LngLat,
                   exactEgress?: ReadonlyMap<string, WalkingLeg>,
                   preserveExactAccess = false): Journey | null {
  const legs: Leg[] = [];
  let depart = Infinity;
  let arrive = 0;
  let walkMinutes = 0;

  for (const hop of chain) {
    if (hop.kind === "walk") {
      walkMinutes += hop.minutes;
      const previous = legs[legs.length - 1];
      if (previous?.kind === "walk" && previous.toStopId === hop.fromStopId) {
        // The transfer graph may express one continuous pavement route through
        // two nearby stops. Keep its measured route, but present it as one walk
        // instead of telling the rider to walk to a stop and immediately walk on.
        previous.toStopId = hop.toStopId;
        previous.metres += hop.metres;
        previous.minutes += hop.minutes;
        previous.path = [...previous.path, ...hop.path.slice(1)];
      } else {
        legs.push({ kind: "walk", fromStopId: hop.fromStopId, toStopId: hop.toStopId,
                    metres: hop.metres, minutes: hop.minutes, path: hop.path });
      }
    } else if (hop.kind === "ride") {
      const p = ctx.patterns.get(hop.patternId)!;
      let fromIndex = boardLate(p, hop.fromIndex, hop.toIndex);
      const access = legs.length === 1 && legs[0].kind === "walk"
        && legs[0].fromStopId === null ? legs[0] : null;
      if (access && !preserveExactAccess) {
        fromIndex = boardNearest(ctx, p, hop.fromIndex, hop.toIndex, access.path[0]);
        const stop = ctx.stops.get(p.stopIds[fromIndex])!;
        const metres = Math.round(metresBetween(access.path[0], stop.at) * DETOUR);
        const minutes = Math.max(1, Math.round(metres / WALK_PACE));
        walkMinutes += minutes - access.minutes;
        legs[0] = { ...access, toStopId: stop.id, metres, minutes,
                    path: [access.path[0], stop.at] };
      }
      const board = hop.trip.start + p.offsets[fromIndex];
      const alight = hop.trip.start + p.offsets[hop.toIndex];
      depart = Math.min(depart, board);
      arrive = Math.max(arrive, alight);
      legs.push({ kind: "ride", lineId: p.lineId, patternId: p.id,
                  fromIndex, toIndex: hop.toIndex, board, alight });
    }
  }
  if (!legs.some((l) => l.kind === "ride")) return null;

  for (const leg of legs) {
    if (leg.kind === "ride") {
      // A loop may revisit a named place later on the same vehicle.  Its call
      // order is the proof of progress; station labels are not.
      if (leg.fromIndex >= leg.toIndex) return null;
    }
  }

  /* A chain can end with a transfer walk that no ride follows: the search
     reached the egress stop on foot from wherever the bus actually dropped the
     rider. Putting the walk to the door on top of that sends them via a second
     stop for nothing - "get off here, walk to that stop, then walk on" - and by
     the triangle inequality going straight there is never further. The search
     can stack two of these, so this unwinds every one of them. */
  let off = at;
  let door = egress;
  for (let tail = legs[legs.length - 1];
       tail.kind === "walk" && tail.fromStopId !== null;
       tail = legs[legs.length - 1]) {
    const dropped = ctx.stops.get(tail.fromStopId);
    if (!dropped) break;
    legs.pop();                       // a ride is guaranteed, so this terminates
    walkMinutes -= tail.minutes;
    off = dropped.at;
    const exact = exactEgress?.get(tail.fromStopId);
    if (exact) door = exact;
    else {
      const metres = Math.round(metresBetween(off, destination) * DETOUR);
      door = { metres, minutes: Math.max(1, Math.round(metres / WALK_PACE)),
               path: [off, destination] };
    }
  }

  // the access walk has to finish before the first bus, not start at it
  const access = legs[0].kind === "walk" ? legs[0].minutes : 0;
  walkMinutes += door.minutes;
  legs.push({ kind: "walk", fromStopId: null, toStopId: null, metres: door.metres,
              minutes: door.minutes, path: door.path });

  return {
    legs,
    depart: depart - access,
    arrive: arrive + door.minutes,
    walkMinutes,
    transfers: legs.filter((l) => l.kind === "ride").length - 1,
  };
}

/** Remove a physically pointless same-line reversal from an already valid trip.
 *
 * A route may first reach a platform travelling away from the useful direction,
 * cross at the next stop, then catch the same line back through a platform the
 * rider could have reached directly.  That is timetable-valid, but it is not a
 * useful itinerary: entering the second vehicle at that later platform keeps
 * every downstream call and drops a bus ride and a transfer.  Platform IDs and
 * measured OSM access paths are the proof; display names play no part here.
 */
export function removeNoProgressLoops(ctx: PlanContext, journey: Journey,
                                      request: PlanRequest,
                                      walking: WalkingContext): Journey {
  for (let firstIndex = 0; firstIndex < journey.legs.length; firstIndex++) {
    const first = journey.legs[firstIndex];
    if (first.kind !== "ride") continue;

    let secondIndex = firstIndex + 1;
    while (journey.legs[secondIndex]?.kind === "walk") secondIndex++;
    const second = journey.legs[secondIndex];
    if (second?.kind !== "ride" || second.lineId !== first.lineId) continue;

    const pattern = ctx.patterns.get(second.patternId);
    if (!pattern) continue;
    const tripStart = second.board - pattern.offsets[second.fromIndex];
    const candidates: Array<{ index: number; board: Minute; depart: Minute;
                              access: WalkingLeg }> = [];
    for (let index = second.fromIndex; index < second.toIndex; index++) {
      const access = walking.access.get(pattern.stopIds[index]);
      if (!access) continue;
      const board = tripStart + pattern.offsets[index];
      const depart = board - access.minutes;
      if (request.mode === "departAt" && depart < request.time) continue;
      if (request.mode === "arriveBy" && depart < 0) continue;
      // This is a normalization only when it is demonstrably no worse: same
      // downstream vehicle, and the door can be left at least as late.
      if (depart < journey.depart) continue;
      candidates.push({ index, board, depart, access });
    }
    candidates.sort((a, b) => b.depart - a.depart || a.access.minutes - b.access.minutes);
    const chosen = candidates[0];
    if (!chosen) continue;

    const legs: Leg[] = [
      { kind: "walk", fromStopId: null, toStopId: pattern.stopIds[chosen.index],
        metres: chosen.access.metres, minutes: chosen.access.minutes,
        path: chosen.access.path },
      { ...second, fromIndex: chosen.index, board: chosen.board },
      ...journey.legs.slice(secondIndex + 1),
    ];
    const rides = legs.filter((leg): leg is RideLeg => leg.kind === "ride");
    return {
      legs,
      depart: chosen.depart,
      arrive: journey.arrive,
      walkMinutes: legs.reduce((total, leg) => total + (leg.kind === "walk" ? leg.minutes : 0), 0),
      transfers: rides.length - 1,
    };
  }
  return journey;
}

const signature = (ctx: PlanContext, j: Journey) =>
  [j.depart, j.arrive,
   j.legs.filter((l): l is RideLeg => l.kind === "ride").map((l) => l.lineId).join(">")].join("|");

/** What a journey costs the person taking it, in minutes they mind.
 *
 *  The slider names a trade - sooner against less walking - so it has to move
 *  both sides of it. Scaling only the walking term left the far end unable to
 *  win an argument: a minute on foot was worth two and a half, but a bus half
 *  an hour later still cost a full thirty, so the quicker itinerary came first
 *  wherever the slider was put. At "less walking" a third of all queries still
 *  led with something that walked further than an alternative on the same list.
 *
 *  Time never falls to nothing. Someone who would rather not walk still would
 *  rather not wait an hour, and a slider that ignored the clock entirely would
 *  answer a question nobody asked.
 */
export function generalisedCost(j: Journey, req: PlanRequest): number {
  const rather = req.walkAversion;              // 0 = get me there, 1 = spare my legs
  const timeWeight = 1 - rather * 0.85;
  const walkWeight = 0.3 + rather * 4.7;
  const spent = req.mode === "departAt" ? j.arrive - req.time : req.time - j.depart;
  return spent * timeWeight + j.walkMinutes * walkWeight;
}

/** Drop journeys that another one beats on every count.
 *
 *  Riding to the terminus and walking 115 m back is a real itinerary, and it is
 *  never the one you want when the same bus, from the same stop, put you at the
 *  door a minute earlier. Offering both invites the reader to work out which is
 *  which. A journey survives only if nothing else leaves no earlier, arrives no
 *  later and walks no further - with at least one of those strictly better.
 */
function undominated(journeys: Journey[]): Journey[] {
  return journeys.filter((one) => !journeys.some((other) =>
    other !== one
    && other.depart >= one.depart
    && other.arrive <= one.arrive
    && other.walkMinutes <= one.walkMinutes
    && other.transfers <= one.transfers
    && (other.depart > one.depart || other.arrive < one.arrive
        || other.walkMinutes < one.walkMinutes || other.transfers < one.transfers)));
}

/** Just walk.
 *
 *  Sometimes it is the answer, and until now the planner could not say so: it
 *  only ever returned journeys with a bus in them, so a trip of one kilometre
 *  at half past midnight came back as "wait four hours for the first bus".
 *  Ranked against the rest on the same terms - the generalised cost already
 *  weighs minutes walked against minutes saved - so it wins when it deserves to
 *  and sits at the bottom when it does not.
 */
function onFootAlone(req: PlanRequest): Journey | null {
  const metres = Math.round(metresBetween(req.from, req.to) * DETOUR);
  const minutes = Math.max(1, Math.round(metres / WALK_PACE));
  if (minutes > MAX_DIRECT_WALK) return null;
  const depart = req.mode === "departAt" ? req.time : req.time - minutes;
  return {
    legs: [{ kind: "walk", fromStopId: null, toStopId: null, metres, minutes,
             path: [req.from, req.to] }],
    depart, arrive: depart + minutes, walkMinutes: minutes, transfers: 0,
  };
}

export function plan(ctx: PlanContext, req: PlanRequest, limit = 8): Journey[] {
  const egressStops = new Map(
    stopsNear(ctx, req.to).map((e) => [e.stop.id, {
      metres: e.metres, minutes: e.minutes, path: [e.stop.at, req.to],
    }]),
  );
  if (!egressStops.size) return [];

  /* One RAPTOR run returns the quickest arrival for each number of rides - one
     or two journeys, not a list. Riders want the next several departures, so we
     sweep: forwards for "leave at", backwards for the two arrive-by modes. */
  const step = 10, span = 120;
  const starts: Minute[] = req.mode === "departAt"
    ? Array.from({ length: span / step + 1 }, (_, i) => req.time + i * step)
    : Array.from({ length: span / step + 1 }, (_, i) => req.time - span + i * step)
        .filter((m) => m >= 0);

  const found = new Map<string, Journey>();
  for (const start of starts) {
    const rounds = raptor(ctx, req.from, start, req.service, req.lines);
    for (let k = 1; k < rounds.length; k++) {
      for (const sid of rounds[k].keys()) {
        const eg = egressStops.get(sid);
        if (!eg) continue;
        const chain = rebuild(rounds, sid, k);
        if (!chain) continue;
        const further = stayOn(ctx, chain, req.to);
        const options: Array<[Hop[], WalkingLeg, LngLat]> =
          [[chain, eg, ctx.stops.get(sid)!.at]];
        if (further) {
          const end = further[further.length - 1];
          if (end.kind === "ride") {
            const at = ctx.stops.get(
              ctx.patterns.get(end.patternId)!.stopIds[end.toIndex])!.at;
            const estimated = onFoot(at, req.to);
            const walk: WalkingLeg = { ...estimated, path: [at, req.to] };
            if (walk.minutes <= MAX_ACCESS_MINUTES) options.push([further, walk, at]);
          }
        }
        for (const [hops, walk, at] of options) {
          const j = toJourney(ctx, hops, req.to, walk, at);
          if (!j) continue;
          if (req.mode !== "departAt" && j.arrive > req.time) continue;
          const key = signature(ctx, j);
          const prev = found.get(key);
          if (!prev || j.walkMinutes < prev.walkMinutes) found.set(key, j);
        }
      }
    }
  }

  /* Added after the sweep, not during it: it has no stop to be found at, and
     it must not be dropped by a bus itinerary that happens to walk less. */
  const afoot = onFootAlone(req);
  const all = undominated([...found.values()]);
  if (afoot) all.push(afoot);
  all.sort((a, b) =>
    generalisedCost(a, req) - generalisedCost(b, req) ||
    (a.arrive - a.depart) - (b.arrive - b.depart));

  /* One row per itinerary, not per departure of it.
     The same buses between the same stops an hour apart is one answer to the
     question "how do I get there", and listing it four times spent the whole
     list on it before any other route appeared. Which departure to catch is a
     second question, and the itinerary answers it once opened - the boarding
     stop carries the next few times of that line. Ranked first, so the one
     kept is the one that would have led anyway. */
  const shapes = new Set<string>();
  const distinct: Journey[] = [];
  for (const journey of all) {
    const shape = journey.legs
      .filter((l): l is RideLeg => l.kind === "ride")
      .map((l) => `${l.patternId}:${l.fromIndex}>${l.toIndex}`).join("+") || "walk";
    if (shapes.has(shape)) continue;
    shapes.add(shape);
    distinct.push(journey);
  }
  return distinct.slice(0, limit);
}

/** Plan only from pedestrian routes that have already been found on a real
 * walkable network.  Unlike the legacy `plan` entry point, this function never
 * measures a straight line or mutates a walk after choosing an itinerary. */
export function planWithWalking(ctx: PlanContext, req: PlanRequest,
                                walking: WalkingContext, limit = 8): Journey[] {
  if (!walking.access.size || !walking.egress.size) return [];

  const step = 10, span = 120;
  const starts: Minute[] = req.mode === "departAt"
    ? Array.from({ length: span / step + 1 }, (_, i) => req.time + i * step)
    : Array.from({ length: span / step + 1 }, (_, i) => req.time - span + i * step)
        .filter((m) => m >= 0);

  const found = new Map<string, Journey>();
  for (const start of starts) {
    const rounds = raptor(ctx, req.from, start, req.service, req.lines, walking.access);
    for (let k = 1; k < rounds.length; k++) {
      for (const sid of rounds[k].keys()) {
        const egress = walking.egress.get(sid);
        const stop = ctx.stops.get(sid);
        if (!egress || !stop) continue;
        const chain = rebuild(rounds, sid, k);
        if (!chain) continue;
        const candidate = toJourney(ctx, chain, req.to, egress, stop.at,
                                    walking.egress, true);
        if (!candidate) continue;
        const journey = removeNoProgressLoops(ctx, candidate, req, walking);
        if (req.mode !== "departAt" && journey.arrive > req.time) continue;
        const key = signature(ctx, journey);
        const previous = found.get(key);
        if (!previous || journey.walkMinutes < previous.walkMinutes) found.set(key, journey);
      }
    }
  }

  const all = undominated([...found.values()]);
  if (walking.direct && walking.direct.minutes <= MAX_DIRECT_WALK) {
    const depart = req.mode === "departAt" ? req.time : req.time - walking.direct.minutes;
    all.push({
      legs: [{ kind: "walk", fromStopId: null, toStopId: null, ...walking.direct }],
      depart, arrive: depart + walking.direct.minutes,
      walkMinutes: walking.direct.minutes, transfers: 0,
    });
  }
  all.sort((a, b) =>
    generalisedCost(a, req) - generalisedCost(b, req) ||
    (a.arrive - a.depart) - (b.arrive - b.depart));

  const shapes = new Set<string>();
  return all.filter((journey) => {
    const shape = journey.legs.filter((l): l is RideLeg => l.kind === "ride")
      .map((l) => `${l.patternId}:${l.fromIndex}>${l.toIndex}`).join("+") || "walk";
    if (shapes.has(shape)) return false;
    shapes.add(shape);
    return true;
  }).slice(0, limit);
}

/** The next few departures of one line from one stop.
 *
 *  What a rider standing at a stop actually wants to know, and the one thing a
 *  printed timetable gives you that a single suggested journey does not: if you
 *  miss this bus, when is the next one. Especially at a change, where the wait
 *  is the part you can feel.
 */
export function nextDepartures(
  ctx: PlanContext, stopId: string, lineId: string,
  after: Minute, service: ServiceId, limit = 4,
): Minute[] {
  const times = new Set<Minute>();
  for (const call of ctx.callsAt.get(stopId) ?? []) {
    const pattern = ctx.patterns.get(call.patternId);
    if (!pattern || pattern.lineId !== lineId) continue;
    for (const trip of ctx.tripsOf.get(pattern.id) ?? []) {
      if (trip.service !== service) continue;
      const departs = trip.start + pattern.offsets[call.index];
      if (departs > after) times.add(departs);
    }
  }
  return [...times].sort((a, b) => a - b).slice(0, limit);
}

/** One line's calls at one stop, for a whole service day. */
export interface StopBoard {
  lineId: string;
  patternId: string;
  /** Where this run is headed, which is how a rider tells directions apart. */
  headsign: { ro: string; hu: string };
  /** Every minute of the day this line calls here, sorted. */
  times: Minute[];
  /** False when the operator publishes no time for this stop and we
   *  interpolated it from its neighbours. */
  published: boolean;
  /** The run ends here. You can get off, but there is nothing to board. */
  terminates: boolean;
  /** The very next stop this run calls at.
   *
   *  On a circular route the headsign is the same in both directions - line 3
   *  is signed "Str. Țigaretei – traseu circular" whichever way round it is
   *  going - so two passes through the same stop read as two identical rows.
   *  The stop it leaves for is the only thing that tells them apart. */
  towards: string | null;
}

/** What a rider standing at a stop wants on a board: every line that calls
 *  here, each with its own column of times.
 *
 *  Built from the patterns rather than from `callsAt`, which deliberately drops
 *  the last stop of every run because you cannot board there. That is the right
 *  rule for planning and the wrong one here: a terminus is exactly where
 *  somebody waits to be collected, and the arrival is the only time it has.
 */
export function boardAt(ctx: PlanContext, stopId: string,
                        service: ServiceId): StopBoard[] {
  const boards: StopBoard[] = [];
  for (const pattern of ctx.net.patterns) {
    pattern.stopIds.forEach((sid, index) => {
      if (sid !== stopId) return;
      const times: Minute[] = [];
      for (const trip of ctx.tripsOf.get(pattern.id) ?? []) {
        if (trip.service === service) times.push(trip.start + pattern.offsets[index]);
      }
      if (!times.length) return;
      boards.push({
        lineId: pattern.lineId, patternId: pattern.id, headsign: pattern.headsign,
        times: times.sort((a, b) => a - b),
        published: pattern.published[index],
        terminates: index === pattern.stopIds.length - 1,
        towards: pattern.stopIds[index + 1] ?? null,
      });
    });
  }
  /* Keep distinct loop passes apart, but do not render duplicate timetable
     columns when separately reconstructed patterns leave for the same place. */
  const merged = new Map<string, StopBoard>();
  for (const board of boards) {
    const key = [board.lineId, board.headsign.ro, board.headsign.hu,
      board.towards ?? "", board.terminates, board.published].join("|");
    const previous = merged.get(key);
    if (!previous) {
      merged.set(key, board);
      continue;
    }
    previous.times = [...new Set([...previous.times, ...board.times])]
      .sort((a, b) => a - b);
  }
  return [...merged.values()].sort((a, b) =>
    a.lineId.localeCompare(b.lineId, "en", { numeric: true })
    || (a.times[0] ?? 0) - (b.times[0] ?? 0));
}

/** One run's whole day, as the grid a printed timetable uses. */
export interface Timetable {
  patternId: string;
  lineId: string;
  headsign: { ro: string; hu: string };
  stopIds: string[];
  /** Per stop: whether the operator publishes its times or we worked them out. */
  published: boolean[];
  /** One row per departure, one column per stop, in the order they are called. */
  runs: Minute[][];
}

export function timetable(ctx: PlanContext, patternId: string,
                          service: ServiceId): Timetable | null {
  const pattern = ctx.patterns.get(patternId);
  if (!pattern) return null;
  const runs = (ctx.tripsOf.get(patternId) ?? [])
    .filter((trip) => trip.service === service)
    .sort((a, b) => a.start - b.start)
    .map((trip) => pattern.offsets.map((offset) => trip.start + offset));
  return {
    patternId, lineId: pattern.lineId, headsign: pattern.headsign,
    stopIds: pattern.stopIds, published: pattern.published, runs,
  };
}
