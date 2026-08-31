# Baked static route maps for the line pages

**Status:** design (brainstormed with the user, 2026-08-31)
**Branch:** `seo-content-pages` (local only — nothing is pushed)

## Goal

Replace the context-free `RouteShape` polyline SVG on the generated line pages
(`/vonalak/{id}/`, `/ro/linii/{id}/`, `/en/lines/{id}/`) with a real static map
image — the route drawn over an actual basemap — baked once per feed and served
as a plain `<img>`. Zero Mapbox requests per page view, and essentially none per
build.

## Non-goals

- Route pages (`/utvonal/{a}-{b}/`) — not in v1. Line pages only.
- Interactive maps. No new client JavaScript on any SEO page.
- Stop-name labels rendered onto the image. The ordered, linked stop list
  already sits directly below the map (`StopList`) — that is where the names
  live. The image marks the two termini only.

## What the user is optimising for

Minimal Mapbox API usage. The design must guarantee:
- **0 requests per page view** (static `<img>` from `out/`).
- **0 requests per build when `network.json` is unchanged** (content-hash gate).
- A handful of requests **only** when a line's geometry actually changes in the
  feed (~24 images total, so a full regeneration is ~24 requests — Mapbox's
  Static Images free tier is 50 000/month).

## The pipeline

### `scripts/gen-maps.mjs` (new)

Runs as the first step of `npm run build` (so it runs on every local build,
`npm run preview`, `npm run preview:netlify`, and the Netlify deploy build):

```
"build": "node scripts/gen-maps.mjs && next build && node scripts/localize-html.mjs && node scripts/og-ext.mjs && node scripts/verify-seo.mjs && node scripts/stamp-sw.mjs"
```

Also exposed on its own: `"maps": "node scripts/gen-maps.mjs"`.

Behaviour:

1. Read `public/data/network.json`. For each of the 12 lines, take its distinct
   directions (`lineDirections` logic — longest stop sequence first), giving
   **24 line-directions**. Name each image `line-{id}-{dirIndex}.png`
   (`line-1-0.png`, `line-1-1.png`, `line-1D-0.png`, …).
2. For each line-direction, compute a **content hash** (sha256) over a stable
   JSON of: the pattern `shape` (the `[lng,lat][]` polyline), the two terminus
   coordinates, and the render parameters (style id, width, height, retina flag,
   stroke colour, stroke width, padding). Store `{ "line-1-0": "<hash>", … }` in
   `public/maps/manifest.json`.
3. For each line-direction: if `public/maps/line-{id}-{i}.png` exists **and** its
   manifest hash matches the freshly-computed hash → **skip** (no request). Else
   → request the image from the Mapbox Static Images API, write the PNG, update
   the manifest entry.
4. **Per-image failure is non-fatal.** A failed request (network error, non-200,
   Mapbox down) logs a warning and leaves the previous PNG in place (or none).
   The script exits 0 regardless. The build continues.
5. **No token → skip entirely.** If `NEXT_PUBLIC_MAPBOX_TOKEN` is unset, log one
   warning and generate nothing. A token-less checkout still builds; every line
   page falls back to the SVG.
6. Print a one-line summary: `gen-maps: N generated, M cached, K failed`.

### The Mapbox request

Static Images API, one GET per stale image:

```
https://api.mapbox.com/styles/v1/mapbox/light-v11/static/
  path-4+{hex}-0.9({encodedPolyline}),
  pin-s+{hex}({lng0},{lat0}),
  pin-s+{hex}({lng1},{lat1})
  /auto/640x360@2x
  ?access_token={NEXT_PUBLIC_MAPBOX_TOKEN}&padding=28
```

- `light-v11` — the clean light basemap; reads well small and matches the
  site's paper palette (`streets-v12`, which the planner uses, is too busy at
  thumbnail size).
- `path-…({encodedPolyline})` — the route line as a Google-encoded polyline
  (`@mapbox/polyline`), so a 150-point shape is a few hundred URL chars, well
  under Mapbox's ~8 kB overlay limit. Colour = the line's `light` colour from
  the feed; width 4, opacity 0.9.
- Two `pin-s` markers (small, unlabelled) at the termini, same colour.
- `/auto/` — Mapbox fits the bbox of the overlay; `padding=28` keeps the line
  off the edges.
- `640x360@2x` — a 1280×720 PNG shown at 640 CSS px. ~40–90 kB each.

### `public/maps/` (committed)

The 24 PNGs and `manifest.json` are committed to git (they are static assets, no
different from `public/data/*.json`, the fonts, the icons). `/out/` is
git-ignored as before; `public/maps/` is not.

- A clean Netlify checkout has the PNGs, the hashes match → the deploy build
  makes **0 requests**.
- When `network.json` changes in a commit: run `npm run maps` locally, review
  the regenerated PNGs, commit them alongside the feed update. The build-time
  gate is the safety net if that is forgotten (the Netlify build regenerates the
  changed ones, needing the token that is already set for the planner).

## The component change

### `components/seo/LinePage.tsx`

Where it renders `<RouteShape shape={pattern.shape} colour={…} />` per direction,
render instead:

```tsx
{mapImage(id, i) ? (
  <img
    src={mapImage(id, i)!}
    alt={/* "Az {label} útvonala: {terminusA} – {terminusB}" per lang */}
    width={640} height={360} loading="lazy" decoding="async"
    className={styles.routeMap}
  />
) : pattern ? (
  <RouteShape shape={pattern.shape} colour={line?.light ?? "#555"} />
) : null}
```

### `lib/seo/line-maps.ts` (new, tiny)

```ts
import { existsSync } from "node:fs";
import { join } from "node:path";

/** The public path of the baked map for a line-direction, or null if it was
 *  not generated (no token, a failed request, a brand-new line). Called at
 *  build time from the server component. */
export function mapImage(lineId: string, dirIndex: number): string | null {
  const name = `line-${lineId}-${dirIndex}.png`;
  return existsSync(join(process.cwd(), "public", "maps", name))
    ? `/maps/${name}`
    : null;
}
```

`RouteShape.tsx` stays as the fallback — not deleted.

`LinePage.module.css` gets a `.routeMap` rule (full width, `border-radius`,
`border: 1px solid var(--border)`, `aspect-ratio: 640/360`, `object-fit: cover`).

## Determinism

The committed PNGs make `out/` byte-deterministic exactly as today — the build
copies `public/` into `out/` and `gen-maps` is a no-op on an unchanged feed. Two
consecutive `npm run build` runs produce identical `out/` (the existing
`diff -rq` determinism check stays green). Mapbox's static render for a fixed URL
is itself deterministic within a build; across builds weeks apart it could drift
if Mapbox nudges `light-v11` — the same property the OG cards already have, and
the hash gate means we only re-fetch on our own input changes anyway.

## verify-seo

`scripts/verify-seo.mjs` gains a light check: for each built line page, if the
HTML contains a `/maps/…png` `<img src>`, that file must exist under `out/`.
(A page with no map `<img>` — the SVG-fallback case — is fine; not every line
page must have a baked map.)

## Tests

- `gen-maps` hash gate: unit-test the hash function is stable for the same input
  and changes when the shape/params change; test that a matching manifest entry
  + existing file → skipped (mock the fetch, assert it is not called); a
  mismatch → fetch called, file + manifest written. Test the no-token and
  per-image-failure paths (script exits 0, other images still processed).
- `mapImage()`: returns `/maps/line-1-0.png` when the file exists, `null` when
  it does not (use a temp dir or the real committed files).
- `LinePage`: renders an `<img src="/maps/line-1-0.png">` for a line that has a
  baked map; renders `<RouteShape>` (SVG) when `mapImage` returns null. hu/ro/en
  unaffected otherwise.
- Full suite green; `npm run build` green (`verify-seo … all green`);
  determinism `diff -rq` clean.

## Netlify

No new configuration. `NEXT_PUBLIC_MAPBOX_TOKEN` is already set on the site (the
deployed planner needs it); `gen-maps.mjs` reads the same variable. The one new
property is that a deploy whose commit changed `network.json` will make a few
Static Images requests during the build — bounded, gated, and non-fatal.
