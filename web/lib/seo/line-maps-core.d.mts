/** Type declarations for `line-maps-core.mjs` — the pure core the
 *  `line-maps.ts` barrel re-exports and `scripts/gen-maps.mjs` runs directly.
 *  Kept alongside the `.mjs` so `LinePage` and the Vitest suite stay typed. */

/** The Static Images style path segment, e.g. `mapbox/light-v11`. */
export const MAP_STYLE: string;
export const MAP_W: number;
export const MAP_H: number;
export const MAP_RETINA: boolean;
export const MAP_STROKE_W: number;
export const MAP_STROKE_O: number;
export const MAP_PADDING: number;

/** Google "encoded polyline algorithm format", precision 1e5.
 *  Input coords are `[lng, lat]`; the format encodes latitude first. */
export function encodePolyline(coords: [number, number][]): string;

/** `line-1-0`, `line-1D-1`, … — `dirIndex` is the index into `lineDirections()`. */
export function lineMapName(lineId: string, dirIndex: number): string;

export interface LineMapInput {
  /** the pattern polyline, `[lng, lat][]` */
  shape: [number, number][];
  /** first + last stop coords, `[lng, lat]` */
  termini: [[number, number], [number, number]];
  /** the line's `light` hex, e.g. `"#E8A33D"` */
  colour: string;
}

/** sha256 (hex) over a stable JSON of the geometry (coords rounded to 5 dp) +
 *  the normalised colour + the fixed render params. Same input → same hash. */
export function lineMapHash(input: LineMapInput): string;

/** The full Mapbox Static Images API URL for one line-direction. `token` is
 *  interpolated verbatim as `access_token`. */
export function staticMapUrl(input: LineMapInput, token: string): string;
