import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PageFrame from "@/components/seo/PageFrame";
import BoardTable from "@/components/seo/BoardTable";
import { pageMetadata } from "@/lib/seo/metadata";
import { loadNetwork } from "@/lib/seo/network";
import { enrichLine, lineDirections, type Board, type SeoLang } from "@/lib/seo/lines";
import { pickName } from "@/lib/seo/lang";
import { buildPlaces, placeOf, type Place } from "@/lib/seo/places";
import type { LngLat, Network } from "@/lib/engine/types";
import { lineSlug } from "@/lib/seo/slug";
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
  en: { name: "Sepsi Menetrend", path: "/en/" },
};

/** The stop-index crumb - label and path must match `IndexShell`/`urls.ts`. */
const INDEX: Record<SeoLang, { name: string; path: string }> = {
  hu: { name: "Megállók", path: "/megallok/" },
  ro: { name: "Stații", path: "/ro/statii/" },
  en: { name: "Stops", path: "/en/stops/" },
};

const huPath = (slug: string) => `/megallok/${slug}/`;
const roPath = (slug: string) => `/ro/statii/${slug}/`;
const enPath = (slug: string) => `/en/stops/${slug}/`;
const lineHref = (lang: SeoLang, id: string) =>
  lang === "hu" ? `/vonalak/${lineSlug(id)}/` : lang === "ro" ? `/ro/linii/${lineSlug(id)}/` : `/en/lines/${lineSlug(id)}/`;
const placeHref = (lang: SeoLang, p: Place) =>
  lang === "hu" ? huPath(p.slug) : lang === "ro" ? roPath(p.slugRo) : enPath(p.slug);

const T = {
  hu: {
    h1: (name: string) => `${name} megálló`,
    lines: "Vonalak",
    nearby: "Közeli megállók",
    minutes: "perc",
    approx: "kb.",
    cta: "Nyisd meg a megállót a tervezőben",
    fullGrid: "Mikor ér a többi megállóba? Teljes menetrend →",
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
    approx: "aprox.",
    cta: "Deschide stația în planificator",
    fullGrid: "Când ajunge în celelalte stații? Orarul complet →",
    intro: (name: string, labels: string) =>
      `Stația ${name} este una dintre stațiile de autobuz Multi-Trans din Sfântu Gheorghe.`
      + (labels ? ` Aici opresc următoarele linii: ${labels}.` : "")
      + " Orele de plecare de mai sus provin de pe afișele oficiale Multi-Trans"
      + " (multitrans.ro); pentru date live folosește planificatorul.",
  },
  en: {
    h1: (name: string) => `${name} stop`,
    lines: "Lines",
    nearby: "Nearby stops",
    minutes: "min",
    approx: "approx.",
    cta: "Open the stop in the planner",
    fullGrid: "When does it reach the other stops? Full timetable →",
    intro: (name: string, labels: string) =>
      `${name} is one of the Multi-Trans bus stops in Sfântu Gheorghe.`
      + (labels ? ` The following lines call here: ${labels}.` : "")
      + " The departure times above are from the official Multi-Trans stop signs"
      + " (multitrans.ro); for live data use the route planner.",
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
    : lang === "ro"
    ? `${head} și alte ${extra} linii`
    : `${head} and ${extra} more lines`;
}

/** A board's `destination` is one "RO / HU" string in the feed - split it. */
function headsign(destination: string, lang: SeoLang): string {
  const at = destination.indexOf(" / ");
  if (at === -1) return destination;
  // hu and en take the part after " / "; only ro takes the leading half.
  return lang === "ro" ? destination.slice(0, at) : destination.slice(at + 3);
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

/** An English page names a stop the way both of its signs do - "Árkos
 *  Központ (Centru Arcuș)" - so either name finds it; one name when they match. */
function enStopName(place: Place): string {
  return place.name.hu === place.name.ro ? place.name.hu : `${place.name.hu} (${place.name.ro})`;
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
  stopId: string;
  destination: string;
  board: Board;
}

/** Ascending, de-duplicated union of a printed column and its marked extras -
 *  the marked departures are D-extension trips the operator lists on the same
 *  column and they leave this stop for real. Mirrors the private
 *  `mergeDepartures` in `lib/seo/lines`; kept local so the page renders each
 *  row directly instead of `boardFor`, which resolves only ONE column per
 *  (line, kerb) and so silently drops the second direction at a hub. */
const mergeCol = (base: number[] = [], marked?: number[]): number[] =>
  [...new Set([...base, ...(marked ?? [])])].sort((a, z) => a - z);

/** Every printed column at this place: one per distinct (line, kerb,
 *  destination) row in `officialBoards`, in feed order. A kerb the feed binds
 *  two opposite-direction rows to (hub stops - Vasútállomás, Autoliv, Lábasház)
 *  yields a board for each direction, not just the first. Empty columns skipped. */
/** Whether the line page's every-stop grid anchors a row at this kerb - it
 *  does for any stop a direction departs from (every row but the last), see
 *  `StopGridTable`. */
const hasGridRow = (net: Network, lineId: string, stopId: string): boolean =>
  lineDirections(net, lineId).some((d) => d.stopIds.indexOf(stopId) > -1
    && d.stopIds.indexOf(stopId) < d.stopIds.length - 1);

function boardColumns(net: Network, place: Place): BoardColumn[] {
  const mine = new Set(place.stopIds);
  const seen = new Set<string>();
  const cols: BoardColumn[] = [];
  for (const b of net.officialBoards ?? []) {
    if (!b.stopId || !mine.has(b.stopId)) continue;
    const key = `${b.lineId}|${b.stopId}|${b.destination}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const weekday = mergeCol(b.weekday, b.markedWeekday);
    const weekend = mergeCol(b.weekend, b.markedWeekend);
    if (weekday.length === 0 && weekend.length === 0) continue;
    cols.push({ lineId: b.lineId, stopId: b.stopId, destination: b.destination, board: { weekday, weekend } });
  }
  return cols;
}

interface Nearby {
  place: Place;
  metres: number;
  minutes: number;
  /** true = a straight-line guess (no stored footpath), shown with a "kb." hedge. */
  estimated: boolean;
}

const NEARBY_MAX = 5;
const WALK_PACE_M_PER_MIN = 80;
/** Straight-line legs run longer on the ground - the engine's `DETOUR`
 *  (lib/engine/plan.ts). Inlined so this page stays clear of the planner. */
const DETOUR = 1.35;
/** Past this crow-flies distance a place is not "nearby" in any useful sense.
 *  If the feed has no footpath and nothing sits inside the radius, the page
 *  says nothing rather than pointing at a stop 4 km up a valley. */
const NEARBY_RADIUS_M = 1200;

/** The nearest other places. `net.walks` is the good source - real pedestrian
 *  metres and seconds, shown as-is. Only ~17 places have a stored cross-place
 *  footpath, so when fewer than three turn up a centroid straight-line distance
 *  (× detour factor, ~80 m/min) backfills the list - but only within
 *  `NEARBY_RADIUS_M`, and each such entry is flagged as an estimate. A place
 *  with nothing real and nothing inside the radius gets no list at all. */
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
      estimated: false,
    });
  }

  if (found.size < 3) {
    const rest = places
      .filter((p) => p.slug !== place.slug && !found.has(p.slug))
      .map((p) => ({ p, d: haversine(place.at, p.at) }))
      .filter((x) => x.d <= NEARBY_RADIUS_M)
      .sort((a, b) => a.d - b.d);
    for (const { p, d } of rest) {
      if (found.size >= NEARBY_MAX) break;
      const metres = Math.round(d * DETOUR);
      found.set(p.slug, {
        place: p,
        metres,
        minutes: Math.max(1, Math.round(metres / WALK_PACE_M_PER_MIN)),
        estimated: true,
      });
    }
  }

  return [...found.values()].sort((a, b) => a.metres - b.metres).slice(0, NEARBY_MAX);
}

/** `<head>` for a place page. Title and description are templated per language
 *  from the place name and the lines that serve it; the share card is this
 *  page's own `opengraph-image` route, so `ownOgImage` strips the default
 *  `/og.png` (without it Next never emits the file-convention `og:image`). */
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
          title: `${place.name.hu} megálló – busz menetrend, Sepsiszentgyörgy`,
          description:
            `${place.name.hu} buszmegálló Sepsiszentgyörgyön (Sepsi): az itt közlekedő `
            + `Multi-Trans buszjáratok (${list}) indulási ideje hétköznap és hétvégén.`,
        }
      : lang === "ro"
      ? {
          title: `Stația ${place.name.ro} – orar autobuz Sfântu Gheorghe`,
          description:
            `Stația ${place.name.ro} din Sfântu Gheorghe (Sepsiszentgyörgy): orele de plecare `
            + `ale liniilor Multi-Trans (${list}) care opresc aici, zi lucrătoare și weekend.`,
        }
      : {
          // the Romanian name too: an English speaker reads it off the street sign
          title: `${enStopName(place)} bus stop – Sfântu Gheorghe`,
          description:
            `${enStopName(place)} bus stop in Sfântu Gheorghe (Sepsiszentgyörgy), Romania: departure times of the `
            + `Multi-Trans lines (${list}) that call here, weekday and weekend.`,
        };

  return pageMetadata({
    huPath: huPath(place.slug),
    roPath: roPath(place.slugRo),
    enPath: enPath(place.slug),
    lang,
    title,
    description,
    ownOgImage: true,
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
  const name = pickName(place.name, lang);
  const introLines = lineSummary(labels, lang, 4);

  const selfPath =
    lang === "hu" ? huPath(place.slug) : lang === "ro" ? roPath(place.slugRo) : enPath(place.slug);
  const t = T[lang];

  return (
    <PageFrame
      lang={lang}
      kind="place"
      paths={{ hu: huPath(place.slug), ro: roPath(place.slugRo), en: enPath(place.slug) }}
      crumbs={[HOME[lang], INDEX[lang], { name, path: selfPath }]}
    >
      <h1 className={styles.h1}>{t.h1(name)}</h1>

      {columns.map((col) => (
        <section key={`${col.lineId}-${col.destination}`} className={styles.line}>
          <h2 className={styles.headsign}>
            {enrichLine(net, col.lineId, lang).label} → {headsign(col.destination, lang)}
          </h2>
          <BoardTable lang={lang} weekday={col.board.weekday} weekend={col.board.weekend} />
          {hasGridRow(net, col.lineId, col.stopId) ? (
            <p className={styles.gridLink}>
              <a href={`${lineHref(lang, col.lineId)}#at-${col.stopId}`}>{t.fullGrid}</a>
            </p>
          ) : null}
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
                <a href={placeHref(lang, n.place)}>{pickName(n.place.name, lang)}</a>{" "}
                <span className={styles.dist}>
                  {n.estimated ? `${t.approx} ` : ""}{n.metres} m · {n.minutes} {t.minutes}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className={styles.cta}>
        <a href={`/?stop=${place.stopIds[0]}${lang === "hu" ? "" : `&lang=${lang}`}`}>{t.cta}</a>
      </p>

      <hr className={styles.divider} />

      <p className={styles.intro}>{t.intro(name, introLines)}</p>
    </PageFrame>
  );
}
