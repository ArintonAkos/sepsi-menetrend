import type { ReactNode } from "react";
import type { Metadata } from "next";
import PageFrame from "@/components/seo/PageFrame";
import { pageMetadata } from "@/lib/seo/metadata";
import { loadNetwork } from "@/lib/seo/network";
import { enrichLine, sentenceCase } from "@/lib/seo/lines";
import { buildPlaces, type Place } from "@/lib/seo/places";
import { notablePairs } from "@/lib/seo/routes";
import { slugify } from "@/lib/seo/slug";
import styles from "./IndexShell.module.css";

/** The three index pages - `/vonalak/` (every line), `/megallok/` (every place)
 *  and `/utvonal/` (every notable route pair) - and their `/ro/` twins. They are
 *  the internal-linking backbone: every generated line, stop and route page
 *  hangs off one of these lists.
 *
 *  Server components on purpose - crawl targets, shipped as static HTML with no
 *  client JS, plain `<a>` links (same reasoning as `PageFrame`). The `/ro/`
 *  twin is built as Hungarian and language-stamped afterwards
 *  (`lib/seo/localize.ts`), so `lang` is passed in explicitly. */

type Lang = "hu" | "ro";
type Kind = "lines" | "stops" | "routes";

/** HU/RO path pair per index. Must match the inventory in `lib/seo/urls.ts`
 *  exactly, or an index loses its canonical URL / language twin. */
const PATHS: Record<Kind, { hu: string; ro: string }> = {
  lines: { hu: "/vonalak/", ro: "/ro/linii/" },
  stops: { hu: "/megallok/", ro: "/ro/statii/" },
  routes: { hu: "/utvonal/", ro: "/ro/trasee/" },
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
  routes: {
    hu: {
      crumb: "Útvonalak",
      metaTitle: "Buszos útvonalak Sepsiszentgyörgyön · Multi-Trans",
      metaDescription:
        "Buszos útvonalak Sepsiszentgyörgy fő célpontjai között - vasútállomás, "
        + "megyei kórház, Sepsi Aréna, Autoliv, Árkos -, kiindulóhely szerint "
        + "csoportosítva, minden útvonalnak külön oldalával.",
      h1: "Buszos útvonalak Sepsiszentgyörgyön",
      intro:
        "Multi-Trans városi busszal Sepsiszentgyörgy nevezetes pontjai között. "
        + "Válaszd ki a kiindulóhelyet, majd az úti célt: minden útvonal saját "
        + "oldalán ott a járat, az átszállások és a menetidő.",
    },
    ro: {
      crumb: "Trasee",
      metaTitle: "Trasee cu autobuzul în Sfântu Gheorghe · Multi-Trans",
      metaDescription:
        "Trasee de autobuz Multi-Trans între punctele importante din Sfântu "
        + "Gheorghe - gara, spitalul județean, Arena Sepsi, Autoliv, Arcuș -, "
        + "grupate după punctul de plecare, fiecare traseu cu pagina lui.",
      h1: "Trasee cu autobuzul în Sfântu Gheorghe",
      intro:
        "Cu autobuzul urban Multi-Trans între punctele cunoscute din Sfântu "
        + "Gheorghe. Alege punctul de plecare, apoi destinația: fiecare traseu "
        + "are pagina lui, cu linia, schimbările și durata.",
    },
  },
};

/** Codepoint order, not `localeCompare` - collation rules vary by build host
 *  (same reasoning as `lib/seo/places.ts`'s `byText`). */
const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Alphabetical order that folds accents first (`slugify`), raw name as the
 *  tiebreak - so "Gábor Áron" sorts by "gabor aron", before "Gyöngyvirág",
 *  not after it on the codepoint of "á". */
const byName = (a: string, b: string): number =>
  byText(slugify(a), slugify(b)) || byText(a, b);

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
              <span className={styles.lineLabel}>{sentenceCase(l.label)}</span>
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

/** `/megallok/` (+ `/ro/statii/`): every place, grouped A-Z by the ASCII-folded
 *  first letter of the display name in this language, each group an `<h2>` + a
 *  list of links. The RO path carries the place's own RO slug, never the HU one. */
export function StopIndex({ lang }: { lang: Lang }) {
  const net = loadNetwork();
  const base = lang === "hu" ? PATHS.stops.hu : PATHS.stops.ro;

  // buildPlaces is sorted by HU slug; regroup on the localized display name.
  // Bucket by the ASCII-folded first letter so "Árkos központ" files under "A"
  // and "Șugaș Băi" under "S" - a codepoint sort of the raw initial drops
  // Á / É / Ș into their own buckets after "Z", where nobody scans for them.
  // Only the bucket *key* is folded; the link text and within-group sort keep
  // the accented display name. `|| "#"` guards a name that folds to empty.
  const groups = new Map<string, { name: string; href: string }[]>();
  for (const p of buildPlaces(net)) {
    const name = p.name[lang];
    const letter = slugify(name).charAt(0).toUpperCase() || "#";
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
              .sort((a, b) => byName(a.name, b.name))
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

/** `/utvonal/` (+ `/ro/trasee/`): every notable route pair, grouped by origin
 *  place - an `<h2>` per origin, then a list of "→ {destination}" links to that
 *  pair's page. Pairs are unordered, so each one is listed under BOTH its
 *  endpoints (once as "→ B" under A, once as "→ A" under B): that gives every
 *  route page an inbound link from each endpoint's group and makes "routes from
 *  the train station" a real list. Without this page the ~91 route pages are
 *  orphans - nothing else links to them. */
export function RouteIndex({ lang }: { lang: Lang }) {
  const net = loadNetwork();
  const base = lang === "hu" ? PATHS.routes.hu : PATHS.routes.ro;

  // Keyed by origin `slug` (stable identity); the display name and links carry
  // the localized text. `notablePairs` is sorted by slug, so insertion order -
  // and therefore the pre-sort group order - is deterministic.
  const groups = new Map<
    string,
    { key: string; name: string; links: { name: string; href: string }[] }
  >();
  const link = (origin: Place, dest: Place, slug: string) => {
    let group = groups.get(origin.slug);
    if (!group) {
      group = { key: origin.slug, name: origin.name[lang], links: [] };
      groups.set(origin.slug, group);
    }
    group.links.push({ name: dest.name[lang], href: `${base}${slug}/` });
  };
  for (const pair of notablePairs(net)) {
    const slug = lang === "hu" ? pair.slug : pair.slugRo;
    link(pair.a, pair.b, slug);
    link(pair.b, pair.a, slug);
  }
  const origins = [...groups.values()].sort((a, b) => byName(a.name, b.name));

  return (
    <Shell kind="routes" lang={lang}>
      {origins.map((origin) => (
        <section key={origin.key} className={styles.group}>
          <h2 className={styles.origin}>{origin.name}</h2>
          <ul className={styles.stopList}>
            {origin.links
              .sort((a, b) => byName(a.name, b.name))
              .map((l) => (
                <li key={l.href}>
                  <a href={l.href}>→ {l.name}</a>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </Shell>
  );
}
