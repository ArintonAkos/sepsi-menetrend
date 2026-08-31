import type { MetadataRoute } from "next";
import { SITE } from "@/lib/seo/metadata";
import { allPages } from "@/lib/seo/urls";

/** Static export writes this at build time, so it must not be dynamic. */
export const dynamic = "force-static";

/** Every generated page, all three languages, straight from the inventory. Each
 *  `PageEntry` yields three `<loc>`s - the HU URL, the RO URL and the EN URL -
 *  and all three carry the same hreflang set (hu, ro, en, x-default -> HU), so a
 *  crawler landing on any one URL sees the whole cluster. `x-default` is a valid
 *  `Languages` key in Next 16 and mirrors the on-page `<link rel="alternate">`
 *  from `pageMetadata`. */
export default function sitemap(): MetadataRoute.Sitemap {
  return allPages().flatMap((e) => {
    const languages = {
      hu: SITE + e.hu,
      ro: SITE + e.ro,
      en: SITE + e.en,
      "x-default": SITE + e.hu,
    };
    // the planner is the only page that shifts on every feed rebuild
    const changeFrequency = e.path === "/" ? "weekly" : "monthly";
    const common = {
      lastModified: e.lastModified,
      changeFrequency,
      priority: e.priority,
      alternates: { languages },
    } as const;
    return [
      { url: SITE + e.hu, ...common },
      { url: SITE + e.ro, ...common },
      { url: SITE + e.en, ...common },
    ];
  });
}
