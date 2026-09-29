import { describe, it, expect } from "vitest";
import { NOTABLE_PLACE_SLUGS } from "./places";
import { HU_FROM, HU_TO } from "./hu-place-forms";

/** HU_FROM/HU_TO are hand-tabulated because the templated "-tól/-ig" join
 *  gets Hungarian vowel harmony wrong - so a renamed NOTABLE_PLACE_SLUGS
 *  entry has to be re-keyed here by hand too, or its route pages silently
 *  fall back to that broken template. This is exactly the gap a 2026-09
 *  slug rename (szemerja-vegallomas -> szemerja-golya-utca, vitez-mihaly-
 *  liceum -> vitez-mihaly-lic) fell into undetected. */
describe("HU_FROM / HU_TO", () => {
  it("covers every notable place slug", () => {
    for (const slug of NOTABLE_PLACE_SLUGS) {
      expect(HU_FROM, `HU_FROM missing "${slug}"`).toHaveProperty(slug);
      expect(HU_TO, `HU_TO missing "${slug}"`).toHaveProperty(slug);
    }
  });

  it("carries no orphaned slug from a since-renamed place", () => {
    const notable = new Set(NOTABLE_PLACE_SLUGS);
    for (const slug of Object.keys(HU_FROM)) {
      expect(notable, `HU_FROM has stale slug "${slug}"`).toContain(slug);
    }
    for (const slug of Object.keys(HU_TO)) {
      expect(notable, `HU_TO has stale slug "${slug}"`).toContain(slug);
    }
  });
});
