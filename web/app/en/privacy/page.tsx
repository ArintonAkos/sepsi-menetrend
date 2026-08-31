import type { Metadata } from "next";
import { LegalPage } from "@/components";
import { pageMetadata } from "@/lib/seo/metadata";

/** English twin of `/adatvedelem/`. `LegalPage` is forced to `en` so the page
 *  server-renders the English text; `localize-html.mjs` stamps `lang="en"` onto
 *  the built HTML afterwards. */
export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata({
    huPath: "/adatvedelem/",
    roPath: "/ro/confidentialitate/",
    enPath: "/en/privacy/",
    lang: "en",
    title: "Privacy & Cookie Notice · Sepsi Menetrend",
    description:
      "How Sepsi Menetrend handles data: no account, preferences kept in the browser "
      + "only, Google Analytics on consent. Unofficial bus schedule app for Sfântu Gheorghe.",
  });
}

export default function Page() {
  return <LegalPage type="privacy" lang="en" />;
}
