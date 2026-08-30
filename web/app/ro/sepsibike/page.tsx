import type { Metadata } from "next";
import GuidePageShell, { guideMetadata } from "@/components/seo/GuidePageShell";

export function generateMetadata(): Metadata {
  return guideMetadata("bike", "ro");
}

export default function Page() {
  return <GuidePageShell guideKey="bike" lang="ro" />;
}
