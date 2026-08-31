import type { Metadata } from "next";
import { LegalPage } from "@/components";
import { pageMetadata } from "@/lib/seo/metadata";

/** English twin of `/felhasznalasi-feltetelek/`. `LegalPage` is forced to `en` so
 *  the page server-renders the English legal text; `localize-html.mjs` stamps
 *  `lang="en"` onto the built HTML afterwards. */
export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata({
    huPath: "/felhasznalasi-feltetelek/",
    roPath: "/ro/termeni/",
    enPath: "/en/terms/",
    lang: "en",
    title: "Terms of use · Sepsi Menetrend",
    description:
      "Terms of use and disclaimer for Sepsi Menetrend, the unofficial bus schedule "
      + "app for Sfântu Gheorghe (Multi-Trans data).",
  });
}

export default function Page() {
  return <LegalPage type="terms" lang="en" />;
}
