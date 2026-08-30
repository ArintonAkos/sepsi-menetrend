import type { Metadata } from "next";
import { LineIndex, indexMetadata } from "@/components/seo/IndexShell";

export function generateMetadata(): Metadata {
  return indexMetadata("lines", "en");
}

export default function Page() {
  return <LineIndex lang="en" />;
}
