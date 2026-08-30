import { describe, it, expect } from "vitest";
import { retargetOgImage } from "./og-ext";

/** The real tag + URL shapes Next 16 emits for a code-generated `opengraph-image`
 *  route under `output: "export"` (measured in Task 15b step 0): the file lands
 *  as `out/<seg>/opengraph-image` with no extension, and the `<head>` carries a
 *  `?<hash>` cache-buster on the URL. */
const OG = (url: string) => `<meta property="og:image" content="${url}"/>`;
const TW = (url: string) => `<meta name="twitter:image" content="${url}"/>`;
const BASE = "https://sepsimenetrend.ro/dijszabas/opengraph-image";

describe("retargetOgImage", () => {
  it("appends the .png to an og:image URL, keeping the ?hash query", () => {
    const html = OG(`${BASE}?a612873ccaebd8dd`);
    expect(retargetOgImage(html, "opengraph-image", "opengraph-image.png")).toBe(
      OG("https://sepsimenetrend.ro/dijszabas/opengraph-image.png?a612873ccaebd8dd"),
    );
  });

  it("rewrites the twitter:image tag too", () => {
    const html = TW(`${BASE}?a612873ccaebd8dd`);
    expect(retargetOgImage(html, "opengraph-image", "opengraph-image.png")).toBe(
      TW("https://sepsimenetrend.ro/dijszabas/opengraph-image.png?a612873ccaebd8dd"),
    );
  });

  it("rewrites every image tag in a full head block, leaving the :type/:width tags alone", () => {
    const head =
      OG(`${BASE}?h`) +
      `<meta property="og:image:type" content="image/png"/>` +
      `<meta property="og:image:width" content="1200"/>` +
      TW(`${BASE}?h`);
    const out = retargetOgImage(head, "opengraph-image", "opengraph-image.png");
    expect(out).toContain(OG("https://sepsimenetrend.ro/dijszabas/opengraph-image.png?h"));
    expect(out).toContain(TW("https://sepsimenetrend.ro/dijszabas/opengraph-image.png?h"));
    expect(out).toContain(`<meta property="og:image:type" content="image/png"/>`);
    expect(out).toContain(`<meta property="og:image:width" content="1200"/>`);
  });

  it("is anchored to the meta tags - arbitrary text carrying the token is untouched", () => {
    const html = `<p>The opengraph-image route file lives in the segment.</p>` + OG(`${BASE}?h`);
    const out = retargetOgImage(html, "opengraph-image", "opengraph-image.png");
    expect(out).toContain(`<p>The opengraph-image route file lives in the segment.</p>`);
    expect(out).toContain(OG("https://sepsimenetrend.ro/dijszabas/opengraph-image.png?h"));
  });

  it("is idempotent", () => {
    const html = OG(`${BASE}?h`) + TW(`${BASE}?h`);
    const once = retargetOgImage(html, "opengraph-image", "opengraph-image.png");
    const twice = retargetOgImage(once, "opengraph-image", "opengraph-image.png");
    expect(twice).toBe(once);
  });

  it("no-ops a page whose card is elsewhere (token absent)", () => {
    const html = OG("https://sepsimenetrend.ro/og.png");
    expect(retargetOgImage(html, "opengraph-image", "opengraph-image.png")).toBe(html);
  });
});
