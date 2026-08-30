# English content tree, app-consistent page chrome, and Hungarian legal slugs

**Status:** approved (brainstorming, 2026-08-30)
**Extends:** `docs/superpowers/specs/2026-08-29-seo-content-pages-design.md` (the
"SEO content pages" project, shipped on branch `seo-content-pages`). Read that
first — this document only describes the delta.

## Goal

Three changes, one branch, shipped in order so each is independently testable:

1. **Phase A — page chrome.** Restyle the shared `PageFrame` so every generated
   SEO page wears the same app chrome as `/terms/` and `/privacy/` (branded
   header, card container, badge, rounded headings). Still 100 % server-rendered,
   zero client JS.
2. **Phase B — Hungarian legal slugs.** `/terms/` → `/felhasznalasi-feltetelek/`,
   `/privacy/` → `/adatvedelem/`, with 301 redirects. Romanian twins unchanged.
3. **Phase C — English tree.** A full `/en/` mirror of the content set —
   ~180 pages, their OG cards, English copy — plus a three-way language switch
   and three-way `hreflang`.

## Background: what exists today

- Static export (`output: "export"`, `trailingSlash: true`), deployed on Netlify
  at `sepsimenetrend.ro`. Hungarian is canonical and lives at the bare root;
  Romanian is additive under `/ro/`. `app/layout.tsx` is the single root layout
  and hard-codes `<html lang="hu">`; every page builds as Hungarian and
  `scripts/localize-html.mjs` rewrites `<html lang>` + `og:locale` on `out/ro/**`
  afterwards.
- All ~358 generated pages render through one server component,
  `components/seo/PageFrame.tsx` (+ `PageFrame.module.css`): a small breadcrumb,
  a pill link to the language twin, the body, a thin footer. Deliberately bare.
- `/terms/` and `/privacy/` render through `components/legal/LegalPage.tsx` (+
  `LegalPage.module.css`) — a `"use client"` component with the full app chrome:
  circular back button, "Sepsi Menetrend" wordmark, a segmented HU/RO language
  toggle, a white card, a coloured badge, rounded-font headings. Romanian twins
  `/ro/termeni/` and `/ro/confidentialitate/` already exist (localised slugs).
- The planner UI (`lib/i18n.ts`) is fully translated to **hu / ro / en** — the
  `en` string set is complete. The legal pages and every SEO page offer **hu / ro
  only**. There are no `/en/` URLs anywhere. `lib/lang.ts` already accepts
  `"en"` from storage and `?lang=`.
- `lib/seo/` modules (`SeoLang = "hu" | "ro"`), the URL inventory
  (`lib/seo/urls.ts` → `allPages()`), the sitemap (`app/sitemap.ts`), the
  `<head>` builder (`lib/seo/metadata.ts` → `pageMetadata`), the OG renderer
  (`lib/seo/og.tsx`), the guide prose (`lib/seo/content.{ts,hu.ts,ro.ts}`), and
  the build gate (`scripts/verify-seo.mjs`) are all two-language by construction.
- The feed (`network.json`) carries stop / headsign names as `{ ro, hu }` only —
  **no `en`**.
- Build chain: `next build && node scripts/localize-html.mjs && node
  scripts/og-ext.mjs && node scripts/verify-seo.mjs && node scripts/stamp-sw.mjs`.
  `generateBuildId` is pinned to the feed date, so `out/` is byte-deterministic
  for a given feed.

## Global Constraints

Copied and carried forward from the original spec; every task's requirements
implicitly include this section.

- **Next.js 16.3.1, vendored fork.** Read `node_modules/next/dist/docs/01-app/`
  (resolved from `web/`) before writing or changing any route code. Heed
  deprecation notices. `web/AGENTS.md` re-adds its own banner on `next dev`;
  commit it with the work.
- **Static export only.** No server, no middleware, no Netlify functions for
  this work. Every page is `generateStaticParams` + `generateMetadata` +
  server-component render.
- **The planner is frozen.** `components/planner/**` behaviour, `lib/share.ts`,
  `lib/engine/**` behaviour are not changed. `lib/engine/plan.ts` may be
  imported at build time but not modified. `app/page.tsx` gains only what this
  spec calls out: `HomePage` already takes a `lang` param — `"en"` flows through
  it unchanged — plus the metadata `languages` map grows the `en` key. The
  Planner's `/terms/` `/privacy/` settings links are updated for Phase B only.
- **Data freshness.** Pages build from `network.json` only. No new data source,
  no runtime fetch. English place names fall back to the Hungarian name (the
  feed has no `en`).
- **Determinism.** Same `network.json` → byte-identical `out/`, generated OG
  PNGs included. No `Date.now()`, no unordered iteration in generated output.
- **Hungarian stays the default and the `hreflang` `x-default`.** Romanian and
  English are additive only. `/` is never moved or redirected.
- **Old URLs keep working.** Every currently-live path either still resolves or
  301-redirects. Query-string deep links to the planner (`/?from=…`,
  `/?line=1&service=weekday`, `/?stop=P22`, `/?lang=ro`) are untouched.
- **No new third-party request** on any content page — no map tiles, no web
  fonts beyond the one bundled OG font (embedded at build, not fetched).
- **Zero client JS on the SEO pages.** `PageFrame` and everything it renders
  stays a server component. The language switch is `<a>` elements, not a toggle.
- **Diacritics render** correctly in HTML text and OG images; slugs are
  diacritic-folded ASCII.
- **The full existing test suite stays green** (`npm test`, baseline 578). The
  build gate `scripts/verify-seo.mjs` runs on every build and must pass.
- **Do not push.** The branch is verified locally (`npm test`, `npm run build`,
  `npm run preview:netlify`) and handed over; the human pushes.
- English copy is authored by the implementer and shipped; a native-speaker
  review pass is logged as a follow-up (same decision as Romanian).

---

## Phase A — page chrome

### A.1 What changes

`components/seo/PageFrame.tsx` and `PageFrame.module.css` only. Because every
line / place / route / guide / index page renders through this one component,
the restyle reaches all of them at once. No page-body component changes, no URL
changes, no copy changes.

### A.2 Target structure

```
<div class="page">                      ← paper bg, min-height, centred (cf. LegalPage .page)
  <div class="container">               ← max-width 780
    <header class="header">
      <a class="backButton" href={home}> ← Back icon (components/common/icons → Back), aria-label per lang
      <div class="brand">
        <span class="brandName">Sepsi Menetrend</span>
        <span class="brandSub">{page-type label, per lang}</span>
      </div>
      <div class="seg" role="group" aria-label={switcher label}>
        <a href={huTwin}  aria-current={lang==="hu" ? "true" : undefined}>Magyar</a>
        <a href={roTwin}  aria-current …>Română</a>
        <a href={enTwin}  aria-current …>English</a>
      </div>
    </header>

    <nav class="crumbs" aria-label={crumbLabel}>  ← breadcrumb, unchanged markup, kept above the card
      <ol> … </ol>
    </nav>

    <main class="card">
      <div class="badge">{PAGE-TYPE BADGE TEXT}</div>
      {children}                          ← the page's own <h1> + body, exactly as now
      <nav class="footerNav">
        <p class="disclaimer">{disclaimer, per lang}</p>
        <div class="footerLinks">
          <a href={planner}>{planner label}</a>
          <a href={pillar}>{pillar label}</a>
          <a class="operator" href="https://multitrans.ro/index.html" target="_blank" rel="noopener noreferrer">{operator label}</a>
        </div>
      </nav>
    </main>

    <script type="application/ld+json"> … BreadcrumbList … </script>
  </div>
</div>
```

- **Phase A** keeps `PageFrame`'s current props (`twinPath` + `lang` + `crumbs`)
  and ships a **two-segment** switch (Magyar / Română), styled as the segmented
  control. `home` is `crumbs[0].path`; the current-language segment is
  `aria-current` and non-navigating. Render the segments by `.map` over an array
  so Phase C adds the third entry in one line.
- **Phase C** replaces `twinPath` with the `{ hu, ro, en }` path triple that
  callers already compute for `pageMetadata`, and adds the third `<a>`.
- **Page-type label / badge** per page type, per language. `PageFrame` cannot
  know the page type from its current props — add a `kind` prop
  (`"line" | "place" | "route" | "guide" | "index"`) and a lookup table:

  | kind | hu badge | ro badge | en badge |
  |---|---|---|---|
  | line | VONAL | LINIE | LINE |
  | place | MEGÁLLÓ | STAȚIE | STOP |
  | route | ÚTVONAL | TRASEU | ROUTE |
  | guide | ÚTMUTATÓ | GHID | GUIDE |
  | index | JEGYZÉK | LISTĂ | INDEX |

  `brandSub` uses the same table (title-cased: "Vonal", "Megálló", …).
- The badge uses one neutral style for every kind (`var(--signal)` bg /
  `var(--signal-ink)` fg, as `LegalPage .badge`). Do **not** vary it by line
  colour — keep it deterministic and simple.

### A.3 CSS

Port the relevant rules from `LegalPage.module.css` into `PageFrame.module.css`
(`.page`, `.container`, `.header`, `.backButton`, `.brand`, `.brandName`,
`.brandSub`, `.seg`, `.seg a` / `[aria-current]`, `.card`, `.badge`, `.footerNav`,
`.footerLinks`, `.operator`, the `@media (max-width: 600px)` block). Reuse the
existing `app/globals.css` design tokens — **no new colour values**. The
breadcrumb keeps its current styling. The two components stay separate (one is a
client component); this is visual parity, not code unification.

### A.4 Guards

- `scripts/verify-seo.mjs` asserts exactly one `<h1>` per page, a self-canonical,
  a non-empty `<title>` / description, and an `og:image` that resolves. The `<h1>`
  stays inside `{children}`; the wordmark is a `<span>`, the badge a `<div>` —
  the count stays 1. Run the full build gate.
- `components/seo/PageFrame.test.tsx` is rewritten: header (wordmark + back link
  + language segments) present, card wraps the children, badge text matches
  `kind` + `lang`, breadcrumb still emitted, `BreadcrumbList` JSON-LD still
  emitted, and — the load-bearing check — the rendered output contains **no
  `"use client"` boundary and no event handlers** (it stays a server component).
- Every page-body test that asserts on `PageFrame` output
  (`LinePage.test.tsx`, `PlacePage.test.tsx`, `RoutePage.test.tsx`,
  `GuidePageShell.test.tsx`, `index-pages.test.tsx`, `route-index.test.tsx`)
  gets its `PageFrame`-shape assertions updated. Body-content assertions do not
  change.

---

## Phase B — Hungarian legal slugs

### B.1 Renames

| Was | Becomes | RO twin (unchanged) |
|---|---|---|
| `/terms/` | `/felhasznalasi-feltetelek/` | `/ro/termeni/` |
| `/privacy/` | `/adatvedelem/` | `/ro/confidentialitate/` |

- `app/terms/` → `app/felhasznalasi-feltetelek/`; `app/privacy/` →
  `app/adatvedelem/`. The `page.tsx` files keep their shape; update
  `alternates.canonical` and `alternates.languages` in each.
- `app/ro/termeni/page.tsx` and `app/ro/confidentialitate/page.tsx`: update the
  `huPath` passed to `pageMetadata` and the doc-comment.

### B.2 Redirects

`web/netlify.toml`, in the `[[redirects]]` table (which must stay above the
`[[headers]]` blocks — `lib/seo/redirects.test.ts` asserts the ordering):

```toml
[[redirects]]
  from = "/terms/*"
  to = "/felhasznalasi-feltetelek/:splat"
  status = 301

[[redirects]]
  from = "/privacy/*"
  to = "/adatvedelem/:splat"
  status = 301
```

`/terms/*` matches `/terms/` and `/terms` (Netlify normalises). No RO redirect —
the RO slugs never changed.

### B.3 Every reference updates

Search-and-replace across the repo (verified list from the current tree):

- `lib/seo/urls.ts` — the `STATIC` table entries.
- `components/planner/Planner.tsx` — the two `contentHref("/terms/", …)` /
  `contentHref("/privacy/", …)` settings links.
- `components/seo/HomeFooter.tsx` — the `["/terms/", …]` / `["/privacy/", …]`
  rows (HU list) and, if present, the RO list (already `/ro/…`, no change).
- `components/analytics/Analytics.tsx` — the consent-banner links (lines ~136–137).
- `components/legal/LegalPage.tsx` — the cross-links (`<Link href="/privacy/">`,
  `<Link href="/terms/">`) and the doc-comment.
- `scripts/verify-seo.mjs` — the `EXEMPT` set (`/terms/`, `/privacy/` →
  new slugs) and the comment block above it.
- `lib/seo/redirects.test.ts` — add the two new rules to the `rules` array.
- Any test that hard-codes `/terms/` or `/privacy/` (`homepage-head.test.ts`,
  `HomeFooter.test.tsx`, `Planner.test.tsx`, `metadata.test.ts`,
  `LegalPage.test.tsx`, `urls.test.ts`, `sitemap.test.ts`).

The service worker `SHELL` (`public/sw.js`) does **not** list either page — no
change there.

---

## Phase C — the English tree

### C.1 URL map

English category path segments; Hungarian place and line slugs (proper nouns
don't translate, and this keeps `/en/` aligned with the canonical HU tree).

| Purpose | Hungarian | Romanian | English |
|---|---|---|---|
| Planner | `/` | `/ro/` | `/en/` |
| Line index | `/vonalak/` | `/ro/linii/` | `/en/lines/` |
| One line | `/vonalak/{id}/` | `/ro/linii/{id}/` | `/en/lines/{id}/` |
| Stop index | `/megallok/` | `/ro/statii/` | `/en/stops/` |
| One place | `/megallok/{huSlug}/` | `/ro/statii/{roSlug}/` | `/en/stops/{huSlug}/` |
| Route A→B | `/utvonal/{huPair}/` | `/ro/trasee/{roPair}/` | `/en/routes/{huPair}/` |
| Route index | `/utvonal/` | `/ro/trasee/` | `/en/routes/` |
| Fares | `/dijszabas/` | `/ro/tarife/` | `/en/fares/` |
| Multi-Trans | `/multi-trans/` | `/ro/multi-trans/` | `/en/multi-trans/` |
| SepsiBike | `/sepsibike/` | `/ro/sepsibike/` | `/en/sepsibike/` |
| Pillar | `/buszmenetrend/` | `/ro/orar-autobuz/` | `/en/bus-schedule/` |
| FAQ | `/gyik/` | `/ro/intrebari-frecvente/` | `/en/faq/` |
| Terms | `/felhasznalasi-feltetelek/` | `/ro/termeni/` | `/en/terms/` |
| Privacy | `/adatvedelem/` | `/ro/confidentialitate/` | `/en/privacy/` |

`{id}` verbatim from the feed (`1`, `1D`, …). `{huSlug}` / `{huPair}` are exactly
the values `buildPlaces().slug` / `notablePairs().slug` already produce — the EN
routes reuse them, no new slug pass.

### C.2 `SeoLang` becomes three-valued

`lib/seo/lines.ts` exports `export type SeoLang = "hu" | "ro" | "en"`. This type
threads through `routes.ts`, `og.tsx`, `RoutePage.tsx`, `LinePage.tsx`,
`PlacePage.tsx`, and `PageFrame.tsx`'s local `Lang`. Every
`lang === "hu" ? … : …` binary conditional that currently means "hu else ro"
becomes an explicit three-way (`lang === "hu" ? hu : lang === "ro" ? ro : en`),
and every feed-name access `x.name[lang]` becomes `x.name[lang] ?? x.name.hu`
(the feed has no `en`).

### C.3 `lib/seo/` module changes

- **`urls.ts`** — `PageEntry` gains `en: string`. `STATIC` entries each gain an
  `en` path. `allPages()` emits the EN URL for lines
  (`/en/lines/${id}/`), places (`/en/stops/${p.slug}/` — the **HU** slug),
  routes (`/en/routes/${r.slug}/` — the **HU** pair slug). `path` stays `hu`.
- **`metadata.ts`** — `pageMetadata` takes `enPath: string`; `alternates.languages`
  becomes `{ hu, ro, en, "x-default": hu }`; `selfUrl` picks by three-way `lang`;
  `openGraph.locale` is `hu_HU` / `ro_RO` / `en_US`. Every caller
  (`guideMetadata`, `lineMetadata`, `placeMetadata`, `routeMetadata`,
  `indexMetadata`, the two legal `page.tsx` metadata objects, `app/ro/*` +
  `app/en/*` `generateMetadata`) passes the third path.
- **`content.ts` / `content.en.ts`** — new `content.en.ts` exporting `EN:
  Record<GuideKey, GuideCopy>` with English `slug` / `title` / `description` /
  `body` for all five guides (`fares`, `multiTrans`, `bike`, `pillar`, `faq`),
  and an English `faq` array for the `faq` guide. `content.ts`: `GuidePage`
  fields become `{ hu, ro, en }`; `zip()` pairs all three and throws if `faq`
  is present in one or two languages but not all three. The guide `slug` for EN
  is the bare segment (`"fares"`, `"bus-schedule"`, `"faq"`, `"multi-trans"`,
  `"sepsibike"`) matching the URL map — mirror how HU/RO slugs already work.
- **`lines.ts`** — `lineLabel(id, "en")` → `` `line ${id}` `` (id keeps its case).
  `enrichLine` termini use the `?? name.hu` fallback. `sentenceCase` unchanged.
- **`places.ts`** — no structural change; `Place.name` stays `{ hu, ro }`.
  Consumers read the name for English as `name.hu` (proper nouns don't
  translate). A handful of notable stops are common nouns ("Vasútállomás" =
  railway station, "Megyei kórház" = county hospital); shipping the Hungarian
  form to an English reader is the accepted trade-off for this phase — a small
  EN display-name table for the ~14 `NOTABLE_PLACE_SLUGS` is a possible
  follow-up, not part of this work. Add a `nameFor(place, lang)` helper rather
  than widening the `Place` type.
- **`routes.ts`** — `journeyBetween` / `notablePairs` accept `SeoLang`; the
  `"en"` path uses HU names. No `slugEn` field — EN routes use `slug` (HU).
- **`og.tsx`** — `OgProps["lang"]` and every `*Og(…, lang)` signature widen to
  `SeoLang`. `TAG` gains `en: "unofficial"`. `lineOg` / `placeOg` / `routeOg` /
  `guideOg` handle `"en"`: line heading `sentenceCase("line 3")`; place heading
  `place.name.hu`, fallback sub `"bus stop"`; route heading
  `` `${a.name.hu} → ${b.name.hu}` `` (plain arrow — English needs no case
  forms); guide heading `GUIDES[key].title.en`; sub `"Sfântu Gheorghe"`
  (English uses the official Romanian place name for the city).
- **`hu-place-forms.ts`** — untouched. No `en-place-forms` needed.
- **`jsonld.ts`** — `breadcrumbLd` / `faqLd` take plain strings already; no
  change. English FAQ / breadcrumb strings come from the page components.
- **`localize.ts` + `scripts/localize-html.mjs`** — add `toEnglish(html)`:
  `<html lang="hu"` → `<html lang="en"`, `content="hu_HU"` → `content="en_US"`.
  The `.mjs` walks `out/en/**` the same way it walks `out/ro/**`. Keep the two
  implementations in sync (the existing comment convention).

### C.4 Page-body components — add the `en` branch

`GuidePageShell.tsx`, `GuideBody.tsx`, `IndexShell.tsx` (`LineIndex`,
`StopIndex`, `RouteIndex`, `indexMetadata`), `LinePage.tsx`, `PlacePage.tsx`,
`RoutePage.tsx`, `BoardTable.tsx`, `StopList.tsx`, `RouteShape.tsx`:

- Widen the local `Lang` / `SeoLang` type.
- Every `Record<Lang, …>` table (`HOME`, `CRUMB`, `PATHS`, `INDEX_LINKS`,
  `LINE_BASE`, `T`, the `PageFrame` `T`) gains an `en` entry.
- Every prose conditional gets an English branch. English route prose:
  `"Board line 3 at {from} and ride {n} stops ({m} min) to {to}."`, joined with
  `" Then "`. English summary: `"The trip takes about {t} minutes, {transfers},
  {w} minutes of walking. First useful departure {hm}, last {hm}."`. English FAQ
  questions: `"Which bus goes from {A} to {B}?"`, `"How long does the trip
  take?"`, `"How much is the ticket?"` → `"2.5 lei / 50 min via the 24pay app
  (per multitrans.ro)."`.
- `ctaHref` — the planner deep link. For `"en"`, append `&lang=en` (the planner
  reads `?lang=`).

### C.5 `app/en/**` route files

One `page.tsx` (and `opengraph-image.ts` where the HU/RO twin has one) per entry,
mirroring `app/ro/**` exactly but with `lang="en"` and the EN
`generateStaticParams` source:

```
app/en/page.tsx                         → HomePage({ lang: "en" }) + generateMetadata
app/en/lines/page.tsx                   → <LineIndex lang="en" /> + indexMetadata("lines","en")
app/en/lines/[id]/page.tsx  (+ og)      → <LinePage lang="en" id> ; params = net.lines
app/en/stops/page.tsx                   → <StopIndex lang="en" />
app/en/stops/[slug]/page.tsx (+ og)     → <PlacePage lang="en" slug> ; params = buildPlaces().slug  (HU slug!)
app/en/routes/page.tsx                  → <RouteIndex lang="en" />
app/en/routes/[pair]/page.tsx (+ og)    → <RoutePage lang="en" pair> ; params = notablePairs().slug (HU slug!)
app/en/fares/page.tsx        (+ og)     → <GuidePageShell guideKey="fares" lang="en" />
app/en/multi-trans/page.tsx  (+ og)     → guideKey="multiTrans"
app/en/sepsibike/page.tsx    (+ og)     → guideKey="bike"
app/en/bus-schedule/page.tsx (+ og)     → guideKey="pillar"
app/en/faq/page.tsx          (+ og)     → guideKey="faq"
app/en/terms/page.tsx                   → <LegalPage type="terms" lang="en" />   + pageMetadata(lang:"en")
app/en/privacy/page.tsx                 → <LegalPage type="privacy" lang="en" />
```

The `PATHS` tables inside `GuidePageShell` / `IndexShell` / `LinePage` /
`PlacePage` / `RoutePage` gain the `en` column so `generateMetadata` and the
in-page twin links resolve.

### C.6 Homepage + footer

- `app/page.tsx` already exports `HomePage({ lang })`; it already supports the
  planner rendering EN via `lib/i18n`. `app/en/page.tsx` calls
  `HomePage({ lang: "en" })`. `app/page.tsx` + `app/ro/page.tsx` +
  `app/en/page.tsx` metadata `languages` maps become the three-way
  `{ hu:"/", ro:"/ro/", en:"/en/", "x-default":"/" }`.
- `components/seo/HomeFooter.tsx` (+ `.module.css`, `.test.tsx`) gains an `"en"`
  branch: English link labels, `/en/…` hrefs, the English disclaimer
  ("Not the official Multi-Trans SA website."), and a three-way language line
  (`/` · `/ro/` · `/en/`).

### C.7 `LegalPage` — third toggle

`components/legal/LegalPage.tsx`:
- `type Lang` local usage widens; the `forcedLang` prop accepts `"en"`.
- The `.seg` group gets a third `<button>` "English".
- New `TermsContentEn()` and `PrivacyContentEn()` render functions with English
  legal copy (structure mirrors the HU/RO versions — same headings, same
  `styles.*` classes). Same "AS IS / AS AVAILABLE" disclaimer intent.
- All the `lang === "ro" ? … : …` binaries in the header/badge/nav become
  three-way.
- `LegalPage.test.tsx` gains EN coverage (EN toggle renders, EN content present).

### C.8 `PageFrame` — three-way switch

`PageFrame` takes the `{ hu, ro, en }` path triple (replacing the single
`twinPath`) and renders three `<a>` segments (see A.2). `hrefLang` on each. The
current language's segment is `aria-current="true"` and not a link target to
itself (render as `<span>` or a non-navigating `<a>` — match LegalPage's pressed
state). Callers (`GuidePageShell`, `IndexShell`, `LinePage`, `PlacePage`,
`RoutePage`) pass the triple they already compute for `pageMetadata`.

### C.9 sitemap + `verify-seo`

- **`app/sitemap.ts`** — each `PageEntry` now yields **three** `<loc>`s (hu, ro,
  en), all carrying the same four-key `languages` map
  (`{ hu, ro, en, "x-default": hu }`).
- **`scripts/verify-seo.mjs`**:
  - `alternatesOf` already collects any `hreflang`; the completeness check
    becomes "need hu, ro, en, x-default".
  - Reciprocity key becomes `hu|ro|en`; the triple string includes `en=`.
  - The subtree language check (`step 4`) learns `out/en/**` → `lang="en"`
    (alongside the existing `out/ro/**` → `ro`).
  - The orphan BFS (`step 5`) adds `"/en/"` and `"/en/bus-schedule/"` to
    `HUB_PATHS`; `step 5b` adds `["/en/", "/en/bus-schedule/"]` to the
    homepage→pillar assertion.
  - `EXEMPT` adds `/en/`, `/en/terms/`, `/en/privacy/`.
  - Page count roughly doubles-and-a-half (~358 → ~537); the final green line
    reports the real number.

### C.10 Out of scope for Phase C

- **No `/en/` service-worker precache / offline shell.** `public/sw.js` `SHELL`
  is unchanged; a navigation to an uncached `/en/…` page falls through to
  `fetch().catch(→ offline.html)` exactly as `/ro/…` does today. (Deferred,
  matches the Romanian decision — see the `planner-stuck-failure-mode` note.)
- **No feed change.** English place / headsign names are the Hungarian names.
- **No reverse-pair 301s** (still deferred from the original spec).
- English copy ships as the implementer's draft; native review is a follow-up.

---

## Testing & verification

### Regression (must not change behaviour)

- Full existing suite green (`npm test`, baseline 578 → higher with new tests,
  0 failures).
- `npm run build` → `verify-seo` green, determinism holds (byte-identical `out/`
  for the same feed — the original project's `out.a` comparison recipe still
  passes).
- `npm run preview:netlify` → every HU/RO/EN page 200; `/terms/` → 301 →
  `/felhasznalasi-feltetelek/`; `/privacy/` → 301 → `/adatvedelem/`;
  `/hu/*`, `/lines/*`, `/stops/*` redirects still fire; `/api/sepsibike` 200;
  no console errors; all network requests finish.
- Query-string planner deep links still decode (existing test).

### New tests

- **Phase A:** `PageFrame.test.tsx` rewrite (header, card, badge per `kind`+`lang`,
  breadcrumb + JSON-LD retained, **still a server component / no client boundary**).
- **Phase B:** `redirects.test.ts` covers the two new 301 rules; the renamed
  pages resolve; `HomeFooter` / `Planner` / `Analytics` link to the new slugs;
  built `/felhasznalasi-feltetelek/index.html` + `/adatvedelem/index.html` exist.
- **Phase C:**
  - `content.en` integrity: all five guides present, `faq` guide has an EN `faq`,
    `zip()` throws on a one/two-language `faq`.
  - EN URL inventory: `allPages()` entries all carry a non-empty `en`; EN place
    URL uses the HU slug; EN route URL uses the HU pair slug.
  - `pageMetadata` emits the four-key `languages` map; `selfUrl` correct for
    `lang="en"`; `og:locale` `en_US`.
  - `metadata.test.ts` / `homepage-head.test.ts`: three-way reciprocal
    `hreflang` on `/`, `/ro/`, `/en/` and on a sample line/place/route/guide.
  - EN route phrasing (`"from A to B"`, no case forms); EN FAQ strings.
  - `LegalPage` EN toggle + EN content.
  - `localize.ts` `toEnglish` is pure and idempotent.
  - Built output: `out/en/**` all `<html lang="en">`; a spot-check of
    `/en/lines/3/`, `/en/stops/sepsi-arena/`, `/en/routes/…/`, `/en/bus-schedule/`,
    `/en/faq/`, `/en/terms/` — 200, one `<h1>`, self-canonical, EN `og:image`
    resolves.
  - `verify-seo` page count assertion updated.

### Build gate

`scripts/verify-seo.mjs` (three-language aware) runs on every `npm run build`
and covers the ~537-page surface structurally each time.

---

## File map (summary)

**Phase A:** `components/seo/PageFrame.tsx`, `PageFrame.module.css`,
`PageFrame.test.tsx`; touch-ups to the six page-body test files.

**Phase B:** move `app/terms/` → `app/felhasznalasi-feltetelek/`, `app/privacy/`
→ `app/adatvedelem/`; `app/ro/termeni/page.tsx`, `app/ro/confidentialitate/page.tsx`;
`web/netlify.toml`; `lib/seo/urls.ts`, `scripts/verify-seo.mjs`;
`components/planner/Planner.tsx`, `components/seo/HomeFooter.tsx`,
`components/analytics/Analytics.tsx`, `components/legal/LegalPage.tsx`;
`lib/seo/redirects.test.ts` + the tests listed in B.3.

**Phase C:**
- `lib/seo/`: `lines.ts`, `routes.ts`, `places.ts` (read helper only),
  `metadata.ts`, `content.ts`, **new** `content.en.ts`, `og.tsx`, `urls.ts`,
  `localize.ts`.
- `scripts/`: `localize-html.mjs`, `verify-seo.mjs`.
- `app/`: `sitemap.ts`; **new** `app/en/**` (14 `page.tsx` + ~6
  `opengraph-image.ts`); `app/page.tsx` + `app/ro/page.tsx` metadata maps.
- `components/`: `seo/PageFrame.tsx` (three-way switch), `seo/GuidePageShell.tsx`,
  `seo/GuideBody.tsx`, `seo/IndexShell.tsx`, `seo/LinePage.tsx`,
  `seo/PlacePage.tsx`, `seo/RoutePage.tsx`, `seo/BoardTable.tsx`,
  `seo/StopList.tsx`, `seo/RouteShape.tsx`, `seo/HomeFooter.tsx` (+ css/test),
  `legal/LegalPage.tsx` (+ css/test).
- Tests as listed above.
