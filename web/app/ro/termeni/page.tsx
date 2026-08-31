import type { Metadata } from "next";
import { LegalPage } from "@/components";
import { pageMetadata } from "@/lib/seo/metadata";

/** Romanian twin of `/felhasznalasi-feltetelek/`. `LegalPage` is forced to `ro` so the page
 *  server-renders the Romanian legal text; `localize-html.mjs` stamps
 *  `lang="ro"` onto the built HTML afterwards. */
export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata({
    huPath: "/felhasznalasi-feltetelek/",
    roPath: "/ro/termeni/",
    enPath: "/en/terms/",
    lang: "ro",
    title: "Termeni și condiții de utilizare · Sepsi Menetrend",
    description:
      "Termenii de utilizare și declinarea răspunderii pentru Sepsi Menetrend, "
      + "aplicația neoficială cu orar autobuz în Sfântu Gheorghe (date Multi-Trans).",
  });
}

export default function TermeniPage() {
  return <LegalPage type="terms" lang="ro" />;
}
