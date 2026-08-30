import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";

// Only meaningful after `npm run build` has emitted the static export; skipped
// on a bare checkout so `npm test` stays green without a build.
const built = new URL("../../out/index.html", import.meta.url);

describe("homepage head", () => {
  it.skipIf(!existsSync(built))(
    "keeps the homepage canonical, title and lang unchanged",
    () => {
      const html = readFileSync(built, "utf8");
      expect(html).toContain('<link rel="canonical" href="https://sepsimenetrend.ro/"/>');
      expect(html).toContain("<title>Sepsi Menetrend</title>");
      expect(html).toMatch(/<html lang="hu"/);
      // the planner is not `ownOgImage`, so `/` still points at the shared card
      expect(html).toContain(
        '<meta property="og:image" content="https://sepsimenetrend.ro/og.png"/>',
      );
      // app/page.tsx never emitted hreflang - only the SEO pages do, via
      // pageMetadata. Lock that the new subsystem left no partial alternate on `/`.
      expect(html).not.toContain("hreflang");
    },
  );
});
