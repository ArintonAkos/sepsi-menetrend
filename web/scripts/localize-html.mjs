/** Stamp `lang="ro"` onto the built Romanian pages.
 *
 *  `app/layout.tsx` is the single root layout and hard-codes `<html lang="hu">`;
 *  the app router will not let `/ro/` re-declare `<html>`, so every page builds
 *  as Hungarian and this rewrites the crawlable attributes on `out/ro/**`
 *  afterwards. Runs post-`next build`, before the service worker fingerprint.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const RO_DIR = join("out", "ro");

// keep in sync with lib/seo/localize.ts
function toRomanian(html) {
  return html
    .replace(/<html lang="hu"/, '<html lang="ro"')
    .replace('content="hu_HU"', 'content="ro_RO"');
}

async function* htmlFiles(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === "ENOENT") return; // no `/ro/` routes built yet
    throw err;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* htmlFiles(full);
    else if (entry.name.endsWith(".html")) yield full;
  }
}

let count = 0;
for await (const file of htmlFiles(RO_DIR)) {
  const src = await readFile(file, "utf8");
  const out = toRomanian(src);
  if (out !== src) {
    await writeFile(file, out);
    count += 1;
  }
}

console.log(`  localised ${count} Romanian pages`);
