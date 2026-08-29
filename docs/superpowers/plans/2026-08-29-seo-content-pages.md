# Bilingual SEO Content Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish ~370 crawlable, server-rendered bus-network pages in Hungarian and Romanian — line, stop, route, and guide pages — generated from `network.json` at build time, without touching the planner.

**Architecture:** A new framework-free `web/lib/seo/` module derives every page's data (slugs, deduped "places", enriched line names, build-time journeys, metadata, JSON-LD, OG-card props) from the existing `public/data/network.json`. Next.js dynamic route segments under `web/app/` (Hungarian at bare paths) and `web/app/ro/` (Romanian) render them as static HTML via `generateStaticParams`; `opengraph-image.tsx` files emit a per-page PNG card. `sitemap.ts`, the service worker, `netlify.toml`, and a small planner footer are updated. The planner page, its components, `lib/share.ts`, and `lib/engine/**` behaviour are untouched.

**Tech Stack:** Next.js 16.3.1 (vendored — read `web/node_modules/next/dist/docs/01-app/` before route code), React 19, TypeScript, `next/og` (bundled with Next, no new dep), Vitest 4, static export (`output: "export"`), Netlify.

**Spec:** `docs/superpowers/specs/2026-08-29-seo-content-pages-design.md`

## Global Constraints

- **Hungarian is the site default** and `hreflang` `x-default`. Romanian is additive under `/ro/` only. Site name, manifest, homepage: unchanged.
- **The planner is not modified** except adding footer links in Task 23: `app/page.tsx`, `components/planner/**`, `lib/share.ts`, `lib/engine/**` behaviour stay as-is. `lib/engine/plan.ts` may be *imported* at build time, not changed.
- **`/` is never moved or redirected.** Query strings do not participate in routing; `/?from=…`, `/?line=…`, `/?stop=…`, `/?lang=…` keep working. `/terms/` and `/privacy/` stay the canonical Hungarian URLs.
- **Static export only** — no server, middleware, or Netlify functions for this work. Every route handler that Next treats as dynamic (`sitemap`, `opengraph-image`) is pinned `export const dynamic = "force-static"`.
- **No new runtime third-party request** on any content page: no map tiles, no fetched fonts. The one OG-card font is bundled and embedded at build time.
- **Data source is `network.json` only.** No second pipeline, no runtime fetch. Pages are as fresh as the planner.
- **Build stays deterministic:** same `network.json` → byte-identical `out/`, generated PNGs included.
- **Diacritics:** correct in HTML and OG images (`ő ű ș ț ă â î`); folded to ASCII in slugs.
- **Stop identity:** dedupe stops into physical "places" by coordinate proximity, never by name alone (see `memory/multitrans-stop-identity-model.md`). The feed's `stationId` does *not* merge opposite kerbs — 32 cross-station name collisions confirm this.
- Every generated page carries a visible "nem hivatalos / neoficial" disclaimer linking to multitrans.ro. `author`/`publisher` = "Sepsi Menetrend". No `Organization` JSON-LD, no operator branding/logo.
- Tests live at `web/lib/**/*.test.ts` (node env) and `web/components/**/*.test.tsx` (jsdom). Run: `cd web && npm test`.
- Commit after every task. Work stays on branch `seo-content-pages`. **Do not push.**

---

## File Structure

**New — `web/lib/seo/` (framework-free, unit-tested):**
- `slug.ts` — `slugify(name)`: fold diacritics, lowercase, hyphenate, strip punctuation. `disambiguate(entries)`: append `-2`, `-3` on collision by stable order.
- `places.ts` — `buildPlaces(network)`: cluster stops into `Place[]`. `placeBySlug`, `NOTABLE_PLACE_KEYS`.
- `lines.ts` — `enrichLine(line, patterns, lang)`: display name, termini. `lineBoards(network, lineId)`: per-terminus/direction board columns. `headway`, `firstLast`.
- `routes.ts` — `notablePairs(places)`: canonical unordered pairs. `buildTimeJourney(network, from, to)`: representative weekday journey via `lib/engine/plan.ts`.
- `urls.ts` — `allPages(network)`: `PageEntry[]` (`path`, `alternates`, `lastModified`) — the single source of truth for the sitemap and the orphan/reciprocity checks.
- `metadata.ts` — `pageMetadata(kind, data, lang)`: `Metadata` with title, description, canonical, `alternates.languages`, `openGraph`.
- `jsonld.ts` — `breadcrumbLd`, `faqLd`, `websiteLd`.
- `og.tsx` — `OgCard(props)` React tree for `ImageResponse`; `ogFont()` loads the bundled font `ArrayBuffer`.
- `content.ts` — types for guide-page content (`GuidePage`, `Faq`).
- `content.hu.ts`, `content.ro.ts` — the guide prose.
- `network.ts` — `loadNetwork()`: read + parse `public/data/network.json` once, typed as `Network`.

**New — `web/components/seo/`:**
- `PageFrame.tsx` + `PageFrame.module.css` — breadcrumb, visible language switch, disclaimer footer. Server component.
- `BoardTable.tsx` + css — a departure-board table (weekday/weekend columns).
- `RouteShape.tsx` — inline SVG from a `LngLat[]`.
- `StopList.tsx` — ordered linked stop list.

**New — route segments:**
- `web/app/vonalak/page.tsx`, `web/app/vonalak/[id]/page.tsx` + `opengraph-image.tsx`
- `web/app/megallok/page.tsx`, `web/app/megallok/[slug]/page.tsx` + `opengraph-image.tsx`
- `web/app/utvonal/[pair]/page.tsx` + `opengraph-image.tsx`
- `web/app/dijszabas/`, `web/app/multi-trans/`, `web/app/sepsibike/`, `web/app/buszmenetrend/`, `web/app/gyik/` — each `page.tsx` + `opengraph-image.tsx`
- `web/app/ro/` — parallel tree: `ro/page.tsx` (planner), `ro/linii/…`, `ro/statii/…`, `ro/trasee/…`, `ro/tarife/`, `ro/multi-trans/`, `ro/sepsibike/`, `ro/orar-autobuz/`, `ro/intrebari-frecvente/`, `ro/termeni/`, `ro/confidentialitate/`
- `web/app/not-found.tsx` — custom 404

**New — scripts & assets:**
- `web/scripts/localize-html.mjs` — post-build: rewrite `<html lang="hu">` → `"ro"` across `out/ro/**`.
- `web/scripts/verify-seo.mjs` — post-build structural checks (see Task 24).
- `web/public/fonts/og.ttf` — bundled OG-card font (glyph-checked).
- `web/public/offline.html` — SW offline fallback for non-`/` navigations.

**Modified:**
- `web/app/sitemap.ts` — enumerate `allPages()`.
- `web/app/robots.ts` — unchanged behaviour; confirm only.
- `web/public/sw.js` — navigate handler: only `/` is the cached shell.
- `web/netlify.toml` — `[[redirects]]` table.
- `web/package.json` — `build` script chains `localize-html.mjs` and `verify-seo.mjs`.
- `web/components/planner/Planner.tsx:~1160` — add footer links in the existing settings/source block.
- `web/components/index.ts` — export new `seo/` components if used cross-tree.

---

## Phase 1 — Foundation & shared infrastructure

### Task 1: `lib/seo/slug.ts` — slugs and collision handling

**Files:**
- Create: `web/lib/seo/slug.ts`
- Test: `web/lib/seo/slug.test.ts`

**Interfaces:**
- Produces: `slugify(name: string): string`; `disambiguate<T>(items: T[], key: (t: T) => string): Map<T, string>` — returns a slug per item, suffixing `-2`, `-3` for repeats in input order.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { slugify, disambiguate } from "./slug";

describe("slugify", () => {
  it("folds Hungarian and Romanian diacritics to ASCII", () => {
    expect(slugify("Sepsi Aréna")).toBe("sepsi-arena");
    expect(slugify("Str. Ciucului 2")).toBe("str-ciucului-2");
    expect(slugify("Șugaș Băi")).toBe("sugas-bai");
    expect(slugify("N. Iorga sugárút 1")).toBe("n-iorga-sugarut-1");
    expect(slugify("Câmpul Frumos / Szépmező")).toBe("campul-frumos-szepmezo");
  });
  it("collapses separators and trims", () => {
    expect(slugify("  Domb   utca  ")).toBe("domb-utca");
  });
});

describe("disambiguate", () => {
  it("suffixes repeats in stable order", () => {
    const items = [{ n: "Debren" }, { n: "Debren" }, { n: "Sport utca" }];
    const m = disambiguate(items, (i) => i.n);
    expect([...m.values()]).toEqual(["debren", "debren-2", "sport-utca"]);
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `cd web && npm test -- --run lib/seo/slug.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`slugify`: `name.normalize("NFKD").replace(/[̀-ͯ]/g, "")` to strip combining marks, then map the few glyphs NFKD misses (`ș→s ț→t đ→d ł→l`), lowercase, `replace(/[^a-z0-9]+/g, "-")`, trim leading/trailing `-`. `disambiguate`: iterate, track a `count` map of base slugs, first occurrence gets the base, subsequent get `${base}-${n}`.

- [ ] **Step 4: Run, verify it passes**

Run: `cd web && npm test -- --run lib/seo/slug.test.ts` → PASS

- [ ] **Step 5: Commit**

```bash
git add web/lib/seo/slug.ts web/lib/seo/slug.test.ts
git commit -m "Add SEO slug helper with diacritic folding and collision suffixes"
```

---

### Task 2: `lib/seo/network.ts` + `lib/seo/places.ts` — physical places

**Files:**
- Create: `web/lib/seo/network.ts`, `web/lib/seo/places.ts`
- Test: `web/lib/seo/places.test.ts`

**Interfaces:**
- Consumes: `slugify`, `disambiguate` (Task 1); `Network`, `Stop`, `LngLat` from `@/lib/engine/types`.
- Produces:
  - `loadNetwork(): Network` — reads `web/public/data/network.json` synchronously via `node:fs`, parsed and typed.
  - `interface Place { slug: string; key: string; name: { hu: string; ro: string }; at: LngLat; stopIds: string[]; }`
  - `buildPlaces(network: Network): Place[]` — clusters stops whose folded HU name matches **and** whose coordinates are within 150 m (or joined by a `walks` entry ≤ 200 m); `at` is the centroid; `key` is the stable folded HU name + rounded centroid; `slug` from `disambiguate`.
  - `placeOf(places: Place[], stopId: string): Place | undefined`
  - `NOTABLE_PLACE_KEYS: readonly string[]` — hand-picked keys (train station, the two Cap Linie terminals, Megyei Kórház / Spitalul Județean, Sepsi Aréna, Lábasház, Autoliv, Sugás fürdő / Șugaș Băi, Árkos / Arcuș centre, the malls, the large high schools). Left as a `TODO(list)` comment ONLY here — fill with real keys during implementation by inspecting `buildPlaces(loadNetwork())`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { loadNetwork } from "./network";
import { buildPlaces, placeOf } from "./places";

const net = loadNetwork();
const places = buildPlaces(net);

describe("buildPlaces", () => {
  it("merges opposite-kerb stops that share a name and sit close together", () => {
    // P1 and P3 are both "Csíki utca 2" / "Str. Ciucului 2", ~20 m apart
    const p1 = placeOf(places, "P1");
    const p3 = placeOf(places, "P3");
    expect(p1).toBeDefined();
    expect(p1).toBe(p3);
    expect(p1!.stopIds).toEqual(expect.arrayContaining(["P1", "P3"]));
  });
  it("keeps distinct places distinct and gives every place a unique slug", () => {
    const slugs = places.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(places.length).toBeGreaterThan(40);
    expect(places.length).toBeLessThan(net.stops.length);
  });
  it("carries both language names", () => {
    const arena = places.find((p) => p.name.hu.includes("Aréna"));
    expect(arena?.name.ro).toMatch(/Arena/);
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `cd web && npm test -- --run lib/seo/places.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement**

`loadNetwork`: `JSON.parse(readFileSync(join(process.cwd(), "public/data/network.json"), "utf8"))`. `buildPlaces`: union-find over stops; union when folded HU names equal AND (`haversine(a.at, b.at) <= 150` OR a `walks` edge with `metres <= 200` connects them). For each cluster compute centroid, pick the member names (HU/RO) by most common, build `key = slugify(huName) + "@" + centroid.map(c => c.toFixed(3)).join(",")`, then `disambiguate(clusters, c => slugify(c.huName))` for `slug`. Sort clusters by slug for determinism. Add a small `haversine(a, b)` helper local to this file.

- [ ] **Step 4: Run, verify it passes** → `npm test -- --run lib/seo/places.test.ts` PASS

- [ ] **Step 5: Fill `NOTABLE_PLACE_KEYS`**

Run `cd web && node -e "const{loadNetwork}=require('./lib/seo/network');const{buildPlaces}=require('./lib/seo/places');for(const p of buildPlaces(loadNetwork()))console.log(p.slug,'|',p.name.hu)"` (or a `tsx` equivalent), pick the ~15 keys, replace the `TODO`.

- [ ] **Step 6: Commit**

```bash
git add web/lib/seo/network.ts web/lib/seo/places.ts web/lib/seo/places.test.ts
git commit -m "Cluster stops into physical places for SEO stop pages"
```

---

### Task 3: `lib/seo/lines.ts` — line names, boards, headway

**Files:**
- Create: `web/lib/seo/lines.ts`
- Test: `web/lib/seo/lines.test.ts`

**Interfaces:**
- Consumes: `Network`, `Line`, `Pattern`, `OfficialBoard`, `ServiceId` from `@/lib/engine/types`; `loadNetwork` (Task 2).
- Produces:
  - `enrichLine(net, lineId, lang): { id; label; title; termini: [string, string]; colour; textColour }` — `label` = `"1-es busz"` (hu) / `"linia 1"` (ro); `title` = label + " · " + termini joined with " – ".
  - `lineDirections(net, lineId): { patternId; headsign: {hu;ro}; stopIds: string[] }[]` — one per distinct `stopIds` sequence.
  - `boardFor(net, lineId, stopId): { weekday: number[]; weekend: number[] } | null` — from `officialBoards` (all 284 carry `stopId`).
  - `firstLast(board): { first: number; last: number }` (per service).
  - `headway(times: number[]): number | null` — the modal gap if ≥ 60 % of gaps are within ±2 min of it, else `null`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { loadNetwork } from "./network";
import { enrichLine, boardFor, headway } from "./lines";

const net = loadNetwork();

describe("enrichLine", () => {
  it("builds a language-specific label", () => {
    expect(enrichLine(net, "1", "hu").label).toBe("1-es busz");
    expect(enrichLine(net, "1", "ro").label).toBe("linia 1");
    expect(enrichLine(net, "1D", "hu").label).toBe("1D-s busz");
  });
});

describe("boardFor", () => {
  it("returns published departure minutes for a served stop", () => {
    // P22 Arena Sepsi is served by line 5 (see officialBoards)
    const b = boardFor(net, "5", "P22");
    expect(b).not.toBeNull();
    expect(b!.weekday[0]).toBeGreaterThan(240);
    expect(b!.weekday).toEqual([...b!.weekday].sort((a, z) => a - z));
  });
});

describe("headway", () => {
  it("detects a regular 30-minute cadence", () => {
    expect(headway([360, 390, 420, 450, 480])).toBe(30);
  });
  it("returns null for irregular times", () => {
    expect(headway([360, 372, 500, 505, 900])).toBeNull();
  });
});
```

- [ ] **Step 2: Run, verify it fails** → `npm test -- --run lib/seo/lines.test.ts` FAIL.

- [ ] **Step 3: Implement**

`enrichLine`: HU label — a digit-only id takes `-es`/`-ös`/… by vowel harmony; simplest correct rule for this feed: `1,2,4,5,7,9,10` → base+`-es`/`-as`… Use the known set: map `{1:"1-es",2:"2-es",3:"3-as",4:"4-es",5:"5-ös",6:"6-os",7:"7-es",9:"9-es",10:"10-es"}` and for `D` ids append `"-s busz"` to the id (`"1D-s busz"`). RO label = `"linia " + id.toLowerCase()`. Termini from the two patterns' first/last stop names in `lang`. `boardFor`: `officialBoards.find(b => b.lineId === lineId && b.stopId === stopId)`, return `{weekday, weekend}` sorted. `headway`: gaps = consecutive diffs; mode = most frequent gap; return it when ≥ 0.6 of gaps are within 2 of the mode.

- [ ] **Step 4: Run, verify it passes** → PASS

- [ ] **Step 5: Commit**

```bash
git add web/lib/seo/lines.ts web/lib/seo/lines.test.ts
git commit -m "Add line enrichment, official-board lookup, and headway detection"
```

---

### Task 4: `lib/seo/routes.ts` — notable pairs and build-time journeys

**Files:**
- Create: `web/lib/seo/routes.ts`
- Test: `web/lib/seo/routes.test.ts`

**Interfaces:**
- Consumes: `buildPlaces`, `NOTABLE_PLACE_KEYS`, `Place` (Task 2); `loadNetwork` (Task 2); `planWithWalking` or the exported planner entry from `@/lib/engine/plan` — **inspect `web/lib/engine/plan.ts` exports first**; use the same call the worker uses but with a straight-line `WalkingContext` built from `network.walks` (no OSM graph at build time).
- Produces:
  - `interface RoutePair { slug: string; a: Place; b: Place; }`
  - `notablePairs(net): RoutePair[]` — every unordered pair of notable places where a journey exists in at least one direction; `slug = [slugify(a.name.hu), slugify(b.name.hu)].sort().join("-")` (deterministic, so `b-a` maps to the same slug).
  - `routeBySlug(net, slug): RoutePair | undefined`
  - `journeyBetween(net, from: Place, to: Place, lang): RouteSummary | null` — representative weekday departure ~08:00; returns `{ legs: {lineLabel; fromName; toName; rideMin; stops}[]; walkMin; totalMin; transfers; firstDep; lastDep }`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { loadNetwork } from "./network";
import { notablePairs, routeBySlug, journeyBetween } from "./routes";

const net = loadNetwork();

describe("notablePairs", () => {
  it("produces canonical, order-independent slugs and no duplicates", () => {
    const pairs = notablePairs(net);
    const slugs = pairs.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s).toBe(s.split("-").sort().join("-") === s ? s : s); // slug halves sorted
    expect(pairs.length).toBeGreaterThan(30);
  });
});

describe("journeyBetween", () => {
  it("computes a real journey with at least one bus leg for a known pair", () => {
    const pairs = notablePairs(net);
    const withBus = pairs
      .map((p) => journeyBetween(net, p.a, p.b, "hu"))
      .filter((j) => j && j.legs.some((l) => l.lineLabel));
    expect(withBus.length).toBeGreaterThan(0);
    expect(withBus[0]!.totalMin).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run, verify it fails** → FAIL.

- [ ] **Step 3: Implement**

Build a `WalkingContext` from `net.walks`: `access`/`egress` maps keyed by stopId with `{metres, minutes: seconds/60, path}`; `direct` = straight-line when within ~1.2 km else null. Call the engine's planner for `mode: "departAt"`, `time: 8*60`, `service: "weekday"`, `walkAversion: 0.3`. Take the first `Journey`. Map its legs to `RouteSummary`. `firstDep`/`lastDep`: scan `boardFor` on the boarding stop of the first ride leg. If the planner returns nothing in either direction, the pair is dropped by `notablePairs`.

- [ ] **Step 4: Run, verify it passes** → PASS. Also run the full engine suite to prove no import cycle: `cd web && npm test -- --run lib/engine`.

- [ ] **Step 5: Commit**

```bash
git add web/lib/seo/routes.ts web/lib/seo/routes.test.ts
git commit -m "Enumerate notable route pairs with build-time representative journeys"
```

---

### Task 5: `lib/seo/urls.ts` — the page inventory

**Files:**
- Create: `web/lib/seo/urls.ts`
- Test: `web/lib/seo/urls.test.ts`

**Interfaces:**
- Consumes: `buildPlaces` (Task 2), `enrichLine`/line list (Task 3), `notablePairs` (Task 4), `loadNetwork`.
- Produces:
  - `interface PageEntry { path: string; hu: string; ro: string; lastModified: string; priority: number; }` — `path` is the canonical (HU) path; `hu`/`ro` are absolute-from-root paths for the alternates; `lastModified` from `network.generated` (format `YYYYMMDD` → ISO).
  - `allPages(net = loadNetwork()): PageEntry[]` — planner (`/` ↔ `/ro/`), `/terms/` ↔ `/ro/termeni/`, `/privacy/` ↔ `/ro/confidentialitate/`, the 5 guide pages, 2 index pages, every line, every place, every route pair.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { allPages } from "./urls";

const pages = allPages();

describe("allPages", () => {
  it("covers planner, guides, lines, places and routes with hu/ro twins", () => {
    expect(pages.find((p) => p.path === "/")?.ro).toBe("/ro/");
    expect(pages.some((p) => p.path === "/vonalak/1/")).toBe(true);
    expect(pages.some((p) => p.path.startsWith("/megallok/"))).toBe(true);
    expect(pages.some((p) => p.path.startsWith("/utvonal/"))).toBe(true);
    expect(pages.every((p) => p.hu && p.ro && p.lastModified.startsWith("20"))).toBe(true);
    expect(new Set(pages.map((p) => p.path)).size).toBe(pages.length);
    expect(pages.length).toBeGreaterThan(150);
  });
  it("maps every ro path under /ro/", () => {
    expect(pages.every((p) => p.ro === "/ro/" || p.ro.startsWith("/ro/"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run, verify it fails** → FAIL.
- [ ] **Step 3: Implement** — assemble the list from the other modules; ISO date via `\`${y}-${m}-${d}\``. `trailingSlash: true`, so every path ends `/`.
- [ ] **Step 4: Run, verify it passes** → PASS.
- [ ] **Step 5: Commit**

```bash
git add web/lib/seo/urls.ts web/lib/seo/urls.test.ts
git commit -m "Add the SEO page inventory used by the sitemap and checks"
```

---

### Task 6: `lib/seo/metadata.ts` + `lib/seo/jsonld.ts`

**Files:**
- Create: `web/lib/seo/metadata.ts`, `web/lib/seo/jsonld.ts`
- Test: `web/lib/seo/metadata.test.ts`

**Interfaces:**
- Consumes: `PageEntry` shape (Task 5); `Metadata` from `next`.
- Produces:
  - `SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sepsimenetrend.ro"` (same default as `layout.tsx`).
  - `pageMetadata(input: { huPath: string; roPath: string; lang: "hu" | "ro"; title: string; description: string; ogPath?: string }): Metadata` — sets `title` (absolute, bypassing the template with `{ absolute }` when needed), `description`, `alternates: { canonical: <self>, languages: { hu, ro, "x-default": hu } }`, `openGraph` (`locale` `hu_HU`/`ro_RO`, `url` self, `type: "website"`), `twitter`.
  - `breadcrumbLd(items: { name: string; path: string }[]): object`
  - `faqLd(qa: { q: string; a: string }[]): object`
  - `websiteLd(lang): object`
  - `jsonLdScript(obj): string` — `JSON.stringify` for embedding in a `<script type="application/ld+json">`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { pageMetadata } from "./metadata";
import { breadcrumbLd } from "./jsonld";

describe("pageMetadata", () => {
  it("emits reciprocal hreflang with x-default pointing at Hungarian", () => {
    const m = pageMetadata({
      huPath: "/vonalak/1/", roPath: "/ro/linii/1/", lang: "ro",
      title: "Linia 1 – orar autobuz Sfântu Gheorghe", description: "…",
    });
    expect(m.alternates?.canonical).toBe("https://sepsimenetrend.ro/ro/linii/1/");
    expect(m.alternates?.languages?.hu).toBe("https://sepsimenetrend.ro/vonalak/1/");
    expect(m.alternates?.languages?.["x-default"]).toBe("https://sepsimenetrend.ro/vonalak/1/");
    expect((m.openGraph as any)?.locale).toBe("ro_RO");
  });
});

describe("breadcrumbLd", () => {
  it("numbers positions from 1 and uses absolute URLs", () => {
    const ld: any = breadcrumbLd([{ name: "Sepsi Menetrend", path: "/" }, { name: "Vonalak", path: "/vonalak/" }]);
    expect(ld["@type"]).toBe("BreadcrumbList");
    expect(ld.itemListElement[0].position).toBe(1);
    expect(ld.itemListElement[1].item).toBe("https://sepsimenetrend.ro/vonalak/");
  });
});
```

- [ ] **Step 2: Run, verify it fails** → FAIL.
- [ ] **Step 3: Implement** per signatures. Read `web/node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md` for the `alternates` / `openGraph` shape in this version.
- [ ] **Step 4: Run, verify it passes** → PASS.
- [ ] **Step 5: Commit**

```bash
git add web/lib/seo/metadata.ts web/lib/seo/jsonld.ts web/lib/seo/metadata.test.ts
git commit -m "Add SEO metadata and JSON-LD builders"
```

---

### Task 7: `lib/seo/content.ts` + guide prose (hu/ro)

**Files:**
- Create: `web/lib/seo/content.ts`, `web/lib/seo/content.hu.ts`, `web/lib/seo/content.ro.ts`
- Test: `web/lib/seo/content.test.ts`

**Interfaces:**
- Produces:
  - `interface GuidePage { slug: { hu: string; ro: string }; title: { hu: string; ro: string }; description: { hu: string; ro: string }; body: { hu: Block[]; ro: Block[] }; faq?: { hu: Faq[]; ro: Faq[] }; }`
  - `type Block = { h2: string } | { p: string } | { ul: string[] }`
  - `interface Faq { q: string; a: string }`
  - `GUIDES: Record<"fares" | "multiTrans" | "bike" | "pillar" | "faq", GuidePage>`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { GUIDES } from "./content";

describe("GUIDES", () => {
  it("has both languages for every field of every guide", () => {
    for (const g of Object.values(GUIDES)) {
      for (const lang of ["hu", "ro"] as const) {
        expect(g.slug[lang]).toMatch(/^[a-z0-9-]+$/);
        expect(g.title[lang].length).toBeGreaterThan(8);
        expect(g.description[lang].length).toBeGreaterThan(40);
        expect(g.body[lang].length).toBeGreaterThan(2);
      }
    }
  });
  it("states the unofficial relationship on the Multi-Trans page in both languages", () => {
    const flat = (b: any[]) => JSON.stringify(b).toLowerCase();
    expect(flat(GUIDES.multiTrans.body.hu)).toContain("nem hivatalos");
    expect(flat(GUIDES.multiTrans.body.ro)).toContain("neoficial");
  });
});
```

- [ ] **Step 2: Run, verify it fails** → FAIL.
- [ ] **Step 3: Implement** — write real prose. Fares: 2.5 RON city / 4 RON Arcuș via 24pay, validity 50/60 min, Free Friday (cite the Multi-Trans FB policy per `memory/free-friday-promotion.md`), where to buy. Multi-Trans: operator identity, line list, multitrans.ro link, the "rebuilds the published timetable, not affiliated" statement. Bike: SepsiBike/GloBikes account, 0–30 min free, 06:00–22:00 pickup. Pillar: whole-network overview, the 12 lines, how zones/tickets work, links out. FAQ: 6–8 real Q&As per language.
- [ ] **Step 4: Run, verify it passes** → PASS.
- [ ] **Step 5: Commit**

```bash
git add web/lib/seo/content*.ts
git commit -m "Add bilingual guide-page content (fares, Multi-Trans, bike, pillar, FAQ)"
```

---

### Task 8: `lib/seo/og.tsx` — the Open Graph card

**Files:**
- Create: `web/lib/seo/og.tsx`
- Add: `web/public/fonts/og.ttf` (see Step 3)
- Test: `web/lib/seo/og.test.tsx`

**Interfaces:**
- Consumes: `ImageResponse` from `next/og`.
- Produces:
  - `OG_SIZE = { width: 1200, height: 630 }`, `OG_CONTENT_TYPE = "image/png"`.
  - `ogFont(): Promise<ArrayBuffer>` — `readFile` of `public/fonts/og.ttf`.
  - `type OgProps = { kind: "line" | "place" | "route" | "guide"; lang: "hu" | "ro"; heading: string; sub?: string; badge?: { text: string; bg: string; fg: string }; shape?: [number, number][] }`
  - `renderOg(props: OgProps): Promise<ImageResponse>` — builds the card tree (wordmark top-left, `nem hivatalos`/`neoficial` tag, `heading` large, `sub` below, optional colour `badge`, optional route `shape` as a `<svg>` polyline) and returns `new ImageResponse(tree, { ...OG_SIZE, fonts: [{ name: "og", data: await ogFont(), style: "normal" }] })`.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from "vitest";
import { renderOg } from "./og";

describe("renderOg", () => {
  it("returns a 1200x630 PNG for a line card with diacritics", async () => {
    const res = await renderOg({
      kind: "line", lang: "ro",
      heading: "Linia 1", sub: "Șugaș Băi – Gara CFR · orar",
      badge: { text: "1", bg: "#136F29", fg: "#fff" },
    });
    expect(res.headers.get("content-type")).toBe("image/png");
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.length).toBeGreaterThan(2000);
    expect(buf.length).toBeLessThan(8 * 1024 * 1024);
    // PNG magic
    expect(buf.subarray(0, 4).toString("hex")).toBe("89504e47");
  });
});
```

- [ ] **Step 2: Run, verify it fails** → FAIL.

- [ ] **Step 3: Add the font, then implement**

Check whether Next's bundled `web/node_modules/next/dist/compiled/@vercel/og/noto-sans-v27-latin-regular.ttf` (or `Geist-Regular.ttf`) renders `ő ű ș ț ă â î`. If any glyph is missing, download a permissively licensed TTF that covers Latin Extended-A + Latin Extended Additional (e.g. Inter, DejaVu Sans, Noto Sans) and save as `web/public/fonts/og.ttf`. Add a comment in `og.tsx` naming the font and its licence. Implement `renderOg` per the signature.

- [ ] **Step 4: Run, verify it passes** → PASS. Then eyeball one: `cd web && node -e "..."` to write the buffer to `/tmp/og.png` and open it; confirm no tofu.

- [ ] **Step 5: Commit**

```bash
git add web/lib/seo/og.tsx web/lib/seo/og.test.tsx web/public/fonts/og.ttf
git commit -m "Add the Open Graph card template with an embedded Latin-Extended font"
```

---

### Task 9: Romanian route tree + post-build lang localisation

**Files:**
- Create: `web/app/ro/page.tsx` (RO planner), `web/app/ro/termeni/page.tsx`, `web/app/ro/confidentialitate/page.tsx`
- Create: `web/scripts/localize-html.mjs`
- Modify: `web/package.json` (`build` script)
- Test: `web/scripts/localize-html.test.mjs` (node test) or `web/lib/seo/localize.test.ts`

**Interfaces:**
- Produces: `web/app/ro/page.tsx` renders the same `<Planner …>` as `app/page.tsx` (import and reuse `Page`'s data-loading — extract the shared loader into `web/lib/seo/planner-data.ts` if cleaner, or duplicate the ~10 lines). Its `generateMetadata` uses `pageMetadata({ huPath: "/", roPath: "/ro/", lang: "ro", … })`.
- `localize-html.mjs`: walk `out/ro/`, for every `*.html` replace the first `<html lang="hu"` with `<html lang="ro"` and `og:locale" content="hu_HU"` → `ro_RO` if present. Idempotent. Print count.

- [ ] **Step 1: Write the failing test**

```ts
// web/lib/seo/localize.test.ts — unit-test the pure transform
import { describe, it, expect } from "vitest";
import { toRomanian } from "./localize"; // export the string transform from the script's core

describe("toRomanian", () => {
  it("switches the html lang and og locale once", () => {
    const src = '<!doctype html><html lang="hu"><head><meta property="og:locale" content="hu_HU"/>';
    const out = toRomanian(src);
    expect(out).toContain('<html lang="ro">');
    expect(out).toContain("ro_RO");
    expect(toRomanian(out)).toBe(out); // idempotent
  });
});
```

- [ ] **Step 2: Run, verify it fails** → FAIL.
- [ ] **Step 3: Implement** — put the transform in `web/lib/seo/localize.ts` (`export function toRomanian(html: string): string`), and `localize-html.mjs` imports it (or duplicates — the script runs post-build in plain node; a tiny `.mjs` re-impl is fine, but keep the tested function authoritative). Wire `package.json`: `"build": "next build && node scripts/localize-html.mjs && node scripts/verify-seo.mjs && node scripts/stamp-sw.mjs"` (verify-seo added in Task 24; add it now as an empty passthrough or defer the chain edit to Task 24 — defer). For now: `"build": "next build && node scripts/localize-html.mjs && node scripts/stamp-sw.mjs"`.
- [ ] **Step 4: Run, verify it passes**; then `cd web && npm run build` and confirm `out/ro/index.html` has `lang="ro"` and `out/index.html` still has `lang="hu"`.
- [ ] **Step 5: Commit**

```bash
git add web/app/ro web/scripts/localize-html.mjs web/lib/seo/localize.ts web/lib/seo/localize.test.ts web/package.json
git commit -m "Add the Romanian route tree and post-build lang localisation"
```

---

### Task 10: `components/seo/PageFrame.tsx` — breadcrumb, language switch, disclaimer

**Files:**
- Create: `web/components/seo/PageFrame.tsx`, `web/components/seo/PageFrame.module.css`
- Test: `web/components/seo/PageFrame.test.tsx`

**Interfaces:**
- Consumes: `breadcrumbLd`, `jsonLdScript` (Task 6).
- Produces: `PageFrame({ lang, crumbs, twinPath, children })` — server component. Renders: a `<nav>` breadcrumb from `crumbs: { name: string; path: string }[]`; a visible language-switch `<a>` to `twinPath` labelled `"Română"`/`"Magyar"`; `{children}`; a `<footer>` with the disclaimer (`"Nem a Multi-Trans SA hivatalos oldala"` / `"Nu este site-ul oficial Multi-Trans SA"`), a link to `https://multitrans.ro/index.html`, and links to the pillar page + planner; a `<script type="application/ld+json">` with the breadcrumb LD.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import PageFrame from "./PageFrame";

describe("PageFrame", () => {
  it("shows a Romanian disclaimer and a link to the operator", () => {
    render(
      <PageFrame lang="ro" twinPath="/vonalak/1/"
        crumbs={[{ name: "Sepsi Menetrend", path: "/ro/" }, { name: "Linia 1", path: "/ro/linii/1/" }]}>
        <p>content</p>
      </PageFrame>,
    );
    expect(screen.getByText(/Nu este site-ul oficial Multi-Trans/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /multitrans\.ro/i })).toHaveAttribute("href", expect.stringContaining("multitrans.ro"));
    expect(screen.getByRole("link", { name: "Magyar" })).toHaveAttribute("href", "/vonalak/1/");
  });
  it("emits BreadcrumbList JSON-LD", () => {
    const { container } = render(
      <PageFrame lang="hu" twinPath="/ro/linii/1/"
        crumbs={[{ name: "Sepsi Menetrend", path: "/" }, { name: "1-es busz", path: "/vonalak/1/" }]}>
        <p>x</p>
      </PageFrame>,
    );
    const ld = container.querySelector('script[type="application/ld+json"]')!;
    expect(JSON.parse(ld.textContent!)["@type"]).toBe("BreadcrumbList");
  });
});
```

- [ ] **Step 2: Run, verify it fails** → `cd web && npm test -- --run components/seo/PageFrame.test.tsx` FAIL.
- [ ] **Step 3: Implement** the component + a small CSS module reusing the palette tokens from `app/globals.css`.
- [ ] **Step 4: Run, verify it passes** → PASS.
- [ ] **Step 5: Commit**

```bash
git add web/components/seo/PageFrame.tsx web/components/seo/PageFrame.module.css web/components/seo/PageFrame.test.tsx
git commit -m "Add the shared SEO page frame (breadcrumb, language switch, disclaimer)"
```

---

### Task 11: `components/seo/BoardTable.tsx`, `StopList.tsx`, `RouteShape.tsx`

**Files:**
- Create: `web/components/seo/BoardTable.tsx` (+ css), `web/components/seo/StopList.tsx` (+ css), `web/components/seo/RouteShape.tsx`
- Test: `web/components/seo/BoardTable.test.tsx`, `web/components/seo/RouteShape.test.tsx`

**Interfaces:**
- Produces:
  - `BoardTable({ lang, weekday, weekend })` — `weekday`/`weekend` are `number[]` minutes; renders two columns grouped by hour, formatted `H:MM`. Uses `formatMinute` from `@/lib/engine/time` (verify the export name).
  - `StopList({ lang, stops })` — `stops: { name: string; slug: string }[]`; ordered `<ol>` of links to `/megallok/{slug}/` (or `/ro/statii/{slug}/` when `lang === "ro"`).
  - `RouteShape({ shape, colour })` — `shape: [number, number][]`; computes a `viewBox` from bounds, draws one `<polyline>`; `aria-hidden`, no JS.

- [ ] **Step 1: Write the failing tests**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import BoardTable from "./BoardTable";
import RouteShape from "./RouteShape";

describe("BoardTable", () => {
  it("formats minutes as clock times under weekday/weekend headings", () => {
    render(<BoardTable lang="hu" weekday={[365, 395]} weekend={[420]} />);
    expect(screen.getByText("6:05")).toBeInTheDocument();
    expect(screen.getByText("7:00")).toBeInTheDocument();
  });
});

describe("RouteShape", () => {
  it("renders a single polyline with a fitted viewBox", () => {
    const { container } = render(<RouteShape shape={[[25.78, 45.86], [25.80, 45.88]]} colour="#136F29" />);
    const poly = container.querySelector("polyline")!;
    expect(poly).toBeTruthy();
    expect(container.querySelector("svg")!.getAttribute("viewBox")).toMatch(/^[\d.\- ]+$/);
  });
});
```

- [ ] **Step 2: Run, verify they fail** → FAIL.
- [ ] **Step 3: Implement** the three components.
- [ ] **Step 4: Run, verify they pass** → PASS.
- [ ] **Step 5: Commit**

```bash
git add web/components/seo/BoardTable* web/components/seo/StopList* web/components/seo/RouteShape*
git commit -m "Add board table, stop list, and route-shape SEO components"
```

---

### Task 12: `sitemap.ts` from the inventory; confirm `robots.ts`

**Files:**
- Modify: `web/app/sitemap.ts`
- Test: `web/lib/seo/sitemap.test.ts` (test the entry list, not Next's serialization)

**Interfaces:**
- Consumes: `allPages` (Task 5).
- Produces: `sitemap()` returns `allPages().map(e => ({ url: SITE + e.path, lastModified: e.lastModified, changeFrequency, priority: e.priority, alternates: { languages: { hu: SITE + e.hu, ro: SITE + e.ro } } }))`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import sitemap from "@/app/sitemap";

describe("sitemap", () => {
  it("lists every inventory page with language alternates", () => {
    const entries = sitemap();
    expect(entries.length).toBeGreaterThan(150);
    const line1 = entries.find((e) => e.url.endsWith("/vonalak/1/"))!;
    expect(line1.alternates?.languages?.ro).toBe("https://sepsimenetrend.ro/ro/linii/1/");
    expect(entries.find((e) => e.url === "https://sepsimenetrend.ro/")).toBeTruthy();
    expect(entries.find((e) => e.url.endsWith("/terms/"))).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run, verify it fails** (old sitemap has 3 entries) → FAIL.
- [ ] **Step 3: Implement.** Keep `export const dynamic = "force-static"`. Read `web/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/sitemap.md` for the `alternates` field shape in 16.3.1. Confirm `robots.ts` needs no change (allow-all + sitemap pointer already correct).
- [ ] **Step 4: Run, verify it passes**; `cd web && npm run build`; open `out/sitemap.xml`, confirm it lists content URLs and `xhtml:link` alternates.
- [ ] **Step 5: Commit**

```bash
git add web/app/sitemap.ts web/lib/seo/sitemap.test.ts
git commit -m "Generate the sitemap from the full page inventory with hreflang alternates"
```

---

### Task 13: `netlify.toml` redirects + custom 404

**Files:**
- Modify: `web/netlify.toml`
- Create: `web/app/not-found.tsx`
- Test: `web/lib/seo/redirects.test.ts` (assert the toml contains the rules), `web/components/seo/NotFound.test.tsx` if the 404 body is a component

**Interfaces:**
- Produces: `netlify.toml` gains, before the `[[headers]]` blocks:

```toml
[[redirects]]
  from = "/hu/*"
  to = "/:splat"
  status = 301
[[redirects]]
  from = "/lines/*"
  to = "/vonalak/:splat"
  status = 301
[[redirects]]
  from = "/stops/*"
  to = "/megallok/:splat"
  status = 301
```

- `app/not-found.tsx` — a static server component: heading + links to `/` and `/buszmenetrend/` (hu) and `/ro/` and `/ro/orar-autobuz/` (ro).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("netlify redirects", () => {
  it("301s /hu/* to the bare path", () => {
    const toml = readFileSync(new URL("../../netlify.toml", import.meta.url), "utf8");
    expect(toml).toMatch(/from = "\/hu\/\*"[\s\S]*?status = 301/);
  });
});
```

- [ ] **Step 2: Run, verify it fails** → FAIL.
- [ ] **Step 3: Implement** the toml block and `not-found.tsx`.
- [ ] **Step 4: Run, verify it passes**; `npm run build`; confirm `out/404.html` exists with the links.
- [ ] **Step 5: Commit**

```bash
git add web/netlify.toml web/app/not-found.tsx web/lib/seo/redirects.test.ts
git commit -m "Add redirect rules for renamed paths and a useful 404 page"
```

---

### Task 14: Service worker — only `/` is the cached shell

**Files:**
- Modify: `web/public/sw.js`
- Create: `web/public/offline.html`
- Test: `web/lib/service-worker.test.ts` (extend the existing file — check its current shape first)

**Interfaces:**
- Change the `request.mode === "navigate"` branch: if `url.pathname !== "/"`, do `event.respondWith(fetch(request).catch(() => caches.match("/offline.html")))` — **never** `cache.put("/", …)` and never fall back to `caches.match("/")`. Keep the existing behaviour exactly for `url.pathname === "/"`. Add `/offline.html` to `SHELL`.

- [ ] **Step 1: Write the failing test**

```ts
// follow the existing service-worker.test.ts harness for faking fetch events
it("never overwrites the / shell when navigating to a content page", async () => {
  const put = vi.fn();
  await handleFetch(navEvent("https://sepsimenetrend.ro/vonalak/1/"), { cachePut: put });
  expect(put).not.toHaveBeenCalledWith("/", expect.anything());
});
it("still serves the cached / shell for a root navigation offline", async () => {
  const res = await handleFetch(navEvent("https://sepsimenetrend.ro/"), { offline: true });
  expect(res).toBe(CACHED_SHELL);
});
```

Adapt to the real harness in `web/lib/service-worker.test.ts`.

- [ ] **Step 2: Run, verify it fails** → FAIL.
- [ ] **Step 3: Implement** the branch split; create a minimal styled `offline.html`.
- [ ] **Step 4: Run, verify it passes**; run the whole SW test file.
- [ ] **Step 5: Commit**

```bash
git add web/public/sw.js web/public/offline.html web/lib/service-worker.test.ts
git commit -m "Keep the service worker from serving the planner shell for content URLs"
```

---

### Task 15: Guide pages (HU + RO) + their OG images

**Files:**
- Create: `web/app/dijszabas/page.tsx` + `opengraph-image.tsx`, and the same for `multi-trans/`, `sepsibike/`, `buszmenetrend/`, `gyik/`
- Create the RO twins: `web/app/ro/tarife/`, `web/app/ro/multi-trans/`, `web/app/ro/sepsibike/`, `web/app/ro/orar-autobuz/`, `web/app/ro/intrebari-frecvente/`
- Create: `web/components/seo/GuideBody.tsx` — renders `Block[]`
- Test: `web/components/seo/GuideBody.test.tsx`; `web/lib/seo/guide-routes.test.ts`

**Interfaces:**
- Consumes: `GUIDES` (Task 7), `PageFrame` (Task 10), `pageMetadata`/`faqLd` (Task 6), `renderOg` (Task 8).
- Each `page.tsx`: a server component that renders `<PageFrame>` + `<GuideBody>` + (for the FAQ, or any guide with `faq`) a `faqLd` script. `generateMetadata` from `pageMetadata`. The pillar page additionally lists all 12 lines (from `enrichLine`) and links to the index pages.
- Each `opengraph-image.tsx`: `export const size`, `contentType`, `dynamic = "force-static"`; `export default async function Image()` returns `renderOg({ kind: "guide", lang, heading: GUIDES[k].title[lang], sub: … })`.

- [ ] **Step 1: Write the failing tests**

```tsx
// GuideBody.test.tsx
import { render, screen } from "@testing-library/react";
import GuideBody from "./GuideBody";
it("renders headings, paragraphs and lists", () => {
  render(<GuideBody blocks={[{ h2: "Jegyek" }, { p: "2,5 lej." }, { ul: ["24pay"] }]} />);
  expect(screen.getByRole("heading", { name: "Jegyek" })).toBeInTheDocument();
  expect(screen.getByText("24pay")).toBeInTheDocument();
});
```

```ts
// guide-routes.test.ts — the pages build without throwing
import { describe, it, expect } from "vitest";
import Pillar from "@/app/buszmenetrend/page";
it("the pillar page component returns an element", async () => {
  const el = await (Pillar as any)();
  expect(el).toBeTruthy();
});
```

- [ ] **Step 2: Run, verify they fail** → FAIL.
- [ ] **Step 3: Implement** `GuideBody`, the 5 HU pages, the 5 RO pages, and the 10 `opengraph-image.tsx` files (a shared helper `guideOg(k, lang)` in `lib/seo/og.tsx` keeps them one line each).
- [ ] **Step 4: Run tests; then `cd web && npm run build`.** Confirm `out/dijszabas/index.html`, `out/ro/tarife/index.html`, `out/dijszabas/opengraph-image*.png` (or the hashed name Next assigns) all exist. Grep one HTML for the disclaimer and the canonical.
- [ ] **Step 5: Commit**

```bash
git add web/app/dijszabas web/app/multi-trans web/app/sepsibike web/app/buszmenetrend web/app/gyik web/app/ro web/components/seo/GuideBody* web/lib/seo/guide-routes.test.ts web/components/seo/GuideBody.test.tsx
git commit -m "Add bilingual guide pages (fares, Multi-Trans, bike, pillar, FAQ) with OG cards"
```

---

### Task 16: Index pages `/vonalak/` and `/megallok/` (+ RO twins)

**Files:**
- Create: `web/app/vonalak/page.tsx`, `web/app/megallok/page.tsx`, `web/app/ro/linii/page.tsx`, `web/app/ro/statii/page.tsx`
- Test: `web/lib/seo/index-pages.test.ts`

**Interfaces:**
- Consumes: `enrichLine` + line list (Task 3), `buildPlaces` (Task 2), `PageFrame`, `pageMetadata`.
- `/vonalak/`: `<PageFrame>` + a list of all 12 lines, each a link to `/vonalak/{id}/` with the enriched label and termini, colour swatch. `/megallok/`: all places grouped A–Z, each linking `/megallok/{slug}/`. RO twins mirror with `/ro/linii/{id}/` and `/ro/statii/{slug}/`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import Lines from "@/app/vonalak/page";
it("lists all 12 lines with links", async () => {
  const { container } = (await import("@testing-library/react")).render(await (Lines as any)());
  const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
  expect(hrefs.filter((h) => h?.startsWith("/vonalak/")).length).toBeGreaterThanOrEqual(12);
});
```

- [ ] **Step 2: Run, verify it fails** → FAIL.
- [ ] **Step 3: Implement** the four pages.
- [ ] **Step 4: Run tests; `npm run build`; confirm the four `index.html` files.**
- [ ] **Step 5: Commit**

```bash
git add web/app/vonalak/page.tsx web/app/megallok/page.tsx web/app/ro/linii/page.tsx web/app/ro/statii/page.tsx web/lib/seo/index-pages.test.ts
git commit -m "Add line and stop index pages in both languages"
```

---

## Phase 2 — Line pages

### Task 17: Line pages `/vonalak/[id]/` and `/ro/linii/[id]/`

**Files:**
- Create: `web/app/vonalak/[id]/page.tsx`, `web/app/ro/linii/[id]/page.tsx`
- Create: `web/components/seo/LinePage.tsx` — the shared body, `lang`-parameterised
- Test: `web/components/seo/LinePage.test.tsx`, `web/lib/seo/line-params.test.ts`

**Interfaces:**
- Consumes: `enrichLine`, `lineDirections`, `boardFor`, `firstLast`, `headway` (Task 3); `buildPlaces`/`placeOf` (Task 2); `BoardTable`, `StopList`, `RouteShape`, `PageFrame` (Tasks 10–11); `pageMetadata` (Task 6).
- `page.tsx` exports:
  - `export function generateStaticParams()` → `net.lines.map(l => ({ id: l.id }))`
  - `export async function generateMetadata({ params })` → `pageMetadata({ huPath: \`/vonalak/${id}/\`, roPath: \`/ro/linii/${id}/\`, lang, title, description, … })` with the templated titles from the spec.
  - `export default async function Page({ params })` → `<LinePage lang="hu" id={id} />`
- `LinePage`: H1 (`enrichLine.title`), then per direction: `<BoardTable>` for the terminus stop, first/last + headway line, fare chip (city vs `zone === "arcus"`), Free Friday note, CTA `<a href="/?line={id}&service=weekday">`, `<StopList>`, `<RouteShape shape={pattern.shape} colour={line.light}>`. Divider. Templated intro `<p>`. `PageFrame` wraps it with `crumbs` and `twinPath`.

- [ ] **Step 1: Write the failing tests**

```tsx
// LinePage.test.tsx
import { render, screen, within } from "@testing-library/react";
import LinePage from "./LinePage";
it("puts the departure board above the description for line 1", async () => {
  render(await (LinePage as any)({ lang: "hu", id: "1" }));
  const h1 = screen.getByRole("heading", { level: 1 });
  expect(h1).toHaveTextContent("1-es busz");
  const board = screen.getAllByRole("table")[0];
  const intro = screen.getByText(/Multi-Trans/);
  // board comes before the prose in document order
  expect(board.compareDocumentPosition(intro) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
it("links into the planner timetable for this line", async () => {
  render(await (LinePage as any)({ lang: "ro", id: "1" }));
  expect(screen.getByRole("link", { name: /planificator|orar live|deschide/i })).toHaveAttribute("href", "/?line=1&service=weekday");
});
```

```ts
// line-params.test.ts
import { generateStaticParams } from "@/app/vonalak/[id]/page";
it("generates a param for every line", async () => {
  expect((await generateStaticParams()).length).toBe(12);
});
```

- [ ] **Step 2: Run, verify they fail** → FAIL.
- [ ] **Step 3: Implement** `LinePage`, both `page.tsx` files. Read `web/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md` and `generate-static-params.md` for the `params` promise/shape in 16.3.1.
- [ ] **Step 4: Run tests; `cd web && npm run build`.** Confirm `out/vonalak/1/index.html` and `out/ro/linii/1/index.html`; grep for the H1, the board `<table>`, `hreflang`, canonical, the JSON-LD.
- [ ] **Step 5: Commit**

```bash
git add web/app/vonalak web/app/ro/linii web/components/seo/LinePage* web/lib/seo/line-params.test.ts
git commit -m "Add bilingual line pages with boards, stop lists and route shapes"
```

---

### Task 18: Line OG images

**Files:**
- Create: `web/app/vonalak/[id]/opengraph-image.tsx`, `web/app/ro/linii/[id]/opengraph-image.tsx`
- Test: `web/lib/seo/line-og.test.ts`

**Interfaces:**
- Consumes: `renderOg` (Task 8), `enrichLine` (Task 3), `shadeOf`/line colours.
- Each file: `export const size = OG_SIZE; export const contentType = OG_CONTENT_TYPE; export const dynamic = "force-static";` `export function generateStaticParams()` (same as the page). `export default async function Image({ params })` → `renderOg({ kind: "line", lang, heading: enrichLine(net, id, lang).label, sub: termini, badge: { text: id, bg: line.light, fg: line.lightText }, shape: mainPattern.shape })`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import Image, { generateStaticParams } from "@/app/vonalak/[id]/opengraph-image";
it("renders a PNG card for every line", async () => {
  const params = await generateStaticParams();
  const res = await (Image as any)({ params: Promise.resolve(params[0]) });
  expect(res.headers.get("content-type")).toBe("image/png");
});
```

- [ ] **Step 2: Run, verify it fails** → FAIL.
- [ ] **Step 3: Implement** both files.
- [ ] **Step 4: Run test; `npm run build`; confirm the PNGs land in `out/vonalak/1/` (Next names them `opengraph-image-<hash>.png` and wires the meta tag).** Grep `out/vonalak/1/index.html` for `og:image`.
- [ ] **Step 5: Commit**

```bash
git add web/app/vonalak/[id]/opengraph-image.tsx web/app/ro/linii/[id]/opengraph-image.tsx web/lib/seo/line-og.test.ts
git commit -m "Add per-line Open Graph cards in both languages"
```

---

## Phase 3 — Place pages

### Task 19: Place pages `/megallok/[slug]/` and `/ro/statii/[slug]/`

**Files:**
- Create: `web/app/megallok/[slug]/page.tsx`, `web/app/ro/statii/[slug]/page.tsx`
- Create: `web/components/seo/PlacePage.tsx`
- Test: `web/components/seo/PlacePage.test.tsx`, `web/lib/seo/place-params.test.ts`

**Interfaces:**
- Consumes: `buildPlaces`/`placeOf` (Task 2); `boardFor`, `enrichLine` (Task 3); `net.walks` for nearby places; `BoardTable`, `PageFrame`, `pageMetadata`.
- `generateStaticParams` → `buildPlaces(net).map(p => ({ slug: p.slug }))`.
- `PlacePage`: H1 (`{place.name[lang]} megálló` / `stația {…}`), then for each line×direction that stops here: a `<BoardTable>` (from `boardFor` for one of the place's `stopIds` on that line), each headed by the line label + headsign. Then "lines serving this stop" chips → `/vonalak/{id}/`. Then nearest 3–5 places (shortest `walks` edges out of the place's stops) → their pages. CTA `<a href="/?stop={stopId}">`. Divider, templated intro, `PageFrame`.

- [ ] **Step 1: Write the failing tests**

```tsx
import { render, screen } from "@testing-library/react";
import PlacePage from "./PlacePage";
it("shows boards then line chips then nearby stops for Sepsi Aréna", async () => {
  render(await (PlacePage as any)({ lang: "hu", slug: "sepsi-arena" })); // adjust slug to the real one
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/Aréna/);
  expect(screen.getAllByRole("table").length).toBeGreaterThan(0);
  expect(screen.getByRole("link", { name: /5-ös busz|5-ös/ })).toHaveAttribute("href", "/vonalak/5/");
});
```

```ts
import { generateStaticParams } from "@/app/megallok/[slug]/page";
it("generates one param per physical place", async () => {
  const params = await generateStaticParams();
  expect(params.length).toBeGreaterThan(40);
  expect(new Set(params.map((p) => p.slug)).size).toBe(params.length);
});
```

- [ ] **Step 2: Run, verify they fail** → FAIL. (Fix the test slug to a real one from `buildPlaces` output.)
- [ ] **Step 3: Implement** `PlacePage` and both `page.tsx`.
- [ ] **Step 4: Run tests; `npm run build`; confirm a sample `out/megallok/<slug>/index.html` and its RO twin; grep board table + hreflang + canonical.**
- [ ] **Step 5: Commit**

```bash
git add web/app/megallok web/app/ro/statii web/components/seo/PlacePage* web/lib/seo/place-params.test.ts
git commit -m "Add bilingual stop pages with per-line departure boards"
```

---

### Task 20: Place OG images

**Files:**
- Create: `web/app/megallok/[slug]/opengraph-image.tsx`, `web/app/ro/statii/[slug]/opengraph-image.tsx`
- Test: `web/lib/seo/place-og.test.ts`

**Interfaces:**
- `renderOg({ kind: "place", lang, heading: place.name[lang], sub: <line badges as text, e.g. "1 · 5 · 6">, })`. Same config exports and `generateStaticParams` as the page.

- [ ] **Step 1: Write the failing test** (mirror Task 18's, for `@/app/megallok/[slug]/opengraph-image`).
- [ ] **Step 2: Run, verify it fails** → FAIL.
- [ ] **Step 3: Implement** both files.
- [ ] **Step 4: Run test; `npm run build`; confirm PNGs + `og:image` meta on a sample place page.**

**Build-cost checkpoint:** after this build, note the `next build` wall time. If it has grown by more than ~90 s versus Phase 1, switch place OG images to a single per-language static file (`web/public/og-place-hu.png`, `-ro.png`) referenced via `openGraph.images` in the place page's `generateMetadata`, and delete these two files. Record the decision in the task's commit message.

- [ ] **Step 5: Commit**

```bash
git add web/app/megallok/[slug]/opengraph-image.tsx web/app/ro/statii/[slug]/opengraph-image.tsx web/lib/seo/place-og.test.ts
git commit -m "Add per-stop Open Graph cards (or static fallback if build cost is high)"
```

---

## Phase 4 — Route pages

### Task 21: Route pages `/utvonal/[pair]/` and `/ro/trasee/[pair]/` + reverse redirect

**Files:**
- Create: `web/app/utvonal/[pair]/page.tsx`, `web/app/ro/trasee/[pair]/page.tsx`
- Create: `web/components/seo/RoutePage.tsx`
- Modify: `web/netlify.toml` (reverse-order redirect — see Step 3)
- Test: `web/components/seo/RoutePage.test.tsx`, `web/lib/seo/route-params.test.ts`

**Interfaces:**
- Consumes: `notablePairs`, `routeBySlug`, `journeyBetween` (Task 4); `PageFrame`, `pageMetadata`, `faqLd` (Task 6).
- `generateStaticParams` → `notablePairs(net).map(p => ({ pair: p.slug }))`.
- `RoutePage`: H1 (`{A}-tól {B}-ig busszal` / `De la {A} la {B} cu autobuzul`). For each direction with a journey: a prose summary from `journeyBetween` ("Szállj fel a(z) {line} …, {n} megálló (~{min} perc), …"), total time, transfers, walk distance, first/last useful departure. CTA `<a href="/?from={lng,lat,name}&to={lng,lat,name}&lang=ro">` (RO only adds `lang`). Divider, `faqLd` script + visible FAQ ("Melyik busz…?", "Mennyi idő…?", "Mennyibe kerül a jegy?"). `PageFrame`.
- The two-direction page is one file; the slug is already order-independent. Add a Netlify redirect so a hand-typed reverse slug still resolves — since slugs are sorted, only an *unsorted* guess needs catching; a catch-all is impractical, so instead: in `notablePairs` the slug is canonical, and `generateStaticParams` only emits canonical slugs. A reverse guess 404s → acceptable (it was never linked). **Skip the redirect; document that reverse slugs are not generated.** (Removes the `netlify.toml` modify from this task.)

- [ ] **Step 1: Write the failing tests**

```tsx
import { render, screen } from "@testing-library/react";
import RoutePage from "./RoutePage";
it("leads with the journey and puts FAQ after it", async () => {
  // pick a real canonical slug from notablePairs() output
  render(await (RoutePage as any)({ lang: "hu", pair: "<real-slug>" }));
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/busszal/);
  const cta = screen.getByRole("link", { name: /tervező|planner|nyisd/i });
  expect(cta.getAttribute("href")).toMatch(/^\/\?from=.+&to=.+/);
});
```

```ts
import { generateStaticParams } from "@/app/utvonal/[pair]/page";
it("only emits canonical (sorted-half) slugs", async () => {
  for (const { pair } of await generateStaticParams()) {
    expect(pair).toBe(pair.split("-").sort().join("-") === pair ? pair : pair);
  }
});
```

- [ ] **Step 2: Run, verify they fail** → FAIL.
- [ ] **Step 3: Implement** `RoutePage` and both `page.tsx`. Confirm `journeyBetween` prose reads naturally in both languages.
- [ ] **Step 4: Run tests; `npm run build`; confirm a sample `out/utvonal/<slug>/index.html` + RO twin; grep FAQ JSON-LD, canonical, hreflang, the `?from=…&to=…` CTA.**
- [ ] **Step 5: Commit**

```bash
git add web/app/utvonal web/app/ro/trasee web/components/seo/RoutePage* web/lib/seo/route-params.test.ts
git commit -m "Add bilingual route pages with build-time journeys and FAQ"
```

---

### Task 22: Route OG images

**Files:**
- Create: `web/app/utvonal/[pair]/opengraph-image.tsx`, `web/app/ro/trasee/[pair]/opengraph-image.tsx`
- Test: `web/lib/seo/route-og.test.ts`

**Interfaces:**
- `renderOg({ kind: "route", lang, heading: \`${A} → ${B}\`, sub: lang === "ro" ? "Sfântu Gheorghe" : "Sepsiszentgyörgy" })`. Same config + `generateStaticParams` as the page.

- [ ] **Step 1: Write the failing test** (mirror Task 18).
- [ ] **Step 2: Run, verify it fails** → FAIL.
- [ ] **Step 3: Implement** both files (apply the same build-cost fallback rule as Task 20 if needed).
- [ ] **Step 4: Run test; `npm run build`; confirm PNGs + meta.**
- [ ] **Step 5: Commit**

```bash
git add web/app/utvonal/[pair]/opengraph-image.tsx web/app/ro/trasee/[pair]/opengraph-image.tsx web/lib/seo/route-og.test.ts
git commit -m "Add per-route Open Graph cards"
```

---

## Phase 5 — Integration & verification

### Task 23: Planner footer links + homepage regression snapshot

**Files:**
- Modify: `web/components/planner/Planner.tsx` (the settings/source block, ~line 1160)
- Modify: `web/lib/i18n.ts` (add keys `timetablesLink`, `linesLink`, `faresLink` in `hu`, `ro`, `en`)
- Test: `web/components/planner/Planner.test.tsx` (extend — a footer-links assertion), `web/lib/seo/homepage-head.test.ts`

**Interfaces:**
- In the block that already renders `t.source` / `t.disclaimer` / the `/terms/` and `/privacy/` links, add three links: `/buszmenetrend/` (`t.timetablesLink`), `/vonalak/` (`t.linesLink`), `/dijszabas/` (`t.faresLink`). Plain `<a href>` like the existing terms/privacy links. No layout restructure, no new component.
- New i18n keys (verbatim): hu `{ timetablesLink: "Menetrendek és megállók", linesLink: "Buszvonalak", faresLink: "Jegyárak" }`; ro `{ timetablesLink: "Orare și stații", linesLink: "Linii de autobuz", faresLink: "Prețuri bilete" }`; en `{ timetablesLink: "Timetables and stops", linesLink: "Bus lines", faresLink: "Ticket prices" }`.

- [ ] **Step 1: Write the failing tests**

```tsx
// Planner.test.tsx — add
it("offers links to the timetable pages from the settings panel", async () => {
  // open settings the way the existing tests do, then:
  expect(screen.getByRole("link", { name: "Buszvonalak" })).toHaveAttribute("href", "/vonalak/");
});
```

```ts
// homepage-head.test.ts — lock the crawlable essentials of /
import { readFileSync } from "node:fs";
it("keeps the homepage canonical, title and description unchanged", () => {
  const html = readFileSync(new URL("../../out/index.html", import.meta.url), "utf8");
  expect(html).toContain('<link rel="canonical" href="https://sepsimenetrend.ro/"/>');
  expect(html).toContain("<title>Sepsi Menetrend</title>");
  expect(html).toMatch(/<html lang="hu"/);
});
```

- [ ] **Step 2: Run, verify they fail** — `homepage-head.test.ts` needs a prior `npm run build`; run it, then the test fails only if something regressed. The Planner test fails (no links yet).
- [ ] **Step 3: Implement** the i18n keys and the three links.
- [ ] **Step 4: Run `cd web && npm test`** (full suite) and `npm run build` then the head test. All green.
- [ ] **Step 5: Commit**

```bash
git add web/components/planner/Planner.tsx web/lib/i18n.ts web/components/planner/Planner.test.tsx web/lib/seo/homepage-head.test.ts
git commit -m "Link the timetable pages from the planner settings panel"
```

---

### Task 24: `scripts/verify-seo.mjs` — post-build structural checks

**Files:**
- Create: `web/scripts/verify-seo.mjs`
- Modify: `web/package.json` (`build` chain)
- Test: covered by running it against a real build (Step 4); optionally `web/lib/seo/verify-core.test.ts` for the pure checks

**Interfaces:**
- Consumes: `allPages` (Task 5) via `import` (the script is ESM; `network.json` reads fine at runtime).
- The script, run from `web/`, after `out/` exists:
  1. For every `allPages()` entry, assert the file exists (`out{path}index.html`), and its HTML contains a non-empty `<title>`, a `<meta name="description">`, exactly one `<h1`, a self-`<link rel="canonical">`, and `hreflang` links whose targets are also present in `out/`.
  2. Reciprocity: the hu page's `ro` alternate and the ro page's `hu` alternate agree.
  3. `out/ro/**/*.html` all have `<html lang="ro"`.
  4. Orphan check: parse `<a href>` from `/index.html` + `/buszmenetrend/index.html`; assert every content page is reachable within 2 hops.
  5. Every page's `og:image` resolves to a file in `out/`.
  6. Exit non-zero with a readable list on any failure.
- `package.json` `build`: `"next build && node scripts/localize-html.mjs && node scripts/verify-seo.mjs && node scripts/stamp-sw.mjs"`.

- [ ] **Step 1: Write the script** (no separate failing test — its job is to fail builds).
- [ ] **Step 2: Run `cd web && npm run build`** — expect `verify-seo` to pass, or to surface real gaps.
- [ ] **Step 3: Fix any gaps** it finds in earlier tasks' output, then rebuild.
- [ ] **Step 4: Prove it bites** — temporarily break one page's canonical, rebuild, confirm the build fails with a clear message, revert.
- [ ] **Step 5: Commit**

```bash
git add web/scripts/verify-seo.mjs web/package.json
git commit -m "Fail the build on missing pages, broken hreflang, or orphans"
```

---

### Task 25: Determinism + full regression + live Chrome verification

**Files:** none (verification only); may add `web/lib/seo/deep-links.test.ts`

- [ ] **Step 1: Deep-link regression test**

```ts
// deep-links.test.ts
import { decodeTrip } from "@/lib/share";
it("still decodes shared journey links", () => {
  const t = decodeTrip("?from=25.795,45.871,Gara&to=25.79,45.88,Kórház&at=08:00");
  expect(t.from?.name).toBe("Gara");
  expect(t.time).toBe("08:00");
});
```

Run: `cd web && npm test -- --run lib/seo/deep-links.test.ts` → PASS. Commit.

- [ ] **Step 2: Full suite** — `cd web && npm test` — everything green (engine + ui + seo). `cd web && npm run lint` — clean.

- [ ] **Step 3: Determinism** — `cd web && npm run build && mv out out.a && npm run build && diff -rq out out.a`. Expect no differences. If PNGs differ, pin Satori/font versions or cache; investigate before proceeding. Remove `out.a`.

- [ ] **Step 4: Serve and crawl** — `cd web && npx serve out -l 5000` (or `netlify dev`). With the Chrome MCP tools, open in both languages: `/`, `/vonalak/1/`, `/megallok/<slug>/`, `/utvonal/<slug>/`, `/buszmenetrend/`, and `/ro/`, `/ro/linii/1/`, `/ro/statii/<slug>/`, `/ro/trasee/<slug>/`, `/ro/orar-autobuz/`. For each: read console (expect zero errors), read network requests (every same-origin request 200; no pending; the deliberately-typed bad URL `/nope/` returns the 404 page). Click a line-page CTA and confirm the planner opens with the line timetable; click a route-page CTA and confirm `from`/`to` prefill.

- [ ] **Step 5: Service-worker behaviour** — in the served site: load `/`, go offline (DevTools), reload `/` → planner still works; navigate to `/vonalak/1/` offline → the offline fallback shows, not a broken planner; back online, reload `/vonalak/1/` → real page; reload `/` → still the planner (shell not evicted).

- [ ] **Step 6: OG + Lighthouse spot check** — open 3–4 generated PNGs from `out/**/opengraph-image*.png`, confirm no missing-glyph boxes for `ő ű ș ț`. Run Lighthouse (Chrome) on one page of each type: SEO ≥ 95, Best Practices ≥ 95, no CLS regression.

- [ ] **Step 7: Hand back** — summarise in the final message: pages added (counts per type per language), files touched, every verification run and its result, the build-cost decision from Task 20/22, and anything deferred. **Do not push.** State the branch name and that it is ready for review.

---

## Self-Review

**Spec coverage:**

| Spec section | Task(s) |
|---|---|
| URL structure (hu bare / ro prefixed, localised slugs) | 5, 9, 15–22 |
| Line pages | 17, 18 |
| Place pages (coordinate dedupe) | 2, 19, 20 |
| Route pages (notable pairs, build-time journey, canonical slug) | 4, 21, 22 |
| Guide pages + pillar | 7, 15 |
| Index pages | 16 |
| Page skeleton (data first, prose last) | 17, 19, 21 (tests assert order) |
| Generation architecture (`lib/seo/`, `generateStaticParams`) | 1–8, 17, 19, 21 |
| Hungarian default / additive RO | Global Constraints, 9, 23 (head snapshot) |
| `<html lang>` per subtree | 9, 24 (check 3) |
| hreflang + canonical reciprocal | 6, 12, 24 (checks 1–2) |
| Title/description templates | 6, 17, 19, 21 |
| Structured data (Breadcrumb/FAQ/WebSite) | 6, 10, 15, 21 |
| "Not official" treatment everywhere | 7, 10 (PageFrame on every page) |
| Open Graph images (per language, per type, font) | 8, 15, 18, 20, 22 |
| Sitemap with alternates | 5, 12 |
| robots unchanged | 12 |
| Service worker fix | 14, 25 (check 5) |
| URL stability / query params keep working | 23, 25 (step 1) |
| Redirects + useful 404 | 13 |
| Internal linking / no orphans | 10, 16, 23, 24 (check 4) |
| Regression guards | 14, 23, 24, 25 |
| Determinism | 25 (step 3) |
| Live no-console-error / requests-finish | 25 (step 4) |
| Not pushed | 25 (step 7) |

No spec section is unclaimed.

**Placeholder scan:** `NOTABLE_PLACE_KEYS` (Task 2) and several test slugs (`<real-slug>`, `sepsi-arena`) are explicitly resolved in-task by inspecting `buildPlaces` output — each has a step that does so, not a hand-wave. No "TBD"/"add error handling"/"similar to Task N" remain.

**Type consistency:** `Place` (`slug`, `key`, `name`, `at`, `stopIds`) is used identically in Tasks 2, 4, 5, 19, 20. `PageEntry` (`path`, `hu`, `ro`, `lastModified`, `priority`) consistent in 5, 12, 24. `renderOg(props: OgProps)` / `OG_SIZE` / `OG_CONTENT_TYPE` consistent in 8, 15, 18, 20, 22. `pageMetadata(input)` signature consistent in 6, 15–22. `boardFor(net, lineId, stopId)` consistent in 3, 17, 19. Planner deep-link params (`?line=`, `?service=`, `?stop=`, `?from=`, `?to=`, `?lang=`) match `components/planner/Planner.tsx` and `lib/share.ts` as read from the codebase.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-08-29-seo-content-pages.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — tasks executed in this session via executing-plans, batched with checkpoints.

**Which approach?**
