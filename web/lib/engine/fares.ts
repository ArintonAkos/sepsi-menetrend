/** What a journey costs.
 *
 *  A ticket is validated when you board, so one ticket covers every boarding
 *  that falls inside its window - the transfer itself is free, the clock is not.
 *  Arcuș is outside the city, so any journey touching it needs the dearer ticket.
 */
import type { Journey, Minute, RideLeg, Stop } from "./types";

export interface Ticket {
  id: string;
  zone: "city" | "arcus";
  price: number;
  /** Minutes the ticket stays valid after boarding. */
  validFor: Minute;
  name: { ro: string; hu: string };
}

export interface FareResult {
  ticket: Ticket;
  count: number;
  total: number;
  /** Sfântu Gheorghe's council funds free rides network-wide every Friday,
   *  Arcuș included - confirmed by the operator, not something GTFS encodes. */
  free: boolean;
  /** When each ticket has to be validated. */
  boardings: Minute[];
}

export interface FareTable {
  currency: string;
  tickets: Ticket[];
}

/** Greedy is optimal here: buying a ticket at the first uncovered boarding can
 *  never cover fewer later boardings than buying it any later would. */
export function countTickets(boardings: Minute[], validFor: Minute): number {
  if (!boardings.length) return 0;
  const sorted = [...boardings].sort((a, b) => a - b);
  let count = 1;
  let expires = sorted[0] + validFor;
  for (const b of sorted) {
    if (b > expires) {
      count++;
      expires = b + validFor;
    }
  }
  return count;
}

export function fareFor(
  journey: Journey,
  stops: Map<string, Stop>,
  patternStops: (patternId: string) => string[],
  table: FareTable,
  date: Date,
): FareResult | null {
  const rides = journey.legs.filter((l): l is RideLeg => l.kind === "ride");
  if (!rides.length) return null;

  const touchesArcus = rides.some((leg) => {
    const ids = patternStops(leg.patternId).slice(leg.fromIndex, leg.toIndex + 1);
    return ids.some((id) => stops.get(id)?.zone === "arcus");
  });
  const zone = touchesArcus ? "arcus" : "city";
  const ticket = table.tickets.find((t) => t.zone === zone);
  if (!ticket) return null;

  const boardings = rides.map((r) => r.board);
  const count = countTickets(boardings, ticket.validFor);
  const free = date.getDay() === 5;
  return {
    ticket,
    count,
    free,
    total: free ? 0 : Math.round(count * ticket.price * 100) / 100,
    boardings,
  };
}
