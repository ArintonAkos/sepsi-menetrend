#!/usr/bin/env python3
"""Re-derive the route geometry by routing through the stops with OSRM.

The polylines published on multitrans.ro are rounded to four decimal places -
a grid of roughly 8 by 11 metres at this latitude. Zoomed in, the lines
staircase and sit beside the road rather than on it, and where a route doubles
back the two passes separate into a visible lens. Nineteen percent of the
points are exact duplicates of the one before.

Routing through the same stops with OSRM returns the same streets at full
precision: on line 3 the two agree to a median of 3.8 m, which is inside the
published data's own rounding error.

OSRM runs on OpenStreetMap, so unlike the Mapbox Directions results we cannot
store, this output is ours to ship - with attribution.

Writes osrm/shapes.json
"""

import csv
import json
import math
import sys
import time
import urllib.error
import urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent
GTFS = ROOT / "gtfs"
OUT = ROOT / "osrm"
SERVER = "https://router.project-osrm.org"
PAUSE = 1.5                      # a shared public server; do not hammer it
LAT0 = 45.865
K = math.cos(math.radians(LAT0))


def read(name):
    with (GTFS / name).open(encoding="utf-8", newline="") as fh:
        return list(csv.DictReader(fh))


def metres(a, b):
    return math.hypot((a[0] - b[0]) * K * 111320, (a[1] - b[1]) * 111320)


def route(points):
    coords = ";".join(f"{lon:.6f},{lat:.6f}" for lon, lat in points)
    url = (f"{SERVER}/route/v1/driving/{coords}"
           "?geometries=geojson&overview=full&continue_straight=false")
    request = urllib.request.Request(url, headers={"User-Agent": "MultiTrans-GTFS/1.0"})
    try:
        with urllib.request.urlopen(request, timeout=180) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as error:
        return json.loads(error.read())
    except Exception as error:                       # noqa: BLE001 - report and move on
        return {"code": "error", "message": str(error)}


def main():
    OUT.mkdir(exist_ok=True)
    stops = {r["stop_id"]: r for r in read("stops.txt")}
    trips = {t["trip_id"]: t for t in read("trips.txt")}
    times = defaultdict(list)
    for r in read("stop_times.txt"):
        times[r["trip_id"]].append(r)
    for rows in times.values():
        rows.sort(key=lambda r: int(r["stop_sequence"]))

    published = defaultdict(list)
    for r in read("shapes.txt"):
        published[r["shape_id"]].append(
            (int(r["shape_pt_sequence"]), float(r["shape_pt_lon"]), float(r["shape_pt_lat"]))
        )
    for pts in published.values():
        pts.sort()

    # one trip per shape is enough; every trip on a shape calls the same stops
    sample = {}
    for tid, rows in times.items():
        sample.setdefault(trips[tid]["shape_id"], rows)

    result, failures = {}, []
    for shape_id in sorted(sample):
        rows = sample[shape_id]
        points = [(float(stops[r["stop_id"]]["stop_lon"]),
                   float(stops[r["stop_id"]]["stop_lat"])) for r in rows]
        answer = route(points)
        if answer.get("code") != "Ok":
            failures.append(f"{shape_id}: {answer.get('code')} {answer.get('message', '')[:60]}")
            print(f"  {shape_id:<12} FAILED")
            time.sleep(PAUSE)
            continue

        best = answer["routes"][0]
        geometry = [[round(lon, 6), round(lat, 6)] for lon, lat in best["geometry"]["coordinates"]]
        # distance to each stop, so the app can anchor them without guessing
        cumulative, running = [0.0], 0.0
        for leg in best["legs"]:
            running += leg["distance"]
            cumulative.append(round(running, 1))

        old = [(lon, lat) for _, lon, lat in published[shape_id]]
        gaps = sorted(min(metres(p, q) for q in old) for p in geometry[::5])
        drift = gaps[len(gaps) // 2]
        far = gaps[-1]
        result[shape_id] = {
            "coordinates": geometry,
            "stopDistances": cumulative,
            "distance": round(best["distance"], 1),
        }
        flag = "  <-- check" if drift > 12 else ""
        print(f"  {shape_id:<12} {len(geometry):5d} pts  drift {drift:5.1f} m  "
              f"worst {far:5.0f} m  {best['distance']/1000:5.2f} km{flag}")
        time.sleep(PAUSE)

    if failures:
        print("\nfailed:", *failures, sep="\n  ")
        return 1

    path = OUT / "shapes.json"
    path.write_text(json.dumps({"source": "OSRM on OpenStreetMap data, ODbL",
                                "shapes": result}, separators=(",", ":")), encoding="utf-8")
    print(f"\n{len(result)} shapes -> {path} ({path.stat().st_size / 1024:.0f} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
