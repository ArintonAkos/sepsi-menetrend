import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PageFrame from "@/components/seo/PageFrame";
import BoardTable from "@/components/seo/BoardTable";
import { pageMetadata } from "@/lib/seo/metadata";
import { loadNetwork } from "@/lib/seo/network";
import { enrichLine, boardFor, type Board, type SeoLang } from "@/lib/seo/lines";
import { buildPlaces, placeOf, type Place } from "@/lib/seo/places";
import type { LngLat, Network } from "@/lib/engine/types";
import styles from "./PlacePage.module.css";

/** One physical place's page (`/megallok/[slug]/` + `/ro/statii/[slug]/`),
 *  content first: the operator's printed departure boards for every line that
 *  leaves this kerb come before any prose. The planner is the live authority -
 *  the CTA hands the kerb straight to it.
 *
 *  A server component - a crawl target, shipped as static HTML with no client
 *  JS. The `/ro/` twin is built as Hungarian then language-stamped
 *  (`lib/seo/localize.ts`), so `lang` is passed in explicitly. The two
 *  languages carry independent slugs (Ruling R15): `slug` off the HU name,
 *  `slugRo` off the RO name, and Romanian speakers never search the Hungarian
 *  word. */

const HOME: Record<SeoLang, { name: string; path: string }> = {
  hu: { name: "Sepsi Menetrend", path: "/" },
  ro: { name: "Sepsi Menetrend", path: "/ro/" },
};

/** The stop-index crumb - label and path must match `IndexShell`/`urls.ts`. */
const INDEX: Record<SeoLang, { name: string; path: string }> = {
  hu: { name: "Megállók", path: "/megallok/" },
  ro: { name: "Stații", path: "/ro/statii/" },
};

const huPath = (slug: string) => `/megallok/${slug}/`;
const roPath = (slug: string) => `/ro/statii/${slug}/`;
const lineHref = (lang: SeoLang, id: string) =>
  lang === "hu" ? `/vonalak/${id}/` : `/ro/linii/${id}/`;
const placeHref = (lang: SeoLang, p: Place) =>
  lang === "hu" ? huPath(p.slug) : roPath(p.slugRo);

const T = {
  hu: {
    h1: (name: string) => `${name} megálló`,
    lines: "Vonalak",
    nearby: "Közeli megállók",
    minutes: "perc",
    cta: "Nyisd meg a megállót a tervezőben",
    intro: (name: string, labels: string) =>
      `${name} egyike Sepsiszentgyörgy Multi-Trans buszmegállóinak.`
      + (labels ? ` Itt a következő vonalak állnak meg: ${labels}.` : "")
      + " A fenti indulási idők a Multi-Trans hivatalos tábláiról (multitrans.ro)"
      + " származnak; élő adatért az útvonaltervező számol.",
  },
  ro: {
    h1: (name: string) => `Stația ${name}`,
    lines: "Linii",
    nearby: "Stații din apropiere",
    minutes: "min",
    cta: "Deschide stația în planificator",
    intro: (name: string, labels: string) =>
      `Stația ${name} este una dintre stațiile de autobuz Multi-Trans din Sfântu Gheorghe.`
      + (labels ? ` Aici opresc următoarele linii: ${labels}.` : "")
      + " Orele de plecare de mai sus provin de pe afișele oficiale Multi-Trans"
      + " (multitrans.ro); pentru date live folosește planificatorul.",
  },
} as const;

/** A comma list of line labels, collapsed to a count past `max` so a hub stop's
 *  title and prose stay short. */
function lineSummary(labels: string[], lang: SeoLang, max: number): string {
  if (labels.length <= max) return labels.join(", ");
  const extra = labels.length - max;
  const head = labels.slice(0, max).join(", ");
  return lang === "hu"
    ? `${head} és további ${extra} vonal`
    : `${head} și alte ${extra} linii`;
}

/** A board's `destination` is one "RO / HU" string in the feed - split it. */
function headsign(destination: string, lang: SeoLang): string {
  const at = destination.indexOf(" / ");
  if (at === -1) return destination;
  return lang === "hu" ? destination.slice(at + 3) : destination.slice(0, at);
}

/** Great-circle metres - a local copy for the same reason `places.ts` keeps
 *  one: the engine's helper is an equirectangular approximation bundled with
 *  the whole planner, and this page has no reason to pull that in. */
function haversine(a: LngLat, b: LngLat): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function resolvePlace(net: Network, lang: SeoLang, slug: string): Place | undefined {
  return buildPlaces(net).find((p) => (lang === "ro" ? p.slugRo : p.slug) === slug);
}

/** Which lines call at this place. `officialBoards` is the authority - a
 *  printed column means the line really leaves this kerb; `patterns` only
 *  backfills a line that has no board here. Feed order, deduped. */
function servingLineIds(net: Network, place: Place): string[] {
  const mine = new Set(place.stopIds);
  const ids = new Set<string>();
  for (const b of net.officialBoards ?? []) {
    if (b.stopId && mine.has(b.stopId)) ids.add(b.lineId);
  }
  for (const p of net.patterns) {
    if (p.stopIds.some((s) => mine.has(s))) ids.add(p.lineId);
  }
  return net.lines.filter((l) => ids.has(l.id)).map((l) => l.id);
}

interface BoardColumn {
  lineId: string;
  destination: string;
  board: Board;
}

/** One printed column per (line, kerb) pair at this place, in feed order.
 *  A pair with no board is skipped. */
function boardColumns(net: Network, place: Place): BoardColumn[] {
  const mine = new Set(place.stopIds);
  const seen = new Set<string>();
  const cols: BoardColumn[] = [];
  for (const b of net.officialBoards ?? []) {
    if (!b.stopId || !mine.has(b.stopId)) continue;
    const key = `${b.lineId}|${b.stopId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const board = boardFor(net, b.lineId, b.stopId);
    if (!board) continue;
    cols.push({ lineId: b.lineId, destination: b.destination, board });
  }
  return cols;
}

interface Nearby {
  place: Place;
  metres: number;
  minutes: number;
}

const NEARBY_MAX = 5;

/** The nearest other places. `net.walks` is the good source - real pedestrian
 *  metres and seconds - but the feed only stores a footpath for some kerbs, so
 *  straight-line centroid distance backfills to keep every page's list useful.
 *  Walked minutes come off the stored path; the fallback assumes ~80 m/min. */
function nearbyPlaces(net: Network, places: Place[], place: Place): Nearby[] {
  const mine = new Set(place.stopIds);
  const found = new Map<string, Nearby>();

  for (const w of [...net.walks].sort((a, b) => a.metres - b.metres)) {
    const other = mine.has(w.from) ? w.to : mine.has(w.to) ? w.from : null;
    if (!other) continue;
    const p = placeOf(places, other);
    if (!p || p.slug === place.slug || found.has(p.slug)) continue;
    found.set(p.slug, {
      place: p,
      metres: Math.round(w.metres),
      minutes: Math.max(1, Math.round(w.seconds / 60)),
    });
  }

  if (found.size < 3) {
    const rest = places
      .filter((p) => p.slug !== place.slug && !found.has(p.slug))
      .map((p) => ({ p, d: haversine(place.at, p.at) }))
      .sort((a, b) => a.d - b.d);
    for (const { p, d } of rest) {
      if (found.size >= NEARBY_MAX) break;
      found.set(p.slug, { place: p, metres: Math.round(d), minutes: Math.max(1, Math.round(d / 80)) });
    }
  }

  return [...found.values()].sort((a, b) => a.metres - b.metres).slice(0, NEARBY_MAX);
}

/** `<head>` for a place page. Title and description are templated per language
 *  from the place name and the lines that serve it. */
export function placeMetadata(slug: string, lang: SeoLang): Metadata {
  const net = loadNetwork();
  const place = resolvePlace(net, lang, slug);
  if (!place) notFound();

  const list = lineSummary(
    servingLineIds(net, place).map((id) => enrichLine(net, id, lang).label),
    lang,
    4,
  );

  const { title, description } =
    lang === "hu"
      ? {
          title: `${place.name.hu} megálló – buszindulások`,
          description:
            `${place.name.hu} buszmegálló Sepsiszentgyörgyön: az itt közlekedő `
            + `Multi-Trans vonalak (${list}) hivatalos indulási idői hétköznap és hétvégén.`,
        }
      : {
          title: `Stația ${place.name.ro} – plecări autobuz`,
          description:
            `Stația ${place.name.ro} din Sfântu Gheorghe: orele oficiale de plecare `
            + `ale liniilor Multi-Trans (${list}) care opresc aici, zi lucrătoare și weekend.`,
        };

  return pageMetadata({
    huPath: huPath(place.slug),
    roPath: roPath(place.slugRo),
    lang,
    title,
    description,
  });
}

export default async function PlacePage({ lang, slug }: { lang: SeoLang; slug: string }) {
  const net = loadNetwork();
  const places = buildPlaces(net);
  const place = places.find((p) => (lang === "ro" ? p.slugRo : p.slug) === slug);
  if (!place) notFound();

  const columns = boardColumns(net, place);
  const lineIds = servingLineIds(net, place);
  const nearby = nearbyPlaces(net, places, place);
  const labels = lineIds.map((id) => enrichLine(net, id, lang).label);
  const name = place.name[lang];
  const introLines = lineSummary(labels, lang, 4);

  const selfPath = lang === "hu" ? huPath(place.slug) : roPath(place.slugRo);
  const twinPath = lang === "hu" ? roPath(place.slugRo) : huPath(place.slug);
  const t = T[lang];

  return (
    <PageFrame
      lang={lang}
      twinPath={twinPath}
      crumbs={[HOME[lang], INDEX[lang], { name, path: selfPath }]}
    >
      <h1 className={styles.h1}>{t.h1(name)}</h1>

      {columns.map((col) => (
        <section key={`${col.lineId}-${col.destination}`} className={styles.line}>
          <h2 className={styles.headsign}>
            {enrichLine(net, col.lineId, lang).label} → {headsign(col.destination, lang)}
          </h2>
          <BoardTable lang={lang} weekday={col.board.weekday} weekend={col.board.weekend} />
        </section>
      ))}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t.lines}</h2>
        <ul className={styles.chips}>
          {lineIds.map((id) => {
            const line = enrichLine(net, id, lang);
            return (
              <li key={id}>
                <a href={lineHref(lang, id)} className={styles.chip}>
                  {/* the operator's published colour; decorative, so hidden from AT */}
                  <span
                    className={styles.swatch}
                    style={{ background: line.colour }}
                    aria-hidden="true"
                  />
                  <span className={styles.chipLabel}>{line.label}</span>
                </a>
              </li>
            );
          })}
        </ul>
      </section>

      {nearby.length > 0 ? (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t.nearby}</h2>
          <ul className={styles.nearby}>
            {nearby.map((n) => (
              <li key={n.place.slug}>
                <a href={placeHref(lang, n.place)}>{n.place.name[lang]}</a>{" "}
                <span className={styles.dist}>
                  {n.metres} m · {n.minutes} {t.minutes}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className={styles.cta}>
        <a href={`/?stop=${place.stopIds[0]}`}>{t.cta}</a>
      </p>

      <hr className={styles.divider} />

      <p className={styles.intro}>{t.intro(name, introLines)}</p>
    </PageFrame>
  );
}
