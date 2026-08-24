import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import BikeJourneyDetail from "./BikeJourneyDetail";
import { STRINGS } from "@/lib/i18n";
import type { TimedBikeJourney } from "@/lib/sepsibike-timing";

const journey: TimedBikeJourney = {
  start: { id: "08", name: "08. Stadionului", address: "Str. Stadionului", lat: 45.86, lng: 25.78, availableBikes: 10, freeDocks: 4, totalCapacity: 14, status: "Online" },
  finish: { id: "01", name: "01. Universitatea Babes Bolyai", address: "Str. Universității", lat: 45.87, lng: 25.79, availableBikes: 8, freeDocks: 9, totalCapacity: 17, status: "Online" },
  access: { path: [], metres: 210, minutes: 3 },
  ride: { path: [], metres: 1850, minutes: 11 },
  egress: { path: [], metres: 130, minutes: 2 },
  totalMinutes: 16, stale: false, isFreeEstimate: true,
  depart: 9 * 60, pickup: 9 * 60 + 3, returnAt: 9 * 60 + 14, arrive: 9 * 60 + 16, fareLei: 0,
};

describe("BikeJourneyDetail", () => {
  it("shows the concrete walk-bike-walk plan, inventory, service rule and fare", () => {
    render(<BikeJourneyDetail journey={journey} from="Otthon" to="Cél" t={STRINGS.hu} onBack={() => {}} />);

    expect(screen.getByText("Otthon")).toBeInTheDocument();
    expect(screen.getByText("08. Stadionului")).toBeInTheDocument();
    expect(screen.getByText("10 kerékpár · 4 szabad dokk")).toBeInTheDocument();
    expect(screen.getByText(/1 850 m · 11 perc kerékpározás/)).toBeInTheDocument();
    expect(screen.getByText("01. Universitatea Babes Bolyai")).toBeInTheDocument();
    expect(screen.getByText("06:00–22:00 között lehet biciklit felvenni.")).toBeInTheDocument();
    expect(screen.getByText("22:00 után csak a leadás lehetséges.")).toBeInTheDocument();
    expect(screen.getByText("0 RON")).toBeInTheDocument();
    expect(screen.getByText("0374 451 350")).toBeInTheDocument();
  });
});
