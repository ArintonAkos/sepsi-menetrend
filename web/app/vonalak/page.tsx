import type { Metadata } from "next";
import { LineIndex, indexMetadata } from "@/components/seo/IndexShell";

export function generateMetadata(): Metadata {
  return indexMetadata("lines", "hu");
}

export default function Page() {
  return <LineIndex lang="hu" />;
}
