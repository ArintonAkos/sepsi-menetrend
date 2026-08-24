import { describe, expect, it } from "vitest";
import type { BikeJourneyOption, BikeStation } from "./sepsibike";
import { bikeFare, canStartBikeRide, estimatedBikeFare, timeBikeJourney } from "./sepsibike-timing";

const station = (id: string): BikeStation => ({
  id, name: id, address: id, lat: 45.86, lng: 25.78,
  availableBikes: 2, freeDocks: 2, totalCapacity: 4, status: "Online",
});

const bike: BikeJourneyOption = {
  start: station("01"), finish: station("02"), stale: false, isFreeEstimate: true,
  access: { path: [], metres: 100, minutes: 5 },
  ride: { path: [], metres: 2000, minutes: 10 },
  egress: { path: [], metres: 80, minutes: 1 },
  totalMinutes: 16,
};

describe("SepsiBike time and fare rules", () => {
  it("allows a 21:55 pickup whose return is after 22:00", () => {
    const timed = timeBikeJourney(bike, 21 * 60 + 50, "departAt");
    expect(timed).toMatchObject({ pickup: 21 * 60 + 55, returnAt: 22 * 60 + 5 });
  });

  it("allows a pickup exactly at 06:00 but not at 22:00", () => {
    expect(timeBikeJourney(bike, 5 * 60 + 55, "departAt")?.pickup).toBe(6 * 60);
    expect(timeBikeJourney(bike, 21 * 60 + 55, "departAt")).toBeNull();
  });

  it("works backwards from an arrive-by deadline", () => {
    expect(timeBikeJourney(bike, 22 * 60 + 5, "arriveBy"))
      .toMatchObject({ pickup: 21 * 60 + 54, arrive: 22 * 60 + 5 });
  });

  it("prices only the rental segment", () => {
    expect([30, 31, 91, 151, 211].map(estimatedBikeFare)).toEqual([0, 2, 4, 6, 12]);
    expect([30, 31, 91, 151, 211].map(bikeFare)).toEqual([0, 2, 4, 6, 12]);
  });

  it("shares the exact pickup-window rule with multimodal planning", () => {
    expect(canStartBikeRide(6 * 60)).toBe(true);
    expect(canStartBikeRide(22 * 60 - 1)).toBe(true);
    expect(canStartBikeRide(22 * 60)).toBe(false);
  });
});
