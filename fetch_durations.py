#!/usr/bin/env python3
"""Ask the Mapbox Directions API how long the drive between consecutive stops
actually takes, instead of assuming a flat average speed.

Mapbox has no public-transit profile, so this uses the `driving` profile: real
road geometry, speed limits and turn costs along the route the bus follows.
That covers the running time. It says nothing about waiting for the bus, which
needs a timetable the source pages do not publish.

Output  line-<L>/<direction>-durations.json

The API takes at most 25 coordinates per request, so long routes are split into
chunks that overlap by one stop, keeping every consecutive pair inside some
request.
"""

import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
API = "https://api.mapbox.com/directions/v5/mapbox/driving/"
MAX_COORDS = 25

sys.path.insert(0, str(ROOT))
from build_map import MAPBOX_TOKEN  # noqa: E402  single source for the token


def chunks(points):
    """Split into runs of <=25 that overlap by one, so no pair is lost."""
    out, start = [], 0
    while start < len(points) - 1:
        end = min(start + MAX_COORDS, len(points))
        out.append((start, points[start:end]))
        if end == len(points):
            break
        start = end - 1
    return out


def directions(coords):
    path = ";".join(f"{lon:.6f},{lat:.6f}" for lat, lon in coords)
    query = urllib.parse.urlencode(
        {
            "access_token": MAPBOX_TOKEN,
            "overview": "false",
            "steps": "false",
            # Without this the API forbids turning round at a waypoint and
            # routes a detour instead. Buses do turn round: at the Szotyor
            # stub it invented a 934 m loop for a 229 m reversal, and nine
            # legs across the network were inflated by 26 minutes in total.
            "continue_straight": "false",
        }
    )
    req = urllib.request.Request(
        API + urllib.parse.quote(path) + "?" + query,
        headers={"User-Agent": "MultiTrans-GTFS/1.0"},
    )
    with urllib.request.urlopen(req, timeout=40) as resp:
        return json.loads(resp.read().decode("utf-8"))


def build(merged_path):
    data = json.loads(merged_path.read_text(encoding="utf-8"))
    stops = [(s["stop_lat"], s["stop_lon"]) for s in data["stops"]]

    legs = [None] * (len(stops) - 1)
    for offset, piece in chunks(stops):
        payload = directions(piece)
        if payload.get("code") != "Ok":
            raise RuntimeError(payload.get("message", payload.get("code", "unknown")))
        for i, leg in enumerate(payload["routes"][0]["legs"]):
            legs[offset + i] = {
                "seconds": round(leg["duration"]),
                "metres": round(leg["distance"]),
            }
        time.sleep(0.15)  # stay well inside the rate limit

    if any(l is None for l in legs):
        raise RuntimeError("some legs came back empty")

    out = {
        "shape_id": f"{data['line']}-{data['direction']}",
        "line": data["line"],
        "direction": data["direction"],
        "profile": "mapbox/driving",
        "note": "running time only; contains no waiting or timetable information",
        "total_seconds": sum(l["seconds"] for l in legs),
        "legs": legs,
    }
    path = merged_path.parent / f"{data['direction']}-durations.json"
    path.write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")
    return data, out


def main():
    targets = sorted(
        p for p in ROOT.glob("line-*/*.json") if p.stem in ("depart", "return")
    )
    failures = []
    for path in targets:
        try:
            data, out = build(path)
        except (urllib.error.HTTPError, urllib.error.URLError, RuntimeError) as exc:
            failures.append(f"{path.parent.name}/{path.stem}: {exc}")
            continue
        # what the flat-speed guess would have said, for comparison
        assumed = sum(s["distance_to_next_m"] or 0 for s in data["stops"]) / 400
        print(
            f"  line {data['line']:<3} {data['direction']:<7} "
            f"{out['total_seconds'] / 60:>5.1f} min driving "
            f"(fix becsles: {assumed:>4.1f})"
        )
    if failures:
        print("\nFAILED:", *failures, sep="\n  ")
        return 1
    print(f"\n{len(targets)} directions timed against the road network.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
