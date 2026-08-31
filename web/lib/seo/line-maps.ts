/** Pure helpers for the baked static route maps on the line pages.
 *
 *  The Mapbox-URL / polyline / content-hash core lives in the plain-ESM
 *  `line-maps-core.mjs` so `scripts/gen-maps.mjs` (which runs before the
 *  TypeScript is compiled) and this barrel share one implementation with no
 *  "keep in sync" copy. This file re-exports that core and adds `mapImage`, the
 *  build-time `existsSync` probe the `LinePage` server component uses to choose
 *  between the baked `<img>` and the `RouteShape` SVG fallback. */
export {
  MAP_STYLE,
  MAP_W,
  MAP_H,
  MAP_RETINA,
  MAP_STROKE_W,
  MAP_STROKE_O,
  MAP_PADDING,
  encodePolyline,
  lineMapName,
  lineMapHash,
  staticMapUrl,
} from "./line-maps-core.mjs";
export type { LineMapInput } from "./line-maps-core.mjs";

import { existsSync } from "node:fs";
import { join } from "node:path";
import { lineMapName } from "./line-maps-core.mjs";

/** Build-time only (server component): the public path of the baked image, or
 *  `null` when it was not generated (no token, a failed request, a brand-new
 *  line). `public/maps/` does not exist until the `gen-maps` script has run. */
export function mapImage(lineId: string, dirIndex: number): string | null {
  const name = `${lineMapName(lineId, dirIndex)}.png`;
  return existsSync(join(process.cwd(), "public", "maps", name))
    ? `/maps/${name}`
    : null;
}
