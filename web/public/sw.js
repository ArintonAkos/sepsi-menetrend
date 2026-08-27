/* Offline support.
 *
 *  The whole timetable is inlined into the page, so once the shell is cached
 *  the planner works with no network at all - which is the point: four separate
 *  riders asked a competing app for exactly this.
 *
 *  The map is the one part that cannot work offline, and deliberately so:
 *  Mapbox's terms do not allow storing their tiles. Anything cross-origin is
 *  passed straight through and never written to a cache.
 */
const VERSION = "__VERSION__";
const CACHE = `sepsi-${VERSION}`;
const SHELL = [
  "/",
  "/data/network.json",
  "/data/places.json",
  "/data/fares.json",
  "/data/walking-graph.json",
  "/data/bicycle-graph.json",
  "/data/sepsibike.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // one missing file must not fail the whole install
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((name) => name !== CACHE).map((name) => caches.delete(name)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Mapbox tiles, styles and geocoding: network only, never stored
  if (url.origin !== self.location.origin) return;

  // a navigation offline should still open the planner
  if (request.mode === "navigate") {
    event.respondWith(
      /* The HTML shell names hashed JavaScript bundles.  A stale browser HTTP
         cache can therefore hand back a shell from a deploy whose chunks are
         already gone, which looks like a random broken search on refresh.
         Revalidate it online; only a real network failure may use the saved
         offline shell below. */
      fetch(request, { cache: "no-store" })
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put("/", copy));
          return response;
        })
        .catch(() => caches.match("/").then((hit) => hit ?? Response.error())),
    );
    return;
  }

  /* The data files change between deploys, and a truncated or stale entry here
     breaks planning silently - an empty result that reads as "no service".
     Serve the cached copy at once for speed and offline use, but always
     revalidate in the background so a bad entry is corrected on the next load.
     A retry with a cache-busting query (see loadWalkingGraph) skips the cached
     copy entirely and is answered from the network. */
  if (url.pathname.startsWith("/data/")) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const fresh = fetch(request).then(async (response) => {
          if (response.ok && !url.search) await cache.put(request, response.clone());
          return response;
        });
        if (cached) {
          event.waitUntil(fresh.catch(() => {}));
          return cached;
        }
        return fresh;
      }),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((hit) => hit ?? fetch(request).then((response) => {
      if (response.ok && response.type === "basic") {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    })),
  );
});
