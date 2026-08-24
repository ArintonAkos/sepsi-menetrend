#!/usr/bin/env python3
"""Assemble the network into a single self-contained interactive page.

Reads the merged line files and the extracted shapes, folds them into one data
bundle, and injects it into map.template.html to produce map.html. The data is
inlined rather than fetched so the page works when opened straight from disk -
a file:// page cannot read sibling JSON files.

Beyond passing the data through, this builds the two structures the page needs
that do not exist in the per-line files:

  stations   stop coordinates grouped by name, so that the pair of stops facing
             each other across a road counts as one place you can change at
  walk links station pairs close enough to walk between, so the journey planner
             can route through interchanges the network spells differently
             (Lábasház and Erzsébet Park are 78 m apart)
"""

import colorsys
import json
import math
import re
import sys
from pathlib import Path

from mapbox_config import load_mapbox_token

ROOT = Path(__file__).resolve().parent
TEMPLATE = ROOT / "map.template.html"
OUTPUT = ROOT / "map.html"
# Read, never written down. A Mapbox pk token is public in the sense that it
# ships to the browser, but it still bills an account - and the one that used to
# sit here belonged to somebody else's. Set MAPBOX_TOKEN in the environment to
# build a map.html that loads tiles; without it the page renders everything
# except the basemap, which is enough to check the routes.
MAPBOX_TOKEN = load_mapbox_token()

# Furthest apart two differently-named stops can be and still count as a place
# you would walk between mid-journey.
WALK_LIMIT_M = 220

ORDER = ["1", "1D", "2", "2D", "3", "4", "5", "5D", "6", "7", "9", "10"]

# Fallback only; the real values come from the operator's own timetable page
# via fetch_timetable.py.
COLORS = {
    "1": "#136f29", "1D": "#136f29", "2": "#db4436", "2D": "#db4436",
    "3": "#00b0f0", "4": "#f4b400", "5": "#7c3592", "5D": "#7c3592",
    "6": "#a9fe00", "7": "#ff3eff", "9": "#b27e62", "10": "#000000",
}


def rgb(colour):
    c = colour.lstrip("#")
    return [int(c[i:i + 2], 16) for i in (0, 2, 4)]


def hexed(parts):
    return "#" + "".join(f"{max(0, min(255, round(v))):02x}" for v in parts)


def mix(colour, towards, amount):
    return hexed(a + (b - a) * amount for a, b in zip(rgb(colour), rgb(towards)))


def luminance(colour):
    """Rough brightness, for the 'too dark / too pale' thresholds below.

    Deliberately not gamma corrected - the thresholds were tuned against these
    numbers. Contrast ratios need `relative_luminance` instead.
    """
    r, g, b = (v / 255 for v in rgb(colour))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def relative_luminance(colour):
    """WCAG relative luminance, the one contrast ratios are defined on."""
    channels = []
    for v in (c / 255 for c in rgb(colour)):
        channels.append(v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4)
    r, g, b = channels
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def official_colours():
    """The operator's colours, untouched - what belongs in route_color."""
    out = dict(COLORS)
    timetable = ROOT / "timetable.json"
    if timetable.exists():
        out.update(json.loads(timetable.read_text(encoding="utf-8")).get("colours", {}))
    return {line: out.get(line, COLORS[line]) for line in ORDER}


def shift(colour, scale, lift=None, saturate=1.0):
    """Move a colour's lightness while keeping its hue and its punch.

    Kept in HLS rather than mixed towards black or white in RGB, because a mix
    drags the saturation along with it and the result stops looking like the
    line it belongs to.
    """
    red, green, blue = (int(colour[i:i + 2], 16) / 255 for i in (1, 3, 5))
    hue, light, sat = colorsys.rgb_to_hls(red, green, blue)
    light = light * scale if scale is not None else light + (1 - light) * lift
    out = colorsys.hls_to_rgb(hue, min(1.0, max(0.0, light)), min(1.0, sat * saturate))
    return "#%02x%02x%02x" % tuple(round(c * 255) for c in out)


def palette():
    """The operator's colours, made usable as map lines.

    Three adjustments, all forced by their choices rather than taste. They give
    a line and its D variant the same colour - 1 and 1D are both #136f29 -
    which on a map means two routes you cannot tell apart, so the variant is
    moved along its own hue: deepened on the light basemap, lifted on the dark
    one. Mixing towards white instead - the obvious thing, and what this used to
    do - washes the saturation out with the lightness, and the pastel that
    leaves reads as a disabled badge rather than a route. It also collided:
    lightening line 2's red landed on line 9's brown, the closest pair on the
    whole map at dE 19. Shifting lightness alone puts the nearest unrelated
    pair at 39 on the light map and 27 on the dark one. Line 10 is pure black, which vanishes
    on the dark basemap, so anything too dark or too pale for its background
    gets pulled towards the middle. And the line number has to stay legible on
    its own badge: white on line 2's red is 3.3:1, so that shade is deepened
    until the label clears AA.

    None of this touches the colour in the feed. route_color stays exactly what
    the operator publishes; these are the shades we draw with.
    """
    source = official_colours()

    out = {}
    for line in ORDER:
        base = source.get(line, COLORS[line])
        variant = line.endswith("D") and source.get(line) == source.get(line[:-1])
        pale = shift(base, 0.60) if variant else base
        vivid = shift(base, None, lift=0.42, saturate=1.35) if variant else base
        light = pale if luminance(pale) < 0.72 else mix(pale, "#000000", 0.35)
        dark = vivid if luminance(vivid) > 0.18 else mix(vivid, "#ffffff", 0.55)
        out[line] = {"light": readable(light), "dark": readable(dark)}
    return out


LABEL_DARK = "#232E10"
MIN_LABEL_CONTRAST = 4.5


def contrast(a, b):
    hi, lo = sorted((relative_luminance(a), relative_luminance(b)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)


def best_label(fill):
    """Whichever of the two label colours reads better on this fill."""
    white, dark = contrast("#ffffff", fill), contrast(LABEL_DARK, fill)
    return ("#ffffff", white) if white >= dark else (LABEL_DARK, dark)


def readable(fill):
    """Deepen or lift a shade until its own line number is legible on it.

    Line 2's red carries white at 3.3:1 and line 9's brown carries dark text at
    4.1:1 - both below AA, both fixed by a nudge small enough that nobody would
    call it a different colour.
    """
    label, ratio = best_label(fill)
    if ratio >= MIN_LABEL_CONTRAST:
        return fill
    towards = "#000000" if label == "#ffffff" else "#ffffff"
    for step in range(1, 21):
        candidate = mix(fill, towards, step * 0.03)
        if best_label(candidate)[1] >= MIN_LABEL_CONTRAST:
            return candidate
    return fill

# Running time comes from the Mapbox Directions API (see fetch_durations.py).
# These cover what that cannot: the pause at each stop, walking pace, and a
# fallback speed for any direction whose durations have not been fetched.
BUS_SPEED_M_PER_MIN = 400   # 24 km/h, fallback only
DWELL_SECONDS = 25          # door open/close at each stop
WALK_M_PER_MIN = 80         # 4.8 km/h

# Line descriptions as the operator words them.
DESCRIPTIONS = {
    "1": "Vasútállomás – Szemerja · Református Templomon át",
    "1D": "Szemerja – Szépmező · Tervező Intézeten át",
    "2": "Bartók Béla – Vasútállomás · Csíki negyeden át",
    "2D": "Bartók Béla – Szépmező · Csíki negyeden át",
    "3": "Cigaretta utca – Szotyor · Központon át",
    "4": "Cigaretta utca – Szépmező · Központon át",
    "5": "Sepsi Aréna – József Attila u.",
    "5D": "József Attila u. 2 – Szépmező · G. Bálán sugárúton át",
    "6": "Bartók Béla u. – Sepsi Aréna · Csíki negyeden át",
    "7": "Szemerja Végállomás – Vasútállomás · Cigaretta utcán át",
    "9": "Vasútállomás – Sugásfürdő · Kálvin téren át",
    "10": "Lábasház – Árkos központ · Kossuth Lajos negyeden át",
}

ROUTE_OVERRIDES = ROOT / "route_overrides.json"


def metres(a, b):
    lat = math.radians((a[0] + b[0]) / 2)
    return math.hypot((b[1] - a[1]) * 111320 * math.cos(lat), (b[0] - a[0]) * 111320)


def apply_route_overrides(directions, overrides):
    """Apply reviewed source corrections and retain the removed call positions.

    A source-page stop can be a legacy label rather than a physical platform.
    Overrides are intentionally exact and fail closed: a source change must be
    reviewed instead of silently creating a different route.
    """
    for override in overrides.get("removeCalls", []):
        matching_directions = [
            direction for direction in directions
            if direction["line"] == override["line"]
            and direction["direction"] == override["direction"]
        ]
        if len(matching_directions) != 1:
            raise ValueError(f"route override has no unique direction: {override}")
        direction = matching_directions[0]
        matching_indexes = [
            index for index, stop in enumerate(direction["stops"])
            if stop["name"]["ro"] == override["name"]
        ]
        if len(matching_indexes) != 1:
            raise ValueError(f"route override has no unique stop: {override}")

        index = matching_indexes[0]
        source_index = direction["source_stop_indexes"].pop(index)
        removed = direction["stops"].pop(index)
        if 0 < index < len(direction["stops"]):
            previous = direction["stops"][index - 1]
            previous["distance_to_next_m"] = (
                (previous["distance_to_next_m"] or 0)
                + (removed["distance_to_next_m"] or 0)
            )
        direction.setdefault("removed_call_indexes", []).append(source_index)
        for sequence, stop in enumerate(direction["stops"], 1):
            stop["stop_sequence"] = sequence
    return directions


def load_directions():
    out = []
    for line in ORDER:
        for direction in ("depart", "return"):
            path = ROOT / f"line-{line}" / f"{direction}.json"
            if not path.exists():
                continue
            data = json.loads(path.read_text(encoding="utf-8"))
            shape_path = ROOT / f"line-{line}" / f"{direction}-shape.json"
            shape = json.loads(shape_path.read_text(encoding="utf-8"))
            data["shape"] = shape["points"]
            data["source_stop_indexes"] = list(range(len(data["stops"])))
            # measured on the full geometry, not the thinned one the page draws
            data["length_m"] = shape["length_m"]
            out.append(data)
    overrides = json.loads(ROUTE_OVERRIDES.read_text(encoding="utf-8"))
    return apply_route_overrides(out, overrides)


def duration_seconds_for(direction, legs):
    """Collapse source duration legs after reviewed intermediate-stop removals."""
    source_indexes = direction.get("source_stop_indexes", list(range(len(direction["stops"]))))
    if len(source_indexes) != len(direction["stops"]):
        raise ValueError("route source indexes do not match retained stops")
    if not source_indexes:
        return []
    if len(legs) < source_indexes[-1]:
        raise ValueError("route durations do not cover retained stops")
    seconds = [sum(leg["seconds"] for leg in legs[left:right])
               for left, right in zip(source_indexes, source_indexes[1:])]
    return seconds + [0]


def build_stations(directions):
    """Group stop coordinates by name; each group is one place to change at."""
    groups = {}
    for d in directions:
        for stop in d["stops"]:
            key = stop["name"]["ro"]
            g = groups.setdefault(
                key, {"name": stop["name"], "points": [], "lines": set()}
            )
            point = [stop["stop_lat"], stop["stop_lon"]]
            if point not in g["points"]:
                g["points"].append(point)
            g["lines"].add(d["line"])

    stations = []
    for name in sorted(groups, key=lambda n: n.lower()):
        g = groups[name]
        pts = g["points"]
        stations.append(
            {
                "id": len(stations),
                "name": g["name"],
                "lat": round(sum(p[0] for p in pts) / len(pts), 6),
                "lng": round(sum(p[1] for p in pts) / len(pts), 6),
                "points": pts,
                "lines": sorted(g["lines"], key=ORDER.index),
            }
        )
    return stations


# Romania drives on the right, so a shelter sits on the right of the direction
# of travel. Half the gap between the paired kerbs the operator does publish -
# and the pairs OpenStreetMap records at Coșeni, Debren and Cartierul Ciucului
# all sit 11 to 12 m apart, so 6 m a side.
KERB_OFFSET_M = 6.0
# Two calls this far apart in bearing are the two sides of one road.
OPPOSITE_DEGREES = 120


def travel_bearings(directions):
    """Which way the bus is pointing at each call, from the stops either side."""
    out = {}
    for d in directions:
        stops = d["stops"]
        for i, stop in enumerate(stops):
            before = stops[max(0, i - 1)]
            after = stops[min(len(stops) - 1, i + 1)]
            dx = (after["stop_lon"] - before["stop_lon"]) * math.cos(
                math.radians(stop["stop_lat"]))
            dy = after["stop_lat"] - before["stop_lat"]
            if dx == 0 and dy == 0:
                continue
            out[(d["line"], d["direction"], i)] = math.degrees(math.atan2(dy, dx))
    return out


def _spread(a, b):
    gap = abs(a - b) % 360
    return 360 - gap if gap > 180 else gap


def split_shared_kerbs(stations, directions):
    """Give a second kerb to stops the operator publishes only once.

    Most stops come with a coordinate per direction, which is how we get 31
    two-sided places. At a handful the operator repeats one coordinate for both
    passes - Coșeni 1 is listed twice on the line 3 page, byte for byte the same
    point, while OpenStreetMap has two shelters 11.8 m apart there.

    Left alone, the planner believes you can catch either direction from one
    spot: it never asks anyone to cross the road, and understates both the walk
    and the transfer. So where the bus demonstrably passes in both directions,
    the missing kerb is derived - the side from the direction of travel, which
    is data, and the distance from the measured pairs, which is an estimate.

    Termini are left alone. A bus that turns round at Șugaș Băi really does use
    one bay, and inventing a second would be worse than the gap.
    """
    bearings = travel_bearings(directions)
    terminus = set()
    for d in directions:
        for i in (0, len(d["stops"]) - 1):
            terminus.add(d["stops"][i]["name"]["ro"])

    calls = {}
    for d in directions:
        for i, stop in enumerate(d["stops"]):
            key = (d["line"], d["direction"], i)
            if key in bearings:
                calls.setdefault(stop["name"]["ro"], []).append((key, bearings[key]))

    assignment, derived, skipped = {}, [], []
    for station in stations:
        name = station["name"]["ro"]
        here = calls.get(name, [])
        if len(station["points"]) != 1 or len(here) < 2:
            continue
        widest = max(
            (_spread(a[1], b[1]), a, b)
            for i, a in enumerate(here) for b in here[i + 1:]
        )
        if widest[0] < OPPOSITE_DEGREES:
            continue
        if name in terminus:
            skipped.append(name)
            continue

        origin = station["points"][0]
        reference = widest[1][1]
        station["points"] = [_offset(origin, reference),
                             _offset(origin, reference + 180)]
        station["derived_kerbs"] = True
        for key, bearing in here:
            assignment[key] = 0 if _spread(bearing, reference) < 90 else 1
        derived.append(name)

    return assignment, derived, skipped


def _offset(point, bearing):
    """Move a point KERB_OFFSET_M to the right of the given bearing."""
    radians = math.radians(bearing)
    east, north = math.cos(radians), math.sin(radians)
    right_east, right_north = north, -east          # rotate the heading clockwise
    lat = point[0] + (right_north * KERB_OFFSET_M) / 111320
    lon = point[1] + (right_east * KERB_OFFSET_M) / (
        111320 * math.cos(math.radians(point[0])))
    return [round(lat, 6), round(lon, 6)]


def anchor_vertices(stops, shape):
    """Pin each stop to a shape vertex, walking forward along the route.

    A plain nearest-vertex search breaks on the loop lines: they run out and
    back along the same street, so a stop on the inbound leg can sit closest to
    an outbound vertex and the anchors jump backwards. Line 2 did that at 12 of
    its 26 legs. Searching only from the previous anchor onward keeps the
    anchors in travel order, which is what slicing a leg out of the shape needs.

    Searching the whole remainder is not enough on its own: one greedy jump
    forward strands every later stop. So each stop is looked for near where it
    is expected to fall, using how far along the line it sits according to the
    operator's own inter-stop distances.
    """
    along = [0.0]
    for i in range(1, len(shape)):
        along.append(along[-1] + metres(shape[i - 1], shape[i]))
    route_length = along[-1] or 1.0

    travelled, running = [0.0], 0.0
    for stop in stops[:-1]:
        running += stop["distance_to_next_m"] or 0
        travelled.append(running)
    stops_length = travelled[-1] or 1.0

    last = len(shape) - 1
    out, cursor = [], 0
    for k, stop in enumerate(stops):
        if k == 0:
            out.append(0)
            cursor = 1
            continue
        if k == len(stops) - 1:
            out.append(last)
            continue

        point = (stop["stop_lat"], stop["stop_lon"])
        expected = travelled[k] / stops_length * route_length
        slack = max(500.0, route_length * 0.12)
        lo = cursor
        while lo < last and along[lo] < expected - slack:
            lo += 1
        hi = lo
        while hi < last and along[hi] < expected + slack:
            hi += 1
        best = min(range(lo, hi + 1), key=lambda i: metres(point, shape[i]))
        out.append(best)
        cursor = min(best + 1, last)
    return out


def simplify(points, must_keep=(), tolerance_m=4.0):
    """Ramer-Douglas-Peucker, so the page ships a lighter polyline.

    The routes carry roughly 8600 vertices between them, which is the slowest
    thing on the page to parse and upload to the GPU. Dropping vertices that
    sit within a few metres of the line they lie on is invisible at city zoom.
    The -shape.json files keep every point, because shapes.txt should not be
    degraded for the sake of the map.

    `must_keep` names vertices that have to survive: the ones each stop is
    anchored to. Without them a planned journey would be drawn from a point up
    to 145 m away from the stop it claims to start at. Returns the thinned
    points and a map from old index to new.
    """
    if len(points) < 3:
        return list(points), {i: i for i in range(len(points))}

    def perpendicular(p, a, b):
        lat = math.radians(a[0])
        ax, ay = 0.0, 0.0
        bx = (b[1] - a[1]) * 111320 * math.cos(lat)
        by = (b[0] - a[0]) * 111320
        px = (p[1] - a[1]) * 111320 * math.cos(lat)
        py = (p[0] - a[0]) * 111320
        seg = math.hypot(bx - ax, by - ay)
        if seg == 0:
            return math.hypot(px, py)
        return abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / seg

    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    for i in must_keep:
        keep[i] = True
    stack = [(0, len(points) - 1)]
    while stack:
        start, end = stack.pop()
        worst, index = 0.0, None
        for i in range(start + 1, end):
            d = perpendicular(points[i], points[start], points[end])
            if d > worst:
                worst, index = d, i
        if index is not None and worst > tolerance_m:
            keep[index] = True
            stack.append((start, index))
            stack.append((index, end))

    remap, thinned = {}, []
    for i, (point, kept) in enumerate(zip(points, keep)):
        if kept:
            remap[i] = len(thinned)
            thinned.append(point)
    return thinned, remap


def main():
    directions = load_directions()
    stations = build_stations(directions)
    index = {s["name"]["ro"]: s["id"] for s in stations}

    routes = []
    raw_points = simplified_points = 0
    for d in directions:
        full = d["shape"]
        raw_points += len(full)
        # anchor every stop on the full shape first, then thin around them
        anchors = anchor_vertices(d["stops"], full)
        shape, remap = simplify(full, must_keep=anchors)
        simplified_points += len(shape)
        seq, vertices, hops, kerbs = [], [], [], []
        for stop, anchor in zip(d["stops"], anchors):
            station = stations[index[stop["name"]["ro"]]]
            seq.append(station["id"])
            vertices.append(remap[anchor])
            hops.append(stop["distance_to_next_m"] or 0)
            # which of the station's stopping points this route actually uses,
            # so a transfer knows whether the rider has to cross the road
            here = [stop["stop_lat"], stop["stop_lon"]]
            kerbs.append(station["points"].index(here))

        # real road timings when they have been fetched, flat speed otherwise
        timings = ROOT / f"line-{d['line']}" / f"{d['direction']}-durations.json"
        if timings.exists():
            legs = json.loads(timings.read_text(encoding="utf-8"))["legs"]
            secs = duration_seconds_for(d, legs)
            timed = True
        else:
            secs = [round(m / BUS_SPEED_M_PER_MIN * 60) for m in hops]
            timed = False

        routes.append(
            {
                "line": d["line"],
                "direction": d["direction"],
                "circular": d["circular"],
                "headsign": d["headsign"],
                "length_m": d["length_m"],
                "stations": seq,
                "vertices": vertices,
                # metres from each stop to the next, and how long that leg takes
                "hops": hops,
                "kerbs": kerbs,
                "secs": secs,
                "timed": timed,
                # GeoJSON wants lng,lat
                "shape": [[round(p[1], 5), round(p[0], 5)] for p in shape],
            }
        )

    walk = []
    for i, a in enumerate(stations):
        for b in stations[i + 1:]:
            gap = min(metres(p, q) for p in a["points"] for q in b["points"])
            if gap <= WALK_LIMIT_M:
                walk.append([a["id"], b["id"], round(gap)])

    tones = palette()
    lines = [
        {
            "id": line,
            "color": tones[line]["light"],
            "color_dark": tones[line]["dark"],
            "description": DESCRIPTIONS[line],
            "circular": any(r["circular"] for r in routes if r["line"] == line),
        }
        for line in ORDER
    ]

    spot = {}
    for station in stations:
        for i, point in enumerate(station["points"]):
            spot[f"{point[0]:.5f},{point[1]:.5f}"] = (station["id"], i)

    walks, orphan = {}, 0
    walk_file = ROOT / "walks.json"
    if walk_file.exists():
        for coords, leg in json.loads(
            walk_file.read_text(encoding="utf-8")
        )["walks"].items():
            a, b = coords.split(">")
            if a not in spot or b not in spot:
                orphan += 1
                continue
            sa, ka = spot[a]
            sb, kb = spot[b]
            walks[f"{sa}:{ka}>{sb}:{kb}"] = {
                "m": leg["metres"],
                "s": leg["seconds"],
                "path": leg["path"],
            }
    if orphan:
        print(f"  {orphan} walking routes did not match a stopping point")

    # published departures, as trip start times plus per-stop offsets
    schedule, untimed, valid_from = {}, [], ""
    trip_file = ROOT / "trips.json"
    if trip_file.exists():
        payload = json.loads(trip_file.read_text(encoding="utf-8"))
        built = payload["trips"]
        hungarian = [v for v in payload.get("valid_from", []) if "érvényes" in v]
        valid_from = hungarian[0] if hungarian else ""
        for route in routes:
            key = f"{route['line']}-{route['direction']}"
            record = built.get(key)
            if not record:
                untimed.append(key)
                continue
            schedule[key] = {
                "offsets": record["offsets"],
                "weekday": record.get("weekday", []),
                "weekend": record.get("weekend", []),
            }
    if untimed:
        print(f"  no published times for: {', '.join(untimed)}")

    # the published tariff, plus which stations sit outside the city fare zone
    fares = json.loads((ROOT / "fares.json").read_text(encoding="utf-8"))
    outside = set(fares["zones"]["arcus"])
    for station in stations:
        station["zone"] = "arcus" if station["name"]["ro"] in outside else "city"

    bundle = {
        "token": MAPBOX_TOKEN,
        "fares": {
            "currency": fares["currency"],
            "tickets": [t for t in fares["tickets"] if "minutes" in t],
            "cheapest": min(t["price"] for t in fares["tickets"]),
        },
        "walks": walks,
        "schedule": schedule,
        "schedule_valid": valid_from,
        "speed": {
            "bus": BUS_SPEED_M_PER_MIN,
            "dwell": DWELL_SECONDS,
            "walk": WALK_M_PER_MIN,
        },
        "lines": lines,
        "stations": stations,
        "routes": routes,
        "walk": walk,
    }

    payload = json.dumps(bundle, ensure_ascii=False, separators=(",", ":"))
    template = TEMPLATE.read_text(encoding="utf-8")
    if "__DATA__" not in template:
        print("map.template.html has no __DATA__ placeholder", file=sys.stderr)
        return 1
    OUTPUT.write_text(template.replace("__DATA__", payload), encoding="utf-8")

    print(f"{len(lines)} lines, {len(routes)} directions, {len(stations)} stations")
    print(
        f"shape points {raw_points} -> {simplified_points} "
        f"({100 - simplified_points * 100 // raw_points}% lighter for the page)"
    )
    print(f"{len(walk)} walking links under {WALK_LIMIT_M} m")
    print(f"{OUTPUT.name} written, {OUTPUT.stat().st_size / 1024:.0f} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
