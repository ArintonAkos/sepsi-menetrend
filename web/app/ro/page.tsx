import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo/metadata";

/** The Romanian planner. Same component and build-time data loader as the
 *  Hungarian homepage - only the crawlable `<head>` differs, and the post-build
 *  `localize-html.mjs` stamps `lang="ro"` onto `out/ro/index.html`. */
export { default } from "../page";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata({
    huPath: "/",
    roPath: "/ro/",
    lang: "ro",
    title: "Planificator autobuz Sfântu Gheorghe · orar Multi-Trans",
    description:
      "Planificator de rute și orar autobuz în Sfântu Gheorghe, pe baza datelor "
      + "publicate de Multi-Trans. Site neoficial, gratuit și fără cont.",
  });
}
