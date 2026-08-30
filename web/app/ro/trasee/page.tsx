import type { Metadata } from "next";
import { RouteIndex, indexMetadata } from "@/components/seo/IndexShell";

/** `/ro/trasee/` - the Romanian route index. Built as Hungarian and
 *  language-stamped afterwards (`scripts/localize-html.mjs`), like every `/ro/`
 *  page. Links every route page by its RO slug. */
export function generateMetadata(): Metadata {
  return indexMetadata("routes", "ro");
}

export default function Page() {
  return <RouteIndex lang="ro" />;
}
