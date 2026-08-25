# Terminal Trip Segmentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split verified terminal loops into separate scheduled patterns so every published stop-board time is used in its real direction without inventing a through-vehicle.

**Architecture:** `turnarounds.json` declares source-direction slices and their exact destination text. `build_trips.py` reconstructs each slice independently; each result is a normal scalar-call trip. GTFS and the browser bundle treat slices as separate patterns sharing the same public line ID, so a connection between them is an explicit real wait.

**Tech Stack:** Python 3 standard library and `unittest`; GTFS CSV; TypeScript/Vitest offline planner.

**Spec:** `docs/superpowers/specs/2026-08-25-terminal-trip-segmentation-design.md`

## Global Constraints

- A published board time is a hard anchor in exactly one declared segment.
- Estimates only fill calls missing from the corresponding source column.
- Do not infer a common vehicle across terminal segments.
- An unmatched, duplicated or non-monotonic published anchor fails the build audit.
- No runtime network request; all routing remains offline.
- Do not push or deploy.
- Never stage `.gitignore` or `web/package-lock.json`.

---

### Task 1: Replace turnaround roles with declarative trip segments

**Files:**
- Modify: `turnarounds.json`
- Modify: `trip_reconstruction.py`
- Test: `tests/test_trip_reconstruction.py`

**Interfaces:**
- `load_segments(raw, direction)` returns `Segment` mappings with `id`,
  `start_index`, `end_index`, and `destination`.
- A segment is a checked slice of an original direction; its indices are
  inclusive and must name real stops.

- [ ] **Step 1: Write the failing configuration test**

```python
def test_line_three_declares_independent_coseni_and_factory_segments(self):
    segments = load_segments({
        "3-depart": [
            {"id": "to-coseni", "start_index": 0, "end_index": 17,
             "destination": "Coșeni / Szotyor"},
            {"id": "from-coseni", "start_index": 16, "end_index": 31,
             "destination": "Str. Fabricii / Gyár utca"},
        ],
    }, direction_with_32_calls)
    self.assertEqual([(s["start_index"], s["end_index"]) for s in segments],
                     [(0, 17), (16, 31)])
```

- [ ] **Step 2: Verify RED**

Run: `python3 -m unittest tests.test_trip_reconstruction.DirectionReconstructionTests.test_line_three_declares_independent_coseni_and_factory_segments -v`

Expected: FAIL because `load_segments` does not exist.

- [ ] **Step 3: Implement configuration validation**

Replace the current line-3 role entry in `turnarounds.json` with:

```json
{
  "3-depart": [
    {"id":"to-coseni","start_index":0,"end_index":17,
     "destination":"Coșeni / Szotyor"},
    {"id":"from-coseni","start_index":16,"end_index":31,
     "destination":"Str. Fabricii / Gyár utca"}
  ]
}
```

`load_segments` rejects duplicate IDs, out-of-range indices, an end preceding
its start, and an empty destination. It returns a copy annotated with the
original direction key. It never derives slices from clock values.

- [ ] **Step 4: Verify GREEN**

Run: `python3 -m unittest tests.test_trip_reconstruction.DirectionReconstructionTests.test_line_three_declares_independent_coseni_and_factory_segments -v`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add turnarounds.json trip_reconstruction.py tests/test_trip_reconstruction.py
git commit -m "Declare terminal trip segments"
```

### Task 2: Reconstruct each segment from only its official headsign column

**Files:**
- Modify: `trip_reconstruction.py`
- Modify: `build_trips.py`
- Test: `tests/test_trip_reconstruction.py`
- Create: `tests/test_build_trips.py`

**Interfaces:**
- `slice_direction(direction, segment)` returns a copy with sliced `stops` and
  `shape`, plus `source_start_index`.
- `reconstruct_direction(..., destination=None)` ignores board entries with a
  different `destination` when destination is supplied.
- Generated trip records add `segment` and scalar complete `calls` values.

- [ ] **Step 1: Write the failing end-to-end fixture test**

```python
def test_separate_segments_keep_the_real_line_three_coseni_order(self):
    outbound = reconstruct_direction(
        slice_direction(direction, {"start_index": 16, "end_index": 31,
                                    "destination": "Str. Fabricii / Gyár utca"}),
        boards, offsets[16:32], destination="Str. Fabricii / Gyár utca")
    self.assertEqual(outbound["weekday"][0]["calls"][:4], [315, 316, 317, 318])
```

Add a real-data test in `tests/test_build_trips.py` that asserts:

```python
records = build_trips.build_records()
to_coseni = records["3-depart-to-coseni"]["weekday"]
from_coseni = records["3-depart-from-coseni"]["weekday"]
assert 296 in [trip["calls"][-1] for trip in to_coseni]
assert 316 in [trip["calls"][1] for trip in from_coseni]
```

- [ ] **Step 2: Verify RED**

Run: `python3 -m unittest tests.test_trip_reconstruction tests.test_build_trips -v`

Expected: FAIL because the generator builds one `3-depart` record and does not
filter board columns by destination.

- [ ] **Step 3: Implement segment reconstruction**

Add these production functions:

```python
def slice_direction(direction, segment):
    start, end = segment["start_index"], segment["end_index"]
    return {**direction, "stops": direction["stops"][start:end + 1],
            "source_start_index": start,
            "segment": segment["id"]}

def matching_entries(entries, destination):
    return [entry for entry in entries if destination is None
            or entry["destination"] == destination]
```

In `build_trips.py`, create `build_records()`; for a direction with declared
segments, run reconstruction once per segment and write record keys such as
`3-depart-to-coseni`. For directions without a declaration, preserve the
existing key and full route. Copy only the matching duration legs and normalize
the segment's first call offset to zero. Store `source_start_index` and
`source_end_index` on each record for later GTFS geometry slicing.

- [ ] **Step 4: Verify GREEN and regenerate source trips**

Run: `python3 -m unittest tests.test_trip_reconstruction tests.test_build_trips -v && python3 build_trips.py`

Expected: PASS; the line-3 diagnostics contain no false `04:56` / `05:16`
backwards relation.

- [ ] **Step 5: Commit**

```bash
git add trip_reconstruction.py build_trips.py tests/test_trip_reconstruction.py \
  tests/test_build_trips.py trips.json
git commit -m "Reconstruct terminal segments as separate trips"
```

### Task 3: Export segment-specific GTFS paths and browser patterns

**Files:**
- Modify: `build_gtfs.py`
- Modify: `build_web_data.py`
- Test: `tests/test_build_gtfs.py`
- Test: `tests/test_build_web_data.py`

**Interfaces:**
- A generated segment has `shape_id` equal to its trip-record key.
- GTFS rows use only the segment’s stop and shape range.
- Web patterns keep the public `lineId: "3"`, but use distinct IDs and sliced
  geometry.

- [ ] **Step 1: Write failing export tests**

```python
def test_line_three_terminal_segments_do_not_create_a_through_trip(self):
    feed = build_temporary_feed()
    toward = stop_times(feed, "3-depart-to-coseni-weekday-001")
    away = stop_times(feed, "3-depart-from-coseni-weekday-001")
    self.assertEqual(toward[-1]["departure_time"], "04:56:00")
    self.assertEqual(away[1]["departure_time"], "05:16:00")
    self.assertNotIn("05:16:00", [row["departure_time"] for row in toward])
```

```python
def test_segment_pattern_key_uses_the_sliced_stop_sequence(self):
    self.assertNotEqual(pattern_key(trip_to_coseni, rows_to_coseni),
                        pattern_key(trip_from_coseni, rows_from_coseni))
```

- [ ] **Step 2: Verify RED**

Run: `python3 -m unittest tests.test_build_gtfs tests.test_build_web_data -v`

Expected: FAIL because exporters assume every trip uses its full source
direction.

- [ ] **Step 3: Implement slice-aware export**

In `build_gtfs.py`, derive `stop_indexes = range(record["source_start_index"],
record["source_end_index"] + 1)`. Write those stops only and generate a shape
whose points run from the first to last anchored source vertex. In
`build_web_data.py`, retain the existing `pattern_key(route, shape, stop_ids)`
contract; the sliced stop list produces distinct patterns naturally. Slice the
shape to the first and last `shapeIndex`, preserving endpoints.

- [ ] **Step 4: Verify GREEN**

Run: `python3 build_gtfs.py && python3 build_web_data.py && python3 -m unittest tests.test_build_gtfs tests.test_build_web_data -v`

Expected: PASS; no line-3 web pattern joins an arrival through the terminal to
the separate Gyár utca departure.

- [ ] **Step 5: Commit**

```bash
git add build_gtfs.py build_web_data.py tests/test_build_gtfs.py tests/test_build_web_data.py \
  gtfs multitrans-gtfs.zip web/public/data/network.json
git commit -m "Export terminal trip segments separately"
```

### Task 4: Present same-line terminal waiting honestly

**Files:**
- Modify: `web/lib/engine/plan.ts`
- Modify: `web/components/journey/JourneyDetail.tsx`
- Test: `web/lib/engine/__tests__/plan.test.ts`
- Test: `web/components/journey/JourneyDetail.test.tsx`

**Interfaces:**
- Planner returns two ordinary ride legs at a terminal segment boundary.
- Detail component recognizes adjacent ride legs with equal `lineId` and one
  shared physical stop, and labels their gap as `Várakozás a 3-as következő
  futamára`.

- [ ] **Step 1: Write failing planning and detail tests**

```ts
it("waits for the published 05:16 second line-three segment", () => {
  const journey = plan(prepare(coseniFixture()), requestAt(274))[0]!;
  expect(journey.legs.filter((leg) => leg.kind === "ride")).toHaveLength(2);
  expect(journey.arrive).toBe(318);
});

it("calls a same-line terminal gap a wait, not a new ticket", () => {
  render(<JourneyDetail journey={coseniJourney} {...props} />);
  expect(screen.getByText(/Várakozás a 3-as következő futamára/)).toBeVisible();
});
```

- [ ] **Step 2: Verify RED**

Run: `cd web && npm test -- --run lib/engine/__tests__/plan.test.ts components/journey/JourneyDetail.test.tsx`

Expected: FAIL because the old long pattern still permits a through ride or
the detail treats every adjacent ride as a generic transfer.

- [ ] **Step 3: Implement the presentation rule**

Keep the planner’s existing transfer arithmetic. In the detail component,
when two consecutive ride legs have the same line ID and share the preceding
leg’s alight stop with the following leg’s boarding stop, render one wait row
using `next.board - previous.alight`; do not increase ticket count or label it
as an interchange. Do not collapse the underlying legs, because the map and
audit must retain the distinct trips.

- [ ] **Step 4: Verify GREEN**

Run: `cd web && npm test -- --run lib/engine/__tests__/plan.test.ts components/journey/JourneyDetail.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/lib/engine/plan.ts web/lib/engine/__tests__/plan.test.ts \
  web/components/journey/JourneyDetail.tsx web/components/journey/JourneyDetail.test.tsx
git commit -m "Present same-line terminal waits"
```

### Task 5: Audit all published anchors and run complete verification

**Files:**
- Create: `validate_timetable_anchors.py`
- Test: `tests/test_validate_timetable_anchors.py`
- Modify generated: `trips.json`, `gtfs/*`, `multitrans-gtfs.zip`, `web/public/data/network.json`

**Interfaces:**
- Audit key: `(line, service, destination, stop_ro, minute)`.
- Every board event must match exactly one trip call in its configured segment.

- [ ] **Step 1: Write the failing audit test**

```python
def test_coseni_arrival_and_factory_departure_match_different_trips(self):
    result = audit([
        event("3", "Coșeni / Szotyor", "Coșeni 2", 296),
        event("3", "Str. Fabricii / Gyár utca", "Coșeni 2", 316),
    ], records)
    self.assertEqual(result.unmatched, [])
    self.assertEqual(result.duplicates, [])
    self.assertNotEqual(result.matches[0]["trip"], result.matches[1]["trip"])
```

- [ ] **Step 2: Verify RED**

Run: `python3 -m unittest tests.test_validate_timetable_anchors -v`

Expected: FAIL because the audit program does not exist.

- [ ] **Step 3: Implement and run audit**

Expand `timetable.json` by service, use the segment destination to select the
record, and compare exact normalised minutes to the segment’s matched call.
Print sorted unmatched/duplicate JSON and exit `1` if either is non-empty.

- [ ] **Step 4: Full verification**

Run: `python3 build_trips.py && python3 build_gtfs.py && python3 build_web_data.py && python3 validate_timetable_anchors.py && python3 validate_gtfs.py && python3 -m unittest discover -v && cd web && npm test -- --run && npm run build && git diff --check HEAD`

Expected: all commands exit `0`; audit prints `all published timetable anchors matched`.

- [ ] **Step 5: Commit**

```bash
git add validate_timetable_anchors.py tests/test_validate_timetable_anchors.py \
  trips.json gtfs multitrans-gtfs.zip web/public/data/network.json
git commit -m "Audit published terminal timetable anchors"
```

## Plan self-review

| Requirement | Task |
| --- | --- |
| No invented same vehicle | Tasks 1–3 |
| 04:56 and 05:16 exact, separate trips | Tasks 2–5 |
| Estimates never overwrite board times | Tasks 2 and 5 |
| Correct GTFS, map and offline planner | Tasks 3–5 |
| Full source audit and regression suite | Task 5 |
