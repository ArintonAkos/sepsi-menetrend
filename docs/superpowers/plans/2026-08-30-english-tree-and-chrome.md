# English Tree, Page Chrome & Legal Slugs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full English (`/en/`) mirror of the generated SEO content set, restyle every generated page to the app's `/terms/`-style chrome, and rename the two English legal slugs to Hungarian with 301 redirects.

**Architecture:** All ~358 generated pages already render through one server component (`components/seo/PageFrame.tsx`); Phase A restyles it in place. English is a third value of the existing `SeoLang` union threaded through `lib/seo/*` and the page-body components, plus an `app/en/**` route tree that mirrors `app/ro/**` (English category path segments, Hungarian place/line slugs). Hungarian stays canonical at the bare root; `hreflang` grows from three keys to four (`hu`/`ro`/`en`/`x-default`→HU).

**Tech Stack:** Next.js 16.3.1 (vendored fork — read `web/node_modules/next/dist/docs/01-app/` before route code), `output: "export"`, `trailingSlash: true`, React server components, `next/og` (Satori) for share cards, Netlify static hosting + `[[redirects]]`, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-30-english-tree-and-chrome-design.md` (extends `docs/superpowers/specs/2026-08-29-seo-content-pages-design.md`)

## Global Constraints

- **Next.js 16.3.1, vendored fork.** Read `web/node_modules/next/dist/docs/01-app/` before writing/changing route code. Commit the `web/AGENTS.md` banner if `next dev` re-adds it.
- **Static export only.** No server, middleware, or Netlify functions. Every page is `generateStaticParams` + `generateMetadata` + server-component render.
- **The planner is frozen.** No behaviour change to `components/planner/**`, `lib/share.ts`, `lib/engine/**`. `lib/engine/plan.ts` may be imported at build time, never modified. `app/page.tsx` changes only where this plan calls it out.
- **Zero client JS on the SEO pages.** `PageFrame` and everything it renders stays a server component. The language switch is `<a>` elements, never a toggle.
- **Data from `network.json` only.** No new data source, no runtime fetch. English place / headsign names fall back to the Hungarian name (the feed carries `{ ro, hu }` only).
- **Determinism.** Same `network.json` → byte-identical `out/`. No `Date.now()`, no unordered iteration in generated output.
- **Hungarian stays the default and the `hreflang` `x-default`.** Romanian and English are additive. `/` is never moved or redirected.
- **Old URLs keep working.** Every currently-live path resolves or 301-redirects. Query-string planner deep links (`/?from=…`, `/?line=1&service=weekday`, `/?stop=P22`, `/?lang=ro`) are untouched.
- **No new third-party request** on any content page.
- **Diacritics render** in HTML and OG images; slugs are diacritic-folded ASCII.
- **Full existing suite stays green** (`npm test`; baseline 578, rising as tasks add tests). `scripts/verify-seo.mjs` runs on every `npm run build` and must pass.
- **Copy facts pinned:** city ticket `2,5 lej / 50 perc` (RO `2,5 lei / 50 min`, EN `2.5 lei / 50 min`) via the 24pay app; line 10 to Árkos/Arcuș `4 lej / 60 perc`; Friday free "per Multi-Trans"; prices quoted "per multitrans.ro". English city name: **Sfântu Gheorghe**. English operator label: "Multi-Trans SA".
- **Do not push.** Verify locally (`npm test`, `npm run build`, `npm run preview:netlify`) and hand over.
- English copy is the implementer's draft; a native review pass is a logged follow-up, not part of this work.
- All commits end with the trailer `Claude-Session: https://claude.ai/code/session_01QNAfG3gVrfC457VR9xayjn`. Git identity is already `Akos Arinton <arintonakos@gmail.com>` (repo-local config); do not change it.

## Working directory

Everything is under `web/`. All paths below are relative to `web/`. Run `npm test` / `npm run build` from `web/`.

---

## File Structure

### Phase A — chrome
| File | Responsibility |
|---|---|
| `components/seo/PageFrame.tsx` (modify) | The shared chrome. Gains the app header (wordmark + back link + segmented language switch), a card wrapper, a per-`kind` badge. Stays a server component. |
| `components/seo/PageFrame.module.css` (modify) | Port the header / card / badge / segmented-control rules from `LegalPage.module.css`, reusing `app/globals.css` tokens. |
| `components/seo/PageFrame.test.tsx` (rewrite) | Assert the new structure; assert it stays a server component (no `"use client"`, no handlers). |
| `components/seo/{GuidePageShell,IndexShell,LinePage,PlacePage,RoutePage}.tsx` (modify) | Pass the new `kind` prop to `PageFrame`. |

### Phase B — legal slugs
| File | Responsibility |
|---|---|
| `app/terms/` → `app/felhasznalasi-feltetelek/` (move) | HU terms page at its Hungarian slug. |
| `app/privacy/` → `app/adatvedelem/` (move) | HU privacy page at its Hungarian slug. |
| `app/ro/termeni/page.tsx`, `app/ro/confidentialitate/page.tsx` (modify) | `huPath` in the metadata call. |
| `netlify.toml` (modify) | Two 301 `[[redirects]]` for the old slugs. |
| `lib/seo/urls.ts`, `scripts/verify-seo.mjs`, `components/planner/Planner.tsx`, `components/seo/HomeFooter.tsx`, `components/analytics/Analytics.tsx`, `components/legal/LegalPage.tsx` (modify) | Every internal reference. |
| `lib/seo/redirects.test.ts` + hard-coded-slug tests (modify) | New rules + updated expectations. |

### Phase C — English tree
| File | Responsibility |
|---|---|
| `lib/seo/lang.ts` (**new**) | `SeoLang` union (`"hu" | "ro" | "en"`), `SEO_LANGS` tuple, `pickName(names, lang)` helper (English → HU name). |
| `lib/seo/lines.ts` (modify) | Re-export `SeoLang` from `lang.ts`; English line label `line {id}`; stop-name access via `pickName`. |
| `lib/seo/routes.ts` (modify) | Widen signatures to `SeoLang`; English journey prose helpers. |
| `lib/seo/metadata.ts` (modify) | `pageMetadata` gains optional `enPath` → four-key `languages`; `en_US` locale. |
| `lib/seo/jsonld.ts` (modify) | `websiteLd` widened to `SeoLang`. |
| `lib/seo/urls.ts` (modify) | `PageEntry.en`; `STATIC` gains `en`; `allPages()` emits EN URLs. |
| `lib/seo/content.ts` (modify) + `content.en.ts` (**new**) | Three-way `zip`; English guide prose (5 guides + FAQ). |
| `lib/seo/og.tsx` (modify) | English strings for all four `*Og` builders. |
| `lib/seo/localize.ts` (modify) + `scripts/localize-html.mjs` (modify) | `toEnglish(html)` — stamp `lang="en"` / `en_US` on `out/en/**`. |
| `components/seo/{PageFrame,GuidePageShell,IndexShell,LinePage,PlacePage,RoutePage,BoardTable,StopList,RouteShape}.tsx` (modify) | English branches; `PageFrame` three-segment switch. |
| `components/seo/HomeFooter.tsx` (modify) | English link set + disclaimer + three-way language line. |
| `components/legal/LegalPage.tsx` (modify) | Third toggle button + `TermsContentEn` / `PrivacyContentEn`. |
| `app/en/**` (**new**, ~22 files) | Mirror of `app/ro/**` with `lang="en"`. |
| `app/page.tsx`, `app/ro/page.tsx` (modify) | `languages` maps gain the `en` key. |
| `app/sitemap.ts` (modify) | Three `<loc>` per entry; four-key `languages`. |
| `scripts/verify-seo.mjs` (modify) | English-aware: four-key hreflang, `out/en/**` → `lang="en"`, EN hubs, EN exemptions. |

---

## Phase A

### Task A1: App-consistent page chrome on `PageFrame`

**Files:**
- Modify: `components/seo/PageFrame.tsx`
- Modify: `components/seo/PageFrame.module.css`
- Rewrite: `components/seo/PageFrame.test.tsx`
- Modify: `components/seo/GuidePageShell.tsx` (one line — `kind="guide"`)
- Modify: `components/seo/IndexShell.tsx` (`kind="index"`)
- Modify: `components/seo/LinePage.tsx` (`kind="line"`)
- Modify: `components/seo/PlacePage.tsx` (`kind="place"`)
- Modify: `components/seo/RoutePage.tsx` (`kind="route"`)
- Check-only: `components/seo/{GuidePageShell,IndexShell,LinePage,PlacePage,RoutePage}.test.tsx` (fix any assertion that reads `PageFrame` structure — body-content assertions do not change)
- Reference: `components/legal/LegalPage.tsx`, `components/legal/LegalPage.module.css`, `components/common/icons.tsx` (`Back`), `app/globals.css` (tokens `--paper --surface --sunk --ink --ink-2 --muted --border --hair --panel --signal --signal-ink --shadow --tap --ease`)

**Interfaces:**
- Consumes: nothing new.
- Produces: `PageFrame` prop shape
  ```ts
  type Lang = "hu" | "ro";
  type Kind = "line" | "place" | "route" | "guide" | "index";
  interface PageFrameProps {
    lang: Lang;
    kind: Kind;
    crumbs: { name: string; path: string }[];
    twinPath: string;              // unchanged this phase — becomes a triple in Task C12
    children: React.ReactNode;
  }
  ```
  Badge / brand-subtitle text table (used again in C12 for the `en` column):
  | kind | hu | ro |
  |---|---|---|
  | line | `Vonal` | `Linie` |
  | place | `Megálló` | `Stație` |
  | route | `Útvonal` | `Traseu` |
  | guide | `Útmutató` | `Ghid` |
  | index | `Jegyzék` | `Listă` |
  The badge renders this text upper-cased; `brandSub` renders it as-is.

- [ ] **Step 1: Rewrite `PageFrame.test.tsx` to describe the new chrome**

Replace the file with:

```tsx
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { render, screen, within } from "@testing-library/react";
import PageFrame from "./PageFrame";

const crumbs = [
  { name: "Sepsi Menetrend", path: "/" },
  { name: "Vonalak", path: "/vonalak/" },
  { name: "1-es busz", path: "/vonalak/1/" },
];

describe("PageFrame chrome", () => {
  it("renders the brand header with a back link to the planner", () => {
    render(<PageFrame lang="hu" kind="line" twinPath="/ro/linii/1/" crumbs={crumbs}><p>x</p></PageFrame>);
    expect(screen.getByText("Sepsi Menetrend")).toBeInTheDocument();
    const back = screen.getByRole("link", { name: /vissza/i });
    expect(back).toHaveAttribute("href", "/");
  });

  it("shows a per-kind badge in the page language", () => {
    const { rerender } = render(
      <PageFrame lang="hu" kind="line" twinPath="/ro/linii/1/" crumbs={crumbs}><p>x</p></PageFrame>,
    );
    expect(screen.getByText("VONAL")).toBeInTheDocument();
    rerender(<PageFrame lang="ro" kind="route" twinPath="/utvonal/x-y/" crumbs={crumbs}><p>x</p></PageFrame>);
    expect(screen.getByText("TRASEU")).toBeInTheDocument();
  });

  it("wraps the children in the card", () => {
    render(<PageFrame lang="hu" kind="guide" twinPath="/ro/tarife/" crumbs={crumbs}><p>the body</p></PageFrame>);
    expect(screen.getByText("the body")).toBeInTheDocument();
  });

  it("offers a two-language switch; the current language is not a link to itself", () => {
    render(<PageFrame lang="hu" kind="line" twinPath="/ro/linii/1/" crumbs={crumbs}><p>x</p></PageFrame>);
    expect(screen.getByRole("link", { name: "Română" })).toHaveAttribute("href", "/ro/linii/1/");
    const hu = screen.getByText("Magyar");
    expect(hu.closest("a")).toBeNull();
    expect(hu).toHaveAttribute("aria-current", "true");
  });

  it("keeps the breadcrumb: N-1 links, last crumb is current-page text", () => {
    render(<PageFrame lang="hu" kind="line" twinPath="/ro/linii/1/" crumbs={crumbs}><p>x</p></PageFrame>);
    const nav = screen.getByRole("navigation", { name: /morzs/i });
    expect(within(nav).getAllByRole("link")).toHaveLength(crumbs.length - 1);
    const current = within(nav).getByText("1-es busz");
    expect(current.closest("a")).toBeNull();
    expect(current).toHaveAttribute("aria-current", "page");
  });

  it("keeps the disclaimer, the operator link and the footer hub links, per language", () => {
    const { rerender } = render(
      <PageFrame lang="hu" kind="line" twinPath="/ro/linii/1/" crumbs={crumbs}><p>x</p></PageFrame>,
    );
    expect(screen.getByText(/Nem a Multi-Trans SA hivatalos oldala/)).toBeInTheDocument();
    let footer = screen.getByRole("contentinfo");
    let hrefs = within(footer).getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/buszmenetrend/");
    expect(hrefs).toContain("/");
    const op = within(footer).getByRole("link", { name: /multitrans\.ro/i });
    expect(op).toHaveAttribute("target", "_blank");
    expect(op).toHaveAttribute("rel", "noopener noreferrer");

    rerender(<PageFrame lang="ro" kind="line" twinPath="/vonalak/1/" crumbs={crumbs}><p>x</p></PageFrame>);
    expect(screen.getByText(/Nu este site-ul oficial Multi-Trans SA/)).toBeInTheDocument();
    footer = screen.getByRole("contentinfo");
    hrefs = within(footer).getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/ro/orar-autobuz/");
    expect(hrefs).toContain("/ro/");
  });

  it("emits BreadcrumbList JSON-LD with every crumb as an absolute-URL ListItem", () => {
    const { container } = render(
      <PageFrame lang="hu" kind="line" twinPath="/ro/linii/1/" crumbs={crumbs}><p>x</p></PageFrame>,
    );
    const ld = JSON.parse(container.querySelector('script[type="application/ld+json"]')!.textContent!);
    expect(ld["@type"]).toBe("BreadcrumbList");
    expect(ld.itemListElement).toHaveLength(3);
    expect(ld.itemListElement[2]).toMatchObject({ position: 3, name: "1-es busz" });
    expect(ld.itemListElement[2].item).toMatch(/^https?:\/\/.+\/vonalak\/1\/$/);
  });

  it("stays a server component — no client boundary, no event handlers in the source", () => {
    const src = readFileSync(new URL("./PageFrame.tsx", import.meta.url), "utf8");
    expect(src).not.toMatch(/["']use client["']/);
    expect(src).not.toMatch(/\bon[A-Z]\w+=/);
    expect(src).not.toMatch(/useState|useEffect|useRef/);
  });
});
```

- [ ] **Step 2: Run the test, confirm it fails**

Run: `npm test -- --run components/seo/PageFrame.test.tsx`
Expected: FAIL (no brand header / badge / `kind` prop yet).

- [ ] **Step 3: Rewrite `PageFrame.tsx`**

```tsx
import type { ReactNode } from "react";
import { breadcrumbLd, jsonLdScript } from "@/lib/seo/jsonld";
import { Back } from "@/components/common/icons";
import styles from "./PageFrame.module.css";

/** The shared chrome around every generated SEO page: the app header (brand
 *  wordmark, a back link to the planner, a language switch), a breadcrumb, the
 *  page body inside a card, and a footer that denies any official status.
 *
 *  A server component on purpose — these pages are crawl targets and the first
 *  thing a search visitor sees, so the frame ships as static HTML with no
 *  client JS. The language switch is plain `<a>`, never a toggle. The `/ro/`
 *  twin is built as Hungarian and language-stamped afterwards
 *  (`lib/seo/localize.ts`), so `lang` is passed in explicitly. */

type Lang = "hu" | "ro";
type Kind = "line" | "place" | "route" | "guide" | "index";

interface PageFrameProps {
  lang: Lang;
  kind: Kind;
  crumbs: { name: string; path: string }[];
  twinPath: string;
  children: ReactNode;
}

const KIND_LABEL: Record<Kind, Record<Lang, string>> = {
  line: { hu: "Vonal", ro: "Linie" },
  place: { hu: "Megálló", ro: "Stație" },
  route: { hu: "Útvonal", ro: "Traseu" },
  guide: { hu: "Útmutató", ro: "Ghid" },
  index: { hu: "Jegyzék", ro: "Listă" },
};

const T = {
  hu: {
    crumbLabel: "Morzsamenü",
    back: "Vissza a tervezőhöz",
    switcherLabel: "Nyelvválasztó",
    disclaimer: "Nem a Multi-Trans SA hivatalos oldala",
    operator: "A Multi-Trans hivatalos oldala: multitrans.ro",
    pillar: { href: "/buszmenetrend/", label: "Teljes buszmenetrend" },
    planner: { href: "/", label: "Útvonaltervező" },
  },
  ro: {
    crumbLabel: "Firimituri",
    back: "Înapoi la planificator",
    switcherLabel: "Selector de limbă",
    disclaimer: "Nu este site-ul oficial Multi-Trans SA",
    operator: "Site-ul oficial Multi-Trans: multitrans.ro",
    pillar: { href: "/ro/orar-autobuz/", label: "Orar autobuz complet" },
    planner: { href: "/ro/", label: "Planificator de rute" },
  },
} as const;

/** Two-language switch this phase; Task C12 adds the English segment. */
const SWITCH: Record<Lang, string> = { hu: "Magyar", ro: "Română" };

export default function PageFrame({ lang, kind, crumbs, twinPath, children }: PageFrameProps) {
  const t = T[lang];
  const home = crumbs[0]?.path ?? (lang === "hu" ? "/" : "/ro/");
  const lastIndex = crumbs.length - 1;
  const sub = KIND_LABEL[kind][lang];

  // segment order is fixed hu, ro; the current language is text, the other a link
  const segments: { code: Lang; label: string; href: string | null }[] = [
    { code: "hu", label: SWITCH.hu, href: lang === "hu" ? null : twinPath },
    { code: "ro", label: SWITCH.ro, href: lang === "ro" ? null : twinPath },
  ];

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <a href={home} className={styles.backButton} aria-label={t.back}>
              <Back />
            </a>
            <div className={styles.brand}>
              <span className={styles.brandName}>Sepsi Menetrend</span>
              <span className={styles.brandSub}>{sub}</span>
            </div>
          </div>

          <div className={styles.seg} role="group" aria-label={t.switcherLabel}>
            {segments.map((s) =>
              s.href ? (
                <a key={s.code} href={s.href} hrefLang={s.code}>
                  {s.label}
                </a>
              ) : (
                <span key={s.code} aria-current="true">
                  {s.label}
                </span>
              ),
            )}
          </div>
        </header>

        <nav aria-label={t.crumbLabel} className={styles.crumbs}>
          <ol className={styles.crumbList}>
            {crumbs.map((c, i) => (
              <li key={c.path} className={styles.crumb}>
                {i === lastIndex ? (
                  <span aria-current="page">{c.name}</span>
                ) : (
                  <a href={c.path}>{c.name}</a>
                )}
              </li>
            ))}
          </ol>
        </nav>

        <main className={styles.card}>
          <div className={styles.badge}>{sub.toUpperCase()}</div>
          {children}
        </main>

        {/* A real <footer> element, sibling of <main> (NOT nested in it) — a
            <footer> inside <main> gets no `contentinfo` landmark. */}
        <footer className={styles.footerNav}>
          <p className={styles.disclaimer}>{t.disclaimer}</p>
          <div className={styles.footerLinks}>
            <a href={t.planner.href}>{t.planner.label}</a>
            <a href={t.pillar.href}>{t.pillar.label}</a>
            <a
              className={styles.operator}
              href="https://multitrans.ro/index.html"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t.operator}
            </a>
          </div>
        </footer>

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbLd(crumbs)) }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Rewrite `PageFrame.module.css`**

Port from `LegalPage.module.css` + keep the breadcrumb rules. Full file:

```css
/* The SEO pages wear the same chrome as the legal pages (LegalPage.module.css),
   built from app/globals.css tokens so a visitor from search lands on the same
   warm paper and olive ink as the planner. Server-rendered: nothing here loads
   an image or needs client JS. */

.page {
  min-height: 100dvh;
  background: var(--paper);
  color: var(--ink);
  padding: 24px 16px 64px;
  display: flex;
  justify-content: center;
}

.container {
  width: 100%;
  max-width: 780px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 4px 4px;
}

.headerLeft { display: flex; align-items: center; gap: 12px; }

.backButton {
  width: 38px;
  height: 38px;
  border-radius: 999px;
  background: var(--surface);
  box-shadow: var(--shadow);
  border: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ink);
  flex-shrink: 0;
  text-decoration: none;
  transition: transform var(--tap) var(--ease), background var(--tap) var(--ease);
}
.backButton:active { transform: scale(0.94); }

.brand { display: flex; flex-direction: column; }
.brandName {
  font-family: ui-rounded, "SF Pro Rounded", "Varela Round", system-ui, sans-serif;
  font-size: 16px;
  font-weight: 800;
  color: var(--ink);
  line-height: 1.15;
}
.brandSub { font-size: 12px; font-weight: 600; color: var(--muted); }

.seg {
  display: flex;
  background: var(--sunk);
  border-radius: 11px;
  padding: 3px;
  gap: 2px;
}
.seg a,
.seg span {
  font-size: 13px;
  font-weight: 600;
  padding: 6px 12px;
  border-radius: 9px;
  color: var(--muted);
  text-decoration: none;
  transition: background var(--tap) var(--ease), color var(--tap) var(--ease);
}
.seg span[aria-current="true"] {
  background: var(--paper);
  color: var(--ink);
  box-shadow: var(--shadow);
}

.crumbs { font-size: 13px; color: var(--muted); padding: 0 4px; }
.crumbList {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 6px;
}
.crumb { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
.crumb + .crumb::before { content: "\203A"; color: var(--hair); }
.crumbList a { color: var(--ink-2); text-decoration: none; }
.crumbList a:hover { text-decoration: underline; }
.crumbList [aria-current="page"] { color: var(--muted); }

.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 20px;
  padding: 32px 28px;
  box-shadow: var(--shadow);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.badge {
  font-family: ui-rounded, "SF Pro Rounded", "Varela Round", system-ui, sans-serif;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--signal-ink);
  background: var(--signal);
  border-radius: 6px;
  padding: 3px 8px;
  width: fit-content;
  margin-bottom: -4px;
}

.footerNav {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 16px;
  padding-top: 20px;
  border-top: 1px solid var(--border);
  font-size: 13px;
  line-height: 1.5;
  color: var(--muted);
}
.disclaimer { margin: 0; font-weight: 700; color: var(--ink-2); }
.footerLinks { display: flex; flex-wrap: wrap; gap: 6px 16px; }
.footerLinks a { color: var(--ink-2); text-decoration: none; font-weight: 600; }
.footerLinks a:hover { text-decoration: underline; }
.operator { color: var(--muted); }

@media (max-width: 600px) {
  .header { flex-wrap: wrap; }
  .card { padding: 22px 18px; border-radius: 16px; }
}
```

- [ ] **Step 5: Thread `kind` from the five callers**

In each, add `kind="…"` to the `<PageFrame …>` JSX:
- `components/seo/GuidePageShell.tsx` → `kind="guide"`
- `components/seo/IndexShell.tsx` (the `Shell` helper's `<PageFrame>`) → `kind="index"`
- `components/seo/LinePage.tsx` → `kind="line"`
- `components/seo/PlacePage.tsx` → `kind="place"`
- `components/seo/RoutePage.tsx` → `kind="route"`

- [ ] **Step 6: Run the SEO component tests, fix structural assertions**

Run: `npm test -- --run components/seo`
Expected: `PageFrame.test.tsx` PASS. If any of `GuidePageShell/IndexShell/LinePage/PlacePage/RoutePage`.test.tsx fail on a `PageFrame`-structure assertion (e.g. a hard-coded class name, or "exactly one `<nav>`"), update that assertion to the new structure — do not change body-content assertions. The `<h1>` still lives in `{children}`; there is still exactly one.

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: all green (578 + the rewritten `PageFrame` tests).

- [ ] **Step 8: Build and eyeball the gate**

Run: `npm run build`
Expected: `verify-seo: … pages checked, all green` (one `<h1>`, self-canonical, og:image resolve all still hold).

- [ ] **Step 9: Commit**

```bash
git add components/seo/
git commit -m "Give the generated pages the app's card-and-header chrome"
```

---

## Phase B

### Task B1: Hungarian slugs for the legal pages

**Files:**
- Move: `app/terms/page.tsx` → `app/felhasznalasi-feltetelek/page.tsx`
- Move: `app/privacy/page.tsx` → `app/adatvedelem/page.tsx`
- Modify: `app/ro/termeni/page.tsx`, `app/ro/confidentialitate/page.tsx`
- Modify: `netlify.toml`
- Modify: `lib/seo/urls.ts`, `scripts/verify-seo.mjs`
- Modify: `components/planner/Planner.tsx`, `components/seo/HomeFooter.tsx`, `components/analytics/Analytics.tsx`, `components/legal/LegalPage.tsx`
- Modify: `lib/seo/redirects.test.ts`
- Modify (expectations): `lib/seo/homepage-head.test.ts` (if it names the slugs), `lib/seo/urls.test.ts`, `lib/seo/sitemap.test.ts`, `components/seo/HomeFooter.test.tsx`, `components/planner/Planner.test.tsx`, `components/legal/LegalPage.test.tsx` — grep first (Step 1).

**Interfaces:**
- Produces: canonical HU legal paths `"/felhasznalasi-feltetelek/"` and `"/adatvedelem/"`. RO twins unchanged: `"/ro/termeni/"`, `"/ro/confidentialitate/"`.

- [ ] **Step 1: Find every reference**

Run: `git grep -n -e '/terms/' -e '/privacy/' -- 'web/**/*.ts' 'web/**/*.tsx' 'web/**/*.mjs' 'web/**/*.toml'`
Note every hit. Expected hits (from the current tree): `app/terms/page.tsx`, `app/privacy/page.tsx`, `app/ro/termeni/page.tsx`, `app/ro/confidentialitate/page.tsx`, `components/planner/Planner.tsx` (×2), `components/legal/LegalPage.tsx` (×2 + a comment), `components/seo/HomeFooter.tsx` (×2), `components/analytics/Analytics.tsx` (×2), `lib/seo/urls.ts` (×2), `scripts/verify-seo.mjs` (comment + `EXEMPT`).

- [ ] **Step 2: Add the failing redirect test**

In `lib/seo/redirects.test.ts`, extend the `rules` array:

```ts
const rules = [
  { from: "/hu/*", to: "/:splat" },
  { from: "/lines/*", to: "/vonalak/:splat" },
  { from: "/stops/*", to: "/megallok/:splat" },
  { from: "/terms/*", to: "/felhasznalasi-feltetelek/:splat" },
  { from: "/privacy/*", to: "/adatvedelem/:splat" },
];
```

- [ ] **Step 3: Run it, confirm it fails**

Run: `npm test -- --run lib/seo/redirects.test.ts`
Expected: FAIL — the two new rules are not in `netlify.toml`.

- [ ] **Step 4: Add the redirects**

In `netlify.toml`, in the `[[redirects]]` block (which must stay above `[[headers]]`), after the `/stops/*` rule:

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

- [ ] **Step 5: Move the page directories**

```bash
git mv app/terms app/felhasznalasi-feltetelek
git mv app/privacy app/adatvedelem
```

In `app/felhasznalasi-feltetelek/page.tsx`, set (the `en` key points at the page Task C16 creates — a string is fine now, the file exists by branch end):
```ts
  alternates: {
    canonical: "/felhasznalasi-feltetelek/",
    languages: {
      hu: "/felhasznalasi-feltetelek/",
      ro: "/ro/termeni/",
      en: "/en/terms/",
      "x-default": "/felhasznalasi-feltetelek/",
    },
  },
```
In `app/adatvedelem/page.tsx`, set:
```ts
  alternates: {
    canonical: "/adatvedelem/",
    languages: {
      hu: "/adatvedelem/",
      ro: "/ro/confidentialitate/",
      en: "/en/privacy/",
      "x-default": "/adatvedelem/",
    },
  },
```

- [ ] **Step 6: Update the RO twins' `huPath`**

`app/ro/termeni/page.tsx`: `huPath: "/felhasznalasi-feltetelek/"` (and the leading doc-comment).
`app/ro/confidentialitate/page.tsx`: `huPath: "/adatvedelem/"` (and the doc-comment).

- [ ] **Step 7: Update `lib/seo/urls.ts`**

In the `STATIC` array:
```ts
  { hu: "/felhasznalasi-feltetelek/", ro: "/ro/termeni/", priority: 0.4 },
  { hu: "/adatvedelem/", ro: "/ro/confidentialitate/", priority: 0.4 },
```

- [ ] **Step 8: Update `scripts/verify-seo.mjs`**

In the `EXEMPT` set replace `"/terms/"` → `"/felhasznalasi-feltetelek/"` and `"/privacy/"` → `"/adatvedelem/"`. Update the comment block above it to name the new slugs.

- [ ] **Step 9: Update the component links**

- `components/planner/Planner.tsx`: `contentHref("/terms/", "/ro/termeni/")` → `contentHref("/felhasznalasi-feltetelek/", "/ro/termeni/")`; `contentHref("/privacy/", "/ro/confidentialitate/")` → `contentHref("/adatvedelem/", "/ro/confidentialitate/")`.
- `components/seo/HomeFooter.tsx`: `["/terms/", "Felhasználási feltételek"]` → `["/felhasznalasi-feltetelek/", "Felhasználási feltételek"]`; `["/privacy/", "Adatkezelési tájékoztató"]` → `["/adatvedelem/", "Adatkezelési tájékoztató"]`.
- `components/analytics/Analytics.tsx`: `href="/privacy/"` → `href="/adatvedelem/"`; `href="/terms/"` → `href="/felhasznalasi-feltetelek/"`.
- `components/legal/LegalPage.tsx`: `<Link href="/privacy/">` → `<Link href="/adatvedelem/">`; `<Link href="/terms/">` → `<Link href="/felhasznalasi-feltetelek/">`; fix the doc-comment mentioning `/terms/` and `/privacy/`.

- [ ] **Step 10: Update the test expectations**

For every non-redirect test found in Step 1 that asserts `/terms/` or `/privacy/`, change the expected string to the new slug. Do NOT weaken any assertion — just rename. (Likely: `HomeFooter.test.tsx`, `Planner.test.tsx`, `LegalPage.test.tsx`; check `urls.test.ts`, `sitemap.test.ts`, `homepage-head.test.ts`, `metadata.test.ts`.)

- [ ] **Step 11: Run the suite**

Run: `npm test`
Expected: all green.

- [ ] **Step 12: Build + local redirect check**

Run: `npm run build`
Expected: `verify-seo … all green`; `out/felhasznalasi-feltetelek/index.html` and `out/adatvedelem/index.html` exist; `out/terms/` and `out/privacy/` do not.

Run: `npx serve out -l 3000` in one shell, then in another: `curl -sI http://localhost:3000/felhasznalasi-feltetelek/ | head -1` → `200`. (The 301 itself only fires under `npm run preview:netlify`; that is checked in Task C17.)

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "Rename the legal pages to Hungarian slugs with 301 redirects"
```

---

## Phase C

### Task C1: `SeoLang` becomes three-valued; `pickName` helper

**Files:**
- Create: `lib/seo/lang.ts`
- Create: `lib/seo/lang.test.ts`
- Modify: `lib/seo/lines.ts`
- Modify: `lib/seo/lines.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // lib/seo/lang.ts
  export type SeoLang = "hu" | "ro" | "en";
  export const SEO_LANGS: readonly SeoLang[] = ["hu", "ro", "en"];
  /** Feed name objects carry hu + ro only; English reuses the Hungarian name
   *  (stop / street names are proper nouns). */
  export function pickName(names: { hu: string; ro: string }, lang: SeoLang): string;
  ```
- `lib/seo/lines.ts` re-exports `SeoLang` (`export type { SeoLang } from "./lang";`) so existing `import … from "@/lib/seo/lines"` keeps working. `lineLabel(id, "en")` → `` `line ${id}` `` (id keeps case: `1D` → `line 1D`). `enrichLine`/`lineDirections` read stop names via `pickName`.

- [ ] **Step 1: Write `lib/seo/lang.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { pickName, SEO_LANGS } from "./lang";

describe("pickName", () => {
  const n = { hu: "Vasútállomás", ro: "Gara" };
  it("returns the language's own name for hu and ro", () => {
    expect(pickName(n, "hu")).toBe("Vasútállomás");
    expect(pickName(n, "ro")).toBe("Gara");
  });
  it("falls back to the Hungarian name for en", () => {
    expect(pickName(n, "en")).toBe("Vasútállomás");
  });
});

describe("SEO_LANGS", () => {
  it("is hu, ro, en in that order", () => {
    expect([...SEO_LANGS]).toEqual(["hu", "ro", "en"]);
  });
});
```

- [ ] **Step 2: Add an en line-label test to `lib/seo/lines.test.ts`**

```ts
it("labels a line in English as 'line {id}', id case kept", () => {
  const net = loadNetwork();
  expect(enrichLine(net, "1", "en").label).toBe("line 1");
  const d = net.lines.find((l) => l.id.endsWith("D"));
  if (d) expect(enrichLine(net, d.id, "en").label).toBe(`line ${d.id}`);
});
```
(Match the file's existing import of `loadNetwork` / `enrichLine`.)

- [ ] **Step 3: Run, confirm failure**

Run: `npm test -- --run lib/seo/lang.test.ts lib/seo/lines.test.ts`
Expected: `lang.test.ts` fails (module missing); the new `lines` test fails to type-check / returns `"1-es busz"`-shaped fallback.

- [ ] **Step 4: Create `lib/seo/lang.ts`**

```ts
/** The languages the SEO surface is generated in. Hungarian is canonical and
 *  the hreflang x-default; Romanian and English are additive. */
export type SeoLang = "hu" | "ro" | "en";

export const SEO_LANGS: readonly SeoLang[] = ["hu", "ro", "en"];

/** Resolve a feed name object for a language. The feed carries `{ hu, ro }`
 *  only — every stop, street and headsign name. English reuses the Hungarian
 *  form: these are proper nouns, and the town's names are Hungarian first. */
export function pickName(names: { hu: string; ro: string }, lang: SeoLang): string {
  return lang === "ro" ? names.ro : names.hu;
}
```

- [ ] **Step 5: Update `lib/seo/lines.ts`**

- Replace `export type SeoLang = "hu" | "ro";` (and its comment) with `export type { SeoLang } from "./lang";` and `import type { SeoLang } from "./lang";` (a value import of `pickName` too).
- `lineLabel`:
  ```ts
  function lineLabel(id: string, lang: SeoLang): string {
    if (lang === "hu") return huLabel(id);
    if (lang === "ro") return `linia ${id}`;
    return `line ${id}`;
  }
  ```
- In `enrichLine`, the `nameOf` helper:
  ```ts
  const nameOf = (stopId: string | undefined): string => {
    const s = net.stops.find((st) => st.id === stopId);
    return s ? pickName(s.name, lang) : stopId ?? "";
  };
  ```
- `lineDirections` builds `headsign: { hu, ro }` from `p.headsign` — leave the object shape as `{ hu, ro }` (callers that render it will use `pickName` from C9+). No change needed here beyond the type widening compiling.

- [ ] **Step 6: Run, confirm pass**

Run: `npm test -- --run lib/seo/lang.test.ts lib/seo/lines.test.ts`
Expected: PASS.

- [ ] **Step 7: Full suite + typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: green. (Widening `SeoLang` is a superset; existing `lang === "hu" ? a : b` branches still type-check because `b` now covers `ro | en`. If `tsc` flags a `Record<SeoLang, …>` literal somewhere in `lib/seo`, that file is in a later task — note it and move on only if the file is genuinely later; otherwise fix here.)

- [ ] **Step 8: Commit**

```bash
git add lib/seo/lang.ts lib/seo/lang.test.ts lib/seo/lines.ts lib/seo/lines.test.ts
git commit -m "Add English as a third SeoLang with a pickName fallback"
```

### Task C2: `pageMetadata` four-key hreflang; `websiteLd` English

**Files:**
- Modify: `lib/seo/metadata.ts`
- Modify: `lib/seo/jsonld.ts`
- Modify: `lib/seo/metadata.test.ts`

**Interfaces:**
- Consumes: `SeoLang` from `lib/seo/lang.ts`.
- Produces:
  ```ts
  export function pageMetadata(input: {
    huPath: string;
    roPath: string;
    enPath?: string;          // NEW — omit to keep the 3-key languages map
    lang: SeoLang;
    title: string;
    description: string;
    ogPath?: string;
    ownOgImage?: boolean;
  }): Metadata;
  ```
  When `enPath` is given, `alternates.languages` is `{ hu, ro, en, "x-default": hu }` and `selfUrl` picks by three-way `lang`. When omitted, behaviour is exactly as today (`{ hu, ro, "x-default": hu }`), and `lang` must be `"hu" | "ro"`. `openGraph.locale`: `hu_HU` / `ro_RO` / `en_US`.
  `websiteLd(lang: SeoLang)` → `url` is `${SITE}/` (hu), `${SITE}/ro/` (ro), `${SITE}/en/` (en); `inLanguage: lang`.

- [ ] **Step 1: Add failing tests to `lib/seo/metadata.test.ts`**

```ts
it("emits a four-key hreflang map when enPath is given, x-default → Hungarian", () => {
  const m = pageMetadata({
    huPath: "/vonalak/1/", roPath: "/ro/linii/1/", enPath: "/en/lines/1/",
    lang: "en", title: "Line 1 – bus schedule Sfântu Gheorghe", description: "…",
  });
  expect(m.alternates?.canonical).toBe("https://sepsimenetrend.ro/en/lines/1/");
  expect(m.alternates?.languages?.hu).toBe("https://sepsimenetrend.ro/vonalak/1/");
  expect(m.alternates?.languages?.ro).toBe("https://sepsimenetrend.ro/ro/linii/1/");
  expect(m.alternates?.languages?.en).toBe("https://sepsimenetrend.ro/en/lines/1/");
  expect(m.alternates?.languages?.["x-default"]).toBe("https://sepsimenetrend.ro/vonalak/1/");
  expect(rec(m.openGraph).locale).toBe("en_US");
  expect(rec(m.openGraph).url).toBe("https://sepsimenetrend.ro/en/lines/1/");
});

it("keeps the three-key map when enPath is omitted", () => {
  const m = pageMetadata({
    huPath: "/vonalak/1/", roPath: "/ro/linii/1/", lang: "hu", title: "x", description: "…",
  });
  expect(m.alternates?.languages && Object.keys(m.alternates.languages).sort())
    .toEqual(["hu", "ro", "x-default"]);
});
```

Add to the `websiteLd` describe block (or wherever it is tested):
```ts
it("roots the English WebSite node at /en/", () => {
  const w = websiteLd("en") as Record<string, unknown>;
  expect(w.url).toBe("https://sepsimenetrend.ro/en/");
  expect(w.inLanguage).toBe("en");
});
```

- [ ] **Step 2: Run, confirm failure**

Run: `npm test -- --run lib/seo/metadata.test.ts`
Expected: FAIL.

- [ ] **Step 3: Update `lib/seo/metadata.ts`**

```ts
import type { SeoLang } from "./lang";

const LOCALE: Record<SeoLang, string> = { hu: "hu_HU", ro: "ro_RO", en: "en_US" };

export function pageMetadata(input: {
  huPath: string;
  roPath: string;
  enPath?: string;
  lang: SeoLang;
  title: string;
  description: string;
  ogPath?: string;
  ownOgImage?: boolean;
}): Metadata {
  const { huPath, roPath, enPath, lang, title, description, ogPath, ownOgImage } = input;
  const huUrl = abs(huPath);
  const roUrl = abs(roPath);
  const enUrl = enPath ? abs(enPath) : undefined;
  const selfUrl = lang === "hu" ? huUrl : lang === "ro" ? roUrl : (enUrl ?? huUrl);

  const languages: Record<string, string> = { hu: huUrl, ro: roUrl, "x-default": huUrl };
  if (enUrl) languages.en = enUrl;

  const ogImage = ogPath
    ? /^https?:\/\//.test(ogPath) ? ogPath : abs(ogPath)
    : abs("/og.png");

  return {
    title: { absolute: title },
    description,
    authors: [{ name: "Sepsi Menetrend" }],
    publisher: "Sepsi Menetrend",
    alternates: { canonical: selfUrl, languages },
    openGraph: {
      type: "website",
      siteName: "Sepsi Menetrend",
      locale: LOCALE[lang],
      url: selfUrl,
      title,
      description,
      ...(ownOgImage ? {} : { images: [ogImage] }),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(ownOgImage ? {} : { images: [ogImage] }),
    },
  };
}
```

- [ ] **Step 4: Update `lib/seo/jsonld.ts`**

```ts
import type { SeoLang } from "./lang";

export function websiteLd(lang: SeoLang): object {
  const home = lang === "hu" ? `${SITE}/` : lang === "ro" ? `${SITE}/ro/` : `${SITE}/en/`;
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Sepsi Menetrend",
    url: home,
    inLanguage: lang,
  };
}
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npm test -- --run lib/seo/metadata.test.ts && npx tsc --noEmit`
Expected: PASS. Existing `pageMetadata` callers still compile (they don't pass `enPath`; `lang` is still `"hu" | "ro"` there).

- [ ] **Step 6: Full suite**

Run: `npm test`
Expected: green.

- [ ] **Step 7: Commit**

```bash
git add lib/seo/metadata.ts lib/seo/jsonld.ts lib/seo/metadata.test.ts
git commit -m "Let pageMetadata emit a four-key hreflang map for the English tree"
```

### Task C3: `PageEntry.en` and `allPages()`

**Files:**
- Modify: `lib/seo/urls.ts`
- Modify: `lib/seo/urls.test.ts`

**Interfaces:**
- Consumes: `buildPlaces().slug` (HU slug), `notablePairs().slug` (HU pair slug), `net.lines[].id`.
- Produces: `PageEntry` gains `en: string`. Category segments: `/en/lines/`, `/en/lines/{id}/`, `/en/stops/`, `/en/stops/{huSlug}/`, `/en/routes/`, `/en/routes/{huPair}/`, `/en/fares/`, `/en/multi-trans/`, `/en/sepsibike/`, `/en/bus-schedule/`, `/en/faq/`, `/en/terms/`, `/en/privacy/`, and `/en/` for the planner.

- [ ] **Step 1: Add failing tests to `lib/seo/urls.test.ts`**

```ts
it("gives every page a non-empty English URL under /en/", () => {
  for (const e of allPages()) {
    expect(e.en.startsWith("/en/") || e.en === "/en/").toBe(true);
  }
});

it("uses the Hungarian slug for English place and route URLs", () => {
  const pages = allPages();
  const aPlace = pages.find((e) => e.hu.startsWith("/megallok/"))!;
  expect(aPlace.en).toBe(`/en/stops/${aPlace.hu.slice("/megallok/".length)}`);
  const aRoute = pages.find((e) => e.hu.startsWith("/utvonal/"))!;
  expect(aRoute.en).toBe(`/en/routes/${aRoute.hu.slice("/utvonal/".length)}`);
});

it("maps the static pages to their English category slugs", () => {
  const by = (hu: string) => allPages().find((e) => e.hu === hu)!;
  expect(by("/").en).toBe("/en/");
  expect(by("/buszmenetrend/").en).toBe("/en/bus-schedule/");
  expect(by("/vonalak/").en).toBe("/en/lines/");
  expect(by("/megallok/").en).toBe("/en/stops/");
  expect(by("/utvonal/").en).toBe("/en/routes/");
  expect(by("/dijszabas/").en).toBe("/en/fares/");
  expect(by("/gyik/").en).toBe("/en/faq/");
  expect(by("/felhasznalasi-feltetelek/").en).toBe("/en/terms/");
  expect(by("/adatvedelem/").en).toBe("/en/privacy/");
});
```

- [ ] **Step 2: Run, confirm failure**

Run: `npm test -- --run lib/seo/urls.test.ts`
Expected: FAIL — `e.en` undefined.

- [ ] **Step 3: Update `lib/seo/urls.ts`**

- `PageEntry` gains `en: string;`.
- `STATIC` entries each gain `en` (keep the array element type inline):
  ```ts
  const STATIC: readonly { hu: string; ro: string; en: string; priority: number }[] = [
    { hu: "/", ro: "/ro/", en: "/en/", priority: 1.0 },
    { hu: "/buszmenetrend/", ro: "/ro/orar-autobuz/", en: "/en/bus-schedule/", priority: 0.8 },
    { hu: "/vonalak/", ro: "/ro/linii/", en: "/en/lines/", priority: 0.8 },
    { hu: "/megallok/", ro: "/ro/statii/", en: "/en/stops/", priority: 0.7 },
    { hu: "/utvonal/", ro: "/ro/trasee/", en: "/en/routes/", priority: 0.7 },
    { hu: "/dijszabas/", ro: "/ro/tarife/", en: "/en/fares/", priority: 0.7 },
    { hu: "/multi-trans/", ro: "/ro/multi-trans/", en: "/en/multi-trans/", priority: 0.7 },
    { hu: "/sepsibike/", ro: "/ro/sepsibike/", en: "/en/sepsibike/", priority: 0.6 },
    { hu: "/gyik/", ro: "/ro/intrebari-frecvente/", en: "/en/faq/", priority: 0.6 },
    { hu: "/felhasznalasi-feltetelek/", ro: "/ro/termeni/", en: "/en/terms/", priority: 0.4 },
    { hu: "/adatvedelem/", ro: "/ro/confidentialitate/", en: "/en/privacy/", priority: 0.4 },
  ];
  ```
- `allPages()`: the `entry` helper takes `en`:
  ```ts
  const entry = (hu: string, ro: string, en: string, priority: number): PageEntry => ({
    path: hu, hu, ro, en, lastModified, priority,
  });
  return [
    ...STATIC.map((s) => entry(s.hu, s.ro, s.en, s.priority)),
    ...net.lines.map((l) => entry(`/vonalak/${l.id}/`, `/ro/linii/${l.id}/`, `/en/lines/${l.id}/`, 0.7)),
    ...buildPlaces(net).map((p) =>
      entry(`/megallok/${p.slug}/`, `/ro/statii/${p.slugRo}/`, `/en/stops/${p.slug}/`, 0.6)),
    ...notablePairs(net).map((r) =>
      entry(`/utvonal/${r.slug}/`, `/ro/trasee/${r.slugRo}/`, `/en/routes/${r.slug}/`, 0.5)),
  ];
  ```

- [ ] **Step 4: Run tests**

Run: `npm test -- --run lib/seo/urls.test.ts lib/seo/sitemap.test.ts`
Expected: `urls` PASS. `sitemap.test.ts` may fail (it renders `allPages`) — if it asserts a fixed `<loc>` count or shape, leave it failing and note it for Task C17 (sitemap task), OR if the failure is only a missing-field type error, it will surface in `tsc` in Task C17. Do not touch `sitemap.ts` here.

- [ ] **Step 5: Commit**

```bash
git add lib/seo/urls.ts lib/seo/urls.test.ts
git commit -m "Add the English URL to every page-inventory entry"
```

### Task C4: English guide prose (`content.en.ts`)

**Files:**
- Create: `lib/seo/content.en.ts`
- Modify: `lib/seo/content.ts`
- Modify: `lib/seo/content.test.ts`
- Reference: `lib/seo/content.hu.ts`, `lib/seo/content.ro.ts` (structure + facts)

**Interfaces:**
- Produces: `EN: Record<GuideKey, GuideCopy>` from `content.en.ts`. `content.ts`: `GuidePage` fields become `{ hu, ro, en }`; `GUIDES[key]` carries `.slug.en`, `.title.en`, `.description.en`, `.body.en`, and `.faq.en` for the `faq` guide. `zip()` throws if `faq` is present in one or two languages but not all three.
- EN guide slugs (bare segment, matching the URL map): `pillar` → `"bus-schedule"`, `fares` → `"fares"`, `multiTrans` → `"multi-trans"`, `bike` → `"sepsibike"`, `faq` → `"faq"`.

- [ ] **Step 1: Add failing tests to `lib/seo/content.test.ts`**

```ts
import { GUIDES } from "./content";
import { EN } from "./content.en";

describe("English guide copy", () => {
  it("has all five guides with non-empty English title, description and body", () => {
    for (const key of ["fares", "multiTrans", "bike", "pillar", "faq"] as const) {
      const g = GUIDES[key];
      expect(g.title.en.length).toBeGreaterThan(0);
      expect(g.description.en.length).toBeGreaterThan(0);
      expect(g.body.en.length).toBeGreaterThan(0);
    }
  });
  it("carries an English FAQ list on the faq guide, same length as HU", () => {
    expect(GUIDES.faq.faq?.en.length).toBe(GUIDES.faq.faq?.hu.length);
  });
  it("uses the English category slugs", () => {
    expect(EN.pillar.slug).toBe("bus-schedule");
    expect(EN.faq.slug).toBe("faq");
    expect(EN.fares.slug).toBe("fares");
  });
});
```

- [ ] **Step 2: Run, confirm failure**

Run: `npm test -- --run lib/seo/content.test.ts`
Expected: FAIL — `content.en` missing, `GUIDES[key].title.en` undefined.

- [ ] **Step 3: Create `lib/seo/content.en.ts`**

Mirror `content.hu.ts` field for field. English prose, same facts (pinned in Global Constraints). City = "Sfântu Gheorghe". Keep every guide's `body` block sequence parallel to HU (same `h2` topics, same `ul` where HU has one). Full file:

```ts
/** English prose for the guide pages. Additive: Hungarian is the site's
 *  canonical language. Facts are pinned by the task brief and fares.json:
 *  city ticket 2.5 lei / 50 min via 24pay, Arcuș (line 10) 4 lei / 60 min,
 *  free on Fridays per Multi-Trans. Prices are quoted "per multitrans.ro". */
import type { GuideCopy, GuideKey } from "./content";

const LINES_EN: string[] = [
  "1 · Szemerja terminus – Railway Station",
  "1D · Szemerja terminus – Multi-Trans",
  "2 · County Hospital – Railway Station",
  "2D · Multi-Trans – Bartók Béla street",
  "3 · Cigaretta street 1 – Szotyor 2",
  "4 · Cigaretta street 1 – Multi-Trans",
  "5 · Dózsa György street – Sepsi Arena",
  "5D · József Attila street 2 – Multi-Trans",
  "6 · Sepsi Arena – Bartók Béla street",
  "7 · Szemerja terminus – Railway Station",
  "9 · Șugaș Băi – Railway Station",
  "10 · Arcuș centre – Casa cu Arcade",
];

export const EN: Record<GuideKey, GuideCopy> = {
  pillar: {
    slug: "bus-schedule",
    title: "Sfântu Gheorghe bus schedule – Multi-Trans routes",
    description:
      "An overview of the Sfântu Gheorghe city bus network: the twelve Multi-Trans routes with their termini, ticket prices, the Arcuș zone and the free Friday travel.",
    body: [
      { h2: "What is this page?" },
      { p: "This page is a complete overview of the Sfântu Gheorghe bus schedule. It is an independent project that rebuilds the timetable published on multitrans.ro into a searchable, map-based, route-planning form. It is not the official Multi-Trans site." },
      { h2: "Multi-Trans and the city bus network" },
      { p: "The city bus network of Sfântu Gheorghe (Sepsiszentgyörgy, Covasna County) is operated by Multi-Trans S.A. The company runs twelve city routes in and around the town, including one to the neighbouring village of Arcuș. The Multi-Trans timetable is available here by route and by stop." },
      { h2: "Routes and termini" },
      { p: "The twelve routes and the two end points of the main direction. The \"D\" services are supplementary departures the operator numbers separately." },
      { ul: LINES_EN },
      { h2: "Tickets and the Arcuș zone" },
      { p: "The city ticket is 2.5 lei per multitrans.ro, valid for 50 minutes from boarding, transfers included. Buy it in the 24pay mobile app. Route 10 crosses into Arcuș, a separate commune and a separate fare zone: that ticket is 4 lei and valid for 60 minutes." },
      { h2: "Free Fridays" },
      { p: "Per Multi-Trans, city bus travel is free on Fridays on every route, the Arcuș service included; the Sfântu Gheorghe municipality funds it. This is a recurring arrangement, not a permanent guarantee, so it is worth checking the Multi-Trans Facebook page from time to time." },
      { h2: "Timetable by route and by stop" },
      { p: "The detailed timetable is on each route's and each stop's page. Times marked with an asterisk are interpolated from the neighbouring stops — the operator only publishes departures from the termini and a few main stops." },
    ],
  },

  fares: {
    slug: "fares",
    title: "Ticket prices and how to pay on the Sfântu Gheorghe buses",
    description:
      "How much a city bus ticket costs in Sfântu Gheorghe, how to buy one with the 24pay app, and when travel is free.",
    body: [
      { h2: "The city ticket" },
      { p: "The city bus ticket is 2.5 lei per multitrans.ro. It is valid for 50 minutes from boarding, and you can transfer within that time. The validity is stated by the operator; the price is taken from the multitrans.ro fares page." },
      { h2: "How do I buy a ticket?" },
      { p: "Buy the city ticket in the 24pay mobile app." },
      { ul: [
        "Install the 24pay app and add a bank card.",
        "Select Sfântu Gheorghe and the city bus ticket.",
        "Activate the ticket as you board; its validity starts then.",
      ] },
      { h2: "The Arcuș service (route 10)" },
      { p: "Arcuș is a separate commune, so route 10 crosses a fare boundary. The Arcuș ticket is 4 lei per multitrans.ro and valid for 60 minutes." },
      { h2: "Free Fridays" },
      { p: "Per Multi-Trans, travel is free on Fridays on every city route, the Arcuș service included. The municipality funds it. It is a recurring arrangement, not a permanent guarantee — worth checking the Multi-Trans Facebook page before you travel." },
      { h2: "How accurate are the prices?" },
      { p: "Prices come from the multitrans.ro fares page and may be out of date. The validity windows (50 and 60 minutes) are the operator's. You see the exact current price in the 24pay app before you buy." },
    ],
  },

  multiTrans: {
    slug: "multi-trans",
    title: "Multi-Trans S.A., the Sfântu Gheorghe bus operator",
    description:
      "Who operates the Sfântu Gheorghe city buses, where the official timetable is, and how it relates to this unofficial site.",
    body: [
      { h2: "The operator" },
      { p: "The Sfântu Gheorghe city bus network is operated by Multi-Trans S.A. Its official site is multitrans.ro, where timetables and official notices are published." },
      { h2: "The routes" },
      { p: "Multi-Trans runs twelve city routes in Sfântu Gheorghe. Route 10 crosses into Arcuș, a separate commune and a separate fare zone. The full route list with termini is on the schedule overview page." },
      { h2: "This site is not official" },
      { p: "This website is an independent project. It processes the timetable published on multitrans.ro and rebuilds it in a searchable, route-planning form. It is not official: it is not affiliated with Multi-Trans S.A., and the company has not endorsed it." },
      { h2: "Why it was built" },
      { p: "The official timetable is available as PDFs and on stop signs. This site makes it machine-searchable and adds a map and a route planner. The data still comes from Multi-Trans." },
      { h2: "Where do I find official information?" },
      { p: "Check prices, timetable changes and official news on multitrans.ro and the Multi-Trans Facebook page. In case of a discrepancy, the operator's notice prevails." },
    ],
  },

  bike: {
    slug: "sepsibike",
    title: "SepsiBike – bike sharing in Sfântu Gheorghe",
    description:
      "How SepsiBike bike sharing works, what it costs, how long it is free, and when you can pick up and drop off a bike.",
    body: [
      { h2: "What is SepsiBike?" },
      { p: "SepsiBike is Sfântu Gheorghe's public bike-sharing system, run together with GloBikes. You borrow a bike from a dock and return it at any other dock." },
      { h2: "Registration" },
      { p: "You need a SepsiBike / GloBikes account. Registration and unlocking a bike happen in the provider's app." },
      { h2: "What does it cost?" },
      { p: "The first 0–30 minutes are free. Longer rentals are charged; you see the current rates in the SepsiBike app. The charge is for the time between unlocking and returning the bike — walking to the dock does not count." },
      { h2: "When can I pick up a bike?" },
      { p: "Bikes can be picked up between 06:00 and 22:00. After 22:00 you can only return one." },
      { h2: "SepsiBike together with the bus" },
      { p: "The route planner may suggest a SepsiBike leg alongside the bus when it is faster. You can turn this on and off in the planner's settings." },
    ],
  },

  faq: {
    slug: "faq",
    title: "Frequently asked questions about the Sfântu Gheorghe buses",
    description:
      "Answers to the most common questions: ticket prices, free Fridays, buying a ticket in the 24pay app, night services and the main destinations.",
    body: [
      { h2: "Frequently asked questions about the Sfântu Gheorghe buses" },
      { p: "The answers below cover ticket prices, free Friday travel, buying a ticket and the destinations people search for most." },
      { p: "The answers are based on the multitrans.ro timetable and Multi-Trans's public notices. For official, up-to-date information check multitrans.ro." },
    ],
    faq: [
      { q: "How much is a bus ticket in Sfântu Gheorghe?", a: "The city ticket is 2.5 lei per multitrans.ro, valid for 50 minutes from boarding. On route 10 to Arcuș the ticket is 4 lei and valid for 60 minutes." },
      { q: "How do I buy a bus ticket?", a: "Buy the ticket in the 24pay mobile app. Install the app, add a bank card, select Sfântu Gheorghe, and activate the ticket as you board." },
      { q: "Is the bus free on Fridays?", a: "Per Multi-Trans, travel is free on Fridays on every city route, the Arcuș service included. It is a recurring, municipality-funded arrangement, not a permanent guarantee." },
      { q: "Which bus goes to the railway station?", a: "The Railway Station is a terminus of routes 1, 2, 7 and 9. The exact departure times are on each route's schedule page." },
      { q: "Which bus goes to the County Hospital?", a: "The County Hospital is a terminus of route 2. Departure times are on the route 2 page." },
      { q: "Is there a night service?", a: "There is no separate night service. The last departures are typically in the evening; check the last departure on the route's own page." },
      { q: "Is this the official Multi-Trans site?", a: "No. This is an independent project that rebuilds the timetable published on multitrans.ro. The site is not affiliated with Multi-Trans S.A." },
      { q: "Why is there an asterisk next to some times?", a: "Times marked with an asterisk are interpolated from the neighbouring stops. The operator only publishes departures from the termini and the main stops, not the intermediate ones." },
    ],
  },
};
```

- [ ] **Step 4: Update `lib/seo/content.ts`**

- `import { EN } from "./content.en";`
- `GuidePage` interface: every field becomes `{ hu: X; ro: X; en: X }`; `faq?` becomes `{ hu: Faq[]; ro: Faq[]; en: Faq[] }`.
- `zip(key)`:
  ```ts
  function zip(key: GuideKey): GuidePage {
    const hu = HU[key], ro = RO[key], en = EN[key];
    const page: GuidePage = {
      slug: { hu: hu.slug, ro: ro.slug, en: en.slug },
      title: { hu: hu.title, ro: ro.title, en: en.title },
      description: { hu: hu.description, ro: ro.description, en: en.description },
      body: { hu: hu.body, ro: ro.body, en: en.body },
    };
    const faqs = [hu.faq, ro.faq, en.faq];
    if (faqs.some(Boolean)) {
      if (!faqs.every(Boolean)) throw new Error(`guide "${key}" has FAQ in some languages only`);
      page.faq = { hu: hu.faq!, ro: ro.faq!, en: en.faq! };
    }
    return page;
  }
  ```

- [ ] **Step 5: Run tests**

Run: `npm test -- --run lib/seo/content.test.ts && npx tsc --noEmit`
Expected: content tests PASS. `tsc` will now flag `GuidePageShell.tsx` / `og.tsx` reads of `g.title[lang]` where `lang` could be `"en"` — those are Tasks C6 / C8. If `tsc` errors are ONLY in `og.tsx`, `GuidePageShell.tsx`, note them and continue; if it errors in this task's files, fix here.

- [ ] **Step 6: Commit**

```bash
git add lib/seo/content.ts lib/seo/content.en.ts lib/seo/content.test.ts
git commit -m "Write the English guide prose and make GUIDES three-language"
```

### Task C5: English route journeys and phrasing (`routes.ts`)

**Files:**
- Modify: `lib/seo/routes.ts`
- Modify: `lib/seo/routes.test.ts`

**Interfaces:**
- Consumes: `SeoLang`, `pickName`.
- Produces: `journeyBetween(net, from, to, lang: SeoLang)` and `notablePairs` accept `en`. `RouteLeg.lineLabel` for `en` is `line {id}`; `RouteLeg.fromName` / `toName` via `pickName`. `RoutePair` is unchanged (no `slugEn` — EN routes reuse `slug`). Journey-planning stays language-independent (it already plans with `"hu"` internally in `notablePairs`); only the rendered names/labels differ by `lang`.

- [ ] **Step 1: Add a failing test to `lib/seo/routes.test.ts`**

```ts
it("renders an English route journey with English line labels and Hungarian place names", () => {
  const net = loadNetwork();
  const pair = notablePairs(net)[0];
  const s = journeyBetween(net, pair.a, pair.b, "en") ?? journeyBetween(net, pair.b, pair.a, "en");
  expect(s).toBeTruthy();
  for (const leg of s!.legs) {
    expect(leg.lineLabel).toMatch(/^line /);
    expect(leg.fromName.length).toBeGreaterThan(0);
  }
});
```

- [ ] **Step 2: Run, confirm failure**

Run: `npm test -- --run lib/seo/routes.test.ts`
Expected: FAIL to type-check (`"en"` not assignable) or wrong label.

- [ ] **Step 3: Update `lib/seo/routes.ts`**

- `import type { SeoLang } from "./lang";` (drop the `type SeoLang` re-import from `./lines` if present, or keep — `./lines` re-exports it; either compiles).
- `journeyBetween(net, from, to, lang: SeoLang)`: replace `net.stops.find(...)!.name[lang]` with `pickName(net.stops.find((s) => s.id === id)!.name, lang)`. `enrichLine(net, leg.lineId, lang).label` already returns `line {id}` for `en` after C1.
- `notablePairs` internal `journeyBetween(net, a, b, "hu")` calls stay `"hu"` (they only test connectivity). No `slugEn`.

- [ ] **Step 4: Run tests + full suite**

Run: `npm test -- --run lib/seo/routes.test.ts && npm test`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add lib/seo/routes.ts lib/seo/routes.test.ts
git commit -m "Render route journeys in English"
```

### Task C6: English OG cards (`og.tsx`)

**Files:**
- Modify: `lib/seo/og.tsx`
- Modify: `lib/seo/og.test.ts`, `lib/seo/line-og.test.ts`, `lib/seo/place-og.test.ts`, `lib/seo/route-og.test.ts` (add an `"en"` case to each; keep existing hu/ro cases)

**Interfaces:**
- Consumes: `SeoLang`, `pickName`, `GUIDES[key].title.en`.
- Produces: `OgProps["lang"]: SeoLang`; `TAG.en = "unofficial"`; `lineOg(id, lang: SeoLang)`, `placeOg(slug, lang: SeoLang)`, `routeOg(pairSlug, lang: SeoLang)`, `guideOg(key, lang: SeoLang)` all handle `en`.
  - `lineOg` en: heading `sentenceCase("line 3")` → `"Line 3"`; sub `` `${t0} – ${t1}` `` (termini via `enrichLine(..., "en")`).
  - `placeOg` en: `place` lookup — English uses the **HU** slug, so `const place = buildPlaces(net).find((p) => (lang === "en" ? p.slug : lang === "ro" ? p.slugRo : p.slug) === slug)`; heading `pickName(place.name, "en")`; fallback sub `"bus stop"`.
  - `routeOg` en: `notablePairs(net).find((p) => (lang === "ro" ? p.slugRo : p.slug) === pairSlug)` (en → `p.slug`); heading `` `${pickName(pair.a.name, "en")} → ${pickName(pair.b.name, "en")}` ``; sub `"Sfântu Gheorghe"`.
  - `guideOg` en: heading `GUIDES[key].title.en`; sub `"Sfântu Gheorghe"`.

- [ ] **Step 1: Add failing `"en"` cases to the four OG test files**

Example for `lib/seo/line-og.test.ts` (adapt the others' existing patterns):
```ts
it("renders an English line card", async () => {
  const img = await lineOg("1", "en");
  expect(img.status).toBe(200);
});
```
`route-og.test.ts`:
```ts
it("renders an English route card with a plain arrow heading", async () => {
  const net = loadNetwork();
  const pair = notablePairs(net)[0];
  const img = await routeOg(pair.slug, "en");
  expect(img.status).toBe(200);
});
```
`place-og.test.ts`:
```ts
it("renders an English place card keyed on the Hungarian slug", async () => {
  const net = loadNetwork();
  const p = buildPlaces(net)[0];
  const img = await placeOg(p.slug, "en");
  expect(img.status).toBe(200);
});
```
`og.test.ts` (guide):
```ts
it("renders an English guide card", async () => {
  const img = await guideOg("fares", "en");
  expect(img.status).toBe(200);
});
```

- [ ] **Step 2: Run, confirm failure**

Run: `npm test -- --run lib/seo/og.test.ts lib/seo/line-og.test.ts lib/seo/place-og.test.ts lib/seo/route-og.test.ts`
Expected: FAIL (type errors on `"en"`).

- [ ] **Step 3: Update `lib/seo/og.tsx`**

- `import { pickName } from "./lang"; import type { SeoLang } from "./lang";`
- `OgProps["lang"]` → `SeoLang`.
- `const TAG: Record<SeoLang, string> = { hu: "nem hivatalos", ro: "neoficial", en: "unofficial" };`
- `lineOg(id: string, lang: SeoLang)` — unchanged body except signature (heading already `sentenceCase(line.label)`, which becomes `Line 3` via C1).
- `placeOg(slug: string, lang: SeoLang)`:
  ```ts
  const place = buildPlaces(net).find(
    (p) => (lang === "ro" ? p.slugRo : p.slug) === slug,
  );
  if (!place) throw new Error(`placeOg: no place for ${slug}`);
  // …
  return renderOg({
    kind: "place",
    lang,
    heading: pickName(place.name, lang),
    sub: lineIds.join(" · ")
      || (lang === "hu" ? "buszmegálló" : lang === "ro" ? "stație de autobuz" : "bus stop"),
  });
  ```
- `routeOg(pairSlug: string, lang: SeoLang)`:
  ```ts
  const pair = notablePairs(net).find((p) => (lang === "ro" ? p.slugRo : p.slug) === pairSlug);
  if (!pair) throw new Error(`routeOg: no pair for ${pairSlug} (${lang})`);
  return renderOg({
    kind: "route",
    lang,
    heading: lang === "hu"
      ? `${huRoutePhrase(pair.a, pair.b)} busszal`
      : `${pickName(pair.a.name, lang)} → ${pickName(pair.b.name, lang)}`,
    sub: lang === "hu" ? "Sepsiszentgyörgy" : "Sfântu Gheorghe",
  });
  ```
- `guideOg(key, lang: SeoLang)`:
  ```ts
  return renderOg({
    kind: "guide",
    lang,
    heading: GUIDES[key].title[lang],
    sub: lang === "hu" ? "Sepsiszentgyörgy" : "Sfântu Gheorghe",
  });
  ```

- [ ] **Step 4: Run tests**

Run: `npm test -- --run lib/seo && npx tsc --noEmit`
Expected: OG tests green. Remaining `tsc` errors should now be only in the page-body components + `app/` (later tasks).

- [ ] **Step 5: Commit**

```bash
git add lib/seo/og.tsx lib/seo/og.test.ts lib/seo/line-og.test.ts lib/seo/place-og.test.ts lib/seo/route-og.test.ts
git commit -m "Render the Open Graph share cards in English"
```

### Task C7: `toEnglish` post-build language stamp

**Files:**
- Modify: `lib/seo/localize.ts`
- Modify: `scripts/localize-html.mjs`
- Modify: `lib/seo/localize.test.ts`

**Interfaces:**
- Produces: `toEnglish(html: string): string` — `<html lang="hu"` → `<html lang="en"`, `content="hu_HU"` → `content="en_US"`. Pure and idempotent. `localize-html.mjs` walks `out/en/**` the same way it walks `out/ro/**`.

- [ ] **Step 1: Add failing tests to `lib/seo/localize.test.ts`**

```ts
import { toEnglish } from "./localize";

describe("toEnglish", () => {
  const src = '<html lang="hu" x><meta property="og:locale" content="hu_HU"/>';
  it("stamps lang and locale", () => {
    expect(toEnglish(src)).toBe('<html lang="en" x><meta property="og:locale" content="en_US"/>');
  });
  it("is idempotent", () => {
    expect(toEnglish(toEnglish(src))).toBe(toEnglish(src));
  });
  it("leaves a lang attribute in body text alone", () => {
    expect(toEnglish('<p>lang="hu" is a string</p>')).toBe('<p>lang="hu" is a string</p>');
  });
});
```

- [ ] **Step 2: Run, confirm failure**

Run: `npm test -- --run lib/seo/localize.test.ts`
Expected: FAIL — `toEnglish` missing.

- [ ] **Step 3: Update `lib/seo/localize.ts`**

```ts
/** Post-build language stamp for the Romanian and English route trees. … */
export function toRomanian(html: string): string {
  return html
    .replace(/<html lang="hu"/, '<html lang="ro"')
    .replace('content="hu_HU"', 'content="ro_RO"');
}

export function toEnglish(html: string): string {
  return html
    .replace(/<html lang="hu"/, '<html lang="en"')
    .replace('content="hu_HU"', 'content="en_US"');
}
```

- [ ] **Step 4: Update `scripts/localize-html.mjs`**

```js
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

// keep in sync with lib/seo/localize.ts
const STAMPS = [
  { dir: join("out", "ro"), lang: "ro", locale: "ro_RO" },
  { dir: join("out", "en"), lang: "en", locale: "en_US" },
];

function stamp(html, lang, locale) {
  return html
    .replace(/<html lang="hu"/, `<html lang="${lang}"`)
    .replace('content="hu_HU"', `content="${locale}"`);
}

async function* htmlFiles(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === "ENOENT") return;
    throw err;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* htmlFiles(full);
    else if (entry.name.endsWith(".html")) yield full;
  }
}

let total = 0;
for (const { dir, lang, locale } of STAMPS) {
  let count = 0;
  for await (const file of htmlFiles(dir)) {
    const src = await readFile(file, "utf8");
    const out = stamp(src, lang, locale);
    if (out !== src) { await writeFile(file, out); count += 1; }
  }
  console.log(`  localised ${count} ${lang.toUpperCase()} pages`);
  total += count;
}
```

- [ ] **Step 5: Run tests**

Run: `npm test -- --run lib/seo/localize.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/seo/localize.ts scripts/localize-html.mjs lib/seo/localize.test.ts
git commit -m "Stamp lang=en on the built English pages"
```

### Task C8: English content in `GuidePageShell` + `IndexShell`

**Files:**
- Modify: `components/seo/GuidePageShell.tsx`
- Modify: `components/seo/IndexShell.tsx`
- Modify: `components/seo/GuidePageShell.test.tsx`, `components/seo/index-pages.test.tsx`, `components/seo/route-index.test.tsx`

**Interfaces:**
- Consumes: `SeoLang`, `pickName`, `GUIDES[key].{slug,title,description,body,faq}.en`.
- Produces: `guideMetadata(key, lang: SeoLang)` and `indexMetadata(kind, lang: SeoLang)` accept `en` and pass `enPath` to `pageMetadata`. `GuidePageShell` / `LineIndex` / `StopIndex` / `RouteIndex` render `lang="en"`.
- EN paths (add to each `PATHS` / `HOME` / `INDEX_LINKS` table):
  - `GuidePageShell.PATHS.en`: fares `/en/fares/`, multiTrans `/en/multi-trans/`, bike `/en/sepsibike/`, pillar `/en/bus-schedule/`, faq `/en/faq/`.
  - `IndexShell.PATHS.en`: lines `/en/lines/`, stops `/en/stops/`, routes `/en/routes/`.
  - `HOME.en = { name: "Sepsi Menetrend", path: "/en/" }` in both.
  - `GuidePageShell.LINE_BASE.en = "/en/lines/"`; `INDEX_LINKS.en` = English labels + `/en/…` hrefs (`Stops`, `Routes`, `Fares`, `Multi-Trans`, `SepsiBike`, `FAQ`).
  - `GuidePageShell.CRUMB.en`: fares `Fares`, multiTrans `Multi-Trans`, bike `SepsiBike`, pillar `Bus schedule`, faq `FAQ`.
  - `IndexShell.COPY[kind].en`: `crumb` (`Lines` / `Stops` / `Routes`), `metaTitle`, `metaDescription`, `h1`, `intro` — English, parallel to the HU/RO copy already there.

- [ ] **Step 1: Add failing tests**

`components/seo/GuidePageShell.test.tsx`:
```ts
it("renders the English pillar page with the /en/ twin and English index links", () => {
  render(<GuidePageShell guideKey="pillar" lang="en" />);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/bus schedule/i);
  const links = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
  expect(links).toContain("/en/lines/1/");
  expect(links).toContain("/en/stops/");
});
it("canonicalises the English fares guide to /en/fares/", () => {
  const m = guideMetadata("fares", "en");
  expect(m.alternates?.canonical).toBe("https://sepsimenetrend.ro/en/fares/");
  expect(m.alternates?.languages?.en).toBe("https://sepsimenetrend.ro/en/fares/");
});
```
`components/seo/index-pages.test.tsx` / `route-index.test.tsx`: add an `lang="en"` render for `LineIndex` / `StopIndex` / `RouteIndex` asserting `/en/lines/…`, `/en/stops/…`, `/en/routes/…` hrefs and an English `<h1>`.

- [ ] **Step 2: Run, confirm failure**

Run: `npm test -- --run components/seo/GuidePageShell.test.tsx components/seo/index-pages.test.tsx components/seo/route-index.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Update `GuidePageShell.tsx`**

- `type Lang = SeoLang;` (import from `@/lib/seo/lang`).
- `PATHS`: add `en` to each entry (values above).
- `HOME`: add `en: { name: "Sepsi Menetrend", path: "/en/" }`.
- `CRUMB`: add `en` to each entry (values above).
- `LINE_BASE`: add `en: "/en/lines/"`.
- `INDEX_LINKS`: add `en` array:
  ```ts
  en: [
    { href: "/en/stops/", label: "Stops" },
    { href: "/en/routes/", label: "Routes" },
    { href: "/en/fares/", label: "Fares" },
    { href: "/en/multi-trans/", label: "Multi-Trans" },
    { href: "/en/sepsibike/", label: "SepsiBike" },
    { href: "/en/faq/", label: "FAQ" },
  ],
  ```
- `guideMetadata`:
  ```ts
  export function guideMetadata(key: GuideKey, lang: Lang): Metadata {
    const g = GUIDES[key];
    return pageMetadata({
      huPath: PATHS[key].hu, roPath: PATHS[key].ro, enPath: PATHS[key].en,
      lang, title: g.title[lang], description: g.description[lang], ownOgImage: true,
    });
  }
  ```
- `GuidePageShell` render: `selfPath` / `twinPath` become three-way. Since `PageFrame` is still two-way this task (`twinPath` prop), compute the twin as: from `hu` → `ro`, from `ro` → `hu`, from `en` → `hu` (English's nearest twin link; Task C12 replaces this with the full triple). Use:
  ```ts
  const selfPath = paths[lang];       // paths = PATHS[guideKey]
  const twinPath = lang === "hu" ? paths.ro : paths.hu;
  ```
- `PillarLines` `aria-label`: `lang === "hu" ? "Vonalak" : lang === "ro" ? "Linii" : "Routes"`.
- `<PillarLines>` — the line labels come from `enrichLine(net, l.id, lang)` (already English via C1) and termini via that too. Fine.

- [ ] **Step 4: Update `IndexShell.tsx`**

- `type Lang = SeoLang;`
- `PATHS`: add `en` (`/en/lines/`, `/en/stops/`, `/en/routes/`).
- `HOME`: add `en`.
- `COPY[kind].en` for all three kinds — English strings parallel to the existing HU/RO. Suggested:
  - lines: crumb `Lines`; metaTitle `Sfântu Gheorghe bus routes · Multi-Trans`; metaDescription `All 12 Multi-Trans bus routes in Sfântu Gheorghe in one list: every route with its termini and its own timetable page for the city bus network.`; h1 `Bus routes in Sfântu Gheorghe`; intro `The 12 Multi-Trans city bus routes in Sfântu Gheorghe. Pick a route for its termini, the order of stops and the official departure times.`
  - stops: crumb `Stops`; metaTitle `Bus stops in Sfântu Gheorghe`; metaDescription `All bus stops in Sfântu Gheorghe in alphabetical order: each stop has its own page with the Multi-Trans routes that call there and their departure times.`; h1 `Bus stops in Sfântu Gheorghe`; intro `All bus stops in Sfântu Gheorghe in alphabetical order. Each stop's page shows the routes that call there and the next departures.`
  - routes: crumb `Routes`; metaTitle `Bus routes between places in Sfântu Gheorghe · Multi-Trans`; metaDescription `Bus routes between the main destinations in Sfântu Gheorghe — railway station, county hospital, Sepsi Arena, Autoliv, Arcuș — grouped by origin, each route with its own page.`; h1 `Bus journeys in Sfântu Gheorghe`; intro `By Multi-Trans city bus between the well-known points of Sfântu Gheorghe. Pick an origin, then a destination: each route has its own page with the service, the transfers and the travel time.`
- `indexMetadata`:
  ```ts
  export function indexMetadata(kind: Kind, lang: Lang): Metadata {
    const c = COPY[kind][lang];
    return pageMetadata({
      huPath: PATHS[kind].hu, roPath: PATHS[kind].ro, enPath: PATHS[kind].en,
      lang, title: c.metaTitle, description: c.metaDescription,
    });
  }
  ```
- `Shell`: `selfPath = PATHS[kind][lang]`; `twinPath = lang === "hu" ? PATHS[kind].ro : PATHS[kind].hu`.
- `LineIndex` / `StopIndex` / `RouteIndex`: `base = PATHS.{lines,stops,routes}[lang]`. `StopIndex` slug: `const slug = lang === "ro" ? p.slugRo : p.slug;` (en → HU slug). `RouteIndex` slug: `const slug = lang === "ro" ? pair.slugRo : pair.slug;`. Display names via `pickName(p.name, lang)` / `pickName(pair.a.name, lang)` etc.

- [ ] **Step 5: Run tests + typecheck**

Run: `npm test -- --run components/seo && npx tsc --noEmit`
Expected: the three test files PASS; `PageFrame` still gets a valid two-way `twinPath`.

- [ ] **Step 6: Commit**

```bash
git add components/seo/GuidePageShell.tsx components/seo/IndexShell.tsx components/seo/GuidePageShell.test.tsx components/seo/index-pages.test.tsx components/seo/route-index.test.tsx
git commit -m "Render the guide and index pages in English"
```

### Task C9: English content in `LinePage` (+ `BoardTable`, `StopList`, `RouteShape`)

**Files:**
- Modify: `components/seo/LinePage.tsx`, `components/seo/BoardTable.tsx`, `components/seo/StopList.tsx`, `components/seo/RouteShape.tsx`
- Modify: `components/seo/LinePage.test.tsx`, `components/seo/BoardTable.test.tsx`, `components/seo/StopList.test.tsx`

**Interfaces:**
- Consumes: `SeoLang`, `pickName`.
- Produces: `lineMetadata(id, lang: SeoLang)` accepts `en`, passes `enPath: \`/en/lines/${id}/\``. `LinePage` renders `lang="en"`. `BoardTable`/`StopList` widen `Lang` to `SeoLang`; `BoardTable.T.en = { weekday: "Weekday", weekend: "Weekend", none: "no service" }`; `StopList.BASE.en = "/en/stops/"`. `RouteShape` takes no language — no change beyond it already being lang-free (verify).

- [ ] **Step 1: Add failing tests**

`components/seo/LinePage.test.tsx`:
```ts
it("renders an English line page: English title, English board headings, /en/ hrefs", async () => {
  const el = await LinePage({ lang: "en", id: "1" });
  render(el as React.ReactElement);
  expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/^Line 1/);
  expect(screen.getByText("Weekday")).toBeInTheDocument();
  const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
  expect(hrefs.some((h) => h?.startsWith("/en/stops/"))).toBe(true);
  expect(hrefs).toContain("/?line=1&service=weekday&lang=en");
});
it("canonicalises the English line page to /en/lines/1/", () => {
  const m = lineMetadata("1", "en");
  expect(m.alternates?.canonical).toBe("https://sepsimenetrend.ro/en/lines/1/");
});
```
`components/seo/BoardTable.test.tsx`: add an `lang="en"` render asserting `Weekday` / `Weekend` headings and the `no service` empty state.

- [ ] **Step 2: Run, confirm failure**

Run: `npm test -- --run components/seo/LinePage.test.tsx components/seo/BoardTable.test.tsx components/seo/StopList.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Update `BoardTable.tsx`, `StopList.tsx`, `RouteShape.tsx`**

- `BoardTable.tsx`: `type Lang = SeoLang;` (import from `@/lib/seo/lang`); `T.en = { weekday: "Weekday", weekend: "Weekend", none: "no service" }`.
- `StopList.tsx`: `type Lang = SeoLang;`; `const BASE = { hu: "/megallok/", ro: "/ro/statii/", en: "/en/stops/" } as const;`.
- `RouteShape.tsx`: no `lang` — confirm and leave unchanged.

- [ ] **Step 4: Update `LinePage.tsx`**

- `HOME.en = { name: "Sepsi Menetrend", path: "/en/" }`; `INDEX.en = { name: "Lines", path: "/en/lines/" }`.
- `const enPathFn = (id: string) => \`/en/lines/${id}/\`;`
- `huArticle` / `HU_AZ` — HU only; guard by `lang === "hu"`.
- `lineMetadata`: three-way title/description:
  ```ts
  const { title, description } =
    lang === "hu" ? { /* existing */ }
    : lang === "ro" ? { /* existing */ }
    : {
        title: `Line ${id} – bus schedule Sfântu Gheorghe`,
        description:
          `Official schedule for line ${id} (${a} – ${b}): departure times and stops, `
          + `weekday and weekend. Sfântu Gheorghe, Multi-Trans.`,
      };
  return pageMetadata({
    huPath: huPath(id), roPath: roPath(id), enPath: enPathFn(id),
    lang, title, description, ownOgImage: true,
  });
  ```
  `a`/`b` are `enrichLine(net, id, lang).termini` — already HU-name fallback for en via C1.
- `T.en`:
  ```ts
  en: {
    freeFriday: "City services are free on Fridays (per Multi-Trans announcements).",
    cta: "Open in the planner",
    weekday: "on weekdays",
    weekend: "at weekends",
    span: (svc, first, last) => `First departure ${svc} ${first}, last ${last}.`,
    noWeekend: "No weekend service.",
    headway: (n) => `Roughly every ${n} minutes.`,
    fareLead: "Ticket price",
    fareSource: " (per multitrans.ro)",
  },
  ```
- `fareChip` en: `arcus ? "4 lei / 60 min" : "2.5 lei / 50 min"`.
- `stopEntries`: slug `lang === "ro" ? p?.slugRo : p?.slug` (en → HU slug); name `p ? pickName(p.name, lang) : sid`.
- `intro` en branch:
  ```ts
  return (
    `Line ${id} is one of Multi-Trans's city bus routes in Sfântu Gheorghe, `
    + `running between ${a} and ${b}. It runs more often on weekdays and less at weekends. `
    + `The departure times above are from the official Multi-Trans stop signs; the route planner does the live calculation.`
  );
  ```
- The direction headsign: `dir.headsign[lang]` → `pickName(dir.headsign, lang)` (import `pickName`).
- CTA href: `` `/?line=${id}&service=weekday${lang === "hu" ? "" : `&lang=${lang}`}` `` (so `&lang=ro` and `&lang=en`).
- `<PageFrame … twinPath={lang === "hu" ? roPath(id) : huPath(id)} kind="line">` (two-way still).

- [ ] **Step 5: Run tests + typecheck**

Run: `npm test -- --run components/seo && npx tsc --noEmit`
Expected: green (except still-pending `app/` and `PlacePage`/`RoutePage` which are next).

- [ ] **Step 6: Commit**

```bash
git add components/seo/LinePage.tsx components/seo/BoardTable.tsx components/seo/StopList.tsx components/seo/RouteShape.tsx components/seo/LinePage.test.tsx components/seo/BoardTable.test.tsx components/seo/StopList.test.tsx
git commit -m "Render the line pages in English"
```

### Task C10: English content in `PlacePage`

**Files:**
- Modify: `components/seo/PlacePage.tsx`
- Modify: `components/seo/PlacePage.test.tsx`, `lib/seo/place-params.test.ts` (if it enumerates languages)

**Interfaces:**
- Consumes: `SeoLang`, `pickName`.
- Produces: `placeMetadata(slug, lang: SeoLang)` accepts `en` (slug is the **HU** slug for en), passes `enPath: \`/en/stops/${place.slug}/\``. `PlacePage` renders `lang="en"`.

- [ ] **Step 1: Add failing tests to `components/seo/PlacePage.test.tsx`**

```ts
it("renders an English place page keyed on the Hungarian slug", async () => {
  const net = loadNetwork();
  const p = buildPlaces(net).find((x) => x.slug === "vasutallomas")!;
  const el = await PlacePage({ lang: "en", slug: p.slug });
  render(el as React.ReactElement);
  expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/stop$/i);
  const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
  expect(hrefs.some((h) => h?.startsWith("/en/lines/"))).toBe(true);
  expect(hrefs.some((h) => h === `/?stop=${p.stopIds[0]}&lang=en`)).toBe(true);
});
it("canonicalises the English place page to /en/stops/{huSlug}/", () => {
  const m = placeMetadata("vasutallomas", "en");
  expect(m.alternates?.canonical).toBe("https://sepsimenetrend.ro/en/stops/vasutallomas/");
});
```

- [ ] **Step 2: Run, confirm failure**

Run: `npm test -- --run components/seo/PlacePage.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Update `PlacePage.tsx`**

- `HOME.en = { name: "Sepsi Menetrend", path: "/en/" }`; `INDEX.en = { name: "Stops", path: "/en/stops/" }`.
- `const enPath = (slug: string) => \`/en/stops/${slug}/\`;`
- `lineHref` en → `/en/lines/${id}/`; `placeHref` en → `enPath(p.slug)`.
- `resolvePlace` / body lookup: `(lang === "ro" ? p.slugRo : p.slug) === slug` (en uses HU slug — already the case since only `"ro"` is special).
- `T.en`:
  ```ts
  en: {
    h1: (name) => `${name} stop`,
    lines: "Routes",
    nearby: "Nearby stops",
    minutes: "min",
    approx: "approx.",
    cta: "Open the stop in the planner",
    intro: (name, labels) =>
      `${name} is one of the Multi-Trans bus stops in Sfântu Gheorghe.`
      + (labels ? ` The following routes call here: ${labels}.` : "")
      + " The departure times above are from the official Multi-Trans stop signs"
      + " (multitrans.ro); for live data use the route planner.",
  },
  ```
- `lineSummary` en branch: `` `${head} and ${extra} more routes` ``.
- `headsign(destination, lang)` en: return the HU half — `lang === "ro" ? destination.slice(0, at) : destination.slice(at + 3)`.
- `placeMetadata`: three-way title/description; en:
  ```ts
  {
    title: `${place.name.hu} stop – bus departures`,
    description:
      `${place.name.hu} bus stop in Sfântu Gheorghe: official departure times of the `
      + `Multi-Trans routes (${list}) that call here, weekday and weekend.`,
  }
  ```
  and `pageMetadata({ huPath: huPath(place.slug), roPath: roPath(place.slugRo), enPath: enPath(place.slug), lang, title, description, ownOgImage: true })`.
- Body: `place.name[lang]` → `pickName(place.name, lang)` everywhere (`name` const, nearby names, `enrichLine(...).label` is already en).
- `twinPath = lang === "hu" ? roPath(place.slugRo) : huPath(place.slug)`; `kind="place"`.
- CTA: `` `/?stop=${place.stopIds[0]}${lang === "hu" ? "" : `&lang=${lang}`}` ``.

- [ ] **Step 4: Run tests + typecheck**

Run: `npm test -- --run components/seo && npx tsc --noEmit`
Expected: green (except `RoutePage` + `app/`).

- [ ] **Step 5: Commit**

```bash
git add components/seo/PlacePage.tsx components/seo/PlacePage.test.tsx
git commit -m "Render the stop pages in English"
```

### Task C11: English content in `RoutePage`

**Files:**
- Modify: `components/seo/RoutePage.tsx`
- Modify: `components/seo/RoutePage.test.tsx`, `lib/seo/route-params.test.ts` (if it enumerates languages)

**Interfaces:**
- Consumes: `SeoLang`, `pickName`.
- Produces: `routeMetadata(pairSlug, lang: SeoLang)` accepts `en` (pairSlug is the **HU** slug for en), passes `enPath: \`/en/routes/${pair.slug}/\``. `RoutePage` renders `lang="en"`. English needs no case forms — the phrasing is `from A to B`.

- [ ] **Step 1: Add failing tests to `components/seo/RoutePage.test.tsx`**

```ts
it("renders an English route page with 'from A to B' phrasing and an /en/ CTA", async () => {
  const net = loadNetwork();
  const pair = notablePairs(net)[0];
  const el = await RoutePage({ lang: "en", pair: pair.slug });
  render(el as React.ReactElement);
  const h1 = screen.getByRole("heading", { level: 1 }).textContent!;
  expect(h1.toLowerCase()).toContain("from");
  expect(h1.toLowerCase()).toContain("to");
  const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
  expect(hrefs.some((h) => h?.includes("&lang=en"))).toBe(true);
});
it("canonicalises the English route page to /en/routes/{huSlug}/", () => {
  const net = loadNetwork();
  const pair = notablePairs(net)[0];
  const m = routeMetadata(pair.slug, "en");
  expect(m.alternates?.canonical).toBe(`https://sepsimenetrend.ro/en/routes/${pair.slug}/`);
});
```

- [ ] **Step 2: Run, confirm failure**

Run: `npm test -- --run components/seo/RoutePage.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Update `RoutePage.tsx`**

- `HOME.en = { name: "Sepsi Menetrend", path: "/en/" }`.
- `const enPath = (slug: string) => \`/en/routes/${slug}/\`;`
- `resolvePair(pairSlug, lang)`: `(lang === "ro" ? p.slugRo : p.slug) === pairSlug` (en → HU slug).
- `T.en`:
  ```ts
  en: {
    cta: "Open in the planner",
    faqTitle: "Frequently asked questions",
    intro: (a, b) =>
      `Between ${a} and ${b} in Sfântu Gheorghe, by Multi-Trans city bus — `
      + "services, transfers and travel time.",
    dir: (from, to) => `${from} → ${to}`,
  },
  ```
- `routeTitle` en: `` `from ${pickName(a.name, "en")} to ${pickName(b.name, "en")} by bus` `` (lower-case "from" is fine mid-heading; if a reviewer wants sentence case, `cap()` it — keep it simple: `` `From ${A} to ${B} by bus` `` with `cap` on the whole string is wrong; write `` `Getting from ${A} to ${B} by bus` `` to read naturally with a capital). Use:
  ```ts
  const routeTitle = (a, b, lang) =>
    lang === "hu" ? `${huRoutePhrase(a, b)} busszal`
    : lang === "ro" ? `De la ${a.name.ro} la ${b.name.ro} cu autobuzul`
    : `Getting from ${pickName(a.name, "en")} to ${pickName(b.name, "en")} by bus`;
  ```
- `routeCrumb` en: `` `${pickName(a.name, "en")} → ${pickName(b.name, "en")}` ``.
- `legProse` en:
  ```ts
  `Board line ${idFromLabel} at ${leg.fromName} and ride ${leg.stops} stops (${leg.rideMin} min) to ${leg.toName}.`
  ```
  — but `leg.lineLabel` is already `"line 3"`, so: `` `Board ${leg.lineLabel} at ${leg.fromName} and ride ${leg.stops} stops (${leg.rideMin} min) to ${leg.toName}.` ``. Join with `" Then "`.
- `summaryLine` en:
  ```ts
  const tr = s.transfers === 0 ? "no transfers"
    : `${s.transfers} transfer${s.transfers === 1 ? "" : "s"}`;
  let out = `The trip takes about ${s.totalMin} minutes, ${tr}, ${s.walkMin} minutes of walking.`;
  if (s.firstDep !== null && s.lastDep !== null)
    out += ` First useful departure ${hm(s.firstDep)}, last ${hm(s.lastDep)}.`;
  return out;
  ```
- `faqFor` en:
  ```ts
  const which = lines.length === 1
    ? `${cap(lines[0])} runs on this route.`
    : `${cap(lines[0])}, ${lines.slice(1).join(", ")} (with ${primary.transfers} transfer${primary.transfers === 1 ? "" : "s"}).`;
  return [
    { q: `Which bus goes from ${pickName(A.name, "en")} to ${pickName(B.name, "en")}?`, a: which },
    { q: "How long does the trip take?", a: `About ${primary.totalMin} minutes.` },
    { q: "How much is the ticket?", a: "2.5 lei / 50 min via the 24pay app (per multitrans.ro)." },
  ];
  ```
- `routeMetadata` en:
  ```ts
  {
    title: `Getting from ${pickName(A.name, "en")} to ${pickName(B.name, "en")} by bus – Sfântu Gheorghe`,
    description:
      `How to get from ${pickName(A.name, "en")} to ${pickName(B.name, "en")} by Multi-Trans bus in `
      + "Sfântu Gheorghe: services, transfers, travel time and the first/last departure.",
  }
  ```
  and `pageMetadata({ huPath: huPath(pair.slug), roPath: roPath(pair.slugRo), enPath: enPath(pair.slug), lang, title, description, ownOgImage: true })`.
- Body: `A.name[lang]` / `B.name[lang]` / `from.name[lang]` / `to.name[lang]` → `pickName(...)`.
- `enc(p, lang)` uses `p.name[lang]` → `pickName(p.name, lang)`.
- `ctaHref`: `` `${lang === "hu" ? "" : `&lang=${lang}`}` `` instead of the `ro`-only check.
- `twinPath = lang === "hu" ? roPath(pair.slugRo) : huPath(pair.slug)`; `kind="route"`.

- [ ] **Step 4: Run tests + full typecheck**

Run: `npm test -- --run components/seo && npx tsc --noEmit`
Expected: `components/seo` green. `tsc` errors now only in `app/` (no `app/en/**` yet) — none, actually, since existing `app/**` still pass `"hu"` / `"ro"`. Expect `tsc` fully green.

- [ ] **Step 5: Full suite**

Run: `npm test`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add components/seo/RoutePage.tsx components/seo/RoutePage.test.tsx
git commit -m "Render the route pages in English"
```

### Task C12: Three-segment language switch on `PageFrame`

**Files:**
- Modify: `components/seo/PageFrame.tsx`, `components/seo/PageFrame.module.css` (only if the third segment needs a width tweak)
- Modify: `components/seo/PageFrame.test.tsx`
- Modify: `components/seo/{GuidePageShell,IndexShell,LinePage,PlacePage,RoutePage}.tsx` (pass the path triple)

**Interfaces:**
- Produces: `PageFrame` prop change — `twinPath: string` is replaced by `paths: { hu: string; ro: string; en: string }` (all root-relative, each the real URL of this page in that language). `PageFrame` renders three segments; the current `lang`'s segment is `<span aria-current="true">`, the other two are `<a href={paths[code]} hrefLang={code}>`.
  ```ts
  interface PageFrameProps {
    lang: SeoLang;
    kind: Kind;
    crumbs: { name: string; path: string }[];
    paths: { hu: string; ro: string; en: string };
    children: React.ReactNode;
  }
  ```

- [ ] **Step 1: Update `PageFrame.test.tsx`**

Replace `twinPath="…"` with `paths={{ hu: "/vonalak/1/", ro: "/ro/linii/1/", en: "/en/lines/1/" }}` in every render. Replace the two-language switch test with:
```ts
it("offers all three languages; the current one is current-page text, the others link out", () => {
  render(<PageFrame lang="ro" kind="line"
    paths={{ hu: "/vonalak/1/", ro: "/ro/linii/1/", en: "/en/lines/1/" }} crumbs={crumbs}><p>x</p></PageFrame>);
  expect(screen.getByRole("link", { name: "Magyar" })).toHaveAttribute("href", "/vonalak/1/");
  expect(screen.getByRole("link", { name: "English" })).toHaveAttribute("href", "/en/lines/1/");
  const ro = screen.getByText("Română");
  expect(ro.closest("a")).toBeNull();
  expect(ro).toHaveAttribute("aria-current", "true");
});
```
Keep the "server component" source check and the JSON-LD / breadcrumb / footer / badge tests (just swap the prop).

- [ ] **Step 2: Run, confirm failure**

Run: `npm test -- --run components/seo/PageFrame.test.tsx`
Expected: FAIL (`paths` prop unknown).

- [ ] **Step 3: Update `PageFrame.tsx`**

- `import type { SeoLang } from "@/lib/seo/lang";` — `Lang` local type becomes `SeoLang`.
- Prop: `paths: { hu: string; ro: string; en: string }` instead of `twinPath`.
- `home = crumbs[0]?.path ?? (lang === "hu" ? "/" : lang === "ro" ? "/ro/" : "/en/")`.
- `T` gains an `en` block:
  ```ts
  en: {
    crumbLabel: "Breadcrumb",
    back: "Back to the planner",
    switcherLabel: "Language",
    disclaimer: "Not the official Multi-Trans SA website",
    operator: "The official Multi-Trans site: multitrans.ro",
    pillar: { href: "/en/bus-schedule/", label: "Full bus schedule" },
    planner: { href: "/en/", label: "Route planner" },
  },
  ```
- `KIND_LABEL` gains `en`: line `Route`… wait — collision with `route`. Use: line `Line`, place `Stop`, route `Route`, guide `Guide`, index `Index`.
  ```ts
  const KIND_LABEL: Record<Kind, Record<SeoLang, string>> = {
    line:  { hu: "Vonal",   ro: "Linie",  en: "Line" },
    place: { hu: "Megálló", ro: "Stație", en: "Stop" },
    route: { hu: "Útvonal", ro: "Traseu", en: "Route" },
    guide: { hu: "Útmutató",ro: "Ghid",   en: "Guide" },
    index: { hu: "Jegyzék", ro: "Listă",  en: "Index" },
  };
  ```
- `SWITCH: Record<SeoLang, string> = { hu: "Magyar", ro: "Română", en: "English" }`.
- Segments:
  ```ts
  const segments = (["hu", "ro", "en"] as const).map((code) => ({
    code,
    label: SWITCH[code],
    href: code === lang ? null : paths[code],
  }));
  ```

- [ ] **Step 4: Update the five callers to pass `paths`**

Each already computes `selfPath`/`twinPath` from its `PATHS`/`huPath`/`roPath`/`enPath` helpers. Replace with a `paths` triple of this page's URL in each language:
- `GuidePageShell`: `paths={{ hu: PATHS[guideKey].hu, ro: PATHS[guideKey].ro, en: PATHS[guideKey].en }}`
- `IndexShell` (`Shell`): `paths={{ hu: PATHS[kind].hu, ro: PATHS[kind].ro, en: PATHS[kind].en }}`
- `LinePage`: `paths={{ hu: huPath(id), ro: roPath(id), en: enPathFn(id) }}`
- `PlacePage`: `paths={{ hu: huPath(place.slug), ro: roPath(place.slugRo), en: enPath(place.slug) }}`
- `RoutePage`: `paths={{ hu: huPath(pair.slug), ro: roPath(pair.slugRo), en: enPath(pair.slug) }}`

Remove the now-unused `selfPath`/`twinPath` locals where they were only for `PageFrame` (keep any still used for the breadcrumb's last crumb `path`).

- [ ] **Step 5: Run tests + typecheck**

Run: `npm test -- --run components/seo && npx tsc --noEmit`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add components/seo/
git commit -m "Give the SEO pages a three-language switch"
```

### Task C13: Static `app/en/**` route files (guides + indexes)

**Files (all Create):**
- `app/en/lines/page.tsx`, `app/en/stops/page.tsx`, `app/en/routes/page.tsx`
- `app/en/fares/page.tsx`, `app/en/fares/opengraph-image.ts`
- `app/en/multi-trans/page.tsx`, `app/en/multi-trans/opengraph-image.ts`
- `app/en/sepsibike/page.tsx`, `app/en/sepsibike/opengraph-image.ts`
- `app/en/bus-schedule/page.tsx`, `app/en/bus-schedule/opengraph-image.ts`
- `app/en/faq/page.tsx`, `app/en/faq/opengraph-image.ts`
- Test: `lib/seo/guide-routes.test.ts` (add EN cases)

**Interfaces:**
- Consumes: `GuidePageShell`/`guideMetadata`, `LineIndex`/`StopIndex`/`RouteIndex`/`indexMetadata`, `guideOg` — all `en`-ready after C6/C8.

- [ ] **Step 1: Create the index pages**

`app/en/lines/page.tsx`:
```tsx
import type { Metadata } from "next";
import { LineIndex, indexMetadata } from "@/components/seo/IndexShell";

export function generateMetadata(): Metadata {
  return indexMetadata("lines", "en");
}

export default function Page() {
  return <LineIndex lang="en" />;
}
```
`app/en/stops/page.tsx` — same shape, `StopIndex`, `indexMetadata("stops", "en")`.
`app/en/routes/page.tsx` — same shape, `RouteIndex`, `indexMetadata("routes", "en")`.

- [ ] **Step 2: Create the guide pages**

`app/en/fares/page.tsx`:
```tsx
import type { Metadata } from "next";
import GuidePageShell, { guideMetadata } from "@/components/seo/GuidePageShell";

export function generateMetadata(): Metadata {
  return guideMetadata("fares", "en");
}

export default function Page() {
  return <GuidePageShell guideKey="fares" lang="en" />;
}
```
`app/en/multi-trans/page.tsx` → `guideKey="multiTrans"`.
`app/en/sepsibike/page.tsx` → `guideKey="bike"`.
`app/en/bus-schedule/page.tsx` → `guideKey="pillar"`.
`app/en/faq/page.tsx` → `guideKey="faq"`.

- [ ] **Step 3: Create the guide OG routes**

`app/en/fares/opengraph-image.ts`:
```ts
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-static";

export default async function Image() {
  const { guideOg } = await import("@/lib/seo/og");
  return guideOg("fares", "en");
}
```
`app/en/multi-trans/opengraph-image.ts` → `guideOg("multiTrans", "en")`.
`app/en/sepsibike/opengraph-image.ts` → `guideOg("bike", "en")`.
`app/en/bus-schedule/opengraph-image.ts` → `guideOg("pillar", "en")`.
`app/en/faq/opengraph-image.ts` → `guideOg("faq", "en")`.

- [ ] **Step 4: Add EN cases to `lib/seo/guide-routes.test.ts`**

```ts
import EnFares, { generateMetadata as enFaresMeta } from "@/app/en/fares/page";

it("builds the English fares guide and canonicalises it to its /en/ URL", async () => {
  const el = await (EnFares as () => unknown)();
  expect(el).toBeTruthy();
  const meta = await enFaresMeta();
  expect(meta.alternates?.canonical).toBe("https://sepsimenetrend.ro/en/fares/");
});
```

- [ ] **Step 5: Run tests + build**

Run: `npm test -- --run lib/seo/guide-routes.test.ts && npm run build`
Expected: tests PASS. `verify-seo` may now report orphan / hreflang problems for the new EN pages (its EN awareness is Task C17) — if `verify-seo` fails **only** on EN-page hreflang/orphan/lang complaints, that is expected; note it and continue. If `next build` itself errors (a route file typo, a missing param), fix here.

- [ ] **Step 6: Commit**

```bash
git add app/en/ lib/seo/guide-routes.test.ts
git commit -m "Add the English guide and index routes"
```

### Task C14: Dynamic `app/en/**` route files (lines, stops, routes)

**Files (all Create):**
- `app/en/lines/[id]/page.tsx`, `app/en/lines/[id]/opengraph-image.ts`
- `app/en/stops/[slug]/page.tsx`, `app/en/stops/[slug]/opengraph-image.ts`
- `app/en/routes/[pair]/page.tsx`, `app/en/routes/[pair]/opengraph-image.ts`
- Test: `lib/seo/line-params.test.ts`, `lib/seo/place-params.test.ts`, `lib/seo/route-params.test.ts` (add EN param-set assertions)

**Interfaces:**
- `generateStaticParams`: lines → `net.lines.map((l) => ({ id: l.id }))`; stops → `buildPlaces(net).map((p) => ({ slug: p.slug }))` (**HU** slug); routes → `notablePairs(net).map((p) => ({ pair: p.slug }))` (**HU** slug).

- [ ] **Step 1: Create `app/en/lines/[id]/page.tsx`**

```tsx
import type { Metadata } from "next";
import LinePage, { lineMetadata } from "@/components/seo/LinePage";
import { loadNetwork } from "@/lib/seo/network";

/** Same id set as the Hungarian route — the line id is language-independent. */
export function generateStaticParams() {
  return loadNetwork().lines.map((l) => ({ id: l.id }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
  const { id } = await params;
  return lineMetadata(id, "en");
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LinePage lang="en" id={id} />;
}
```

- [ ] **Step 2: Create `app/en/lines/[id]/opengraph-image.ts`**

```ts
import { OG_SIZE, OG_CONTENT_TYPE } from "@/lib/seo/og";
import { loadNetwork } from "@/lib/seo/network";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const dynamic = "force-static";

export function generateStaticParams() {
  return loadNetwork().lines.map((l) => ({ id: l.id }));
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { lineOg } = await import("@/lib/seo/og");
  return lineOg(id, "en");
}
```

- [ ] **Step 3: Create `app/en/stops/[slug]/page.tsx` + `opengraph-image.ts`**

`page.tsx`:
```tsx
import type { Metadata } from "next";
import PlacePage, { placeMetadata } from "@/components/seo/PlacePage";
import { loadNetwork } from "@/lib/seo/network";
import { buildPlaces } from "@/lib/seo/places";

/** English category path, Hungarian place slug (proper nouns don't translate). */
export function generateStaticParams() {
  return buildPlaces(loadNetwork()).map((p) => ({ slug: p.slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  return placeMetadata(slug, "en");
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PlacePage lang="en" slug={slug} />;
}
```
`opengraph-image.ts`:
```ts
import { loadNetwork } from "@/lib/seo/network";
import { buildPlaces } from "@/lib/seo/places";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-static";

export function generateStaticParams() {
  return buildPlaces(loadNetwork()).map((p) => ({ slug: p.slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { placeOg } = await import("@/lib/seo/og");
  return placeOg(slug, "en");
}
```

- [ ] **Step 4: Create `app/en/routes/[pair]/page.tsx` + `opengraph-image.ts`**

`page.tsx`:
```tsx
import type { Metadata } from "next";
import RoutePage, { routeMetadata } from "@/components/seo/RoutePage";
import { loadNetwork } from "@/lib/seo/network";
import { notablePairs } from "@/lib/seo/routes";

/** English category path, Hungarian pair slug. */
export function generateStaticParams() {
  return notablePairs(loadNetwork()).map((p) => ({ pair: p.slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ pair: string }> },
): Promise<Metadata> {
  const { pair } = await params;
  return routeMetadata(pair, "en");
}

export default async function Page({ params }: { params: Promise<{ pair: string }> }) {
  const { pair } = await params;
  return <RoutePage lang="en" pair={pair} />;
}
```
`opengraph-image.ts`:
```ts
import { loadNetwork } from "@/lib/seo/network";
import { notablePairs } from "@/lib/seo/routes";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-static";

export function generateStaticParams() {
  return notablePairs(loadNetwork()).map((p) => ({ pair: p.slug }));
}

export default async function Image({ params }: { params: Promise<{ pair: string }> }) {
  const { pair } = await params;
  const { routeOg } = await import("@/lib/seo/og");
  return routeOg(pair, "en");
}
```

- [ ] **Step 5: Add EN param assertions**

`lib/seo/line-params.test.ts` — assert `app/en/lines/[id]` `generateStaticParams()` equals the HU set. `lib/seo/place-params.test.ts` — assert `app/en/stops/[slug]` params use `p.slug` (HU), not `p.slugRo`. `lib/seo/route-params.test.ts` — assert `app/en/routes/[pair]` params use `p.slug`.

- [ ] **Step 6: Run tests + build**

Run: `npm test -- --run lib/seo/line-params.test.ts lib/seo/place-params.test.ts lib/seo/route-params.test.ts && npm run build`
Expected: tests PASS; `next build` succeeds and emits `out/en/lines/1/index.html`, `out/en/stops/vasutallomas/index.html`, `out/en/routes/*/index.html`. `verify-seo` still expected to complain about EN hreflang/orphans until C17.

- [ ] **Step 7: Commit**

```bash
git add app/en/ lib/seo/line-params.test.ts lib/seo/place-params.test.ts lib/seo/route-params.test.ts
git commit -m "Add the English line, stop and route routes"
```

### Task C15: English homepage + footer + homepage hreflang

**Files:**
- Create: `app/en/page.tsx`
- Modify: `app/page.tsx`, `app/ro/page.tsx`
- Modify: `components/seo/HomeFooter.tsx`, `components/seo/HomeFooter.module.css` (only if the 3rd link needs it — likely not)
- Modify: `components/seo/HomeFooter.test.tsx`, `lib/seo/homepage-head.test.ts`

**Interfaces:**
- `HomePage({ lang })` — `lang` type widens to `SeoLang` (it only forwards to `Planner` + `HomeFooter`). `HomeFooter` prop `lang: SeoLang`.
- `app/page.tsx` `metadata.alternates.languages` → `{ hu: "/", ro: "/ro/", en: "/en/", "x-default": "/" }`.
- `app/ro/page.tsx` `generateMetadata` → `pageMetadata({ huPath: "/", roPath: "/ro/", enPath: "/en/", lang: "ro", … })`.

- [ ] **Step 1: Add failing tests**

`components/seo/HomeFooter.test.tsx`:
```ts
it("renders the English footer: /en/ links, English disclaimer, three-way language line", () => {
  render(<HomeFooter lang="en" />);
  const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
  expect(hrefs).toContain("/en/bus-schedule/");
  expect(hrefs).toContain("/en/lines/");
  expect(hrefs).not.toContain("/vonalak/");
  expect(screen.getByText(/Not the official Multi-Trans SA website/)).toBeInTheDocument();
  expect(hrefs).toContain("/");     // → Hungarian
  expect(hrefs).toContain("/ro/");  // → Romanian
});
```
`lib/seo/homepage-head.test.ts` — add to the built-HTML assertions:
```ts
expect(html).toContain('<link rel="alternate" hrefLang="en" href="https://sepsimenetrend.ro/en/"/>');
```
and add a symmetrical block reading `out/en/index.html` → `<html lang="en"`, canonical `https://sepsimenetrend.ro/en/`, and the four-key hreflang set.

- [ ] **Step 2: Run, confirm failure**

Run: `npm test -- --run components/seo/HomeFooter.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Update `HomeFooter.tsx`**

Widen `lang` to `SeoLang`; add the `en` branch:
```ts
const links =
  lang === "ro" ? [ /* existing */ ]
  : lang === "en" ? [
      ["/en/bus-schedule/", "Sfântu Gheorghe bus schedule"],
      ["/en/lines/", "Bus routes"],
      ["/en/stops/", "Bus stops"],
      ["/en/routes/", "Routes"],
      ["/en/fares/", "Ticket prices"],
      ["/en/multi-trans/", "About Multi-Trans"],
      ["/en/faq/", "FAQ"],
      ["/en/terms/", "Terms of use"],
      ["/en/privacy/", "Privacy"],
    ]
  : [ /* existing HU */ ];
```
The language line: render both other languages. Replace the single `other` with:
```tsx
{lang !== "hu" && <a href="/">Magyar</a>}
{lang !== "hu" && <span aria-hidden> · </span>}
{lang !== "ro" && <a href="/ro/">Română</a>}
{lang !== "ro" && <span aria-hidden> · </span>}
{lang !== "en" && <a href="/en/">English</a>}
{lang !== "en" && <span aria-hidden> · </span>}
```
Disclaimer: `lang === "ro" ? "Nu este…" : lang === "en" ? "Not the official Multi-Trans SA website." : "Nem a Multi-Trans SA hivatalos oldala."`
`nav aria-label`: `lang === "ro" ? "Pagini" : lang === "en" ? "Pages" : "Oldalak"`.

- [ ] **Step 4: Update `app/page.tsx`, `app/ro/page.tsx`, create `app/en/page.tsx`**

`app/page.tsx`: `HomePage` signature `{ lang }: { lang: SeoLang }`; `metadata.alternates.languages` → `{ hu: "/", ro: "/ro/", en: "/en/", "x-default": "/" }`.
`app/ro/page.tsx`: `pageMetadata({ huPath: "/", roPath: "/ro/", enPath: "/en/", lang: "ro", title: …, description: … })`.
`app/en/page.tsx`:
```tsx
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo/metadata";
import { HomePage } from "../page";

/** The English planner. Same component and data loader as the Hungarian
 *  homepage; only the crawlable <head> and the footer's language differ, and
 *  localize-html.mjs stamps lang="en" onto out/en/index.html. */
export default async function Page() {
  return HomePage({ lang: "en" });
}

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata({
    huPath: "/", roPath: "/ro/", enPath: "/en/", lang: "en",
    title: "Sfântu Gheorghe bus planner · Multi-Trans schedule",
    description:
      "Route planner and bus schedule for Sfântu Gheorghe, based on data published "
      + "by Multi-Trans. Unofficial, free, no account.",
  });
}
```

- [ ] **Step 5: Run tests + build**

Run: `npm test && npm run build`
Expected: unit tests green; `out/en/index.html` present with `lang="en"`. `verify-seo` still expected to flag EN hreflang/orphans until C17.

- [ ] **Step 6: Commit**

```bash
git add app/page.tsx app/ro/page.tsx app/en/page.tsx components/seo/HomeFooter.tsx components/seo/HomeFooter.test.tsx lib/seo/homepage-head.test.ts
git commit -m "Add the English homepage, footer and hreflang"
```

### Task C16: English legal pages

**Files:**
- Modify: `components/legal/LegalPage.tsx`
- Create: `app/en/terms/page.tsx`, `app/en/privacy/page.tsx`
- Modify: `app/ro/termeni/page.tsx`, `app/ro/confidentialitate/page.tsx` (add `enPath` to the `pageMetadata` call — Ruling P1: the legal cluster must carry a consistent four-key hreflang)
- Modify: `components/legal/LegalPage.test.tsx`

**Interfaces:**
- `LegalPage` `forcedLang` prop accepts `"en"`; a third `.seg` button "English"; new `TermsContentEn()` / `PrivacyContentEn()` render functions (same `styles.*` classes and heading structure as the HU/RO versions).
- `app/en/terms/page.tsx` renders `<LegalPage type="terms" lang="en" />` and `generateMetadata` → `pageMetadata({ huPath: "/felhasznalasi-feltetelek/", roPath: "/ro/termeni/", enPath: "/en/terms/", lang: "en", title, description })`. Same for privacy.

- [ ] **Step 1: Add failing tests to `components/legal/LegalPage.test.tsx`**

```ts
it("offers an English toggle and renders English terms text", () => {
  render(<LegalPage type="terms" lang="en" />);
  expect(screen.getByRole("button", { name: "English" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/terms/i);
});
```
`app/en/terms` canonical test (in `lib/seo/guide-routes.test.ts` or a new `lib/seo/legal-routes.test.ts`):
```ts
import { generateMetadata as enTermsMeta } from "@/app/en/terms/page";
it("canonicalises the English terms page to /en/terms/", async () => {
  const m = await enTermsMeta();
  expect(m.alternates?.canonical).toBe("https://sepsimenetrend.ro/en/terms/");
  expect(m.alternates?.languages?.hu).toBe("https://sepsimenetrend.ro/felhasznalasi-feltetelek/");
});
```

- [ ] **Step 2: Run, confirm failure**

Run: `npm test -- --run components/legal/LegalPage.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Update `LegalPage.tsx`**

- `interface LegalPageProps { type: "terms" | "privacy"; lang?: "hu" | "ro" | "en"; }`
- The `changeLang` / `useSyncExternalStore` machinery already handles any `Lang` (`lib/i18n` has `en`). No change to the store logic.
- The `.seg` group: add
  ```tsx
  <button aria-pressed={lang === "en"} onClick={() => changeLang("en")}>English</button>
  ```
- Header/badge/nav: make the `lang === "ro" ? … : …` binaries three-way. Brand subtitle:
  ```tsx
  {type === "terms"
    ? (lang === "ro" ? "Termeni și condiții" : lang === "en" ? "Terms of use" : "Felhasználási feltételek")
    : (lang === "ro" ? "Confidențialitate" : lang === "en" ? "Privacy" : "Adatkezelési tájékoztató")}
  ```
  Badge: terms `JURIDIC`/`LEGAL`/`JOGI NYILATKOZAT`; privacy `CONFIDENȚIALITATE & COOKIE-URI`/`PRIVACY & COOKIES`/`ADATVÉDELEM & SÜTIK`.
  Content switch: `type === "terms" ? (lang === "ro" ? <TermsContentRo/> : lang === "en" ? <TermsContentEn/> : <TermsContentHu/>) : (…)`.
  Footer nav cross-link + `homeButton` label + `backButton` aria-label: three-way (`"Back"` / `"Back to search"` for en).
- Add `TermsContentEn()` and `PrivacyContentEn()` — English translations of `TermsContentHu` / `PrivacyContentHu`, same `<section className={styles.section}>` / `<h2 className={styles.sectionTitle}>` / `<p className={styles.paragraph}>` / `<ul className={styles.list}>` structure, same `styles.title` / `styles.lastUpdated` / `styles.alertBox`. Keep the "AS IS / AS AVAILABLE" wording. Effective date line: `"In force from: 22 August 2026"`.

- [ ] **Step 4: Create the EN legal route files**

`app/en/terms/page.tsx`:
```tsx
import type { Metadata } from "next";
import { LegalPage } from "@/components";
import { pageMetadata } from "@/lib/seo/metadata";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata({
    huPath: "/felhasznalasi-feltetelek/", roPath: "/ro/termeni/", enPath: "/en/terms/",
    lang: "en",
    title: "Terms of use · Sepsi Menetrend",
    description:
      "Terms of use and disclaimer for Sepsi Menetrend, the unofficial bus schedule "
      + "app for Sfântu Gheorghe (Multi-Trans data).",
  });
}

export default function Page() {
  return <LegalPage type="terms" lang="en" />;
}
```
`app/en/privacy/page.tsx` — same shape: `type="privacy"`, `huPath: "/adatvedelem/"`, `roPath: "/ro/confidentialitate/"`, `enPath: "/en/privacy/"`, title `"Privacy & Cookie Notice · Sepsi Menetrend"`, description about local-only storage + Google Analytics on consent.

Also add `enPath` to the existing RO twins so the whole legal cluster reciprocates (Ruling P1):
- `app/ro/termeni/page.tsx`: `pageMetadata({ huPath: "/felhasznalasi-feltetelek/", roPath: "/ro/termeni/", enPath: "/en/terms/", lang: "ro", … })`
- `app/ro/confidentialitate/page.tsx`: `pageMetadata({ huPath: "/adatvedelem/", roPath: "/ro/confidentialitate/", enPath: "/en/privacy/", lang: "ro", … })`

- [ ] **Step 5: Run tests + build**

Run: `npm test && npm run build`
Expected: unit tests green; `out/en/terms/index.html` + `out/en/privacy/index.html` present.

- [ ] **Step 6: Commit**

```bash
git add components/legal/LegalPage.tsx components/legal/LegalPage.test.tsx app/en/terms/ app/en/privacy/ lib/seo/*legal*.test.ts lib/seo/guide-routes.test.ts
git commit -m "Add the English legal pages and a third language toggle"
```

### Task C17: sitemap, `verify-seo`, and final integration

**Files:**
- Modify: `app/sitemap.ts`
- Modify: `scripts/verify-seo.mjs`
- Modify: `lib/seo/sitemap.test.ts`
- Modify: `web/package.json` (only if a new script helps — optional)

**Interfaces:**
- `app/sitemap.ts` emits three `<loc>` per `PageEntry` (`e.hu`, `e.ro`, `e.en`), each with `languages = { hu: SITE+e.hu, ro: SITE+e.ro, en: SITE+e.en, "x-default": SITE+e.hu }`.
- `verify-seo.mjs`: hreflang completeness requires `hu`, `ro`, `en`, `x-default`; reciprocity key is `hu|ro|en`; subtree lang check learns `out/en` → `en`; `HUB_PATHS` adds `/en/` and `/en/bus-schedule/`; step 5b adds `["/en/", "/en/bus-schedule/"]`; `EXEMPT` adds `/en/`, `/en/terms/`, `/en/privacy/`.

- [ ] **Step 1: Update `lib/seo/sitemap.test.ts`**

Assert each entry yields 3 locs and a 4-key `languages` map. If it asserts a total count, update to `allPages().length * 3`.

- [ ] **Step 2: Run, confirm failure**

Run: `npm test -- --run lib/seo/sitemap.test.ts`
Expected: FAIL (2 locs / 3-key map).

- [ ] **Step 3: Update `app/sitemap.ts`**

```ts
export default function sitemap(): MetadataRoute.Sitemap {
  return allPages().flatMap((e) => {
    const languages = {
      hu: SITE + e.hu, ro: SITE + e.ro, en: SITE + e.en, "x-default": SITE + e.hu,
    };
    const changeFrequency = e.path === "/" ? "weekly" : "monthly";
    const common = {
      lastModified: e.lastModified, changeFrequency, priority: e.priority,
      alternates: { languages },
    } as const;
    return [
      { url: SITE + e.hu, ...common },
      { url: SITE + e.ro, ...common },
      { url: SITE + e.en, ...common },
    ];
  });
}
```

- [ ] **Step 4: Update `scripts/verify-seo.mjs`**

- Step 3 completeness:
  ```js
  if (!alt.hu || !alt.ro || !alt.en || !alt["x-default"]) {
    fail(`${p.path}: incomplete hreflang set (need hu, ro, en, x-default)`);
    continue;
  }
  ```
- The `p.path !== alt.hu && p.path !== alt.ro` check → also allow `alt.en`.
- Reciprocity: `const key = \`${alt.hu}|${alt.ro}|${alt.en}\`;` and `const triple = \`hu=${alt.hu} ro=${alt.ro} en=${alt.en} x-default=${alt["x-default"]}\`;`
- Step 4 subtree language:
  ```js
  const underRo = file === join(OUT, "ro") || file.startsWith(join(OUT, "ro") + "/");
  const underEn = file === join(OUT, "en") || file.startsWith(join(OUT, "en") + "/");
  const want = underRo ? "ro" : underEn ? "en" : "hu";
  ```
- Step 5 `HUB_PATHS`: `["/", "/buszmenetrend/", "/ro/", "/ro/orar-autobuz/", "/en/", "/en/bus-schedule/"]`.
- Step 5b loop: add `["/en/", "/en/bus-schedule/"]`.
- `EXEMPT`: add `"/en/"`, `"/en/terms/"`, `"/en/privacy/"`.
- Update the header comment's page count / description.

- [ ] **Step 5: Full build + gate**

Run: `npm run build`
Expected: `localised N RO pages` + `localised N EN pages`; `og-ext: renamed … images`; `verify-seo: <~537> pages checked, all green`; `service worker stamped …`.
If `verify-seo` fails: read each line. An orphan means an EN page has no inbound link within 2 hops of `/en/` + `/en/bus-schedule/` — check the pillar's `INDEX_LINKS.en` and `PillarLines` cover it, and that `HomeFooter` (en) links it. A hreflang mismatch means a component emitted a wrong `enPath` — fix the component, not `verify-seo`.

- [ ] **Step 6: Determinism check**

Run:
```bash
rm -rf /tmp/en-det-a /tmp/en-det-b
npm run build && cp -r out /tmp/en-det-a
npm run build && cp -r out /tmp/en-det-b
diff -rq /tmp/en-det-a /tmp/en-det-b && echo "DETERMINISTIC"
```
Expected: `DETERMINISTIC` (no differing files). If OG PNGs differ, something in `og.tsx` is non-deterministic — investigate before proceeding.

- [ ] **Step 7: Full test suite**

Run: `npm test`
Expected: all green (baseline 578 + every test added across A1–C17).

- [ ] **Step 8: Production-like local check**

Run: `npm run preview:netlify` (build + `netlify dev`). In a second shell:
```bash
for u in / /ro/ /en/ /en/lines/1/ /en/stops/vasutallomas/ /en/bus-schedule/ /en/faq/ /en/terms/ /en/routes/ ; do
  printf '%s -> ' "$u"; /usr/bin/curl -s -o /dev/null -w '%{http_code}\n' "http://localhost:3000$u"; done
/usr/bin/curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' "http://localhost:3000/terms/"      # 301 -> /felhasznalasi-feltetelek/
/usr/bin/curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' "http://localhost:3000/privacy/"     # 301 -> /adatvedelem/
/usr/bin/curl -s -o /dev/null -w '%{http_code}\n' "http://localhost:3000/api/sepsibike"                # 200
```
Expected: every page `200`; `/terms/` and `/privacy/` → `301` to the new slugs; `/api/sepsibike` → `200`.
Then open `http://localhost:3000/en/lines/1/` in a browser: no console errors, all network requests finish, the OG `<meta>` image URL loads, the 3-language switch works (links to `/vonalak/1/` and `/ro/linii/1/`).

- [ ] **Step 9: Commit**

```bash
git add app/sitemap.ts scripts/verify-seo.mjs lib/seo/sitemap.test.ts
git commit -m "Make the sitemap and the build gate English-aware"
```

- [ ] **Step 10: Final verification summary**

Confirm and record: `npm test` green (count), `npm run build` green (`verify-seo` page count), determinism holds, `npm run preview:netlify` checks pass, branch **not pushed**.

---

## Self-Review

**1. Spec coverage**

| Spec section | Task(s) |
|---|---|
| Phase A — chrome (A.1–A.4) | A1 |
| Phase B — legal slugs (B.1–B.3) | B1 |
| C.1 URL map | C3 (inventory), C8/C9/C10/C11 (component paths), C13/C14/C15/C16 (routes) |
| C.2 `SeoLang` three-valued | C1 |
| C.3 `lib/seo/` changes (`urls`, `metadata`, `content`, `lines`, `places`, `routes`, `og`, `localize`, `jsonld`) | C1, C2, C3, C4, C5, C6, C7 |
| C.4 page-body components | C8, C9, C10, C11 |
| C.5 `app/en/**` route files | C13, C14, C16 (legal) |
| C.6 homepage + footer | C15 |
| C.7 `LegalPage` third toggle | C16 |
| C.8 `PageFrame` three-way switch | C12 |
| C.9 sitemap + `verify-seo` | C17 |
| C.10 out-of-scope (no SW `/en/` shell, no feed change, no reverse 301s) | honoured — no task touches `public/sw.js` `SHELL`, the feed, or reverse redirects |
| Testing & verification | tests in every task; C17 steps 5–10 |

No gaps.

**2. Placeholder scan** — no "TBD"/"handle edge cases"/"similar to Task N". Every code step carries the actual code or the exact table of values. The English legal-copy bodies (C16 step 3) and some `COPY.en` strings (C8 step 4) are specified as "parallel to the existing HU/RO, English, same structure, these headings" rather than verbatim — this is deliberate: they are prose the implementer writes, the structure and facts are pinned, and a task reviewer checks them against the HU original. That is the same latitude the original SEO plan gave for `content.hu.ts` / `content.ro.ts`.

**3. Type consistency**
- `SeoLang` defined once in `lib/seo/lang.ts` (C1), re-exported from `lib/seo/lines.ts`; every later task imports from one of those. ✓
- `pickName(names, lang)` signature stable from C1; used in C5, C6, C8–C12. ✓
- `pageMetadata` gains `enPath?: string` in C2; every later caller passes `enPath`. ✓
- `PageEntry.en` added in C3; consumed by `app/sitemap.ts` and `verify-seo` in C17. ✓
- `PageFrame` prop: `twinPath` through A1–C11, swapped to `paths: {hu,ro,en}` in C12 with all five callers updated in the same task. ✓
- `GUIDES[key].{field}.en` added in C4; read in C6 (`og.tsx`) and C8 (`GuidePageShell`). ✓
- Guide EN slugs (`bus-schedule`, `fares`, `faq`, `multi-trans`, `sepsibike`) consistent between C4 (`content.en.ts`), C8 (`GuidePageShell.PATHS.en`), C13 (route dirs), C3 (`urls.ts` STATIC). ✓
- `BoardTable` / `StopList` `Lang` widened in C9 before `PlacePage` (C10) re-renders `BoardTable` with `lang="en"`. ✓
- Legal `huPath` (`/felhasznalasi-feltetelek/`, `/adatvedelem/`) consistent between B1, C3, C16. ✓

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-30-english-tree-and-chrome.md`. Two execution options:

**1. Subagent-Driven (recommended)** — a fresh subagent per task, spec + quality review between tasks, fast iteration.

**2. Inline Execution** — tasks run in this session via executing-plans, batched with checkpoints.

Which approach?
