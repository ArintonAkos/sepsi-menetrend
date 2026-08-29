import type { ReactNode } from "react";
import { breadcrumbLd, jsonLdScript } from "@/lib/seo/jsonld";
import styles from "./PageFrame.module.css";

/** The shared chrome around every generated SEO page: breadcrumb, a visible
 *  jump to the language twin, the page body, and a footer that denies any
 *  official status and points back to the operator and the two hub pages.
 *
 *  A server component on purpose - these pages are crawl targets and the first
 *  thing a visitor from search sees, so the frame ships as static HTML with no
 *  client JS to parse or hydrate. Internal links are plain `<a>` for the same
 *  reason; `next/link` would only add a prefetching router we do not want here.
 *
 *  The `/ro/` twin is built as Hungarian and language-stamped afterwards
 *  (`lib/seo/localize.ts`), so `lang` is passed in explicitly rather than read
 *  from any store. */

type Lang = "hu" | "ro";

interface PageFrameProps {
  lang: Lang;
  crumbs: { name: string; path: string }[];
  twinPath: string;
  children: ReactNode;
}

/** Per-language chrome strings. The disclaimer is the load-bearing line: a flat
 *  denial in the reader's own language, worded to match `lib/i18n`'s. The hub
 *  paths differ per language and must match the inventory in `lib/seo/urls.ts`
 *  (`/` + `/buszmenetrend/` for HU, `/ro/` + `/ro/orar-autobuz/` for RO). */
const T = {
  hu: {
    crumbLabel: "Morzsamenü",
    switchTo: "Română",
    disclaimer: "Nem a Multi-Trans SA hivatalos oldala",
    operator: "A Multi-Trans hivatalos oldala: multitrans.ro",
    pillar: { href: "/buszmenetrend/", label: "Teljes buszmenetrend" },
    planner: { href: "/", label: "Útvonaltervező" },
  },
  ro: {
    crumbLabel: "Firimituri",
    switchTo: "Magyar",
    disclaimer: "Nu este site-ul oficial Multi-Trans SA",
    operator: "Site-ul oficial Multi-Trans: multitrans.ro",
    pillar: { href: "/ro/orar-autobuz/", label: "Orar autobuz complet" },
    planner: { href: "/ro/", label: "Planificator de rute" },
  },
} as const;

export default function PageFrame({ lang, crumbs, twinPath, children }: PageFrameProps) {
  const t = T[lang];
  const lastIndex = crumbs.length - 1;

  return (
    <div className={styles.frame}>
      <nav aria-label={t.crumbLabel} className={styles.crumbs}>
        <ol className={styles.crumbList}>
          {crumbs.map((c, i) => (
            <li key={c.path} className={styles.crumb}>
              {i === lastIndex ? (
                // the current page - text, not a link back to itself
                <span aria-current="page">{c.name}</span>
              ) : (
                <a href={c.path}>{c.name}</a>
              )}
            </li>
          ))}
        </ol>
      </nav>

      <a href={twinPath} className={styles.langSwitch} hrefLang={lang === "hu" ? "ro" : "hu"}>
        {t.switchTo}
      </a>

      <div className={styles.body}>{children}</div>

      <footer className={styles.footer}>
        <p className={styles.disclaimer}>{t.disclaimer}</p>
        <div className={styles.footerLinks}>
          <a href={t.planner.href}>{t.planner.label}</a>
          <a href={t.pillar.href}>{t.pillar.label}</a>
          <a
            className={styles.operator}
            href="https://multitrans.ro/index.html"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t.operator}
          </a>
        </div>
      </footer>

      {/* schema.org BreadcrumbList - `jsonLdScript` escapes `<`, so a feed-derived
          crumb name cannot close the tag early. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbLd(crumbs)) }}
      />
    </div>
  );
}
