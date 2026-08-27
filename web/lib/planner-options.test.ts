import { describe, expect, it } from "vitest";
import type { Journey } from "./engine/types";
import {
  mergePlannerOptions,
  plannerOptionTimes,
  type PlannerOption,
} from "./planner-options";

const transit = (depart: number, arrive: number): Journey => ({
  legs: [], depart, arrive, walkMinutes: 0, transfers: 0,
});

const bike = (depart: number, arrive: number): Journey => ({
  depart, arrive, walkMinutes: 4, transfers: 0,
  legs: [
    { kind: "walk", fromStopId: null, toStopId: null, metres: 100, minutes: 2, path: [] },
    { kind: "bike", startStationId: "01", finishStationId: "02", depart: depart + 2,
      arrive: arrive - 2, metres: 1000, minutes: 5, seconds: 300, ascentMetres: 4,
      descentMetres: 2, path: [], costLei: 0, stale: false },
    { kind: "walk", fromStopId: null, toStopId: null, metres: 100, minutes: 2, path: [] },
  ],
});

describe("planner options", () => {
  it("treats a missing journey list as no results instead of crashing the planner", () => {
    expect(mergePlannerOptions(undefined, "departAt")).toEqual([]);
  });

  it("exposes comparable times for ordinary and bicycle-containing journeys", () => {
    const options: PlannerOption[] = [
      { kind: "journey", journey: transit(600, 630) },
      { kind: "journey", journey: bike(605, 625) },
    ];

    expect(options.map(plannerOptionTimes)).toEqual([
      { depart: 600, arrive: 630 },
      { depart: 605, arrive: 625 },
    ]);
  });

  it("ranks depart-at choices by earliest arrival across all leg combinations", () => {
    const merged = mergePlannerOptions([transit(600, 635), transit(605, 640), bike(601, 630)], "departAt");

    expect(merged.map((option) => option.kind)).toEqual(["journey", "journey", "journey"]);
    expect(merged.map((option) => plannerOptionTimes(option).arrive)).toEqual([630, 635, 640]);
  });

  it("ranks arrive-by choices by latest possible departure across all leg combinations", () => {
    const merged = mergePlannerOptions([transit(600, 630), transit(610, 640), bike(605, 635)], "arriveBy");

    expect(merged.map((option) => option.kind)).toEqual(["journey", "journey", "journey"]);
    expect(merged.map((option) => plannerOptionTimes(option).depart)).toEqual([610, 605, 600]);
  });
});
