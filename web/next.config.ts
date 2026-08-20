import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

/** The machine's own addresses on the local network.
 *
 *  `next dev` blocks its own resources when they are requested from anything
 *  but localhost, which breaks testing on a phone over Wi-Fi. Listing the
 *  addresses rather than one hard-coded IP means it keeps working when the
 *  router hands out a different one. Set DEV_ORIGINS to add more, comma
 *  separated. None of this reaches the build: `output: "export"` ignores it.
 */
function localAddresses(): string[] {
  const found = Object.values(networkInterfaces())
    .flat()
    .filter((entry) => entry && entry.family === "IPv4" && !entry.internal)
    .map((entry) => entry!.address);
  const extra = process.env.DEV_ORIGINS?.split(",").map((s) => s.trim()) ?? [];
  return [...new Set([...found, ...extra])].filter(Boolean);
}

const config: NextConfig = {
  // Everything the planner needs ships as static JSON, so the whole site is a
  // folder of files. No server, no functions - drop it on any CDN.
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
  allowedDevOrigins: localAddresses(),
};

export default config;
