import type { Metadata } from "next";
import { LineIndex, indexMetadata } from "@/components/seo/IndexShell";

export function generateMetadata(): Metadata {
  return indexMetadata("lines", "ro");
}

export default function Page() {
  return <LineIndex lang="ro" />;
}
