#!/usr/bin/env python3
"""Data-quality checks over the scraped network.

Written after a rider reported on the operator's Facebook page that line 6
lists Institutul de Proiectări twice in a row, which Multi-Trans confirmed as
an error. The point of this file is that the next fault of that kind gets
caught here rather than by a passenger.

The strongest signal is the last check: the network establishes, across many
lines, which pairs of coordinates are the two kerbs of one road. A route that
serves both kerbs back to back is describing something no bus does.
"""

import json
import math
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def metres(a, b):
    lat = math.radians((a[0] + b[0]) / 2)
    return math.hypot((b[1] - a[1]) * 111320 * math.cos(lat), (b[0] - a[0]) * 111320)


def load():
    out = []
    for path in sorted(ROOT.glob("line-*/*.json")):
        if path.stem in ("depart", "return"):
            out.append(json.loads(path.read_text(encoding="utf-8")))
    return out


def coord(stop):
    return (stop["stop_lat"], stop["stop_lon"])


def opposite_kerb_pairs(routes):
    """Coordinate pairs that other routes treat as the two sides of one road.

    The evidence has to be one line using coordinate A outbound and coordinate
    B on its way back. That is what an across-the-street pair looks like, and
    it is much stronger than merely finding both directions somewhere in the
    network: at Fabrica de Țigarete two coordinates 64 m apart are each served
    by different lines, which says nothing about them facing each other.
    """
    by_name = defaultdict(lambda: defaultdict(set))
    for route in routes:
        for stop in route["stops"]:
            by_name[stop["name"]["ro"]][coord(stop)].add(
                (route["line"], route["direction"])
            )

    pairs = set()
    for places in by_name.values():
        spots = list(places)
        for i, a in enumerate(spots):
            for b in spots[i + 1:]:
                if metres(a, b) > 120:
                    continue
                out_a = {ln for ln, d in places[a] if d == "depart"}
                back_a = {ln for ln, d in places[a] if d == "return"}
                out_b = {ln for ln, d in places[b] if d == "depart"}
                back_b = {ln for ln, d in places[b] if d == "return"}
                if (out_a & back_b) or (out_b & back_a):
                    pairs.add(frozenset((a, b)))
    return pairs


def one_sided_stops(directions):
    """Stops the operator publishes once although the bus passes both ways.

    Two calls pointing 120 degrees or more apart are the two sides of a road.
    build_gtfs derives the missing kerb for these; this reports them so a fix
    at the source can be noticed, and so a new one cannot appear unseen.
    """
    from build_map import OPPOSITE_DEGREES, travel_bearings, _spread

    bearings = travel_bearings(directions)
    coords, calls, terminus = {}, {}, set()
    for d in directions:
        for i in (0, len(d["stops"]) - 1):
            terminus.add(d["stops"][i]["name"]["ro"])
        for i, stop in enumerate(d["stops"]):
            name = stop["name"]["ro"]
            coords.setdefault(name, set()).add((stop["stop_lat"], stop["stop_lon"]))
            key = (d["line"], d["direction"], i)
            if key in bearings:
                calls.setdefault(name, []).append(bearings[key])

    found = []
    for name, seen in coords.items():
        angles = calls.get(name, [])
        if len(seen) > 1 or len(angles) < 2 or name in terminus:
            continue
        widest = max(_spread(a, b) for i, a in enumerate(angles) for b in angles[i + 1:])
        if widest >= OPPOSITE_DEGREES:
            found.append((name, round(widest)))
    return sorted(found)


def main():
    routes = load()
    pairs = opposite_kerb_pairs(routes)
    problems, notes = [], []

    for route in routes:
        stops = route["stops"]
        tag = f"line {route['line']} {route['direction']}"

        for i in range(len(stops) - 1):
            here, nxt = stops[i], stops[i + 1]
            gap = metres(coord(here), coord(nxt))
            same_name = here["name"]["ro"] == nxt["name"]["ro"]
            closing = i + 1 == len(stops) - 1 and route["circular"]

            if same_name and not closing:
                claimed = here["distance_to_next_m"]
                verdict = (
                    "both kerbs of one road served back to back - not possible"
                    if frozenset((coord(here), coord(nxt))) in pairs
                    else "same name twice in a row; may be two real stops"
                )
                line = (
                    f"{tag}: seq {here['stop_sequence']}->{nxt['stop_sequence']} "
                    f"{here['name']['hu']!r} {gap:.0f} m apart "
                    f"(source says {claimed} m) - {verdict}"
                )
                (problems if "not possible" in verdict else notes).append(line)

            elif coord(here) == coord(nxt):
                problems.append(
                    f"{tag}: seq {here['stop_sequence']}->{nxt['stop_sequence']} "
                    f"identical coordinates for {here['name']['hu']!r} and "
                    f"{nxt['name']['hu']!r}"
                )

    print(f"{len(routes)} directions, {sum(len(r['stops']) for r in routes)} stop records")
    print(f"{len(pairs)} coordinate pairs identified as two kerbs of one road\n")

    if problems:
        print("PROBLEMS", *problems, sep="\n  ")
    else:
        print("PROBLEMS: none")
    if notes:
        print("\nWORTH A LOOK", *notes, sep="\n  ")
    one_sided = one_sided_stops(routes)
    if one_sided:
        print(f"\n{len(one_sided)} stops the source lists once although the bus "
              "passes both ways (build_gtfs derives the second kerb):")
        for name, spread in one_sided:
            print(f"  {name:26} {spread}° apart")

    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
