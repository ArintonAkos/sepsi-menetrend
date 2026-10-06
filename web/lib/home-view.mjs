/** The map's opening view, shared by the live map and the build script that
 *  bakes its stand-in image - plain ESM so `scripts/gen-maps.mjs`, which runs
 *  before the TypeScript is compiled, reads the same numbers. If they drifted
 *  apart, the picture would jump when the real map replaced it. */

/** Where the map opens: the centre of Sfântu Gheorghe. `[lng, lat]`. */
export const HOME_CENTRE = [25.7876, 45.8636];
/** The opening zoom. Static Images and GL share zoom semantics (512 px tiles),
 *  so an image baked at this zoom lines up pixel for pixel. */
export const HOME_ZOOM = 12.4;

/** The baked stand-in images, in CSS pixels. Each is rendered `@2x` and shown
 *  at this size, centred on `HOME_CENTRE` like the live map. `s` covers a
 *  phone held upright, `l` a desktop map pane. */
export const HOME_FACADE_SIZES = {
  s: [640, 1000],
  l: [1280, 900],
};

/** Public path of one baked image: `/maps/home-light-s.webp` (2x), or with
 *  `density` 1 the half-size copy for 1x screens, `/maps/home-light-s-1x.webp`. */
export function homeFacadePath(theme, size, density = 2) {
  return `/maps/home-${theme}-${size}${density === 1 ? "-1x" : ""}.webp`;
}
