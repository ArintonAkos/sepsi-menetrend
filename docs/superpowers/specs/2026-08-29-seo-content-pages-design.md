# Bilingual SEO content pages design

## Goal

Grow organic search arrivals for the Sfântu Gheorghe / Sepsiszentgyörgy city
bus network by publishing a set of crawlable, server-rendered pages in
Romanian **and** Hungarian, built from the same `network.json` the planner
uses. Today the site is one indexable page (`/`), Hungarian only, whose
rendered HTML carries no timetable text at all. The planner itself is not
touched.

Target queries, both languages: *orar autobuz Sfântu Gheorghe* /
*Sepsiszentgyörgy buszmenetrend*, *linia N* / *N-es busz*, *Multi-Trans orar*
(descriptive, unofficial), individual stop and station names, and
"how do I get from A to B by bus".

## Current state

- Next.js 16.3.1 (vendored fork — see `web/AGENTS.md`; read
  `node_modules/next/dist/docs/01-app/` before writing route code),
  `output: "export"`, `trailingSlash: true`, deployed as a static folder on
  Netlify at `sepsimenetrend.ro`.
- Routes that exist: `/`, `/terms/`, `/privacy/`, plus `manifest.webmanifest`,
  `robots.txt`, `sitemap.xml`. `sitemap.ts` lists three URLs by design.
- Language is a client-side toggle (`lib/lang.ts`, localStorage `sepsi.lang`,
  `?lang=`); crawlers only ever see `hu`. No `hreflang`, no per-language
  canonical.
- `network.json`: 12 lines, 100 stops / 100 stations, 37 patterns, 728 trips,
  284 official departure boards (95/100 stops), all names `{ro, hu}`.
- The planner reads the whole plan from the query string
  (`lib/share.ts`: `from`, `to`, `at`, `mode`, `journey`; `Planner.tsx`:
  `line`, `service`, `dir`, `stop`, `lang`). This is the hand-off target for
  every content page and does not change.
- Prior hosts (`sepsi-menetrend.netlify.app`, `sepsibusz.netlify.app`) 301 to
  the primary domain via Netlify. Path structure has never differed.

## URL structure

Hungarian keeps the bare paths (brand language, `.ro` domain, root stays put).
Romanian lives under `/ro/`. Slugs are localised per language.

| Purpose | Hungarian | Romanian |
|---|---|---|
| Planner | `/` *(unchanged)* | `/ro/` |
| All lines | `/vonalak/` | `/ro/linii/` |
| One line | `/vonalak/{id}/` | `/ro/linii/{id}/` |
| All stops | `/megallok/` | `/ro/statii/` |
| One place | `/megallok/{slug}/` | `/ro/statii/{slug}/` |
| Route A→B | `/utvonal/{a}-{b}/` | `/ro/trasee/{a}-{b}/` |
| Fares & tickets | `/dijszabas/` | `/ro/tarife/` |
| Multi-Trans (unofficial) | `/multi-trans/` | `/ro/multi-trans/` |
| SepsiBike | `/sepsibike/` | `/ro/sepsibike/` |
| Pillar / overview | `/buszmenetrend/` | `/ro/orar-autobuz/` |
| FAQ | `/gyik/` | `/ro/intrebari-frecvente/` |
| Terms | `/terms/` *(unchanged)* | `/ro/termeni/` |
| Privacy | `/privacy/` *(unchanged)* | `/ro/confidentialitate/` |

`{id}` is the line id from the feed (`1`, `1D`, `2`, …). `{slug}` is a
diacritic-folded, collision-suffixed slug of the place's display name in that
language. Route `{a}-{b}` are two place slugs; only "notable" pairs are
generated (see Page types).

Approximate volume: ~12 line + ~60 place + ~100 route + ~7 guide/index
≈ **185 per language, ~370 total** — one sitemap file, well under the 50k
limit.

## Page types

All content is generated from `network.json` at build time via
`generateStaticParams`. Every page must carry real, page-specific information;
no page is a template with only the name swapped.

### Line page — `/vonalak/{id}/`, ~12 × 2

- H1, then the **official departure board** from each terminus, weekday and
  weekend columns, straight from `officialBoards`.
- First / last departure; headway when regular.
- Ordered stop list for **both** directions, each stop linked to its place
  page.
- Fare for the line (city 2.5 RON; line 10 crosses into Arcuș at 4 RON),
  Free Friday note.
- Static route-shape SVG from `pattern.shape` — inline, no JS, no map tiles.
- CTA → `/?line={id}&service=weekday`.
- `BreadcrumbList` JSON-LD.

### Place page — `/megallok/{slug}/`, ~60 × 2

- One page per **physical place**. Opposite-kerb stops that share a name and
  sit within a short walk are merged into one place (dedupe by coordinate
  proximity / `walks.json` adjacency, never by name alone — see
  `memory/multitrans-stop-identity-model.md`). Both directions shown.
- Which lines call here; the departure board per line and direction, weekday
  and weekend.
- Nearest other places, from `walks.json`.
- CTA → `/?stop={stopId}`.
- `BreadcrumbList` JSON-LD.

### Route page — `/utvonal/{a}-{b}/`, ~100 × 2

- Generated only between **notable places** (train station, the bus
  terminals, Spitalul Județean / Megyei Kórház, Arena Sepsi, Lábasház /
  centre, Autoliv / industrial park, the malls, the large high schools,
  Șugaș Băi, Arcuș) where a real journey exists. The notable list lives in
  `lib/seo/` as data, ~15 entries → ~100 unordered pairs.
- A representative journey computed at build time with `lib/engine/plan.ts`
  (pure TS, DOM-free, Node-importable) for a typical weekday departure:
  line(s) taken, where to change, ride time, walk distance, first / last
  useful departure. Both directions on the one page.
- One page per unordered pair, slug ordered deterministically (e.g. the two
  place slugs sorted). `{b}-{a}` 301s to the canonical `{a}-{b}`.
- CTA → `/?from={lng,lat,name}&to={lng,lat,name}` (+ `&lang=ro` on RO pages).
- `FAQPage` JSON-LD: "which bus", "how long", "ticket price".

### Guide pages — hand-written bilingual prose, ~7 × 2

Content lives in a typed content module, not `network.json`.

- **Pillar** `/buszmenetrend/` ↔ `/ro/orar-autobuz/`: whole-network overview,
  all 12 lines, links to every line / the stop index / fares / bike / FAQ /
  Multi-Trans. Primary ranking target.
- `/dijszabas/` ↔ `/ro/tarife/`: tickets, the 24pay app, the city vs Arcuș
  zone boundary, Free Friday, where to buy.
- `/multi-trans/` ↔ `/ro/multi-trans/`: what Multi-Trans SA is, the line list,
  operator contact, link to multitrans.ro, and a plain statement that this
  site rebuilds their **published** timetable and is not affiliated.
- `/sepsibike/` ↔ `/ro/sepsibike/`: bike-share guide.
- `/gyik/` ↔ `/ro/intrebari-frecvente/`: FAQ, `FAQPage` JSON-LD.

### Index pages — `/vonalak/`, `/megallok/` × 2

Plain linked lists; the internal-linking backbone.

## Page skeleton — data first, prose last

Line and place pages, top to bottom:

1. Breadcrumb
2. H1
3. **Departure-board table(s)** — weekday / weekend, both directions
4. First / last departure, fare chip, Free Friday note
5. Primary CTA into the live planner
6. Stop list (line) / lines-served + nearest places (place) — all linked
7. Static route SVG (line pages)
8. — divider —
9. Short intro paragraph, 2–3 sentences, templated from feed data
10. FAQ, where useful
11. Disclaimer line + data-source note + link to multitrans.ro
12. Footer (disclaimer, language switch, links)

Route and guide pages follow the same rule: the journey, or the fare table,
before any context prose. Templated prose stays short enough to read as a
helpful note rather than filler.

## Generation architecture

- New segments under `web/app/`: `vonalak/[id]/`, `megallok/[slug]/`,
  `utvonal/[pair]/`, the guide routes, and a parallel tree under
  `web/app/ro/`. Each `page.tsx` exports `generateStaticParams` and
  `generateMetadata`.
- `web/lib/seo/` — shared, framework-free, unit-tested:
  - `slug.ts` — diacritic folding (`á→a ő→o ș→s ț→t …`), collision suffixing,
    deterministic ordering.
  - `places.ts` — station de-duplication into "places"; the notable-place
    list; place lookup by slug.
  - `lines.ts` — line-name enrichment (`{id}` + terminus →
    "1-es busz Cap Linie Simeria – Gara CFR" / "linia 1 …"); board selection
    per terminus; headway detection.
  - `routes.ts` — notable-pair enumeration; build-time journey via
    `lib/engine/plan.ts`; prose assembly.
  - `metadata.ts` — title / description templates, canonical, `hreflang`
    alternates, OG.
  - `jsonld.ts` — `BreadcrumbList`, `FAQPage`, homepage `WebSite`.
  - `content.{hu,ro}.ts` — guide-page prose.
- Rendering reuses existing components and CSS modules where they fit
  (`components/stops/StopBoard`, `components/timetable/Timetable` display
  helpers, `components/common/icons`). New presentational components are
  server components with no client JS unless a specific interaction needs it.
- The line SVG is computed from `pattern.shape` bounds into a `viewBox`; no
  Mapbox, no token, no network.

## i18n, metadata, structured data

- `<html lang>` is set correctly per subtree — `ro` under `/ro/`, `hu`
  elsewhere. The root layout owns the single `<html>` and hard-codes `hu`;
  in the app router a nested layout cannot re-declare it. Mechanism decided in
  implementation against the Next 16 docs — likely per-route-group root
  layouts (`app/(hu)/`, `app/(ro)/`) or, as the pragmatic fallback matching
  the existing `stamp-sw.mjs` step, a post-build rewrite of
  `<html lang="hu">` → `"ro"` across `out/ro/**`. The inline bootstrap script
  in the root layout that reads `sepsi.lang` must not fight the static value
  on content pages.
- Every page: self-canonical; `hreflang` `hu` / `ro` / `x-default` (→ hu),
  reciprocal on both sides; per-page OG/Twitter title + the existing `og.png`.
- Title / description templates (keyword-forward, readable, HU ≠ RO wording):

  | | Hungarian | Romanian |
  |---|---|---|
  | Line | `{n}-es busz menetrendje – Sepsiszentgyörgy` | `Linia {n} – orar autobuz Sfântu Gheorghe` |
  | Place | `{név} megálló – buszindulások` | `Stația {nume} – plecări autobuz` |
  | Route | `{A}-tól {B}-ig busszal – Sepsiszentgyörgy` | `De la {A} la {B} cu autobuzul – Sfântu Gheorghe` |
  | Pillar | `Sepsiszentgyörgyi buszmenetrend – Multi-Trans (nem hivatalos)` | `Orar autobuz Sfântu Gheorghe – Multi-Trans (neoficial)` |

- Structured data: `BreadcrumbList` on every content page; `FAQPage` on route
  pages and the FAQ; `WebSite` once on the homepage. Deliberately **no**
  `Organization` markup and no invented transit schema.

## The "not official" treatment

On every generated page:

- A visible disclaimer line in a shared header/footer component:
  *"Nem a Multi-Trans SA hivatalos oldala"* / *"Nu este site-ul oficial
  Multi-Trans SA"*, with a link to multitrans.ro.
- `author` / `publisher` = "Sepsi Menetrend" in metadata and JSON-LD.
- "Multi-Trans" used descriptively in titles and copy (nominative fair use);
  never a logo or operator branding.
- Data-source sentence on every data page: the timetable comes from the
  schedule published at multitrans.ro; asterisked times are interpolated from
  neighbouring stops.

## Sitemap and robots

- `sitemap.ts` enumerates all generated URLs from the same `network.json` +
  guide list. Each entry carries `alternates.languages` (`hu`, `ro`) so the
  sitemap itself expresses `hreflang`. `lastModified` from `network.json`
  `generated`. One file.
- `robots.ts` unchanged in behaviour: allow all, point at the sitemap. There
  is nothing to disallow — no faceted or search URLs are generated.

## Service worker

`public/sw.js` currently, on **any** navigation, revalidates online and then
`cache.put("/", copy)` — it writes every navigated response to the `/` key,
and offline it serves `caches.match("/")` for any path. With content pages
added this would (a) overwrite the cached planner shell with a content page
and (b) serve the planner shell offline for a content URL.

Required change: the navigate handler treats **only `/`** as the cached shell.
For any other path it fetches normally and, offline, falls back to a small
generic offline page (or the requested page's own cache entry), never to `/`.
Content pages are cached under their own URL by the existing generic handler,
or left network-only. `SHELL` in `sw.js` is unchanged. `stamp-sw.mjs`
fingerprints all of `out/`, so the version changes each build as expected.

## URL stability and redirects

- Every currently-live path stays exactly where it is. `/` is never moved or
  redirected — this protects the PWA `start_url`, the service-worker scope,
  and every shared `?from=…` / `?line=…` / `?stop=…` link. Query strings do
  not participate in static routing; `/?…` always resolves to `index.html`.
- `/terms/` and `/privacy/` remain the canonical Hungarian URLs; Romanian
  twins are added, not swapped in.
- `netlify.toml` gains a `[[redirects]]` table (301) for slugs renamed now or
  later, plus obvious guesses: `/hu/*` → `/*`, `/lines/` → `/vonalak/`,
  `/stops/` → `/megallok/`.
- The 404 page is made useful: links to the pillar page and the planner in
  both languages.

## Internal linking

No orphan pages; everything reachable from `/` within two clicks.

- The planner gains a small footer → pillar page, line list, fares.
- Pillar page → all 12 lines, the stop index, fares, bike, FAQ, Multi-Trans.
- Line ↔ its stops; place ↔ its lines; route ↔ both endpoints + lines used.
- Visible breadcrumbs (+ `BreadcrumbList`) on every content page.
- A visible language switch on every page linking to the real twin URL, not
  only `hreflang`.

## Constraints

- The planner (`app/page.tsx`, `components/planner/**`, `lib/share.ts`,
  `lib/engine/**` behaviour) is not modified. `lib/engine/plan.ts` may be
  imported at build time but not changed.
- Data freshness: pages build from `network.json` only. No new data source,
  no second pipeline, no runtime fetch. As fresh as the planner, always.
- Static export only — no server, no middleware, no Netlify functions for
  this work.
- Offline behaviour is preserved: the planner shell and its data still cache
  and work offline exactly as now.
- No new third-party request on any content page (no map tiles, no fonts
  beyond what the site already ships).
- Build stays deterministic: same `network.json` → byte-identical `out/`.
- Diacritics render correctly in both languages, in HTML text and in slugs
  (slugs are ASCII-folded).

## Tests and verification

Build / static:

- `npm run build` succeeds; run twice, `out/` diff is empty.
- Every expected URL is present in `out/`, each with a non-empty `<title>`,
  meta description, `<h1>`, a self-canonical, and an `hreflang` pair that
  resolves to real files (reciprocity script).
- No orphan pages: link-crawl `out/` from `/`.
- JSON-LD parses and validates.
- `npm test` green, including new `lib/seo/` unit tests: slugging, diacritic
  folding, station de-dup, line-name enrichment, notable-pair selection,
  build-time journey for a known pair.
- `npm run lint` clean.

Live in Chrome, both languages — `/`, a line / place / route / guide page and
their `/ro/` twins:

- Console: zero errors, no new warnings.
- Network: every request completes — no pending, no 4xx/5xx (except a
  deliberately probed 404); CSS / fonts / data all 200.
- Deep-link CTAs land in the planner with fields pre-filled.
- Language switch navigates to the correct twin; `<html lang>` correct.
- Service worker: install succeeds; navigating content pages does not evict
  the `/` shell; planner still loads offline; a content page offline degrades
  to the offline fallback, not a broken state.
- Lighthouse SEO + best-practices pass on one page of each type; LCP / CLS
  sane (static HTML — should be trivial).
- 404 page renders with working links.

The branch is **not pushed**. Work is handed back with a written summary of
what was verified.

## Rollout / phasing

1. `lib/seo/` module + tests; sitemap/robots/redirects/SW changes; the `/ro/`
   layout and language wiring; guide pages + pillar + indexes.
2. Line pages (both languages).
3. Place pages (both languages).
4. Route pages (both languages).
5. Planner footer links; full verification pass; hand back.

Each phase is independently shippable and independently verifiable.

## Out of scope

- Any change to the planner UI or engine behaviour.
- Interactive maps on content pages.
- A full origin→destination route matrix (thin-content risk; notable pairs
  only).
- Automated timetable refresh / CI data pipeline.
- Submitting to Search Console, backlink work, non-technical SEO.
