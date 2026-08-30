import type { Metadata } from "next";
import LinePage, { lineMetadata } from "@/components/seo/LinePage";
import { loadNetwork } from "@/lib/seo/network";

/** One prerendered page per `Line.id`; the id is used verbatim ("1D" stays "1D"). */
export function generateStaticParams() {
  return loadNetwork().lines.map((l) => ({ id: l.id }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
  const { id } = await params;
  return lineMetadata(id, "hu");
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LinePage lang="hu" id={id} />;
}
