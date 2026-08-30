/** What a line page needs, derived straight from the feed.
 *
 *  A line page is one URL per `Line.id` in each language: a spoken-form name
 *  ("1-es busz" / "linia 1"), the two termini, the distinct direction
 *  sequences, and - for a stop on the line - the operator's own printed
 *  departure board with a headway read off it. None of this is planning; the
 *  page links to the live planner for that. */
import type { Network } from "@/lib/engine/types";

/** The SEO pages are bilingual only - the feed's name objects carry no `en`. */
export type SeoLang = "hu" | "ro";

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
  // "1D" is read "egydé-s" - the whole id keeps its case and takes "-s".
  if (id.endsWith("D")) return `${id}-s busz`;
  const stem = HU_STEM[id];
  if (stem) return `${stem} busz`;
  // A digit-only id a future feed adds that nobody tabulated: "-es" is the
  // most common suffix and reads acceptably.
  return `${id}-es busz`;
}

/** `"1-es busz"` (hu) / `"linia 1"` (ro). The id keeps its case - "1D" stays
 *  "1D", not "1d". */
function lineLabel(id: string, lang: SeoLang): string {
  return lang === "hu" ? huLabel(id) : `linia ${id}`;
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
  const nameOf = (stopId: string | undefined): string =>
    net.stops.find((s) => s.id === stopId)?.name[lang] ?? stopId ?? "";
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
