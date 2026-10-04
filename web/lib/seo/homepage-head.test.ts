import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";

// Only meaningful after `npm run build` has emitted the static export; skipped
// on a bare checkout so `npm test` stays green without a build.
const built = new URL("../../out/index.html", import.meta.url);
const builtEn = new URL("../../out/en/index.html", import.meta.url);

describe("homepage head", () => {
  it.skipIf(!existsSync(built))(
    "gives the HU homepage a descriptive title + off-screen h1, keeps canonical/lang/og/hreflang",
    () => {
      const html = readFileSync(built, "utf8");
      expect(html).toContain('<link rel="canonical" href="https://sepsimenetrend.ro/"/>');
      expect(html).toContain(
        "<title>Sepsi busz menetrend és járattervező – Sepsiszentgyörgy</title>",
      );
      // off-screen <h1> from app/page.tsx - a real title in the outline for
      // crawlers that don't run the planner's client JS
      expect(html).toMatch(
        /<h1 class="srOnly">Sepsiszentgyörgyi buszmenetrend és járattervező<\/h1>/,
      );
      expect(html).toMatch(/<html lang="hu"/);
      // `/` carries its own opengraph-image route (homeOg) now, not the old
      // hand-made shared /og.png - the hash suffix is content-addressed and
      // changes whenever the card's content changes, so match the path only.
      expect(html).toMatch(
        /<meta property="og:image" content="https:\/\/sepsimenetrend\.ro\/opengraph-image\.png\?[0-9a-f]+"\/>/,
      );
      // `/` now emits its own reciprocal hreflang set (its `/ro/` twin always
      // did) - Google ignores a one-way pairing. `en` joined the map in C15.
      expect(html).toContain(
        '<link rel="alternate" hrefLang="hu" href="https://sepsimenetrend.ro/"/>',
      );
      expect(html).toContain(
        '<link rel="alternate" hrefLang="ro" href="https://sepsimenetrend.ro/ro/"/>',
      );
      expect(html).toContain(
        '<link rel="alternate" hrefLang="en" href="https://sepsimenetrend.ro/en/"/>',
      );
      expect(html).toContain(
        '<link rel="alternate" hrefLang="x-default" href="https://sepsimenetrend.ro/"/>',
      );
    },
  );

  it.skipIf(!existsSync(builtEn))(
    "gives the English homepage its own head: lang, self-canonical, four-key hreflang",
    () => {
      const html = readFileSync(builtEn, "utf8");
      // localize-html.mjs stamps the built page after `next build`
      expect(html).toMatch(/<html lang="en"/);
      expect(html).toContain(
        "<title>Sfântu Gheorghe bus timetable &amp; route planner · Multi-Trans</title>",
      );
      expect(html).toMatch(
        /<h1 class="srOnly">Sfântu Gheorghe bus schedule and route planner<\/h1>/,
      );
      expect(html).toContain(
        '<link rel="canonical" href="https://sepsimenetrend.ro/en/"/>',
      );
      // the EN homepage now carries its own opengraph-image route too
      expect(html).toMatch(
        /<meta property="og:image" content="https:\/\/sepsimenetrend\.ro\/en\/opengraph-image\.png\?[0-9a-f]+"\/>/,
      );
      // the same reciprocal set the HU and RO twins carry
      expect(html).toContain(
        '<link rel="alternate" hrefLang="hu" href="https://sepsimenetrend.ro/"/>',
      );
      expect(html).toContain(
        '<link rel="alternate" hrefLang="ro" href="https://sepsimenetrend.ro/ro/"/>',
      );
      expect(html).toContain(
        '<link rel="alternate" hrefLang="en" href="https://sepsimenetrend.ro/en/"/>',
      );
      expect(html).toContain(
        '<link rel="alternate" hrefLang="x-default" href="https://sepsimenetrend.ro/"/>',
      );
    },
  );
});
