# OSM Platform Topology Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Replace name-based stop grouping and invented kerbs with audited, OSM-backed physical bus platforms so routing and transfers use real boarding locations.

**Architecture:** Multi-Trans route pages remain the ordered calls. A resolver maps each call to a canonical physical OSM platform only when the normalized Romanian name matches and it is within 35 m; otherwise it emits one source-coordinate fallback. platforms.json is the reviewed boundary consumed by GTFS, web data, and the audit page.

**Tech Stack:** Python 3 standard library, GTFS CSV, local OSM JSON, TypeScript/Vitest, Next.js.

**Spec:** docs/superpowers/specs/2026-08-24-platform-topology-design.md

## Global Constraints

- Preserve every official call and its order.
- Use local OSM bus platforms only for exact normalized names within 35 m.
- Never derive a platform from a travel bearing or duplicate a platform from its name.
- Emit a single source fallback when OSM has no unique match.
- Keep exceptions in committed platform_overrides.json with a reason and source.
- Allow transfers only via walks.json; equal names are never a free transfer.
- Keep circular runs as a single vehicle journey.
- Do not add dependencies or push the branch.

---

### Task 1: Resolve physical platforms

**Files:**

- Create: build_platforms.py
- Create: platform_overrides.json
- Create: tests/test_build_platforms.py
- Modify: build_map.py:220-354

**Interfaces:**

- resolve_platforms(directions, osm_nodes, overrides) returns a dict with platforms, call_platforms, and unmatched.
- call_platforms maps (line, direction, stop_index) to platform ID.
- A platform has id, name, point, source, osm_id, and calls.
- write_platforms(topology, path) writes deterministic platforms.json.

- [ ] **Step 1: Write failing resolver tests**

~~~
def test_one_osm_platform_is_not_duplicated_for_opposite_calls():
    directions = [direction("1", "depart", "Parcul Elisabeta", 45.8643, 25.7866),
                  direction("1", "return", "Parcul Elisabeta", 45.8643, 25.7866)]
    osm = [node(1248719238, "Parcul Elisabeta", 45.8641156, 25.7865231)]

    topology = resolve_platforms(directions, osm, {"calls": {}})

    assert len(topology["platforms"]) == 1
    assert len(set(topology["call_platforms"].values())) == 1
    assert topology["platforms"][0]["source"] == "osm"

def test_same_name_at_distinct_source_coordinates_stays_separate():
    directions = [direction("3", "depart", "Fabrica de Țigarete", 45.8589, 25.7826),
                  direction("5", "depart", "Fabrica de Țigarete", 45.8584, 25.7822)]

    topology = resolve_platforms(directions, [], {"calls": {}})

    assert len(topology["platforms"]) == 2
    assert len(set(topology["call_platforms"].values())) == 2
~~~

- [ ] **Step 2: Verify the tests fail**

Run: python3 -m unittest tests.test_build_platforms -v

Expected: FAIL because build_platforms does not exist.

- [ ] **Step 3: Implement only the resolver**

Implement nearest_named_osm(stop, osm_nodes): normalize names, retain candidates within MATCH_METRES = 35.0, return the sole nearest candidate, and return None for no candidate or an equal-distance tie. Implement source fallback identity as normalized name plus six-decimal source coordinates. Do not call or retain split_shared_kerbs.

- [ ] **Step 4: Wire and serialize the resolver**

Load osm/bus_stops.json, resolve all direction calls, and write the sorted platforms.json. Remove the bearing-offset topology functions from build_map.py.

- [ ] **Step 5: Run resolver tests**

Run: python3 -m unittest tests.test_build_platforms tests.test_build_gtfs tests.test_build_web_data -v

Expected: PASS.

- [ ] **Step 6: Commit**

~~~
git add build_platforms.py platform_overrides.json tests/test_build_platforms.py build_map.py
git commit -m "Add OSM-backed platform resolver"
~~~

### Task 2: Build GTFS from platforms

**Files:**

- Modify: build_gtfs.py:32-39, 232-330
- Modify: tests/test_build_gtfs.py
- Create/generated: platforms.json
- Regenerate: gtfs/*.txt, multitrans-gtfs.zip

**Interfaces:**

- Consumes topology["call_platforms"][(line, direction, index)].
- Produces exactly one stops.txt row per canonical platform and refers to it from every stop_times.txt call.
- Writes no generated parent station or platform number.

- [ ] **Step 1: Write failing real-feed tests**

~~~
def test_real_feed_has_one_elisabeta_and_one_casa_platform():
    build_gtfs.main()
    rows = physical_rows(build_gtfs.OUT / "stops.txt")
    assert names(rows).count("Parcul Elisabeta") == 1
    assert names(rows).count("Casa cu Arcade") == 1

def test_real_feed_keeps_two_factory_platforms():
    build_gtfs.main()
    rows = [r for r in physical_rows(build_gtfs.OUT / "stops.txt")
            if r["stop_name"] == "Fabrica de Țigarete"]
    assert {(r["stop_lat"], r["stop_lon"]) for r in rows} == {
        ("45.858900", "25.782600"), ("45.858400", "25.782200")}
~~~

- [ ] **Step 2: Verify the Erzsébet park test fails**

Run: python3 -m unittest tests.test_build_gtfs.GtfsTopologyTests.test_real_feed_has_one_elisabeta_and_one_casa_platform -v

Expected: FAIL because the existing generator derives a second Erzsébet park kerb.

- [ ] **Step 3: Replace name-indexed station lookup**

In build_gtfs.main(), call the resolver, write platforms.json, generate IDs P plus platform-id, and write each stop_times row from:

~~~
call = (d["line"], d["direction"], i)
platform_id = topology["call_platforms"][call]
"stop_id": platform_stop_id[platform_id]
~~~

Delete the build_stations, station_index, kerb_by_call, derived, and skipped path. Keep raw call order and trip times unchanged.

- [ ] **Step 4: Regenerate and verify GTFS**

Run: python3 build_gtfs.py && python3 -m unittest tests.test_build_platforms tests.test_build_gtfs -v && python3 validate_gtfs.py

Expected: no “second kerb derived” output; all tests pass; validator prints PROBLEMS: none.

- [ ] **Step 5: Commit**

~~~
git add build_gtfs.py tests/test_build_gtfs.py platforms.json gtfs multitrans-gtfs.zip
git commit -m "Build GTFS from physical platforms"
~~~

### Task 3: Use physical platforms in the web planner

**Files:**

- Modify: build_web_data.py:341-455
- Modify: tests/test_build_web_data.py
- Modify: web/lib/engine/plan.ts:382-390
- Modify: web/lib/engine/__tests__/network.test.ts:46-110
- Regenerate: web/public/data/network.json

**Interfaces:**

- GTFS stops without a parent station receive stationId equal to stop_id.
- Every Network.walks endpoint resolves to one unique canonical platform within 25 m.
- A ride is rejected only when fromIndex is not strictly less than toIndex; no rejection is based on name grouping.

- [ ] **Step 1: Write failing network tests**

~~~
it("does not invent a second Erzsébet park platform", () => {
  expect(net.stops.filter((s) => s.name.ro === "Parcul Elisabeta")).toHaveLength(1);
  expect(net.stops.filter((s) => s.name.ro === "Casa cu Arcade")).toHaveLength(1);
});
it("keeps the two factory platforms separate", () => {
  const stops = net.stops.filter((s) => s.name.ro === "Fabrica de Țigarete");
  expect(stops).toHaveLength(2);
  expect(stops[0].stationId).not.toBe(stops[1].stationId);
});
~~~

- [ ] **Step 2: Verify the network test fails**

Run: cd web && npm test -- --run lib/engine/__tests__/network.test.ts

Expected: FAIL because the current web network has a synthesized second Erzsébet park stop.

- [ ] **Step 3: Make walk mapping deterministic and remove name-based cycle filtering**

Replace generic same-name fallback in build_web_data.py with a unique nearest-platform lookup at most 25 m; drop and report an ambiguous edge. Set a stop stationId to its own physical ID when GTFS has no explicit parent. In plan.ts remove the visitedStations block and use:

~~~
if (leg.kind === "ride" && leg.fromIndex >= leg.toIndex) return null;
~~~

Time increases along every trip, so this cannot create a time-travel cycle. It permits a valid later circular call even where old name grouping had collapsed it.

- [ ] **Step 4: Regenerate and test**

Run: python3 build_web_data.py && cd web && npm test -- --run lib/engine/__tests__/network.test.ts

Expected: the new tests pass and each web walk has distinct real endpoints.

- [ ] **Step 5: Commit**

~~~
git add build_web_data.py tests/test_build_web_data.py web/lib/engine/plan.ts web/lib/engine/__tests__/network.test.ts web/public/data/network.json
git commit -m "Route transfers through real platforms"
~~~

### Task 4: Expose platform evidence in the audit page

**Files:**

- Modify: build_route_audit.py
- Modify: tests/test_build_route_audit.py
- Regenerate: route-audit.html

**Interfaces:**

- render(directions, topology) returns HTML whose every call includes raw coordinate, platform ID, resolved coordinate, and source.

- [ ] **Step 1: Write the failing audit test**

~~~
def test_audit_displays_platform_evidence(self):
    html = build_route_audit.render(sample_directions, sample_topology)
    self.assertIn("platform-id", html)
    self.assertIn("OSM #1248719238", html)
    self.assertIn("45.864116, 25.786523", html)
~~~

- [ ] **Step 2: Verify it fails**

Run: python3 -m unittest tests.test_build_route_audit.RouteAuditTests.test_audit_displays_platform_evidence -v

Expected: FAIL because the current audit renders only name and pass count.

- [ ] **Step 3: Render evidence and regenerate**

Mark osm, source-fallback, and override distinctly. Never call fallback geometry OSM. Run: python3 build_route_audit.py.

- [ ] **Step 4: Test and commit**

Run: python3 -m unittest tests.test_build_route_audit -v

~~~
git add build_route_audit.py tests/test_build_route_audit.py route-audit.html
git commit -m "Show physical platform evidence in audit"
~~~

### Task 5: Verify the complete offline bundle

**Files:**

- Regenerate only: platforms.json, gtfs/, multitrans-gtfs.zip, web/public/data/network.json, route-audit.html.

- [ ] **Step 1: Run the complete generation pipeline**

~~~
python3 build_gtfs.py
python3 build_web_data.py
python3 build_route_audit.py
~~~

- [ ] **Step 2: Run all Python checks**

Run: python3 -m unittest discover -s tests -v && python3 validate_gtfs.py

Expected: all tests pass and validator prints PROBLEMS: none.

- [ ] **Step 3: Run all web checks**

Run: cd web && npm test -- --run && npm run build

Expected: all Vitest tests and production build pass.

- [ ] **Step 4: Check concrete topology invariants**

~~~
python3 - <<'PY'
import json
platforms = json.load(open("platforms.json", encoding="utf-8"))["platforms"]
count = lambda name: sum(p["name"]["ro"] == name for p in platforms)
assert count("Parcul Elisabeta") == 1
assert count("Casa cu Arcade") == 1
assert count("Fabrica de Țigarete") == 2
print("platform topology invariants: OK")
PY
git diff --check HEAD
git status --short
~~~

Expected: all assertions and whitespace checks pass. Preserve the pre-existing untracked local development artifacts; do not add them.

- [ ] **Step 5: Commit verified output**

~~~
git add platforms.json gtfs multitrans-gtfs.zip web/public/data/network.json route-audit.html
git commit -m "Regenerate verified platform topology"
~~~

