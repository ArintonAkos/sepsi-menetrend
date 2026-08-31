/** Hand-authored prose for the five guide pages.
 *
 *  These pages are the primary organic-search targets, so the copy is written
 *  per language, not machine-translated. The prose lives in `content.hu.ts`,
 *  `content.ro.ts` and `content.en.ts`; this module holds the shared types and
 *  zips the three language halves into one trilingual `GUIDES` object the page
 *  components render.
 *
 *  Slugs are shared with the page inventory (`urls.ts`) and the sitemap - they
 *  must match that table exactly or a guide loses its URL / language twin. */
import { HU } from "./content.hu";
import { RO } from "./content.ro";
import { EN } from "./content.en";

/** A rendered block. The page component walks the union and emits the matching
 *  element - `h2` a heading, `p` a paragraph, `ul` a bullet list. */
export type Block = { h2: string } | { p: string } | { ul: string[] };

export interface Faq {
  q: string;
  a: string;
}

export interface GuidePage {
  slug: { hu: string; ro: string; en: string };
  title: { hu: string; ro: string; en: string };
  description: { hu: string; ro: string; en: string };
  body: { hu: Block[]; ro: Block[]; en: Block[] };
  /** Only the FAQ guide carries this; present in all languages when present. */
  faq?: { hu: Faq[]; ro: Faq[]; en: Faq[] };
}

export type GuideKey = "fares" | "multiTrans" | "bike" | "pillar" | "faq";

/** One language's half of a guide, as written in `content.<lang>.ts`. */
export interface GuideCopy {
  slug: string;
  title: string;
  description: string;
  body: Block[];
  faq?: Faq[];
}

/** Pair the three language halves field by field. A guide that gives `faq` in
 *  one language must give it in all three - the `GuideCopy` files are kept in
 *  sync by hand, and this throws rather than shipping a half-translated FAQ. */
function zip(key: GuideKey): GuidePage {
  const hu = HU[key];
  const ro = RO[key];
  const en = EN[key];
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

export const GUIDES: Record<GuideKey, GuidePage> = {
  fares: zip("fares"),
  multiTrans: zip("multiTrans"),
  bike: zip("bike"),
  pillar: zip("pillar"),
  faq: zip("faq"),
};
