/** The Open Graph share card - one 1200x630 PNG per generated SEO page.
 *
 *  Rendered by `next/og` (Satori + resvg) from the per-page `opengraph-image`
 *  routes. Satori has no system fonts, so every glyph is drawn with the one
 *  embedded face below; an unlisted glyph would render as a tofu box.
 *
 *  Font: Geist-Regular, copied unmodified from
 *  `node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf` to
 *  `public/fonts/og.ttf`. SIL Open Font License 1.1 - full text and copyright
 *  in `public/fonts/OFL.txt`. Geist covers Latin Extended-A + Latin Extended
 *  Additional, so the Hungarian and Romanian diacritics all resolve - verified
 *  by rendering a probe card and eyeballing it for tofu.
 *
 *  `public/fonts/og-bold.ttf` is Geist-Bold from the same family (vercel/
 *  geist-font v1.7.2 release, same OFL), used only by `homeOg()`'s heading and
 *  pills - every other card here stays Regular-only, matching the original. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { CSSProperties } from "react";
import { ImageResponse } from "next/og";
import { GUIDES } from "./content";
import { pickName } from "./lang";
import type { SeoLang } from "./lang";
import { loadNetwork } from "./network";
import { enrichLine, lineDirections, sentenceCase } from "./lines";
import { huRoutePhrase } from "./hu-place-forms";
import { buildPlaces } from "./places";
// `routes.ts` pulls in places/lines/network/engine - none import this file, so
// there is no cycle (verified Task 22).
import { notablePairs } from "./routes";

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

/** Read the face once - it never varies between cards and one build renders
 *  hundreds of them. Returns a standalone ArrayBuffer (not a Buffer view) so
 *  the type matches what `ImageResponse` documents. */
let fontCache: Promise<ArrayBuffer> | undefined;
export function ogFont(): Promise<ArrayBuffer> {
  fontCache ??= readFile(join(process.cwd(), "public/fonts/og.ttf")).then(
    (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer,
  );
  return fontCache;
}

let fontBoldCache: Promise<ArrayBuffer> | undefined;
export function ogFontBold(): Promise<ArrayBuffer> {
  fontBoldCache ??= readFile(join(process.cwd(), "public/fonts/og-bold.ttf")).then(
    (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer,
  );
  return fontBoldCache;
}

export type OgProps = {
  kind: "line" | "place" | "route" | "guide";
  lang: SeoLang;
  heading: string;
  sub?: string;
  badge?: { text: string; bg: string; fg: string };
  shape?: [number, number][];
};

/** The disclaimer tag - said on the page too: a sharer must not be able to
 *  pass the card off as the operator's own. */
const TAG: Record<SeoLang, string> = {
  hu: "nem hivatalos",
  ro: "neoficial",
  en: "unofficial",
};

/** Fit a raw coordinate list into a `w`x`h` box, uniformly scaled and centred.
 *  Y is flipped because route points are geographic (north up) and SVG is
 *  y-down. Returns an SVG `points` string, or "" when there is nothing to draw. */
function fitShape(pts: [number, number][], w: number, h: number): string {
  if (pts.length < 2) return "";
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const s = Math.min(w / spanX, h / spanY);
  const offX = (w - spanX * s) / 2;
  const offY = (h - spanY * s) / 2;
  return pts
    .map(([x, y]) => `${(offX + (x - minX) * s).toFixed(1)},${(offY + (maxY - y) * s).toFixed(1)}`)
    .join(" ");
}

export async function renderOg(props: OgProps): Promise<ImageResponse> {
  const { lang, heading, sub, badge, shape } = props;
  const data = await ogFont();
  const points = shape ? fitShape(shape, 380, 260) : "";

  const tree = (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        position: "relative",
        padding: 72,
        background: "#FAF8F3",
        color: "#1A1A1A",
        fontFamily: "og",
      }}
    >
      {/* faint route trace tucked into the bottom-right corner */}
      {points ? (
        <svg
          width={380}
          height={260}
          viewBox="0 0 380 260"
          style={{ position: "absolute", right: 56, bottom: 56 }}
        >
          <polyline
            points={points}
            fill="none"
            stroke="#136F29"
            strokeOpacity={0.16}
            strokeWidth={12}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
      ) : null}

      {/* wordmark + disclaimer tag */}
      <div style={{ display: "flex", alignItems: "center" }}>
        <div style={{ fontSize: 30, letterSpacing: -0.5 }}>Sepsi Menetrend</div>
        <div
          style={{
            display: "flex",
            marginLeft: 16,
            fontSize: 17,
            letterSpacing: 1,
            color: "#8A8578",
            border: "1px solid #DAD5C7",
            borderRadius: 999,
            padding: "5px 14px",
          }}
        >
          {TAG[lang]}
        </div>
      </div>

      {/* headline block - grows from the vertical middle */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {badge ? (
          <div
            style={{
              display: "flex",
              alignSelf: "flex-start",
              background: badge.bg,
              color: badge.fg,
              fontSize: 40,
              lineHeight: 1,
              padding: "12px 22px",
              borderRadius: 18,
              marginBottom: 26,
            }}
          >
            {badge.text}
          </div>
        ) : null}
        <div
          style={{
            display: "flex",
            fontSize: 74,
            lineHeight: 1.08,
            letterSpacing: -1,
            // clamp a runaway heading so it can never push the card out of frame
            maxHeight: Math.round(74 * 1.08 * 3),
            overflow: "hidden",
          }}
        >
          {heading}
        </div>
        {sub ? (
          <div
            style={{
              display: "flex",
              marginTop: 22,
              fontSize: 32,
              lineHeight: 1.3,
              color: "#5A5548",
              maxHeight: Math.round(32 * 1.3 * 2),
              overflow: "hidden",
            }}
          >
            {sub}
          </div>
        ) : null}
      </div>

      {/* a thin brand rule anchors the foot of the card */}
      <div style={{ display: "flex", height: 6, width: 96, background: "#136F29" }} />
    </div>
  );

  return new ImageResponse(tree, {
    ...OG_SIZE,
    fonts: [{ name: "og", data, style: "normal", weight: 400 }],
  });
}

/** The share card for a line page. Badge is the id in the line's own colour
 *  (`light`/`lightText` - the on-screen pair, already contrast-checked); the
 *  faint trace behind it is the primary direction's shape, so lines read apart
 *  at a glance in a feed. Heading is the spoken label, sub is the two termini. */
export function lineOg(id: string, lang: SeoLang): Promise<ImageResponse> {
  const net = loadNetwork();
  const line = enrichLine(net, id, lang);
  const raw = net.lines.find((l) => l.id === id)!;
  const dirs = lineDirections(net, id);
  const shape = net.patterns.find((p) => p.id === dirs[0]?.patternId)?.shape;
  return renderOg({
    kind: "line",
    lang,
    heading: sentenceCase(line.label),
    sub: `${line.termini[0]} – ${line.termini[1]}`,
    badge: { text: id, bg: raw.light, fg: raw.lightText },
    shape,
  });
}

/** The share card for a place page. Heading is the stop name in the page's
 *  language; sub is the ids of the lines that actually leave this kerb, from the
 *  operator's boards (deduped, feed order) - the same authority the page prose
 *  uses. A place with no board here falls back to a plain "bus stop" label. */
export function placeOg(slug: string, lang: SeoLang): Promise<ImageResponse> {
  const net = loadNetwork();
  const place = buildPlaces(net).find((p) => (lang === "ro" ? p.slugRo : p.slug) === slug);
  if (!place) throw new Error(`placeOg: no place for ${slug}`);
  const lineIds = [
    ...new Set(
      (net.officialBoards ?? [])
        .filter((b) => b.stopId && place.stopIds.includes(b.stopId))
        .map((b) => b.lineId),
    ),
  ];
  return renderOg({
    kind: "place",
    lang,
    heading: pickName(place.name, lang),
    sub:
      lineIds.join(" · ") ||
      (lang === "hu" ? "buszmegálló" : lang === "ro" ? "stație de autobuz" : "bus stop"),
  });
}

/** The share card for a route page. Heading is the "A → B" direction in the
 *  page's language - the same arrow the page's crumb and headings use; the sub
 *  is just the city name. `pairSlug` is the HU slug on the HU and EN cards,
 *  `slugRo` on the RO card (Ruling R15), so match on whichever the language
 *  carries. */
export function routeOg(pairSlug: string, lang: SeoLang): Promise<ImageResponse> {
  const net = loadNetwork();
  const pair = notablePairs(net).find((p) => (lang === "ro" ? p.slugRo : p.slug) === pairSlug);
  if (!pair) throw new Error(`routeOg: no pair for ${pairSlug} (${lang})`);
  return renderOg({
    kind: "route",
    lang,
    // HU gets the grammatical ablative/terminative phrase, the same one the
    // page's <h1> uses; RO and EN both use a plain "A → B" arrow form (English
    // needs no grammatical case forms, so no huRoutePhrase equivalent).
    heading: lang === "hu"
      ? `${huRoutePhrase(pair.a, pair.b)} busszal`
      : `${pickName(pair.a.name, lang)} → ${pickName(pair.b.name, lang)}`,
    sub: lang === "hu" ? "Sepsiszentgyörgy" : "Sfântu Gheorghe",
  });
}

/** The share card for a guide page. Heading is the guide's own SEO title; the
 *  sub is just the city name in the page's language - a guide has no single
 *  line/stop to name, and the title already carries the topic. */
export function guideOg(key: keyof typeof GUIDES, lang: SeoLang): Promise<ImageResponse> {
  return renderOg({
    kind: "guide",
    lang,
    heading: GUIDES[key].title[lang],
    sub: lang === "hu" ? "Sepsiszentgyörgy" : "Sfântu Gheorghe",
  });
}

/** Each line is its own flex row of words, spaced by `gap` rather than by the
 *  text run's own inter-word spaces - Satori's text layout inserts a stray
 *  extra space around certain word breaks in this renderer (reproducible on
 *  the already-shipped guide cards too, e.g. "Gyakori kérdések  a"), and
 *  giving it no multi-word string to lay out at all sidesteps the bug instead
 *  of chasing it inside Satori/resvg. Line breaks are chosen by the caller,
 *  not left to auto-wrap, so the balance of each line is deliberate. */
function TextLines(
  { lines, gap, lineGap = 6, wrapperStyle, style }: {
    lines: string[]; gap: number; lineGap?: number;
    wrapperStyle?: CSSProperties; style: CSSProperties;
  },
) {
  return (
    <div style={{ display: "flex", flexDirection: "column", rowGap: lineGap, ...wrapperStyle }}>
      {lines.map((line, li) => (
        <div key={li} style={{ display: "flex", columnGap: gap }}>
          {line.split(" ").map((word, wi) => (
            <div key={wi} style={{ whiteSpace: "nowrap", ...style }}>{word}</div>
          ))}
        </div>
      ))}
    </div>
  );
}

const HOME_COPY: Record<SeoLang, {
  eyebrow: string;
  heading: string[];
  sub: (lineCount: number) => string[];
}> = {
  hu: {
    eyebrow: "SEPSISZENTGYÖRGY",
    heading: ["Mikor jön a busz?"],
    sub: (n) => ["Járattervező és menetrend", `a város ${n} autóbuszvonalára.`],
  },
  ro: {
    eyebrow: "SFÂNTU GHEORGHE",
    heading: ["Când vine autobuzul?"],
    sub: (n) => ["Planificator de călătorie și orar", `pentru cele ${n} linii de autobuz ale orașului.`],
  },
  en: {
    eyebrow: "SFÂNTU GHEORGHE",
    heading: ["When's my bus?"],
    sub: (n) => ["Journey planner and timetable", `for the city's ${n} bus lines.`],
  },
};

/** The homepage's own share card - the one every bare-link preview falls back
 *  to, since `/` carries no single line/stop/route to build a card around.
 *
 *  Bespoke rather than `renderOg()`: the dark panel + the app's own bus mark
 *  read as the product itself, not just another content page. The line count
 *  and the pill row are read live from the feed specifically so this never
 *  goes stale again the way the old hand-made `/og.png` did (it still showed
 *  9 lines and "12" long after 1B/1D/2D/10B existed and the count had moved
 *  past 12). Pills use each line's own raw `colour`/`textColour` - exactly
 *  what the operator publishes (multitrans.ro/jaratok/ gives 1B and 1D the
 *  identical gradient as line 1, not a shifted one) - not `dark`/`darkText`,
 *  which `palette()` only shifts to keep a D/B variant visually distinct
 *  from its base line when both are drawn as overlapping map polylines; a
 *  row of number badges has no such overlap to resolve. */
export async function homeOg(lang: SeoLang): Promise<ImageResponse> {
  const [data, bold] = await Promise.all([ogFont(), ogFontBold()]);
  const net = loadNetwork();
  const copy = HOME_COPY[lang];

  const tree = (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        background: "radial-gradient(circle at 80% 44%, #3C5019 0%, #2E3D14 60%)",
        fontFamily: "og",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          {/* Verbatim public/icons/icon.svg - "the same mark the installed
              app carries" (that file's own words) - not a redrawn approximation,
              so this can never drift from the real app icon again. */}
          <div style={{ display: "flex", width: 60, height: 60, borderRadius: 16, overflow: "hidden" }}>
            <svg width={60} height={60} viewBox="0 0 192 192">
              <rect width="192" height="192" fill="#2E3D14" />
              <rect x="40" y="44" width="112" height="80" rx="22" fill="#EFC913" />
              <g fill="#2E3D14">
                <rect x="58" y="62" width="21" height="27" rx="8" />
                <rect x="85" y="62" width="21" height="27" rx="8" />
                <rect x="112" y="62" width="21" height="27" rx="8" />
              </g>
              <circle cx="70" cy="128" r="13" fill="#FBFAF7" />
              <circle cx="122" cy="128" r="13" fill="#FBFAF7" />
            </svg>
          </div>
          <div
            style={{
              display: "flex",
              marginLeft: 16,
              fontSize: 24,
              letterSpacing: 2,
              color: "#EFC913",
              fontFamily: "og-bold",
            }}
          >
            {copy.eyebrow}
          </div>
        </div>

        <TextLines
          lines={copy.heading}
          gap={11}
          lineGap={2}
          wrapperStyle={{ marginTop: 36 }}
          style={{
            display: "flex",
            fontSize: 84,
            lineHeight: 1.04,
            letterSpacing: -1,
            color: "#FBFAF7",
            fontFamily: "og-bold",
          }}
        />
        <TextLines
          lines={copy.sub(net.lines.length)}
          gap={7}
          lineGap={6}
          wrapperStyle={{ marginTop: 28, maxWidth: 860 }}
          style={{
            display: "flex",
            fontSize: 31,
            lineHeight: 1.4,
            color: "rgba(251,250,247,0.72)",
          }}
        />
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        {net.lines.map((line) => (
          <div
            key={line.id}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minWidth: 56,
              height: 56,
              padding: "0 12px",
              borderRadius: 14,
              background: line.colour,
              color: line.textColour,
              fontSize: 26,
              fontFamily: "og-bold",
            }}
          >
            {line.id}
          </div>
        ))}
      </div>
    </div>
  );

  return new ImageResponse(tree, {
    ...OG_SIZE,
    fonts: [
      { name: "og", data, style: "normal", weight: 400 },
      { name: "og-bold", data: bold, style: "normal", weight: 700 },
    ],
  });
}
