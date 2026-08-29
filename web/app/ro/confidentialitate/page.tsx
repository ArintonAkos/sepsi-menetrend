import type { Metadata } from "next";
import { LegalPage } from "@/components";
import { pageMetadata } from "@/lib/seo/metadata";

/** Romanian twin of `/privacy/`. `LegalPage` is forced to `ro` so the page
 *  server-renders the Romanian text; `localize-html.mjs` stamps `lang="ro"`
 *  onto the built HTML afterwards. */
export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata({
    huPath: "/privacy/",
    roPath: "/ro/confidentialitate/",
    lang: "ro",
    title: "Politică de confidențialitate și cookie-uri · Sepsi Menetrend",
    description:
      "Cum tratează datele Sepsi Menetrend: fără cont, preferințe doar în browser, "
      + "Google Analytics numai cu acord. Aplicație neoficială de orar autobuz.",
  });
}

export default function ConfidentialitatePage() {
  return <LegalPage type="privacy" lang="ro" />;
}
