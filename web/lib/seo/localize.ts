/** Post-build language stamp for the Romanian route tree.
 *
 *  `app/layout.tsx` is the one root layout and hard-codes `<html lang="hu">`;
 *  the app router will not let `/ro/` re-declare `<html>`. So every page is
 *  built as Hungarian and `scripts/localize-html.mjs` rewrites the crawlable
 *  attributes on `out/ro/**` afterwards. This is the tested spec of that
 *  transform - the `.mjs` re-implements the same two regexes because a plain
 *  ESM script cannot import a `.ts` module.
 *
 *  Pure and idempotent: `toRomanian(toRomanian(x)) === toRomanian(x)`. */
export function toRomanian(html: string): string {
  return html
    // First `<html lang="hu"` only, anchored to the tag so a `lang="hu"` in
    // body text or a nested element is left untouched.
    .replace(/<html lang="hu"/, '<html lang="ro"')
    // The `og:locale` meta, when the page did not already declare `ro_RO`.
    .replace('content="hu_HU"', 'content="ro_RO"');
}
