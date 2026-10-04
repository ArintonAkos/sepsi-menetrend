/** What a line page needs, derived straight from the feed.
 *
 *  A line page is one URL per `Line.id` in each language: a spoken-form name
 *  ("1-es busz" / "linia 1"), the two termini, the distinct direction
 *  sequences, and - for a stop on the line - the operator's own printed
 *  departure board with a headway read off it. None of this is planning; the
 *  page links to the live planner for that. */
import type { Network } from "@/lib/engine/types";
import { pickName } from "./lang";
import { buildPlaces } from "./places";
import type { SeoLang } from "./lang";

export type { SeoLang };

/** Spoken Hungarian line names take a suffix by vowel harmony, which no rule
 *  gets right from the digits alone ("hatos", not "hatas"). This feed's lines
 *  are a closed set, so the suffixed stem is just tabulated. */
const HU_STEM: Record<string, string> = {
  "1": "1-es",
  "2": "2-es",
  "3": "3-as",
  "4": "4-es",
  "5": "5-ös",
  "6": "6-os",
  "7": "7-es",
  "9": "9-es",
  "10": "10-es",
};

function huLabel(id: string): string {
  // "1D" is read "egydé-s", "1B" "egybé-s" - the whole id keeps its case and
  // takes "-s".
  if (id.endsWith("D") || id.endsWith("B")) return `${id}-s busz`;
  const stem = HU_STEM[id];
  if (stem) return `${stem} busz`;
  // A digit-only id a future feed adds that nobody tabulated: "-es" is the
  // most common suffix and reads acceptably.
  return `${id}-es busz`;
}

/** `"1-es busz"` (hu) / `"linia 1"` (ro). The id keeps its case - "1D" stays
 *  "1D", not "1d". */
function lineLabel(id: string, lang: SeoLang): string {
  if (lang === "hu") return huLabel(id);
  if (lang === "ro") return `linia ${id}`;
  return `line ${id}`;
}

/** Upper-case the first character, leave the rest. A no-op on a label that
 *  already starts with a digit ("1-es busz"). */
export const sentenceCase = (s: string): string =>
  s.charAt(0).toUpperCase() + s.slice(1);

export interface LineDirection {
  patternId: string;
  headsign: { hu: string; ro: string };
  stopIds: string[];
}

/** One entry per distinct stop sequence the line runs, longest first.
 *
 *  Several patterns can share a sequence (a weekday and a school-day trip, say);
 *  the page wants the route once, so they collapse on the sequence and the
 *  first pattern seen supplies the id and headsign. */
export function lineDirections(net: Network, lineId: string): LineDirection[] {
  const seen = new Map<string, LineDirection>();
  for (const p of net.patterns) {
    if (p.lineId !== lineId) continue;
    const key = JSON.stringify(p.stopIds);
    if (seen.has(key)) continue;
    seen.set(key, {
      patternId: p.id,
      headsign: { hu: p.headsign.hu, ro: p.headsign.ro },
      stopIds: p.stopIds,
    });
  }
  // Stable sort: equal-length directions keep feed order.
  return [...seen.values()].sort((a, b) => b.stopIds.length - a.stopIds.length);
}

export interface EnrichedLine {
  id: string;
  label: string;
  title: string;
  termini: [string, string];
  colour: string;
  textColour: string;
}

/** The line's page header for one language. Termini come from the primary
 *  direction - the one calling at the most stops, which is the fullest picture
 *  of where the line runs end to end. */
export function enrichLine(
  net: Network,
  lineId: string,
  lang: SeoLang,
): EnrichedLine {
  const line = net.lines.find((l) => l.id === lineId);
  if (!line) throw new Error(`unknown line: ${lineId}`);

  const primary = lineDirections(net, lineId)[0];
  const nameOf = (stopId: string | undefined): string => {
    const s = net.stops.find((st) => st.id === stopId);
    return s ? pickName(s.name, lang) : stopId ?? "";
  };
  const termini: [string, string] = primary
    ? [nameOf(primary.stopIds[0]), nameOf(primary.stopIds.at(-1))]
    : ["", ""];

  const label = lineLabel(lineId, lang);
  return {
    id: lineId,
    label,
    title: `${sentenceCase(label)} · ${termini[0]} – ${termini[1]}`,
    termini,
    colour: line.colour,
    textColour: line.textColour,
  };
}

export interface Board {
  weekday: number[];
  weekend: number[];
}

/** Ascending, de-duplicated union of a base list and its marked extras - the
 *  marked departures are D-extension trips the operator prints on the same
 *  column, and they leave this stop for real. */
function mergeDepartures(base: number[], marked?: number[]): number[] {
  return [...new Set([...base, ...(marked ?? [])])].sort((a, b) => a - b);
}

/** The operator's printed board for `lineId` at `stopId`, or `null` if the
 *  line has no column there. Every `officialBoards` row in this feed carries a
 *  `stopId`. */
export function boardFor(
  net: Network,
  lineId: string,
  stopId: string,
): Board | null {
  const row = net.officialBoards?.find(
    (b) => b.lineId === lineId && b.stopId === stopId,
  );
  if (!row) return null;
  return {
    weekday: mergeDepartures(row.weekday, row.markedWeekday),
    weekend: mergeDepartures(row.weekend, row.markedWeekend),
  };
}

export interface Span {
  first: number;
  last: number;
}

/** First and last departure per service, `null` for a service that never runs
 *  from this stop. */
export function firstLast(board: Board): {
  weekday: Span | null;
  weekend: Span | null;
} {
  const span = (xs: number[]): Span | null =>
    xs.length ? { first: Math.min(...xs), last: Math.max(...xs) } : null;
  return { weekday: span(board.weekday), weekend: span(board.weekend) };
}

/** The line's cadence in minutes, or `null` when the board is too irregular to
 *  name one. The modal gap between consecutive departures counts as the
 *  headway only if at least 60 % of the gaps sit within ±2 min of it - enough
 *  to absorb a shifted midday trip, not enough to call a scatter a schedule. */
export function headway(times: number[]): number | null {
  if (times.length < 2) return null;
  const sorted = [...times].sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) gaps.push(sorted[i] - sorted[i - 1]);

  const freq = new Map<number, number>();
  for (const g of gaps) freq.set(g, (freq.get(g) ?? 0) + 1);
  // Most frequent gap; the smaller value wins a tie so a real short cadence is
  // not masked by an equally common long break.
  let mode = gaps[0];
  let modeN = 0;
  for (const [g, n] of freq) {
    if (n > modeN || (n === modeN && g < mode)) {
      mode = g;
      modeN = n;
    }
  }

  const near = gaps.filter((g) => Math.abs(g - mode) <= 2).length;
  return near / gaps.length >= 0.6 ? mode : null;
}

/** One bus in a line page's every-stop grid: its time at each of the
 *  direction's stops, in the direction's stop order. */
export interface GridRun {
  /** The trip's own line - the page's line, or a lettered variant (1D, 10B)
   *  whose buses cover this same stretch and sit on the same printed board. */
  lineId: string;
  /** `null` where this run does not call at the stop. */
  times: (number | null)[];
  /** Per stop: we worked the time out rather than the operator printing it. */
  estimated: boolean[];
  /** Runs only on school-term weekdays. */
  schoolOnly: boolean;
}

export interface StopGrid {
  weekday: GridRun[];
  weekend: GridRun[];
}

/** Where each of `stopIds` falls in `pattern`, matched in order from the
 *  direction's first stop; `null` for a stop the pattern skips. `null` overall
 *  when the pattern never calls at the first stop - its buses don't leave from
 *  where this direction's board is printed. Stops match by place, not kerb id:
 *  some variant patterns are bound to the opposite kerb of a stop the base line
 *  uses, and the stop page already treats both kerbs as one stop. */
function alignTo(stopIds: string[], pattern: string[], place: (sid: string) => string):
    (number | null)[] | null {
  const keys = pattern.map(place);
  let at = keys.indexOf(place(stopIds[0]!));
  if (at === -1) return null;
  return stopIds.map((sid, i) => {
    if (i === 0) return at;
    const next = keys.indexOf(place(sid), at + 1);
    if (next === -1) return null;
    at = next;
    return next;
  });
}

/** Every bus in one direction of a line with its time at every stop - what
 *  the operator's single-stop board leaves the rider to work out.
 *
 *  It mirrors that board's contents, so it takes the lettered variants too:
 *  line 1's board at Szemerja prints the 1B/1D departures as marked extras,
 *  and a grid without them would quietly disagree with the board above it.
 *  "Weekday" is the school-term weekday (a superset), with the school-only
 *  runs flagged rather than split into a third table. */
export function stopGrid(net: Network, lineId: string, stopIds: string[]): StopGrid {
  const variant = new RegExp(`^${lineId}[A-Z]$`);
  const runs = { weekday: new Map<string, GridRun>(), weekend: new Map<string, GridRun>() };
  const plainWeekday = new Set<string>();
  const patterns = new Map(net.patterns.map((p) => [p.id, p]));
  const placeKey = new Map<string, string>();
  for (const pl of buildPlaces(net)) for (const sid of pl.stopIds) placeKey.set(sid, pl.slug);
  const place = (sid: string) => placeKey.get(sid) ?? sid;

  for (const trip of net.trips) {
    const p = patterns.get(trip.patternId);
    if (!p || (p.lineId !== lineId && !variant.test(p.lineId))) continue;
    const idx = alignTo(stopIds, p.stopIds, place);
    if (!idx) continue;
    // the page's own line runs exactly this sequence; a variant only needs to
    // share the start and most of the stretch
    if (p.lineId === lineId && idx.some((i) => i === null)) continue;
    if (idx.filter((i) => i !== null).length < Math.min(2, stopIds.length)) continue;

    const key = `${p.id}@${trip.start}`;
    if (trip.service === "weekday") plainWeekday.add(key);
    const bucket = trip.service === "weekend" ? runs.weekend : runs.weekday;
    if (bucket.has(key)) continue;
    bucket.set(key, {
      lineId: p.lineId,
      times: idx.map((i) => (i === null ? null : trip.start + p.offsets[i]!)),
      estimated: idx.map((i) => i !== null && !p.published[i]),
      schoolOnly: false,
    });
  }

  for (const [key, run] of runs.weekday) run.schoolOnly = !plainWeekday.has(key);
  const ordered = (m: Map<string, GridRun>) =>
    [...m.values()].sort((a, b) => a.times[0]! - b.times[0]!);
  return { weekday: ordered(runs.weekday), weekend: ordered(runs.weekend) };
}
