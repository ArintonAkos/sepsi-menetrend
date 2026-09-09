#!/usr/bin/env python3
"""Route a reconstructed line-direction through its stops with OSRM.

For a `<line> <direction>` this writes the two files
`build_map.load_directions()` needs beside the hand-maintained route file:

  line-<L>/<dir>-shape.json      full-precision road geometry, [lat, lon]
  line-<L>/<dir>-durations.json  per-leg free-flow driving time and distance

and copies the OSRM leg distances back into `line-<L>/<dir>.json` as each
stop's `distance_to_next_m` (last stop `null`).

Line 5 depart is the exception. Its physical loop did not change on 7 September
- only the timetable anchor rotated to `Str. Dózsa György` - and the operator's
own drawn polyline is better than OSRM there (the README notes OSRM sends line 5
down streets the bus does not use). Its shape is therefore rotated in place, not
re-routed; only its durations and stop distances are re-derived through OSRM.

Routing reuses the shape of `fetch_shapes_osrm.route()`: a single
`/route/v1/driving/...?geometries=geojson&overview=full&continue_straight=false`
call, a 180 s timeout, HTTPError bodies read back as JSON, and a 1.5 s pause
between calls to the shared public server. A route that does not come back
`"Ok"` is retried once after 5 s; a second failure stops the run.

Usage:
  python3 shape_from_stops.py                 # the full Sept 7 changed set
  python3 shape_from_stops.py <line> <dir>    # one line-direction
  python3 shape_from_stops.py 5 depart        # the line 5 rotate-and-time path
"""

import json
import math
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SERVER = "https://router.project-osrm.org"
PAUSE = 1.5                     # a shared public server; do not hammer it
RETRY_PAUSE = 5.0              # one retry after a non-Ok reply, then give up

SHAPE_SOURCE = ("OSRM (router.project-osrm.org), OpenStreetMap data ODbL "
                "— reconstructed for the 2026-09-07 network")
DURATION_NOTE = ("running time only; contains no waiting or timetable "
                 "information; OSRM free-flow")

# The line-directions whose geometry the 7 September rebuild moved. Line 5
# depart is handled by rotate_line5() instead - see the module docstring.
CHANGED = [
    ("2", "depart"), ("2", "return"),
    ("6", "depart"), ("6", "return"),
    ("1B", "depart"), ("1B", "return"),
    ("10", "depart"), ("10", "return"),
    ("1D", "return"), ("2D", "return"),
]

# The rotated line 5 anchor: the drawn ring is turned to begin at the vertex
# nearest this point (Str. Dózsa György).
LINE5_ANCHOR = (45.8568, 25.7733)

# A stop sitting further than this from its own routed geometry is worth a look.
STOP_TOLERANCE_M = 60


def metres(a, b):
    """Approximate distance between two (lat, lon) pairs."""
    lat = math.radians((a[0] + b[0]) / 2)
    return math.hypot((b[1] - a[1]) * 111320 * math.cos(lat),
                      (b[0] - a[0]) * 111320)


def route(points):
    """OSRM driving route through (lon, lat) points; returns the parsed reply."""
    coords = ";".join(f"{lon:.6f},{lat:.6f}" for lon, lat in points)
    url = (f"{SERVER}/route/v1/driving/{coords}"
           "?geometries=geojson&overview=full&continue_straight=false")
    request = urllib.request.Request(
        url, headers={"User-Agent": "MultiTrans-GTFS/1.0"})
    try:
        with urllib.request.urlopen(request, timeout=180) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as error:
        return json.loads(error.read())


def routed(stops, label):
    """route() through the stops, with one retry, then stop the run loudly."""
    points = [(s["stop_lon"], s["stop_lat"]) for s in stops]
    answer = route(points)
    if answer.get("code") != "Ok":
        print(f"  {label}: OSRM returned {answer.get('code')} "
              f"{str(answer.get('message', ''))[:80]!r}; "
              f"retrying once in {RETRY_PAUSE:.0f}s")
        time.sleep(RETRY_PAUSE)
        answer = route(points)
    if answer.get("code") != "Ok":
        raise SystemExit(
            f"BLOCKED: OSRM route failed for {label}: "
            f"{answer.get('code')} {answer.get('message', '')}".rstrip())
    best = answer["routes"][0]
    if len(best["legs"]) != len(stops) - 1:
        raise SystemExit(
            f"BLOCKED: {label}: OSRM returned {len(best['legs'])} legs for "
            f"{len(stops)} stops")
    return best


def worst_stop_offset(points, stops):
    """Largest distance from any stop to the nearest vertex of the geometry."""
    worst, culprit = 0.0, None
    for stop in stops:
        here = (stop["stop_lat"], stop["stop_lon"])
        near = min(metres(here, p) for p in points)
        if near > worst:
            worst, culprit = near, stop["name"]["ro"]
    return worst, culprit


def dump_shape(path, obj):
    path.write_text(json.dumps(obj, ensure_ascii=False), encoding="utf-8")


def dump_durations(path, obj):
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False),
                    encoding="utf-8")


def dump_route_file(path, obj):
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False) + "\n",
                    encoding="utf-8")


def build_shape(line, direction, circular, best):
    points = [[round(lat, 6), round(lon, 6)]
              for lon, lat in best["geometry"]["coordinates"]]
    return {
        "shape_id": f"{line}-{direction}",
        "line": line,
        "direction": direction,
        "source": SHAPE_SOURCE,
        "circular": bool(circular),
        "point_count": len(points),
        "length_m": round(best["distance"]),
        "points": points,
    }


def build_durations(line, direction, best):
    legs = [{"seconds": round(leg["duration"]), "metres": round(leg["distance"])}
            for leg in best["legs"]]
    return {
        "shape_id": f"{line}-{direction}",
        "line": line,
        "direction": direction,
        "profile": "osrm/driving",
        "note": DURATION_NOTE,
        "total_seconds": round(best["duration"]),
        "legs": legs,
    }


def apply_leg_distances(data, best):
    """Set each stop's distance_to_next_m to its OSRM leg metres, last one null."""
    stops = data["stops"]
    for stop, leg in zip(stops, best["legs"]):
        stop["distance_to_next_m"] = round(leg["distance"])
    stops[-1]["distance_to_next_m"] = None


def process(line, direction):
    """OSRM the geometry, durations and stop distances for one line-direction."""
    folder = ROOT / f"line-{line}"
    route_path = folder / f"{direction}.json"
    data = json.loads(route_path.read_text(encoding="utf-8"))
    label = f"line-{line} {direction}"
    before = [s["distance_to_next_m"] for s in data["stops"]]

    best = routed(data["stops"], label)

    shape = build_shape(line, direction, data.get("circular"), best)
    durations = build_durations(line, direction, best)
    apply_leg_distances(data, best)

    dump_shape(folder / f"{direction}-shape.json", shape)
    dump_durations(folder / f"{direction}-durations.json", durations)
    dump_route_file(route_path, data)

    offset, culprit = worst_stop_offset(shape["points"], data["stops"])
    after = [s["distance_to_next_m"] for s in data["stops"]]
    flag = f"  <-- CHECK {culprit!r}" if offset > STOP_TOLERANCE_M else ""
    print(f"  {label:<15} {shape['point_count']:5d} pts  "
          f"{shape['length_m'] / 1000:6.2f} km  "
          f"{durations['total_seconds'] / 60:5.1f} min  "
          f"stop offset {offset:4.0f} m{flag}")
    print(f"      distance_to_next_m  {before}")
    print(f"                      ->  {after}")
    time.sleep(PAUSE)


def rotate_line5():
    """Rotate line 5's drawn ring to start at Str. Dózsa György; re-time via OSRM.

    The polyline is the operator's own and is not re-routed. It is turned so its
    first vertex is the one nearest the new anchor, then re-closed; length_m is
    left untouched because the ring itself is unchanged.
    """
    folder = ROOT / "line-5"
    shape_path = folder / "depart-shape.json"
    route_path = folder / "depart.json"

    shape = json.loads(shape_path.read_text(encoding="utf-8"))
    points = shape["points"]                       # [lat, lon], a closed ring
    k = min(range(len(points)), key=lambda i: metres(points[i], LINE5_ANCHOR))
    gap = metres(points[k], LINE5_ANCHOR)
    rotated = list(points[k:]) + list(points[:k])
    rotated.append(list(points[k]))               # re-close the loop
    shape["points"] = rotated
    shape["point_count"] = len(rotated)
    shape["rotated_to_first_stop"] = True
    shape["source"] = (
        "https://multitrans.ro/jarat-5.html — operator-drawn polyline, "
        "rotated to begin at the vertex nearest Str. Dózsa György for "
        "the 2026-09-07 network")

    data = json.loads(route_path.read_text(encoding="utf-8"))
    before = [s["distance_to_next_m"] for s in data["stops"]]
    best = routed(data["stops"], "line-5 depart (durations only)")
    durations = build_durations("5", "depart", best)
    apply_leg_distances(data, best)

    dump_shape(shape_path, shape)
    dump_durations(folder / "depart-durations.json", durations)
    dump_route_file(route_path, data)

    after = [s["distance_to_next_m"] for s in data["stops"]]
    print(f"  line-5 depart   rotated ring to vertex k={k} of {len(points)} "
          f"({gap:.0f} m from the anchor); {len(rotated)} pts, "
          f"length_m {shape['length_m']} kept")
    print(f"      durations via OSRM: {durations['total_seconds'] / 60:.1f} min, "
          f"{len(best['legs'])} legs")
    print(f"      distance_to_next_m  {before}")
    print(f"                      ->  {after}")
    time.sleep(PAUSE)


def main(argv):
    if len(argv) == 2:
        line, direction = argv
        if (line, direction) == ("5", "depart"):
            rotate_line5()
        else:
            process(line, direction)
        return 0
    if argv:
        print(__doc__)
        return 2

    print(f"OSRM {SERVER}")
    for line, direction in CHANGED:
        process(line, direction)
    rotate_line5()
    print("\ndone")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
