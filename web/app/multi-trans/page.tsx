import type { Metadata } from "next";
import GuidePageShell, { guideMetadata } from "@/components/seo/GuidePageShell";

export function generateMetadata(): Metadata {
  return guideMetadata("multiTrans", "hu");
}

export default function Page() {
  return <GuidePageShell guideKey="multiTrans" lang="hu" />;
}
