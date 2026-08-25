# Peronhoz kötött hivatalos időpontok Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bind every usable official stop-board column to one physical platform call, so the popup and planner use the same authoritative time.

**Architecture:** The generator resolves an official `(line, direction, destination, stop name)` column through the ordered route calls and `platforms.json`, then emits that `stopId` into the offline board bundle. Trip reconstruction accepts only the matched columns for a route call; the UI filters boards by `stopId`, never by display name.

**Tech Stack:** Python standard-library generators and tests; TypeScript/Vitest React application.

**Spec:** `docs/superpowers/specs/2026-08-25-platform-bound-official-times-design.md`

## Global Constraints

- Do not push or deploy.
- A downloaded official time is a hard peron-level anchor.
- Equal display names never identify a physical platform.
- An unresolved official column stops generation rather than being copied to both directions.
- Preserve offline `network.json` operation.
- Test first, run focused red/green checks, then full generator and web verification.

---

### Task 1: Represent a bound official board column

**Files:**
- Modify: `build_web_data.py:76-101`
- Modify: `web/lib/engine/types.ts:78-91`
- Test: `tests/test_build_web_data.py`
- Test: `web/lib/official-board.test.ts`

**Interfaces:**
- Produces `OfficialBoard` records with `stopId: string` in addition to literal
  display fields and times.
- Consumed by `officialBoardAt(boards, stopId, service)` and `StopBoard`.

- [ ] **Step 1: Write the failing Python test for a board bound to `P75`.**

```python
self.assertEqual(boards[0]["stopId"], "P75")
```

- [ ] **Step 2: Run the focused test and observe the missing `stopId`.**

Run: `python3 -m unittest tests.test_build_web_data.OfficialBoardTests -v`

- [ ] **Step 3: Emit `stopId` only from the resolved call-to-platform mapping.**

```python
{"stopId": resolved.stop_id, "stopRo": entry["stop_ro"], ...}
```

- [ ] **Step 4: Write and run the failing/passing TypeScript lookup test.**

```ts
expect(officialBoardAt(boards, "P75", "weekday")).toHaveLength(1);
expect(officialBoardAt(boards, "P76", "weekday")).toHaveLength(0);
```

- [ ] **Step 5: Commit the isolated data-contract change.**

### Task 2: Resolve and validate official columns against physical calls

**Files:**
- Modify: `build_trips.py:37-73`
- Modify: `trip_reconstruction.py:95-192`
- Modify: `build_web_data.py:76-101, 347-508`
- Test: `tests/test_trip_reconstruction.py`
- Test: `tests/test_build_web_data.py`

**Interfaces:**
- Consumes timetable entries, ordered direction calls and `topology["call_platforms"]`.
- Produces a unique source-column-to-`(direction, callIndex, platformId)` audit map.
- Raises `ValueError` if two physical calls match one source column equally.

- [ ] **Step 1: Write failing tests for two equal-name perons with opposite destinations.**

```python
bindings = resolve_board_calls(directions, topology, entries)
self.assertEqual(bindings[("4", "depart", "Str. Fabricii / Gyár utca", "Str. Constructorilor 2")]["platform_id"], "right")
with self.assertRaisesRegex(ValueError, "ambiguous official board"):
    resolve_board_calls(ambiguous_directions, topology, entries)
```

- [ ] **Step 2: Run the focused Python tests and observe the missing resolver.**

Run: `python3 -m unittest tests.test_trip_reconstruction tests.test_build_web_data -v`

- [ ] **Step 3: Implement destination- and direction-aware call resolution, then pass only its chosen column into reconstruction.**

```python
candidate = (line, source_direction, destination, stop_ro)
binding = {"direction": key, "index": index, "platform_id": platform_id}
```

- [ ] **Step 4: Assert that a literal `04:21` fills the matching trip call and has `published=True`; its opposite peron has no matching board.**

```python
self.assertEqual(trip["calls"][index], 261)
self.assertTrue(trip["published"][index])
```

- [ ] **Step 5: Re-run the focused Python suite and commit.**

### Task 3: Consume the platform-bound source consistently in the web app

**Files:**
- Modify: `web/lib/official-board.ts`
- Modify: `web/components/stops/StopBoard.tsx:35-41`
- Test: `web/lib/official-board.test.ts`
- Test: `web/components/stops/StopBoard.test.tsx`

**Interfaces:**
- `officialBoardAt(boards, stopId, service): OfficialBoard[]` accepts the
  physical platform id.
- `StopBoard` calls it with `stop.id`.

- [ ] **Step 1: Add a failing component test with P75/P76 sharing a title.**

```tsx
expect(screen.getByText("→ Str. Fabricii / Gyár utca")).toBeInTheDocument();
expect(screen.queryByText("→ Câmpul Frumos / Szépmező")).toBeNull();
```

- [ ] **Step 2: Run the focused Vitest test and observe both columns render.**

Run: `cd web && npx vitest run components/stops/StopBoard.test.tsx`

- [ ] **Step 3: Change lookup and component usage from `stop.name.ro` to `stop.id`.**

```ts
officialBoardAt(ctx.net.officialBoards ?? [], stop.id, service)
```

- [ ] **Step 4: Re-run focused web tests and commit.**

### Task 4: Rebuild, audit and verify the real feed

**Files:**
- Modify: generated `trips.json`, `gtfs/*`, `web/public/data/network.json` only if generation succeeds.

**Interfaces:**
- `network.json` contains only board records with a valid physical `stopId`.

- [ ] **Step 1: Rebuild trips, GTFS and web data.**

Run: `python3 build_trips.py && python3 build_gtfs.py && python3 build_web_data.py`

- [ ] **Step 2: Add/run an audit that fails on duplicate/unbound official board mappings and run GTFS validation.**

Run: `python3 validate_timetable_anchors.py && python3 validate_gtfs.py`

- [ ] **Step 3: Run all Python tests, all web tests, production build and whitespace check.**

Run: `python3 -m unittest discover -v && cd web && npm test && npm run build && cd .. && git diff --check HEAD`

- [ ] **Step 4: Inspect the generated Építők útja 2 board and report exact source-vs-planner values; do not push.**
