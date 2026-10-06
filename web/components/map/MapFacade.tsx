import { homeFacadePath } from "@/lib/home-view.mjs";
import styles from "./MapFacade.module.css";

/** A baked picture of the map's opening view, shown until the live map is
 *  wanted (see `Planner`'s `mapAwake`).
 *
 *  Mapbox GL is 1.8 MB of JavaScript; evaluating it and building the map
 *  froze a slow phone for over a second straight after load, while the screen
 *  stayed grey for several more. This is an image - in the static HTML, so it
 *  paints before any script runs - of the same centre and zoom, with the bus
 *  network drawn the way the live map draws it. It stays underneath once the
 *  live map arrives, so there is no blank frame in between.
 *
 *  `theme` "auto" lets the browser pick light or dark itself, which is what the
 *  server-rendered page needs: it cannot know the reader's scheme. */
export default function MapFacade({ theme }: { theme: "auto" | "light" | "dark" }) {
  const wide = "(min-width: 861px)";
  const dark = "(prefers-color-scheme: dark)";
  const sources = theme === "auto"
    ? [
        [`${wide} and ${dark}`, homeFacadePath("dark", "l")],
        [wide, homeFacadePath("light", "l")],
        [dark, homeFacadePath("dark", "s")],
      ]
    : [[wide, homeFacadePath(theme, "l")]];
  const fallback = homeFacadePath(theme === "dark" ? "dark" : "light", "s");

  return (
    <div className={styles.facade} aria-hidden="true">
      <picture>
        {sources.map(([media, src]) => <source key={src} media={media} srcSet={src} />)}
        {/* decorative: the planner beside it carries everything this shows */}
        <img className={styles.image} src={fallback} alt="" fetchPriority="high" decoding="async" />
      </picture>
      <span className={styles.attribution}>© Mapbox © OpenStreetMap</span>
    </div>
  );
}
