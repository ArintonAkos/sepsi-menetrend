import { Fragment } from "react";
import type { Metadata } from "next";
import PageFrame from "@/components/seo/PageFrame";
import GuideBody from "@/components/seo/GuideBody";
import { GUIDES, type GuideKey } from "@/lib/seo/content";
import { faqLd, jsonLdScript } from "@/lib/seo/jsonld";
import { pageMetadata } from "@/lib/seo/metadata";
import { loadNetwork } from "@/lib/seo/network";
import { enrichLine } from "@/lib/seo/lines";
import styles from "./GuidePageShell.module.css";

/** The shared body of every guide page (HU + RO). Each `page.tsx` is then a
 *  five-line wrapper: `generateMetadata` -> `guideMetadata`, and the default
 *  export renders `<GuidePageShell>` with the guide key and its language.
 *
 *  A server component - no client JS on a crawl target. The `/ro/` twin is
 *  built as Hungarian and language-stamped afterwards (`lib/seo/localize.ts`),
 *  so `lang` is passed in explicitly. */

type Lang = "hu" | "ro";

/** HU/RO path pair per guide. Must match the inventory in `lib/seo/urls.ts`
 *  exactly, or a guide loses its canonical URL / language twin. */
const PATHS: Record<GuideKey, { hu: string; ro: string }> = {
  fares: { hu: "/dijszabas/", ro: "/ro/tarife/" },
  multiTrans: { hu: "/multi-trans/", ro: "/ro/multi-trans/" },
  bike: { hu: "/sepsibike/", ro: "/ro/sepsibike/" },
  pillar: { hu: "/buszmenetrend/", ro: "/ro/orar-autobuz/" },
  faq: { hu: "/gyik/", ro: "/ro/intrebari-frecvente/" },
};

/** The site-root crumb, per language. */
const HOME: Record<Lang, { name: string; path: string }> = {
  hu: { name: "Sepsi Menetrend", path: "/" },
  ro: { name: "Sepsi Menetrend", path: "/ro/" },
};

/** The trailing (current-page) crumb label, per guide, per language. */
const CRUMB: Record<GuideKey, { hu: string; ro: string }> = {
  fares: { hu: "Díjszabás", ro: "Tarife" },
  multiTrans: { hu: "Multi-Trans", ro: "Multi-Trans" },
  bike: { hu: "SepsiBike", ro: "SepsiBike" },
  pillar: { hu: "Buszmenetrend", ro: "Orar autobuz" },
  faq: { hu: "GYIK", ro: "Întrebări frecvente" },
};

/** `<head>` for a guide page. The HU/RO path pair is the same one the page
 *  renders its twin link and breadcrumb from - one table, no drift. */
export function guideMetadata(key: GuideKey, lang: Lang): Metadata {
  const g = GUIDES[key];
  return pageMetadata({
    huPath: PATHS[key].hu,
    roPath: PATHS[key].ro,
    lang,
    title: g.title[lang],
    description: g.description[lang],
  });
}

/** Visible Q&A list for a guide that carries a `.faq`. Paired with a
 *  `FAQPage` JSON-LD script so the same text can earn a rich result. */
function FaqSection({ items }: { items: { q: string; a: string }[] }) {
  return (
    <dl className={styles.faq}>
      {items.map((qa, i) => (
        <Fragment key={i}>
          <dt>{qa.q}</dt>
          <dd>{qa.a}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

/** Line-index links for the pillar page: every city line to its own page, plus
 *  the stop index and the fares guide. Paths differ per language and must match
 *  `lib/seo/urls.ts`. */
const LINE_BASE: Record<Lang, string> = { hu: "/vonalak/", ro: "/ro/linii/" };
const INDEX_LINKS: Record<Lang, { href: string; label: string }[]> = {
  hu: [
    { href: "/megallok/", label: "Megállók" },
    { href: "/dijszabas/", label: "Díjszabás" },
  ],
  ro: [
    { href: "/ro/statii/", label: "Stații" },
    { href: "/ro/tarife/", label: "Tarife" },
  ],
};

/** The pillar page's full line list, read straight off the built feed. */
function PillarLines({ lang }: { lang: Lang }) {
  const net = loadNetwork();
  const lines = net.lines.map((l) => enrichLine(net, l.id, lang));
  const base = LINE_BASE[lang];

  return (
    <nav className={styles.lines} aria-label={lang === "hu" ? "Vonalak" : "Linii"}>
      <ul>
        {lines.map((l) => (
          <li key={l.id}>
            <a href={`${base}${l.id}/`}>{l.label}</a>
            <span className={styles.termini}>
              {" "}
              · {l.termini[0]} – {l.termini[1]}
            </span>
          </li>
        ))}
      </ul>
      <p className={styles.indexLinks}>
        {INDEX_LINKS[lang].map((x) => (
          <a key={x.href} href={x.href}>
            {x.label}
          </a>
        ))}
      </p>
    </nav>
  );
}

export default function GuidePageShell({ guideKey, lang }: { guideKey: GuideKey; lang: Lang }) {
  const g = GUIDES[guideKey];
  const paths = PATHS[guideKey];
  const selfPath = lang === "hu" ? paths.hu : paths.ro;
  const twinPath = lang === "hu" ? paths.ro : paths.hu;
  const faq = g.faq?.[lang];

  return (
    <PageFrame
      lang={lang}
      twinPath={twinPath}
      crumbs={[HOME[lang], { name: CRUMB[guideKey][lang], path: selfPath }]}
    >
      <h1 className={styles.h1}>{g.title[lang]}</h1>
      <GuideBody blocks={g.body[lang]} />

      {faq ? <FaqSection items={faq} /> : null}
      {faq ? (
        <script
          type="application/ld+json"
          // `jsonLdScript` escapes `<` so a hand-written answer cannot close the tag.
          dangerouslySetInnerHTML={{ __html: jsonLdScript(faqLd(faq)) }}
        />
      ) : null}

      {guideKey === "pillar" ? <PillarLines lang={lang} /> : null}
    </PageFrame>
  );
}
