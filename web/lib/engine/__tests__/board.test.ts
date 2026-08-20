/** The two views that answer "when does a bus come", rather than "how do I get
 *  there": a board at one stop, and one line's whole day. */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prepare, boardAt, timetable, type PlanContext } from "../plan";
import { formatHHMM } from "../time";
import type { Network, Stop } from "../types";

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

  it("says nothing rather than inventing a service that does not run", () => {
    for (const stop of net.stops.slice(0, 30)) {
      for (const column of boardAt(ctx, stop.id, "weekend")) {
        const trips = net.trips.filter((t) => t.patternId === column.patternId
                                              && t.service === "weekend");
        expect(column.times.length).toBe(trips.length);
      }
    }
  });

  it("agrees, call for call, with the times in the feed", () => {
    // one column per call, not per pattern - Gara CFR is reached twice a loop
    const stopId = at("Gara CFR");
    const expected: string[] = [];
    for (const pattern of net.patterns) {
      pattern.stopIds.forEach((sid, index) => {
        if (sid !== stopId) return;
        const times = net.trips
          .filter((t) => t.patternId === pattern.id && t.service === "weekday")
          .map((t) => t.start + pattern.offsets[index]).sort((a, b) => a - b);
        if (times.length) expected.push(`${pattern.id}@${index}:${times.join(",")}`);
      });
    }
    const got = boardAt(ctx, stopId, "weekday")
      .map((c) => `${c.patternId}@?:${c.times.join(",")}`);
    expect(got.length).toBe(expected.length);
    for (const row of expected) {
      const times = row.slice(row.indexOf(":"));
      expect(got.some((g) => g.endsWith(times)), row.slice(0, 40)).toBe(true);
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
