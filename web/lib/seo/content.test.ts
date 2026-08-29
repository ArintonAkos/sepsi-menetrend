import { describe, it, expect } from "vitest";
import { GUIDES } from "./content";

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
    const expected: Record<keyof typeof GUIDES, { hu: string; ro: string }> = {
      fares: { hu: "dijszabas", ro: "tarife" },
      multiTrans: { hu: "multi-trans", ro: "multi-trans" },
      bike: { hu: "sepsibike", ro: "sepsibike" },
      pillar: { hu: "buszmenetrend", ro: "orar-autobuz" },
      faq: { hu: "gyik", ro: "intrebari-frecvente" },
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
});
