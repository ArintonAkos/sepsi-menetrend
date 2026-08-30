import { describe, it, expect } from "vitest";
import { GUIDES } from "./content";
import { EN } from "./content.en";

/** Flatten a block list to one lowercase string so a test can ask "is this
 *  phrase anywhere in the prose" without walking the union type. */
const flat = (b: unknown[]) => JSON.stringify(b).toLowerCase();

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
    expect(flat(GUIDES.multiTrans.body.hu)).toContain("nem hivatalos");
    expect(flat(GUIDES.multiTrans.body.ro)).toContain("neoficial");
  });

  // The slugs are shared with the page inventory (lib/seo/urls.ts) and the
  // sitemap - a drift here means a guide 404s or loses its language twin.
  it("uses exactly the slugs from the page inventory", () => {
    const expected: Record<keyof typeof GUIDES, { hu: string; ro: string; en: string }> = {
      fares: { hu: "dijszabas", ro: "tarife", en: "fares" },
      multiTrans: { hu: "multi-trans", ro: "multi-trans", en: "multi-trans" },
      bike: { hu: "sepsibike", ro: "sepsibike", en: "sepsibike" },
      pillar: { hu: "buszmenetrend", ro: "orar-autobuz", en: "bus-schedule" },
      faq: { hu: "gyik", ro: "intrebari-frecvente", en: "faq" },
    };
    for (const key of Object.keys(expected) as (keyof typeof GUIDES)[]) {
      expect(GUIDES[key].slug).toEqual(expected[key]);
    }
  });

  it("gives the FAQ page at least six real Q&As per language", () => {
    for (const lang of ["hu", "ro"] as const) {
      expect(GUIDES.faq.faq![lang].length).toBeGreaterThanOrEqual(6);
      for (const { q, a } of GUIDES.faq.faq![lang]) {
        expect(q.length).toBeGreaterThan(8);
        expect(a.length).toBeGreaterThan(20);
      }
    }
  });

  it("names the city in the local language on the flagship page", () => {
    expect(flat(GUIDES.pillar.body.hu)).toContain("sepsiszentgyörgy");
    expect(flat(GUIDES.pillar.body.ro)).toContain("sfântu gheorghe");
  });

  // Every language half of every guide, flattened to one lowercase string.
  const allHu = () => Object.values(GUIDES).map((g) => flat([g.title.hu, g.description.hu, g.body.hu, g.faq?.hu ?? []]));
  const allRo = () => Object.values(GUIDES).map((g) => flat([g.title.ro, g.description.ro, g.body.ro, g.faq?.ro ?? []]));

  // "péntek" is a noun; modifying another noun it needs the -i relational
  // suffix ("pénteki ingyenes utazás"). The adverbial "pénteken ingyenes" and
  // the noun-head "ingyenes péntek" are fine - only bare "péntek <adjective>"
  // is the grammar bug this round fixed.
  it("uses the -i suffix for adjectival 'péntek' in the Hungarian prose", () => {
    for (const text of allHu()) expect(text).not.toMatch(/péntek ingyenes/);
  });

  // The Romanian prose addresses the reader informally (tu), matching the
  // Hungarian half and the app UI - no polite 2nd-person-plural verbs directed
  // at the reader (găsiți, verificați, consultați, puteți, ...).
  const POLITE_PLURAL = /\b(?:puteți|găsiți|verificați|consultați|folosiți|alegeți|instalați|adăugați|cumpărați|urcați|mergeți|trimiteți|căutați)\b/;
  it("keeps the Romanian prose in the informal register", () => {
    for (const text of allRo()) expect(text).not.toMatch(POLITE_PLURAL);
  });
});

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
