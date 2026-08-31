/** Post-build structural gate for the generated SEO surface.
 *
 *  ~537 crawlable URLs (three languages) are produced from `network.json` by a
 *  dozen `page.tsx` files. A stray path typo, a half-wired hreflang set, a
 *  stranded page or a share card that 404s would all ship silently. This walks
 *  the finished `out/` and fails the build (exit 1, one line per problem) on any
 *  of them - including a baked line-map `<img src="/maps/…png">` whose PNG never
 *  made it into `out/`; on success it prints a single green line and exits 0.
 *
 *  Runs after `og-ext.mjs` (so the `opengraph-image` -> `.png` retarget is done)
 *  and before `stamp-sw.mjs` (so a failed build never earns a fingerprint).
 *
 *  Dependency-free - Node built-ins only. Regex/string parsing of HTML is fine:
 *  these are our own generated files, not arbitrary markup. The expected-URL
 *  list is `out/sitemap.xml` (Task 5's `allPages` is TypeScript and a plain
 *  `.mjs` cannot import it); everything else is derived from files in `out/`.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const OUT = "out";

if (!existsSync(OUT)) {
  console.error("verify-seo: out/ not found - run `next build` first");
  process.exit(1);
}
const SITEMAP = join(OUT, "sitemap.xml");
if (!existsSync(SITEMAP)) {
  console.error("verify-seo: out/sitemap.xml not found - the export is incomplete");
  process.exit(1);
}

const failures = [];
const fail = (msg) => failures.push(msg);

/** Origin of the deploy, read off the sitemap so a `NEXT_PUBLIC_SITE_URL`
 *  override still resolves. Every `<loc>` is absolute. */
const sitemapXml = readFileSync(SITEMAP, "utf8");
const locs = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const ORIGIN = new URL(locs[0]).origin;

/** A URL (absolute or root-relative) -> its path, query and hash dropped. */
const toPath = (u) => {
  try {
    return new URL(u, ORIGIN).pathname;
  } catch {
    return u;
  }
};

/** The HTML file a page path is served from: `/` -> out/index.html,
 *  `/x/y/` -> out/x/y/index.html. */
const pageFile = (path) =>
  path === "/" ? join(OUT, "index.html") : join(OUT, path.replace(/\/$/, ""), "index.html");

/** The file an asset path (an OG image) points at, verbatim under `out/`. */
const assetFile = (path) => join(OUT, path);

const read = (file) => readFileSync(file, "utf8");

// --- <head> / link parsing ------------------------------------------------

/** Every `<link rel="{rel}">` tag's `hreflang` (lower-cased) and `href`.
 *  Next emits the attribute as `hrefLang` - HTML is case-insensitive, so match
 *  loosely. */
function linkTags(html, rel) {
  const tags = html.match(/<link\b[^>]*>/gi) ?? [];
  const out = [];
  for (const tag of tags) {
    const relM = /\brel="([^"]*)"/i.exec(tag);
    if (!relM || relM[1].toLowerCase() !== rel) continue;
    out.push({
      hreflang: /\bhreflang="([^"]*)"/i.exec(tag)?.[1]?.toLowerCase(),
      href: /\bhref="([^"]*)"/i.exec(tag)?.[1],
    });
  }
  return out;
}

const canonicalOf = (html) => linkTags(html, "canonical")[0]?.href;

/** The page's hreflang set as `{ hu, ro, en, "x-default" }` of paths. */
function alternatesOf(html) {
  const out = {};
  for (const { hreflang, href } of linkTags(html, "alternate")) {
    if (hreflang && href) out[hreflang] = toPath(href);
  }
  return out;
}

const metaContent = (html, attr, value) =>
  new RegExp(`<meta\\s+${attr}="${value}"\\s+content="([^"]*)"`, "i").exec(html)?.[1];

/** Root-relative `<a href>` targets in a page's body, query/hash stripped. */
function anchorPaths(html) {
  const out = new Set();
  for (const m of html.matchAll(/<a\b[^>]*\bhref="(\/[^"]*)"/gi)) {
    let p = m[1].split("?")[0].split("#")[0];
    if (p === "") p = "/";
    out.add(p);
  }
  return out;
}

// --- exemptions ----------------------------------------------------------

/** The planner app renders its `<h1>` after hydration - the static export has
 *  none, and `app/page.tsx` is frozen. `/en/` shares the same `HomePage`
 *  component as `/` and `/ro/`. */
const NO_STATIC_H1 = new Set(["/", "/ro/", "/en/"]);

/** Pages the generic hreflang and orphan rules skip:
 *   - `/` + `/ro/` + `/en/`   the planner. All three now emit a reciprocal
 *     four-key hreflang set (hu, ro, en, x-default -> HU) - locked by
 *     lib/seo/homepage-head.test.ts. Their homepage->pillar link is asserted
 *     directly in step 5b below.
 *   - `/felhasznalasi-feltetelek/` + `/adatvedelem/`   canonical HU, with
 *     Romanian twins (`/ro/termeni/`, `/ro/confidentialitate/`) and English
 *     twins (`/en/terms/`, `/en/privacy/`) as pages; all six now carry the
 *     reciprocal `alternates`, still left off the generic sitemap walk.
 *   - `/ro/termeni/` + `/ro/confidentialitate/` + `/en/terms/` + `/en/privacy/`
 *     those twins.
 *  This is the brief's own orphan-check exclusion list. */
const EXEMPT = new Set([
  "/",
  "/ro/",
  "/en/",
  "/felhasznalasi-feltetelek/",
  "/adatvedelem/",
  "/ro/termeni/",
  "/ro/confidentialitate/",
  "/en/terms/",
  "/en/privacy/",
]);

// --- the page list ------------------------------------------------------

const pages = locs.map((loc) => {
  const path = toPath(loc);
  return { loc, path, file: pageFile(path) };
});

// 1. Every sitemap URL has a file.
for (const p of pages) {
  if (!existsSync(p.file)) fail(`missing page: ${p.path} -> ${p.file}`);
}

// 2. Per-page head checks + 3. hreflang integrity + 6. OG image resolves
//    + 7. every baked line-map <img> resolves.

/** The `{ hu, ro, en, "x-default" }` path set as one stable string, for an
 *  order-independent deep-equal between a page and its alternates. */
const altKey = (a) =>
  ["hu", "ro", "en", "x-default"].map((k) => `${k}=${a[k]}`).join(" ");

for (const p of pages) {
  if (!existsSync(p.file)) continue;
  const html = read(p.file);

  // 2a. non-empty <title>
  const title = /<title>([^<]*)<\/title>/i.exec(html)?.[1]?.trim();
  if (!title) fail(`${p.path}: empty or missing <title>`);

  // 2b. non-empty meta description
  const desc = metaContent(html, "name", "description")?.trim();
  if (!desc) fail(`${p.path}: empty or missing <meta name="description">`);

  // 2c. exactly one <h1
  const h1s = (html.match(/<h1[\s/>]/gi) ?? []).length;
  if (h1s !== 1 && !NO_STATIC_H1.has(p.path)) {
    fail(`${p.path}: expected exactly one <h1>, found ${h1s}`);
  }

  // 2d. self-canonical
  const canon = canonicalOf(html);
  if (!canon) {
    fail(`${p.path}: missing <link rel="canonical">`);
  } else if (toPath(canon) !== p.path) {
    fail(`${p.path}: canonical points at ${toPath(canon)}, not itself`);
  }

  // 6. og:image resolves to a file in out/
  const ogImage = metaContent(html, "property", "og:image");
  if (!ogImage) {
    fail(`${p.path}: missing <meta property="og:image">`);
  } else {
    const imgPath = toPath(ogImage);
    if (!existsSync(assetFile(imgPath))) {
      fail(`${p.path}: og:image ${imgPath} has no file in out/`);
    }
  }

  // 7. Every baked route-map <img src="/maps/…png"> resolves to a file in
  //    out/. A line page with no such <img> - the RouteShape SVG fallback,
  //    e.g. a token-less build - is fine and asserts nothing.
  for (const m of html.matchAll(/<img\b[^>]*\bsrc="(\/maps\/[^"]+\.png)"/gi)) {
    const src = m[1];
    if (!existsSync(assetFile(toPath(src)))) {
      fail(`${p.path}: map image ${src} has no file in out/`);
    }
  }

  // 3. hreflang - skipped for the deliberately one-way pages.
  if (EXEMPT.has(p.path)) continue;

  const alt = alternatesOf(html);
  if (!alt.hu || !alt.ro || !alt.en || !alt["x-default"]) {
    fail(`${p.path}: incomplete hreflang set (need hu, ro, en, x-default)`);
    continue;
  }
  // every alternate target must exist
  for (const [lang, target] of Object.entries(alt)) {
    if (!existsSync(pageFile(target))) {
      fail(`${p.path}: hreflang ${lang} -> ${target} has no file`);
    }
  }
  // x-default is the Hungarian URL; one of the trio is this page itself
  if (alt["x-default"] !== alt.hu) {
    fail(`${p.path}: x-default ${alt["x-default"]} != hu alternate ${alt.hu}`);
  }
  if (p.path !== alt.hu && p.path !== alt.ro && p.path !== alt.en) {
    fail(`${p.path}: hreflang names ${alt.hu} / ${alt.ro} / ${alt.en}, none is this page`);
  }
  // reciprocity: each alternate target must carry the identical four-key set.
  // Open its file and read its own `alternates` back - a page whose twins point
  // at a different trio (or a different x-default) is a one-way pairing Google
  // ignores. `alternatesOf` already normalises href -> path, so this compares
  // paths to paths, never absolute URLs.
  const mine = altKey(alt);
  for (const target of [alt.hu, alt.ro, alt.en]) {
    if (target === p.path) continue; // this page itself
    const file = pageFile(target);
    if (!existsSync(file)) continue; // already reported by the per-alternate check above
    const theirs = altKey(alternatesOf(read(file)));
    if (theirs !== mine) {
      fail(`${p.path}: hreflang set [${mine}] not reciprocated by ${target} [${theirs}]`);
    }
  }
}

// 4. Language attribute per subtree, across every built HTML file.
function* htmlFiles(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* htmlFiles(full);
    else if (name.endsWith(".html")) yield full;
  }
}
for (const file of htmlFiles(OUT)) {
  const underRo = file === join(OUT, "ro") || file.startsWith(join(OUT, "ro") + "/");
  const underEn = file === join(OUT, "en") || file.startsWith(join(OUT, "en") + "/");
  const want = underRo ? "ro" : underEn ? "en" : "hu";
  if (!new RegExp(`<html lang="${want}"`).test(read(file))) {
    fail(`${file}: missing <html lang="${want}"> (post-build localise step)`);
  }
}

// 5. Orphan check: every content page reachable within 2 hops of the hubs.
const HUB_PATHS = ["/", "/buszmenetrend/", "/ro/", "/ro/orar-autobuz/", "/en/", "/en/bus-schedule/"];
const reachable = new Set(HUB_PATHS);
const hop1 = new Set();
for (const hub of HUB_PATHS) {
  const file = pageFile(hub);
  if (existsSync(file)) for (const a of anchorPaths(read(file))) hop1.add(a);
}
for (const a of hop1) reachable.add(a);
for (const a of hop1) {
  const file = pageFile(a);
  if (existsSync(file)) for (const b of anchorPaths(read(file))) reachable.add(b);
}
const orphans = pages
  .map((p) => p.path)
  .filter((path) => !EXEMPT.has(path) && !reachable.has(path));
for (const path of orphans) fail(`orphan: ${path} is not reachable within 2 hops of the hubs`);

// 5b. The orphan check pre-seeds every HUB_PATH (including `/`, `/ro/` and
// `/en/`) as reachable, so it can never notice a homepage that links nothing.
// Assert the crawlable HTML of each planner homepage really carries an
// `<a href>` to its pillar guide - the anchor the whole content-page graph
// hangs off.
for (const [home, pillar] of [
  ["/", "/buszmenetrend/"],
  ["/ro/", "/ro/orar-autobuz/"],
  ["/en/", "/en/bus-schedule/"],
]) {
  const file = pageFile(home);
  if (!existsSync(file)) {
    fail(`missing homepage: ${home}`);
    continue;
  }
  if (!anchorPaths(read(file)).has(pillar)) {
    fail(
      `${home}: no crawlable <a href="${pillar}"> - the content pages are `
      + `unreachable from the homepage (Googlebot renders JS but never clicks the gear)`,
    );
  }
}

// --- verdict ------------------------------------------------------------

if (failures.length > 0) {
  console.error(`verify-seo: ${failures.length} problem(s) in out/\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`verify-seo: ${pages.length} pages checked, all green`);
