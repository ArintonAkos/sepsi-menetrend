import type { Metadata } from "next";
import GuidePageShell, { guideMetadata } from "@/components/seo/GuidePageShell";

export function generateMetadata(): Metadata {
  return guideMetadata("pillar", "hu");
}

export default function Page() {
  return <GuidePageShell guideKey="pillar" lang="hu" />;
}
