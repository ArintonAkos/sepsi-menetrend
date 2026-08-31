import type { ReactNode } from "react";
import { breadcrumbLd, jsonLdScript } from "@/lib/seo/jsonld";
import { Back } from "@/components/common/icons";
import type { SeoLang } from "@/lib/seo/lang";
import styles from "./PageFrame.module.css";

/** The shared chrome around every generated SEO page: the app header (brand
 *  wordmark, a back link to the planner, a language switch), a breadcrumb, the
 *  page body inside a card, and a footer that denies any official status.
 *
 *  A server component on purpose — these pages are crawl targets and the first
 *  thing a search visitor sees, so the frame ships as static HTML with no
 *  client JS. The language switch is plain `<a>`, never a toggle. Each caller
 *  passes `paths` — this page's root-relative URL in every language — so the
 *  switch links straight at the real twin, and `lang` is passed in explicitly
 *  (the `/ro/` twin is built as Hungarian and language-stamped afterwards,
 *  `lib/seo/localize.ts`). */

type Kind = "line" | "place" | "route" | "guide" | "index";

interface PageFrameProps {
  lang: SeoLang;
  kind: Kind;
  crumbs: { name: string; path: string }[];
  paths: { hu: string; ro: string; en: string };
  children: ReactNode;
}

const KIND_LABEL: Record<Kind, Record<SeoLang, string>> = {
  line: { hu: "Vonal", ro: "Linie", en: "Line" },
  place: { hu: "Megálló", ro: "Stație", en: "Stop" },
  route: { hu: "Útvonal", ro: "Traseu", en: "Route" },
  guide: { hu: "Útmutató", ro: "Ghid", en: "Guide" },
  index: { hu: "Jegyzék", ro: "Listă", en: "Index" },
};

const T = {
  hu: {
    crumbLabel: "Morzsamenü",
    back: "Vissza",
    switcherLabel: "Nyelvválasztó",
    disclaimer: "Nem a Multi-Trans SA hivatalos oldala",
    operator: "A Multi-Trans hivatalos oldala: multitrans.ro",
    pillar: { href: "/buszmenetrend/", label: "Teljes buszmenetrend" },
    planner: { href: "/", label: "Útvonaltervező" },
  },
  ro: {
    crumbLabel: "Firimituri",
    back: "Înapoi",
    switcherLabel: "Selector de limbă",
    disclaimer: "Nu este site-ul oficial Multi-Trans SA",
    operator: "Site-ul oficial Multi-Trans: multitrans.ro",
    pillar: { href: "/ro/orar-autobuz/", label: "Orar autobuz complet" },
    planner: { href: "/ro/", label: "Planificator de rute" },
  },
  en: {
    crumbLabel: "Breadcrumb",
    back: "Back",
    switcherLabel: "Language",
    disclaimer: "Not the official Multi-Trans SA website",
    operator: "The official Multi-Trans site: multitrans.ro",
    pillar: { href: "/en/bus-schedule/", label: "Full bus schedule" },
    planner: { href: "/en/", label: "Route planner" },
  },
} as const;

/** Three-language switch; the current language is text, the other two are links. */
const SWITCH: Record<SeoLang, string> = { hu: "Magyar", ro: "Română", en: "English" };

export default function PageFrame({ lang, kind, crumbs, paths, children }: PageFrameProps) {
  const t = T[lang];
  // the back arrow goes up one level: the crumb directly above this page (its
  // index / section), falling back to the site root when there is no parent.
  const up =
    crumbs[crumbs.length - 2]?.path
    ?? crumbs[0]?.path
    ?? (lang === "hu" ? "/" : lang === "ro" ? "/ro/" : "/en/");
  const lastIndex = crumbs.length - 1;
  const sub = KIND_LABEL[kind][lang];

  // segment order is fixed hu, ro, en; the current language is text, each other
  // one is a link to this same page's twin in that language
  const segments = (["hu", "ro", "en"] as const).map((code) => ({
    code,
    label: SWITCH[code],
    href: code === lang ? null : paths[code],
  }));

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <a href={up} className={styles.backButton} aria-label={t.back}>
              <Back />
            </a>
            <div className={styles.brand}>
              <span className={styles.brandName}>Sepsi Menetrend</span>
              <span className={styles.brandSub}>{sub}</span>
            </div>
          </div>

          <div className={styles.seg} role="group" aria-label={t.switcherLabel}>
            {segments.map((s) =>
              s.href ? (
                <a key={s.code} href={s.href} hrefLang={s.code}>
                  {s.label}
                </a>
              ) : (
                <span key={s.code} aria-current="true">
                  {s.label}
                </span>
              ),
            )}
          </div>
        </header>

        <nav aria-label={t.crumbLabel} className={styles.crumbs}>
          <ol className={styles.crumbList}>
            {crumbs.map((c, i) => (
              <li key={c.path} className={styles.crumb}>
                {i === lastIndex ? (
                  <span aria-current="page">{c.name}</span>
                ) : (
                  <a href={c.path}>{c.name}</a>
                )}
              </li>
            ))}
          </ol>
        </nav>

        <main className={styles.card}>
          <div className={styles.badge}>{sub.toUpperCase()}</div>
          {children}
        </main>

        {/* A real <footer> element, sibling of <main> (NOT nested in it) — a
            <footer> inside <main> gets no `contentinfo` landmark. */}
        <footer className={styles.footerNav}>
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

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbLd(crumbs)) }}
        />
      </div>
    </div>
  );
}
