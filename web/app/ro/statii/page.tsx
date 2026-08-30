import type { Metadata } from "next";
import { StopIndex, indexMetadata } from "@/components/seo/IndexShell";

export function generateMetadata(): Metadata {
  return indexMetadata("stops", "ro");
}

export default function Page() {
  return <StopIndex lang="ro" />;
}
