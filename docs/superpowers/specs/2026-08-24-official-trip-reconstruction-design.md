# Official Trip Reconstruction Design

## Purpose

Make the journey planner use the operator's published time at every stop where
one exists. A road-duration estimate is permitted only for a physical call for
which the current official stop board has no matching printed time.

The application remains fully offline after generation. No browser request is
needed to calculate a journey.

## Authoritative input

The two official Multi-Trans publications have complementary information.

| Source | Trusted for | Not used for |
| --- | --- | --- |
| `jarat-*.html` route pages | ordered physical calls, stop coordinates and route geometry | departure times |
| `orarele/multitrans_menetrendek_web.html` | every printed stop-board departure, day type, line, headsign and D-extension marker | stop order |

The station timetable page deliberately sorts its cards alphabetically. It is
therefore never treated as route order. The route pages provide the order.

## Normalised timetable contract

`fetch_timetable.py` preserves each official board column without forcing it
onto one legacy `depart`/`return` direction:

```json
{
  "stop_ro": "Gara CFR",
  "line": "2",
  "destination": "Gara / Vasútállomás",
  "service": "weekday",
  "events": [
    { "minute": 305, "marked": true },
    { "minute": 380, "marked": false }
  ]
}
```

`marked: true` is significant: on the base 1/2/5 board it denotes a run which
continues as 1D/2D/5D. It must survive import and may not be flattened into an
unlabelled clock list.

## Reconstruction algorithm

For each ordered route pattern and service day:

1. Map official board columns to every compatible occurrence of that route's
   stop. Compatibility uses line number, D marker/variant, names and the
   published destination. A repeated loop stop remains a separate occurrence.
2. Select an anchor column with the most departures that maps to one unambiguous
   occurrence. Each anchor departure creates one candidate trip.
3. Align the chronological event sequence at every other compatible stop with
   the candidate trips. Alignment is monotonic: a published 08:04 can only be
   paired with a trip after its own preceding 08:00, never a later trip that
   happens to be geometrically close. Road-duration offsets are only a soft
   tie-breaker among otherwise valid monotonic matches.
4. Store a matched source value verbatim as that trip call's time and set
   `published=true`. If no source event is available for that physical call,
   fill it from the route's measured duration and set `published=false`.
5. Reject an invalid reconstruction before publishing when times go backwards,
   an official source event would be assigned twice, or a source column cannot
   be assigned monotonically. Such a column remains visible in the exact stop
   popup but is not silently invented as a planner call.

Times from 00:00 through 03:59 belong to the end of the operating day and are
represented as 24:00 through 27:59 internally. This keeps an overnight trip
chronological while the UI displays `00:xx`.

## Output contracts

`trips.json` changes from an anchor plus fixed offsets to complete calls:

```json
{
  "line": "2D",
  "direction": "depart",
  "weekday": [
    {
      "start": 305,
      "calls": [305, 309, 314],
      "published": [true, true, false]
    }
  ]
}
```

`build_gtfs.py` writes `calls[i]` directly to `stop_times.txt`. `timepoint=1`
means that exact time came from the official board; `timepoint=0` means a
measured-duration fill.

`build_web_data.py` groups web patterns by both their stop sequence and their
relative time vector. It cannot merge two journeys which use the same streets
but have different official intermediate times.

The existing `officialBoards` bundle remains separate and literal, so a stop
popup always reproduces the board even if a source row cannot safely be mapped
onto a route pattern.

## Failure behaviour

- Incomplete official download: generation fails before overwriting data.
- Unknown station spelling: report and fail unless it has an explicit canonical
  alias.
- Ambiguous loop/D mapping: preserve the popup board, omit the unproven exact
  planner assignment and report it during generation; never choose a plausible
  but unsupported direction.
- Missing board time: use the existing measured route duration, visibly marked
  estimated in the generated data.

## Verification

Automated fixtures cover an ordinary three-stop run, a missing middle time,
overnight ordering, a loop with two calls at the same station and a marked D
extension. The generated current feed must pass GTFS structural validation,
show no backward call time and retain every published board time either as a
direct GTFS timing point or an explicitly reported unmapped column.

The web suite verifies that the planner and stop board consume the same
generated schedule. Production build and `git diff --check` are required
before a local checkpoint commit. No branch is pushed or deployed.
