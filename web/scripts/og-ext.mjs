/** Give the code-generated Open Graph cards a real `.png` extension.
 *
 *  Next writes `app/**\/opengraph-image.ts` routes to `out/<seg>/opengraph-image`
 *  with NO extension and points the `<head>` at that URL. We ship `out/` to
 *  Netlify as pure static files under a global `nosniff`, so an extensionless
 *  file is served `application/octet-stream` and Facebook / Messenger reject the
 *  card. This renames every such file to `.png` and rewrites the matching
 *  `og:image` / `twitter:image` URLs. Runs after `localize-html.mjs`, before
 *  `stamp-sw.mjs`, so the service-worker fingerprint covers the final files.
 *
 *  Idempotent and a clean no-op when there are no extensionless cards (a build
 *  before any `opengraph-image.ts` route exists just prints "renamed 0").
 */
import { readdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

const OUT = "out";
const CARD = "opengraph-image";

/** A card file Next emitted without a usable extension. */
function isBareCard(name) {
  return name === CARD || (name.startsWith(`${CARD}.`) && !name.endsWith(".png"));
}

async function* walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === "ENOENT") return; // nothing built yet
    throw err;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

// keep in sync with lib/seo/og-ext.ts
const IMAGE_META = /<meta\s+(?:property|name)="(?:og:image|twitter:image)"\s+content="([^"]*)"/gi;
function retargetOgImage(html, fromToken, toToken) {
  if (fromToken === toToken || !html.includes(fromToken)) return html;
  return html.replace(IMAGE_META, (tag, url) => {
    if (!url.includes(fromToken) || url.includes(toToken)) return tag;
    return tag.replace(url, url.split(fromToken).join(toToken));
  });
}

// 1. Rename the extensionless cards. `pairs` maps every old basename to its new
//    one; in practice always the single `opengraph-image -> opengraph-image.png`.
const pairs = new Map();
let renamed = 0;
for await (const file of walk(OUT)) {
  const slash = file.lastIndexOf("/");
  const name = file.slice(slash + 1);
  if (!isBareCard(name)) continue;
  const target = `${name}.png`;
  const targetPath = `${file.slice(0, slash + 1)}${target}`;
  try {
    await readFile(targetPath); // a `.png` sibling already exists - leave both
    continue;
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  await rename(file, targetPath);
  pairs.set(name, target);
  renamed += 1;
}

// 2. Point every `og:image` / `twitter:image` URL at the renamed file.
let retargeted = 0;
if (pairs.size > 0) {
  for await (const file of walk(OUT)) {
    if (!file.endsWith(".html")) continue;
    const src = await readFile(file, "utf8");
    let out = src;
    for (const [from, to] of pairs) out = retargetOgImage(out, from, to);
    if (out !== src) {
      await writeFile(file, out);
      retargeted += 1;
    }
  }
}

console.log(`og-ext: renamed ${renamed} images, retargeted ${retargeted} pages`);
