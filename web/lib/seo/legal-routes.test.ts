import { describe, it, expect } from "vitest";
import EnTerms, { generateMetadata as enTermsMeta } from "@/app/en/terms/page";
import EnPrivacy, { generateMetadata as enPrivacyMeta } from "@/app/en/privacy/page";

/** Like `guide-routes.test.ts`: calls the page + metadata functions directly
 *  (no render), so the `/en/` legal route wiring has to hold together at build
 *  time or this fails first. Ruling P1: the legal cluster carries a consistent
 *  four-key hreflang, so the English twin must canonicalise to itself and name
 *  the Hungarian original. */
describe("English legal route pages", () => {
  it("builds the English terms page and canonicalises it to /en/terms/", async () => {
    const el = await (EnTerms as () => unknown)();
    expect(el).toBeTruthy();

    const m = await enTermsMeta();
    expect(m.alternates?.canonical).toBe("https://sepsimenetrend.ro/en/terms/");
    expect(m.alternates?.languages?.hu).toBe(
      "https://sepsimenetrend.ro/felhasznalasi-feltetelek/",
    );
  });

  it("builds the English privacy page and canonicalises it to /en/privacy/", async () => {
    const el = await (EnPrivacy as () => unknown)();
    expect(el).toBeTruthy();

    const m = await enPrivacyMeta();
    expect(m.alternates?.canonical).toBe("https://sepsimenetrend.ro/en/privacy/");
    expect(m.alternates?.languages?.hu).toBe("https://sepsimenetrend.ro/adatvedelem/");
  });
});
