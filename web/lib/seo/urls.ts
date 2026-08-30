/** The page inventory - the single source of truth for "which SEO pages exist
 *  and what each one's language twin is".
 *
 *  `app/sitemap.ts` and the post-build `verify-seo` check both read from here,
 *  so a page missing from this list is missing from the sitemap and trips the
 *  orphan check. Hungarian is canonical (`path` === `hu`); Romanian is additive
 *  under `/ro/`. Every path ends in `/` - the site is exported with
 *  `trailingSlash: true`. */
import type { Network } from "@/lib/engine/types";
import { loadNetwork } from "./network";
import { buildPlaces } from "./places";
import { notablePairs } from "./routes";

export interface PageEntry {
  /** Canonical HU path; always equal to `hu`, kept separate so a caller asking
   *  for "the canonical URL" needn't know which language that is. */
  path: string;
  hu: string;
  ro: string;
  /** English twin under `/en/`. Category path segments are English
   *  (`/en/stops/`, `/en/lines/`, ...); place and line slugs stay Hungarian,
   *  since proper nouns don't translate. */
  en: string;
  /** ISO date from `net.generated`. */
  lastModified: string;
  priority: number;
}

/** `"20260807"` -> `"2026-08-07"`. A stamp that isn't 8 digits falls back to
 *  today rather than sinking the whole build over a bad feed field. */
function isoDate(generated: string): string {
  return /^\d{8}$/.test(generated)
    ? `${generated.slice(0, 4)}-${generated.slice(4, 6)}-${generated.slice(6, 8)}`
    : new Date().toISOString().slice(0, 10);
}

/** Fixed pages, in descending sitemap-priority order - this is also the order
 *  they appear in `allPages`. */
const STATIC: readonly { hu: string; ro: string; en: string; priority: number }[] = [
  { hu: "/", ro: "/ro/", en: "/en/", priority: 1.0 }, // planner
  { hu: "/buszmenetrend/", ro: "/ro/orar-autobuz/", en: "/en/bus-schedule/", priority: 0.8 }, // pillar guide
  { hu: "/vonalak/", ro: "/ro/linii/", en: "/en/lines/", priority: 0.8 }, // line index
  { hu: "/megallok/", ro: "/ro/statii/", en: "/en/stops/", priority: 0.7 }, // stop index
  { hu: "/utvonal/", ro: "/ro/trasee/", en: "/en/routes/", priority: 0.7 }, // route index
  { hu: "/dijszabas/", ro: "/ro/tarife/", en: "/en/fares/", priority: 0.7 }, // fares
  { hu: "/multi-trans/", ro: "/ro/multi-trans/", en: "/en/multi-trans/", priority: 0.7 }, // operator
  { hu: "/sepsibike/", ro: "/ro/sepsibike/", en: "/en/sepsibike/", priority: 0.6 }, // bike share
  { hu: "/gyik/", ro: "/ro/intrebari-frecvente/", en: "/en/faq/", priority: 0.6 }, // faq
  { hu: "/felhasznalasi-feltetelek/", ro: "/ro/termeni/", en: "/en/terms/", priority: 0.4 },
  { hu: "/adatvedelem/", ro: "/ro/confidentialitate/", en: "/en/privacy/", priority: 0.4 },
];

/** Every SEO page, deterministically ordered: static pages, then one per line
 *  (feed order), per place (`buildPlaces` order), per route pair
 *  (`notablePairs` order). The sources are each already ordered, so no sort. */
export function allPages(net: Network = loadNetwork()): PageEntry[] {
  const lastModified = isoDate(net.generated);
  const entry = (
    hu: string,
    ro: string,
    en: string,
    priority: number,
  ): PageEntry => ({
    path: hu,
    hu,
    ro,
    en,
    lastModified,
    priority,
  });

  return [
    ...STATIC.map((s) => entry(s.hu, s.ro, s.en, s.priority)),
    // line id is used verbatim in every language ("1D" stays "1D")
    ...net.lines.map((l) =>
      entry(`/vonalak/${l.id}/`, `/ro/linii/${l.id}/`, `/en/lines/${l.id}/`, 0.7),
    ),
    // the RO path carries the place's own RO slug; the EN path keeps the HU
    // slug (a place name is a proper noun and doesn't translate)
    ...buildPlaces(net).map((p) =>
      entry(
        `/megallok/${p.slug}/`,
        `/ro/statii/${p.slugRo}/`,
        `/en/stops/${p.slug}/`,
        0.6,
      ),
    ),
    ...notablePairs(net).map((r) =>
      entry(
        `/utvonal/${r.slug}/`,
        `/ro/trasee/${r.slugRo}/`,
        `/en/routes/${r.slug}/`,
        0.5,
      ),
    ),
  ];
}
