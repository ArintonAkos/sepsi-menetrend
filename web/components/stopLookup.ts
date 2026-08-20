import type { LngLat, Network } from "@/lib/engine/types";

/** Stop coordinates by id, shared between the panel and the map.
 *
 *  It lives in its own module on purpose: the map is loaded lazily, and
 *  importing anything from that file eagerly would pull Mapbox GL back into
 *  the first-load bundle.
 */
let cache: Map<string, LngLat> | null = null;

export function primeStops(network: Network) {
  cache = new Map(network.stops.map((s) => [s.id, s.at]));
}

export function stopAt(id: string): LngLat | undefined {
  return cache?.get(id);
}
