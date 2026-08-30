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
 *  by rendering a probe card and eyeballing it for tofu. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { GUIDES } from "./content";
import { loadNetwork } from "./network";
import { enrichLine, lineDirections } from "./lines";

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

export type OgProps = {
  kind: "line" | "place" | "route" | "guide";
  lang: "hu" | "ro";
  heading: string;
  sub?: string;
  badge?: { text: string; bg: string; fg: string };
  shape?: [number, number][];
};

/** The disclaimer tag - said on the page too: a sharer must not be able to
 *  pass the card off as the operator's own. */
const TAG: Record<OgProps["lang"], string> = { hu: "nem hivatalos", ro: "neoficial" };

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
export function lineOg(id: string, lang: "hu" | "ro"): Promise<ImageResponse> {
  const net = loadNetwork();
  const line = enrichLine(net, id, lang);
  const raw = net.lines.find((l) => l.id === id)!;
  const dirs = lineDirections(net, id);
  const shape = net.patterns.find((p) => p.id === dirs[0]?.patternId)?.shape;
  return renderOg({
    kind: "line",
    lang,
    heading: line.label,
    sub: `${line.termini[0]} – ${line.termini[1]}`,
    badge: { text: id, bg: raw.light, fg: raw.lightText },
    shape,
  });
}

/** The share card for a guide page. Heading is the guide's own SEO title; the
 *  sub is just the city name in the page's language - a guide has no single
 *  line/stop to name, and the title already carries the topic. */
export function guideOg(key: keyof typeof GUIDES, lang: "hu" | "ro"): Promise<ImageResponse> {
  return renderOg({
    kind: "guide",
    lang,
    heading: GUIDES[key].title[lang],
    sub: lang === "hu" ? "Sepsiszentgyörgy" : "Sfântu Gheorghe",
  });
}
