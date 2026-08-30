import type { SeoLang } from "@/lib/seo/lang";
import styles from "./StopList.module.css";

/** An ordered list of a line's stops, each linking to that stop's own SEO page.
 *
 *  A server component with plain `<a>` links - these pages are crawl targets and
 *  want static HTML, not `next/link`'s prefetching router. The `/ro/` twin is
 *  built as Hungarian then language-stamped, so `lang` is passed in explicitly;
 *  `slug` is already the language-correct one from the caller. */

type Lang = SeoLang;

interface StopListProps {
  lang: Lang;
  stops: { name: string; slug: string }[];
}

// Must match the stop-page inventory in `lib/seo/urls.ts`.
const BASE = { hu: "/megallok/", ro: "/ro/statii/", en: "/en/stops/" } as const;

export default function StopList({ lang, stops }: StopListProps) {
  const base = BASE[lang];
  return (
    <ol className={styles.list}>
      {stops.map((stop, i) => (
        // index-suffixed: a line that visits the same stop twice must not
        // collide on key
        <li key={`${stop.slug}-${i}`} className={styles.item}>
          <a href={`${base}${stop.slug}/`}>{stop.name}</a>
        </li>
      ))}
    </ol>
  );
}
