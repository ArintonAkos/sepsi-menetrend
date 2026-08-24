/** The two views that answer "when does a bus come", rather than "how do I get
 *  there": a board at one stop, and one line's whole day. */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prepare, boardAt, timetable, type PlanContext } from "../plan";
import { formatHHMM } from "../time";
import type { Network, Stop } from "../types";
import { fixture } from "./fixture";

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
  return s.id;
};

describe("the board at a stop", () => {
  it("lists every line that calls, with its times in order", () => {
    const board = boardAt(ctx, at("Gara CFR"), "weekday");
    expect(board.length).toBeGreaterThan(0);
    for (const column of board) {
      expect(column.times.length).toBeGreaterThan(0);
      expect([...column.times].sort((a, b) => a - b)).toEqual(column.times);
      expect(column.lineId).toBeTruthy();
    }
  });

  it("shows a terminus its arrivals, which the planner deliberately hides", () => {
    /* callsAt drops the last stop of every run because nobody boards there.
       That is right for planning and wrong for a board: a terminus is where you
       wait to be collected, and the arrival is the only time it has. */
    const terminus = net.patterns
      .map((p) => p.stopIds[p.stopIds.length - 1])
      .find((id) => !ctx.callsAt.has(id));
    expect(terminus, "no pattern ends at a stop nothing else boards from")
      .toBeTruthy();
    const board = boardAt(ctx, terminus!, "weekday");
    expect(board.length).toBeGreaterThan(0);
    expect(board.some((c) => c.terminates)).toBe(true);
  });

  it("keeps the two passes of a circular route apart", () => {
    /* Line 3 comes through Gara CFR twice on one loop, 25 minutes apart. Merged
       into one column that reads as a service twice as frequent as it is, and
       sends somebody to the stop for a bus going the other way. */
    const board = boardAt(ctx, at("Gara CFR"), "weekday");
    const three = board.filter((c) => c.lineId === "3");
    expect(three.length).toBeGreaterThan(1);
    const [first, second] = three;
    expect(first.times[0]).not.toBe(second.times[0]);
    for (const column of three) expect(column.times.length).toBeGreaterThan(0);
  });

  it("merges timetable columns only when they leave for the same next stop", () => {
    const synthetic = fixture();
    synthetic.patterns.push({
      id: "P1-extra", lineId: "1", shapeId: "S1-extra",
      headsign: { ro: "spre C", hu: "C felé" },
      stopIds: ["A", "B"], offsets: [0, 5], published: [true, true],
      shape: [[25.760, 45.86], [25.780, 45.86]], shapeIndex: [0, 1],
    });
    synthetic.trips.push({ patternId: "P1-extra", service: "weekday", start: 8 * 60 + 5 });

    const merged = boardAt(prepare(synthetic), "A", "weekday")
      .filter((column) => column.lineId === "1");

    expect(merged).toHaveLength(1);
    expect(merged[0]?.towards).toBe("B");
    expect(merged[0]?.times).toEqual([480, 485, 510, 540]);
  });

  it("says nothing rather than inventing a service that does not run", () => {
    for (const stop of net.stops.slice(0, 30)) {
      for (const column of boardAt(ctx, stop.id, "weekend")) {
        const pattern = ctx.patterns.get(column.patternId)!;
        const expected = net.patterns.flatMap((candidate) => candidate.stopIds
          .flatMap((stopId, index) => {
            if (stopId !== stop.id
                || candidate.lineId !== column.lineId
                || candidate.headsign.ro !== column.headsign.ro
                || candidate.headsign.hu !== column.headsign.hu
                || (candidate.stopIds[index + 1] ?? null) !== column.towards
                || candidate.published[index] !== column.published
                || (index === candidate.stopIds.length - 1) !== column.terminates) {
              return [];
            }
            return net.trips.filter((trip) => trip.patternId === candidate.id
                                                && trip.service === "weekend")
              .map((trip) => trip.start + candidate.offsets[index]);
          })).sort((a, b) => a - b);
        expect(column.times).toEqual(expected);
        expect(pattern.lineId).toBe(column.lineId);
      }
    }
  });

  it("agrees with the feed after equivalent columns are coalesced", () => {
    const stopId = at("Gara CFR");
    const expected = new Map<string, number[]>();
    for (const pattern of net.patterns) {
      pattern.stopIds.forEach((sid, index) => {
        if (sid !== stopId) return;
        const times = net.trips
          .filter((t) => t.patternId === pattern.id && t.service === "weekday")
          .map((t) => t.start + pattern.offsets[index]).sort((a, b) => a - b);
        if (!times.length) return;
        const key = [pattern.lineId, pattern.headsign.ro, pattern.headsign.hu,
          pattern.stopIds[index + 1] ?? "", index === pattern.stopIds.length - 1,
          pattern.published[index]].join("|");
        expected.set(key, [...new Set([...(expected.get(key) ?? []), ...times])]
          .sort((a, b) => a - b));
      });
    }
    const got = boardAt(ctx, stopId, "weekday");
    expect(got).toHaveLength(expected.size);
    for (const times of expected.values()) {
      expect(got.some((column) => column.times.join(",") === times.join(","))).toBe(true);
    }
  });
});

describe("a line's whole day", () => {
  it("is a grid of runs by stop", () => {
    const grid = timetable(ctx, net.patterns[0].id, "weekday")!;
    expect(grid.runs.length).toBeGreaterThan(0);
    for (const run of grid.runs) expect(run.length).toBe(grid.stopIds.length);
    expect(grid.published.length).toBe(grid.stopIds.length);
  });

  it("runs down the page in departure order", () => {
    for (const pattern of net.patterns) {
      const grid = timetable(ctx, pattern.id, "weekday");
      if (!grid || grid.runs.length < 2) continue;
      const firsts = grid.runs.map((r) => r[0]);
      expect([...firsts].sort((a, b) => a - b), pattern.id).toEqual(firsts);
    }
  });

  it("never has a bus reach a later stop earlier", () => {
    for (const pattern of net.patterns) {
      const grid = timetable(ctx, pattern.id, "weekday");
      if (!grid) continue;
      for (const run of grid.runs)
        for (let i = 1; i < run.length; i++)
          expect(run[i], `${pattern.id} at ${formatHHMM(run[i])}`)
            .toBeGreaterThanOrEqual(run[i - 1]);
    }
  });

  it("has nothing for a pattern that does not run at the weekend", () => {
    const empty = net.patterns
      .filter((p) => !net.trips.some((t) => t.patternId === p.id && t.service === "weekend"));
    for (const pattern of empty)
      expect(timetable(ctx, pattern.id, "weekend")!.runs).toEqual([]);
  });

  it("is null for a pattern that does not exist", () => {
    expect(timetable(ctx, "nope", "weekday")).toBeNull();
  });
});
