/** Post-build fix for the code-generated `opengraph-image` cards.
 *
 *  Under `output: "export"` Next writes the card to `out/<seg>/opengraph-image`
 *  with NO extension, and points the `<head>` `og:image` / `twitter:image` at
 *  that extensionless URL. This repo ships `out/` to Netlify as pure static
 *  files with a global `X-Content-Type-Options: nosniff`, so an extensionless
 *  file is served as `application/octet-stream` and Facebook / Messenger reject
 *  it. `scripts/og-ext.mjs` renames each file to `.png`; this is the tested spec
 *  of the matching URL rewrite - the `.mjs` re-implements the same replace
 *  because a plain ESM script cannot import a `.ts` module.
 *
 *  Pure and idempotent as long as `toToken` extends `fromToken` (it appends a
 *  file extension): `retargetOgImage(retargetOgImage(x)) === retargetOgImage(x)`. */

// Only the bare `og:image` / `twitter:image` tags - `og:image:type` etc. keep a
// closing quote right after the value, so the anchored `"` here skips them, and
// nothing outside a matching meta tag is ever touched.
const IMAGE_META = /<meta\s+(?:property|name)="(?:og:image|twitter:image)"\s+content="([^"]*)"/gi;

export function retargetOgImage(html: string, fromToken: string, toToken: string): string {
  if (fromToken === toToken || !html.includes(fromToken)) return html;
  return html.replace(IMAGE_META, (tag: string, url: string) => {
    if (!url.includes(fromToken) || url.includes(toToken)) return tag; // absent, or already done
    return tag.replace(url, url.split(fromToken).join(toToken));
  });
}
