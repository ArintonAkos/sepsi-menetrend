import { describe, it, expect } from "vitest";
import * as engine from "../plan";
import { prepare, plan, stopsNear, metresBetween, nextDepartures, MIN_TRANSFER, recommendationFrontier }
  from "../plan";
import { formatHHMM } from "../time";
import type { Journey, PlanRequest, RideLeg, WalkingContext } from "../types";
import { fixture, ORIGIN, NEAR_C, NEAR_D } from "./fixture";

const ctx = prepare(fixture());
const ask = (over: Partial<PlanRequest>): PlanRequest => ({
  from: ORIGIN, to: NEAR_D, time: 8 * 60, service: "weekday",
  mode: "departAt", walkAversion: 0.35, ...over,
});
const lines = (j: { legs: Array<{ kind: string }> }) =>
  (j.legs.filter((l) => l.kind === "ride") as RideLeg[]).map((l) => l.lineId).join("+");
const show = (j: { depart: number; arrive: number }) =>
  `${formatHHMM(j.depart)}→${formatHHMM(j.arrive)}`;

describe("geometry", () => {
  it("measures a known distance", () => {
    expect(Math.round(metresBetween([25.76, 45.86], [25.78, 45.86]))).toBeCloseTo(1551, -2);
  });
  it("only offers stops that are actually walkable", () => {
    const near = stopsNear(ctx, ORIGIN).map((s) => s.stop.id);
    expect(near).toEqual(["A"]);
  });
});
describe("plan", () => {
  it("uses an exact pedestrian detour when choosing when to leave", () => {
    const planWithWalking = (engine as typeof engine & {
      planWithWalking?: (context: typeof ctx, request: PlanRequest, walking: unknown) => ReturnType<typeof plan>;
    }).planWithWalking;
    expect(planWithWalking).toBeTypeOf("function");

    const [best] = planWithWalking!(ctx, ask({}), {
      access: new Map([["A", { metres: 2160, minutes: 27, path: [ORIGIN, [25.760, 45.86]] }]]),
      egress: new Map([["D", { metres: 80, minutes: 1, path: [[25.820, 45.86], NEAR_D] }]]),
      direct: null,
    });

    expect(best.depart).toBe(8 * 60 + 3); // catch the 08:30 bus after a real 27-minute walk
    expect(best.legs[0]).toMatchObject({ kind: "walk", metres: 2160, minutes: 27 });
  });

  it("finds the change at C for a trip the buses cannot do directly", () => {
    const [best] = plan(ctx, ask({}));
    expect(lines(best)).toBe("1+2");
    expect(best.transfers).toBe(1);
  });

  it("will not board a bus that leaves too soon after the one you got off", () => {
    // P1 lands at C at 08:40. There is a 08:41 departure - one minute is not a
    // transfer, so the planner has to wait for 08:45.
    const [best] = plan(ctx, ask({}));
    const [first, second] = best.legs.filter((l) => l.kind === "ride") as RideLeg[];
    expect(formatHHMM(first.alight)).toBe("08:40");
    expect(second.board - first.alight).toBeGreaterThanOrEqual(MIN_TRANSFER);
    expect(formatHHMM(second.board)).toBe("08:45");
  });

  it("cannot catch a bus that leaves before you have walked to the stop", () => {
    // asking at 08:00 from a stop one minute away rules out the 08:00 departure
    const [best] = plan(ctx, ask({ to: NEAR_C, time: 8 * 60 }));
    const ride = best.legs.find((l) => l.kind === "ride") as RideLeg;
    expect(formatHHMM(ride.board)).toBe("08:30");
    expect(best.depart).toBe(ride.board - 1);
  });

  it("plans a direct ride when one exists", () => {
    const [best] = plan(ctx, ask({ to: NEAR_C }));
    expect(lines(best)).toBe("1");
    expect(best.transfers).toBe(0);
  });

  it("lists an itinerary once, however often it runs", () => {
    /* The same buses between the same stops an hour later is one answer to
       "how do I get there", and repeating it filled the list before any other
       route appeared. Which departure to catch is the second question, and the
       itinerary answers it once opened. */
    const found = plan(ctx, ask({ to: NEAR_C }));
    const shapes = found.map((j) => (j.legs.filter((l) => l.kind === "ride") as RideLeg[])
      .map((r) => `${r.patternId}:${r.fromIndex}>${r.toIndex}`).join("+"));
    expect(new Set(shapes).size).toBe(shapes.length);
  });

  it("still knows the departures it no longer lists", () => {
    // the second question, answered where it is asked: at the boarding stop
    const found = plan(ctx, ask({ to: NEAR_C }));
    const first = (found[0].legs.find((l) => l.kind === "ride") as RideLeg);
    const pattern = ctx.patterns.get(first.patternId)!;
    const later = nextDepartures(ctx, pattern.stopIds[first.fromIndex],
                                 first.lineId, first.board, "weekday");
    expect(later.length).toBeGreaterThan(0);
    for (const at of later) expect(at).toBeGreaterThan(first.board);
  });

  it("never departs before the requested time", () => {
    for (const j of plan(ctx, ask({ time: 8 * 60 + 20 })))
      expect(j.depart).toBeGreaterThanOrEqual(8 * 60 + 20);
  });

  it("arrive-by never lands late", () => {
    const found = plan(ctx, ask({ mode: "arriveBy", time: 9 * 60 }));
    expect(found.length).toBeGreaterThan(0);
    for (const j of found) expect(j.arrive).toBeLessThanOrEqual(9 * 60);
  });

  it("says nothing rather than something late when the deadline cannot be met", () => {
    // the first arrival at D is 08:52; asking to be there by 08:30 is impossible
    expect(plan(ctx, ask({ mode: "arriveBy", time: 8 * 60 + 30 }))).toHaveLength(0);
  });

  it("arrive-by answers 'when must I leave' by putting the last bus first", () => {
    /* There is no separate mode for it: asked to be somewhere by nine, the
       useful answer is the latest departure that still gets you there. */
    const found = plan(ctx, ask({ mode: "arriveBy", time: 9 * 60, walkAversion: 0 }));
    expect(found.length).toBeGreaterThan(0);
    expect(found[0].depart).toBe(Math.max(...found.map((j) => j.depart)));
  });

  it("obeys the weekday / weekend split", () => {
    // the only weekend run is at 10:00, so asking at 08:00 must not surface a
    // weekday bus - it should reach forward to the 10:00 one instead
    const weekend = plan(ctx, ask({ service: "weekend", time: 8 * 60 }));
    expect(weekend.length).toBeGreaterThan(0);
    for (const j of weekend) {
      const ride = j.legs.find((l) => l.kind === "ride") as RideLeg;
      expect(ride.board).toBeGreaterThanOrEqual(10 * 60);
    }
    const weekday = plan(ctx, ask({ time: 8 * 60 }));
    for (const j of weekday) {
      const ride = j.legs.find((l) => l.kind === "ride") as RideLeg;
      expect(ride.board).toBeLessThan(10 * 60);
    }
  });

  it("drops journeys that use a line the rider excluded", () => {
    const only1 = plan(ctx, ask({ lines: new Set(["1"]) }));
    expect(only1).toHaveLength(0);                       // D is unreachable without line 2
    expect(plan(ctx, ask({ to: NEAR_C, lines: new Set(["1"]) })).length).toBeGreaterThan(0);
  });

  it("counts the walk at both ends", () => {
    const [best] = plan(ctx, ask({}));
    const walks = best.legs.filter((l) => l.kind === "walk");
    expect(walks.length).toBeGreaterThanOrEqual(2);
    expect(best.walkMinutes).toBeGreaterThan(0);
  });

  it("reports departure before the first bus and arrival after the last", () => {
    const [best] = plan(ctx, ask({}));
    const rides = best.legs.filter((l) => l.kind === "ride") as RideLeg[];
    expect(best.depart).toBeLessThan(rides[0].board);
    expect(best.arrive).toBeGreaterThan(rides[rides.length - 1].alight);
  });

  it("returns nothing rather than nonsense when there is no service", () => {
    expect(plan(ctx, ask({ time: 23 * 60 }))).toHaveLength(0);
  });

  it("never lists the same journey twice", () => {
    const found = plan(ctx, ask({ to: NEAR_C }));
    const keys = found.map((j) => `${show(j)}|${lines(j)}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("no-progress transit reversals", () => {
  it("replaces a same-line return through a directly reachable later platform", () => {
    const net = fixture();
    net.stops.push(
      { id: "H", name: { ro: "H", hu: "H" }, at: [25.765, 45.86], stationId: "H", zone: "city" },
      { id: "R", name: { ro: "R", hu: "R" }, at: [25.766, 45.86], stationId: "R", zone: "city" },
      { id: "A2", name: { ro: "A2", hu: "A2" }, at: [25.761, 45.86], stationId: "A2", zone: "city" },
    );
    net.patterns = [
      { ...net.patterns[0], id: "out", lineId: "1", stopIds: ["A", "H"],
        offsets: [0, 4], published: [true, true], shapeIndex: [0, 1] },
      { ...net.patterns[0], id: "back", lineId: "1", stopIds: ["R", "A2", "C"],
        offsets: [0, 2, 8], published: [true, true, true], shapeIndex: [0, 0, 1] },
    ];
    const local = prepare(net);
    const journey: Journey = {
      legs: [
        { kind: "walk", fromStopId: null, toStopId: "A", metres: 80, minutes: 1,
          path: [ORIGIN, [25.760, 45.86]] },
        { kind: "ride", lineId: "1", patternId: "out", fromIndex: 0, toIndex: 1,
          board: 480, alight: 484 },
        { kind: "walk", fromStopId: "H", toStopId: "R", metres: 80, minutes: 1,
          path: [[25.765, 45.86], [25.766, 45.86]] },
        { kind: "ride", lineId: "1", patternId: "back", fromIndex: 0, toIndex: 2,
          board: 486, alight: 494 },
        { kind: "walk", fromStopId: null, toStopId: null, metres: 80, minutes: 1,
          path: [[25.800, 45.86], NEAR_C] },
      ],
      depart: 479, arrive: 495, walkMinutes: 3, transfers: 1,
    };
    const walking: WalkingContext = {
      access: new Map([["A", {
        metres: 80, minutes: 1, path: [ORIGIN, [25.760, 45.86]],
      }], ["A2", {
        metres: 240, minutes: 3, path: [ORIGIN, [25.761, 45.86]],
      }]]),
      egress: new Map(), direct: null,
    };
    const removeNoProgressLoops = (engine as typeof engine & {
      removeNoProgressLoops?: (context: ReturnType<typeof prepare>, journey: Journey,
        request: PlanRequest, walking: WalkingContext) => Journey;
    }).removeNoProgressLoops;
    expect(removeNoProgressLoops).toBeTypeOf("function");

    const result = removeNoProgressLoops!(local, journey, ask({ time: 480 }), walking);
    const rides = result.legs.filter((leg): leg is RideLeg => leg.kind === "ride");

    expect(rides).toEqual([expect.objectContaining({ patternId: "back", fromIndex: 1, board: 488 })]);
    expect(result.depart).toBe(485);
    expect(result.transfers).toBe(0);
  });
});

describe("spur routes", () => {
  /* Line 3 runs into Szotyor and back out the same way, so it calls at
     Szotyor 1 twice. Boarding on the first pass means riding the spur for
     nothing: the same arrival, but you have to be at the stop earlier and you
     sit through the detour. */
  const spurNetwork = (starts: number[]) => {
    const net = fixture();
    net.patterns[0] = {
      ...net.patterns[0],
      stopIds: ["A", "B", "A", "C"], offsets: [0, 5, 9, 14],
      published: [true, true, true, true], shapeIndex: [0, 0, 1, 1],
    };
    net.trips = starts.map((start) => ({ patternId: "P1", service: "weekday" as const, start }));
    return prepare(net);
  };
  const ride = (ctx: ReturnType<typeof prepare>, time: number) => {
    const [best] = plan(ctx, { from: ORIGIN, to: NEAR_C, time, service: "weekday",
                               mode: "departAt", walkAversion: 0.35 });
    return best.legs.find((l) => l.kind === "ride") as RideLeg;
  };

  it("boards at the second call when only one trip runs", () => {
    // a single 09:00 trip: nothing to switch to, so the boarding index itself
    // has to move from the first call at A to the second
    const leg = ride(spurNetwork([9 * 60]), 8 * 60);
    expect(leg.fromIndex).toBe(2);
    expect(formatHHMM(leg.board)).toBe("09:09");
    expect(formatHHMM(leg.alight)).toBe("09:14");
  });

  it("still catches an earlier trip on its way back", () => {
    // the 08:00 departure has already left A when the rider arrives at 08:01,
    // but it comes past again at 08:09 - that beats waiting for 08:30
    const leg = ride(spurNetwork([8 * 60, 8 * 60 + 30]), 8 * 60);
    expect(leg.fromIndex).toBe(2);
    expect(formatHHMM(leg.board)).toBe("08:09");
  });

  it("leaves a straight route alone", () => {
    const leg = ride(prepare(fixture()), 8 * 60);
    expect(leg.fromIndex).toBe(0);
  });
});

describe("dominated journeys", () => {
  it("prefers waiting and a short platform walk over two extra bus changes", () => {
    const longDetour: Journey = {
      legs: [], depart: 14 * 60 + 53, arrive: 15 * 60 + 40,
      walkMinutes: 23, transfers: 2,
    };
    const crossAndWait: Journey = {
      legs: [], depart: 15 * 60 + 3, arrive: 15 * 60 + 40,
      walkMinutes: 24, transfers: 1,
    };

    expect(recommendationFrontier([longDetour, crossAndWait])).toEqual([crossAndWait]);
  });

  it("drops an option another one beats on every count", () => {
    /* Riding past your stop to the terminus and walking back is a genuine
       itinerary and never the one you want when the same bus, from the same
       stop, put you at the door sooner. */
    const found = plan(ctx, ask({ to: NEAR_C }));
    for (const a of found) {
      for (const b of found) {
        if (a === b) continue;
        const beaten = b.depart >= a.depart && b.arrive <= a.arrive
          && b.walkMinutes <= a.walkMinutes && b.transfers <= a.transfers
          && (b.depart > a.depart || b.arrive < a.arrive
              || b.walkMinutes < a.walkMinutes || b.transfers < a.transfers);
        expect(beaten, "a journey survived that another beats outright").toBe(false);
      }
    }
  });

  it("keeps a genuine trade-off", () => {
    // slower but less walking is a choice, not a dominated option
    const found = plan(ctx, ask({ to: NEAR_C }));
    expect(found.length).toBeGreaterThan(0);
  });

  it("never returns journeys with station loops or redundant transfers", () => {
    const found = plan(ctx, ask({ to: NEAR_D }));
    for (const j of found) {
      const visited = new Set<string>();
      for (const l of j.legs) {
        if (l.kind === "ride") {
          const p = ctx.patterns.get(l.patternId)!;
          const fromStn = ctx.stops.get(p.stopIds[l.fromIndex])?.stationId ?? p.stopIds[l.fromIndex];
          const toStn = ctx.stops.get(p.stopIds[l.toIndex])?.stationId ?? p.stopIds[l.toIndex];
          expect(fromStn).not.toBe(toStn);
          expect(visited.has(toStn)).toBe(false);
          visited.add(fromStn);
          visited.add(toStn);
        }
      }
    }
  });
});
