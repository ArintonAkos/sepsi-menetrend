/** The `<head>` for every generated SEO page.
 *
 *  A page and its language twin share one pair of URLs: Hungarian is canonical
 *  and the hreflang `x-default`, Romanian is additive under `/ro/`. Each page's
 *  own `canonical` is itself, so a crawler never folds the pair into one result
 *  yet still knows they are translations of each other. */
import type { Metadata } from "next";

/** Where the site is served from - the same default and env var as
 *  `app/layout.tsx`, so a relative path and this absolute one land on one
 *  origin. Override at build time on the deploy that owns the domain. */
export const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sepsimenetrend.ro";

/** Site-absolute URL for a root-relative path (every SEO path starts with `/`). */
const abs = (path: string): string => `${SITE}${path}`;

export function pageMetadata(input: {
  huPath: string;
  roPath: string;
  lang: "hu" | "ro";
  title: string;
  description: string;
  ogPath?: string;
}): Metadata {
  const { huPath, roPath, lang, title, description, ogPath } = input;
  const huUrl = abs(huPath);
  const roUrl = abs(roPath);
  const selfUrl = lang === "hu" ? huUrl : roUrl;

  // An `ogPath` that is already absolute is passed through; a root-relative one
  // is resolved against SITE (OG crawlers reject relative image URLs). Default
  // is the homepage card that already ships in `public/`.
  const ogImage = ogPath
    ? /^https?:\/\//.test(ogPath) ? ogPath : abs(ogPath)
    : abs("/og.png");

  return {
    // `absolute` bypasses the layout's `%s · Sepsi Menetrend` template - each
    // SEO title is already written whole, per page, in its own language.
    title: { absolute: title },
    description,
    // Said plainly here as on the page: a sharer must not be able to pass this
    // off as the operator's own site.
    authors: [{ name: "Sepsi Menetrend" }],
    publisher: "Sepsi Menetrend",
    alternates: {
      canonical: selfUrl,
      languages: { hu: huUrl, ro: roUrl, "x-default": huUrl },
    },
    openGraph: {
      type: "website",
      siteName: "Sepsi Menetrend",
      locale: lang === "hu" ? "hu_HU" : "ro_RO",
      url: selfUrl,
      title,
      description,
      images: [ogImage],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}
