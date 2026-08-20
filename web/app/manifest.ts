import type { MetadataRoute } from "next";

// manifest.ts is a Route Handler; a static export needs it pinned
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sepsi Menetrend",
    short_name: "Sepsi Menetrend",
    description:
      "Sepsiszentgyörgyi autóbusz-járattervező. Nem hivatalos oldal, "
      + "a Multi-Trans közzétett menetrendje alapján.",
    lang: "hu",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#FBFAF7",
    theme_color: "#2E3D14",
    categories: ["travel", "navigation", "utilities"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png",
        purpose: "maskable" },
    ],
  };
}
