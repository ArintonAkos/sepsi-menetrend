import type { Metadata } from "next";
import PageFrame from "@/components/seo/PageFrame";
import BoardTable from "@/components/seo/BoardTable";
import StopList from "@/components/seo/StopList";
import RouteShape from "@/components/seo/RouteShape";
import { pageMetadata } from "@/lib/seo/metadata";
import { loadNetwork } from "@/lib/seo/network";
import { pickName } from "@/lib/seo/lang";
import {
  enrichLine,
  lineDirections,
  boardFor,
  firstLast,
  headway,
  type Board,
  type SeoLang,
} from "@/lib/seo/lines";
import { buildPlaces, placeOf, type Place } from "@/lib/seo/places";
import { mapImage } from "@/lib/seo/line-maps";
import { formatHHMM } from "@/lib/engine/time";
import styles from "./LinePage.module.css";

/** One line's page (`/vonalak/[id]/` + `/ro/linii/[id]/`), content first: the
 *  operator's printed departure board and the stop sequence for each direction
 *  come before any prose, because that is what a search visitor arrived for.
 *  The planner is the live authority - every direction links into it.
 *
 *  A server component - a crawl target, shipped as static HTML with no client
 *  JS. The `/ro/` twin is built as Hungarian then language-stamped
 *  (`lib/seo/localize.ts`), so `lang` is passed in explicitly. */

const HOME: Record<SeoLang, { name: string; path: string }> = {
  hu: { name: "Sepsi Menetrend", path: "/" },
  ro: { name: "Sepsi Menetrend", path: "/ro/" },
  en: { name: "Sepsi Menetrend", path: "/en/" },
};

/** The line-index crumb - label and path must match `IndexShell`/`urls.ts`. */
const INDEX: Record<SeoLang, { name: string; path: string }> = {
  hu: { name: "Vonalak", path: "/vonalak/" },
  ro: { name: "Linii", path: "/ro/linii/" },
  en: { name: "Lines", path: "/en/lines/" },
};

const huPath = (id: string) => `/vonalak/${id}/`;
const roPath = (id: string) => `/ro/linii/${id}/`;
const enPathFn = (id: string) => `/en/lines/${id}/`;

/** Hungarian definite article for the spoken line name: "egyes"/"ötös" and the
 *  "egy…"/"öt…" D-lines open on a vowel and take "az", every other line "a".
 *  Same closed-set tabulation as `lines.ts`'s suffix stems. */
const HU_AZ = new Set(["1", "1D", "5", "5D"]);
const huArticle = (id: string, sentenceStart = false): string => {
  const a = HU_AZ.has(id) ? "az" : "a";
  return sentenceStart ? a.charAt(0).toUpperCase() + a.slice(1) : a;
};

/** `<head>` for a line page. Title and description are templated per language
 *  from the feed's spoken label and termini. Each line ships its own
 *  `opengraph-image` card, so `ownOgImage` strips the default `/og.png`. */
export function lineMetadata(id: string, lang: SeoLang): Metadata {
  const net = loadNetwork();
  const { label, termini } = enrichLine(net, id, lang);
  const [a, b] = termini;

  const { title, description } =
    lang === "hu"
      ? {
          title: `${label} menetrendje – Sepsiszentgyörgy`,
          description:
            `${huArticle(id, true)} ${label} (${a} – ${b}) hivatalos buszmenetrendje: `
            + `indulási idők és megállók, hétköznap és hétvégén. Sepsiszentgyörgy, Multi-Trans.`,
        }
      : lang === "ro"
      ? {
          title: `Linia ${id} – orar autobuz Sfântu Gheorghe`,
          description:
            `Orarul oficial al liniei ${id} (${a} – ${b}): ore de plecare și `
            + `stații, zi lucrătoare și weekend. Sfântu Gheorghe, Multi-Trans.`,
        }
      : {
          title: `Line ${id} – bus schedule Sfântu Gheorghe`,
          description:
            `Official schedule for line ${id} (${a} – ${b}): departure times and stops, `
            + `weekday and weekend. Sfântu Gheorghe, Multi-Trans.`,
        };

  return pageMetadata({
    huPath: huPath(id),
    roPath: roPath(id),
    enPath: enPathFn(id),
    lang,
    title,
    description,
    ownOgImage: true,
  });
}

const T = {
  hu: {
    freeFriday: "Pénteken a városi járatok ingyenesek (a Multi-Trans közlése szerint).",
    cta: "Nyisd meg a menetrendben",
    weekday: "hétköznap",
    weekend: "hétvégén",
    span: (svc: string, first: string, last: string) =>
      `Első indulás ${svc} ${first}, utolsó ${last}.`,
    noWeekend: "Hétvégén nem közlekedik.",
    headway: (n: number) => `Követési idő kb. ${n} perc.`,
    fareLead: "Jegyár",
    fareSource: " (a multitrans.ro szerint)",
  },
  ro: {
    freeFriday: "Vinerea, cursele urbane sunt gratuite (conform anunțurilor Multi-Trans).",
    cta: "Deschide în planificator",
    weekday: "în zilele lucrătoare",
    weekend: "în weekend",
    span: (svc: string, first: string, last: string) =>
      `Prima plecare ${svc} la ${first}, ultima la ${last}.`,
    noWeekend: "În weekend nu circulă.",
    headway: (n: number) => `Interval de succedare aproximativ ${n} minute.`,
    fareLead: "Tarif bilet",
    fareSource: " (conform multitrans.ro)",
  },
  en: {
    freeFriday: "City services are free on Fridays (per Multi-Trans announcements).",
    cta: "Open in the planner",
    weekday: "on weekdays",
    weekend: "at weekends",
    span: (svc: string, first: string, last: string) =>
      `First departure ${svc} ${first}, last ${last}.`,
    noWeekend: "No weekend service.",
    headway: (n: number) => `Roughly every ${n} minutes.`,
    fareLead: "Ticket price",
    fareSource: " (per multitrans.ro)",
  },
} as const;

/** First/last per service plus a headway when the board is regular enough to
 *  name one, in one sentence. `firstLast` returns `null` for a service that
 *  never runs from the terminus. */
function spanLine(lang: SeoLang, board: Board): string {
  const t = T[lang];
  const { weekday, weekend } = firstLast(board);
  const parts: string[] = [];
  if (weekday) parts.push(t.span(t.weekday, formatHHMM(weekday.first), formatHHMM(weekday.last)));
  if (weekend) parts.push(t.span(t.weekend, formatHHMM(weekend.first), formatHHMM(weekend.last)));
  else parts.push(t.noWeekend);
  const hw = headway(board.weekday);
  if (hw) parts.push(t.headway(hw));
  return parts.join(" ");
}

/** The single-ride fare for this line's zone. Line 10 runs out to Arcuș (Árkos);
 *  every other line is city tariff. The operator hedge is printed once per page
 *  (`hedge` is true only on the first direction). */
function fareChip(lang: SeoLang, id: string, hedge: boolean): string {
  const arcus = id === "10";
  const amount =
    lang === "hu"
      ? arcus ? "4 lej / 60 perc" : "2,5 lej / 50 perc"
      : lang === "ro"
      ? arcus ? "4 lei / 60 min" : "2,5 lei / 50 min"
      : arcus ? "4 lei / 60 min" : "2.5 lei / 50 min";
  const t = T[lang];
  return `${t.fareLead}: ${amount}${hedge ? t.fareSource : ""}.`;
}

/** The direction's stops as stop-page links, collapsing a consecutive repeat
 *  when a direction lists both kerbs of one place. Every feed stop maps to a
 *  Place; `?? sid` only guards the types. */
function stopEntries(places: Place[], stopIds: string[], lang: SeoLang) {
  const out: { name: string; slug: string }[] = [];
  let prev = "";
  for (const sid of stopIds) {
    const p = placeOf(places, sid);
    const slug = (lang === "ro" ? p?.slugRo : p?.slug) ?? sid;
    if (slug === prev) continue;
    prev = slug;
    out.push({ name: p ? pickName(p.name, lang) : sid, slug });
  }
  return out;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** 2-3 templated sentences: what the line is, where it runs, that the cadence
 *  differs by day. Plain text so the board-before-prose order is unambiguous. */
function intro(lang: SeoLang, id: string, label: string, termini: [string, string]): string {
  const [a, b] = termini;
  if (lang === "hu") {
    return (
      `${huArticle(id, true)} ${label} a Multi-Trans egyik városi buszjárata Sepsiszentgyörgyön, `
      + `${a} és ${b} között közlekedik. Hétköznap sűrűbben, hétvégén ritkábban indul. `
      + `A fenti indulási idők a Multi-Trans hivatalos tábláiról származnak; élőben az útvonaltervező számol.`
    );
  }
  if (lang === "ro") {
    return (
      `${cap(label)} este una dintre liniile de autobuz urbane Multi-Trans din Sfântu Gheorghe `
      + `și circulă între ${a} și ${b}. În zilele lucrătoare are curse mai dese, în weekend mai rare. `
      + `Orele de plecare de mai sus provin de pe afișele oficiale Multi-Trans; calculul live îl face planificatorul.`
    );
  }
  return (
    `Line ${id} is one of Multi-Trans's city bus lines in Sfântu Gheorghe, `
    + `running between ${a} and ${b}. It runs more often on weekdays and less at weekends. `
    + `The departure times above are from the official Multi-Trans stop signs; the route planner does the live calculation.`
  );
}

export default async function LinePage({ lang, id }: { lang: SeoLang; id: string }) {
  const net = loadNetwork();
  const places = buildPlaces(net);
  const line = net.lines.find((l) => l.id === id);
  const { label, title, termini } = enrichLine(net, id, lang);
  const dirs = lineDirections(net, id);

  const selfPath =
    lang === "hu" ? huPath(id) : lang === "ro" ? roPath(id) : enPathFn(id);

  return (
    <PageFrame
      lang={lang}
      kind="line"
      paths={{ hu: huPath(id), ro: roPath(id), en: enPathFn(id) }}
      crumbs={[HOME[lang], INDEX[lang], { name: label, path: selfPath }]}
    >
      <h1 className={styles.h1}>{title}</h1>

      {dirs.map((dir, i) => {
        // the direction's own terminus is where its printed board is columned
        const board = boardFor(net, id, dir.stopIds[0]);
        const pattern = net.patterns.find((p) => p.id === dir.patternId);
        const stops = stopEntries(places, dir.stopIds, lang);
        const headsign = pickName(dir.headsign, lang);
        const mapSrc = mapImage(id, i);
        // Both directions carry a map; the headsign in the alt is what lets a
        // screen reader or a crawler tell the two apart.
        const mapAlt =
          lang === "hu"
            ? `${huArticle(id, true)} ${label} útvonala a térképen: ${headsign}`
            : lang === "ro"
            ? `Traseul liniei ${id} pe hartă: ${headsign}`
            : `Route of line ${id} on the map: ${headsign}`;

        return (
          <section key={dir.patternId} className={styles.direction}>
            <h2 className={styles.headsign}>{headsign}</h2>

            {board ? (
              <BoardTable lang={lang} weekday={board.weekday} weekend={board.weekend} />
            ) : null}
            {board ? <p className={styles.meta}>{spanLine(lang, board)}</p> : null}

            <p className={styles.note}>{fareChip(lang, id, i === 0)}</p>
            <p className={styles.note}>{T[lang].freeFriday}</p>

            <p className={styles.cta}>
              <a href={`/?line=${id}&service=weekday${lang === "hu" ? "" : `&lang=${lang}`}`}>{T[lang].cta}</a>
            </p>

            <StopList lang={lang} stops={stops} />

            {mapSrc ? (
              // These pages ship zero client JS; next/image would pull its
              // runtime in (and with `images: { unoptimized: true }` there is
              // no optimiser to gain). A plain static asset from `public/maps/`
              // — same call repo precedent makes in HouseAd / InstallApp.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={mapSrc}
                alt={mapAlt}
                width={640}
                height={360}
                loading="lazy"
                decoding="async"
                className={styles.routeMap}
              />
            ) : pattern ? (
              <RouteShape shape={pattern.shape} colour={line?.light ?? "#555"} />
            ) : null}
          </section>
        );
      })}

      <hr className={styles.divider} />

      <p className={styles.intro}>{intro(lang, id, label, termini)}</p>
    </PageFrame>
  );
}
