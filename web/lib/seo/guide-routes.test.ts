import { describe, it, expect } from "vitest";
import Pillar, { generateMetadata as pillarMeta } from "@/app/buszmenetrend/page";
import Tarife, { generateMetadata as tarifeMeta } from "@/app/ro/tarife/page";
import EnFares, { generateMetadata as enFaresMeta } from "@/app/en/fares/page";

/** These call the page + metadata functions directly (no render), so the whole
 *  guide-page wiring - shell, `PageFrame`, `loadNetwork` for the pillar list -
 *  has to hold together at build time or this fails first. */
describe("guide route pages", () => {
  it("builds the pillar page and canonicalises it to its Hungarian URL", async () => {
    const el = await (Pillar as () => unknown)();
    expect(el).toBeTruthy();

    const meta = await pillarMeta();
    expect(meta.alternates?.canonical).toBe("https://sepsimenetrend.ro/buszmenetrend/");
  });

  it("builds the Romanian fares twin and canonicalises it to its /ro/ URL", async () => {
    const el = await (Tarife as () => unknown)();
    expect(el).toBeTruthy();

    const meta = await tarifeMeta();
    expect(meta.alternates?.canonical).toBe("https://sepsimenetrend.ro/ro/tarife/");
  });

  it("builds the English fares guide and canonicalises it to its /en/ URL", async () => {
    const el = await (EnFares as () => unknown)();
    expect(el).toBeTruthy();

    const meta = await enFaresMeta();
    expect(meta.alternates?.canonical).toBe("https://sepsimenetrend.ro/en/fares/");
  });
});
