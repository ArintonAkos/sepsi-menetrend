#!/usr/bin/env python3
"""Refresh the OpenStreetMap extracts the place search is built from.

Everything the planner can search sits inside a 12 km box around Sfântu
Gheorghe, so the whole searchable world fits in a file that ships with the
page. Rerun this when the town changes, not on every build - Overpass is a
shared, frequently busy service.

Writes osm/{poi,places,streets}.json
"""

import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
API = "https://overpass-api.de/api/interpreter"
BOX = "45.79,25.66,45.93,25.88"          # Overpass wants south,west,north,east

QUERIES = {
    "poi": "".join(
        f'nwr["name"]["{tag}"]({BOX});'
        for tag in ("amenity", "shop", "tourism", "leisure", "office", "healthcare")
    ),
    "places": "".join(
        f'nwr["name"]["{tag}"]({BOX});' for tag in ("building", "landuse", "place")
    ),
    "streets": f'way["highway"]["name"]({BOX});',
}


def run(body):
    request = urllib.request.Request(
        API,
        data=urllib.parse.urlencode({"data": body}).encode(),
        headers={"User-Agent": "MultiTrans-GTFS/1.0 (transit planner build)"},
    )
    with urllib.request.urlopen(request, timeout=240) as response:
        return json.loads(response.read().decode())


def main():
    (ROOT / "osm").mkdir(exist_ok=True)
    for name, clause in QUERIES.items():
        body = f"[out:json][timeout:200];({clause});out tags center;"
        print(f"{name} …", end=" ", flush=True)
        for attempt in range(3):
            try:
                data = run(body)
                break
            except Exception as error:                      # Overpass is often busy
                if attempt == 2:
                    print(f"failed: {error}")
                    return 1
                print("busy, retrying …", end=" ", flush=True)
                time.sleep(20)
        path = ROOT / "osm" / f"{name}.json"
        path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")),
                        encoding="utf-8")
        print(f"{len(data['elements'])} elements, {path.stat().st_size / 1024:.0f} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
