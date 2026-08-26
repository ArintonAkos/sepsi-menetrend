#!/usr/bin/env python3
"""Turn official stop boards plus ordered route pages into complete trips.

The route page says which physical stop comes next. The station timetable says
the exact clock at individual stops. `trip_reconstruction` matches those clock
columns monotonically for each run, retaining every safe official call time and
using road duration only where a physical call has no printed value.
"""

import json
import sys
from pathlib import Path

from build_map import duration_seconds_for, load_directions
from build_platforms import load_osm_platforms, load_overrides, resolve_platforms
from build_web_data import board_binding_key, official_board_bindings
from trip_reconstruction import reconstruct_direction
from timetable_overrides import (
    apply_timetable_overrides, filter_opposite_platform_columns,
    merge_same_platform_columns,
)

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "trips.json"
DWELL_SECONDS = 25
ORDER = ["1", "1D", "2", "2D", "3", "4", "5", "5D", "6", "7", "9", "10"]


def minutes(text):
    hour, minute = text.split(":")
    return int(hour) * 60 + int(minute)


def clock(total):
    total %= 24 * 60
    return f"{total // 60:02d}:{total % 60:02d}"


def offsets_for(direction):
    """Seconds from leaving the first stop to reaching each later stop."""
    legs = json.loads(
        (ROOT / f"line-{direction['line']}" /
         f"{direction.get('source_direction', direction['direction'])}-durations.json").read_text(encoding="utf-8")
    )["legs"]
    legs = duration_seconds_for(direction, legs)
    out = [0]
    # `duration_seconds_for` includes a terminal zero so its result has the
    # same length as the calls.  There is no leg after the final call.
    for i, seconds in enumerate(legs[:-1]):
        out.append(out[-1] + seconds + (DWELL_SECONDS if i else 0))
    return out


def reconstruction_inputs(timetable, directions, topology):
    """Attach the reviewed physical-platform identity to both sides of the
    reconstruction contract.

    Route pages provide order but reuse stop names on both sides of a road.
    The source timetable page gives each physical pole a stable station id.
    `official_board_bindings` resolves that id once against the reviewed OSM /
    override topology; the reconstructor then may only use a board column at a
    physical call which actually belongs to the selected timetable segment.
    """
    platforms = topology["platforms"]
    platform_stop_ids = {
        platform["id"]: f"P{index}"
        for index, platform in enumerate(platforms, 1)
    }
    stop_platform_ids = {stop_id: platform_id
                         for platform_id, stop_id in platform_stop_ids.items()}
    bindings = official_board_bindings(timetable, directions, topology,
                                       platform_stop_ids)

    entries = []
    for entry in apply_timetable_overrides(timetable["timepoints"]):
        stop_id = bindings.get(board_binding_key(entry))
        platform_id = stop_platform_ids.get(stop_id)
        # The board source is literal and still useful when a platform cannot
        # be proven.  In that exceptional case leave it unfiltered rather than
        # inventing a kerb.
        entries.append({**entry, **({"_platform": platform_id}
                                    if platform_id else {})})

    resolved_directions = []
    for direction in directions:
        call_platforms = [
            topology["call_platforms"][(direction["line"], direction["direction"], index)]
            for index in range(len(direction["stops"]))
        ]
        resolved_directions.append({
            **direction,
            "callPlatforms": call_platforms,
            "call_platform_ids": sorted(set(call_platforms)),
        })
    entries = filter_opposite_platform_columns(entries, resolved_directions)
    return merge_same_platform_columns(entries), resolved_directions


def main():
    timetable = json.loads((ROOT / "timetable.json").read_text(encoding="utf-8"))
    directions = load_directions()
    topology = resolve_platforms(directions, load_osm_platforms(), load_overrides())
    timepoints, directions = reconstruction_inputs(timetable, directions, topology)
    trips, reports, skipped = {}, [], []
    for direction in directions:
        line, name = direction["line"], direction["direction"]
        key = f"{line}-{name}"
        offsets = offsets_for(direction)
        calls, report = reconstruct_direction(direction, timepoints, offsets)
        if not any(calls.values()):
            skipped.append(f"{key}: no reconstructable official times")
            continue
        record = {"line": line, "direction": name,
                  "source_direction": direction.get("source_direction", name),
                  "destination": direction.get("destination"),
                  "offsets": offsets,
                  "weekday": calls["weekday"], "weekend": calls["weekend"],
                  "unmatched": report}
        trips[key] = record
        reports.extend({"route": key, **item} for item in report)

    bundle = {
        "source": timetable["source"],
        "valid_from": timetable["valid_from"],
        "dwell_seconds": DWELL_SECONDS,
        "note": "each trip contains complete call times; published=true means "
                "the operator printed that exact stop-board time",
        "trips": trips,
    }
    OUTPUT.write_text(json.dumps(bundle, indent=2, ensure_ascii=False), encoding="utf-8")

    total = sum(len(v.get(s, [])) for v in trips.values() for s in ("weekday", "weekend"))
    print(f"{len(trips)} directions timetabled, {total} trips built")
    for key, record in sorted(trips.items()):
        wd, we = len(record.get("weekday", [])), len(record.get("weekend", []))
        first = clock(min(t["start"] for t in record["weekday"])) if record.get("weekday") else "-"
        last = clock(max(t["start"] for t in record["weekday"])) if record.get("weekday") else "-"
        print(f"  {key:<12} {wd:>3} weekday {we:>3} weekend   first {first} last {last}"
              f"   exact calls: {sum(sum(t['published']) for t in record['weekday'] + record['weekend'])}")

    if reports:
        print(f"\nunmatched official columns ({len(reports)}):")
        for item in reports[:12]:
            print(f"  {item['route']:<12} {item.get('service', '-'):8} "
                  f"{item.get('stop', '-')}: {item['reason']}")
    if skipped:
        print("\nno trips built for:", *skipped, sep="\n  ")
    return 0


if __name__ == "__main__":
    sys.exit(main())
