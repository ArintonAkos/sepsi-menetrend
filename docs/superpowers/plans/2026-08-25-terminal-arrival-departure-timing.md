# Terminal Arrival and Departure Timing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every published Multi-Trans stop-board time a hard routing anchor and preserve real terminal arrival-to-departure waits, beginning with line 3 at Coșeni 2 (`04:56` arrival, `05:16` departure).

**Architecture:** The generator will replace its one-time-per-call representation with an arrival/departure event pair per trip call. A small, versioned terminal-turn configuration maps the two headsign columns at a verified turnaround to the correct event role. The GTFS exporter and offline network bundle carry those exact events end to end; the planner boards at departures and alights at arrivals.

**Tech Stack:** Python 3 standard-library generators and `unittest`; GTFS CSV; TypeScript, Vitest, Next.js static bundle.

**Spec:** `docs/superpowers/specs/2026-08-25-terminal-arrival-departure-timing-design.md`

## Global Constraints

- A downloaded Multi-Trans board time is an immutable primary anchor.
- A `*` estimate is allowed only at an event that the source does not publish.
- Arrival and departure at a verified turnaround are separate events with `arrival <= departure`.
- `00:00–03:59` remains at the end of the service day internally.
- A non-monotonic or unmatched source event fails generation with an audit record; it is never silently replaced by an estimate.
- The browser remains offline after the bundle is generated; no new runtime request is introduced.
- Do not push or deploy.
- Preserve user-owned `.gitignore` and `web/package-lock.json` changes; never stage them.

---

## File structure and interfaces

| File | Responsibility after this work |
| --- | --- |
| `turnarounds.json` | Auditable verified terminal call, source headsigns and expected dwell envelope for every special arrival/departure pair. Initially records line 3 / Coșeni 2. |
| `trip_reconstruction.py` | Matches official board columns to ordered calls and returns literal `arrival`, `departure`, `published_arrival`, `published_departure` values. |
| `build_trips.py` | Loads turnaround metadata and writes complete per-trip call events to `trips.json`. |
| `build_gtfs.py` | Writes the distinct GTFS `arrival_time` and `departure_time` values. |
| `build_web_data.py` | Groups only topology/geometry into patterns and writes per-trip call event vectors into `network.json`. |
| `web/lib/engine/types.ts` | Defines `Trip.calls[index]` as the timing authority for the planner. |
| `web/lib/engine/plan.ts` | Uses a departure to board, an arrival to alight, and preserves terminal dwell in boards/timetables. |
| `web/lib/engine/multimodal.ts` | Uses the same per-trip timing helpers while evaluating bus legs next to SepsiBike alternatives. |
| `web/components/journey/JourneyDetail.tsx` | Displays `*` from the selected trip event rather than a pattern-wide flag. |
| `web/components/timetable/Timetable.tsx` | Displays per-run event accuracy, including a terminal dwell where arrival and departure differ. |

The Python trip call contract is:

```python
{
    "start": 275,
    "calls": [
        {"arrival": 275, "departure": 275,
         "published_arrival": True, "published_departure": True},
        {"arrival": 296, "departure": 316,
         "published_arrival": True, "published_departure": True},
    ],
}
```

The web trip contract is the same shape with camelCase flags:

```ts
interface TripCall {
  arrival: Minute;
  departure: Minute;
  publishedArrival: boolean;
  publishedDeparture: boolean;
}

interface Trip {
  patternId: string;
  service: ServiceId;
  start: Minute;
  calls: TripCall[];
}
```

### Task 1: Declare and validate terminal-turn metadata

**Files:**
- Create: `turnarounds.json`
- Modify: `trip_reconstruction.py`
- Test: `tests/test_trip_reconstruction.py`

**Interfaces:**
- Consumes: direction key, ordered call index, official `destination` text.
- Produces: `turnaround_role(direction_key, call_index, destination)` returning
  `"arrival"`, `"departure"`, or `None`.
- Initial line-3 record maps `Coșeni / Szotyor` to arrival and
  `Str. Fabricii / Gyár utca` to departure at call index 17 (`Coșeni 2`).

- [ ] **Step 1: Write the failing terminal-role tests**

```python
from trip_reconstruction import load_turnarounds, turnaround_role

def test_line_three_coseni_turn_assigns_each_board_column_once(self):
    turns = load_turnarounds({
        "3-depart": [{
            "index": 17, "stop_ro": "Coșeni 2",
            "arrival_destination": "Coșeni / Szotyor",
            "departure_destination": "Str. Fabricii / Gyár utca",
            "minimum_dwell_minutes": 0,
        }]
    })
    self.assertEqual(turnaround_role(turns, "3-depart", 17,
                                     "Coșeni / Szotyor"), "arrival")
    self.assertEqual(turnaround_role(turns, "3-depart", 17,
                                     "Str. Fabricii / Gyár utca"), "departure")
    self.assertIsNone(turnaround_role(turns, "3-depart", 17, "Gara CFR"))
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `python3 -m unittest tests.test_trip_reconstruction.DirectionReconstructionTests.test_line_three_coseni_turn_assigns_each_board_column_once -v`

Expected: FAIL because `load_turnarounds` and `turnaround_role` do not exist.

- [ ] **Step 3: Add the audited source configuration and minimal parser**

Create `turnarounds.json` as:

```json
{
  "3-depart": [{
    "index": 17,
    "stop_ro": "Coșeni 2",
    "arrival_destination": "Coșeni / Szotyor",
    "departure_destination": "Str. Fabricii / Gyár utca",
    "minimum_dwell_minutes": 0,
    "evidence": "Multi-Trans stop board: 04:56 Coșeni arrival; 05:16 Gyár utca departure"
  }]
}
```

Implement `load_turnarounds(raw)` to reject duplicate `(direction_key, index,
role)` declarations and `turnaround_role(...)` to select only an exact
destination match. Validate that every configured index exists, has the named
stop, and names two different destinations before reconstruction begins.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `python3 -m unittest tests.test_trip_reconstruction.DirectionReconstructionTests.test_line_three_coseni_turn_assigns_each_board_column_once -v`

Expected: PASS.

- [ ] **Step 5: Commit the metadata boundary**

```bash
git add turnarounds.json trip_reconstruction.py tests/test_trip_reconstruction.py
git commit -m "Add audited terminal turnaround metadata"
```

### Task 2: Reconstruct literal arrival and departure events

**Files:**
- Modify: `trip_reconstruction.py`
- Test: `tests/test_trip_reconstruction.py`

**Interfaces:**
- Consumes: `reconstruct_direction(direction, entries, offsets, turnarounds)`.
- Produces: `{"weekday": [trip], "weekend": [trip]}` where each `trip["calls"]`
  item has the four fields in the Python contract above; report rows identify
  `event_role` and source time whenever matching fails.

- [ ] **Step 1: Write failing reconstruction tests before changing production code**

```python
def test_turnaround_keeps_source_arrival_and_later_source_departure(self):
    route = {
        "line": "3", "direction": "depart", "key": "3-depart",
        "stops": [{"name": {"ro": "A"}}, {"name": {"ro": "Coșeni 2"}},
                  {"name": {"ro": "B"}}],
    }
    boards = [
        self.board("3", "A", ("04:35", False)),
        self.board("3", "Coșeni 2", ("04:56", False),
                   direction="depart", destination="Coșeni / Szotyor"),
        self.board("3", "Coșeni 2", ("05:16", False),
                   direction="depart", destination="Str. Fabricii / Gyár utca"),
        self.board("3", "B", ("05:22", False)),
    ]
    trips, report = reconstruct_direction(route, boards, [0, 21 * 60, 27 * 60], {
        "3-depart": [{"index": 1, "stop_ro": "Coșeni 2",
                       "arrival_destination": "Coșeni / Szotyor",
                       "departure_destination": "Str. Fabricii / Gyár utca",
                       "minimum_dwell_minutes": 0}],
    })
    turn = trips["weekday"][0]["calls"][1]
    self.assertEqual((turn["arrival"], turn["departure"]), (296, 316))
    self.assertTrue(turn["published_arrival"])
    self.assertTrue(turn["published_departure"])
    self.assertEqual(trips["weekday"][0]["calls"][2]["arrival"], 322)
    self.assertEqual(report, [])

def test_estimate_never_replaces_a_published_turn_event(self):
    # Same fixture with a deliberately wrong measured offset; source times win.
    trips, _report = reconstruct_direction(route, boards, [0, 40 * 60, 46 * 60], turns)
    self.assertEqual(trips["weekday"][0]["calls"][1]["arrival"], 296)
    self.assertEqual(trips["weekday"][0]["calls"][1]["departure"], 316)
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `python3 -m unittest tests.test_trip_reconstruction.DirectionReconstructionTests.test_turnaround_keeps_source_arrival_and_later_source_departure tests.test_trip_reconstruction.DirectionReconstructionTests.test_estimate_never_replaces_a_published_turn_event -v`

Expected: FAIL because calls are integer values and no arrival/departure roles
exist.

- [ ] **Step 3: Replace scalar call reconstruction with event reconstruction**

Implement these rules in `trip_reconstruction.py`:

```python
def blank_call(predicted):
    return {"arrival": predicted, "departure": predicted,
            "published_arrival": False, "published_departure": False}

def set_anchor(call, role, minute):
    key, source_key = (("arrival", "published_arrival") if role == "arrival"
                       else ("departure", "published_departure"))
    if call[source_key] and call[key] != minute:
        raise ValueError(f"conflicting published {role}: {call[key]} != {minute}")
    call[key], call[source_key] = minute, True

def propagate_between(calls, offsets):
    for index in range(1, len(calls)):
        calls[index]["arrival"] = max(calls[index]["arrival"],
                                      calls[index - 1]["departure"])
        if not calls[index]["published_departure"]:
            calls[index]["departure"] = max(calls[index]["departure"],
                                              calls[index]["arrival"])
```

Use the existing monotonic alignment only to pair source columns with runs.
When a terminal metadata role is present, apply the literal time to that
role. For other calls, apply it to both arrival and departure, marking both
published. Re-run forward propagation after every matching pass, then reject
any call where `arrival > departure` or where the next arrival is before the
previous departure. Do not use the old `would break time order` branch to
discard a source value.

- [ ] **Step 4: Convert existing reconstruction tests to the event contract**

Replace assertions such as:

```python
self.assertEqual(trips["weekday"][0]["calls"], [480, 484, 489])
self.assertEqual(trips["weekday"][0]["published"], [True, True, False])
```

with:

```python
calls = trips["weekday"][0]["calls"]
self.assertEqual([(c["arrival"], c["departure"]) for c in calls],
                 [(480, 480), (484, 484), (489, 489)])
self.assertEqual([c["published_departure"] for c in calls], [True, True, False])
```

Keep all existing D-extension, repeated-loop, incomplete-column and
after-midnight cases; add one assertion that an unmatched source event is
reported with its `event_role` rather than converted to `published=false`.

- [ ] **Step 5: Run all reconstruction tests**

Run: `python3 -m unittest tests.test_trip_reconstruction -v`

Expected: PASS.

- [ ] **Step 6: Commit the reconstruction contract**

```bash
git add trip_reconstruction.py tests/test_trip_reconstruction.py
git commit -m "Preserve terminal arrival and departure events"
```

### Task 3: Emit exact arrival/departure values in GTFS

**Files:**
- Modify: `build_trips.py`
- Modify: `build_gtfs.py`
- Test: `tests/test_build_gtfs.py`
- Create: `tests/test_build_trips.py`

**Interfaces:**
- Consumes: event-based `trips.json` records and `turnarounds.json`.
- Produces: `gtfs/stop_times.txt` whose one row per call has an independently
  correct `arrival_time` and `departure_time`.

- [ ] **Step 1: Write failing source-to-GTFS tests**

```python
def test_writes_distinct_terminal_arrival_and_departure(self):
    call = {"arrival": 296, "departure": 316,
            "published_arrival": True, "published_departure": True}
    self.assertEqual(build_gtfs.gtfs_times(call), ("04:56:00", "05:16:00"))

def test_line_three_coseni_source_times_are_hard_anchors(self):
    record = json.loads(Path("trips.json").read_text())["trips"]["3-depart"]
    call = next(t["calls"][17] for t in record["weekday"]
                if t["calls"][17]["arrival"] == 296)
    self.assertEqual(call["departure"], 316)
    self.assertTrue(call["published_arrival"])
    self.assertTrue(call["published_departure"])
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `python3 -m unittest tests.test_build_gtfs.GtfsCsvTests.test_writes_distinct_terminal_arrival_and_departure -v`

Expected: FAIL because `gtfs_times` does not exist.

- [ ] **Step 3: Update the Python generators**

In `build_trips.py`, load `turnarounds.json`, pass it to
`reconstruct_direction`, and compute `start` from first-call departure. In
`build_gtfs.py`, make `trip_calls` reject old scalar cache data rather than
fabricating officialness, add:

```python
def gtfs_times(call):
    return gtfs_time(call["arrival"]), gtfs_time(call["departure"])
```

and use it when writing each stop-time row. Set GTFS `timepoint=1` only when
both values are literal source values; otherwise use `0`, while the richer
sidecar continues to retain role-level flags.

Add `validate_trip_calls(key, service, trip)` before writing output. It must
check equal array length, `arrival <= departure`, monotonic next-call arrival
after prior-call departure, and at least one direct source anchor on every
generated trip. Its error message includes route, service, trip index, call
index and clock values.

- [ ] **Step 4: Run Python generator tests**

Run: `python3 -m unittest tests.test_build_trips tests.test_build_gtfs -v`

Expected: PASS.

- [ ] **Step 5: Rebuild the feed and assert the real line-3 rows**

Run: `python3 build_trips.py && python3 build_gtfs.py && python3 -m unittest tests.test_build_gtfs.GtfsTopologyTests -v`

Expected: generated `stop_times.txt` contains the `Coșeni 2` 04:56:00 / 05:16:00
row and topology tests PASS.

- [ ] **Step 6: Commit the GTFS change**

```bash
git add build_trips.py build_gtfs.py tests/test_build_trips.py tests/test_build_gtfs.py \
  trips.json gtfs multitrans-gtfs.zip
git commit -m "Write exact terminal waits into GTFS"
```

### Task 4: Carry call events to the offline web bundle

**Files:**
- Modify: `build_web_data.py`
- Modify: `tests/test_build_web_data.py`
- Modify: `web/lib/engine/types.ts`
- Modify: `web/lib/engine/__tests__/fixture.ts`
- Modify: `web/lib/engine/__tests__/network.test.ts`

**Interfaces:**
- Consumes: GTFS rows with distinct arrival/departure times.
- Produces: patterns keyed by topology/shape only, and web `Trip.calls` rows
  whose values are direct translations of GTFS stop-time rows.

- [ ] **Step 1: Write failing bundle-shape tests**

```python
def test_topologically_identical_trips_share_a_pattern_but_keep_call_events(self):
    early = [
        {"stop_id": "A", "arrival_time": "04:35:00", "departure_time": "04:35:00"},
        {"stop_id": "C", "arrival_time": "04:56:00", "departure_time": "05:16:00"},
    ]
    late = [
        {"stop_id": "A", "arrival_time": "05:35:00", "departure_time": "05:35:00"},
        {"stop_id": "C", "arrival_time": "05:56:00", "departure_time": "06:16:00"},
    ]
    self.assertEqual(pattern_key({"route_id": "3", "shape_id": "3-depart"}, early),
                     pattern_key({"route_id": "3", "shape_id": "3-depart"}, late))
    self.assertEqual(web_trip_calls(early)[1]["departure"], 316)
```

Add a TypeScript fixture assertion that `Trip.calls` is required and has one
item for every `Pattern.stopIds` item.

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `python3 -m unittest tests.test_build_web_data -v && cd web && npm test -- --run web/lib/engine/__tests__/network.test.ts`

Expected: FAIL because `pattern_key` still includes departure offsets and the
web `Trip` type has no calls.

- [ ] **Step 3: Implement topology-only pattern grouping and trip call export**

Replace `pattern_key` with:

```python
def pattern_key(trip, rows):
    return (trip["route_id"], trip["shape_id"],
            tuple(row["stop_id"] for row in rows))
```

Add:

```python
def web_trip_calls(rows):
    return [{
        "arrival": seconds(row["arrival_time"]) // 60,
        "departure": seconds(row["departure_time"]) // 60,
        "publishedArrival": row.get("timepoint") == "1",
        "publishedDeparture": row.get("timepoint") == "1",
    } for row in rows]
```

Keep pattern `offsets` only as a geometric/fallback relative-time vector based
on its first representative row. Remove pattern-wide `published` from the web
contract; publication accuracy belongs to the selected trip event. Add
`TripCall` and `calls: TripCall[]` to `types.ts`, then update the shared
fixture with a helper:

```ts
const calls = (start: Minute, offsets: Minute[], published = true): TripCall[] =>
  offsets.map((offset) => ({ arrival: start + offset, departure: start + offset,
    publishedArrival: published, publishedDeparture: published }));
```

- [ ] **Step 4: Rebuild web data and verify its real invariant**

Run: `python3 build_web_data.py && cd web && npm test -- --run web/lib/engine/__tests__/network.test.ts`

Expected: PASS; every trip has `calls.length === pattern.stopIds.length`, and
the real line-3 Coșeni 2 trip preserves `arrival=296`, `departure=316`.

- [ ] **Step 5: Commit the bundle contract**

```bash
git add build_web_data.py tests/test_build_web_data.py web/lib/engine/types.ts \
  web/lib/engine/__tests__/fixture.ts web/lib/engine/__tests__/network.test.ts \
  web/public/data/network.json
git commit -m "Ship per-trip arrival and departure events"
```

### Task 5: Make the planner board and alight using the correct event

**Files:**
- Modify: `web/lib/engine/plan.ts`
- Modify: `web/lib/engine/multimodal.ts`
- Modify: `web/lib/engine/__tests__/plan.test.ts`
- Modify: `web/lib/engine/__tests__/multimodal.test.ts`
- Modify: `web/lib/engine/__tests__/board.test.ts`

**Interfaces:**
- Provides: `arrivalAt(trip, index)` and `departureAt(trip, index)`.
- Consumes: `Trip.calls[index]`; no routing path may calculate a scheduled time
  from `trip.start + pattern.offsets[index]`.

- [ ] **Step 1: Write failing planner tests**

```ts
it("cannot board before a terminal's published departure", () => {
  const net = fixture();
  net.trips[0] = {
    ...net.trips[0],
    calls: [
      { arrival: 275, departure: 275, publishedArrival: true, publishedDeparture: true },
      { arrival: 296, departure: 316, publishedArrival: true, publishedDeparture: true },
      { arrival: 322, departure: 322, publishedArrival: true, publishedDeparture: true },
    ],
  };
  const board = nextDepartures(prepare(net), "B", "1", 300, "weekday");
  expect(board).toContain(316);
  expect(board).not.toContain(296);
});

it("arrives at the terminal before its later departure", () => {
  const journey = plan(prepare(turnFixture()), requestAt(275))[0]!;
  expect(journey.arrive).toBe(296);
});
```

Add a multimodal assertion that a bike-to-bus candidate compares its
`readyAt` time with the bus call's `departure`, not its arrival.

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `cd web && npm test -- --run web/lib/engine/__tests__/plan.test.ts web/lib/engine/__tests__/multimodal.test.ts web/lib/engine/__tests__/board.test.ts`

Expected: FAIL because the engine still adds `pattern.offsets` to `trip.start`.

- [ ] **Step 3: Replace every schedule arithmetic use with helpers**

Add at the top of `plan.ts`:

```ts
export const arrivalAt = (trip: Trip, index: number): Minute => trip.calls[index]!.arrival;
export const departureAt = (trip: Trip, index: number): Minute => trip.calls[index]!.departure;
```

Make these replacements:

```ts
// board candidates and nextDepartures
departureAt(trip, index)

// a ride reaches a stop
arrivalAt(trip, index)

// reconstructed legs and fare/transfer calculations
departureAt(trip, fromIndex)
arrivalAt(trip, toIndex)
```

Import the two helpers in `multimodal.ts` and apply the same rule to every
candidate and alighting calculation. Preserve `trip.start` only for sorting
and display ordering; set it equal to `calls[0].departure` at generation.

For `boardAt`, build each column from departures when there is a following
stop; use arrivals for a terminal row with no following stop. Its
`published` flag is true only if every displayed time comes from that role's
published flag; otherwise separate the estimated column rather than marking a
mixed column official. `timetable` must return both arrival and departure
grids so a caller can show a non-zero dwell without inventing a second stop.

- [ ] **Step 4: Run the focused planner tests to verify they pass**

Run: `cd web && npm test -- --run web/lib/engine/__tests__/plan.test.ts web/lib/engine/__tests__/multimodal.test.ts web/lib/engine/__tests__/board.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the planner timing change**

```bash
git add web/lib/engine/plan.ts web/lib/engine/multimodal.ts \
  web/lib/engine/__tests__/plan.test.ts web/lib/engine/__tests__/multimodal.test.ts \
  web/lib/engine/__tests__/board.test.ts
git commit -m "Plan trips from exact arrivals and departures"
```

### Task 6: Show selected-trip accuracy and terminal waits in the UI

**Files:**
- Modify: `web/components/journey/JourneyDetail.tsx`
- Modify: `web/components/timetable/Timetable.tsx`
- Modify: `web/components/stops/StopBoard.tsx`
- Modify: `web/components/stops/StopBoard.test.tsx`
- Test: `web/components/journey/JourneyDetail.test.tsx` (create if absent)

**Interfaces:**
- Consumes: ride `trip`, `fromIndex`, `toIndex` and the event-level accuracy
  flags in `trip.calls`.
- Produces: a `*` only for a displayed estimated event; a visible
  `04:56 érkezés · 05:16 indulás` terminal wait when both events differ.

- [ ] **Step 1: Write failing component tests**

```tsx
it("shows the published Coșeni arrival and departure without a star", () => {
  render(<JourneyDetail journey={turnJourney} {...props} />);
  expect(screen.getByText(/04:56.*érkezés/i)).toBeVisible();
  expect(screen.getByText(/05:16.*indulás/i)).toBeVisible();
  expect(screen.queryByText("04:56*")).not.toBeInTheDocument();
});

it("marks only an estimated selected event", () => {
  render(<JourneyDetail journey={estimatedJourney} {...props} />);
  expect(screen.getByText("05:22*")).toBeVisible();
});
```

- [ ] **Step 2: Run the component tests to verify they fail**

Run: `cd web && npm test -- --run components/journey/JourneyDetail.test.tsx components/stops/StopBoard.test.tsx`

Expected: FAIL because components read `pattern.published` and have no
arrival/departure-dwell rendering.

- [ ] **Step 3: Render role-level times and accuracy**

In `JourneyDetail.tsx`, derive accuracy from
`ride.trip.calls[ride.fromIndex].publishedDeparture` and
`ride.trip.calls[ride.toIndex].publishedArrival`. When an intermediate call
has `arrival !== departure`, render its own compact terminal row:

```tsx
<span>{formatHHMM(call.arrival)}{call.publishedArrival ? "" : "*"} érkezés</span>
<span>{formatHHMM(call.departure)}{call.publishedDeparture ? "" : "*"} indulás</span>
```

In `Timetable.tsx`, use the returned arrival/departure grids and render a
second line only where the values differ. Keep ordinary rows visually
unchanged. In `StopBoard.tsx`, keep literal `officialBoards` as the first
authority and use event-level estimated state only for reconstructed fallback
columns.

- [ ] **Step 4: Run the focused component tests**

Run: `cd web && npm test -- --run components/journey/JourneyDetail.test.tsx components/stops/StopBoard.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit the UI accuracy change**

```bash
git add web/components/journey/JourneyDetail.tsx web/components/journey/JourneyDetail.test.tsx \
  web/components/timetable/Timetable.tsx web/components/stops/StopBoard.tsx \
  web/components/stops/StopBoard.test.tsx
git commit -m "Show terminal waits and event-level estimates"
```

### Task 7: Rebuild, audit every official time and verify the release bundle

**Files:**
- Create: `validate_timetable_anchors.py`
- Test: `tests/test_validate_timetable_anchors.py`
- Modify generated: `trips.json`, `gtfs/stop_times.txt`, `multitrans-gtfs.zip`, `web/public/data/network.json`

**Interfaces:**
- Consumes: `timetable.json`, `turnarounds.json`, `trips.json`, GTFS files and
  `network.json`.
- Produces: non-zero exit and a deterministic list of unmatched or duplicated
  `(line, service, stop, destination, time, role)` anchors.

- [ ] **Step 1: Write failing anchor-audit tests**

```python
def test_accepts_the_exact_line_three_terminal_pair(self):
    result = audit([
        board("3", "Coșeni 2", "Coșeni / Szotyor", "04:56"),
        board("3", "Coșeni 2", "Str. Fabricii / Gyár utca", "05:16"),
    ], [trip_with_turn(arrival=296, departure=316)])
    self.assertEqual(result.unmatched, [])
    self.assertEqual(result.duplicates, [])

def test_rejects_an_estimate_substituted_for_a_published_time(self):
    result = audit([board("3", "Coșeni 2", "Coșeni / Szotyor", "04:56")],
                   [trip_with_turn(arrival=280, departure=316)])
    self.assertEqual(result.unmatched[0]["time"], "04:56")
```

- [ ] **Step 2: Run the audit tests to verify they fail**

Run: `python3 -m unittest tests.test_validate_timetable_anchors -v`

Expected: FAIL because the audit module does not exist.

- [ ] **Step 3: Implement deterministic anchor auditing**

`validate_timetable_anchors.py` must expand each source board event by service,
normalize overnight clock minutes, resolve its role through `turnarounds.json`,
and compare it to one and only one matching `trips.json` event. Write
unmatched and duplicate rows as sorted JSON to stderr; return `1` when either
list is non-empty. On success print `all published timetable anchors matched`.

- [ ] **Step 4: Run the complete data build and audit**

Run: `python3 build_trips.py && python3 build_gtfs.py && python3 build_web_data.py && python3 validate_timetable_anchors.py && python3 validate_gtfs.py`

Expected: all generators exit `0`; audit prints `all published timetable anchors matched`; GTFS validation exits `0`.

- [ ] **Step 5: Run all automated verification**

Run: `python3 -m unittest discover -v && cd web && npm test -- --run && npm run build`

Expected: all Python and Vitest tests PASS; production build succeeds.

- [ ] **Step 6: Inspect the exact user-reported scenario**

Run: `python3 - <<'PY'
import json
from pathlib import Path
trips = json.loads(Path('trips.json').read_text())['trips']['3-depart']['weekday']
for trip in trips:
    call = trip['calls'][17]
    if call['arrival'] == 4 * 60 + 56:
        print(call)
PY`

Expected: `{'arrival': 296, 'departure': 316, 'published_arrival': True, 'published_departure': True}`.

- [ ] **Step 7: Final whitespace and scope check**

Run: `git diff --check HEAD && git status --short`

Expected: no whitespace errors; only this feature's files plus the pre-existing
user-owned `.gitignore` and `web/package-lock.json` modifications are listed.

- [ ] **Step 8: Commit generated data and audit**

```bash
git add validate_timetable_anchors.py tests/test_validate_timetable_anchors.py \
  trips.json gtfs multitrans-gtfs.zip web/public/data/network.json
git commit -m "Verify every published timetable anchor"
```

## Plan self-review

| Specification requirement | Covered by |
| --- | --- |
| Published times are immutable anchors | Tasks 2, 3 and 7 |
| Arrival and departure separated at a terminal | Tasks 1–3 and 5–6 |
| Estimates only fill absent source events | Tasks 2, 6 and 7 |
| Line 3 `04:56 → 05:16` | Tests in Tasks 1–7 |
| Exact GTFS and offline bundle | Tasks 3–5 |
| Offline operation and no silent failures | Global constraints and Task 7 |
| Full regression verification | Task 7 |
