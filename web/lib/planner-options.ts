import type { Journey, Minute, PlanMode } from "./engine/types";
import type { TimedBikeJourney } from "./sepsibike-timing";

/** A directly comparable route choice shown by the planner. */
export type PlannerOption =
  | { kind: "transit"; journey: Journey }
  | { kind: "bike"; journey: TimedBikeJourney };

export function plannerOptionTimes(option: PlannerOption): { depart: Minute; arrive: Minute } {
  return { depart: option.journey.depart, arrive: option.journey.arrive };
}

/**
 * Keep direct bus and bike alternatives in one ordered list. Mixed bus-bike
 * journeys deliberately stay out of this model until they are planned as a
 * dedicated multimodal feature.
 */
export function mergePlannerOptions(
  journeys: Journey[],
  bike: TimedBikeJourney | null,
  mode: PlanMode,
): PlannerOption[] {
  const options: PlannerOption[] = journeys.map((journey) => ({ kind: "transit", journey }));
  if (bike) options.push({ kind: "bike", journey: bike });

  return options.sort((a, b) => {
    const left = plannerOptionTimes(a);
    const right = plannerOptionTimes(b);
    return mode === "departAt"
      ? left.arrive - right.arrive || left.depart - right.depart
      : right.depart - left.depart || right.arrive - left.arrive;
  });
}
