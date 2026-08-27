/** Fetching the OSM pedestrian graph, resiliently.
 *
 *  The graph is the one runtime download the transit planner cannot do without:
 *  with no access or egress walks the search returns nothing, which looks
 *  exactly like "no buses run here". A Service Worker cache entry that was
 *  stored truncated - or belongs to a deploy whose file has changed - therefore
 *  has to be recovered from, not trusted.
 *
 *  The first attempt takes whatever the cache offers. Every retry appends a
 *  unique query string and asks for a fresh copy: that URL never matches the
 *  cached key, so the Service Worker has to go to the network for it.
 */
import type { WalkingGraph } from "./walking-router";

const PATH = "/data/walking-graph.json";

interface Options {
  /** How many times to try before giving up. */
  attempts?: number;
  /** Pause between attempts, milliseconds. */
  delayMs?: number;
  /** Abort a single attempt that never answers. */
  timeoutMs?: number;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function isWalkingGraph(value: unknown): value is WalkingGraph {
  if (!value || typeof value !== "object") return false;
  const graph = value as Record<string, unknown>;
  return Array.isArray(graph.vertices) && graph.vertices.length > 0
    && Array.isArray(graph.edges) && Array.isArray(graph.metres);
}

export async function loadWalkingGraph(
  fetchFn: typeof fetch = fetch,
  { attempts = 3, delayMs = 400, timeoutMs = 12_000 }: Options = {},
): Promise<WalkingGraph> {
  let lastError: unknown = new Error("no attempt made");

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await sleep(delayMs);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error("timed out")), timeoutMs);
    try {
      const response = attempt === 0
        ? await fetchFn(PATH, { signal: controller.signal })
        : await fetchFn(`${PATH}?reload=${attempt}-${Date.now()}`,
                        { cache: "reload", signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const graph: unknown = await response.json();
      if (!isWalkingGraph(graph)) throw new Error("response was not a walking graph");
      return graph;
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error(
    `walking graph unavailable after ${attempts} attempts: `
    + (lastError instanceof Error ? lastError.message : String(lastError)),
  );
}
