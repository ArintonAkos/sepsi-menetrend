import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo/metadata";
import { HomePage } from "../page";

/** The Romanian planner. Same component and build-time data loader as the
 *  Hungarian homepage - only the crawlable `<head>` and the homepage footer's
 *  language differ, and the post-build `localize-html.mjs` stamps `lang="ro"`
 *  onto `out/ro/index.html`. */
export default async function Page() {
  return HomePage({ lang: "ro" });
}

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
