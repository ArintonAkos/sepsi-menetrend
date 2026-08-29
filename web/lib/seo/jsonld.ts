/** schema.org JSON-LD blocks for the SEO pages.
 *
 *  Only the handful of types that earn a rich result: BreadcrumbList, FAQPage,
 *  WebSite. Deliberately no `Organization` (we do not represent the operator)
 *  and no transit/GTFS schema (Google ignores it and it would imply we do). */
import { SITE } from "./metadata";

/** schema.org BreadcrumbList - positions count from 1, each `item` absolute. */
export function breadcrumbLd(items: { name: string; path: string }[]): object {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
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
export function websiteLd(lang: "hu" | "ro"): object {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Sepsi Menetrend",
    url: lang === "hu" ? `${SITE}/` : `${SITE}/ro/`,
    inLanguage: lang,
  };
}

/** Serialised for a `<script type="application/ld+json">` body (caller sets the
 *  tag). `<` is escaped to `<` so a feed-derived name or a hand-written FAQ
 *  answer containing `</script` cannot close the tag early and turn the rest of
 *  the page into live HTML; `<` parses straight back to `<`. */
export function jsonLdScript(obj: object): string {
  return JSON.stringify(obj).replace(/</g, "\\u003c");
}
