# Baked Static Line Maps — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]` checkboxes.

**Goal:** Replace the `RouteShape` polyline SVG on the line pages with a baked static Mapbox map image, generated once per feed change, served as a plain `<img>`, zero Mapbox requests per page view.

**Architecture:** A pre-build script (`scripts/gen-maps.mjs`, first step of `npm run build`) content-hash-gates 24 line-direction images; it hits the Mapbox Static Images API only for images whose route geometry changed, writes them to `public/maps/` (committed to git), and is non-fatal on any failure. `components/seo/LinePage.tsx` renders the baked `<img>` when it exists and falls back to `RouteShape` when it does not.

**Tech Stack:** Next.js 16.3.1 static export, Node 24 (`--env-file-if-exists`), Mapbox Static Images API, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-31-baked-line-maps-design.md`

## Global Constraints

- Branch `seo-content-pages`, **local only — nothing is pushed**. Commit trailer on every commit: `Claude-Session: https://claude.ai/code/session_01QNAfG3gVrfC457VR9xayjn`.
- **Zero Mapbox requests per page view** (static `<img>` from `out/`). **Zero requests per build when `network.json` is unchanged** (per-image content-hash gate against `public/maps/manifest.json`).
- **Non-fatal everywhere.** A failed/blocked request, a non-200, or a missing `NEXT_PUBLIC_MAPBOX_TOKEN` → log a warning, generate nothing for that image, exit 0, build continues. Every line page without a baked map renders the existing `RouteShape` SVG.
- No new client JS on any SEO page. No interactive map. Route pages (`/utvonal/**`) are out of scope — line pages only.
- 24 images: 12 lines × 2 directions, named `line-{id}-{dirIndex}.png` where `dirIndex` is the index into `lineDirections(net, id)` (distinct stop sequences, longest first, stable — matches `lib/seo/lines.ts`).
- Token: the existing `NEXT_PUBLIC_MAPBOX_TOKEN` (a `pk.` token in `.env.local` locally, already set on Netlify). No new env var. npm scripts load it via `node --env-file-if-exists=.env.local`.
- Style `mapbox://styles/mapbox/light-v11` → Static API path segment `mapbox/light-v11`. Image `640x360@2x`, `padding=28`. Route line: encoded-polyline `path-4+{hex}-0.9(...)` in the line's `light` colour; two `pin-s+{hex}(...)` markers at the termini.
- Determinism: the committed PNGs keep `out/` byte-deterministic; `gen-maps` is a no-op on an unchanged feed; the existing two-build `diff -rq` check stays green. `npm run build` → `verify-seo: … all green`. Full `npm test` green.
- hu/ro/en line-page output otherwise unchanged; `RouteShape.tsx` stays (fallback), not deleted.

## File Structure

| File | Responsibility |
|---|---|
| `lib/seo/line-maps.ts` (new) | Pure, testable helpers: `encodePolyline`, `lineMapName`, `lineMapHash`, `staticMapUrl`, `mapImage` (build-time file-existence check for the component). No network, no fs writes. |
| `lib/seo/line-maps.test.ts` (new) | Unit tests for all of the above + a drift check (committed `manifest.json` hashes == `lineMapHash` recomputed from `network.json`). |
| `scripts/gen-maps.mjs` (new) | Reads `network.json`, computes per-line-direction hashes, fetches only stale images from Mapbox, writes `public/maps/*.png` + `public/maps/manifest.json`. Re-implements the pure helpers with a "keep in sync with lib/seo/line-maps.ts" header (the `localize-html.mjs` precedent). Non-fatal, no-token-skip, one-line summary. |
| `package.json` (modify) | `"maps"` script + `gen-maps.mjs` prepended to `"build"`, both via `node --env-file-if-exists=.env.local`. |
| `public/maps/*.png`, `public/maps/manifest.json` (new, committed) | The 24 baked images + their hashes. |
| `components/seo/LinePage.tsx` (modify) | Render `<img>` when `mapImage(id, i)` returns a path, else `<RouteShape>`. |
| `components/seo/LinePage.module.css` (modify) | `.routeMap` rule. |
| `components/seo/LinePage.test.tsx` (modify) | img-vs-SVG cases. |
| `scripts/verify-seo.mjs` (modify) | For each built line page, a `/maps/*.png` `<img src>` must resolve under `out/`. |

---

### Task 1: `lib/seo/line-maps.ts` — the pure helpers

**Files:**
- Create: `lib/seo/line-maps.ts`
- Create: `lib/seo/line-maps.test.ts`

**Interfaces — Produces:**
```ts
/** Google "encoded polyline algorithm format", precision 5. */
export function encodePolyline(coords: [number, number][]): string; // coords are [lng, lat]

/** `line-1-0`, `line-1D-1`, … — dirIndex is the index into lineDirections(). */
export function lineMapName(lineId: string, dirIndex: number): string;

export interface LineMapInput {
  shape: [number, number][];   // the pattern polyline, [lng,lat][]
  termini: [[number, number], [number, number]]; // first + last stop coords, [lng,lat]
  colour: string;              // the line's `light` hex, e.g. "#E8A33D"
}
/** sha256 (hex) over a stable JSON of the input + the fixed render params
 *  (STYLE, WIDTH, HEIGHT, RETINA, STROKE_WIDTH, STROKE_OPACITY, PADDING).
 *  Same input → same hash; any geometry/param change → different hash. */
export function lineMapHash(input: LineMapInput): string;

/** The full Mapbox Static Images API URL for one line-direction. `token` is
 *  interpolated as `access_token`. */
export function staticMapUrl(input: LineMapInput, token: string): string;

/** Build-time only (server component): the public path of the baked image, or
 *  null when it was not generated. Uses `existsSync` under `public/maps/`. */
export function mapImage(lineId: string, dirIndex: number): string | null;
```
Export the render-param constants too: `export const MAP_STYLE = "mapbox/light-v11"`, `MAP_W = 640`, `MAP_H = 360`, `MAP_RETINA = true`, `MAP_STROKE_W = 4`, `MAP_STROKE_O = 0.9`, `MAP_PADDING = 28`.

- [ ] **Step 1: failing tests** — `lib/seo/line-maps.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  encodePolyline, lineMapName, lineMapHash, staticMapUrl, mapImage,
} from "./line-maps";
import { loadNetwork } from "./network";
import { lineDirections } from "./lines";

describe("encodePolyline", () => {
  it("matches the reference vector from the Google spec", () => {
    // (38.5,-120.2),(40.7,-120.95),(43.252,-126.453) -> "_p~iF~ps|U_ulLnnqC_mqNvxq`@"
    // our input is [lng,lat]; encoder emits lat,lng order internally
    expect(encodePolyline([[-120.2, 38.5], [-120.95, 40.7], [-126.453, 43.252]]))
      .toBe("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
  });
  it("round-trips a real line shape without throwing and stays URL-safe-ish", () => {
    const net = loadNetwork();
    const p = net.patterns[0];
    const enc = encodePolyline(p.shape as [number, number][]);
    expect(enc.length).toBeGreaterThan(0);
    expect(enc.length).toBeLessThan(4000); // well under Mapbox's ~8k overlay limit
  });
});

describe("lineMapName", () => {
  it("names by line id and direction index", () => {
    expect(lineMapName("1", 0)).toBe("line-1-0");
    expect(lineMapName("1D", 1)).toBe("line-1D-1");
  });
});

describe("lineMapHash", () => {
  const base = {
    shape: [[25.77, 45.86], [25.78, 45.87]] as [number, number][],
    termini: [[25.77, 45.86], [25.78, 45.87]] as [[number, number], [number, number]],
    colour: "#123456",
  };
  it("is stable for the same input", () => {
    expect(lineMapHash(base)).toBe(lineMapHash({ ...base }));
  });
  it("changes when the shape changes", () => {
    expect(lineMapHash({ ...base, shape: [[25.77, 45.86], [25.79, 45.88]] }))
      .not.toBe(lineMapHash(base));
  });
  it("changes when the colour changes", () => {
    expect(lineMapHash({ ...base, colour: "#654321" })).not.toBe(lineMapHash(base));
  });
});

describe("staticMapUrl", () => {
  const net = loadNetwork();
  it("targets the Static Images API with the light style, retina size and the token", () => {
    const p = net.patterns.find((x) => x.lineId === "1")!;
    const first = net.stops.find((s) => s.id === p.stopIds[0])!;
    const last = net.stops.find((s) => s.id === p.stopIds.at(-1))!;
    const url = staticMapUrl(
      { shape: p.shape as [number, number][], termini: [first.at, last.at], colour: "#E8A33D" },
      "pk.TESTTOKEN",
    );
    expect(url).toMatch(/^https:\/\/api\.mapbox\.com\/styles\/v1\/mapbox\/light-v11\/static\//);
    expect(url).toContain("path-4+e8a33d-0.9(");   // stroke width, colour (lowercased), opacity
    expect(url).toContain("pin-s+e8a33d(");
    expect(url).toContain("/auto/640x360@2x");
    expect(url).toContain("access_token=pk.TESTTOKEN");
    expect(url).toContain("padding=28");
  });
});

describe("mapImage", () => {
  const net = loadNetwork();
  it("returns the public path when the baked file exists, else null", () => {
    const has = existsSync(join(process.cwd(), "public", "maps", "line-1-0.png"));
    expect(mapImage("1", 0)).toBe(has ? "/maps/line-1-0.png" : null);
  });
});

describe("manifest ↔ hash drift", () => {
  it("every committed manifest hash matches lineMapHash recomputed from the feed", () => {
    const manifestPath = join(process.cwd(), "public", "maps", "manifest.json");
    if (!existsSync(manifestPath)) return; // Task 2 creates it
    const manifest = JSON.parse(require("node:fs").readFileSync(manifestPath, "utf8"));
    const net = loadNetwork();
    for (const line of net.lines) {
      lineDirections(net, line.id).forEach((dir, i) => {
        const name = lineMapName(line.id, i);
        if (!(name in manifest)) return;
        const pattern = net.patterns.find((p) => p.id === dir.patternId)!;
        const first = net.stops.find((s) => s.id === dir.stopIds[0])!;
        const last = net.stops.find((s) => s.id === dir.stopIds.at(-1))!;
        const line0 = net.lines.find((l) => l.id === line.id)!;
        expect(manifest[name]).toBe(lineMapHash({
          shape: pattern.shape, termini: [first.at, last.at],
          colour: line0.light ?? "#555555",
        }));
      });
    }
  });
});
```

- [ ] **Step 2: run, confirm fail** — `npm test -- --run lib/seo/line-maps.test.ts` → module missing.
- [ ] **Step 3: implement `lib/seo/line-maps.ts`.** `encodePolyline` = the standard Google algorithm (precision 1e5, `lat` then `lng`, `>>` sign-flip, chunk into 5-bit groups + 0x20 continuation + 63 offset). `lineMapHash` = `createHash("sha256").update(JSON.stringify({ ...input, MAP_STYLE, MAP_W, MAP_H, MAP_RETINA, MAP_STROKE_W, MAP_STROKE_O, MAP_PADDING })).digest("hex")` — round the coords to 6 dp before hashing so trivial float noise doesn't churn. `staticMapUrl` builds the overlay string `path-{MAP_STROKE_W}+{hex}-{MAP_STROKE_O}({poly}),pin-s+{hex}({lng},{lat}),pin-s+{hex}({lng},{lat})` (hex lowercased, no `#`; coords to 5 dp), `encodeURIComponent` the polyline only (commas/parens in the overlay structure stay literal — match Mapbox's format), then `/auto/{MAP_W}x{MAP_H}{@2x}?access_token={token}&padding={MAP_PADDING}`. `mapImage` = `existsSync(join(process.cwd(), "public", "maps", \`${lineMapName(lineId, dirIndex)}.png\`)) ? \`/maps/${lineMapName(lineId, dirIndex)}.png\` : null`.
- [ ] **Step 4: run** — `npm test -- --run lib/seo/line-maps.test.ts` → pass (the drift test early-returns; `mapImage` returns null). `npx tsc --noEmit` → exit 0.
- [ ] **Step 5: full suite** — `npm test` → green.
- [ ] **Step 6: commit** — `git add lib/seo/line-maps.ts lib/seo/line-maps.test.ts && git commit -m "Add the pure helpers for baked line-page route maps"`.

---

### Task 2: `scripts/gen-maps.mjs` + build wiring + the 24 images

**Files:**
- Create: `scripts/gen-maps.mjs`
- Modify: `package.json`
- Create (by running the script): `public/maps/*.png`, `public/maps/manifest.json`
- Reference: `lib/seo/line-maps.ts` (re-implement its pure bits), `scripts/localize-html.mjs` (the "keep in sync" precedent), `lib/seo/lines.ts` (`lineDirections` grouping/sort to replicate)

**Interfaces — Consumes:** `public/data/network.json`, `process.env.NEXT_PUBLIC_MAPBOX_TOKEN`. **Produces:** `public/maps/line-{id}-{i}.png` × up to 24, `public/maps/manifest.json` (`{ "line-1-0": "<sha256>", … }`).

- [ ] **Step 1: write `scripts/gen-maps.mjs`.** Header comment: "keep the hash / URL / polyline logic in sync with `lib/seo/line-maps.ts`". Logic:
  1. `token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN`. If falsy → `console.warn("gen-maps: no NEXT_PUBLIC_MAPBOX_TOKEN, skipping map generation")` and `process.exit(0)`.
  2. Read + parse `public/data/network.json`. `mkdirSync("public/maps", { recursive: true })`. Load `public/maps/manifest.json` if present, else `{}`.
  3. For each line, replicate `lineDirections`: group `net.patterns` by `lineId`, dedupe on `JSON.stringify(stopIds)`, stable-sort by `stopIds.length` desc. For each `(dir, i)`:
     - `name = \`line-${line.id}-${i}\``
     - `input = { shape: <that pattern's shape>, termini: [<first stop>.at, <last stop>.at], colour: line.light ?? "#555555" }`
     - `hash = sha256(...)` (same recipe as `lineMapHash`)
     - if `existsSync(\`public/maps/${name}.png\`) && manifest[name] === hash` → `cached++`, continue
     - else: `try { const res = await fetch(staticMapUrl(input, token)); if (!res.ok) throw new Error(res.status + " " + (await res.text()).slice(0,200)); writeFileSync(\`public/maps/${name}.png\`, Buffer.from(await res.arrayBuffer())); manifest[name] = hash; generated++; } catch (e) { console.warn(\`gen-maps: ${name} failed — ${e.message}; keeping fallback\`); failed++; }`
  4. `writeFileSync("public/maps/manifest.json", JSON.stringify(manifest, null, 2) + "\n")` (sorted keys for a stable diff).
  5. `console.log(\`gen-maps: ${generated} generated, ${cached} cached, ${failed} failed\`)`. `process.exit(0)` always.
- [ ] **Step 2: wire `package.json`.**
  - `"maps": "node --env-file-if-exists=.env.local scripts/gen-maps.mjs"`
  - `"build": "node --env-file-if-exists=.env.local scripts/gen-maps.mjs && next build && node scripts/localize-html.mjs && node scripts/og-ext.mjs && node scripts/verify-seo.mjs && node scripts/stamp-sw.mjs"`
- [ ] **Step 3: generate** — `npm run maps`. Expect `gen-maps: 24 generated, 0 cached, 0 failed`. `ls public/maps/` → 24 `.png` + `manifest.json`. Eyeball 2–3 PNGs (open them) — a light basemap, a coloured route line, two pins.
- [ ] **Step 4: re-run to prove the gate** — `npm run maps` again → `gen-maps: 0 generated, 24 cached, 0 failed`, and `git status` shows no change to `public/maps/`.
- [ ] **Step 5: drift test now runs** — `npm test -- --run lib/seo/line-maps.test.ts` → the "manifest ↔ hash drift" test now executes (manifest exists) and passes. If it fails, the `.mjs` hash recipe diverged from `lib/seo/line-maps.ts` — fix the `.mjs`.
- [ ] **Step 6: no-token path** — `NEXT_PUBLIC_MAPBOX_TOKEN= node scripts/gen-maps.mjs` (empty) → prints the skip warning, exits 0, writes nothing.
- [ ] **Step 7: commit** — `git add scripts/gen-maps.mjs package.json public/maps/ && git commit -m "Generate the baked line-page route maps at build time, hash-gated"`.

---

### Task 3: `LinePage` renders the baked map, falls back to the SVG

**Files:**
- Modify: `components/seo/LinePage.tsx`
- Modify: `components/seo/LinePage.module.css`
- Modify: `components/seo/LinePage.test.tsx`

**Interfaces — Consumes:** `mapImage(lineId, dirIndex)` from `lib/seo/line-maps.ts`.

- [ ] **Step 1: failing tests** — add to `LinePage.test.tsx`:

```ts
it("shows the baked route map image for a line that has one", async () => {
  const el = await LinePage({ lang: "hu", id: "1" });
  render(el as React.ReactElement);
  const img = screen.getAllByRole("img").find((n) => n.getAttribute("src")?.startsWith("/maps/line-1-"));
  expect(img).toBeTruthy();
  expect(img).toHaveAttribute("loading", "lazy");
  expect(img?.getAttribute("alt")?.length).toBeGreaterThan(0);
});

it("falls back to the inline route SVG when there is no baked map", async () => {
  // a line id that has no public/maps/line-<id>-*.png — use a stub via a
  // never-generated id if the feed has one, else assert both branches exist in source
  const src = readFileSync(resolve(import.meta.dirname, "LinePage.tsx"), "utf8");
  expect(src).toMatch(/mapImage\(/);
  expect(src).toMatch(/RouteShape/); // still imported + rendered in the else branch
});
```
(Adjust the first test's line id if `line-1-0.png` is not among the 24 — it will be.)

- [ ] **Step 2: run, confirm fail** — `npm test -- --run components/seo/LinePage.test.tsx`.
- [ ] **Step 3: implement.** In the `dirs.map((dir, i) => …)` block, replace the `{pattern ? <RouteShape … /> : null}` with:

```tsx
{(() => {
  const src = mapImage(id, i);
  if (src) {
    return (
      <img
        src={src}
        alt={
          lang === "hu" ? `${label} útvonala a térképen`
          : lang === "ro" ? `Traseul liniei ${id} pe hartă`
          : `Route of line ${id} on the map`
        }
        width={640}
        height={360}
        loading="lazy"
        decoding="async"
        className={styles.routeMap}
      />
    );
  }
  return pattern ? <RouteShape shape={pattern.shape} colour={line?.light ?? "#555"} /> : null;
})()}
```
`LinePage.module.css` → `.routeMap { display: block; width: 100%; height: auto; aspect-ratio: 640 / 360; object-fit: cover; margin-top: 12px; border-radius: 12px; border: 1px solid var(--border); }` (mirror the surrounding rules).

- [ ] **Step 4: run** — `npm test -- --run components/seo/LinePage.test.tsx` → pass. `npx tsc --noEmit` → 0.
- [ ] **Step 5: full suite** — `npm test` → green.
- [ ] **Step 6: commit** — `git add components/seo/LinePage.tsx components/seo/LinePage.module.css components/seo/LinePage.test.tsx && git commit -m "Show the baked route map on the line pages, SVG fallback"`.

---

### Task 4: `verify-seo` map check + final integration

**Files:**
- Modify: `scripts/verify-seo.mjs`

- [ ] **Step 1: add the check.** In `verify-seo.mjs`, in the per-page loop (or a small dedicated pass over the line-page `pages`), for every built HTML file: for each `<img src="/maps/…\.png">`, assert `existsSync(assetFile(toPath(src)))`; `fail(\`${p.path}: map image ${src} has no file in out/\`)` otherwise. A page with no `/maps/` img is fine.
- [ ] **Step 2: full build** — `npm run build`. Expect: `gen-maps: 0 generated, 24 cached, 0 failed`, then `next build`, `localised …`, `og-ext …`, `verify-seo: 537 pages checked, all green`, `service worker stamped`. Exit 0.
- [ ] **Step 3: determinism** — `rm -rf /tmp/m-a /tmp/m-b && npm run build && cp -r out /tmp/m-a && npm run build && cp -r out /tmp/m-b && diff -rq /tmp/m-a /tmp/m-b && echo DETERMINISTIC`.
- [ ] **Step 4: full suite** — `npm test` → all green (the 3 pre-existing flaky `components/planner/Planner.test.tsx` SepsiBike tests may or may not appear — they are load-flaky and unrelated; if exactly those 3 and nothing else fail, that is the known baseline).
- [ ] **Step 5: `preview:netlify` spot-check** — `npm run preview:netlify`; in a second shell: `/usr/bin/curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8888/ro/linii/1/` → 200; `/usr/bin/curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8888/maps/line-1-0.png` → 200. Open `http://localhost:8888/ro/linii/1/` in a browser: the map image renders, no console errors, the network request for `/maps/line-1-0.png` is 200 and same-origin (no `api.mapbox.com` request from the page).
- [ ] **Step 6: commit** — `git add scripts/verify-seo.mjs && git commit -m "verify-seo: the line-page map images must resolve in out/"`.

## Self-Review

**Spec coverage:** `gen-maps.mjs` (Task 2) ↔ spec §"The pipeline"; hash gate + manifest (Task 1 `lineMapHash` + Task 2 steps 3–4); non-fatal + no-token (Task 2 steps 1, 6); Mapbox URL shape (Task 1 `staticMapUrl` + test); `LinePage` swap + fallback (Task 3); `.routeMap` CSS (Task 3); `verify-seo` check (Task 4); determinism + committed PNGs (Task 4 steps 2–3); build wiring with `--env-file-if-exists` (Task 2 step 2). Route pages excluded — no task touches `RoutePage`. `RouteShape.tsx` kept — Task 3 renders it in the else branch, never deletes it.

**Placeholder scan:** none — `encodePolyline` is a named standard algorithm with a reference-vector test; the Mapbox URL format is spelled out and asserted; the `LinePage` JSX is given in full.

**Type consistency:** `lineMapName(lineId, dirIndex)` / `mapImage(lineId, dirIndex)` — `dirIndex` is the `lineDirections` index in both the component (Task 3, `dirs.map((dir, i) =>`) and the script (Task 2 step 3, replicated grouping/sort). `lineMapHash` input shape (`{ shape, termini, colour }`) is identical in Task 1 (TS), Task 1's drift test, and Task 2's `.mjs`. The render-param constants (`MAP_STYLE` etc.) are the single source in `line-maps.ts` and copied verbatim into `gen-maps.mjs` under the "keep in sync" header.

## Execution Handoff

Subagent-Driven — fresh subagent per task, review between each. 4 tasks.
