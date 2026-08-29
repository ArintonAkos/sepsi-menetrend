/** Loading the built transit feed for the static SEO pages.
 *
 *  The stop and route pages are rendered at build time in Node, not in the
 *  browser worker, so they read the same network.json the app ships straight
 *  off disk instead of going through the service worker cache. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Network } from "@/lib/engine/types";

/** The published feed from `public/data`. `next build` and vitest both run with
 *  `web/` as the cwd, so the relative path resolves the same either way. */
export function loadNetwork(): Network {
  return JSON.parse(
    readFileSync(join(process.cwd(), "public/data/network.json"), "utf8"),
  ) as Network;
}
