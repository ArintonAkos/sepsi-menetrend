import { Fragment } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PageFrame from "@/components/seo/PageFrame";
import { faqLd, jsonLdScript } from "@/lib/seo/jsonld";
import { pageMetadata } from "@/lib/seo/metadata";
import { loadNetwork } from "@/lib/seo/network";
import {
  notablePairs,
  journeyBetween,
  type RoutePair,
  type RouteLeg,
  type RouteSummary,
} from "@/lib/seo/routes";
import type { SeoLang } from "@/lib/seo/lines";
import { huRoutePhrase } from "@/lib/seo/hu-place-forms";
import type { Place } from "@/lib/seo/places";
import type { Network } from "@/lib/engine/types";
import styles from "./RoutePage.module.css";

/** The "how do I get from A to B by bus" page (`/utvonal/[pair]/` +
 *  `/ro/trasee/[pair]/`), data first: the representative weekday journey - each
 *  ride leg spelled out in prose - comes before the FAQ. The journey is planned
 *  at build time by the app's own RAPTOR engine (`lib/seo/routes`); the planner
 *  stays the live authority and every direction links straight into it.
 *
 *  A server component - a crawl target shipped as static HTML with no client
 *  JS. The `/ro/` twin renders with `lang="ro"` here and is `<html>`-stamped
 *  afterwards (`scripts/localize-html.mjs`), so `lang` is passed in explicitly.
 *  The two languages carry independent pair slugs (Ruling R15): `slug` off the
 *  HU names, `slugRo` off the RO names. */

/** `loadNetwork` re-reads and re-parses `network.json` on every call, and
 *  `notablePairs` plans ~180 journeys the first time it sees a given feed
 *  object. `generateStaticParams`, all 91 `generateMetadata` calls and all 91
 *  page renders run in one build worker - share one parsed feed so that plan
 *  happens once, not ~250 times. */
let feed: Network | null = null;
export const routeNetwork = (): Network => (feed ??= loadNetwork());

const HOME: Record<SeoLang, { name: string; path: string }> = {
  hu: { name: "Sepsi Menetrend", path: "/" },
  ro: { name: "Sepsi Menetrend", path: "/ro/" },
};

const huPath = (slug: string) => `/utvonal/${slug}/`;
const roPath = (slug: string) => `/ro/trasee/${slug}/`;

/** Minutes since midnight -> "6:05", non-padded hour - the same formatter as
 *  `BoardTable`, wrapped so a post-midnight departure stays on the clock. */
const hm = (m: number) =>
  `${Math.floor((((m % 1440) + 1440) % 1440) / 60)}:${String(m % 60).padStart(2, "0")}`;

/** The planner's own trip-link format: `lng,lat,name`, comma-joined and NOT
 *  URL-encoded - `decodeTrip` (`lib/share.ts`) splits on comma and keeps the
 *  rest as the name. A name with spaces is fine inside an href value. */
const enc = (p: Place, lang: SeoLang) =>
  `${p.at[0].toFixed(6)},${p.at[1].toFixed(6)},${p.name[lang]}`;

const ctaHref = (from: Place, to: Place, lang: SeoLang) =>
  `/?from=${enc(from, lang)}&to=${enc(to, lang)}${lang === "ro" ? "&lang=ro" : ""}`;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const T = {
  hu: {
    cta: "Nyisd meg a tervezőben",
    faqTitle: "Gyakori kérdések",
    intro: (a: string, b: string) =>
      `${a} és ${b} között Sepsiszentgyörgyön, Multi-Trans városi busszal - `
      + "járatok, átszállások és menetidő.",
    dir: (from: string, to: string) => `${from} → ${to}`,
  },
  ro: {
    cta: "Deschide în planificator",
    faqTitle: "Întrebări frecvente",
    intro: (a: string, b: string) =>
      `Între ${a} și ${b} în Sfântu Gheorghe, cu autobuzul urban Multi-Trans - `
      + "linii, schimbări și durată.",
    dir: (from: string, to: string) => `${from} → ${to}`,
  },
} as const;

/** The page's A→B heading. HU uses the tabulated ablative/terminative forms
 *  (`hu-place-forms`) - the templated "-tól/-ig" join was ungrammatical; RO's
 *  "De la … la …" is already fine. */
const routeTitle = (a: Place, b: Place, lang: SeoLang): string =>
  lang === "hu"
    ? `${huRoutePhrase(a, b)} busszal`
    : `De la ${a.name.ro} la ${b.name.ro} cu autobuzul`;

/** The trailing breadcrumb label: same grammar as the heading on the HU side,
 *  the arrow form on the RO side. */
const routeCrumb = (a: Place, b: Place, lang: SeoLang): string =>
  lang === "hu" ? huRoutePhrase(a, b) : `${a.name.ro} → ${b.name.ro}`;

/** One ride leg as a sentence. Templated, so the grammar is only approximate
 *  (Hungarian vowel harmony on the case endings is not resolved) - a later
 *  pass can refine the wording. */
function legProse(leg: RouteLeg, lang: SeoLang): string {
  return lang === "hu"
    ? `Szállj fel a(z) ${leg.lineLabel} járatra a(z) ${leg.fromName} megállónál, `
      + `és menj ${leg.stops} megállót (${leg.rideMin} perc) a(z) ${leg.toName} megállóig.`
    : `Urcă în ${leg.lineLabel} din stația ${leg.fromName} și mergi ${leg.stops} `
      + `stații (${leg.rideMin} minute) până la ${leg.toName}.`;
}

const joinProse = (legs: RouteLeg[], lang: SeoLang): string =>
  legs.map((l) => legProse(l, lang)).join(lang === "hu" ? " Ezután " : " Apoi ");

/** Total time, transfer count, walking minutes and - when the board has a
 *  column at the boarding stop - the first/last useful departure. */
function summaryLine(s: RouteSummary, lang: SeoLang): string {
  if (lang === "hu") {
    const tr = s.transfers === 0 ? "átszállás nélkül" : `${s.transfers} átszállással`;
    let out = `Az út kb. ${s.totalMin} perc, ${tr}, ${s.walkMin} perc gyaloglással.`;
    if (s.firstDep !== null && s.lastDep !== null) {
      out += ` Első hasznos indulás ${hm(s.firstDep)}, utolsó ${hm(s.lastDep)}.`;
    }
    return out;
  }
  const tr = s.transfers === 0
    ? "fără schimbări"
    : `cu ${s.transfers} ${s.transfers === 1 ? "schimbare" : "schimbări"}`;
  let out =
    `Călătoria durează aproximativ ${s.totalMin} de minute, ${tr}, `
    + `${s.walkMin} minute de mers pe jos.`;
  if (s.firstDep !== null && s.lastDep !== null) {
    out += ` Prima plecare utilă la ${hm(s.firstDep)}, ultima la ${hm(s.lastDep)}.`;
  }
  return out;
}

/** The 3 FAQ Q&As, always phrased in the A→B direction. `primary` is the A→B
 *  journey when there is one, else the B→A journey (a pair is on this page only
 *  because at least one direction is connected). */
function faqFor(
  A: Place, B: Place, primary: RouteSummary, lang: SeoLang,
): { q: string; a: string }[] {
  const lines = [...new Set(primary.legs.map((l) => l.lineLabel))];
  if (lang === "hu") {
    const which = lines.length === 1
      ? `A(z) ${lines[0]} közlekedik ezen az útvonalon.`
      : `${cap(lines[0])}, ${lines.slice(1).join(", ")} (${primary.transfers} átszállással).`;
    return [
      { q: `Melyik busz megy ${A.name.hu}-tól ${B.name.hu}-ig?`, a: which },
      { q: "Mennyi ideig tart az út?", a: `Körülbelül ${primary.totalMin} perc.` },
      {
        q: "Mennyibe kerül a jegy?",
        a: "2,5 lej / 50 perc a 24pay alkalmazásban (a multitrans.ro szerint).",
      },
    ];
  }
  const which = lines.length === 1
    ? `${cap(lines[0])} circulă pe acest traseu.`
    : `${cap(lines[0])}, ${lines.slice(1).join(", ")} (cu ${primary.transfers} `
      + `${primary.transfers === 1 ? "schimbare" : "schimbări"}).`;
  return [
    { q: `Ce autobuz merge de la ${A.name.ro} la ${B.name.ro}?`, a: which },
    { q: "Cât durează drumul?", a: `Aproximativ ${primary.totalMin} de minute.` },
    {
      q: "Cât costă biletul?",
      a: "2,5 lei / 50 de minute prin aplicația 24pay (conform multitrans.ro).",
    },
  ];
}

function resolvePair(pairSlug: string, lang: SeoLang): RoutePair {
  const pair = notablePairs(routeNetwork()).find(
    (p) => (lang === "ro" ? p.slugRo : p.slug) === pairSlug,
  );
  if (!pair) notFound();
  return pair;
}

/** `<head>` for a route page. The HU/RO path pair is the same one the page
 *  renders its twin link and breadcrumb from. Each pair ships its own
 *  `opengraph-image` "A → B" card, so `ownOgImage` strips the default `/og.png`. */
export function routeMetadata(pairSlug: string, lang: SeoLang): Metadata {
  const pair = resolvePair(pairSlug, lang);
  const { a: A, b: B } = pair;

  const { title, description } = lang === "hu"
    ? {
        title: `${routeTitle(A, B, "hu")} – Sepsiszentgyörgy`,
        description:
          `Hogyan juss el ${A.name.hu}-tól ${B.name.hu}-ig Multi-Trans busszal `
          + "Sepsiszentgyörgyön: járatok, átszállások, menetidő és az első/utolsó indulás.",
      }
    : {
        title: `De la ${A.name.ro} la ${B.name.ro} cu autobuzul – Sfântu Gheorghe`,
        description:
          `Cum ajungi de la ${A.name.ro} la ${B.name.ro} cu autobuzul Multi-Trans în `
          + "Sfântu Gheorghe: linii, schimbări, durată și prima/ultima plecare.",
      };

  return pageMetadata({
    huPath: huPath(pair.slug),
    roPath: roPath(pair.slugRo),
    lang,
    title,
    description,
    ownOgImage: true,
  });
}

export default async function RoutePage(
  { lang, pair: pairSlug }: { lang: SeoLang; pair: string },
) {
  const net = routeNetwork();
  const pair = resolvePair(pairSlug, lang);
  const { a: A, b: B } = pair;

  // Data first: both directions, each skipped when the planner finds no ride.
  const dirs: { from: Place; to: Place; summary: RouteSummary }[] = [];
  for (const [from, to] of [[A, B], [B, A]] as const) {
    const summary = journeyBetween(net, from, to, lang);
    if (summary && summary.legs.length) dirs.push({ from, to, summary });
  }
  // `notablePairs` only keeps connected pairs, so this should never fire.
  if (dirs.length === 0) notFound();

  const primary = (dirs.find((d) => d.from === A) ?? dirs[0]).summary;
  const qa = faqFor(A, B, primary, lang);
  const t = T[lang];

  const selfPath = lang === "hu" ? huPath(pair.slug) : roPath(pair.slugRo);
  const twinPath = lang === "hu" ? roPath(pair.slugRo) : huPath(pair.slug);

  return (
    <PageFrame
      lang={lang}
      twinPath={twinPath}
      crumbs={[HOME[lang], { name: routeCrumb(A, B, lang), path: selfPath }]}
    >
      <h1 className={styles.h1}>{routeTitle(A, B, lang)}</h1>
      <p className={styles.intro}>{t.intro(A.name[lang], B.name[lang])}</p>

      {dirs.map(({ from, to, summary }) => (
        <section key={`${from.slug}->${to.slug}`} className={styles.direction}>
          <h2 className={styles.headsign}>{t.dir(from.name[lang], to.name[lang])}</h2>
          <p className={styles.prose}>{joinProse(summary.legs, lang)}</p>
          <p className={styles.meta}>{summaryLine(summary, lang)}</p>
          <p className={styles.cta}>
            <a href={ctaHref(from, to, lang)}>{t.cta}</a>
          </p>
        </section>
      ))}

      <hr className={styles.divider} />

      <h2 className={styles.faqTitle}>{t.faqTitle}</h2>
      <dl className={styles.faq}>
        {qa.map((x, i) => (
          <Fragment key={i}>
            <dt>{x.q}</dt>
            <dd>{x.a}</dd>
          </Fragment>
        ))}
      </dl>
      {/* `jsonLdScript` escapes `<` so a place name cannot close the tag early. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(faqLd(qa)) }}
      />
    </PageFrame>
  );
}
