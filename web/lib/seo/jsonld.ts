/** schema.org JSON-LD blocks for the SEO pages.
 *
 *  Only types that earn a rich result or a documented Search feature:
 *  BreadcrumbList, FAQPage, WebSite (the site name shown in results) and
 *  WebPage (`dateModified` - a timetable's freshness, machine-readable).
 *  Deliberately no `Organization` (we do not represent the operator) and no
 *  transit/GTFS schema (Google ignores it and it would imply we do). */
import { SITE } from "./metadata";
import type { SeoLang } from "./lang";

/** The home URL of a language - the root its `WebSite` node is rooted at. */
function homeUrl(lang: SeoLang): string {
  return lang === "hu" ? `${SITE}/` : lang === "ro" ? `${SITE}/ro/` : `${SITE}/en/`;
}

/** schema.org BreadcrumbList - positions count from 1, each `item` absolute.
 *  The `@id` (`<page url>#breadcrumb`) is what `webPageLd` points at. */
export function breadcrumbLd(items: { name: string; path: string }[]): object {
  const last = items.at(-1);
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    ...(last ? { "@id": `${SITE}${last.path}#breadcrumb` } : {}),
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: `${SITE}${it.path}`,
    })),
  };
}

/** schema.org FAQPage - one `Question`/`acceptedAnswer` per pair. */
export function faqLd(qa: { q: string; a: string }[]): object {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: qa.map((x) => ({
      "@type": "Question",
      name: x.q,
      acceptedAnswer: { "@type": "Answer", text: x.a },
    })),
  };
}

/** schema.org WebSite - one node per language, rooted at that language's home.
 *  No `SearchAction`: the planner has no plain `?q=` deep link to point at. */
export function websiteLd(lang: SeoLang): object {
  const home = homeUrl(lang);
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${home}#website`,
    name: "Sepsi Menetrend",
    alternateName: "sepsimenetrend.ro",
    url: home,
    inLanguage: lang,
  };
}

/** schema.org WebPage for an SEO page: what it is, which language's site it
 *  belongs to, and - the point of it - when its timetable data last changed.
 *  `path` is root-relative; `dateModified` is ISO `YYYY-MM-DD`. */
export function webPageLd(p: {
  path: string;
  name: string;
  lang: SeoLang;
  dateModified: string;
}): object {
  const url = `${SITE}${p.path}`;
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${url}#webpage`,
    url,
    name: p.name,
    inLanguage: p.lang,
    dateModified: p.dateModified,
    isPartOf: { "@id": `${homeUrl(p.lang)}#website` },
    breadcrumb: { "@id": `${url}#breadcrumb` },
  };
}

/** Serialised for a `<script type="application/ld+json">` body (caller sets the
 *  tag). `<` is escaped to `<` so a feed-derived name or a hand-written FAQ
 *  answer containing `</script` cannot close the tag early and turn the rest of
 *  the page into live HTML; `<` parses straight back to `<`. */
export function jsonLdScript(obj: object): string {
  return JSON.stringify(obj).replace(/</g, "\\u003c");
}
