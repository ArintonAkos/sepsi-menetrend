import { describe, it, expect } from "vitest";
import { pageMetadata } from "./metadata";
import { breadcrumbLd, faqLd, websiteLd, jsonLdScript } from "./jsonld";

/** The metadata sub-objects are discriminated unions in `next`; the tests only
 *  care about a few string fields, so read them through a plain record view
 *  rather than narrowing every branch. */
const rec = (o: unknown): Record<string, unknown> => o as Record<string, unknown>;

describe("pageMetadata", () => {
  it("emits reciprocal hreflang with x-default pointing at Hungarian", () => {
    const m = pageMetadata({
      huPath: "/vonalak/1/", roPath: "/ro/linii/1/", lang: "ro",
      title: "Linia 1 – orar autobuz Sfântu Gheorghe", description: "…",
    });
    expect(m.alternates?.canonical).toBe("https://sepsimenetrend.ro/ro/linii/1/");
    expect(m.alternates?.languages?.hu).toBe("https://sepsimenetrend.ro/vonalak/1/");
    expect(m.alternates?.languages?.ro).toBe("https://sepsimenetrend.ro/ro/linii/1/");
    expect(m.alternates?.languages?.["x-default"]).toBe("https://sepsimenetrend.ro/vonalak/1/");
    expect(rec(m.openGraph).locale).toBe("ro_RO");
    expect(rec(m.openGraph).url).toBe("https://sepsimenetrend.ro/ro/linii/1/");
    expect(rec(m.openGraph).type).toBe("website");
    expect(rec(m.openGraph).siteName).toBe("Sepsi Menetrend");
    expect(rec(m.twitter).card).toBe("summary_large_image");
    // pinned: the anti-impersonation fields, and where the brief's `author`
    // deviated to Next 16's `authors` / `publisher`
    expect(m.authors).toEqual([{ name: "Sepsi Menetrend" }]);
    expect(m.publisher).toBe("Sepsi Menetrend");
  });

  it("makes the Hungarian page its own canonical and keeps hu_HU locale", () => {
    const m = pageMetadata({
      huPath: "/vonalak/1/", roPath: "/ro/linii/1/", lang: "hu",
      title: "1-es busz menetrendje – Sepsiszentgyörgy", description: "…",
    });
    expect(m.alternates?.canonical).toBe("https://sepsimenetrend.ro/vonalak/1/");
    expect(m.alternates?.languages?.["x-default"]).toBe("https://sepsimenetrend.ro/vonalak/1/");
    expect(rec(m.openGraph).locale).toBe("hu_HU");
    expect(rec(m.openGraph).url).toBe("https://sepsimenetrend.ro/vonalak/1/");
  });

  it("sets an absolute title that bypasses the layout template", () => {
    const m = pageMetadata({
      huPath: "/gyik/", roPath: "/ro/intrebari-frecvente/", lang: "hu",
      title: "Gyakori kérdések", description: "…",
    });
    expect(rec(m.title).absolute).toBe("Gyakori kérdések");
    expect(rec(m.openGraph).title).toBe("Gyakori kérdések");
    expect(rec(m.twitter).title).toBe("Gyakori kérdések");
  });

  it("defaults the OG image to /og.png and lets ogPath override it", () => {
    const base = pageMetadata({
      huPath: "/vonalak/1/", roPath: "/ro/linii/1/", lang: "ro",
      title: "t", description: "d",
    });
    expect(rec(base.openGraph).images).toEqual(["https://sepsimenetrend.ro/og.png"]);

    const custom = pageMetadata({
      huPath: "/vonalak/1/", roPath: "/ro/linii/1/", lang: "ro",
      title: "t", description: "d", ogPath: "/og/line-1.png",
    });
    expect(rec(custom.openGraph).images).toEqual(["https://sepsimenetrend.ro/og/line-1.png"]);
    expect(rec(custom.twitter).images).toEqual(["https://sepsimenetrend.ro/og/line-1.png"]);
  });

  it("leaves an already-absolute ogPath untouched", () => {
    const m = pageMetadata({
      huPath: "/vonalak/1/", roPath: "/ro/linii/1/", lang: "ro",
      title: "t", description: "d", ogPath: "https://cdn.example/og/line-1.png",
    });
    expect(rec(m.openGraph).images).toEqual(["https://cdn.example/og/line-1.png"]);
  });
});

describe("breadcrumbLd", () => {
  it("numbers positions from 1 and uses absolute URLs", () => {
    expect(
      breadcrumbLd([
        { name: "Sepsi Menetrend", path: "/" },
        { name: "Vonalak", path: "/vonalak/" },
      ]),
    ).toEqual({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Sepsi Menetrend", item: "https://sepsimenetrend.ro/" },
        { "@type": "ListItem", position: 2, name: "Vonalak", item: "https://sepsimenetrend.ro/vonalak/" },
      ],
    });
  });
});

describe("faqLd", () => {
  it("wraps each pair as a Question with an acceptedAnswer", () => {
    expect(
      faqLd([
        { q: "Mennyibe kerül a jegy?", a: "2,5 lej a városban." },
        { q: "Hol vehetek bérletet?", a: "A 24pay alkalmazásban." },
      ]),
    ).toEqual({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "Mennyibe kerül a jegy?",
          acceptedAnswer: { "@type": "Answer", text: "2,5 lej a városban." },
        },
        {
          "@type": "Question",
          name: "Hol vehetek bérletet?",
          acceptedAnswer: { "@type": "Answer", text: "A 24pay alkalmazásban." },
        },
      ],
    });
  });
});

describe("websiteLd", () => {
  it("names the site and roots the URL per language", () => {
    expect(websiteLd("hu")).toEqual({
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Sepsi Menetrend",
      url: "https://sepsimenetrend.ro/",
      inLanguage: "hu",
    });
    expect(websiteLd("ro")).toEqual({
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Sepsi Menetrend",
      url: "https://sepsimenetrend.ro/ro/",
      inLanguage: "ro",
    });
  });
});

describe("jsonLdScript", () => {
  it("round-trips through JSON.parse", () => {
    const crumb = breadcrumbLd([{ name: "A", path: "/" }, { name: "B", path: "/b/" }]);
    expect(JSON.parse(jsonLdScript(crumb))).toEqual(crumb);
    const faq = faqLd([{ q: "q?", a: "a." }]);
    expect(JSON.parse(jsonLdScript(faq))).toEqual(faq);
  });

  it("escapes < so embedded data cannot close the script tag", () => {
    const s = jsonLdScript({ a: "x</script><script>alert(1)</script>" });
    expect(s).not.toMatch(/<\/script/i);
    expect(JSON.parse(jsonLdScript({ a: "1 < 2" }))).toEqual({ a: "1 < 2" });
  });
});
