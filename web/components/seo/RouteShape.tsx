import styles from "./RouteShape.module.css";

/** A static thumbnail of a line's route geometry: one `<polyline>` in an
 *  `<svg>`, no map tiles, no client JS. Decorative only - `aria-hidden`, since
 *  the page's stop list already conveys the route in text.
 *
 *  A server component; the SVG is plain markup in the static HTML. */

interface RouteShapeProps {
  /** `[lng, lat]` pairs along the route. */
  shape: [number, number][];
  /** The line's own colour, used for the stroke. */
  colour: string;
}

// The viewBox is scaled so the longer side is 100 units, with this much slack
// on every edge so the stroke is never clipped at the bounds.
const PAD = 4;

// Two decimals is well under a pixel at any sane render size and keeps the
// viewBox free of float noise (and of exponent notation).
const round = (n: number) => Math.round(n * 100) / 100;

export default function RouteShape({ shape, colour }: RouteShapeProps) {
  // Nothing to draw from a single point (or none).
  if (!shape || shape.length < 2) return null;

  const xs = shape.map((p) => p[0]);
  const ys = shape.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const w = maxX - minX;
  const h = maxY - minY;
  const span = Math.max(w, h);
  if (!span) return null; // every point coincides

  const k = 100 / span;
  // Flip Y: SVG's y grows downward, latitude grows upward, so north must map to
  // the smaller y. Anchor at maxY so the top of the box is the northern edge.
  const points = shape
    .map(([lng, lat]) => `${round((lng - minX) * k)},${round((maxY - lat) * k)}`)
    .join(" ");
  const viewBox = `${-PAD} ${-PAD} ${round(w * k + PAD * 2)} ${round(h * k + PAD * 2)}`;

  return (
    <svg
      className={styles.svg}
      viewBox={viewBox}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke={colour}
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
