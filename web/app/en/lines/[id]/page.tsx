import type { Metadata } from "next";
import LinePage, { lineMetadata } from "@/components/seo/LinePage";
import { loadNetwork } from "@/lib/seo/network";

/** Same id set as the Hungarian route - the line id is language-independent. */
export function generateStaticParams() {
  return loadNetwork().lines.map((l) => ({ id: l.id }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
  const { id } = await params;
  return lineMetadata(id, "en");
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LinePage lang="en" id={id} />;
}
