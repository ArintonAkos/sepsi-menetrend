# Official Stop-board Timetable Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate the app's schedule from every published Multi-Trans stop-board time, without silently replacing official times with a road-speed estimate.

**Architecture:** `fetch_timetable.py` remains the sole downloader and normalizer for the official `STATIONS` array. It preserves stop-board identity, direction and service-specific times, validates a complete current download, and emits an auditable source snapshot. The map popup reads those exact columns directly. The current operator source does **not** publish a machine-readable ordered stop sequence or geometry for every current-service variant, so `build_trips.py` cannot safely turn all board observations into asserted per-trip paths; its road-duration model remains explicitly estimated outside the direct board view.

**Tech Stack:** Python standard library generators, GTFS CSV, existing TypeScript/Vitest web planner.

**Spec:** `web/README.md` (offline, generated bundle) and the current official source `https://www.multitrans.ro/orarele/multitrans_menetrendek_web.html`.

## Global Constraints

- Do not push or deploy.
- Use the official stop-board table as the timing source.
- Keep road-duration interpolation only for a stop with no official printed time.
- Reject an incomplete or schema-incompatible source download instead of publishing partial data.
- Keep every change covered by a test that first fails.
- Preserve the existing PWA/offline data contract.

---

### Task 1: Preserve and validate the full official source

**Files:**
- Modify: `fetch_timetable.py`
- Test: `tests/test_fetch_timetable.py`

**Interfaces:**
- Produces `timetable.json` entries with source station identity, line, destination, normalized stop name and weekday/weekend departure lists.
- Consumed by `build_trips.py`.

- [x] **Step 1: Write failing tests for current `entries[]` rows, legacy rows, names and coverage.**

```python
assert times_of({"rows": [{"h": "07", "entries": [{"m": "15", "marked": False}]}]}) == ["07:15"]
with self.assertRaisesRegex(ValueError, "incomplete timetable"):
    validate_coverage(66, 85, 2952)
```

- [x] **Step 2: Run the focused test module and observe its expected failure.**

Run: `python3 -m unittest tests.test_fetch_timetable -v`

- [x] **Step 3: Parse both source row contracts, normalize documented name variants, and validate the complete source floor before writing output.**

```python
entries = row.get("entries") or [{"m": minute} for minute in row.get("m", "").split()]
validate_coverage(len(stations), len(entries), departure_count)
```

- [x] **Step 4: Re-run the focused test module.**

Run: `python3 -m unittest tests.test_fetch_timetable -v`

### Task 2: Model official per-call times rather than one estimated offset

> **Validation finding (2026-08-24): blocked by source data, not implementation.**
> The official board lists independent named stop columns, but it does not expose
> their ordered calls or geometries. Current special variants do not match the
> older static route pages. Do not infer a full path from card order or straight
> lines; that would repeat the routing error this work is intended to remove.
> Resume only with an official GTFS/GIS/ordered-trip export, or explicit approval
> to label a reconstructed geometry as an estimate.

**Files:**
- Modify: `fetch_timetable.py`
- Modify: `build_trips.py`
- Test: `tests/test_fetch_timetable.py`
- Create: `tests/test_build_trips.py`

**Interfaces:**
- Consumes normalized per-station schedule entries from `timetable.json`.
- Produces `trips.json` with complete per-trip call times and `published` flags.
- `build_gtfs.py` may no longer derive a supposedly published time from an unrelated anchor.

- [ ] **Step 1: Write a failing fixture test where two official calls have different offsets on separate runs.**

```python
trips = build_call_times(anchor=["08:00", "09:00"], observations={
    0: ["08:00", "09:00"], 1: ["08:04", "09:05"],
})
assert trips == [[480, 484], [540, 545]]
```

- [ ] **Step 2: Run the focused test and observe the missing per-trip representation.**

Run: `python3 -m unittest tests.test_build_trips -v`

- [ ] **Step 3: Assign board observations in chronological order to each route call, retaining direct source values and interpolating only absent calls.**

```python
call_times[trip_index][stop_index] = published_time
if call_times[trip_index][stop_index] is None:
    call_times[trip_index][stop_index] = anchor + measured_offset
```

- [ ] **Step 4: Make midnight values chronological (`00:xx` is the next service day) and assert that a late trip is not sorted before 04:00.**

Run: `python3 -m unittest tests.test_build_trips -v`

### Task 3: Carry true trip times through GTFS and the offline planner bundle

> **Validation finding (2026-08-24): deferred with Task 2.** Exact per-trip
> values require the same missing official path topology. The offline bundle now
> carries exact `officialBoards` for stop popups without presenting them as a
> false journey-planner schedule.

**Files:**
- Modify: `build_gtfs.py`
- Modify: `build_web_data.py`
- Test: `tests/test_build_trips.py`
- Test: `web/lib/engine/__tests__/network.test.ts`

**Interfaces:**
- `gtfs/stop_times.txt` has direct official time values where published.
- `network.json` patterns only group trips that have the same offset vector.
- Web planner reads the same true schedule as the GTFS feed.

- [ ] **Step 1: Write a failing test asserting the generated call time equals the official value, not a fixed anchor offset.**

```python
assert stop_times[("trip-2", 2)]["departure_time"] == "09:05:00"
```

- [ ] **Step 2: Run the generator test and observe the old anchor-derived result.**

Run: `python3 -m unittest tests.test_build_trips -v`

- [ ] **Step 3: Emit every trip's per-call times in `build_gtfs.py`; group web patterns by both stop sequence and offsets in `build_web_data.py`.**

```python
key = (route_id, shape_id, tuple(stop_ids), tuple(offsets))
```

- [ ] **Step 4: Run Python generator tests and the real-feed planner tests.**

Run: `python3 -m unittest discover -v && cd web && npm test -- --runInBand`

### Task 4: Rebuild and verify the generated artifacts

**Files:**
- Modify: `timetable.json`, `trips.json`, `gtfs/*`, `multitrans-gtfs.zip`, `web/public/data/network.json`

**Interfaces:**
- Verifies official count: at least 90 stations, 250 timing points and 7,000 departures.
- Verifies GTFS structure and web build.

- [ ] **Step 1: Fetch and generate from the current official source.**

Run: `python3 fetch_timetable.py && python3 build_trips.py && python3 build_gtfs.py && python3 build_web_data.py`

- [ ] **Step 2: Verify GTFS references and monotonic time order.**

Run: `python3 validate_gtfs.py`

- [ ] **Step 3: Run the full web test suite and production build.**

Run: `cd web && npm test && npm run build`

- [ ] **Step 4: Inspect `git diff --check` and report any pre-existing lint limitation separately.**

Run: `git diff --check HEAD && git status --short`
