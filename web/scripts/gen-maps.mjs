/** Bake the static map PNGs: one per line-direction for the line pages, plus
 *  one ticket sales-point overview for the fares pages.
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

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  encodePolyline,
  lineMapName,
  lineMapHash,
  staticMapUrl,
} from "../lib/seo/line-maps-core.mjs";
import {
  HOME_CENTRE,
  HOME_ZOOM,
  HOME_FACADE_SIZES,
  homeFacadePath,
} from "../lib/home-view.mjs";
import sharp from "sharp";

/* ---- ticket sales-point overview map ----
 *
 *  One PNG for the fares pages: every ticket point as a small pin, Multi-Trans
 *  kiosks + the machine in the panel olive, partner shops in muted grey. Same
 *  `light-v11` basemap and the same manifest gate as the line maps. `.ts` has
 *  no consumer that builds this URL, so it lives here with nothing to drift
 *  against. */
const TICKET_MAP = {
  name: "ticket-points",
  style: "mapbox/light-v11",
  w: 640,
  h: 460,
  padding: 44,
  // Multi-Trans's own points (kiosks + machine) stand out: a large pin in the
  // signal yellow. Partner shops are small muted pins.
  mtPin: "pin-l+efc913",
  shopPin: "pin-s+7a7a68",
};

const round5 = (n) => Math.round(n * 1e5) / 1e5;

function ticketMapPins(points) {
  return points
    .map((p) => {
      const pin = p.kind === "shop" ? TICKET_MAP.shopPin : TICKET_MAP.mtPin;
      return `${pin}(${round5(p.lng)},${round5(p.lat)})`;
    })
    .join(",");
}

function ticketMapHash(points) {
  const stable = {
    ...TICKET_MAP,
    points: points
      .map((p) => `${p.id}:${p.kind}:${round5(p.lng)},${round5(p.lat)}`)
      .sort(),
  };
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}

function ticketMapUrl(points, token) {
  return (
    `https://api.mapbox.com/styles/v1/${TICKET_MAP.style}/static/${ticketMapPins(points)}` +
    `/auto/${TICKET_MAP.w}x${TICKET_MAP.h}?access_token=${token}&padding=${TICKET_MAP.padding}`
  );
}

/* ---- the homepage map's stand-in ----
 *
 *  Mapbox GL is 1.8 MB of JavaScript, and evaluating it plus building the map
 *  froze a slow phone for over a second right after load - most of the
 *  homepage's blocking time - while the screen stayed grey for five or more.
 *  The planner now shows this baked picture of the same opening view first and
 *  only loads GL when the reader starts using the page (`MapFacade`). It draws
 *  the network the way the live map does at that zoom: every line in its own
 *  colour, thin. One image per theme and size, WebP, same manifest gate. */
const HOME_STYLES = { light: "mapbox/streets-v12", dark: "mapbox/dark-v11" };
const HOME_STROKE = 2;
// a Static Images URL may not exceed 8192 characters; simplify until it fits
const URL_LIMIT = 8000;

/** Douglas-Peucker on `[lng, lat]`, tolerance in degrees. */
function simplify(points, tolerance) {
  if (points.length < 3) return points;
  const [ax, ay] = points[0];
  const [bx, by] = points.at(-1);
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy) || 1e-12;
  let worst = 0, at = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i];
    const d = Math.abs(dy * px - dx * py + bx * ay - by * ax) / len;
    if (d > worst) { worst = d; at = i; }
  }
  if (worst <= tolerance) return [points[0], points.at(-1)];
  return [...simplify(points.slice(0, at + 1), tolerance).slice(0, -1),
          ...simplify(points.slice(at), tolerance)];
}

/** The URL for one stand-in, without the token (also what the hash covers). */
function homeFacadeUrl(net, theme, size, tolerance) {
  // Every distinct route of every line. GL leaves the feed's first lines on
  // top where routes share a street, and a Static Images overlay paints its
  // last path on top - so the list is reversed to match the live map.
  const lines = new Map(net.lines.map((l) => [l.id, l]));
  const seen = new Set();
  const paths = net.patterns.map((pattern) => {
    const key = `${pattern.lineId}:${pattern.stopIds.join(",")}`;
    const line = lines.get(pattern.lineId);
    if (seen.has(key) || !line) return null;
    seen.add(key);
    const hex = (line[theme] ?? line.colour).toLowerCase().replace("#", "");
    const poly = encodeURIComponent(encodePolyline(simplify(pattern.shape, tolerance)));
    return `path-${HOME_STROKE}+${hex}-0.8(${poly})`;
  }).filter(Boolean).reverse().join(",");
  const [w, h] = HOME_FACADE_SIZES[size];
  return `https://api.mapbox.com/styles/v1/${HOME_STYLES[theme]}/static/${paths}` +
    `/${HOME_CENTRE[0]},${HOME_CENTRE[1]},${HOME_ZOOM}/${w}x${h}@2x` +
    "?attribution=false&logo=false";
}

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

  // The ticket sales-point overview, one image, same gate.
  try {
    const points = JSON.parse(
      readFileSync(join(process.cwd(), "public", "data", "ticket-points.json"), "utf8"),
    ).points;
    const hash = ticketMapHash(points);
    const png = join(MAPS_DIR, `${TICKET_MAP.name}.png`);
    if (existsSync(png) && manifest[TICKET_MAP.name] === hash) {
      cached += 1;
    } else {
      const res = await fetch(ticketMapUrl(points, token), {
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) {
        throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 1024 || !buf.subarray(0, 8).equals(PNG_MAGIC)) {
        throw new Error(
          `not a PNG (${res.headers.get("content-type")}, ${buf.length} bytes)`,
        );
      }
      writeFileSync(png, buf);
      manifest[TICKET_MAP.name] = hash;
      generated += 1;
    }
  } catch (e) {
    console.warn(`gen-maps: ${TICKET_MAP.name} failed — ${e.message}; keeping fallback`);
    failed += 1;
  }

  // A WebP beside every baked PNG: the pages serve it (40-60% smaller, which
  // Lighthouse's "next-gen formats" flags); the PNG stays as the manifest's
  // cached source, so no Mapbox request is repeated to make it.
  for (const png of readdirSync(MAPS_DIR).filter((f) => f.endsWith(".png"))) {
    const src = join(MAPS_DIR, png);
    const webp = src.replace(/\.png$/, ".webp");
    try {
      if (!existsSync(webp) || statSync(webp).mtimeMs < statSync(src).mtimeMs) {
        writeFileSync(webp, await sharp(src).webp({ quality: 80 }).toBuffer());
      }
    } catch (e) {
      console.warn(`gen-maps: ${png} -> webp failed — ${e.message}; the PNG is served`);
    }
  }

  // The homepage stand-ins: two themes x two sizes, WebP.
  for (const theme of ["light", "dark"]) {
    for (const size of Object.keys(HOME_FACADE_SIZES)) {
      const name = `home-${theme}-${size}`;
      try {
        let tolerance = 0.00008;
        let url = homeFacadeUrl(net, theme, size, tolerance);
        while (url.length + token.length + 14 > URL_LIMIT && tolerance < 0.01) {
          tolerance *= 1.5;
          url = homeFacadeUrl(net, theme, size, tolerance);
        }
        const hash = createHash("sha256").update(url).digest("hex");
        const file = join(process.cwd(), "public", homeFacadePath(theme, size));
        if (existsSync(file) && manifest[name] === hash) {
          cached += 1;
          continue;
        }
        const res = await fetch(`${url}&access_token=${token}`, {
          signal: AbortSignal.timeout(30_000),
        });
        if (!res.ok) {
          throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
        }
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length < 1024 || !buf.subarray(0, 8).equals(PNG_MAGIC)) {
          throw new Error(
            `not a PNG (${res.headers.get("content-type")}, ${buf.length} bytes)`,
          );
        }
        writeFileSync(file, await sharp(buf).webp({ quality: 72 }).toBuffer());
        manifest[name] = hash;
        generated += 1;
      } catch (e) {
        console.warn(`gen-maps: ${name} failed — ${e.message}; the map loads live instead`);
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
