/** Loading the built transit feed for the static SEO pages.
 *
 *  The stop and route pages are rendered at build time in Node, not in the
 *  browser worker, so they read the same network.json the app ships straight
 *  off disk instead of going through the service worker cache. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Network } from "@/lib/engine/types";

let cache: Network | undefined;

/** The published feed from `public/data`. `next build` and vitest both run with
 *  `web/` as the cwd, so the relative path resolves the same either way.
 *
 *  The feed is read-only and identical for a whole build, so parse it once -
 *  downstream memos in `routes.ts` key on `Network` identity (`contexts`,
 *  `pairLists` WeakMaps) and were missing on every fresh call, re-running
 *  `prepare` and ~180 RAPTOR plans per consumer (the 346 opengraph-image
 *  renders especially). */
export function loadNetwork(): Network {
  return (cache ??= JSON.parse(
    readFileSync(join(process.cwd(), "public/data/network.json"), "utf8"),
  ) as Network);
}
