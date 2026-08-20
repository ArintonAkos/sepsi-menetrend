import { describe, it, expect } from "vitest";
import { countTickets, fareFor, type FareTable, type Ticket } from "../fares";
import type { Journey, RideLeg, Stop } from "../types";

describe("countTickets", () => {
  it("charges nothing for no ride", () => expect(countTickets([], 50)).toBe(0));

  it("covers a transfer inside the window with one ticket", () => {
    expect(countTickets([480, 505], 50)).toBe(1);   // 08:00 then 08:25
  });

  it("needs a second ticket once the window has passed", () => {
    expect(countTickets([480, 535], 50)).toBe(2);   // 08:00 then 08:55
  });

  it("treats the boundary as still valid", () => {
    expect(countTickets([480, 530], 50)).toBe(1);   // exactly 50 minutes later
    expect(countTickets([480, 531], 50)).toBe(2);
  });

  it("restarts the clock from the new ticket, not the first", () => {
    // 08:00, 09:00, 09:40 -> ticket at 08:00, ticket at 09:00 covers 09:40
    expect(countTickets([480, 540, 580], 50)).toBe(2);
  });

  it("does not care what order the boardings arrive in", () => {
    expect(countTickets([535, 480], 50)).toBe(2);
  });

  it("is why the 45 -> 50 minute correction mattered", () => {
    const boardings = [480, 527];                   // 47 minutes apart
    expect(countTickets(boardings, 45)).toBe(2);
    expect(countTickets(boardings, 50)).toBe(1);
  });
});

describe("fareFor", () => {
  const cityTicket: Ticket = {
    id: "city_24pay", zone: "city", price: 2.5, validFor: 50,
    name: { ro: "Bilet", hu: "Jegy" },
  };
  const table: FareTable = { currency: "RON", tickets: [cityTicket] };
  const stops = new Map<string, Stop>([
    ["A", { id: "A", name: { ro: "A", hu: "A" }, at: [0, 0], stationId: "A", zone: "city" }],
    ["B", { id: "B", name: { ro: "B", hu: "B" }, at: [0, 0], stationId: "B", zone: "city" }],
  ]);
  const patternStops = () => ["A", "B"];

  function journeyBoarding(board: number): Journey {
    const ride: RideLeg = {
      kind: "ride", lineId: "1", patternId: "P", fromIndex: 0, toIndex: 1,
      board, alight: board + 5,
    };
    return { legs: [ride], depart: board, arrive: board + 5, walkMinutes: 0, transfers: 0 };
  }

  it("charges the normal fare on a weekday", () => {
    const wednesday = new Date(2026, 7, 19);         // 2026-08-19
    const fare = fareFor(journeyBoarding(480), stops, patternStops, table, wednesday);
    expect(fare?.free).toBe(false);
    expect(fare?.total).toBe(2.5);
  });

  it("is free on Fridays, per Sfântu Gheorghe council's standing promotion", () => {
    const friday = new Date(2026, 7, 21);            // 2026-08-21
    const fare = fareFor(journeyBoarding(480), stops, patternStops, table, friday);
    expect(fare?.free).toBe(true);
    expect(fare?.total).toBe(0);
  });
});
