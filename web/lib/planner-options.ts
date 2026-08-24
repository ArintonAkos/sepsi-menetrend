import type { Journey, Minute, PlanMode } from "./engine/types";

/** Every visible option uses the same timeline, regardless of its legs. */
export type PlannerOption = { kind: "journey"; journey: Journey };

export function plannerOptionTimes(option: PlannerOption): { depart: Minute; arrive: Minute } {
  return { depart: option.journey.depart, arrive: option.journey.arrive };
}

/**
 * One chronological list for walking, bus-only, direct-bike and mixed routes.
 */
export function mergePlannerOptions(
  journeys: Journey[],
  mode: PlanMode,
): PlannerOption[] {
  const options: PlannerOption[] = journeys.map((journey) => ({ kind: "journey", journey }));

  return options.sort((a, b) => {
    const left = plannerOptionTimes(a);
    const right = plannerOptionTimes(b);
    return mode === "departAt"
      ? left.arrive - right.arrive || left.depart - right.depart
      : right.depart - left.depart || right.arrive - left.arrive;
  });
}
