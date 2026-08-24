import type { Minute, PlanMode } from "./engine/types";
import type { BikeJourneyOption } from "./sepsibike";

export interface TimedBikeJourney extends BikeJourneyOption {
  depart: Minute;
  pickup: Minute;
  returnAt: Minute;
  arrive: Minute;
  fareLei: number;
}

const RENTAL_OPENS_AT = 6 * 60;
const LAST_PICKUP_AT = 22 * 60;

/**
 * The published tariff applies to the time between unlocking and docking the
 * bicycle. Walking to or from a station is deliberately not charged.
 */
export function estimatedBikeFare(rideMinutes: number): number {
  if (rideMinutes <= 30) return 0;
  if (rideMinutes <= 90) return 2;
  if (rideMinutes <= 150) return 4;
  return 6 * Math.ceil((rideMinutes - 150) / 60);
}

/**
 * SepsiBike rents bicycles daily between 06:00 and 22:00. The official rules
 * permit returning a bicycle after 22:00, so only the pickup time is bounded.
 */
export function timeBikeJourney(
  base: BikeJourneyOption,
  requested: Minute,
  mode: PlanMode,
): TimedBikeJourney | null {
  const totalMinutes = base.access.minutes + base.ride.minutes + base.egress.minutes;
  const depart = mode === "departAt" ? requested : requested - totalMinutes;
  const pickup = depart + base.access.minutes;
  const returnAt = pickup + base.ride.minutes;
  const arrive = returnAt + base.egress.minutes;

  if (pickup < RENTAL_OPENS_AT || pickup >= LAST_PICKUP_AT) return null;

  return {
    ...base,
    depart,
    pickup,
    returnAt,
    arrive,
    fareLei: estimatedBikeFare(base.ride.minutes),
  };
}
