/** The `<head>` for every generated SEO page.
 *
 *  A page and its language twin share one pair of URLs: Hungarian is canonical
 *  and the hreflang `x-default`, Romanian is additive under `/ro/`. Each page's
 *  own `canonical` is itself, so a crawler never folds the pair into one result
 *  yet still knows they are translations of each other. */
import type { Metadata } from "next";
import type { SeoLang } from "./lang";

/** Where the site is served from - the same default and env var as
 *  `app/layout.tsx`, so a relative path and this absolute one land on one
 *  origin. Override at build time on the deploy that owns the domain. */
export const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sepsimenetrend.ro";

/** Site-absolute URL for a root-relative path (every SEO path starts with `/`). */
const abs = (path: string): string => `${SITE}${path}`;

/** The OpenGraph locale tag per language. */
const LOCALE: Record<SeoLang, string> = { hu: "hu_HU", ro: "ro_RO", en: "en_US" };

export function pageMetadata(input: {
  huPath: string;
  roPath: string;
  /** The English twin's path. Every generated page has an English twin, so the
   *  `languages` map is always the four keys `hu` / `ro` / `en` / `x-default`.
   *  Callers under `/en/` also pass `lang: "en"`. */
  enPath: string;
  lang: SeoLang;
  title: string;
  description: string;
  ogPath?: string;
  /** The page carries its own `opengraph-image` route file. Set this so we do
   *  NOT also emit `openGraph.images` / `twitter.images` - Next only injects the
   *  file-convention `<meta og:image>` when the metadata object leaves images
   *  unset, and an explicit default here would otherwise win and orphan the
   *  generated card. */
  ownOgImage?: boolean;
}): Metadata {
  const { huPath, roPath, enPath, lang, title, description, ogPath, ownOgImage } = input;
  const huUrl = abs(huPath);
  const roUrl = abs(roPath);
  const enUrl = abs(enPath);
  const selfUrl = lang === "hu" ? huUrl : lang === "ro" ? roUrl : enUrl;

  // Hungarian is canonical and the hreflang `x-default`; every generated page
  // has hu/ro/en twins, so the languages map always carries all four keys.
  const languages: Record<string, string> = { hu: huUrl, ro: roUrl, en: enUrl, "x-default": huUrl };

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
      languages,
    },
    openGraph: {
      type: "website",
      siteName: "Sepsi Menetrend",
      locale: LOCALE[lang],
      url: selfUrl,
      title,
      description,
      ...(ownOgImage ? {} : { images: [ogImage] }),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(ownOgImage ? {} : { images: [ogImage] }),
    },
  };
}
