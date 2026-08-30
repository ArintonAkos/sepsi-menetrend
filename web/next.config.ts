import { readFileSync } from "node:fs";
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
  // Next's default build id is random per build, which alone makes `out/`
  // differ byte-for-byte between two builds of identical source - and that
  // cascades into the service-worker fingerprint (`scripts/stamp-sw.mjs`). Pin
  // it to the feed's own stamp so the id - and the output - change exactly when
  // the data changes, which is the plan's determinism guarantee.
  generateBuildId: () => {
    const feed = JSON.parse(readFileSync("public/data/network.json", "utf8"));
    return `sepsi-${feed.generated ?? feed.version ?? "0"}`;
  },
};

export default config;
