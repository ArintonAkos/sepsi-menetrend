/** Stamp `lang="ro"` / `lang="en"` onto the built Romanian and English pages.
 *
 *  `app/layout.tsx` is the single root layout and hard-codes `<html lang="hu">`;
 *  the app router will not let `/ro/` or `/en/` re-declare `<html>`, so every
 *  page builds as Hungarian and this rewrites the crawlable attributes on
 *  `out/ro/**` and `out/en/**` afterwards. Runs post-`next build`, before the
 *  service worker fingerprint.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

// keep in sync with lib/seo/localize.ts
const STAMPS = [
  { dir: join("out", "ro"), lang: "ro", locale: "ro_RO" },
  { dir: join("out", "en"), lang: "en", locale: "en_US" },
];

function stamp(html, lang, locale) {
  return html
    .replace(/<html lang="hu"/, `<html lang="${lang}"`)
    .replace('content="hu_HU"', `content="${locale}"`);
}

async function* htmlFiles(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === "ENOENT") return; // no routes built for this tree yet
    throw err;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* htmlFiles(full);
    else if (entry.name.endsWith(".html")) yield full;
  }
}

for (const { dir, lang, locale } of STAMPS) {
  let count = 0;
  for await (const file of htmlFiles(dir)) {
    const src = await readFile(file, "utf8");
    const out = stamp(src, lang, locale);
    if (out !== src) {
      await writeFile(file, out);
      count += 1;
    }
  }
  console.log(`  localised ${count} ${lang.toUpperCase()} pages`);
}
