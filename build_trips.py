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
from trip_reconstruction import reconstruct_direction
from timetable_overrides import apply_timetable_overrides

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
    for i, seconds in enumerate(legs):
        out.append(out[-1] + seconds + (DWELL_SECONDS if i else 0))
    return out


def main():
    timetable = json.loads((ROOT / "timetable.json").read_text(encoding="utf-8"))
    timepoints = apply_timetable_overrides(timetable["timepoints"])
    trips, reports, skipped = {}, [], []
    for direction in load_directions():
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
