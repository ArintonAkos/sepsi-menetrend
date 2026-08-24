# Multimodális útvonaltervezés és domborzat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Az app a hibás buszos visszafordulásokat kizárva, offline domborzatot figyelembe véve tervezzen busz–gyaloglás–SepsiBike kombinált utakat.

**Architecture:** Az adatépítés először a hibás `Terminal` hívást szűri ki, majd a biciklis OSM gráf irányított, idővel súlyozott éleket kap. A buszos RAPTOR fölé egy kis, állapotfüggő multimodális kereső kerül: a bicikli csak dokkban vehető fel/adható le, a buszperonok közti gyaloglás pedig kizárólag a meglévő OSM útvonalakon történik. A UI minden eredményt ugyanazon Journey-idővonalon jelenít meg.

**Tech Stack:** Python 3 standard library adatépítés; TypeScript; Vitest; React 19; Next.js 16; statikus OSM gráf; Netlify Edge SepsiBike-készlet.

**Spec:** `docs/superpowers/specs/2026-08-25-multimodal-routing-and-terrain-design.md`

## Global Constraints

- Sem a böngésző, sem a service worker nem kérhet útvonalat vagy magasságot külső API-tól.
- A gyaloglási és biciklis geometria mindig az offline OSM gráfból származik; légvonalas tartalékútvonal tilos.
- SepsiBike felvétel csak 06:00–22:00 között és online, biciklivel rendelkező dokkból; leadás csak online, üres dokkba.
- Biciklidíj csak a dokk–dokk kerékpáros időből számolódik.
- A `Terminal` nem kerülhet GTFS-be, térképre vagy keresőbe; a `Calea Brașovului 1` megmarad.
- A felhasználó meglévő, nem kapcsolódó `.gitignore` és `web/package-lock.json` módosításait nem szabad hozzáadni commitokhoz.

---

### Task 1: Forrásmegálló-korrekció és popup-menetrend összefésülése

**Files:**
- Create: `route_overrides.json`
- Modify: `build_map.py:204-218`
- Modify: `web/lib/engine/plan.ts:656-710`
- Modify: `web/lib/engine/__tests__/board.test.ts`
- Modify: `tests/test_build_gtfs.py`
- Regenerate: `platforms.json`, `gtfs/*.txt`, `web/public/data/network.json`, `web/public/data/places.json`

**Interfaces:**
- Consumes: `route_overrides.json` as `{ "removeCalls": [{"line":"3","direction":"depart","name":"Terminal"}, ...] }`.
- Produces: `load_directions()` only returns retained calls; `boardAt()` returns one `StopBoard` for identical `(lineId, headsign, towards, terminates, published)` groups, with sorted unique `times`.

- [ ] **Step 1: Write the failing Python data test**

Add to `tests/test_build_gtfs.py` a test that loads the built `gtfs/stops.txt` and asserts:

```python
self.assertNotIn("Terminal", {row[1] for row in csv.reader(stops)})
self.assertIn("Calea Brașovului 1", {row[1] for row in csv.reader(stops)})
```

- [ ] **Step 2: Write the failing board merge test**

Use a small synthetic `Network` in `web/lib/engine/__tests__/board.test.ts` with two
line-3 patterns that share `towards: "B"` and one pattern whose next stop is `"C"`.
Assert that the first two produce a single sorted time column and the third remains
separate:

```ts
expect(boardAt(context, "A", "weekday").map((x) => [x.towards, x.times]))
  .toEqual([["B", [481, 503]], ["C", [490]]]);
```

- [ ] **Step 3: Verify both tests fail**

Run:

```bash
python3 -m unittest tests.test_build_gtfs -v
cd web && npm test -- --run lib/engine/__tests__/board.test.ts
```

Expected: the feed still contains `Terminal`; board still returns two `B` columns.

- [ ] **Step 4: Add explicit source-call overrides**

Create `route_overrides.json`:

```json
{
  "removeCalls": [
    {"line": "3", "direction": "depart", "name": "Terminal"},
    {"line": "4", "direction": "depart", "name": "Terminal"}
  ]
}
```

In `build_map.py`, add `apply_route_overrides(directions, overrides)` directly after
`load_directions()` reads every source JSON. It must remove exactly one matching
call for every override and raise `ValueError` if zero or more than one call matches;
this prevents a source-page rename from silently changing the feed.

- [ ] **Step 5: Coalesce display-equivalent board columns**

In `boardAt()`, first build the existing per-pattern columns, then reduce them by:

```ts
const key = [column.lineId, column.headsign.ro, column.headsign.hu,
             column.towards ?? "", column.terminates, column.published].join("|");
```

Merge only equal keys, use `new Set([...left.times, ...right.times])`, sort ascending,
and retain the first pattern ID for a stable React key. Do not merge a different
`towards` value: that is the circular-route direction proof.

- [ ] **Step 6: Regenerate and verify**

Run the existing reproducible data sequence used by the repository:

```bash
python3 build_gtfs.py
python3 build_web_data.py
python3 -m unittest discover -s tests -v
cd web && npm test -- --run lib/engine/__tests__/board.test.ts lib/engine/__tests__/network.test.ts
```

Expected: no `Terminal` stop in GTFS/web data, `Calea Brașovului 1` retained, and
the exact-direction board tests pass.

- [ ] **Step 7: Commit the isolated data/UI correction**

```bash
git add route_overrides.json build_map.py build_gtfs.py platforms.json gtfs web/public/data tests/test_build_gtfs.py web/lib/engine/plan.ts web/lib/engine/__tests__/board.test.ts
git commit -m "Fix stop topology and merge equivalent boards"
```

### Task 2: Általános buszos visszafordulás-kiszűrés

**Files:**
- Modify: `web/lib/engine/plan.ts:545-630`
- Modify: `web/lib/engine/types.ts:118-145`
- Modify: `web/lib/engine/__tests__/fixture.ts`
- Modify: `web/lib/engine/__tests__/plan.test.ts`
- Modify: `web/lib/engine/__tests__/network.test.ts`

**Interfaces:**
- Consumes: complete `Journey`, `PlanContext`, exact `WalkingContext`.
- Produces: `removeNoProgressLoops(ctx, journey, request, walking): Journey | null`, called before dominance/ranking.

- [ ] **Step 1: Write a synthetic failing regression**

Extend `fixture()` with two physical A platforms: `A_wrong` is reached first,
line 1 carries it to `H_wrong`, an exact walk reaches `H_right`, then the same
line returns through `A_right` before continuing to D. Add a direct walking
access edge to `A_right` that catches that later departure. Assert:

```ts
expect(rides(best).map((ride) => ride.lineId)).toEqual(["1", "2"]);
expect(best.transfers).toBe(1);
expect(best.legs.some((leg) => leg.kind === "ride" && leg.fromIndex === 0
  && leg.toIndex === 1 && leg.lineId === "1")).toBe(false);
```

The assertion intentionally describes a same-line reverse loop that must not
survive just because it saves a short platform walk.

- [ ] **Step 2: Run the regression to prove current failure**

```bash
cd web && npm test -- --run lib/engine/__tests__/plan.test.ts
```

Expected: the returned fastest/least-walking option includes `A_wrong → H_wrong`
then a second line-1 ride back through `A_right`.

- [ ] **Step 3: Add an auditable no-progress detector**

Add a private helper in `plan.ts` that considers two consecutive `RideLeg`s of
the same `lineId`, with only walk legs between them. It may replace the prefix
only when all of these are true:

```ts
sameLine && second.board >= directBoard && directArrival <= originalArrival
&& directAccess.minutes <= originalAccess.minutes + originalLoopMinutes
&& directBoardStop is reachable in walking.access
```

`directBoard` is a later call of the second pattern that is reachable directly
from the query origin; `directArrival` is recomputed with the same downstream
legs. The helper must keep routes whose second ride does not revisit the
neighbourhood of a direct boarding platform. Use physical stop IDs and exact
access paths, never matching by display name.

- [ ] **Step 4: Integrate before `undominated()`**

In `planWithWalking()`, build each candidate with `toJourney()`, immediately
pass it through `removeNoProgressLoops`, then insert the result in `found`.
Do not change RAPTOR boarding or transfer rules; this is a candidate-normalizing
pass, not a guessed graph edge.

- [ ] **Step 5: Add the real-feed regression**

In `network.test.ts`, construct exact access/egress maps for the two Domb utca
perons and line-3 onward route. Assert no returned journey contains line 1 in
both directions while revisiting the Domb utca station, and at least one valid
direct-forward alternative still reaches the same downstream line-3 ride.

- [ ] **Step 6: Verify and commit**

```bash
cd web && npm test -- --run lib/engine/__tests__/plan.test.ts lib/engine/__tests__/network.test.ts
git add web/lib/engine/plan.ts web/lib/engine/types.ts web/lib/engine/__tests__/fixture.ts web/lib/engine/__tests__/plan.test.ts web/lib/engine/__tests__/network.test.ts
git commit -m "Reject no-progress transit reversals"
```

### Task 3: Offline domborzati biciklis gráf és időalapú router

**Files:**
- Create: `fetch_elevation.py`
- Modify: `build_walking_graph.py`
- Modify: `tests/test_build_walking_graph.py`
- Modify: `web/lib/walking-router.ts`
- Modify: `web/lib/bicycle-router.ts`
- Modify: `web/lib/__tests__/walking-router.test.ts`
- Create: `web/lib/__tests__/bicycle-router.test.ts`
- Regenerate: `web/public/data/bicycle-graph.json`

**Interfaces:**
- `fetch_elevation.py` downloads exactly `N45E025.hgt.gz` from
  `https://s3.amazonaws.com/elevation-tiles-prod/skadi/N45/N45E025.hgt.gz`, verifies
  gzip expansion is a square big-endian signed-16 raster, and writes
  `terrain/N45E025.hgt` plus `terrain/elevation-source.json` with URL, SHA-256,
  retrieval timestamp and attribution.
- `BicycleGraph` extends `WalkingGraph` with `elevationMetres: number[]` and
  `seconds: number[][]`; its schema version is `2`.
- `BicyclePath` extends `FootPath` with `seconds`, `ascentMetres`, `descentMetres`.

- [ ] **Step 1: Add failing graph-build tests**

In `tests/test_build_walking_graph.py`, use a 3-vertex synthetic elevation
sampler. Assert a 100 m +10 m edge has a larger forward `seconds` cost than
the same 100 m downhill edge, both remain positive, and every `seconds[row]`
array matches `edges[row]` exactly.

- [ ] **Step 2: Add failing router tests**

In `web/lib/__tests__/bicycle-router.test.ts`, define a diamond graph:

```ts
// short but steep: A -> B -> D; longer flat: A -> C -> D
expect(router.route(A, D)?.path).toEqual([A, C, D]);
expect(router.route(A, D)?.ascentMetres).toBe(0);
```

Add the reverse direction assertion that downhill is faster than uphill but
does not exceed the configured `MAX_DOWNHILL_METRES_PER_MINUTE`.

- [ ] **Step 3: Verify red tests**

```bash
python3 -m unittest tests.test_build_walking_graph -v
cd web && npm test -- --run lib/__tests__/bicycle-router.test.ts
```

Expected: no elevation schema and the current bicycle router always chooses by metres.

- [ ] **Step 4: Implement deterministic elevation import and sampling**

`fetch_elevation.py` must use only Python standard-library `urllib.request`,
`gzip`, `hashlib` and `struct`; failed download or an invalid tile exits nonzero.
In `build_walking_graph.py`, load the HGT tile and bilinearly sample each OSM
vertex. Replace NoData samples with the nearest valid neighbour, never zero.

For each directed bicycle edge use a bounded comfortable-city-bike cost:

```python
grade = max(-0.12, min(0.12, (to_elevation - from_elevation) / metres))
speed = min(250, max(70, 250 * (1 - 4.0 * max(grade, 0))
                            + 110 * max(-grade, 0)))
seconds = round(60 * metres / speed)
```

Keep walking graph schema/version unchanged. Add elevation and seconds only to
the bicycle graph.

- [ ] **Step 5: Generalize weighted Dijkstra without changing walking**

Refactor `WalkingRouter` so its protected path search accepts a parallel
edge-weight matrix and returns both physical metres and selected cost. The
walking constructor supplies `metres`; `BicycleRouter` supplies `seconds`.
`BicycleRouter.route()` sums signed height deltas across the reconstructed
vertex path into ascent/descent and rounds minutes from seconds. Existing
walking tests must remain byte-for-byte behaviourally equivalent.

- [ ] **Step 6: Build and verify the production graph**

```bash
python3 fetch_elevation.py
python3 build_walking_graph.py
python3 -m unittest tests.test_build_walking_graph -v
cd web && npm test -- --run lib/__tests__/walking-router.test.ts lib/__tests__/bicycle-router.test.ts
```

Expected: `bicycle-graph.json` is version 2, has equal-length elevation/vertex
arrays and seconds/edge arrays; walking graph stays version 1.

- [ ] **Step 7: Commit terrain routing**

```bash
git add fetch_elevation.py build_walking_graph.py tests/test_build_walking_graph.py terrain/elevation-source.json web/public/data/bicycle-graph.json web/lib/walking-router.ts web/lib/bicycle-router.ts web/lib/__tests__/walking-router.test.ts web/lib/__tests__/bicycle-router.test.ts
git commit -m "Add terrain-aware offline bicycle routing"
```

### Task 4: Multimodális busz–SepsiBike kereső

**Files:**
- Create: `web/lib/engine/multimodal.ts`
- Create: `web/lib/engine/__tests__/multimodal.test.ts`
- Modify: `web/lib/engine/types.ts`
- Modify: `web/lib/sepsibike.ts`
- Modify: `web/lib/sepsibike-timing.ts`
- Modify: `web/lib/planner-options.ts`
- Modify: `web/lib/bicycle.ts`

**Interfaces:**
- New `BikeLeg`:

```ts
type BikeLeg = {
  kind: "bike"; startStationId: string; finishStationId: string;
  depart: Minute; arrive: Minute; metres: number; minutes: number;
  seconds: number; ascentMetres: number; descentMetres: number;
  path: LngLat[]; costLei: number; stale: boolean;
};
```

- `MultimodalDependencies` supplies `BikeAvailability`, actual `BikeRouteFunctions`,
  station catalog and a `WalkingContext`.
- `planMultimodal(ctx, request, walking, dependencies, limit)` returns `Journey[]`
  containing ordinary `walk`, `ride` and new `bike` legs; no separate `TimedBikeJourney`.

- [ ] **Step 1: Write failing modal-state tests**

Create a small fixture with two bus segments separated by a 1.5 km gap and
two usable docks. Test all cases explicitly:

```ts
expect(planMultimodal(...).some(j => j.legs.map(l => l.kind).join(",")
  === "walk,ride,walk,bike,walk,ride,walk")).toBe(true);
expect(planMultimodal(...noOriginBike).every(j => !j.legs.some(l => l.kind === "bike"))).toBe(true);
expect(planMultimodal(...pickupAt2200).every(j => !j.legs.some(l => l.kind === "bike"))).toBe(true);
```

Also test a full direct bike trip and a no-free-dock destination.

- [ ] **Step 2: Run the new test file and observe failure**

```bash
cd web && npm test -- --run lib/engine/__tests__/multimodal.test.ts
```

Expected: module/function does not exist and `Journey` cannot represent a bike leg.

- [ ] **Step 3: Move bicycle timing into the shared Journey model**

Make `bikeFare(rideMinutes)` exported from `sepsibike-timing.ts`; reuse it for
every `BikeLeg`. Replace `PlannerOption` with a single transit/multimodal
shape:

```ts
export type PlannerOption = { kind: "journey"; journey: Journey };
```

Also export the single pickup guard used by the search:

```ts
export const canStartBikeRide = (pickup: Minute) => pickup >= 6 * 60 && pickup < 22 * 60;
```

Delete only the presentation-level direct-bike distinction after every caller
uses the common type; do not delete station marker/search support.

- [ ] **Step 4: Implement bounded label-setting search**

In `multimodal.ts`, use labels:

```ts
type Mode = "foot" | "bike";
type Label = { at: NodeId; minute: Minute; mode: Mode; bikeStart?: BikeStation;
  legs: Leg[]; walkMinutes: number; transfers: number; };
```

Expand foot labels through exact walking access/egress and bus RAPTOR results;
expand foot labels at usable origin docks into one bicycle leg; expand bicycle
labels only into usable destination docks, returning to `foot`. Retain only
non-dominated labels sharing `(at, mode, bikeStart?.id)` using earlier arrival,
no more walking, no more transfers and no higher fare. Cap bus rides at 3 and
bike rentals at 2. Never create a bus expansion while `mode === "bike"`.

- [ ] **Step 5: Apply operational checks at expansion time**

Use `isBikeStationUsable()` for inventory and `canStartBikeRide()` for the
06:00–22:00 pickup rule. Require an empty destination dock before creating a
bike leg. Preserve `availability.stale` in each bike leg. A stale snapshot is
eligible but marked; invalid live data is not replaced by a guess.

- [ ] **Step 6: Verify all multimodal and legacy engine tests**

```bash
cd web && npm test -- --run lib/engine/__tests__/multimodal.test.ts lib/engine/__tests__/plan.test.ts lib/sepsibike.test.ts lib/sepsibike-timing.test.ts
```

Expected: direct bike, first/last-mile bike and between-bus bike all work;
the old purely bus planner remains deterministic when SepsiBike is disabled.

- [ ] **Step 7: Commit the engine boundary**

```bash
git add web/lib/engine/multimodal.ts web/lib/engine/__tests__/multimodal.test.ts web/lib/engine/types.ts web/lib/sepsibike.ts web/lib/sepsibike-timing.ts web/lib/planner-options.ts web/lib/bicycle.ts
git commit -m "Plan combined bus and SepsiBike journeys"
```

### Task 5: Egységes Planner-megjelenítés, térkép és beállítás

**Files:**
- Modify: `web/components/planner/Planner.tsx`
- Modify: `web/components/planner/Planner.module.css`
- Modify: `web/components/planner/Planner.test.tsx`
- Modify: `web/components/journey/JourneyList.tsx`
- Modify: `web/components/journey/JourneyDetail.tsx`
- Modify: `web/components/journey/JourneyDetail.module.css`
- Modify: `web/components/map/TransitMap.tsx`
- Create: `web/components/map/TransitMap.test.tsx`
- Modify: `web/lib/i18n.ts`

**Interfaces:**
- Consumes: common `Journey` with `BikeLeg`.
- Produces: a single selectable journey card/detail and a map painter that understands
  `walk`, `ride` and `bike` legs.

- [ ] **Step 1: Write the failing Planner integration tests**

Add mocked multimodal results and assert:

```tsx
expect(screen.getByText("↑ 48 m · ↓ 31 m")).toBeInTheDocument();
await user.click(screen.getByRole("button", { name: /SepsiBike/i }));
expect(mapMock).toHaveBeenCalledWith(expect.objectContaining({ journey: mixedJourney }));
```

Add a setting test requiring a semantic custom switch, not an input checkbox:

```tsx
expect(screen.getByRole("switch", { name: t.bikeOptions })).toHaveAttribute("aria-checked", "true");
expect(screen.queryByRole("checkbox", { name: t.bikeOptions })).not.toBeInTheDocument();
```

- [ ] **Step 2: Run the focused tests red**

```bash
cd web && npm test -- --run components/planner/Planner.test.tsx
```

Expected: bike legs cannot render in the common detail and the settings control is still native checkbox.

- [ ] **Step 3: Replace separate bike presentation with leg renderers**

Extend `JourneyList` and `JourneyDetail` switch statements with `kind === "bike"`.
Render dock names, inventory/stale note, kilometre/metre distance, duration,
ascent/descent and `bikeFare` result inline in the existing timeline. Remove
`BikeJourneyDetail` only after no component imports it.

- [ ] **Step 4: Paint one selected multimodal route**

In `TransitMap`, retain door pin and destination flag. For selected journey:

```ts
walk -> dashed dark GeoJSON feature
ride -> filtered bus shape section
bike -> solid SepsiBike-blue GeoJSON feature
```

Fit the camera to all selected features. When any journey is selected, apply
the existing network filter so unrelated bus lines are hidden.

- [ ] **Step 5: Replace the checkbox with the designed switch**

Use:

```tsx
<button type="button" role="switch" aria-checked={showBikeOptions}
  className={styles.optionSwitch} onClick={() => setShowBikeOptions(v => !v)}>
  <span>{t.bikeOptions}</span><i aria-hidden />
</button>
```

Style `optionSwitch` as the existing inset segmented setting: full width,
rounded 11 px surface, visible blue track/thumb, keyboard focus ring, and no
native browser form control. The stored `sepsibike-options` semantics do not
change.

- [ ] **Step 6: Verify focused UI behaviour**

```bash
cd web && npm test -- --run components/planner/Planner.test.tsx components/map/TransitMap.test.tsx
```

Expected: direct and mixed bike journeys use the same card/detail/map contract,
with pin and flag, while disabling suggestions removes all bike-containing
candidate journeys but leaves station markers/search intact.

- [ ] **Step 7: Commit the UI integration**

```bash
git add web/components/planner web/components/journey web/components/map/TransitMap.tsx web/lib/i18n.ts
git commit -m "Present multimodal SepsiBike journeys uniformly"
```

### Task 6: Teljes regenerálás, ellenőrzés és offline kézi próba

**Files:**
- Generated by: `web/public/sw.js` through the existing `npm run build` stamping step

**Interfaces:**
- Consumes: all prior generated data and application code.
- Produces: verified static PWA build; no external request is required for walking, cycling or elevation.

- [ ] **Step 1: Run all data and Python tests**

```bash
python3 -m unittest discover -s tests -v
```

Expected: every graph, platform, timetable and route-reconstruction test passes.

- [ ] **Step 2: Run all web tests**

```bash
cd web && npm test
```

Expected: all engine, SepsiBike, Planner and map tests pass.

- [ ] **Step 3: Build production PWA**

```bash
cd web && npm run build
```

Expected: Next static build and service-worker stamp complete without TypeScript or lint errors.

- [ ] **Step 4: Manual offline acceptance run**

Start `npm run dev:https`, load a route once, then enable browser offline mode.
Check: a direct SepsiBike route, a bus–bike–bus route, the Domb utca → Szotyor
regression, the Terminál search result, and a terrain route in both directions.
The only live request allowed to fail offline is `/api/sepsibike`; the UI must
fall back to marked last-known availability.

- [ ] **Step 5: Commit generated final data only after checks**

```bash
git add gtfs platforms.json web/public/data docs/superpowers/specs/2026-08-25-multimodal-routing-and-terrain-design.md
git commit -m "Regenerate offline multimodal planner data"
```
