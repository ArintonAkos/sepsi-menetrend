/** The board a rider reads while standing at the pole. */
import { describe, it, expect, beforeAll } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import StopBoard from "./StopBoard";
import { prepare, type PlanContext } from "@/lib/engine/plan";
import { STRINGS } from "@/lib/i18n";
import type { Network, Stop } from "@/lib/engine/types";

let net: Network, ctx: PlanContext, byName: Map<string, Stop>;

beforeAll(() => {
  net = JSON.parse(readFileSync(
    resolve(import.meta.dirname, "../../public/data/network.json"), "utf8"));
  ctx = prepare(net);
  byName = new Map();
  for (const s of net.stops) if (!byName.has(s.name.ro)) byName.set(s.name.ro, s);
});

const show = (name: string, now = 8 * 60) => {
  const stop = byName.get(name);
  if (!stop) throw new Error(`no stop called ${name}`);
  render(<StopBoard stop={stop} ctx={ctx} lines={new Map(net.lines.map((l) => [l.id, l]))}
                    service="weekday" now={now} lang="hu" t={STRINGS.hu}
                    onClose={() => {}} />);
  return stop;
};

describe("a stop's board", () => {
  it("names the stop and lists the lines that call there", () => {
    show("Gara CFR");
    expect(screen.getByText("Vasútállomás")).toBeInTheDocument();
    const times = screen.getAllByText(/^\d{2}:\d{2}\*?$/);
    expect(times.length).toBeGreaterThan(10);
  });

  it("gives a circular line one row per pass, not one merged column", () => {
    /* Line 3 comes through Gara CFR twice a loop, 25 minutes apart. Merged,
       it advertises a service twice as frequent as the one that runs - and
       sends somebody to the stop for a bus heading the other way. */
    show("Gara CFR");
    const rows = screen.getAllByText("3").map((pill) => pill.parentElement!);
    expect(rows.length).toBeGreaterThan(1);
    const firsts = rows.map((row) => within(row).getAllByText(/^\d{2}:\d{2}\*?$/)[0].textContent);
    expect(new Set(firsts).size).toBe(firsts.length);
  });

  it("marks the next bus and dims the ones already gone", () => {
    show("Gara CFR", 12 * 60);
    const times = screen.getAllByText(/^\d{2}:\d{2}\*?$/);
    const gone = times.filter((el) => el.className.includes("past"));
    const next = times.filter((el) => el.className.includes("soon"));
    expect(gone.length).toBeGreaterThan(0);
    expect(next.length).toBeGreaterThan(0);
    // one "next" per line-direction, never more than there are rows
    expect(next.length).toBeLessThanOrEqual(screen.getAllByText(/^\d+D?$/).length);
  });

  it("says a terminus ends there rather than pointing somewhere", () => {
    const terminus = net.patterns
      .map((p) => net.stops.find((s) => s.id === p.stopIds[p.stopIds.length - 1])!)
      .find((s) => !ctx.callsAt.has(s.id))!;
    render(<StopBoard stop={terminus} ctx={ctx}
                      lines={new Map(net.lines.map((l) => [l.id, l]))}
                      service="weekday" now={8 * 60} lang="hu" t={STRINGS.hu}
                      onClose={() => {}} />);
    expect(screen.getAllByText("Itt ér véget").length).toBeGreaterThan(0);
  });

  it("flags the times nobody published rather than passing them off as given", () => {
    const guessed = net.patterns.find((p) => p.published.includes(false))!;
    const index = guessed.published.indexOf(false);
    const stop = net.stops.find((s) => s.id === guessed.stopIds[index])!;
    render(<StopBoard stop={stop} ctx={ctx}
                      lines={new Map(net.lines.map((l) => [l.id, l]))}
                      service="weekday" now={8 * 60} lang="hu" t={STRINGS.hu}
                      onClose={() => {}} />);
    expect(screen.getAllByText(/^\d{2}:\d{2}\*$/).length).toBeGreaterThan(0);
    expect(screen.getByText(/csillaggal/i)).toBeInTheDocument();
  });

  it("does not grey out the whole board once the last bus has gone", () => {
    /* Dimming means "you have missed this one". With nothing left to come it
       means nothing, and a column of grey reads as a fault rather than as the
       end of the service day. */
    show("Gara CFR", 23 * 60 + 59);
    const times = screen.getAllByText(/^\d{2}:\d{2}\*?$/);
    expect(times.length).toBeGreaterThan(0);
    expect(times.filter((el) => el.className.includes("past"))).toHaveLength(0);
  });

  it("tells the two passes of a loop apart by where each one goes next", () => {
    /* Line 3 is signed "traseu circular" whichever way round it is going, so
       both passes through Gara CFR printed the same words and the reader had
       two identical rows to choose between. The stop it leaves for is the only
       thing that separates them. */
    show("Gara CFR");
    const rows = screen.getAllByText("3").map((pill) => pill.parentElement!);
    expect(rows.length).toBeGreaterThan(1);
    const heads = rows.map((row) => within(row).getByText(/^→ /).textContent);
    expect(new Set(heads).size, `both passes read "${heads[0]}"`).toBe(heads.length);
  });

  it("puts buses that finish here after the ones you can board", () => {
    show("Gara CFR");
    const heading = screen.getByText("Ide érkezik");
    const ends = screen.getAllByText("Itt ér véget");
    for (const end of ends)
      expect(heading.compareDocumentPosition(end) & Node.DOCUMENT_POSITION_FOLLOWING,
             "a terminating run was listed above the arrivals heading").toBeTruthy();
  });
});
