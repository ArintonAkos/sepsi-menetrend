/** Local place search.
 *
 *  The whole searchable world here is one small town, so the index ships with
 *  the page and every keystroke is answered offline. A geocoder is only needed
 *  for street addresses with house numbers.
 *
 *  The matching has to be forgiving in a specific way: OpenStreetMap spells the
 *  mall "Sepsi Value Centre", riders type "Center". One transposition. Exact and
 *  prefix matching both miss it, which is why this uses Damerau-Levenshtein.
 */
import type { LngLat } from "./types";

export type PlaceKind = "stop" | "street" | "shop" | "poi" | "place" | "address" | "bikeStation";

export interface Place {
  kind: PlaceKind;
  ro: string;
  hu: string;
  at: LngLat;
  detail?: string;
  aliases?: string[];
  /** Came from the geocoder rather than the local index. */
  remote?: boolean;
  /** Resolved to a street, not a house number. */
  approximate?: boolean;
}

export interface IndexedPlace extends Place {
  tokens: string[];
}

export function tokenise(text: string): string[] {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")   // strip accents: "Csíki" matches "csiki"
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

/** Edit distance counting a transposition as one step. Capped at 3 - we never
 *  care how far apart two words are once they are clearly different. */
export function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 2) return 3;
  const d: number[][] = [];
  for (let i = 0; i <= m; i++) d[i] = [i];
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);   // Center <-> Centre
      }
    }
  }
  return d[m][n];
}

/** Stops win ties: someone typing into a transit planner usually wants one. */
const KIND_BIAS: Record<PlaceKind, number> = {
  stop: -0.6, bikeStation: -0.35, place: -0.2, shop: 0, poi: 0, address: 0.1, street: 0.35,
};

export function buildIndex(places: Place[]): IndexedPlace[] {
  return places.map((p) => ({
    ...p,
    tokens: [...tokenise(p.ro), ...tokenise(p.hu), ...(p.aliases ?? []).flatMap(tokenise)],
  }));
}

/** Lower is better. null means at least one query word matched nothing. */
export function score(place: IndexedPlace, queryTokens: string[]): number | null {
  let total = 0;
  for (const q of queryTokens) {
    let best = Infinity;
    for (const w of place.tokens) {
      if (w === q) { best = 0; break; }
      if (w.startsWith(q)) { best = Math.min(best, q.length >= 3 ? 0.2 : 0.6); continue; }
      if (q.length >= 4) {
        const d = editDistance(q, w);
        if (d <= 1) best = Math.min(best, 1);
        else if (d === 2 && q.length >= 6) best = Math.min(best, 2);
      }
    }
    if (best === Infinity) return null;
    total += best;
  }
  return total + KIND_BIAS[place.kind];
}

export function search(index: IndexedPlace[], query: string, limit = 7): IndexedPlace[] {
  const qt = tokenise(query);
  if (!qt.length) return [];
  const hits: Array<{ place: IndexedPlace; s: number }> = [];
  for (const place of index) {
    const s = score(place, qt);
    if (s !== null && s < 3) hits.push({ place, s });
  }
  hits.sort((a, b) => a.s - b.s);
  return hits.slice(0, limit).map((h) => h.place);
}
