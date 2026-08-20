#!/usr/bin/env python3
"""Extract the drawn route geometry from each line page into shape files.

Every line page carries a `routeLine` JavaScript variable holding the polyline
Leaflet draws on the map - the real path along the streets, not just the stop
positions. That is exactly what GTFS shapes.txt needs, so a consumer like
Google Maps traces the actual roads instead of connecting stops with straight
lines.

Output  line-<L>/<direction>-shape.json

Each shape is validated by measuring how far every stop of that line+direction
sits from the nearest point of the polyline; a stop far from its own route
would mean the geometry and the stop list disagree.
"""

import json
import math
import re
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BASE = "https://multitrans.ro"
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) MultiTrans-GTFS/1.0"
SLUG = {"1D": "1d", "2D": "2d", "5D": "5d"}
INFIX = {"depart": "", "return": "-retur"}

RE_ROUTELINE = re.compile(r"var\s+routeLine\s*=\s*(\[\s*\[.*?\]\s*\])\s*;", re.S)
# a stop sitting further than this from its own route geometry is suspicious
STOP_TOLERANCE_M = 60


def metres(a, b):
    """Approximate distance between two (lat, lon) pairs."""
    lat = math.radians((a[0] + b[0]) / 2)
    return math.hypot((b[1] - a[1]) * 111320 * math.cos(lat), (b[0] - a[0]) * 111320)


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8")


def polyline_length(points):
    return sum(metres(points[i], points[i + 1]) for i in range(len(points) - 1))


def rotate_to_first_stop(points, first_stop):
    """Start a closed loop at its first stop.

    On circular lines the drawn polyline is a ring whose starting vertex has
    nothing to do with the timetable - line 2's begins 533 m from stop 1. GTFS
    consumers expect the shape to run from the trip's first stop onward, so the
    ring is rotated to begin at the vertex nearest that stop and re-closed.
    """
    # drop the final vertex only when it genuinely repeats the first one; lines
    # 3, 4 and 5 leave a 57-77 m gap there, and discarding it would lose path
    ring = points[:-1] if metres(points[0], points[-1]) < 10 else list(points)
    start = min(range(len(ring)), key=lambda i: metres(ring[i], first_stop))
    return ring[start:] + ring[:start] + [ring[start]]


def worst_stop_offset(stops, points):
    """Largest distance from any stop to the nearest vertex of the polyline."""
    worst = (0.0, None)
    for stop in stops:
        here = (stop["stop_lat"], stop["stop_lon"])
        nearest = min(metres(here, p) for p in points)
        if nearest > worst[0]:
            worst = (nearest, stop["name"]["ro"])
    return worst


def build(merged_path):
    data = json.loads(merged_path.read_text(encoding="utf-8"))
    line, direction = data["line"], data["direction"]
    slug = SLUG.get(line, line.lower())
    url = f"{BASE}/jarat-{slug}{INFIX[direction]}.html"

    match = RE_ROUTELINE.search(fetch(url))
    if not match:
        return (line, direction, None, f"no routeLine variable on {url}")
    points = json.loads(match.group(1))
    if not points or not all(len(p) == 2 for p in points):
        return (line, direction, None, f"malformed routeLine on {url}")

    rotated = False
    if data["circular"]:
        first = (data["stops"][0]["stop_lat"], data["stops"][0]["stop_lon"])
        if metres(points[0], first) > STOP_TOLERANCE_M:
            points = rotate_to_first_stop(points, first)
            rotated = True

    offset, culprit = worst_stop_offset(data["stops"], points)
    shape = {
        "shape_id": f"{line}-{direction}",
        "line": line,
        "direction": direction,
        "source": url,
        "circular": data["circular"],
        "rotated_to_first_stop": rotated,
        "point_count": len(points),
        "length_m": round(polyline_length(points)),
        "points": points,
    }
    out = merged_path.parent / f"{direction}-shape.json"
    out.write_text(json.dumps(shape, ensure_ascii=False), encoding="utf-8")

    warning = None
    if offset > STOP_TOLERANCE_M:
        warning = f"line {line} {direction}: stop {culprit!r} is {offset:.0f} m from the route"
    return (line, direction, shape, warning)


def main():
    targets = sorted(
        p for p in ROOT.glob("line-*/*.json") if p.stem in ("depart", "return")
    )
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(build, targets))

    warnings = []
    total = 0
    for line, direction, shape, warning in results:
        if warning:
            warnings.append(warning)
        if shape is None:
            print(f"  FAILED line {line} {direction}")
            continue
        total += shape["length_m"]
        print(
            f"  line {line:<3} {direction:<7} {shape['point_count']:>4} points  "
            f"{shape['length_m'] / 1000:>5.1f} km"
        )
    ok = sum(1 for r in results if r[2] is not None)
    print(f"\n{ok} shapes written, {total / 1000:.1f} km of route geometry total.")
    if warnings:
        print("WARNINGS:", *warnings, sep="\n  ")
    return 0 if ok == len(results) else 1


if __name__ == "__main__":
    sys.exit(main())
