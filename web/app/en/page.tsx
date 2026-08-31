import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo/metadata";
import { HomePage } from "../page";

/** The English planner. Same component and build-time data loader as the
 *  Hungarian homepage - only the crawlable `<head>` and the homepage footer's
 *  language differ, and the post-build `localize-html.mjs` stamps `lang="en"`
 *  onto `out/en/index.html`. */
export default async function Page() {
  return HomePage({ lang: "en" });
}

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata({
    huPath: "/",
    roPath: "/ro/",
    enPath: "/en/",
    lang: "en",
    title: "Sfântu Gheorghe bus planner · Multi-Trans schedule",
    description:
      "Route planner and bus schedule for Sfântu Gheorghe, based on data published "
      + "by Multi-Trans. Unofficial, free, no account.",
  });
}
