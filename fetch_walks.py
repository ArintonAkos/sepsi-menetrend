#!/usr/bin/env python3
"""Ask Mapbox for the real walking route between stops you might change at.

Until now a transfer between the two kerbs of one road cost nothing at all:
the two stops were grouped into a single station, so the planner treated
changing from a bus on one side to a bus on the other as instant. It is not.
You have to reach a crossing, wait, cross, and walk back along the pavement.

The walking profile routes over pavements and crossings, so it answers both
questions - how long it really takes, and where you actually cross.

Covers two kinds of pair:
  within a station   the kerbs of one road, 11 to 142 m apart
  between stations   places close enough to walk between mid-journey

Output  walks.json
"""

import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from build_map import (  # noqa: E402
    MAPBOX_TOKEN, WALK_LIMIT_M, build_stations, load_directions, metres,
)

API = "https://api.mapbox.com/directions/v5/mapbox/walking/"
OUTPUT = ROOT / "walks.json"


def key(a, b):
    return f"{a[0]:.5f},{a[1]:.5f}>{b[0]:.5f},{b[1]:.5f}"


def walk(a, b):
    path = f"{a[1]:.6f},{a[0]:.6f};{b[1]:.6f},{b[0]:.6f}"
    query = urllib.parse.urlencode(
        {
            "access_token": MAPBOX_TOKEN,
            "geometries": "geojson",
            "overview": "full",
            "steps": "false",
        }
    )
    req = urllib.request.Request(
        API + path + "?" + query, headers={"User-Agent": "MultiTrans-GTFS/1.0"}
    )
    with urllib.request.urlopen(req, timeout=40) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    if payload.get("code") != "Ok" or not payload.get("routes"):
        raise RuntimeError(payload.get("message", payload.get("code", "no route")))
    route = payload["routes"][0]
    return {
        "metres": round(route["distance"]),
        "seconds": round(route["duration"]),
        "path": [[round(x, 5), round(y, 5)] for x, y in route["geometry"]["coordinates"]],
    }


def main():
    stations = build_stations(load_directions())

    pairs = []
    for station in stations:
        points = station["points"]
        for i, a in enumerate(points):
            for j, b in enumerate(points):
                if i != j:
                    pairs.append((tuple(a), tuple(b), station["name"]["hu"]))

    for i, a in enumerate(stations):
        for b in stations[i + 1:]:
            gap = min(metres(p, q) for p in a["points"] for q in b["points"])
            if gap > WALK_LIMIT_M:
                continue
            label = f"{a['name']['hu']} - {b['name']['hu']}"
            for p in a["points"]:
                for q in b["points"]:
                    pairs.append((tuple(p), tuple(q), label))
                    pairs.append((tuple(q), tuple(p), label))

    walks, failures, detours = {}, [], []
    for a, b, label in pairs:
        k = key(a, b)
        if k in walks:
            continue
        try:
            result = walk(a, b)
        except (urllib.error.HTTPError, urllib.error.URLError, RuntimeError) as exc:
            failures.append(f"{label}: {exc}")
            continue
        straight = metres(a, b)
        result["straight_m"] = round(straight)
        result["label"] = label
        walks[k] = result
        if straight > 5 and result["metres"] / straight > 2.5:
            detours.append((result["metres"] / straight, label, result["metres"], straight))
        time.sleep(0.12)

    OUTPUT.write_text(
        json.dumps({"profile": "mapbox/walking", "walks": walks}, ensure_ascii=False,
                   indent=2),
        encoding="utf-8",
    )

    print(f"{len(walks)} walking routes fetched")
    if walks:
        worst = max(walks.values(), key=lambda w: w["seconds"])
        print(f"longest: {worst['label']} - {worst['metres']} m, "
              f"{worst['seconds'] / 60:.1f} min")
    if detours:
        detours.sort(reverse=True)
        print("\nwhere the pavement is much longer than the crossing looks "
              "(the detour to a crossing):")
        for ratio, label, walked, straight in detours[:10]:
            print(f"  {label:<40} {straight:>4.0f} m apart -> {walked:>4} m on foot "
                  f"({ratio:.1f}x)")
    if failures:
        print("\nFAILED:", *failures, sep="\n  ")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
