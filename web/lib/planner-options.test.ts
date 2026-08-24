import { describe, expect, it } from "vitest";
import type { Journey } from "./engine/types";
import type { TimedBikeJourney } from "./sepsibike-timing";
import {
  mergePlannerOptions,
  plannerOptionTimes,
  type PlannerOption,
} from "./planner-options";

const transit = (depart: number, arrive: number): Journey => ({
  legs: [], depart, arrive, walkMinutes: 0, transfers: 0,
});

const bike = (depart: number, arrive: number): TimedBikeJourney => ({
  start: { id: "01", name: "01", address: "01", lat: 45.86, lng: 25.78, availableBikes: 2, freeDocks: 2, totalCapacity: 4, status: "Online" },
  finish: { id: "02", name: "02", address: "02", lat: 45.87, lng: 25.79, availableBikes: 2, freeDocks: 2, totalCapacity: 4, status: "Online" },
  access: { path: [], metres: 100, minutes: 2 },
  ride: { path: [], metres: 1000, minutes: 5 },
  egress: { path: [], metres: 100, minutes: 2 },
  totalMinutes: 9, stale: false, isFreeEstimate: true,
  pickup: depart + 2, returnAt: arrive - 2, depart, arrive, fareLei: 0,
});

describe("planner options", () => {
  it("exposes comparable times for transit and SepsiBike", () => {
    const options: PlannerOption[] = [
      { kind: "transit", journey: transit(600, 630) },
      { kind: "bike", journey: bike(605, 625) },
    ];

    expect(options.map(plannerOptionTimes)).toEqual([
      { depart: 600, arrive: 630 },
      { depart: 605, arrive: 625 },
    ]);
  });

  it("ranks depart-at choices by earliest arrival across modes", () => {
    const merged = mergePlannerOptions(
      [transit(600, 635), transit(605, 640)],
      bike(601, 630),
      "departAt",
    );

    expect(merged.map((option) => option.kind)).toEqual(["bike", "transit", "transit"]);
    expect(merged.map((option) => plannerOptionTimes(option).arrive)).toEqual([630, 635, 640]);
  });

  it("ranks arrive-by choices by latest possible departure across modes", () => {
    const merged = mergePlannerOptions(
      [transit(600, 630), transit(610, 640)],
      bike(605, 635),
      "arriveBy",
    );

    expect(merged.map((option) => option.kind)).toEqual(["transit", "bike", "transit"]);
    expect(merged.map((option) => plannerOptionTimes(option).depart)).toEqual([610, 605, 600]);
  });
});
