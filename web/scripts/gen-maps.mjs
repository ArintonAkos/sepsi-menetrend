/** Bake the static route-map PNGs for the line pages.
 *
 *  Runs as the first step of `npm run build` (and on its own via `npm run
 *  maps`), BEFORE `next build`. The pure bits it needs — the polyline encoder,
 *  the content-hash gate and the Mapbox URL builder — are imported from
 *  `lib/seo/line-maps-core.mjs`, the same plain-ESM module the
 *  `lib/seo/line-maps.ts` barrel re-exports. There is no re-implemented copy
 *  here and nothing to keep in sync.
 *
 *  For each of the ~24 line-directions in `public/data/network.json` it
 *  computes a content hash over the geometry + render params; if the PNG
 *  already exists and the committed manifest hash still matches, it is left
 *  untouched (no request). Otherwise it fetches one Mapbox Static Images PNG.
 *
 *  Non-fatal everywhere: a per-image failure warns and bumps `failed`; a bad
 *  feed or a read-only FS is caught by the outer wrapper. The script always
 *  exits 0 so a token-less or offline checkout still builds (the pages fall
 *  back to the `RouteShape` SVG).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  lineMapName,
  lineMapHash,
  staticMapUrl,
} from "../lib/seo/line-maps-core.mjs";

/* ---- lineDirections (mirrors lib/seo/lines.ts, which is `.ts` and cannot be
 *  imported here) ----
 *
 *  One entry per distinct stop sequence the line runs, longest first. Several
 *  patterns can share a sequence; the first one seen supplies the id. The sort
 *  is stable, so equal-length directions keep feed order. */
function lineDirections(net, lineId) {
  const seen = new Map();
  for (const p of net.patterns) {
    if (p.lineId !== lineId) continue;
    const key = JSON.stringify(p.stopIds);
    if (seen.has(key)) continue;
    seen.set(key, { patternId: p.id, stopIds: p.stopIds });
  }
  return [...seen.values()].sort((a, b) => b.stopIds.length - a.stopIds.length);
}

/* ---- the script ---- */

const MAPS_DIR = join(process.cwd(), "public", "maps");
// The manifest is a build artifact, not site content: it lives outside
// `public/` so it is never served at `/maps/manifest.json`. Still committed.
const MANIFEST_PATH = join(process.cwd(), ".line-maps-manifest.json");

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
if (!token) {
  console.warn(
    "gen-maps: no NEXT_PUBLIC_MAPBOX_TOKEN, skipping map generation",
  );
  process.exit(0);
}

let generated = 0;
let cached = 0;
let failed = 0;

try {
  const net = JSON.parse(
    readFileSync(join(process.cwd(), "public", "data", "network.json"), "utf8"),
  );

  mkdirSync(MAPS_DIR, { recursive: true });

  const manifest = existsSync(MANIFEST_PATH)
    ? JSON.parse(readFileSync(MANIFEST_PATH, "utf8"))
    : {};

  for (const line of net.lines) {
    const dirs = lineDirections(net, line.id);
    for (let i = 0; i < dirs.length; i++) {
      const dir = dirs[i];
      const name = lineMapName(line.id, i);

      // A dangling id in a future feed must not escape the always-exit-0
      // contract, so the lookups live inside the per-image try.
      try {
        const pattern = net.patterns.find((p) => p.id === dir.patternId);
        const first = net.stops.find((s) => s.id === dir.stopIds[0]);
        const last = net.stops.find((s) => s.id === dir.stopIds.at(-1));
        if (!pattern || !first || !last) {
          throw new Error(
            `dangling id (pattern ${dir.patternId}, stops ${dir.stopIds[0]}…${dir.stopIds.at(-1)})`,
          );
        }
        const input = {
          shape: pattern.shape,
          termini: [first.at, last.at],
          colour: line.light ?? "#555555",
        };
        const hash = lineMapHash(input);
        const png = join(MAPS_DIR, `${name}.png`);

        if (existsSync(png) && manifest[name] === hash) {
          cached += 1;
          continue;
        }

        // The Static Images API is a distinct product from tile serving:
        // `public/sw.js` notes Mapbox's terms forbid *caching tiles*, which is
        // why cross-origin tiles are never stored in the app. Baking a bounded
        // set of Static Images at build time is a different case. Confirm
        // against the deploy's Mapbox plan terms before relying on this.
        //
        // 20s guard so a black-holed connection can't hang the whole build —
        // the AbortError lands in the catch below (warn + failed++).
        const res = await fetch(staticMapUrl(input, token), {
          signal: AbortSignal.timeout(20_000),
        });
        if (!res.ok) {
          throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
        }

        // `res.ok` is not enough: a captive portal or proxy can answer 200 with
        // an HTML body. Sniff the PNG signature so junk is never written to the
        // file or sealed into the manifest.
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length < 1024 || !buf.subarray(0, 8).equals(PNG_MAGIC)) {
          throw new Error(
            `not a PNG (${res.headers.get("content-type")}, ${buf.length} bytes)`,
          );
        }

        writeFileSync(png, buf);
        manifest[name] = hash;
        generated += 1;
      } catch (e) {
        console.warn(
          `gen-maps: ${name} failed — ${e.message}; keeping fallback`,
        );
        failed += 1;
      }
    }
  }

  const sorted = {};
  for (const key of Object.keys(manifest).sort()) sorted[key] = manifest[key];
  writeFileSync(MANIFEST_PATH, JSON.stringify(sorted, null, 2) + "\n");
} catch (e) {
  console.warn(`gen-maps: skipped — ${e.message}`);
}

console.log(
  `gen-maps: ${generated} generated, ${cached} cached, ${failed} failed`,
);
