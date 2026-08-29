/** Notable origin→destination pairs and a representative weekday journey each.
 *
 *  These back the SEO "route pages": one page per unordered pair of hand-picked
 *  places (line termini, big employers, venues, the central square). The
 *  representative journey is computed here, at build time, by the app's own
 *  RAPTOR engine. There is no OSM walking graph in Node, so the WalkingContext
 *  is straight-line - built with the engine's own `stopsNear` / `metresBetween`
 *  so the distances match what the planner would have measured for itself.
 */
import type { LngLat, Network, RideLeg, WalkingContext } from "@/lib/engine/types";
import {
  prepare, stopsNear, metresBetween, planWithWalking,
  MAX_DIRECT_WALK, WALK_PACE, DETOUR,
  type PlanContext,
} from "@/lib/engine/plan";
import { buildPlaces, NOTABLE_PLACE_SLUGS, type Place } from "./places";
import { enrichLine, boardFor, type SeoLang } from "./lines";
import { slugify, disambiguate } from "./slug";

export interface RoutePair {
  /** Canonical pair slug from the HU names; `slugRo` is the independent RO
   *  counterpart. A RO route URL carries `slugRo`. */
  slug: string;
  slugRo: string;
  a: Place;
  b: Place;
}

/** One bus leg of the representative journey, already language-resolved. */
export interface RouteLeg {
  lineLabel: string;
  fromName: string;
  toName: string;
  rideMin: number;
  stops: number;
}

export interface RouteSummary {
  /** Ride legs only - the access/egress walk is folded into `walkMin`. */
  legs: RouteLeg[];
  walkMin: number;
  totalMin: number;
  transfers: number;
  /** Earliest / latest weekday departure of the first line from the boarding
   *  stop, off the operator's printed board; `null` when it has no column. */
  firstDep: number | null;
  lastDep: number | null;
}

/** Codepoint order - `localeCompare` collation varies by build host. */
const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** The canonical slug for a pair, before collision-disambiguation: both place
 *  names folded to slugs, sorted, joined - so (a,b) and (b,a) are one page. */
export function pairSlug(a: Place, b: Place): string {
  return [slugify(a.name.hu), slugify(b.name.hu)].sort(byText).join("-");
}

/** Same shape as `pairSlug` on the Romanian names - the RO route URL. */
export function pairSlugRo(a: Place, b: Place): string {
  return [slugify(a.name.ro), slugify(b.name.ro)].sort(byText).join("-");
}

/** `prepare` walks every stop, pattern, trip and footpath, and `notablePairs`
 *  plans ~180 journeys over one feed - memoise the context per feed. */
const contexts = new WeakMap<Network, PlanContext>();
function contextFor(net: Network): PlanContext {
  let ctx = contexts.get(net);
  if (!ctx) contexts.set(net, (ctx = prepare(net)));
  return ctx;
}

/** Straight-line pedestrian reachability, measured the way the engine measures
 *  it - no walkable graph exists at build time. */
function walkingContext(ctx: PlanContext, from: Place, to: Place): WalkingContext {
  const leg = (at: LngLat, stopAt: LngLat, metres: number, minutes: number, reversed: boolean) => ({
    metres, minutes,
    path: (reversed ? [stopAt, at] : [at, stopAt]) as LngLat[],
  });
  const access = new Map(
    stopsNear(ctx, from.at).map(({ stop, minutes, metres }) =>
      [stop.id, leg(from.at, stop.at, metres, minutes, false)]),
  );
  const egress = new Map(
    stopsNear(ctx, to.at).map(({ stop, minutes, metres }) =>
      [stop.id, leg(to.at, stop.at, metres, minutes, true)]),
  );
  const dm = metresBetween(from.at, to.at) * DETOUR;
  const dMin = Math.max(1, Math.round(dm / WALK_PACE));
  const direct = dMin <= MAX_DIRECT_WALK
    ? { metres: Math.round(dm), minutes: dMin, path: [from.at, to.at] as LngLat[] }
    : null;
  return { access, egress, direct };
}

/** The representative weekday journey from `from` to `to` (~08:00 departure),
 *  or `null` when the planner finds nothing at all. A walk-only answer comes
 *  back with `legs: []` - `notablePairs` treats that as "not a route page". */
export function journeyBetween(
  net: Network, from: Place, to: Place, lang: SeoLang,
): RouteSummary | null {
  const ctx = contextFor(net);
  const journeys = planWithWalking(ctx, {
    from: from.at, to: to.at, time: 8 * 60,
    service: "weekday", mode: "departAt", walkAversion: 0.3,
  }, walkingContext(ctx, from, to), 3);

  const journey = journeys[0] ?? null;
  if (!journey) return null;

  const patternStopId = (patternId: string, i: number) =>
    net.patterns.find((p) => p.id === patternId)!.stopIds[i];
  const stopName = (id: string) => net.stops.find((s) => s.id === id)!.name[lang];

  const rides = journey.legs.filter((l): l is RideLeg => l.kind === "ride");
  const legs: RouteLeg[] = rides.map((leg) => ({
    lineLabel: enrichLine(net, leg.lineId, lang).label,
    fromName: stopName(patternStopId(leg.patternId, leg.fromIndex)),
    toName: stopName(patternStopId(leg.patternId, leg.toIndex)),
    rideMin: leg.alight - leg.board,
    stops: leg.toIndex - leg.fromIndex,
  }));

  let firstDep: number | null = null;
  let lastDep: number | null = null;
  const first = rides[0];
  if (first) {
    const board = boardFor(net, first.lineId, patternStopId(first.patternId, first.fromIndex));
    if (board && board.weekday.length) {
      firstDep = Math.min(...board.weekday);
      lastDep = Math.max(...board.weekday);
    }
  }

  return {
    legs,
    walkMin: journey.walkMinutes,
    totalMin: journey.arrive - journey.depart,
    transfers: journey.transfers,
    firstDep,
    lastDep,
  };
}

/** Every unordered pair of notable places connected by transit in at least one
 *  direction, each with a canonical order-independent slug, sorted by slug.
 *  The memo holds the canonical array; callers get a copy, so a consumer that
 *  sorts or splices the result in place cannot corrupt it. */
const pairLists = new WeakMap<Network, RoutePair[]>();

export function notablePairs(net: Network): RoutePair[] {
  const cached = pairLists.get(net);
  if (cached) return cached.slice();

  const notable = buildPlaces(net).filter((p) => NOTABLE_PLACE_SLUGS.includes(p.slug));

  const connected: Array<{ a: Place; b: Place }> = [];
  for (let i = 0; i < notable.length; i++) {
    for (let j = i + 1; j < notable.length; j++) {
      // `a` is always the place whose name sorts first, so the pair, its slug
      // and the rendered "a → b" direction are all deterministic.
      const [a, b] = byText(slugify(notable[i].name.hu), slugify(notable[j].name.hu)) <= 0
        ? [notable[i], notable[j]] : [notable[j], notable[i]];
      const ab = journeyBetween(net, a, b, "hu");
      const ba = ab && ab.legs.length ? null : journeyBetween(net, b, a, "hu");
      if ((ab && ab.legs.length) || (ba && ba.legs.length)) connected.push({ a, b });
    }
  }

  // Deterministic input order, then push through `disambiguate` so a rare base
  // collision still yields unique paths (its key is already a slug, and
  // slugify is idempotent, so the base it produces is exactly `pairSlug`).
  connected.sort((p, q) => byText(pairSlug(p.a, p.b), pairSlug(q.a, q.b)));
  const slugs = disambiguate(connected, (p) => pairSlug(p.a, p.b));
  // Separate pass: HU and RO collision suffixes are independent.
  const slugsRo = disambiguate(connected, (p) => pairSlugRo(p.a, p.b));

  const result: RoutePair[] = connected.map((p) => ({
    slug: slugs.get(p)!, slugRo: slugsRo.get(p)!, a: p.a, b: p.b,
  }));
  result.sort((x, y) => byText(x.slug, y.slug));
  pairLists.set(net, result);
  return result.slice();
}

/** The pair a slug names, by equality - never by taking the slug apart. A RO
 *  route URL carries `slugRo`, so match on either language's slug. */
export function routeBySlug(net: Network, slug: string): RoutePair | undefined {
  return notablePairs(net).find((p) => p.slug === slug || p.slugRo === slug);
}
