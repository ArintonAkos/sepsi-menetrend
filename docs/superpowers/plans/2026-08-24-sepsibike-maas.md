# SepsiBike Multimodális Tervező Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** A Sepsi Menetrendben pontos, offline használható közvetlen SepsiBike alternatíva, élő készletjelzéssel, térképréteggel, kereséssel, angol nyelvvel és PWA telepítési úttal.

**Architecture:** A statikus SepsiBike katalógus és a két OSM-gráf a PWA része; így a keresés és az útvonaltervezés nem kér külső szolgáltatást. A kliens csak online állapotban frissíti az állomások készletét a Netlify Edge Functionön át, amely hibánál ugyanazt a statikus pillanatképet szolgálja ki. A biciklis alternatíva külön modell, nem változtatja meg a RAPTOR buszos optimumkeresést.

**Tech Stack:** Next.js statikus export, React 19, TypeScript, Vitest, Mapbox GL, Netlify Edge Functions, OpenStreetMap/Overpass kivonat, Python standard library.

**Spec:** docs/superpowers/specs/2026-08-24-sepsibike-maas-design.md

## Global Constraints

- A fejlesztés kizárólag a feat/sepsibike-maas worktree-ben történik; push és deploy tilos.
- A közvetlen busz-vagy-bicikli összevetés része a V1-nek; busz+bicikli vegyes optimalizálás nem.
- Séta- és biciklis idő/lánc soha nem lehet légvonalas becslés.
- Biciklis útvonal csak tényleges OSM-gráfkapcsolat, induló kerékpár és cél-dokkhely mellett jelenhet meg.
- A „várhatóan 0 RON” üzenet csak legfeljebb 25 perc tényleges tekerésnél használható.
- Snapshot vagy offline adat soha nem jelenhet meg élő készletként.
- A teljes alkalmazás HU/RO/EN nyelvű; a hivatalos állomásnév változatlan marad.
- Az Edge Function 60 s friss és 300 s stale-while-revalidate CDN cache-t használ, de nem ígér globálisan pontosan egy upstream-kérést percenként.
- Az SMS-jegy, fizetés/foglalás, partnerek és eseményfeed nincsenek a branch scope-jában.

---

## File Structure

- web/lib/sepsibike.ts: közös típusok, élő HTML-adat normalizálása, snapshot validálása és útvonal-opció kiválasztása.
- web/lib/sepsibike.test.ts: parser-, érvényesség- és ajánlati szabálytesztek.
- web/netlify/edge-functions/sepsibike.ts: deployolható, cache-elt API.
- web/public/data/sepsibike.json: 17 állomásos pillanatkép metaadattal.
- build_walking_graph.py és tests/test_build_walking_graph.py: egy OSM-kivonatból gyalogos és kerékpáros gráf.
- web/lib/bicycle.ts, web/lib/bicycle.worker.ts és web/lib/bicycle-router.ts: Worker-alapú biciklis útvonal és session cache.
- web/lib/engine/search.ts: kerékpárállomás mint kereshető hely.
- web/lib/i18n.ts és web/lib/lang.ts: harmadik alkalmazásnyelv.
- web/components/map/TransitMap.tsx: zöld dokkréteg és biciklis szakaszok.
- web/components/planner/Planner.tsx: élő készlet, állomáskártya és biciklis ajánlat.
- web/components/common/InstallApp.tsx: Android install prompt és iOS útmutató.
- web/public/sw.js: SepsiBike katalógus és kerékpáros gráf előcache.

### Task 1: SepsiBike adatszerződés és deployolható, hibabíró API

**Files:**
- Create: web/lib/sepsibike.ts
- Create: web/lib/sepsibike.test.ts
- Create: web/netlify/edge-functions/sepsibike.ts
- Modify: web/public/data/sepsibike.json
- Delete: netlify/edge-functions/sepsibike.ts

**Interfaces:**
- Produces: BikeStation, BikeAvailability, normaliseBikeStations(raw), isBikeStationUsable(station, role).
- Consumes: a 17-station static snapshot és a hivatalos page var items tömbje.

- [ ] **Step 1: Write the failing test**

~~~
import { normaliseBikeStations, isBikeStationUsable } from "./sepsibike";

it("normalises official station fields", () => {
  expect(normaliseBikeStations([{ StationName: "06. Sepsi Aréna", Address: "Arena",
    Latitude: 45.88173, Longitude: 25.80662, OcuppiedSpots: 11, EmptyDoors: 17,
    Status: "Online" }], 1)[0]).toMatchObject({ id: "06", availableBikes: 11, freeDocks: 17 });
});

it("rejects an offline origin and a full destination", () => {
  expect(isBikeStationUsable({ status: "Offline", availableBikes: 2 } as any, "origin")).toBe(false);
  expect(isBikeStationUsable({ status: "Online", freeDocks: 0 } as any, "destination")).toBe(false);
});
~~~

- [ ] **Step 2: Verify RED**

Run: cd web && npm test -- lib/sepsibike.test.ts

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement minimum contract**

Create BikeStation and BikeAvailability types. Validate unique two-digit ids, finite coordinates and non-negative capacity. Implement the two role checks with a case-insensitive Online status.

- [ ] **Step 4: Implement endpoint and fallback**

Move the function under web/netlify/edge-functions, parse var items, call normaliseBikeStations(raw, 17), and return the wrapper with source=live and 60/300 cache headers. On fetch, parser or schema failure, fetch /data/sepsibike.json from the same origin and return source=snapshot, stale=true and HTTP 200. Do not expose exception details.

- [ ] **Step 5: Green verification**

Run: cd web && npm test -- lib/sepsibike.test.ts && npm run build

Expected: parser tests pass and static build succeeds.

- [ ] **Step 6: Commit**

~~~
git add web/lib/sepsibike.ts web/lib/sepsibike.test.ts web/netlify/edge-functions/sepsibike.ts web/public/data/sepsibike.json netlify/edge-functions/sepsibike.ts
git commit -m "feat: add resilient SepsiBike availability API"
~~~

### Task 2: English language and searchable dock catalogue

**Files:**
- Modify: web/lib/i18n.ts, web/lib/lang.ts, web/app/layout.tsx, web/app/page.tsx
- Modify: web/lib/engine/search.ts and web/lib/engine/__tests__/places.test.ts
- Modify: web/components/planner/Planner.tsx and Planner.test.tsx

**Interfaces:**
- Produces: Lang = hu | ro | en, PlaceKind = bikeStation, bikeStationsToPlaces(stations).

- [ ] **Step 1: Write failing tests**

~~~
it("reads English from a shared URL", () => {
  history.replaceState(null, "", "?lang=en");
  expect(readLang(localStorage)).toBe("en");
});

it("finds a dock by bicycle alias", () => {
  const index = buildIndex([...places, ...bikeStationsToPlaces(stations)]);
  expect(search(index, "kerékpár")[0]).toMatchObject({ kind: "bikeStation" });
});
~~~

- [ ] **Step 2: Verify RED**

Run: cd web && npm test -- lib/lang.test.ts lib/engine/__tests__/places.test.ts

Expected: FAIL because English and bikeStation do not exist.

- [ ] **Step 3: Implement full third language**

Add English values for every current string key, including legal, settings and all new Bike strings. Make readLang, the hydration script and settings selector accept en. Do not translate source-provided station names.

- [ ] **Step 4: Implement local bike-place indexing**

Extend PlaceKind and convert the 17 snapshot stations to places with bicycle aliases. Load the catalogue in app/page.tsx and pass stations separately to Planner. Append transformed docks only to its search/local-label list; leave network.stops as the only bus-planning input.

- [ ] **Step 5: Green verification**

Run: cd web && npm test -- lib/lang.test.ts lib/engine/__tests__/places.test.ts components/planner/Planner.test.tsx && npm run lint

Expected: English persists and every dock is found without changing bus planning.

- [ ] **Step 6: Commit**

~~~
git add web/lib/i18n.ts web/lib/lang.ts web/app/layout.tsx web/app/page.tsx web/lib/engine/search.ts web/lib/engine/__tests__/places.test.ts web/components/planner/Planner.tsx web/components/planner/Planner.test.tsx
git commit -m "feat: add English and searchable SepsiBike stations"
~~~

### Task 3: Reproducible OSM bicycle graph and browser router

**Files:**
- Modify: build_walking_graph.py and tests/test_build_walking_graph.py
- Create: web/public/data/bicycle-graph.json
- Create: web/lib/bicycle-router.ts, web/lib/bicycle-router.test.ts, web/lib/bicycle.worker.ts, web/lib/bicycle.ts

**Interfaces:**
- Produces: build_graph(osm, mode="bicycle"), BicycleRouter.route(from, to), routeByBike(from, to).

- [ ] **Step 1: Write failing tests**

~~~
def test_bicycle_graph_excludes_steps_and_obeys_bicycle_oneway(self):
    graph = build_graph(OSM_WITH_STEPS_AND_ONEWAY, mode="bicycle")
    self.assertEqual(graph["edges"], [[1], []])
~~~

~~~
it("follows the graph detour rather than a diagonal", () => {
  const path = new BicycleRouter(detourGraph).route([25.76, 45.86], [25.762, 45.86]);
  expect(path?.path.length).toBeGreaterThan(2);
});
~~~

- [ ] **Step 2: Verify RED**

Run: python -m unittest tests/test_build_walking_graph.py and cd web && npm test -- lib/bicycle-router.test.ts

Expected: bicycle mode and router module are missing.

- [ ] **Step 3: Implement graph compiler**

Add bikeable(tags), rejecting steps, bicycle=no, access=no/private and non-permitted footways. Respect oneway:bicycle before generic oneway, including oneway=-1 reversal. Keep walking output byte-compatible. Write deterministic bicycle-graph.json from the committed OSM extract.

- [ ] **Step 4: Implement Worker-backed router**

Reuse the pure Dijkstra data structure, but calculate minutes as ceil(metres / 250). The Worker fetches only /data/bicycle-graph.json. routeByBike caches by rounded coordinate pair and returns null on missing graph or worker failure; it never creates a straight-line fallback.

- [ ] **Step 5: Green verification**

Run: python build_walking_graph.py && python -m unittest tests/test_build_walking_graph.py && cd web && npm test -- lib/bicycle-router.test.ts lib/walking-router.test.ts

Expected: both generated graphs and both exact routers pass.

- [ ] **Step 6: Commit**

~~~
git add build_walking_graph.py tests/test_build_walking_graph.py web/public/data/bicycle-graph.json web/lib/bicycle-router.ts web/lib/bicycle-router.test.ts web/lib/bicycle.worker.ts web/lib/bicycle.ts
git commit -m "feat: route SepsiBike journeys on offline OSM roads"
~~~

### Task 4: Bike-option model and planner card

**Files:**
- Modify: web/lib/sepsibike.ts and web/lib/sepsibike.test.ts
- Modify: web/components/planner/Planner.tsx, Planner.test.tsx and Planner.module.css

**Interfaces:**
- Produces: BikeJourneyOption { start, finish, access, ride, egress, totalMinutes, availability, isFreeEstimate }.

- [ ] **Step 1: Write failing tests**

~~~
it("does not propose a bike trip without an origin bicycle", async () => {
  await expect(findBikeOption(from, to, noBikesAvailability, routes)).resolves.toBeNull();
});

it("does not promise 0 RON for a 26-minute ride", async () => {
  expect((await findBikeOption(from, to, availability, routes))?.isFreeEstimate).toBe(false);
});
~~~

- [ ] **Step 2: Verify RED**

Run: cd web && npm test -- lib/sepsibike.test.ts components/planner/Planner.test.tsx

Expected: findBikeOption and the card are absent.

- [ ] **Step 3: Implement pure option selection**

For usable origin/destination dock pairs, use exact walking access/egress plus exact bike path. Reject a null leg. Rank by total minutes and bike metres. Live data older than five minutes is stale; snapshot remains renderable only with last-known warning. isFreeEstimate is true only for bike minutes <=25.

- [ ] **Step 4: Integrate non-invasively with Planner**

Fetch availability after hydration with AbortController and retain snapshot on failure/offline. Render the SepsiBike card alongside JourneyList. Selecting it must not mutate journeys, chosen, URL journey index or RAPTOR inputs. Show translated leg breakdown, counts, registration warning, timestamp and price qualification.

- [ ] **Step 5: Green verification**

Run: cd web && npm test -- lib/sepsibike.test.ts components/planner/Planner.test.tsx && npm test

Expected: invalid dock state suppresses the option, stale state is explicit and all bus tests remain green.

- [ ] **Step 6: Commit**

~~~
git add web/lib/sepsibike.ts web/lib/sepsibike.test.ts web/components/planner/Planner.tsx web/components/planner/Planner.test.tsx web/components/planner/Planner.module.css
git commit -m "feat: compare direct SepsiBike and bus journeys"
~~~

### Task 5: Map layer, station card and bicycle route drawing

**Files:**
- Modify: web/components/map/TransitMap.tsx and TransitMap.module.css
- Modify: web/components/planner/Planner.tsx and Planner.test.tsx
- Modify: web/components/styles.test.ts

**Interfaces:**
- Produces: bike-stations GeoJSON source, bike-route source and Planner-owned station card.

- [ ] **Step 1: Write failing tests**

~~~
it("uses a Mapbox source for bike docks, not a bike HTML popup", () => {
  expect(source("components/map/TransitMap.tsx")).toContain('"bike-stations"');
  expect(source("components/map/TransitMap.tsx")).not.toContain("bikePopup");
});
~~~

Add a component test that selecting Sepsi Aréna exposes its name, bike count, dock count and stale label.

- [ ] **Step 2: Verify RED**

Run: cd web && npm test -- components/styles.test.ts components/planner/Planner.test.tsx

Expected: source/layers and station card are absent.

- [ ] **Step 3: Implement the map layer**

Use one GeoJSON source, green circle/symbol layer and text layer for availableBikes. Register finger-sized click/hover lookup and report station id to Planner. Do not add 17 DOM markers and do not change existing stop popups.

- [ ] **Step 4: Implement selected bicycle route painting**

Add bike-route source. Paint access/egress as existing dashed walking lines and ride as solid green. Include all three paths in fit bounds and clear them for bus selection.

- [ ] **Step 5: Render accessibility-first station card and verify GREEN**

Render a React card with name, address, source timestamp, state, counts and progressbar. Run: cd web && npm test -- components/styles.test.ts components/planner/Planner.test.tsx && npm run lint

- [ ] **Step 6: Commit**

~~~
git add web/components/map/TransitMap.tsx web/components/map/TransitMap.module.css web/components/planner/Planner.tsx web/components/planner/Planner.test.tsx web/components/styles.test.ts
git commit -m "feat: show SepsiBike stations and routes on the map"
~~~

### Task 6: Install experience and offline shell

**Files:**
- Create: web/components/common/InstallApp.tsx and InstallApp.test.tsx
- Modify: web/components/index.ts, web/components/planner/Planner.tsx, Planner.module.css
- Modify: web/public/sw.js and web/app/manifest.ts

**Interfaces:**
- Produces: InstallApp component with beforeinstallprompt, iOS instructions and standalone detection.

- [ ] **Step 1: Write failing install tests**

~~~
it("calls the captured Android prompt once", async () => {
  const prompt = vi.fn().mockResolvedValue(undefined);
  fireInstallPrompt(prompt);
  render(<InstallApp compact={false} lang="hu" t={STRINGS.hu} />);
  await userEvent.click(screen.getByRole("button", { name: /telepítés/i }));
  expect(prompt).toHaveBeenCalledTimes(1);
});

it("shows iOS instructions and hides in standalone mode", () => {
  mockIosSafari();
  render(<InstallApp compact={false} lang="en" t={STRINGS.en} />);
  expect(screen.getByText(/add to home screen/i)).toBeInTheDocument();
});
~~~

- [ ] **Step 2: Verify RED**

Run: cd web && npm test -- components/common/InstallApp.test.tsx

Expected: InstallApp module does not exist.

- [ ] **Step 3: Implement browser-specific flow**

Capture beforeinstallprompt once and call prompt only after a tap. Hide after appinstalled or dismissal in sepsi.install.dismissed. On iOS Safari show Share → Add to Home Screen guidance; return null in standalone mode.

- [ ] **Step 4: Integrate settings and cache**

Place compact InstallApp under language/theme and primary version only in idle planner view. Add /data/sepsibike.json and /data/bicycle-graph.json to SHELL. Keep /api/sepsibike network-first.

- [ ] **Step 5: Green verification**

Run: cd web && npm test -- components/common/InstallApp.test.tsx components/planner/Planner.test.tsx && npm test && npm run lint && npm run build

Expected: install UI is correct, new offline data is emitted and all checks pass.

- [ ] **Step 6: Commit**

~~~
git add web/components/common/InstallApp.tsx web/components/common/InstallApp.test.tsx web/components/index.ts web/components/planner/Planner.tsx web/components/planner/Planner.module.css web/public/sw.js web/app/manifest.ts
git commit -m "feat: add PWA installation and offline SepsiBike data"
~~~

### Task 7: Full verification record

**Files:**
- Modify: docs/superpowers/plans/2026-08-24-sepsibike-maas.md

- [ ] **Step 1: Run reproducible OSM build**

Run: python build_walking_graph.py

Expected: both graph files rebuild from the committed OSM extract without runtime network access.

- [ ] **Step 2: Run all checks**

~~~
python -m unittest discover -s tests
cd web && npm test && npm run lint && npm run build
~~~

Expected: Python and TypeScript tests pass, lint has no errors, and static export succeeds.

- [ ] **Step 3: Inspect PWA output**

Run: rg -n 'sepsibike.json|bicycle-graph.json' web/out/sw.js and test -f web/out/data/bicycle-graph.json

Expected: service worker lists both new datasets and build output contains the graph.

- [ ] **Step 4: Record exact results and commit**

Replace this task's boxes with [x], write the command counts and task commit hashes, then:

~~~
git add docs/superpowers/plans/2026-08-24-sepsibike-maas.md
git commit -m "docs: record SepsiBike verification"
~~~
