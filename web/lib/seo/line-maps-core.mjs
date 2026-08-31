/** The pure core of the baked static route maps.
 *
 *  Shared verbatim by the `lib/seo/line-maps.ts` barrel (which the `LinePage`
 *  server component and the Vitest suite import) and by `scripts/gen-maps.mjs`
 *  (which runs before the TypeScript is compiled and so cannot import a `.ts`).
 *  This is the single source of truth — there is no second copy to keep in
 *  sync. Plain ESM, `node:crypto` only: no `node:fs`, no network. `staticMapUrl`
 *  only *builds* the request URL; `lineMapHash` is the content-hash gate that
 *  keeps the build from re-fetching an unchanged line. */
import { createHash } from "node:crypto";

/* ---- the fixed render parameters ----
 *
 *  These feed both the Mapbox request and the content hash: a change to any
 *  of them must invalidate every baked image, so they are hashed alongside
 *  the geometry. */
export const MAP_STYLE = "mapbox/light-v11";
export const MAP_W = 640;
export const MAP_H = 360;
export const MAP_RETINA = false;
export const MAP_STROKE_W = 4;
export const MAP_STROKE_O = 0.9;
export const MAP_PADDING = 28;

/** Google "encoded polyline algorithm format", precision 1e5.
 *
 *  Input coords are `[lng, lat]` (the feed's `LngLat` order); the format
 *  encodes latitude first, then longitude. */
export function encodePolyline(coords) {
  let out = "";
  let prevLat = 0;
  let prevLng = 0;
  for (const [lng, lat] of coords) {
    const latE5 = Math.round(lat * 1e5);
    const lngE5 = Math.round(lng * 1e5);
    out += encodeSignedValue(latE5 - prevLat);
    out += encodeSignedValue(lngE5 - prevLng);
    prevLat = latE5;
    prevLng = lngE5;
  }
  return out;
}

/** One delta, zig-zag encoded then emitted as 5-bit chunks with the 0x20
 *  continuation bit and the +63 printable offset. */
function encodeSignedValue(delta) {
  let value = delta < 0 ? ~(delta << 1) : delta << 1;
  let out = "";
  while (value >= 0x20) {
    out += String.fromCharCode((0x20 | (value & 0x1f)) + 63);
    value >>>= 5;
  }
  out += String.fromCharCode(value + 63);
  return out;
}

/** `line-1-0`, `line-1D-1`, … — `dirIndex` is the index into
 *  `lineDirections()` (longest stop sequence first). */
export function lineMapName(lineId, dirIndex) {
  return `line-${lineId}-${dirIndex}`;
}

const round = (n, dp) => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

/** sha256 (hex) over a stable JSON of the geometry plus the fixed render
 *  params. Coords are rounded to 5 dp because the render only ever sees 5 dp
 *  (`encodePolyline` rounds to 1e5, `staticMapUrl` pins the pins to 5 dp), so
 *  hashing at 6 dp would over-invalidate on float noise that never reaches the
 *  image. The colour is hashed *normalised* — lowercased, `#` stripped — the
 *  same transform `staticMapUrl` applies, so `#136F29` and `136f29` share a
 *  hash the way they share a rendered image.
 *
 *  Same input → same hash; any geometry, colour or param change → a new hash. */
export function lineMapHash(input) {
  const stable = {
    shape: input.shape.map(([lng, lat]) => [round(lng, 5), round(lat, 5)]),
    termini: input.termini.map(([lng, lat]) => [round(lng, 5), round(lat, 5)]),
    colour: input.colour.toLowerCase().replace("#", ""),
    MAP_STYLE,
    MAP_W,
    MAP_H,
    MAP_RETINA,
    MAP_STROKE_W,
    MAP_STROKE_O,
    MAP_PADDING,
  };
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}

/** The full Mapbox Static Images API URL for one line-direction. `token` is
 *  interpolated verbatim as `access_token`.
 *
 *  The overlay is Mapbox's own `path-…(…),pin-s+…(…)` grammar — its commas and
 *  parens stay literal; only the encoded polyline is percent-escaped. */
export function staticMapUrl(input, token) {
  const hex = input.colour.toLowerCase().replace("#", "");
  const poly = encodeURIComponent(encodePolyline(input.shape));
  const pin = ([lng, lat]) => `pin-s+${hex}(${round(lng, 5)},${round(lat, 5)})`;
  const overlay = [
    `path-${MAP_STROKE_W}+${hex}-${MAP_STROKE_O}(${poly})`,
    pin(input.termini[0]),
    pin(input.termini[1]),
  ].join(",");
  const size = `${MAP_W}x${MAP_H}${MAP_RETINA ? "@2x" : ""}`;
  return (
    `https://api.mapbox.com/styles/v1/${MAP_STYLE}/static/${overlay}` +
    `/auto/${size}?access_token=${token}&padding=${MAP_PADDING}`
  );
}
