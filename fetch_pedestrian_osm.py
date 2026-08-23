#!/usr/bin/env python3
"""Fetch the OSM pedestrian network used by the offline browser router.

This is a maintainer-only build step.  The resulting extract is compiled to
``web/public/data/walking-graph.json`` and shipped with the application; the
phone never calls Overpass while planning a trip.
"""

from __future__ import annotations

import csv
import json
import math
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

from build_walking_graph import WALKABLE_HIGHWAYS

ROOT = Path(__file__).resolve().parent
GTFS = ROOT / "gtfs"
OUT = ROOT / "osm" / "pedestrian.json"
API = "https://overpass-api.de/api/interpreter"
MARGIN_METRES = 1_500


def bounds_for_stops(stops: list[tuple[float, float]]) -> tuple[float, float, float, float]:
    """Return south, west, north, east with a 1.5 km network safety margin."""
    if not stops:
        raise ValueError("cannot create walking bounds without any stops")
    lons, lats = zip(*stops)
    latitude_margin = MARGIN_METRES / 111_320
    longitude_margin = MARGIN_METRES / (111_320 * math.cos(math.radians(sum(lats) / len(lats))))
    return (
        min(lats) - latitude_margin,
        min(lons) - longitude_margin,
        max(lats) + latitude_margin,
        max(lons) + longitude_margin,
    )


def query_for_bounds(bounds: tuple[float, float, float, float]) -> str:
    """Ask Overpass for only walkable candidate ways and every referenced node."""
    south, west, north, east = bounds
    bbox = f"{south:.6f},{west:.6f},{north:.6f},{east:.6f}"
    kinds = "|".join(sorted(WALKABLE_HIGHWAYS))
    return (
        "[out:json][timeout:360];"
        f'way["highway"~"^({kinds})$"]({bbox});'
        "out body;>;out skel qt;"
    )


def read_stops() -> list[tuple[float, float]]:
    with (GTFS / "stops.txt").open(encoding="utf-8", newline="") as fh:
        rows = csv.DictReader(fh)
        return [
            (float(row["stop_lon"]), float(row["stop_lat"]))
            for row in rows if row.get("location_type") != "1"
        ]


def run(query: str) -> dict:
    request = urllib.request.Request(
        API,
        data=urllib.parse.urlencode({"data": query}).encode(),
        headers={"User-Agent": "MultiTrans-GTFS/1.0 (offline pedestrian graph build)"},
    )
    with urllib.request.urlopen(request, timeout=420) as response:
        return json.loads(response.read().decode())


def main() -> int:
    bounds = bounds_for_stops(read_stops())
    query = query_for_bounds(bounds)
    OUT.parent.mkdir(exist_ok=True)
    for attempt in range(3):
        try:
            data = run(query)
            break
        except Exception as error:  # noqa: BLE001 - Overpass reports varied transient failures
            if attempt == 2:
                print(f"pedestrian extract failed: {error}", file=sys.stderr)
                return 1
            print("Overpass busy; retrying in 20 seconds …", flush=True)
            time.sleep(20)
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(data['elements'])} OSM elements -> {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
