/** End-to-end against the real feed. The synthetic fixture proves the rules;
 *  this proves they still hold on 97 stops, 16 patterns and 498 trips. */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prepare, plan, stopsNear, nextDepartures, metresBetween as metres,
         type PlanContext } from "../plan";
import { countTickets } from "../fares";
import { formatHHMM } from "../time";
import type { LngLat, Network, PlanRequest, RideLeg, Stop } from "../types";

let net: Network, ctx: PlanContext, byName: Map<string, Stop>;

beforeAll(() => {
  net = JSON.parse(readFileSync(
    resolve(import.meta.dirname, "../../../public/data/network.json"), "utf8"));
  ctx = prepare(net);
  byName = new Map();
  for (const s of net.stops) if (!byName.has(s.name.ro)) byName.set(s.name.ro, s);
});

const at = (name: string) => {
  const s = byName.get(name);
  if (!s) throw new Error(`no stop called ${name}`);
  return s.at;
};
const ask = (from: string, to: string, over: Partial<PlanRequest> = {}): PlanRequest => ({
  from: at(from), to: at(to), time: 8 * 60 + 30, service: "weekday",
  mode: "departAt", walkAversion: 0.35, ...over,
});
/** A spread of real origins and destinations to sweep the planner over. */
const pairs = (): Array<[string, string]> => {
  const ends = ["Gara CFR", "Arena Sepsi", "Str. Ciucului 1", "Coșeni 2", "Șugaș Băi",
                "Centru Arcuș", "Spitalul Județean", "Piața Kálvin"];
  const out: Array<[string, string]> = [];
  for (const a of ends) {
    // a typo here would silently shrink the sweep to nothing
    if (!byName.has(a)) throw new Error(`no stop called ${a}`);
    for (const b of ends) if (a !== b) out.push([a, b]);
  }
  return out;
};
const rides = (j: { legs: Array<{ kind: string }> }) =>
  j.legs.filter((l) => l.kind === "ride") as RideLeg[];

describe("the real network", () => {
  it("loaded", () => {
    expect(net.stops).toHaveLength(97);              // real platforms, not guessed kerbs
    expect(net.stations).toHaveLength(97);
    expect(net.walks).toHaveLength(104);             // every cached physical-platform walk
    expect(net.lines).toHaveLength(12);
    expect(net.trips.length).toBeGreaterThan(400);
  });

  it("uses only the real Erzsébet park and Lábasház platforms", () => {
    expect(net.stops.filter((s) => s.name.ro === "Parcul Elisabeta")).toHaveLength(1);
    expect(net.stops.filter((s) => s.name.ro === "Casa cu Arcade")).toHaveLength(1);
  });

  it("keeps the two Cigarettagyár platforms physically distinct", () => {
    const factory = net.stops.filter((s) => s.name.ro === "Fabrica de Țigarete");

    expect(factory).toHaveLength(2);
    expect(factory[0].stationId).not.toBe(factory[1].stationId);
  });

  it("does not invent an opposite kerb from a repeated source coordinate", () => {
    expect(net.stops.filter((s) => s.name.ro === "Coșeni 1")).toHaveLength(1);
  });

  it("keeps every kerb of a station in the same place", () => {
    for (const station of net.stations) {
      const kerbs = station.stopIds.map((id) => net.stops.find((s) => s.id === id)!);
      const k = Math.cos((45.865 * Math.PI) / 180);
      for (const kerb of kerbs) {
        const away = Math.hypot((kerb.at[0] - station.at[0]) * k * 111320,
                                (kerb.at[1] - station.at[1]) * 111320);
        expect(away, `${station.name.ro} kerb ${kerb.id} is far from its station`)
          .toBeLessThan(120);
      }
    }
  });

  it("every pattern is internally consistent", () => {
    for (const p of net.patterns) {
      expect(p.offsets).toHaveLength(p.stopIds.length);
      expect(p.published).toHaveLength(p.stopIds.length);
      expect(p.shapeIndex).toHaveLength(p.stopIds.length);
      expect(p.offsets[0]).toBe(0);
      for (let i = 1; i < p.offsets.length; i++)
        expect(p.offsets[i]).toBeGreaterThanOrEqual(p.offsets[i - 1]);
      for (const i of p.shapeIndex) expect(p.shape[i]).toBeDefined();
    }
  });

  it("anchors stops to the shape without ever going backwards", () => {
    /* On the loop routes a nearest-vertex search lands on the other pass around
       the loop, and the drawn leg then jumps across town. Anchoring by distance
       along the shape is monotonic by construction - this is the guard. */
    for (const p of net.patterns) {
      for (let i = 1; i < p.shapeIndex.length; i++) {
        expect(p.shapeIndex[i],
          `${p.id} (line ${p.lineId}) jumps back at stop ${i}`)
          .toBeGreaterThanOrEqual(p.shapeIndex[i - 1]);
      }
    }
  });

  it("carries no repeated points", () => {
    // the published polylines repeat a fifth of their points; smoothing starts
    // by dropping those, and none should survive into the bundle
    for (const p of net.patterns) {
      for (let i = 1; i < p.shape.length; i++) {
        expect(p.shape[i], `${p.id} repeats point ${i}`).not.toEqual(p.shape[i - 1]);
      }
    }
  });

  it("smooths the geometry without moving the route", () => {
    /* The operator publishes coordinates rounded to four decimals - an 8 by 11
       metre grid - so the raw lines staircase along the road. Corner cutting
       fixes how it looks; this checks it did not also relocate the bus. The
       ceiling is the grid's own diagonal with room to spare. */
    const raw = readFileSync(
      resolve(import.meta.dirname, "../../../../gtfs/shapes.txt"), "utf8").split("\n");
    const source = new Map<string, Array<[number, number]>>();
    for (const row of raw.slice(1)) {
      const [id, lat, lon] = row.split(",");
      if (!id || !lat) continue;
      const list = source.get(id) ?? [];
      list.push([Number(lon), Number(lat)]);
      source.set(id, list);
    }
    const k = Math.cos((45.865 * Math.PI) / 180);
    const away = (p: [number, number], pts: Array<[number, number]>) =>
      Math.min(...pts.map(([x, y]) =>
        Math.hypot((p[0] - x) * k * 111320, (p[1] - y) * 111320)));

    for (const pattern of net.patterns) {
      const original = source.get(pattern.shapeId);
      expect(original, `no source shape for ${pattern.id}`).toBeDefined();
      const drift = pattern.shape
        .filter((_, i) => i % 7 === 0)
        .map((c) => away(c as [number, number], original!));
      drift.sort((a, b) => a - b);
      expect(drift[Math.floor(drift.length / 2)],
        `${pattern.id} drifted from the published line`).toBeLessThan(8);
    }
  });

  it("draws a leg from a slice of the shape, not the whole route", () => {
    const p = net.patterns.find((x) => x.stopIds.length > 10)!;
    const oneStop = p.shapeIndex[1] - p.shapeIndex[0];
    expect(oneStop).toBeLessThan(p.shape.length / 2);
  });

  it("every trip and walk points at something real", () => {
    const pids = new Set(net.patterns.map((p) => p.id));
    const sids = new Set(net.stops.map((s) => s.id));
    for (const t of net.trips) expect(pids.has(t.patternId)).toBe(true);
    for (const p of net.patterns) for (const s of p.stopIds) expect(sids.has(s)).toBe(true);
    for (const w of net.walks) {
      expect(sids.has(w.from)).toBe(true);
      expect(sids.has(w.to)).toBe(true);
    }
  });

  it("leaves Árkos on line 10, the only line that goes there", () => {
    const found = plan(ctx, ask("Centru Arcuș", "Cartierul Ciucului", { time: 7 * 60 + 30 }));
    expect(found.length).toBeGreaterThan(0);
    for (const j of found) expect(rides(j)[0].lineId).toBe("10");
  });

  it("offers a real speed-against-walking choice on that journey", () => {
    // riding line 10 further and walking 500 m beats changing onto line 6 by
    // eight minutes - the door-to-door search finds this, stop-to-stop cannot
    const found = plan(ctx, ask("Centru Arcuș", "Cartierul Ciucului", { time: 7 * 60 + 30 }));
    const quickest = found.reduce((a, b) => (b.arrive - b.depart) < (a.arrive - a.depart) ? b : a);
    const gentlest = found.reduce((a, b) => b.walkMinutes < a.walkMinutes ? b : a);
    expect(quickest).not.toBe(gentlest);
    expect(gentlest.walkMinutes).toBeLessThan(quickest.walkMinutes);
    expect(gentlest.arrive - gentlest.depart).toBeGreaterThan(quickest.arrive - quickest.depart);
  });

  it("puts the gentler option first when the rider hates walking", () => {
    const req = (walkAversion: number) =>
      plan(ctx, ask("Centru Arcuș", "Cartierul Ciucului", { time: 7 * 60 + 30, walkAversion }))[0];
    expect(req(0).walkMinutes).toBeGreaterThan(req(1).walkMinutes);
  });

  it("plans a short hop across town", () => {
    const found = plan(ctx, ask("Gara CFR", "Arena Sepsi"));
    expect(found.length).toBeGreaterThan(0);
    expect(found[0].arrive - found[0].depart).toBeLessThan(60);
  });

  it("keeps every journey self-consistent", () => {
    for (const name of ["Cartierul Ciucului", "Arena Sepsi", "Spitalul Județean"]) {
      for (const j of plan(ctx, ask("Gara CFR", name))) {
        expect(j.arrive).toBeGreaterThan(j.depart);
        const legs = rides(j);
        if (!legs.length) {
          // walking the whole way is an answer too, and it has its own shape
          expect(j.legs.every((l) => l.kind === "walk")).toBe(true);
          expect(j.walkMinutes).toBe(j.arrive - j.depart);
          continue;
        }
        for (const r of legs) expect(r.alight).toBeGreaterThanOrEqual(r.board);
        for (let i = 1; i < legs.length; i++)
          expect(legs[i].board).toBeGreaterThanOrEqual(legs[i - 1].alight);
        expect(j.depart).toBeLessThanOrEqual(legs[0].board);
        expect(j.arrive).toBeGreaterThanOrEqual(legs[legs.length - 1].alight);
      }
    }
  });

  it("never offers the same journey twice", () => {
    const found = plan(ctx, ask("Gara CFR", "Arena Sepsi"));
    const keys = found.map((j) =>
      `${j.depart}|${j.arrive}|${rides(j).map((r) => r.lineId).join(">")}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("respects a line filter on the real feed", () => {
    const only10 = plan(ctx, ask("Centru Arcuș", "Cartierul Ciucului",
      { time: 7 * 60 + 30, lines: new Set(["10"]) }));
    for (const j of only10) for (const r of rides(j)) expect(r.lineId).toBe("10");
  });

  it("arrive-by lands in time on the real feed", () => {
    const found = plan(ctx, ask("Centru Arcuș", "Cartierul Ciucului",
      { mode: "arriveBy", time: 9 * 60 }));
    expect(found.length).toBeGreaterThan(0);
    for (const j of found) expect(j.arrive).toBeLessThanOrEqual(9 * 60);
  });

  it("charges the Arcuș fare for a journey that leaves the city", () => {
    const [best] = plan(ctx, ask("Centru Arcuș", "Cartierul Ciucului", { time: 7 * 60 + 30 }));
    const stops = new Map(net.stops.map((s) => [s.id, s]));
    const patterns = new Map(net.patterns.map((p) => [p.id, p]));
    const touched = rides(best).flatMap((r) =>
      patterns.get(r.patternId)!.stopIds.slice(r.fromIndex, r.toIndex + 1));
    expect(touched.some((id) => stops.get(id)!.zone === "arcus")).toBe(true);
    expect(countTickets(rides(best).map((r) => r.board), 60)).toBe(1);
  });

  it("boards at the stop you are standing at, not one up the road", () => {
    /* Line 3 runs down to Coșeni 2, turns round and comes back, so the same
       trip calls at Coșeni 1 both before and after. The search joins a pattern
       at the first index that catches the trip, which used to walk a rider
       standing at Coșeni 2 some 300 m to Coșeni 1 for a bus that reached them
       a minute later anyway. */
    const here = at("Coșeni 2");
    const [best] = plan(ctx, ask("Coșeni 2", "Str. Ciucului 1", { time: 13 * 60 }));
    const board = rides(best)[0];
    const pattern = net.patterns.find((p) => p.id === board.patternId)!;
    const boarded = net.stops.find((s) => s.id === pattern.stopIds[board.fromIndex])!;
    expect(boarded.name.ro).toBe("Coșeni 2");
    expect(here).toEqual(boarded.at);
    // walkMinutes also counts the walk off at the far end; the access is what
    // this is about, and standing at the stop it should be nothing
    const access = best.legs[0];
    expect(access.kind).toBe("walk");
    expect(access.kind === "walk" && access.metres).toBe(0);
  });

  it("never walks past a stop the same bus calls at later", () => {
    // the general form of the above, over every journey the feed can produce
    for (const to of ["Str. Ciucului 1", "Gara CFR", "Arena Sepsi"]) {
      for (const from of ["Coșeni 2", "Coșeni 1", "Motel Calypso", "Șugaș Băi"]) {
        for (const j of plan(ctx, ask(from, to, { time: 13 * 60 }))) {
          const first = rides(j)[0];
          const pattern = net.patterns.find((p) => p.id === first.patternId)!;
          const origin = at(from);
          const walked = metres(origin, net.stops.find(
            (s) => s.id === pattern.stopIds[first.fromIndex])!.at);
          for (let i = first.fromIndex + 1; i < first.toIndex; i++) {
            const later = net.stops.find((s) => s.id === pattern.stopIds[i])!;
            expect(metres(origin, later.at),
                   `${from}→${to}: boarded ${Math.round(walked)} m away when `
                   + `${later.name.ro} was on the same bus`).toBeGreaterThan(walked - 1);
          }
        }
      }
    }
  });

  it("never sends a rider via a second stop to walk on from there", () => {
    /* The search can reach an egress stop on foot from wherever the bus really
       stopped. Adding the walk to the door on top of that produced "get off
       here, walk to that stop, then walk on" - two walks in a row, and always
       longer than going straight there. */
    for (const [from, to] of pairs()) {
      for (const j of plan(ctx, ask(from, to, { time: 13 * 60 }))) {
        for (let i = 1; i < j.legs.length; i++) {
          expect(j.legs[i].kind === "walk" && j.legs[i - 1].kind === "walk",
                 `${from}→${to} walks twice in a row`).toBe(false);
        }
      }
    }
  }, 30000);

  it("stays on the bus when the next stop is nearer the door", () => {
    /* Round 0 seeds every walkable stop with the time you could reach it on
       foot, and the scan only records a ride that beats it - so a stop near the
       destination that is also (slowly) walkable from the origin never got a
       ride label, and the rider was dropped early to walk the rest. */
    for (const [from, to] of pairs()) {
      const [best] = plan(ctx, ask(from, to, { time: 13 * 60 }));
      if (!best) continue;
      const last = [...best.legs].reverse().find((l) => l.kind === "ride") as RideLeg;
      if (!last) continue;
      const pattern = net.patterns.find((p) => p.id === last.patternId)!;
      const got = net.stops.find((s) => s.id === pattern.stopIds[last.toIndex])!;
      const walk = metres(got.at, at(to));
      for (let i = last.toIndex + 1; i < pattern.stopIds.length; i++) {
        const later = net.stops.find((s) => s.id === pattern.stopIds[i])!;
        const minutes = pattern.offsets[i] - pattern.offsets[last.toIndex];
        if (minutes > 6) break;
        expect(metres(later.at, at(to)),
               `${from}→${to}: got off at ${got.name.ro} for a ${Math.round(walk)} m walk `
               + `when ${later.name.ro} is ${minutes} min further on`)
          .toBeGreaterThan(walk - 100);
      }
    }
  }, 30000);

  it("does not ride past the door and come back to it", () => {
    /* Dr. Office to Kaufland at half past midnight, reported from the live
       site. Both kerbs at the far end are almost exactly fifteen minutes' walk
       from the origin, so round 0 wrote them into the pruning table and every
       bus arriving hours later counted as no improvement. The one itinerary
       that survived rode ten minutes further round the loop - out to Sepsi
       Arena and back - to reach the other kerb of a stop it had already passed,
       sixteen metres further from the door. */
    const from: LngLat = [25.792165, 45.864308];
    const to: LngLat = [25.802047, 45.869763];
    /* The current official service has several earlier alternatives, so this
       regression check must inspect enough candidates to reach the later 5. */
    const options = plan(ctx, { from, to, time: 30, service: "weekday",
                               mode: "departAt", walkAversion: 0 }, 100);
    const five = options
      .find((j) => rides(j).some((r) => r.lineId === "5"));
    expect(five, "no line 5 itinerary at all").toBeTruthy();
    // Current official calls make this line-5 alternative arrive earlier;
    // keep the real-feed regression anchored to the regenerated timetable.
    expect(formatHHMM(five!.arrive)).toBe("05:46");

    const last = [...five!.legs].reverse().find((l) => l.kind === "ride") as RideLeg;
    const pattern = net.patterns.find((p) => p.id === last.patternId)!;
    const off = net.stops.find((s) => s.id === pattern.stopIds[last.toIndex])!;
    const walk = metres(off.at, to);
    for (let i = last.fromIndex + 1; i < last.toIndex; i++) {
      const passed = net.stops.find((s) => s.id === pattern.stopIds[i])!;
      const lost = pattern.offsets[last.toIndex] - pattern.offsets[i];
      // staying on is only worth what it saves on foot; both sides are minutes
      expect(metres(passed.at, to) + lost * 80,
             `rode ${lost} min past ${passed.name.ro} to land at ${off.name.ro}`)
        .toBeGreaterThan(walk);
    }
  });

  it("offers the buses to a stop you could also have walked to", () => {
    /* Pruning ride arrivals against the walk from the origin is correct
       arithmetic and the wrong answer for a planner that only returns journeys
       with a ride in them: it discards every bus and returns nothing, or
       something worse that reaches a different stop. */
    const from: LngLat = [25.792165, 45.864308];
    // the precondition, asked of the planner rather than worked out by hand:
    // these are the stops round 0 seeds, and so the ones the bug could hide
    const seeded = new Set(stopsNear(ctx, from).map((n) => n.stop.id));
    const inside = net.stops.filter((s) => seeded.has(s.id));
    expect(inside.length, "no stop is walkable from here, so this proves nothing")
      .toBeGreaterThan(5);

    for (const stop of inside) {
      const journeys = plan(ctx, { from, to: stop.at, time: 30, service: "weekday",
                                   mode: "departAt", walkAversion: 0 }, 8);
      expect(journeys.length, `no bus offered to ${stop.name.ro} (${stop.id})`)
        .toBeGreaterThan(0);
    }
  });

  it("lets the slider actually win the argument it names", () => {
    /* The slider trades sooner against less walking, so it has to move both
       sides. Scaling only the walking term left the far end powerless: a minute
       on foot was worth two and a half, but a bus half an hour later still cost
       a full thirty, so the quicker itinerary led the list wherever the slider
       was put. Reported from the live site - the top result walked thirteen
       minutes with two changes while a direct one on the same list walked
       eight. */
    /* Pairs where the old formula demonstrably misordered: it led with six or
       seven minutes on foot when two were on the same list, a quarter of an
       hour later at worst. */
    const pairs: Array<[string, string]> = [
      ["Arena Sepsi", "B-dul Grigore Bălan 1"], ["Arena Sepsi", "Col. Mihai Viteazul"],
      ["Arena Sepsi", "Str. Dózsa György"], ["Arena Sepsi", "Str. Fabricii 2"],
      ["Gara CFR", "Coșeni 2"], ["Șugaș Băi", "Str. Ciucului 1"],
    ];
    let checked = 0;
    for (const [a, b] of pairs) {
      const ask = (walkAversion: number): PlanRequest => ({
        from: at(a), to: at(b), time: 15 * 60 + 8, service: "weekday",
        mode: "departAt", walkAversion,
      });
      const easy = plan(ctx, ask(1), 8).filter((j) => rides(j).length);
      const quick = plan(ctx, ask(0), 8).filter((j) => rides(j).length);
      if (easy.length < 2 || quick.length < 2) continue;
      checked++;

      // at "spare my legs", nothing on the list may walk meaningfully less
      for (const other of easy)
        expect(other.walkMinutes, `${a}→${b}: led with ${easy[0].walkMinutes} min on `
          + `foot when ${other.walkMinutes} was offered`)
          .toBeGreaterThan(easy[0].walkMinutes - 3);

      // and at the other end it still answers the question that end asks
      expect(quick[0].arrive, `${a}→${b}: not the soonest arrival at "faster"`)
        .toBe(Math.min(...quick.map((j) => j.arrive)));
    }
    expect(checked, "no pair produced enough options to compare").toBeGreaterThan(2);
  });

  it("can change buses and still ride to the nearest stop", () => {
    /* Reported from the live site: line 1 was two minutes away and the 6 stops
       in front of Kaufland, so why was there no way to change between them?
       Because one table answered two questions. RAPTOR prunes with the best
       arrival seen at a stop across every round, and it was also using that
       table to decide what could be built - so a two-ride chain could not end
       at a stop a one-ride chain had already reached no later. The change was
       either dropped entirely or left ending somewhere else with a ten-minute
       walk, while the same bus carried on to a stop two minutes from the door.
       The arrival was no better; the journey was. */
    const from: LngLat = [25.7885, 45.8605];       // by the stadium
    const to: LngLat = [25.802047, 45.869763];     // Kaufland
    const journeys = plan(ctx, { from, to, time: 15 * 60 + 21, service: "weekday",
                                 mode: "departAt", walkAversion: 1 }, 8);
    const changing = journeys.filter((j) => rides(j).length > 1);
    expect(changing.length, "not one itinerary with a change was offered")
      .toBeGreaterThan(0);

    /* The best of them, not all of them: getting off a stop early to arrive two
       minutes sooner is a real trade and belongs on the list, ranked below. */
    const first = changing[0];
    const last = [...first.legs].reverse().find((l) => l.kind === "ride") as RideLeg;
    const pattern = net.patterns.find((p) => p.id === last.patternId)!;
    const off = net.stops.find((s) => s.id === pattern.stopIds[last.toIndex])!;
    expect(metres(off.at, to),
           `best change put the rider down at ${off.name.ro}`).toBeLessThan(250);
  });

  it("does not spend the list on one route running four times", () => {
    /* Reported from the live site: with the slider at "less walking" the first
       four rows were the same line 6 between the same two stops, an hour apart
       each. Four rows, one answer, and no other route visible at all. */
    for (const [a, b] of pairs()) {
      const journeys = plan(ctx, ask(a, b, { time: 15 * 60 + 21, walkAversion: 1 }));
      const shapes = journeys.map((j) => rides(j)
        .map((r) => `${r.patternId}:${r.fromIndex}>${r.toIndex}`).join("+"));
      expect(new Set(shapes).size, `${a}→${b} repeats an itinerary`)
        .toBe(shapes.length);
    }
  });

  it("finds stops near the middle of town", () => {
    expect(stopsNear(ctx, [25.7876, 45.8636], 10).length).toBeGreaterThan(3);
  });

  it("answers fast enough to run on every keystroke", () => {
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) plan(ctx, ask("Gara CFR", "Arena Sepsi", { time: 7 * 60 + i * 30 }));
    const each = (performance.now() - t0) / 20;
    expect(each).toBeLessThan(120);
  });
});

describe("line colours", () => {
  it("keeps the operator's colour untouched", () => {
    const six = net.lines.find((l) => l.id === "6")!;
    const ten = net.lines.find((l) => l.id === "10")!;
    expect(six.colour.toUpperCase()).toBe("#A9FE00");   // their lime, not ours
    expect(ten.colour.toUpperCase()).toBe("#000000");
  });

  it("keeps a line distinguishable from its D variant", () => {
    for (const id of ["1", "2", "5"]) {
      const base = net.lines.find((l) => l.id === id)!;
      const variant = net.lines.find((l) => l.id === `${id}D`)!;
      /* The operator may choose the same official colour, or a different one
         (the current 5/5D pair does). Either way the rendered light tones
         must not collapse into one indistinguishable line on the map. */
      expect(base.light).not.toBe(variant.light);
    }
  });

  it("keeps two unrelated lines further apart than a line and its own variant",
     () => {
    /* Lightening line 2's red towards white to make 2D used to land on line 9's
       brown - at dE 19 the closest pair on the whole map, closer than any line
       was to its own variant, which is exactly backwards. */
    const far = (a: string, b: string) => {
      const lab = (hex: string) => {
        const [r, g, b2] = [1, 3, 5].map((i) => parseInt(hex.substr(i, 2), 16) / 255)
          .map((v) => (v > 0.04045 ? Math.pow((v + 0.055) / 1.055, 2.4) : v / 12.92));
        const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
        const [x, y, z] = [f((r * 0.4124 + g * 0.3576 + b2 * 0.1805) / 0.9505),
                           f(r * 0.2126 + g * 0.7152 + b2 * 0.0722),
                           f((r * 0.0193 + g * 0.1192 + b2 * 0.9505) / 1.089)];
        return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
      };
      const [p, q] = [lab(a), lab(b)];
      return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
    };
    const family = (a: string, b: string) =>
      a.replace(/D$/, "") === b.replace(/D$/, "");
    for (const theme of ["light", "dark"] as const) {
      for (const one of net.lines) {
        for (const other of net.lines) {
          if (one.id >= other.id || family(one.id, other.id)) continue;
          expect(far(one[theme], other[theme]),
                 `${one.id} vs ${other.id} on ${theme}`).toBeGreaterThan(25);
        }
      }
    }
  });

  it("keeps every line visible on both grounds", () => {
    const contrast = (a: string, b: string) => {
      const lum = (hex: string) => {
        const c = [1, 3, 5].map((i) => parseInt(hex.substr(i, 2), 16) / 255)
          .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
      };
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    for (const line of net.lines) {
      // line 10 is pure black and vanishes on a dark basemap unless lifted
      expect(contrast(line.light, "#FBFAF7"), `${line.id} on paper`).toBeGreaterThan(1.5);
      expect(contrast(line.dark, "#14180D"), `${line.id} on dark`).toBeGreaterThan(1.5);
      // and the number on the pill has to stay readable
      expect(contrast(line.light, line.lightText), `${line.id} pill`).toBeGreaterThan(4);
      expect(contrast(line.dark, line.darkText), `${line.id} pill dark`).toBeGreaterThan(4);
    }
  });
});

describe("next departures", () => {
  it("lists the following buses of that line from that stop", () => {
    const stop = net.stops.find((s) => s.name.ro === "Gara CFR")!;
    const line = net.patterns.find((p) => p.stopIds.includes(stop.id))!.lineId;
    const times = nextDepartures(ctx, stop.id, line, 8 * 60, "weekday");
    expect(times.length).toBeGreaterThan(0);
    expect(times.length).toBeLessThanOrEqual(4);
    for (const t of times) expect(t).toBeGreaterThan(8 * 60);
    // strictly ascending, no repeats
    for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThan(times[i - 1]);
  });

  it("only counts the line asked about", () => {
    const stop = net.stops.find((s) => s.name.ro === "Gara CFR")!;
    const serving = net.patterns.filter((p) => p.stopIds.includes(stop.id));
    const lines = [...new Set(serving.map((p) => p.lineId))];
    expect(lines.length).toBeGreaterThan(1);      // a stop several lines share
    const first = nextDepartures(ctx, stop.id, lines[0], 8 * 60, "weekday", 20);
    const second = nextDepartures(ctx, stop.id, lines[1], 8 * 60, "weekday", 20);
    expect(first).not.toEqual(second);
  });

  it("keeps the services apart", () => {
    const stop = net.stops.find((s) => s.name.ro === "Gara CFR")!;
    const line = net.patterns.find((p) => p.stopIds.includes(stop.id))!.lineId;
    const weekday = nextDepartures(ctx, stop.id, line, 6 * 60, "weekday", 200);
    const weekend = nextDepartures(ctx, stop.id, line, 6 * 60, "weekend", 200);
    expect(weekday).not.toEqual(weekend);
    // The current official sheet may have the same number of calls with
    // different clocks, so distinct service calendars matter more than count.
  });

  it("says nothing rather than wrapping round to tomorrow", () => {
    const stop = net.stops.find((s) => s.name.ro === "Gara CFR")!;
    const line = net.patterns.find((p) => p.stopIds.includes(stop.id))!.lineId;
    expect(nextDepartures(ctx, stop.id, line, 23 * 60 + 59, "weekday")).toEqual([]);
  });
});
