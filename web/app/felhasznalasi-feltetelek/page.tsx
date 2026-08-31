import type { Metadata } from "next";
import { LegalPage } from "@/components";

export const metadata: Metadata = {
  title: "Felhasználási Feltételek · Termeni și Condiții",
  description: "A Sepsi Menetrend felhasználási feltételei, felelősségkizárási nyilatkozata és jogi információi.",
  alternates: {
    canonical: "/felhasznalasi-feltetelek/",
    languages: {
      hu: "/felhasznalasi-feltetelek/",
      ro: "/ro/termeni/",
      en: "/en/terms/",
      "x-default": "/felhasznalasi-feltetelek/",
    },
  },
};

export default function TermsPage() {
  return <LegalPage type="terms" lang="hu" />;
}
