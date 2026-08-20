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
