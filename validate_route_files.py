#!/usr/bin/env python3
"""Structural checks for the hand-maintained line-*/[direction].json files."""
import json, sys
from pathlib import Path

def check_data(d):
    errs = []
    stops = d.get("stops", [])
    for i, s in enumerate(stops):
        if s.get("stop_sequence") != i + 1:
            errs.append(f"stop {i}: sequence {s.get('stop_sequence')} != {i+1}")
        for lang in ("ro", "hu"):
            if not s.get("name", {}).get(lang):
                errs.append(f"stop {i}: empty name.{lang}")
        lat, lon = s.get("stop_lat"), s.get("stop_lon")
        if not (45.7 <= (lat or 0) <= 45.95):
            errs.append(f"stop {i}: lat {lat} out of area")
        if not (25.6 <= (lon or 0) <= 25.9):
            errs.append(f"stop {i}: lon {lon} out of area")
        dist = s.get("distance_to_next_m")
        last = i == len(stops) - 1
        if last and dist is not None:
            errs.append(f"stop {i}: last stop must have distance_to_next_m null")
        if not last and not (isinstance(dist, int) and dist > 0):
            errs.append(f"stop {i}: distance_to_next_m must be positive int")
    if stops:
        first_c = (stops[0]["stop_lat"], stops[0]["stop_lon"])
        last_c = (stops[-1]["stop_lat"], stops[-1]["stop_lon"])
        same = first_c == last_c
        if bool(d.get("circular")) != same:
            errs.append(f"circular={d.get('circular')} but first==last is {same}")
    return errs

def check(path):
    return check_data(json.loads(Path(path).read_text(encoding="utf-8")))

if __name__ == "__main__":
    bad = 0
    for p in sorted(Path(".").glob("line-*/depart.json")) + sorted(Path(".").glob("line-*/return.json")):
        errs = check(p)
        if errs:
            bad += 1
            print(f"{p}:")
            for e in errs:
                print(f"  {e}")
    print(f"{bad} files with problems")
    sys.exit(1 if bad else 0)
