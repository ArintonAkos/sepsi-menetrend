# Offline Walking Router Design

## Goal

Plan journeys using walking routes over a real pedestrian network, rather than
straight-line estimates.  The list must wait for those values before ranking
or presenting an itinerary, and it must continue to work after the app and
its data have been downloaded once.

## Scope and non-goals

This changes access walks (origin to boarding stop), egress walks (alighting
stop to destination), and the direct-walk alternative.  Existing routed
stop-to-stop transfer walks remain part of `network.json`.

The feature does not make Mapbox's base map, remote address lookup, live road
closures, or a fresh OSM update available offline.  A newly typed house number
that is absent from the shipped place index still needs a network geocoder;
known places, stops, streets, pins, recent places, and the planner itself do
not.

## Data architecture

At build time, a dedicated OSM pedestrian extract is converted to a compact,
versioned directed graph.  It contains walkable road, path, footway, steps,
and crossing edges; excludes `foot=no`, private, and otherwise inaccessible
ways; and represents permitted directional travel.  Every edge stores real
length in metres.  Every stop and shipped searchable place is connected to
its nearest walkable edge by a short connector.

The mandatory coverage is the full Multi-Trans served area: Sfântu Gheorghe,
Coșeni/Szotyor, Chilieni/Kilyén, Arcuș/Árkos, Șugaș Băi/Sugásfürdő, and
Câmpul Frumos/Szépmező.  The extract boundary is derived from this complete
set of served stops with a walking margin, rather than from the city boundary.

The artifact is published as `/data/walking-graph.<version>.json` initially;
the binary encoding may replace JSON only after measuring the uncompressed and
gzip sizes.  Its version is included in `network.json` and is an input to all
runtime cache keys.  The existing service worker precaches the graph together
with the network and place indexes.

The graph supplies real route length.  Walking duration is the route length
divided by the existing declared walking pace (80 metres/minute), rounded to a
minute.  It is therefore a consistent walking-time estimate based on a real
walkable path, not a promise of an individual's real-world pace or live
construction data.

OpenStreetMap attribution and the ODbL notice are shown wherever the app
describes its data sources.

## Runtime routing

The graph is loaded lazily when both journey endpoints are set.  A Web Worker
owns graph loading and shortest-path work so React rendering remains
responsive.

For an origin, one bounded Dijkstra search traverses the pedestrian graph and
records the actual distance/time/path to every reachable stop and the final
destination.  The destination is searched on the reversed graph, yielding
the directed stop-to-destination values required for egress.  The worker stops
at the product walking limit; direct walking has its own 40-minute limit.

The worker returns a `WalkingContext` containing:

- exact access metrics keyed by stop ID;
- exact egress metrics keyed by stop ID;
- an exact origin-to-destination walking leg when reachable; and
- route geometry for every returned leg.

The engine receives this `WalkingContext` as a mandatory planning input.  It
must not call `metresBetween`, apply `DETOUR`, or invent a straight line for
access, egress, or direct walks.  It therefore has a single source of truth
for the displayed walk, total duration, arrival time, ranking, and map line.

## Planner correctness

RAPTOR labels continue to model scheduled transit, but their initial labels
come from the exact access map and their destination candidates from the exact
egress map.  Candidate itinerary comparison uses actual arrival, walking
minutes, and transfers.

The current uncommitted station-loop post-filter and boarding tie heuristic
are removed.  A journey that revisits an already reached station later is
pruned only when waiting at the earlier visit dominates it: it reaches the
same station no later with no extra walk or transfer, and can catch every
subsequent departure.  This prevents needless leave-and-return transfers
without banning a legitimate circular bus ride that is the only way forward.

## Loading and failure behaviour

Until `WalkingContext` is ready, the planner shows a dedicated Hungarian
loading state and no estimated itinerary list.  A missing graph, failed
worker, or malformed graph produces a retryable error state.  It never falls
back to straight-line planning.

When offline, the already-cached graph and planner work normally.  If the
graph was never downloaded, the app explains that the walking data must first
be downloaded; it does not show a false estimate.

## Caching

The graph itself is service-worker cached and refreshed atomically with its
network version.  Query results are stored in memory and IndexedDB with an
LRU cap.  Cache keys use graph version plus the snapped graph edge/node and a
small along-edge bucket, not raw GPS coordinates.  This reuses a route when a
user returns to the same address despite a few metres of GPS jitter, and
invalidates all results cleanly when walking data is rebuilt.

No Mapbox Directions or Matrix response is used or persisted by this feature.

## Validation

Tests prove that:

1. a detour in the pedestrian graph changes access/egress time and journey
   ranking compared with an Euclidean shortcut;
2. the planner refuses to run without a walking context;
3. a direct transfer dominates a walk-away-and-return transfer;
4. a circular ride that does not return to a previously reached transfer
   station remains valid;
5. worker route results are deterministic, direction-aware, and cacheable;
6. offline service-worker precache includes the walking graph.

The production build and full test suite must pass.  A real-feed regression
fixture reproduces the Nicolae Iorga → Sepsi Aréna scenario using its exact
coordinates and timetable snapshot.
