#!/usr/bin/env python3
"""Turn published departure times into complete trips.

The operator prints times at 36 stops; the network has 66. This fills in the
rest by hanging every stop of a route off one anchor stop whose times are
published, using the measured road times between stops.

  time at stop i  =  trip start  +  offset[i]
  offset[i]       =  driving seconds to stop i  +  25 s at each stop on the way

That makes each trip a single number - when it leaves the first stop - which is
what both the map and, later, stop_times.txt need.

Output  trips.json

Every other published timing point is then compared against what the model
predicts, and the residuals are reported. They are the honest measure of how
much the interpolated times can be trusted.
"""

import json
import statistics
import sys
from collections import defaultdict
from pathlib import Path

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
         f"{direction['direction']}-durations.json").read_text(encoding="utf-8")
    )["legs"]
    out = [0]
    for i, leg in enumerate(legs):
        out.append(out[-1] + leg["seconds"] + (DWELL_SECONDS if i else 0))
    return out


def main():
    timetable = json.loads((ROOT / "timetable.json").read_text(encoding="utf-8"))
    points = defaultdict(list)
    for entry in timetable["timepoints"]:
        points[(entry["line"], entry["direction"])].append(entry)

    trips, residuals, skipped = {}, [], []
    for line in ORDER:
        for name in ("depart", "return"):
            path = ROOT / f"line-{line}" / f"{name}.json"
            if not path.exists():
                continue
            direction = json.loads(path.read_text(encoding="utf-8"))
            key = f"{line}-{name}"
            entries = points.get((line, name), [])
            if not entries:
                skipped.append(f"{key}: no published times")
                continue

            offsets = offsets_for(direction)
            where = defaultdict(list)
            for i, stop in enumerate(direction["stops"]):
                where[stop["name"]["ro"]].append(i)

            usable = [e for e in entries if e["stop_ro"] in where]
            if not usable:
                skipped.append(f"{key}: timing points name stops not on the route")
                continue

            # anchor on a stop the route visits exactly once, as early as
            # possible; on a loop an ambiguous stop cannot date a trip
            unique = [e for e in usable if len(where[e["stop_ro"]]) == 1]
            anchor = min(unique or usable, key=lambda e: where[e["stop_ro"]][0])
            anchor_at = where[anchor["stop_ro"]][0]

            record = {"line": line, "direction": name,
                      "anchor_stop": anchor["stop_hu"],
                      "anchor_index": anchor_at,
                      "offsets": offsets}
            for service, times in anchor["times"].items():
                starts = sorted(minutes(t) - round(offsets[anchor_at] / 60)
                                for t in times)
                record[service] = starts
            trips[key] = record

            # how well do the other published stops land?
            for entry in usable:
                if entry is anchor:
                    continue
                for service, times in entry.get("times", {}).items():
                    starts = record.get(service)
                    if not starts:
                        continue
                    # a loop can pass the same stop twice and the printed time
                    # belongs to one of those passes; score every candidate and
                    # keep the pass it actually fits
                    best = None
                    for index in where[entry["stop_ro"]]:
                        predicted = sorted(
                            s + round(offsets[index] / 60) for s in starts
                        )
                        gaps = [
                            min(abs(actual - p) for p in predicted)
                            for actual in (minutes(t) for t in times)
                        ]
                        score = statistics.median(gaps)
                        if best is None or score < best:
                            best = score
                    residuals.append((best, key, entry["stop_hu"], service))

    bundle = {
        "source": timetable["source"],
        "valid_from": timetable["valid_from"],
        "dwell_seconds": DWELL_SECONDS,
        "note": "trip start = departure from the first stop, minutes after midnight; "
                "time at stop i = start + offsets[i] seconds",
        "trips": trips,
    }
    OUTPUT.write_text(json.dumps(bundle, indent=2, ensure_ascii=False), encoding="utf-8")

    total = sum(len(v.get(s, [])) for v in trips.values() for s in ("weekday", "weekend"))
    print(f"{len(trips)} directions timetabled, {total} trips built")
    for key, record in sorted(trips.items()):
        wd, we = len(record.get("weekday", [])), len(record.get("weekend", []))
        first = clock(min(record["weekday"])) if record.get("weekday") else "-"
        last = clock(max(record["weekday"])) if record.get("weekday") else "-"
        print(f"  {key:<12} {wd:>3} weekday {we:>3} weekend   first {first} last {last}"
              f"   anchor: {record['anchor_stop']}")

    if residuals:
        residuals.sort(reverse=True)
        print(f"\npredicted vs published at the other timing points "
              f"({len(residuals)} comparisons):")
        for gap, key, stop, service in residuals[:8]:
            print(f"  {gap:>5.1f} min  {key:<12} {stop} ({service})")
        print(f"  median residual {statistics.median(r[0] for r in residuals):.1f} min")
    if skipped:
        print("\nno trips built for:", *skipped, sep="\n  ")
    return 0


if __name__ == "__main__":
    sys.exit(main())
