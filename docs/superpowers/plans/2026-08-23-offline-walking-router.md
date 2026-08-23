# Offline Walking Router Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace straight-line access, egress, and direct walking estimates with an OSM-derived offline pedestrian router that supplies exact route geometry, distance, and consistent walking time before any journey is ranked.

**Architecture:** A build-time Python pipeline downloads and compiles the Multi-Trans service area's OSM pedestrian ways into a directed, versioned graph. A browser Web Worker loads that graph and runs forward/reverse bounded Dijkstra searches, returning exact walking legs for all stops and the selected endpoints. The pure transit engine accepts these metrics as a required `WalkingContext`; React waits for it and caches route contexts by snapped graph locations.

**Tech Stack:** Python 3 standard library/Overpass, TypeScript, React 19, Next.js 16, Web Workers, Vitest, IndexedDB, PWA service worker, OpenStreetMap data (ODbL attribution).

**Spec:** `docs/superpowers/specs/2026-08-23-offline-walking-router-design.md`

## Global Constraints

- Cover every Multi-Trans served stop, including Szépmező/Câmpul Frumos, Szotyor/Coșeni, Kilyén/Chilieni, Árkos/Arcuș, and Sugásfürdő/Șugaș Băi.
- Never use straight-line distance, `DETOUR`, or an external routing API to rank a returned journey.
- Do not show an estimated result while pedestrian routing is loading or unavailable.
- Keep all production pedestrian routing local after the graph is downloaded; use no Mapbox routing response or persistent Mapbox route cache.
- Keep the UI responsive by running graph searches outside the React main thread.
- Preserve the current user’s unrelated uncommitted work; implementation happens in a dedicated worktree.

---

### Task 1: Define exact walking inputs for the planner

**Files:**
- Modify: `web/lib/engine/types.ts`
- Modify: `web/lib/engine/plan.ts`
- Modify: `web/lib/engine/__tests__/plan.test.ts`
- Create: `web/lib/engine/__tests__/walking-context.fixture.ts`

**Interfaces:**
- Produces `WalkingLeg`, `WalkingContext`, and `WalkingStopMetric` types.
- Changes `plan(ctx, req, walking, limit?)` so `walking` is mandatory.
- Consumes real walking metrics keyed by stop ID plus a direct origin-to-destination leg.

- [ ] **Step 1: Write the failing planner tests**

```ts
it("uses graph access time instead of a Euclidean shortcut", () => {
  const walking = graphWalking({ access: { A: 27 }, egress: { D: 1 } });
  const [journey] = plan(ctx, ask({}), walking);
  expect(journey.depart).toBe(8 * 60 + 27);
});

it("requires an exact walking context", () => {
  // @ts-expect-error planning without pedestrian data is invalid
  expect(() => plan(ctx, ask({}))).toThrow();
});
```

- [ ] **Step 2: Run the focused test file and verify RED**

Run: `npm test -- lib/engine/__tests__/plan.test.ts`

Expected: TypeScript/test failure because the required walking context and its
graph-derived values do not exist.

- [ ] **Step 3: Implement minimal `WalkingContext` plumbing**

```ts
export interface WalkingContext {
  access: ReadonlyMap<string, WalkingLeg>;
  egress: ReadonlyMap<string, WalkingLeg>;
  direct: WalkingLeg | null;
}

export function plan(ctx: PlanContext, req: PlanRequest,
                     walking: WalkingContext, limit = 8): Journey[] { /* ... */ }
```

Seed RAPTOR only from `walking.access`, form destination candidates only from
`walking.egress`, and use `walking.direct` for the walk-only journey. Preserve
the supplied path, metres, and minutes unchanged in `Journey` legs.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- lib/engine/__tests__/plan.test.ts`

Expected: PASS, including the new detour test.

- [ ] **Step 5: Commit**

```bash
git add web/lib/engine/types.ts web/lib/engine/plan.ts web/lib/engine/__tests__/plan.test.ts web/lib/engine/__tests__/walking-context.fixture.ts
git commit -m "feat(engine): plan with exact walking context"
```

### Task 2: Remove geometry-changing planner heuristics and prove dominance

**Files:**
- Modify: `web/lib/engine/plan.ts`
- Modify: `web/lib/engine/__tests__/plan.test.ts`
- Modify: `web/lib/engine/__tests__/network.test.ts`

**Interfaces:**
- Consumes `WalkingContext` from Task 1.
- Produces journeys whose boarding/alighting legs are exactly the route search
  output; no post-hoc boarding move, egress extension, or station-loop filter.

- [ ] **Step 1: Write failing regression fixtures**

```ts
it("keeps the direct change instead of walking away and returning", () => {
  const found = plan(loopFixture.ctx, loopFixture.request, loopFixture.walking);
  expect(lines(found[0])).toBe("7+5");
  expect(found[0].transfers).toBe(1);
});

it("keeps a circular ride when it is the only onward connection", () => {
  const found = plan(circularFixture.ctx, circularFixture.request, circularFixture.walking);
  expect(found).toHaveLength(1);
});
```

- [ ] **Step 2: Run focused engine tests and verify RED**

Run: `npm test -- lib/engine/__tests__/plan.test.ts`

Expected: the old post-filter/tie heuristic either selects the three-ride loop
or rejects the valid circular fixture.

- [ ] **Step 3: Implement search-time dominance**

Remove `boardNearest`, `stayOn`, the `candidate.start` tie heuristic, and the
post-construction `visitedStations` filter. Keep labels only when no existing
label at the same station can arrive no later with no more walking or rides;
when a later label returns to an earlier station, retaining the earlier label
is sufficient because waiting can catch every later departure. Build journeys
only from labels that survived this comparison.

- [ ] **Step 4: Run focused engine and real-network tests**

Run: `npm test -- lib/engine/__tests__/plan.test.ts lib/engine/__tests__/network.test.ts`

Expected: PASS; the direct transfer fixture wins and the valid circular ride
is still returned.

- [ ] **Step 5: Commit**

```bash
git add web/lib/engine/plan.ts web/lib/engine/__tests__/plan.test.ts web/lib/engine/__tests__/network.test.ts
git commit -m "fix(engine): rank transit changes by dominance"
```

### Task 3: Build and validate the OSM pedestrian graph

**Files:**
- Create: `fetch_pedestrian_osm.py`
- Create: `build_walking_graph.py`
- Create: `tests/fixtures/pedestrian-osm.json`
- Create: `tests/test_build_walking_graph.py`
- Modify: `build_web_data.py`
- Modify: `web/lib/engine/types.ts`

**Interfaces:**
- Produces `web/public/data/walking-graph.json` with graph version, vertices,
  directed adjacency, edge lengths, and stop snap records.
- Adds `walkingGraphVersion` to `Network`.

- [ ] **Step 1: Write failing graph-builder tests**

```python
def test_builds_walkable_edges_and_excludes_private_way(tmp_path):
    graph = build_graph(fixture("pedestrian-osm.json"), served_stops())
    assert graph.path("A", "B").metres == 260
    assert "private-edge" not in graph.edge_ids

def test_served_area_contains_campul_frumos(tmp_path):
    query = pedestrian_query(served_stops())
    assert "Câmpul Frumos" in query.covered_stop_names
```

- [ ] **Step 2: Run the Python test and verify RED**

Run: `python3 -m unittest tests/test_build_walking_graph.py -v`

Expected: FAIL because no pedestrian extractor/compiler exists.

- [ ] **Step 3: Implement extraction and compilation**

`fetch_pedestrian_osm.py` requests full OSM node/way geometry, not the
current name-centre extract. Its bounding box is derived from every GTFS stop
plus a 1.5 km margin and is asserted to include Câmpul Frumos.  The compiler
filters inaccessible ways, emits directed edges with haversine metres, creates
a spatial grid for nearest-edge snapping, and serializes stable graph IDs.
`build_web_data.py` writes the graph version into `network.json`.

- [ ] **Step 4: Run builder tests and build the real graph**

Run: `python3 -m unittest tests/test_build_walking_graph.py -v`

Expected: PASS.

Run: `python3 fetch_pedestrian_osm.py`

Run: `python3 build_walking_graph.py`

Expected: `web/public/data/walking-graph.json` exists, reports all served
areas, and contains at least one snap per stop.

- [ ] **Step 5: Commit**

```bash
git add fetch_pedestrian_osm.py build_walking_graph.py tests/fixtures/pedestrian-osm.json tests/test_build_walking_graph.py build_web_data.py web/lib/engine/types.ts web/public/data/walking-graph.json
git commit -m "feat(data): build offline pedestrian graph"
```

### Task 4: Route the graph in a Web Worker and cache snapped routes

**Files:**
- Create: `web/lib/walkingGraph.ts`
- Create: `web/lib/walkingWorker.ts`
- Create: `web/lib/walkingCache.ts`
- Create: `web/lib/__tests__/walkingGraph.test.ts`
- Create: `web/lib/__tests__/walkingCache.test.ts`
- Modify: `web/lib/walking.ts`

**Interfaces:**
- `routeWalkingContext(graphVersion, origin, destination, stops): Promise<WalkingContext>`
- `WalkingGraphRouter` returns direction-aware paths and metrics from the graph.
- `WalkingRouteCache` is keyed by graph version plus snapped edge/bucket.

- [ ] **Step 1: Write failing worker/core tests**

```ts
it("takes the paved detour rather than crossing an absent edge", () => {
  const routes = routeWalkingContext(graph, ORIGIN, DESTINATION, stops);
  expect(routes.access.get("A")?.metres).toBe(2160);
  expect(routes.access.get("A")?.minutes).toBe(27);
});

it("reuses a snapped route despite small GPS jitter", async () => {
  await cache.getOrRoute([25.792600, 45.858800], destination);
  await cache.getOrRoute([25.792604, 45.858803], destination);
  expect(router.calls).toBe(1);
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- lib/__tests__/walkingGraph.test.ts lib/__tests__/walkingCache.test.ts`

Expected: FAIL because graph routing and cache APIs do not exist.

- [ ] **Step 3: Implement router, worker protocol, and IndexedDB cache**

Use a binary min-heap Dijkstra implementation, run forward over adjacency and
backward over reverse adjacency, and reconstruct returned paths from
predecessor arrays. Limit both searches by the configured access/egress
walking cap. Put the graph loader and router in `walkingWorker.ts`; transfer
only plain serializable route context objects. Store at most 256 completed
contexts in IndexedDB, evict least-recently-used entries, and do not cache
abort/failure results.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- lib/__tests__/walkingGraph.test.ts lib/__tests__/walkingCache.test.ts`

Expected: PASS, including directionality and jitter cache behavior.

- [ ] **Step 5: Commit**

```bash
git add web/lib/walkingGraph.ts web/lib/walkingWorker.ts web/lib/walkingCache.ts web/lib/__tests__/walkingGraph.test.ts web/lib/__tests__/walkingCache.test.ts web/lib/walking.ts
git commit -m "feat(walking): route offline graph in worker"
```

### Task 5: Gate the planner UI on exact pedestrian routing

**Files:**
- Modify: `web/components/planner/Planner.tsx`
- Modify: `web/components/planner/Planner.test.tsx`
- Modify: `web/lib/i18n.ts`
- Modify: `web/components/journey/JourneyDetail.tsx`
- Modify: `web/components/map/TransitMap.tsx`

**Interfaces:**
- Consumes `routeWalkingContext` and passes only ready contexts to `plan`.
- Displays `loading`, `ready`, and retryable `error` states.

- [ ] **Step 1: Write failing component tests**

```tsx
it("waits for graph walking data before showing journeys", async () => {
  deferWalkingContext();
  renderPlanner();
  expect(screen.getByText("Gyalogos útvonalak betöltése…")).toBeVisible();
  expect(screen.queryByRole("button", { name: /perc/ })).not.toBeInTheDocument();
});

it("renders the graph path and its arrival time", async () => {
  resolveWalkingContext(detourContext());
  expect(await screen.findByText("2160 m · 27 perc gyaloglás")).toBeVisible();
  expect(screen.getByText("15:48")).toBeVisible();
});
```

- [ ] **Step 2: Run focused component test and verify RED**

Run: `npm test -- components/planner/Planner.test.tsx`

Expected: FAIL because the component currently plans immediately and later
mutates only visible walk legs.

- [ ] **Step 3: Implement loading/error lifecycle**

Replace `useRoutedWalks` with a `useWalkingContext` hook that cancels stale
worker jobs, reads the graph/cache, and exposes `{ status, context, retry }`.
Call `plan` only for `ready`. Render localized Hungarian/Romanian loading and
retry states. Use worker geometry directly in the detail and map; remove the
late Mapbox Directions mutation path.

- [ ] **Step 4: Run focused component tests and verify GREEN**

Run: `npm test -- components/planner/Planner.test.tsx`

Expected: PASS; no itinerary appears before exact walking data.

- [ ] **Step 5: Commit**

```bash
git add web/components/planner/Planner.tsx web/components/planner/Planner.test.tsx web/lib/i18n.ts web/components/journey/JourneyDetail.tsx web/components/map/TransitMap.tsx
git commit -m "feat(planner): wait for offline walking routes"
```

### Task 6: Make the graph available offline and verify the real regression

**Files:**
- Modify: `web/public/sw.js`
- Modify: `web/scripts/stamp-sw.mjs`
- Modify: `web/lib/engine/__tests__/network.test.ts`
- Modify: `web/README.md`
- Modify: `web/components/common/HouseAd.tsx` or existing source/legal component

**Interfaces:**
- The active service worker precaches the versioned walking graph.
- Documentation states the offline boundary and OSM attribution.

- [ ] **Step 1: Write failing offline and real-feed tests**

```ts
it("precaches the versioned walking graph", () => {
  expect(serviceWorkerShell()).toContain("/data/walking-graph.json");
});

it("does not return the Nicolae Iorga walk-away-and-return itinerary", () => {
  const found = plan(realCtx, nicolaeIorgaToArena, realWalking);
  expect(found.some((j) => hasStationReturn(j, "ST19"))).toBe(false);
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- lib/engine/__tests__/network.test.ts`

Expected: FAIL until the service worker and real exact-walk fixture are wired.

- [ ] **Step 3: Implement precache, attribution, and documentation**

Add the graph URL to the worker shell generated by `stamp-sw.mjs`, expose OSM
attribution in the existing source/legal UI, document first-download/offline
limits, and encode the real report coordinates/timetable fixture from the
captured regression case.

- [ ] **Step 4: Run full verification**

Run: `npm test`

Run: `npm run build`

Run: `git diff --check HEAD`

Expected: all tests pass, production static export succeeds, and no whitespace
errors remain.

- [ ] **Step 5: Commit**

```bash
git add web/public/sw.js web/scripts/stamp-sw.mjs web/lib/engine/__tests__/network.test.ts web/README.md web/components/common/HouseAd.tsx
git commit -m "feat(pwa): cache offline walking graph"
```
