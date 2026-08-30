import type { ReactNode } from "react";
import { breadcrumbLd, jsonLdScript } from "@/lib/seo/jsonld";
import { Back } from "@/components/common/icons";
import styles from "./PageFrame.module.css";

/** The shared chrome around every generated SEO page: the app header (brand
 *  wordmark, a back link to the planner, a language switch), a breadcrumb, the
 *  page body inside a card, and a footer that denies any official status.
 *
 *  A server component on purpose — these pages are crawl targets and the first
 *  thing a search visitor sees, so the frame ships as static HTML with no
 *  client JS. The language switch is plain `<a>`, never a toggle. The `/ro/`
 *  twin is built as Hungarian and language-stamped afterwards
 *  (`lib/seo/localize.ts`), so `lang` is passed in explicitly. */

type Lang = "hu" | "ro";
type Kind = "line" | "place" | "route" | "guide" | "index";

interface PageFrameProps {
  lang: Lang;
  kind: Kind;
  crumbs: { name: string; path: string }[];
  twinPath: string;
  children: ReactNode;
}

const KIND_LABEL: Record<Kind, Record<Lang, string>> = {
  line: { hu: "Vonal", ro: "Linie" },
  place: { hu: "Megálló", ro: "Stație" },
  route: { hu: "Útvonal", ro: "Traseu" },
  guide: { hu: "Útmutató", ro: "Ghid" },
  index: { hu: "Jegyzék", ro: "Listă" },
};

const T = {
  hu: {
    crumbLabel: "Morzsamenü",
    back: "Vissza a tervezőhöz",
    switcherLabel: "Nyelvválasztó",
    disclaimer: "Nem a Multi-Trans SA hivatalos oldala",
    operator: "A Multi-Trans hivatalos oldala: multitrans.ro",
    pillar: { href: "/buszmenetrend/", label: "Teljes buszmenetrend" },
    planner: { href: "/", label: "Útvonaltervező" },
  },
  ro: {
    crumbLabel: "Firimituri",
    back: "Înapoi la planificator",
    switcherLabel: "Selector de limbă",
    disclaimer: "Nu este site-ul oficial Multi-Trans SA",
    operator: "Site-ul oficial Multi-Trans: multitrans.ro",
    pillar: { href: "/ro/orar-autobuz/", label: "Orar autobuz complet" },
    planner: { href: "/ro/", label: "Planificator de rute" },
  },
} as const;

/** Two-language switch this phase; Task C12 adds the English segment. */
const SWITCH: Record<Lang, string> = { hu: "Magyar", ro: "Română" };

export default function PageFrame({ lang, kind, crumbs, twinPath, children }: PageFrameProps) {
  const t = T[lang];
  const home = crumbs[0]?.path ?? (lang === "hu" ? "/" : "/ro/");
  const lastIndex = crumbs.length - 1;
  const sub = KIND_LABEL[kind][lang];

  // segment order is fixed hu, ro; the current language is text, the other a link
  const segments: { code: Lang; label: string; href: string | null }[] = [
    { code: "hu", label: SWITCH.hu, href: lang === "hu" ? null : twinPath },
    { code: "ro", label: SWITCH.ro, href: lang === "ro" ? null : twinPath },
  ];

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <a href={home} className={styles.backButton} aria-label={t.back}>
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
