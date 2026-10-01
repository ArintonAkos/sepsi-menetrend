/** Turning place and line names into URL slugs.
 *
 *  The pages are indexed by search engines, so the path has to be stable ASCII:
 *  "Șugaș Băi" and "Câmpul Frumos / Szépmező" both need to survive a round trip
 *  through a URL bar and a sitemap without changing.
 */

/** NFKD splits most accents into a base letter plus a combining mark, but a few
 *  Hungarian/Romanian letters carry the accent as one glyph and pass through
 *  whole - fold those by hand. */
const FOLD: Record<string, string> = { "ș": "s", "ț": "t", "đ": "d", "ł": "l" };

/** A name as it belongs in a URL: ASCII, lowercase, hyphen-joined, no leading or
 *  trailing hyphen. Deterministic and total - odd or empty input yields "". */
export function slugify(name: string): string {
  if (!name) return "";
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // drop the combining marks NFKD split off
    .toLowerCase()
    .replace(/[șțđł]/g, (c) => FOLD[c])
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** One slug per item, in input order. When two items slug to the same base the
 *  later ones get "-2", "-3", ... so every page keeps a unique path. `key`
 *  returns the raw name; slugifying it is this function's job. */
export function disambiguate<T>(items: T[], key: (t: T) => string): Map<T, string> {
  const seen = new Map<string, number>();
  const slugs = new Map<T, string>();
  for (const item of items) {
    const base = slugify(key(item));
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    slugs.set(item, n === 1 ? base : `${base}-${n}`);
  }
  return slugs;
}

/** A line's URL segment: its id, lowercased ("1B" -> "1b"). Netlify answers a
 *  mixed-case path with a 301 to the lowercase one, so a "/vonalak/1B/"
 *  canonical pointed every crawler at a redirect whose target named the
 *  redirect as canonical - a loop that kept 1B/1D/2D/10B out of the index.
 *  The id itself (and every label shown) keeps the operator's casing. */
export function lineSlug(id: string): string {
  return id.toLowerCase();
}

/** The line id behind a URL segment - the inverse of `lineSlug` over the
 *  feed's ids. An unknown segment comes back unchanged, so the page's own
 *  not-found handling still sees it. */
export function lineIdForSlug(ids: readonly string[], slug: string): string {
  return ids.find((id) => lineSlug(id) === slug) ?? slug;
}
