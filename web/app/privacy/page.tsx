import type { Metadata } from "next";
import { LegalPage } from "@/components";

export const metadata: Metadata = {
  title: "Adatkezelési és Süti Tájékoztató · Confidențialitate și Cookie-uri",
  description: "A Sepsi Menetrend adatkezelési és süti (cookie) tájékoztatója, információk a helyi adatokról és a Google Analytics működéséről.",
  alternates: { canonical: "/privacy/" },
};

export default function PrivacyPage() {
  return <LegalPage type="privacy" />;
}
