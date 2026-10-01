import type { Metadata } from "next";
import LinePage, { lineMetadata } from "@/components/seo/LinePage";
import { loadNetwork } from "@/lib/seo/network";
import { lineIdForSlug, lineSlug } from "@/lib/seo/slug";

/** Same id set as the Hungarian route - the line id is language-independent. */
export function generateStaticParams() {
  return loadNetwork().lines.map((l) => ({ id: lineSlug(l.id) }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
  const id = lineIdForSlug(loadNetwork().lines.map((l) => l.id), (await params).id);
  return lineMetadata(id, "ro");
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const id = lineIdForSlug(loadNetwork().lines.map((l) => l.id), (await params).id);
  return <LinePage lang="ro" id={id} />;
}
