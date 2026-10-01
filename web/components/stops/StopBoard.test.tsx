/** The board a rider reads while standing at the pole. */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
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

/* Keep one test's popup from becoming another test's board. */
beforeEach(cleanup);

const inferredContext = () => prepare({ ...net, officialBoards: [] });

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

  it("shows an exact official board before the inferred route timetable", () => {
    const stop = byName.get("Gara CFR")!;
    const sourceCtx = prepare({
      ...net,
      officialBoards: [{
        stopRo: "Gara CFR", lineId: "2D", destination: "Câmpul Frumos / Szépmező",
        weekday: [7 * 60 + 17], weekend: [7 * 60 + 17],
      }],
    });
    const sourceBoard = render(<StopBoard stop={stop} ctx={sourceCtx}
                                          lines={new Map(net.lines.map((l) => [l.id, l]))}
                                          service="weekday" now={7 * 60} lang="hu" t={STRINGS.hu}
                                          onClose={() => {}} />);

    expect(sourceBoard.getByText("07:17")).toBeInTheDocument();
    expect(sourceBoard.getByText("→ Câmpul Frumos / Szépmező")).toBeInTheDocument();
  });

  it("keeps equal-name circular platforms on their own official destination", () => {
    // Sept 7's clean depart/return split retired the old "Str. Fabricii / Gyár
    // utca" destination (that was the pre-timetable_segments circular-slicing
    // model); "Biserica reformată" is the current equal-name case on line 4 -
    // two physical kerbs (P8, P12), each with its own official destination.
    const board = (net.officialBoards ?? []).find((candidate) =>
      candidate.lineId === "4" &&
      candidate.stopRo === "Biserica Reformată" &&
      candidate.destination === "Str. Țigaretei 1 / Cigaretta utca 1")!;
    const stop = net.stops.find((candidate) => candidate.id === board.stopId)!;
    render(<StopBoard stop={stop} ctx={ctx}
                      lines={new Map(net.lines.map((line) => [line.id, line]))}
                      service="weekday" now={4 * 60} lang="hu" t={STRINGS.hu}
                      onClose={() => {}} />);

    expect(screen.getAllByText("→ Str. Țigaretei 1 / Cigaretta utca 1").length).toBeGreaterThan(0);
    // this kerb's first weekday departure (04:46 on the Oct 1 2026 board)
    expect(screen.getAllByText("04:46").length).toBeGreaterThan(0);
    expect(screen.queryByText("→ Câmpul Frumos / Szépmező")).toBeNull();
    expect(screen.queryByText("06:13")).toBeNull();
  });

  it("still shows a line that only has an inferred call at a pole another line prints a column for", () => {
    // Reported live: "Str. Constructorilor 2" prints an official column for
    // line 4, but 1D/2D/5D genuinely stop there too (no printed column of
    // their own) - the pole-wide suppression this replaces hid them entirely,
    // even though the route line drawn on the map clearly passes through.
    const stop = net.stops.find((candidate) => candidate.id === "P86")!;
    render(<StopBoard stop={stop} ctx={ctx}
                      lines={new Map(net.lines.map((line) => [line.id, line]))}
                      service="weekday" now={8 * 60} lang="hu" t={STRINGS.hu}
                      onClose={() => {}} />);
    const pills = new Set(screen.getAllByText(/^\d+[A-Z]?$/).map((el) => el.textContent));
    expect(pills).toContain("4");     // the official column
    expect(pills).toContain("1D");    // an inferred call, no printed column here
    expect(pills).toContain("2D");
  });

  it("does not mix inferred route calls into a physical board with official columns", () => {
    const returnDebren = net.stops.find((candidate) => candidate.id === "P18")!;
    render(<StopBoard stop={returnDebren} ctx={ctx}
                      lines={new Map(net.lines.map((line) => [line.id, line]))}
                      service="weekday" now={8 * 60} lang="hu" t={STRINGS.hu}
                      onClose={() => {}} />);

    // On the Oct 1 2026 board lines 2, 2D and 6 are all bidirectional and
    // this return kerb runs all three toward the Simeria terminus; line 10
    // and its new 10B extension (added the same day) both head to Arcuș.
    // All five are official columns - no inferred rows, no interpolated-time
    // note.
    expect(screen.getAllByText(
      "→ Simeria (Str. Berzei) / Szemerja Végállomás (via Cart. Ciucului)")).toHaveLength(3);
    expect(screen.getAllByText("→ Arcuș / Árkos")).toHaveLength(2);
    expect(screen.queryByText(/csillaggal/i)).toBeNull();
  });

  it("keeps the two separately published Debren boards on their own kerbs", () => {
    const lines = new Map(net.lines.map((line) => [line.id, line]));
    const outbound = net.stops.find((candidate) => candidate.id === "P17")!;
    const first = render(<StopBoard stop={outbound} ctx={ctx} lines={lines}
                                    service="weekday" now={8 * 60} lang="hu" t={STRINGS.hu}
                                    onClose={() => {}} />);
    // Sept 7 board: lines 2 and 6 leave this outbound kerb toward Gara CFR and
    // the Arena respectively (both via Cart. Ciucului); line 10 is not here.
    expect(first.getByText("→ Gara CFR / Vasútállomás (via Cart. Ciucului)")).toBeInTheDocument();
    expect(first.getByText("→ Arena Sepsi / Sepsi Aréna (via Cart. Ciucului)")).toBeInTheDocument();
    expect(first.queryByText("→ Arcuș / Árkos")).toBeNull();
    first.unmount();

    const returnKerb = net.stops.find((candidate) => candidate.id === "P18")!;
    render(<StopBoard stop={returnKerb} ctx={ctx} lines={lines}
                      service="weekday" now={8 * 60} lang="hu" t={STRINGS.hu}
                      onClose={() => {}} />);
    // line 10 and the new 10B extension (added 2026-10-01) both head to Arcuș
    expect(screen.getAllByText("→ Arcuș / Árkos")).toHaveLength(2);
    // the return kerb: lines 2, 2D and 6 all run back toward the Simeria terminus
    expect(screen.getAllByText(
      "→ Simeria (Str. Berzei) / Szemerja Végállomás (via Cart. Ciucului)")).toHaveLength(3);
    // (the Oct 1 2026 board's marked-departure dedup is covered directly on
    // boardFor() in lines.test.ts - at this stop lines 2 and 2D now run such
    // an overlapping schedule that no single departure time is unique to
    // either column any more, so it can't be asserted through rendered text)
    expect(screen.queryByText("→ Gara CFR / Vasútállomás (via Cart. Ciucului)")).toBeNull();
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
    // one "next" per line-direction, never more than there are rows. A line
    // id is a number with an optional letter suffix (1B, 2D, ...), not just
    // an optional "D" - a hub like Gara CFR now also shows lines whose only
    // column here is an inferred one (see the per-line official/inferred
    // split above), including letter-suffixed ids.
    expect(next.length).toBeLessThanOrEqual(screen.getAllByText(/^\d+[A-Z]?$/).length);
  });

  it("says a terminus ends there rather than pointing somewhere", () => {
    const inferred = inferredContext();
    const terminus = net.patterns
      .map((p) => net.stops.find((s) => s.id === p.stopIds[p.stopIds.length - 1])!)
      .find((s) => !inferred.callsAt.has(s.id))!;
    render(<StopBoard stop={terminus} ctx={inferred}
                      lines={new Map(net.lines.map((l) => [l.id, l]))}
                      service="weekday" now={8 * 60} lang="hu" t={STRINGS.hu}
                      onClose={() => {}} />);
    expect(screen.getAllByText("Itt ér véget").length).toBeGreaterThan(0);
  });

  it("flags the times nobody published rather than passing them off as given", () => {
    const inferred = inferredContext();
    const guessed = net.patterns.find((p) => p.published.includes(false))!;
    const index = guessed.published.indexOf(false);
    const stop = net.stops.find((s) => s.id === guessed.stopIds[index])!;
    render(<StopBoard stop={stop} ctx={inferred}
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
    const stop = byName.get("Gara CFR")!;
    const sourceCtx = prepare({
      ...net,
      officialBoards: [{
        stopRo: "Gara CFR", lineId: "2D", destination: "Câmpul Frumos / Szépmező",
        weekday: [8 * 60], weekend: [8 * 60],
      }],
    });
    render(<StopBoard stop={stop} ctx={sourceCtx}
                      lines={new Map(net.lines.map((l) => [l.id, l]))}
                      service="weekday" now={23 * 60 + 59} lang="hu" t={STRINGS.hu}
                      onClose={() => {}} />);
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
    const stop = byName.get("Gara CFR")!;
    render(<StopBoard stop={stop} ctx={inferredContext()}
                      lines={new Map(net.lines.map((l) => [l.id, l]))}
                      service="weekday" now={8 * 60} lang="hu" t={STRINGS.hu}
                      onClose={() => {}} />);
    const heading = screen.getByText("Ide érkezik");
    const ends = screen.getAllByText("Itt ér véget");
    for (const end of ends)
      expect(heading.compareDocumentPosition(end) & Node.DOCUMENT_POSITION_FOLLOWING,
             "a terminating run was listed above the arrivals heading").toBeTruthy();
  });
});
