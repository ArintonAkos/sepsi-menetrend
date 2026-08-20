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
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put("/", copy));
          return response;
        })
        .catch(() => caches.match("/").then((hit) => hit ?? Response.error())),
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
