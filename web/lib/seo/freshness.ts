/** When the timetable behind the SEO pages was last revised, for people and
 *  crawlers alike: the footer prints it, the sitemap's `lastmod` and the
 *  `WebPage.dateModified` JSON-LD carry it. One source - `net.generated`,
 *  the feed's build day - so the three can never disagree. */
import type { Network } from "@/lib/engine/types";
import type { SeoLang } from "./lang";
import { loadNetwork } from "./network";
import { isoDate } from "./urls";

/** ISO `YYYY-MM-DD` of the latest timetable revision. */
export function revisedOn(net: Network = loadNetwork()): string {
  return isoDate(net.generated);
}

const LOCALE: Record<SeoLang, string> = { hu: "hu-HU", ro: "ro-RO", en: "en-GB" };

/** "2026. október 1." / "1 octombrie 2026" / "1 October 2026". UTC so the
 *  build machine's zone can't shift the day. */
export function formatRevised(iso: string, lang: SeoLang): string {
  return new Intl.DateTimeFormat(LOCALE[lang], {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00Z`));
}
