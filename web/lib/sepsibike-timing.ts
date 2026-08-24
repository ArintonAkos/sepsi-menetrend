import type { Minute, PlanMode } from "./engine/types";
import type { BikeJourneyOption } from "./sepsibike";

export interface TimedBikeJourney extends BikeJourneyOption {
  depart: Minute;
  pickup: Minute;
  returnAt: Minute;
  arrive: Minute;
  fareLei: number;
}

export const RENTAL_OPENS_AT = 6 * 60;
export const LAST_PICKUP_AT = 22 * 60;

/**
 * The published tariff applies to the time between unlocking and docking the
 * bicycle. Walking to or from a station is deliberately not charged.
 */
export function bikeFare(rideMinutes: number): number {
  if (rideMinutes <= 30) return 0;
  if (rideMinutes <= 90) return 2;
  if (rideMinutes <= 150) return 4;
  return 6 * Math.ceil((rideMinutes - 150) / 60);
}

/** @deprecated use bikeFare so all journey modes share one tariff function. */
export const estimatedBikeFare = bikeFare;

export const canStartBikeRide = (pickup: Minute) =>
  pickup >= RENTAL_OPENS_AT && pickup < LAST_PICKUP_AT;

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

  if (!canStartBikeRide(pickup)) return null;

  return {
    ...base,
    depart,
    pickup,
    returnAt,
    arrive,
    fareLei: bikeFare(base.ride.minutes),
  };
}
