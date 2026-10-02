/** Mapbox styles and the layer order that keeps routes visible.
 *
 *  The basemap paints white casings under its streets. Dropping route lines in
 *  at the default position puts them under those casings, which is why the
 *  first prototype had roads slicing through every line. Routes belong above
 *  every fill and line the style draws, but below its labels.
 */
import type { Map as MapboxMap } from "mapbox-gl";

export const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

export const STYLES = {
  light: "mapbox://styles/mapbox/streets-v12",
  dark: "mapbox://styles/mapbox/dark-v11",
} as const;

/** The id of the first label layer - insert before this one. */
export function labelAnchor(map: MapboxMap): string | undefined {
  const layers = map.getStyle()?.layers ?? [];
  for (let i = layers.length - 1; i >= 0; i--) {
    if (layers[i].type !== "symbol") return layers[i + 1]?.id;
  }
  return undefined;
}

/** In dark mode the casing has to be lighter than the ground, or line 10 -
 *  which is officially pure black - disappears completely. */
export const casingColour = (dark: boolean) => (dark ? "#AFB79B" : "#FFFFFF");
export const networkColour = (dark: boolean) => (dark ? "#4A5340" : "#B9B6A6");

/** Top padding of a fitted route on a phone: the back and locate buttons. */
export const FIT_TOP_NARROW = 60;
/** The least height a route is ever squeezed into above the drawer. */
const MIN_ROUTE_STRIP = 90;

/** How much of the map's bottom edge to keep clear when fitting a route.
 *
 *  While a journey is open the map runs the full height of the screen with the
 *  drawer lying over its lower half, so centring in the map centres the route
 *  behind the drawer. Padding the covered strip puts it in the middle of what
 *  can actually be seen.
 *
 *  Every input is checked. Mapbox rejects the whole padding object if one edge
 *  is not a number, and the numbers here come from a measured element and a
 *  dragged drawer - either can be absent for a frame, and `Math.min` turns one
 *  `undefined` into a NaN that takes the fit down with it.
 */
export function bottomInset(covered: number, containerHeight: number): number {
  const height = Number.isFinite(containerHeight) ? Math.max(0, containerHeight) : 0;
  const hidden = Number.isFinite(covered) ? Math.max(0, covered) : 0;
  /* The cap used to be a flat 62% of the map, below the drawer's own resting
     72% - so even a correct fit ran the route's lower part under the drawer.
     Now the drawer is cleared in full, and only a drawer pulled so high that
     nothing would be left gives way, to a strip under the top controls. */
  const room = Math.max(0, height - FIT_TOP_NARROW - MIN_ROUTE_STRIP);
  return Math.max(40, Math.min(hidden + 24, room));
}
