import type { Metadata } from "next";
import { RouteIndex, indexMetadata } from "@/components/seo/IndexShell";

export function generateMetadata(): Metadata {
  return indexMetadata("routes", "en");
}

export default function Page() {
  return <RouteIndex lang="en" />;
}
