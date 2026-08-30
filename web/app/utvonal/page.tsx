import type { Metadata } from "next";
import { RouteIndex, indexMetadata } from "@/components/seo/IndexShell";

/** `/utvonal/` - the route index. Sits beside `utvonal/[pair]/` (a static
 *  segment and a dynamic one never collide) and is the hub that keeps every
 *  route page reachable within two hops of the homepage. */
export function generateMetadata(): Metadata {
  return indexMetadata("routes", "hu");
}

export default function Page() {
  return <RouteIndex lang="hu" />;
}
