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
