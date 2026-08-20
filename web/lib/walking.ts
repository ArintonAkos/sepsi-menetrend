/** Real footpaths for the walk to the first stop and from the last one.
 *
 *  The planner ranks journeys on a straight line times a detour factor, which
 *  is fine for choosing between them and wrong for drawing: a straight line
 *  cuts through blocks and across the Olt. Once a journey is on screen we ask
 *  the router for the path people would actually take, crossings included.
 *
 *  Live only. Mapbox's terms do not allow storing these, so the cache below is
 *  a per-session map that dies with the tab - never localStorage, never shipped
 *  in the bundle. The transfer walks that *are* shipped come from OSRM instead.
 */
import { MAPBOX_TOKEN } from "./mapbox";
import type { LngLat } from "./engine/types";

export interface FootPath { path: LngLat[]; metres: number; minutes: number }

const cache = new Map<string, FootPath | null>();
const key = (a: LngLat, b: LngLat) =>
  `${a[0].toFixed(5)},${a[1].toFixed(5)}>${b[0].toFixed(5)},${b[1].toFixed(5)}`;

export async function routeOnFoot(from: LngLat, to: LngLat,
                                  signal?: AbortSignal): Promise<FootPath | null> {
  if (!MAPBOX_TOKEN) return null;
  const id = key(from, to);
  const hit = cache.get(id);
  if (hit !== undefined) return hit;

  const coords = `${from[0]},${from[1]};${to[0]},${to[1]}`;
  const url = new URL(`https://api.mapbox.com/directions/v5/mapbox/walking/${coords}`);
  url.search = new URLSearchParams({
    geometries: "geojson", overview: "full", access_token: MAPBOX_TOKEN,
  }).toString();
  try {
    const response = await fetch(url, { signal });
    if (!response.ok) return null;
    const route = (await response.json()).routes?.[0];
    if (!route) { cache.set(id, null); return null; }
    const found: FootPath = {
      path: route.geometry.coordinates as LngLat[],
      metres: Math.round(route.distance),
      minutes: Math.max(1, Math.round(route.duration / 60)),
    };
    cache.set(id, found);
    return found;
  } catch {
    return null;                       // an aborted request must not be cached
  }
}

/** A leg still holding the planner's straight line rather than a real path. */
export const isStraightLine = (path: LngLat[]) => path.length <= 2;
