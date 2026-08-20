import type { Metadata, Viewport } from "next";
import "./globals.css";
import ServiceWorker from "@/components/ServiceWorker";

export const metadata: Metadata = {
  title: "Sepsi Menetrend",
  description:
    "Sepsiszentgyörgyi autóbusz-járattervező a Multi-Trans közzétett menetrendje alapján. Nem hivatalos oldal.",
  applicationName: "Sepsi Menetrend",
  appleWebApp: { capable: true, title: "Sepsi Menetrend", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // the panel's olive, so the phone's status bar joins the app rather than
  // sitting on a white strip above it
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#2E3D14" },
    { media: "(prefers-color-scheme: dark)", color: "#14180D" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="hu">
      <body>{children}<ServiceWorker /></body>
    </html>
  );
}
