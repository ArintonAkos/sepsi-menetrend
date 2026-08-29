/** Clustering raw stops into physical places, one page per real-world location.
 *
 *  A street stop is two kerbs facing each other: two Stop rows, one name, a few
 *  metres apart, and in this feed `stationId` does not join them. A search
 *  engine wants one page for "Csíki utca 2", not two near-duplicates, so the
 *  SEO pages are built over Place. The planner still routes on kerbs - this
 *  merge is presentation only. */
import type { LngLat, Network } from "@/lib/engine/types";
import { slugify, disambiguate } from "./slug";

export interface Place {
  slug: string;
  /** Internal dedup identity: folded HU name + rounded centroid. Survives a
   *  feed rebuild that renumbers stop ids; never shown to anyone. */
  key: string;
  name: { hu: string; ro: string };
  at: LngLat;
  stopIds: string[];
}

/** Same physical place when the folded HU name matches and the kerbs are close -
 *  as the crow flies, or by a stored footpath that runs a little longer. */
const NEAR_METRES = 150;
const WALK_METRES = 200;

/** Great-circle metres between two lng/lat points. Local by design: the
 *  engine's helper is an equirectangular approximation bundled with the whole
 *  planner, and clustering has no reason to pull that in. */
function haversine(a: LngLat, b: LngLat): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Codepoint order, not `localeCompare` - collation rules vary by build host
 *  and some drop the hyphens our slugs are made of. */
const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** The value that occurs most often, earliest-seen winning ties - keeps the
 *  display name stable when two kerbs are labelled slightly differently. */
function mostCommon(xs: string[]): string {
  const count = new Map<string, number>();
  for (const x of xs) count.set(x, (count.get(x) ?? 0) + 1);
  let best = "";
  let bestN = 0;
  for (const x of xs) {
    const n = count.get(x)!;
    if (n > bestN) {
      best = x;
      bestN = n;
    }
  }
  return best;
}

interface Cluster {
  huName: string;
  roName: string;
  at: LngLat;
  stopIds: string[];
}

/** Merge the kerbs of each physical location into one Place, sorted by slug. */
export function buildPlaces(network: Network): Place[] {
  const stops = network.stops;
  const indexById = new Map(stops.map((s, i) => [s.id, i]));

  // union-find over stop indices
  const parent = stops.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]];
    return i;
  };
  const union = (a: number, b: number) => {
    parent[find(a)] = find(b);
  };

  // stop pairs joined by a short stored footpath, keyed "lo|hi"
  const walkClose = new Set<string>();
  for (const w of network.walks) {
    if (w.metres > WALK_METRES) continue;
    const a = indexById.get(w.from);
    const b = indexById.get(w.to);
    if (a === undefined || b === undefined) continue;
    walkClose.add(a < b ? `${a}|${b}` : `${b}|${a}`);
  }

  // group by folded HU name, then union the members that also sit close
  const byName = new Map<string, number[]>();
  stops.forEach((s, i) => {
    const folded = slugify(s.name.hu);
    const list = byName.get(folded);
    if (list) list.push(i);
    else byName.set(folded, [i]);
  });
  for (const members of byName.values()) {
    for (let x = 0; x < members.length; x++) {
      for (let y = x + 1; y < members.length; y++) {
        const i = members[x];
        const j = members[y];
        const pair = i < j ? `${i}|${j}` : `${j}|${i}`;
        if (haversine(stops[i].at, stops[j].at) <= NEAR_METRES || walkClose.has(pair)) {
          union(i, j);
        }
      }
    }
  }

  // collect clusters
  const byRoot = new Map<number, number[]>();
  stops.forEach((_, i) => {
    const r = find(i);
    const list = byRoot.get(r);
    if (list) list.push(i);
    else byRoot.set(r, [i]);
  });

  const clusters: Cluster[] = [];
  for (const members of byRoot.values()) {
    const memberStops = members.map((i) => stops[i]);
    const stopIds = memberStops.map((s) => s.id).sort(byText);
    // feed names are never empty, but an empty pick would slug to "" - guard it
    const huName = mostCommon(memberStops.map((s) => s.name.hu)) || stopIds[0];
    const roName = mostCommon(memberStops.map((s) => s.name.ro)) || huName;
    const at: LngLat = [mean(memberStops.map((s) => s.at[0])), mean(memberStops.map((s) => s.at[1]))];
    clusters.push({ huName, roName, at, stopIds });
  }

  // a stable input order so disambiguate's -2/-3 suffixes are deterministic
  clusters.sort(
    (a, b) =>
      byText(slugify(a.huName), slugify(b.huName)) || byText(a.stopIds[0], b.stopIds[0]),
  );

  const slugs = disambiguate(clusters, (c) => c.huName);
  const places: Place[] = clusters.map((c) => ({
    slug: slugs.get(c)!,
    key: `${slugify(c.huName)}@${c.at.map((n) => n.toFixed(3)).join(",")}`,
    name: { hu: c.huName, ro: c.roName },
    at: c.at,
    stopIds: c.stopIds,
  }));

  places.sort((a, b) => byText(a.slug, b.slug));
  return places;
}

/** The place a kerb belongs to, for "served by" links on stop and route pages. */
export function placeOf(places: Place[], stopId: string): Place | undefined {
  return places.find((p) => p.stopIds.includes(stopId));
}

/** Places worth a hand-written blurb and the sitemap's priority tier - transit
 *  anchors people actually search by name (line termini, big employers, venues,
 *  schools, the central square). Held as `slug`, not `key`, because a slug is
 *  stable and legible; a later task filters `places` on it. */
export const NOTABLE_PLACE_SLUGS: readonly string[] = [
  "vasutallomas", // train station / Gara CFR - lines 1, 2, 7, 9 hub
  "szemerja-vegallomas", // Cap Linie Simeria - west trunk terminus (1, 1D, 7)
  "multi-trans", // operator depot - east terminus of every D-line plus 4 and 5
  "szepmezo", // Câmpul Frumos - line 4 terminus, headsign of 1D/2D/4/5D
  "megyei-korhaz", // county hospital / Spitalul Județean - line 2 terminus
  "sepsi-arena", // arena - lines 5 and 6 terminus, largest event venue
  "sugasfurdo", // Șugaș Băi spa resort - line 9 terminus
  "labashaz", // Casa cu Arcade - old-town landmark, line 10 terminus
  "arkos-kozpont", // Arcuș village centre - line 10 terminus
  "autoliv", // Autoliv plant - the town's largest single employer
  "bevasarlokozpont", // the shopping centre / Centru Comercial
  "kalvin-ter", // Piața Kálvin - central old-town square and interchange
  "vitez-mihaly-liceum", // Mihai Viteazul college - large high school
  "plugor-sandor-liceum", // Plugor Sándor college - large high school
];
