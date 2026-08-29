import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Analytics, ServiceWorker } from "@/components";

/** Where the site is served from.
 *
 *  Open Graph will not take a relative path: every crawler needs an absolute
 *  URL for the preview image, so this has to be set for a share to show
 *  anything at all. Override it at build time on the deploy that owns the
 *  domain, rather than hard-coding a host into the source. */
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sepsimenetrend.ro";

const TITLE = "Sepsi Menetrend";
const DESCRIPTION =
  "Sepsiszentgyörgyi autóbusz-járattervező és menetrend a Multi-Trans közzétett "
  + "adatai alapján. Nem hivatalos oldal.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: TITLE, template: `%s · ${TITLE}` },
  description: DESCRIPTION,
  applicationName: TITLE,
  appleWebApp: { capable: true, title: TITLE, statusBarStyle: "default" },
  /* Declared rather than left to the app/icon file convention: naming `icons`
     here at all overrides that convention, and the two silently cancelled out -
     the built page came out with no favicon link whatsoever.
     The SVG is the same mark the installed app carries, so a tab and a home
     screen show one logo; the PNG is there for browsers that still will not
     take an SVG favicon. */
  icons: {
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-64.png", type: "image/png", sizes: "64x64" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
  alternates: { canonical: "/" },
  /* Said plainly in the metadata as well as on the page. Somebody sharing this
     should not be able to pass it off as the operator's own site. */
  authors: [{ name: "Sepsi Menetrend" }],
  openGraph: {
    type: "website", siteName: TITLE, locale: "hu_HU",
    alternateLocale: ["ro_RO"],
    url: SITE, title: TITLE, description: DESCRIPTION,
    images: [{ url: "/og.png", width: 1200, height: 630,
               alt: "Sepsi Menetrend – járattervező Sepsiszentgyörgyre" }],
  },
  twitter: {
    card: "summary_large_image", title: TITLE, description: DESCRIPTION,
    images: ["/og.png"],
  },
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
    <html lang="hu" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('sepsi.theme');if(t&&t!=='auto'){document.documentElement.dataset.theme=t;}var l=localStorage.getItem('sepsi.lang');if(l==='ro'||l==='hu'||l==='en'){document.documentElement.lang=l;}}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        {children}
        <ServiceWorker />
        <Analytics gaId={process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID} />
      </body>
    </html>
  );
}
