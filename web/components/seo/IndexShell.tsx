import type { ReactNode } from "react";
import type { Metadata } from "next";
import PageFrame from "@/components/seo/PageFrame";
import { pageMetadata } from "@/lib/seo/metadata";
import { loadNetwork } from "@/lib/seo/network";
import { enrichLine } from "@/lib/seo/lines";
import { buildPlaces } from "@/lib/seo/places";
import styles from "./IndexShell.module.css";

/** The two index pages - `/vonalak/` (every line) and `/megallok/` (every
 *  place) - and their `/ro/` twins. They are the internal-linking backbone:
 *  every generated line and stop page hangs off one of these lists.
 *
 *  Server components on purpose - crawl targets, shipped as static HTML with no
 *  client JS, plain `<a>` links (same reasoning as `PageFrame`). The `/ro/`
 *  twin is built as Hungarian and language-stamped afterwards
 *  (`lib/seo/localize.ts`), so `lang` is passed in explicitly. */

type Lang = "hu" | "ro";
type Kind = "lines" | "stops";

/** HU/RO path pair per index. Must match the inventory in `lib/seo/urls.ts`
 *  exactly, or an index loses its canonical URL / language twin. */
const PATHS: Record<Kind, { hu: string; ro: string }> = {
  lines: { hu: "/vonalak/", ro: "/ro/linii/" },
  stops: { hu: "/megallok/", ro: "/ro/statii/" },
};

/** The site-root crumb, per language. */
const HOME: Record<Lang, { name: string; path: string }> = {
  hu: { name: "Sepsi Menetrend", path: "/" },
  ro: { name: "Sepsi Menetrend", path: "/ro/" },
};

/** Per-index, per-language chrome. `metaTitle` / `metaDescription` feed
 *  `<head>`; `crumb` is the trailing breadcrumb; `h1` + `intro` open the body. */
const COPY: Record<Kind, Record<Lang, {
  crumb: string;
  metaTitle: string;
  metaDescription: string;
  h1: string;
  intro: string;
}>> = {
  lines: {
    hu: {
      crumb: "Vonalak",
      metaTitle: "Sepsiszentgyörgyi buszvonalak · Multi-Trans",
      metaDescription:
        "Sepsiszentgyörgy mind a 12 Multi-Trans buszvonala egy listában: "
        + "minden járat végállomásaival és külön menetrendi oldalával a városi "
        + "buszközlekedéshez.",
      h1: "Buszvonalak Sepsiszentgyörgyön",
      intro:
        "A Multi-Trans 12 városi buszvonala Sepsiszentgyörgyön. Válassz "
        + "vonalat a végállomásokért, a megállók sorrendjéért és a hivatalos "
        + "indulási időkért.",
    },
    ro: {
      crumb: "Linii",
      metaTitle: "Liniile de autobuz din Sfântu Gheorghe · Multi-Trans",
      metaDescription:
        "Toate cele 12 linii de autobuz Multi-Trans din Sfântu Gheorghe: "
        + "capetele de linie și pagina de orar proprie a fiecărei linii din "
        + "transportul urban.",
      h1: "Liniile de autobuz din Sfântu Gheorghe",
      intro:
        "Cele 12 linii de autobuz urbane Multi-Trans din Sfântu Gheorghe. "
        + "Alege o linie pentru capetele de linie, ordinea stațiilor și orele "
        + "oficiale de plecare.",
    },
  },
  stops: {
    hu: {
      crumb: "Megállók",
      metaTitle: "Buszmegállók Sepsiszentgyörgyön",
      metaDescription:
        "Sepsiszentgyörgy mind a 65 buszmegállója betűrendben: minden "
        + "megállónak külön oldala van az ott közlekedő Multi-Trans "
        + "vonalakkal és indulási időkkel.",
      h1: "Buszmegállók Sepsiszentgyörgyön",
      intro:
        "Sepsiszentgyörgy összes buszmegállója betűrendben. Minden megálló "
        + "oldalán megtalálod az ott közlekedő vonalakat és a következő "
        + "indulásokat.",
    },
    ro: {
      crumb: "Stații",
      metaTitle: "Stații de autobuz în Sfântu Gheorghe",
      metaDescription:
        "Toate cele 65 de stații de autobuz din Sfântu Gheorghe, în ordine "
        + "alfabetică: fiecare stație cu liniile Multi-Trans care opresc acolo "
        + "și orele de plecare.",
      h1: "Stații de autobuz în Sfântu Gheorghe",
      intro:
        "Toate stațiile de autobuz din Sfântu Gheorghe, în ordine alfabetică. "
        + "Pe pagina fiecărei stații vezi liniile care opresc acolo și "
        + "următoarele plecări.",
    },
  },
};

/** Codepoint order, not `localeCompare` - collation rules vary by build host
 *  (same reasoning as `lib/seo/places.ts`'s `byText`). */
const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** `<head>` for an index page. The HU/RO path pair is the same one the body
 *  renders its twin link and breadcrumb from - one table, no drift. */
export function indexMetadata(kind: Kind, lang: Lang): Metadata {
  const c = COPY[kind][lang];
  return pageMetadata({
    huPath: PATHS[kind].hu,
    roPath: PATHS[kind].ro,
    lang,
    title: c.metaTitle,
    description: c.metaDescription,
  });
}

/** Shared frame: breadcrumb + twin link (via `PageFrame`), then h1 and intro. */
function Shell({ kind, lang, children }: { kind: Kind; lang: Lang; children: ReactNode }) {
  const c = COPY[kind][lang];
  const selfPath = lang === "hu" ? PATHS[kind].hu : PATHS[kind].ro;
  const twinPath = lang === "hu" ? PATHS[kind].ro : PATHS[kind].hu;

  return (
    <PageFrame
      lang={lang}
      twinPath={twinPath}
      crumbs={[HOME[lang], { name: c.crumb, path: selfPath }]}
    >
      <h1 className={styles.h1}>{c.h1}</h1>
      <p className={styles.intro}>{c.intro}</p>
      {children}
    </PageFrame>
  );
}

/** `/vonalak/` (+ `/ro/linii/`): every line, feed order, each a link to its own
 *  page with a colour swatch, the spoken label and the two termini. */
export function LineIndex({ lang }: { lang: Lang }) {
  const net = loadNetwork();
  const base = lang === "hu" ? PATHS.lines.hu : PATHS.lines.ro;
  const lines = net.lines.map((l) => enrichLine(net, l.id, lang));

  return (
    <Shell kind="lines" lang={lang}>
      <ul className={styles.lineList}>
        {lines.map((l) => (
          <li key={l.id}>
            <a href={`${base}${l.id}/`} className={styles.lineLink}>
              {/* the operator's published colour; decorative, so hidden from AT */}
              <span
                className={styles.swatch}
                style={{ background: l.colour }}
                aria-hidden="true"
              />
              <span className={styles.lineLabel}>{l.label}</span>
              <span className={styles.termini}>
                {l.termini[0]} – {l.termini[1]}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </Shell>
  );
}

/** `/megallok/` (+ `/ro/statii/`): every place, grouped A-Z by the first letter
 *  of the display name in this language, each group an `<h2>` + a list of
 *  links. The RO path carries the place's own RO slug, never the HU one. */
export function StopIndex({ lang }: { lang: Lang }) {
  const net = loadNetwork();
  const base = lang === "hu" ? PATHS.stops.hu : PATHS.stops.ro;

  // buildPlaces is sorted by HU slug; regroup on the localized display name.
  const groups = new Map<string, { name: string; href: string }[]>();
  for (const p of buildPlaces(net)) {
    const name = p.name[lang];
    const letter = name.charAt(0).toUpperCase();
    const slug = lang === "hu" ? p.slug : p.slugRo;
    const bucket = groups.get(letter);
    const entry = { name, href: `${base}${slug}/` };
    if (bucket) bucket.push(entry);
    else groups.set(letter, [entry]);
  }
  const letters = [...groups.keys()].sort(byText);

  return (
    <Shell kind="stops" lang={lang}>
      {letters.map((letter) => (
        <section key={letter} className={styles.group}>
          <h2 className={styles.letter}>{letter}</h2>
          <ul className={styles.stopList}>
            {groups
              .get(letter)!
              .sort((a, b) => byText(a.name, b.name))
              .map((s) => (
                <li key={s.href}>
                  <a href={s.href}>{s.name}</a>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </Shell>
  );
}
