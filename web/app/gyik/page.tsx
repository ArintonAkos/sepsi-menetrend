import type { Metadata } from "next";
import GuidePageShell, { guideMetadata } from "@/components/seo/GuidePageShell";

export function generateMetadata(): Metadata {
  return guideMetadata("faq", "hu");
}

export default function Page() {
  return <GuidePageShell guideKey="faq" lang="hu" />;
}
