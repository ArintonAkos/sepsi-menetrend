#!/usr/bin/env python3
"""Turn the GTFS feed into the bundle the web app ships.

The app plans journeys in the browser, so everything it needs travels with the
page. Two things keep that affordable:

  * patterns, not trips. Dozens of trips walk the same stops in the same order;
    the stop list, the shape and the relative times are stored once.
  * route geometry is shipped whole. Simplifying it to 6 m looked harmless in
    a table and awful on the map: it dropped four fifths of the vertices and
    stretched the median segment from 14 m to 57 m, so the lines cut corners
    instead of following the road. Keeping every point costs 8 kB gzipped for
    the entire network, which is not a trade worth making.
  * that geometry is then de-duplicated and smoothed. The operator publishes it
    rounded to four decimal places - a grid of about 8 by 11 metres here - so a
    fifth of the points repeat the one before and the rest staircase along the
    road. Corner-cutting removes the staircase without moving the line off the
    street: measured against the OSM centreline near Chilieni it goes from
    1.5 m out to 1.2 m.

    Re-routing through the stops was tried instead and rejected. OSRM returns
    full precision, but on five of the twelve lines it picks streets the bus
    does not use - through the Vigadó block on line 5, for one - because it
    optimises where the operator follows a timetable.

Reads   gtfs/, walks.json, fares.json, osm/, line-*/[direction].json
Writes  web/public/data/{network,places,fares}.json
"""

import csv
import json
import math
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_map import anchor_vertices, best_label, load_directions, palette  # noqa: E402
from build_platforms import load_osm_platforms, load_overrides, resolve_platforms  # noqa: E402

ROOT = Path(__file__).resolve().parent
GTFS = ROOT / "gtfs"
OUT = ROOT / "web" / "public" / "data"
LAT0 = 45.865
# What counts as "in the area" is distance from the nearest stop, not a box.
#
# A rectangle round this network is mostly waste: it has to stretch 7.2 km west
# for Sugásfürdő and 4.5 km north for Arcuș, and 58 percent of what that encloses
# is farther than a walk from any bus. Measuring to the nearest stop instead
# follows the corridors, so the area shrinks by well over half while every
# address anyone could actually catch a bus from stays inside it.
#
# The radius is what someone will walk to a stop - about twenty minutes.
# The box is still written out because the geocoder only accepts a rectangle;
# it is the outer limit of the request, and the radius filters what comes back.
AREA_REACH_M = 1_500


def read(name):
    with (GTFS / name).open(encoding="utf-8", newline="") as fh:
        return list(csv.DictReader(fh))


def seconds(text):
    h, m, s = (int(p) for p in text.split(":"))
    return h * 3600 + m * 60 + s


def pattern_key(trip, rows):
    """Identify a reusable pattern, including its published call-time shape."""
    base = seconds(rows[0]["departure_time"])
    offsets = tuple((seconds(row["departure_time"]) - base) // 60 for row in rows)
    return (trip["route_id"], trip["shape_id"],
            tuple(row["stop_id"] for row in rows), offsets)


def official_boards(timetable, bindings=None, *, strict=True):
    """Keep the operator's stop boards separate from generated trip estimates.

    A board is a literal published column at one station. It is deliberately
    not folded into a route pattern here: the operator publishes several
    special D services whose stop-board order is richer than the older route
    geometry pages. The popup can therefore remain exact without claiming a
    false trip topology.
    """
    out = []
    for entry in timetable.get("timepoints", []):
        services = {}
        for service in ("weekday", "weekend"):
            minutes = []
            for text in entry.get("times", {}).get(service, []):
                hour, minute = (int(part) for part in text.split(":"))
                # The operator's 00:xx departures are the end of this service
                # day, not buses before its 04:00 opening.
                if hour < 4:
                    hour += 24
                minutes.append(hour * 60 + minute)
            services[service] = sorted(minutes)
        key = (entry["line"], entry.get("direction", "depart"), entry["stop_ro"], entry["destination"])
        stop_id = bindings.get(key) if bindings is not None else None
        if bindings is not None and strict and not stop_id:
            raise ValueError(f"unbound official board: {key}")
        out.append({
            **({"stopId": stop_id} if stop_id else {}),
            "stopRo": entry["stop_ro"], "lineId": entry["line"],
            "destination": entry["destination"], **services,
        })
    return sorted(out, key=lambda b: (b["stopRo"], b["lineId"], b["destination"]))


_DESTINATION_NOISE = {"str", "strada", "utca", "cfr", "cap", "linie", "linia"}


def _words(text):
    plain = unicodedata.normalize("NFKD", text)
    plain = "".join(char for char in plain if not unicodedata.combining(char))
    return {word for word in re.findall(r"[a-z0-9]+", plain.lower())
            if word not in _DESTINATION_NOISE}


def _destination_stop_indexes(direction, destination):
    """Find the route calls whose published names best match a board headsign."""
    wanted = _words(destination)
    scored = []
    for index, stop in enumerate(direction["stops"]):
        names = " ".join(stop["name"].values())
        shared = wanted & _words(names)
        if shared:
            scored.append((len(shared), sum(len(word) for word in shared), index))
    if not scored:
        return []
    best = max(score[:2] for score in scored)
    return [index for count, letters, index in scored if (count, letters) == best]


def platform_side(start, end, platform):
    """Return the platform's side of travel; Romania uses the right-hand side."""
    latitude = math.radians((start[0] + end[0] + platform[0]) / 3)
    scale = 111320 * math.cos(latitude)
    dx, dy = (end[1] - start[1]) * scale, (end[0] - start[0]) * 111320
    px, py = (platform[1] - start[1]) * scale, (platform[0] - start[0]) * 111320
    cross = dx * py - dy * px
    if abs(cross) < 0.001:
        return "centre"
    return "right" if cross < 0 else "left"


def _distance_to_segment(point, start, end):
    latitude = math.radians((point[0] + start[0] + end[0]) / 3)
    scale = 111320 * math.cos(latitude)
    ax, ay = (start[1] - point[1]) * scale, (start[0] - point[0]) * 111320
    bx, by = (end[1] - point[1]) * scale, (end[0] - point[0]) * 111320
    dx, dy = bx - ax, by - ay
    length = dx * dx + dy * dy
    if not length:
        return math.hypot(ax, ay)
    factor = max(0, min(1, -(ax * dx + ay * dy) / length))
    return math.hypot(ax + factor * dx, ay + factor * dy)


def _shape_anchor_indexes(direction):
    """Map retained segment calls to their ordered positions on the full shape."""
    shape = direction.get("shape")
    if not shape:
        return None
    if "shape_source_stops" not in direction:
        return anchor_vertices(direction["stops"], shape)
    full = anchor_vertices(direction["shape_source_stops"], shape)
    by_source = dict(zip(direction["shape_source_indexes"], full))
    return [by_source.get(index) for index in direction["source_stop_indexes"]]


def _platform_side_on_shape(direction, index, platform):
    """Use the detailed, ordered road polyline rather than a stop-to-stop chord."""
    anchors = _shape_anchor_indexes(direction)
    shape = direction.get("shape")
    if not anchors or anchors[index] is None or len(shape) < 2:
        return None
    anchor = anchors[index]
    low, high = max(0, anchor - 16), min(len(shape) - 2, anchor + 16)
    segment = min(range(low, high + 1),
                  key=lambda item: _distance_to_segment(platform, shape[item], shape[item + 1]))
    if _distance_to_segment(platform, shape[segment], shape[segment + 1]) > 45:
        return None
    side = platform_side(shape[segment], shape[segment + 1], platform)
    return None if side == "centre" else side


def _board_candidates(entry, directions, topology, platform_stop_ids):
    records = {platform["id"]: platform for platform in topology.get("platforms", [])}
    candidates = []
    for direction in directions:
        if direction["line"] != entry["line"]:
            continue
        source_direction = direction.get("source_direction", direction["direction"])
        if source_direction != entry.get("direction", source_direction):
            continue
        if (direction.get("destination") is not None and
                direction["destination"] != entry["destination"]):
            continue
        targets = _destination_stop_indexes(direction, entry["destination"])
        for index, stop in enumerate(direction["stops"]):
            if stop["name"]["ro"] != entry["stop_ro"]:
                continue
            platform = topology["call_platforms"][(direction["line"], direction["direction"], index)]
            record = records.get(platform)
            side = _platform_side_on_shape(direction, index, record["point"]) if record else None
            if targets:
                if direction.get("circular"):
                    distance = min((target - index) % len(direction["stops"]) for target in targets)
                else:
                    forward = [target - index for target in targets if target >= index]
                    distance = min(forward) if forward else None
            else:
                distance = None
            candidates.append({"stop_id": platform_stop_ids[platform], "distance": distance,
                               "side": side})
    return candidates


def official_board_bindings(timetable, directions, topology, platform_stop_ids):
    """Bind each literal board to the correct kerb and circular-route pass.

    Where the operator's source route is a loop, a destination label such as
    ``Gara`` or ``Bartók`` selects the occurrence that reaches that destination
    first.  The detailed direction geometry supplies a right-hand-side tie
    breaker where the destination alone cannot choose a pass.  A tied or
    source-route-missing case stays unbound for review.
    """
    bindings = {}
    for entry in timetable.get("timepoints", []):
        key = (entry["line"], entry.get("direction", "depart"),
               entry["stop_ro"], entry["destination"])
        candidates = _board_candidates(entry, directions, topology, platform_stop_ids)
        platform_ids = {candidate["stop_id"] for candidate in candidates}
        if len(platform_ids) == 1:
            bindings[key] = platform_ids.pop()
            continue
        scored = [candidate for candidate in candidates if candidate["distance"] is not None]
        if not scored:
            right = {candidate["stop_id"] for candidate in candidates
                     if candidate["side"] == "right"}
            if len(right) == 1:
                bindings[key] = right.pop()
            continue
        best_distance = min(candidate["distance"] for candidate in scored)
        best = [candidate for candidate in scored if candidate["distance"] == best_distance]
        best_ids = {candidate["stop_id"] for candidate in best}
        if len(best_ids) != 1:
            continue
        bindings[key] = best_ids.pop()
    return bindings


K = math.cos(math.radians(LAT0))
project = lambda lon, lat: (lon * K * 111320, lat * 111320)


def smooth_shape(points):
    """Drop repeated points and round off the grid staircase.

    Chaikin corner cutting: each segment gives up its ends, so every corner
    becomes a short curve. Two rounds is enough to read as a road and keeps the
    line within a metre or so of where it started.
    """
    kept = [points[0]]
    for p in points[1:]:
        if metres(p, kept[-1]) > 0.5:
            kept.append(p)
    if len(kept) < 3:
        return kept
    for _ in range(2):
        smoothed = [kept[0]]
        for a, b in zip(kept, kept[1:]):
            smoothed.append((a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25))
            smoothed.append((a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75))
        smoothed.append(kept[-1])
        kept = smoothed
    return thin(kept, 1.0)


def thin(points, tolerance):
    """Ramer-Douglas-Peucker at a tolerance small enough to be invisible.

    Corner cutting multiplies the point count fourfold per round; most of what
    it adds sits on a straight. One metre is well under the source data's own
    rounding, so this costs nothing in accuracy and three quarters of the size.
    """
    if len(points) < 3:
        return points

    def offset(p, a, b):
        (x, y), (x1, y1), (x2, y2) = p, a, b
        dx, dy = x2 - x1, y2 - y1
        if dx == dy == 0:
            return math.hypot(x - x1, y - y1)
        t = max(0, min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)))
        return math.hypot(x - (x1 + t * dx), y - (y1 + t * dy))

    flat = [(lon * K * 111320, lat * 111320) for lon, lat in points]

    def walk(lo, hi):
        worst, at = 0.0, lo
        for i in range(lo + 1, hi):
            d = offset(flat[i], flat[lo], flat[hi])
            if d > worst:
                worst, at = d, i
        if worst <= tolerance:
            return [lo, hi]
        return walk(lo, at)[:-1] + walk(at, hi)

    return [points[i] for i in walk(0, len(points) - 1)]


def metres(a, b):
    return math.hypot((a[0] - b[0]) * K * 111320, (a[1] - b[1]) * 111320)


def running_distance(points):
    out, total = [0.0], 0.0
    for a, b in zip(points, points[1:]):
        total += metres(a, b)
        out.append(total)
    return out


def anchor_stops(stop_distances, vertex_distances):
    """Pin each stop to a vertex, walking forward along the shape.

    A nearest-vertex search is wrong on the loop routes: a stop can sit metres
    from a vertex belonging to the *other* pass around the loop, and the drawn
    leg then jumps backwards across town. Distance along the shape is what GTFS
    actually gives us, and it is monotonic by construction.
    """
    anchors, cursor = [], 0
    last = len(vertex_distances) - 1
    for n, target in enumerate(stop_distances):
        best, best_gap = cursor, abs(vertex_distances[cursor] - target)
        for i in range(cursor, len(vertex_distances)):
            gap = abs(vertex_distances[i] - target)
            if gap < best_gap:
                best, best_gap = i, gap
            elif vertex_distances[i] > target:
                break                       # distances only grow; we passed it
        # Two stops close together can round to the same vertex, and a leg
        # between them then has no line to draw - the ride vanishes from the
        # map and only the walks either side show. Give every stop its own.
        if anchors and best <= anchors[-1]:
            best = min(anchors[-1] + 1, last - (len(stop_distances) - 1 - n))
            best = max(best, anchors[-1])
        anchors.append(best)
        cursor = best                       # never look back
    return anchors


def text_colour(hex_colour):
    """White or near-black, whichever reads better on this background."""
    return best_label("#" + hex_colour.lstrip("#"))[0]


# Nicknames riders actually use. Several came straight from the comments under a
# rival app: people asked for "Söröző" and "ANL" because nobody says the street
# name. The mall is in OSM as "Centre", so "Center" only works via fuzzy match -
# these entries make the intent explicit rather than relying on edit distance.
ALIASES = {
    "Str. Sporturilor": ["Söröző"],
    "Str. Lăcrămioarei 1": ["ANL"],
    "Spitalul Județean": ["Kórház", "Spital"],
    "Gara CFR": ["Állomás", "Gara"],
    "Sepsi Value Centre": ["Sepsi Value Center", "Value Center"],
    "Centru Comercial": ["Sepsi Value Center", "Bevásárló"],
}

KIND_BY_TAG = {
    "shop": "shop", "amenity": "poi", "tourism": "poi", "leisure": "poi",
    "office": "poi", "healthcare": "poi",
    "building": "place", "landuse": "place", "place": "place",
}
# a named block of flats is not a destination anyone searches for
SKIP_BUILDINGS = {"yes", "house", "residential", "apartments", "detached"}


def osm(name):
    path = ROOT / "osm" / f"{name}.json"
    if not path.exists():
        print(f"  no osm/{name}.json - run fetch_osm.py", file=sys.stderr)
        return []
    return json.loads(path.read_text(encoding="utf-8"))["elements"]


def tidy(text):
    return " ".join((text or "").split())


def area_box(stops):
    """The rectangle the geocoder is asked about: stops plus the reach."""
    lats = [s["at"][1] for s in stops]
    lons = [s["at"][0] for s in stops]
    dlat = AREA_REACH_M / 111320
    dlon = AREA_REACH_M / (111320 * K)
    return [round(min(lons) - dlon, 4), round(min(lats) - dlat, 4),
            round(max(lons) + dlon, 4), round(max(lats) + dlat, 4)]


def within_reach(point, stops):
    return any(metres(point, s["at"]) <= AREA_REACH_M for s in stops)


def write_places(stops, hu):
    """One searchable list: stops, streets, shops, landmarks - both languages."""
    items, seen = [], set()

    grouped = defaultdict(list)
    for element in osm("streets"):
        tags, centre = element["tags"], element.get("center")
        if centre:
            grouped[(tidy(tags["name"]), tidy(tags.get("name:hu")))].append(
                (centre["lon"], centre["lat"]))
    for (ro, name_hu), points in grouped.items():
        items.append({"kind": "street", "ro": ro, "hu": name_hu or ro,
                      "at": [round(sum(p[0] for p in points) / len(points), 6),
                             round(sum(p[1] for p in points) / len(points), 6)]})

    for source in ("poi", "places"):
        for element in osm(source):
            tags = element["tags"]
            centre = element.get("center") or element
            if "lat" not in centre:
                continue
            name = tidy(tags.get("name"))
            if not name:
                continue
            kind = next((KIND_BY_TAG[t] for t in KIND_BY_TAG if t in tags), "poi")
            if kind == "place" and tags.get("building") in SKIP_BUILDINGS and not tags.get("landuse"):
                continue
            key = (name.lower(), round(centre["lat"], 3), round(centre["lon"], 3))
            if key in seen:
                continue
            seen.add(key)
            detail = next((tags[t] for t in ("shop", "amenity", "tourism", "leisure",
                                             "office", "landuse") if t in tags), "")
            items.append({"kind": kind, "ro": name, "hu": tidy(tags.get("name:hu")) or name,
                          "at": [round(centre["lon"], 6), round(centre["lat"], 6)],
                          "detail": detail})

    for stop in {s["name"]["ro"]: s for s in stops}.values():
        items.append({"kind": "stop", "ro": stop["name"]["ro"], "hu": stop["name"]["hu"],
                      "at": stop["at"]})

    attached = 0
    for item in items:
        extra = ALIASES.get(item["ro"]) or ALIASES.get(item["hu"])
        if extra:
            item["aliases"] = extra
            attached += 1

    box = area_box(stops)
    inside = [i for i in items if within_reach(i["at"], stops)]
    dropped = len(items) - len(inside)
    payload = {"bbox": box, "reach": AREA_REACH_M, "places": inside}
    items = inside
    (OUT / "places.json").write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    kinds = Counter(i["kind"] for i in items)
    print(f"{len(items)} searchable places {dict(kinds)}, {attached} carry nicknames"
          + (f" ({dropped} beyond walking distance of a stop)" if dropped else ""))
    across = (box[2] - box[0]) * K * 111320 / 1000
    down = (box[3] - box[1]) * 111320 / 1000
    print(f"  within {AREA_REACH_M} m of a stop; the geocoder box is "
          f"{across:.1f} x {down:.1f} km")
    missing = [k for k in ALIASES if not any(k in (i["ro"], i["hu"]) for i in items)]
    if missing:
        print(f"  nicknames with no target: {missing}", file=sys.stderr)


def write_fares():
    """Reshape the tariff into what the fare engine expects."""
    raw = json.loads((ROOT / "fares.json").read_text(encoding="utf-8"))
    tickets = [
        {"id": t["id"], "zone": t["zone"], "price": t["price"],
         "validFor": t["minutes"], "name": t["name"]}
        for t in raw["tickets"] if t.get("minutes")
    ]
    (OUT / "fares.json").write_text(json.dumps(
        {"currency": raw["currency"], "tickets": tickets, "note": raw["note"]},
        ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    for t in tickets:
        print(f"  {t['id']:14} {t['price']} lej / {t['validFor']} min")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    stops_raw = read("stops.txt")
    routes = {r["route_id"]: r for r in read("routes.txt")}
    trips_raw = {t["trip_id"]: t for t in read("trips.txt")}
    feed = read("feed_info.txt")[0] if (GTFS / "feed_info.txt").exists() else {}
    timetable = json.loads((ROOT / "timetable.json").read_text(encoding="utf-8"))

    hu = {}
    for path in sorted(ROOT.glob("line-*/*.json")):
        blob = json.loads(path.read_text(encoding="utf-8"))
        if "stops" in blob:
            for s in blob["stops"]:
                hu[s["name"]["ro"]] = s["name"]["hu"]

    stops, stations = [], defaultdict(list)
    by_id = {}
    for r in stops_raw:
        by_id[r["stop_id"]] = r
        if r.get("location_type") == "1":
            continue
        name = r["stop_name"]
        entry = {
            "id": r["stop_id"],
            "name": {"ro": name, "hu": hu.get(name, name)},
            "at": [round(float(r["stop_lon"]), 6), round(float(r["stop_lat"]), 6)],
            # A physical platform is the planning identity.  Equal labels do
            # not prove that two kerbs are interchangeable or even nearby.
            "stationId": r.get("parent_station") or r["stop_id"],
            "zone": r.get("zone_id") or "city",
        }
        if r.get("platform_code"):
            entry["platform"] = r["platform_code"]
        stops.append(entry)
        stations[entry["stationId"]].append(entry)

    # `build_gtfs.py` allocates P1… in this stable platform-id order. Resolve
    # the same topology here so a literal source board can retain that physical
    # identity in the offline browser bundle.
    directions = load_directions()
    topology = resolve_platforms(directions, load_osm_platforms(), load_overrides())
    platform_stop_ids = {
        platform["id"]: f"P{index}"
        for index, platform in enumerate(topology["platforms"], 1)
    }
    board_bindings = official_board_bindings(timetable, directions, topology,
                                             platform_stop_ids)

    station_list = []
    for sid, members in stations.items():
        name = members[0]["name"]
        station_list.append({
            "id": sid, "name": name,
            "at": [round(sum(m["at"][0] for m in members) / len(members), 6),
                   round(sum(m["at"][1] for m in members) / len(members), 6)],
            "stopIds": [m["id"] for m in members],
        })

    shapes = defaultdict(list)
    for r in read("shapes.txt"):
        shapes[r["shape_id"]].append(
            (float(r["shape_dist_traveled"] or 0), float(r["shape_pt_lon"]), float(r["shape_pt_lat"]))
        )
    for v in shapes.values():
        v.sort()

    times = defaultdict(list)
    for r in read("stop_times.txt"):
        times[r["trip_id"]].append(r)
    for v in times.values():
        v.sort(key=lambda r: int(r["stop_sequence"]))

    patterns, pattern_id, trips = {}, {}, []
    for tid, rows in times.items():
        trip = trips_raw[tid]
        key = pattern_key(trip, rows)
        base = seconds(rows[0]["departure_time"])
        if key not in pattern_id:
            pid = f"P{len(pattern_id) + 1}"
            pattern_id[key] = pid
            raw = shapes[trip["shape_id"]]
            smooth = smooth_shape([(lon, lat) for _, lon, lat in raw])
            geometry = [[round(lon, 6), round(lat, 6)] for lon, lat in smooth]
            along = running_distance(smooth)
            # smoothing shortens the line slightly; rescale the stop distances
            published_length = raw[-1][0] or along[-1]
            scale = along[-1] / published_length if published_length else 1.0
            stop_distances = [float(r["shape_dist_traveled"] or 0) * scale for r in rows]
            index = anchor_stops(stop_distances, along)
            patterns[pid] = {
                "id": pid, "lineId": trip["route_id"], "shapeId": trip["shape_id"],
                "headsign": {"ro": trip["trip_headsign"],
                             "hu": hu.get(trip["trip_headsign"], trip["trip_headsign"])},
                "stopIds": [r["stop_id"] for r in rows],
                "offsets": [(seconds(r["departure_time"]) - base) // 60 for r in rows],
                "published": [r.get("timepoint") == "1" for r in rows],
                "shape": geometry, "shapeIndex": index,
            }
        trips.append({"patternId": pattern_id[key], "service": trip["service_id"],
                      "start": base // 60})

    # walks.json is keyed by coordinates; map them back onto stop ids
    def walk_key_coord(lat, lon):
        # Match the f"{value:.5f}" representation used by fetch_walks.key.
        # Python's `round` has a different tie-breaking rule for e.g.
        # 25.795895, which would silently lose an otherwise exact endpoint.
        return float(f"{lat:.5f}"), float(f"{lon:.5f}")

    # The GTFS text has already rounded latitude/longitude to six decimals.
    # The walking cache is created from the original platform evidence, so use
    # that evidence for the primary lookup too (rather than rounding a rounded
    # value for a second time).  GTFS assigns P1… in this same sorted order.
    topology = json.loads((ROOT / "platforms.json").read_text(encoding="utf-8"))
    coord_to_stop = {
        walk_key_coord(*platform["point"]): f"P{index}"
        for index, platform in enumerate(topology["platforms"], 1)
    }
    for r in stops_raw:
        if r.get("location_type") != "1":
            # Compatibility for an existing cache made from a prior GTFS
            # version; canonical platform evidence above always wins.
            coord_to_stop.setdefault(
                walk_key_coord(float(r["stop_lat"]), float(r["stop_lon"])), r["stop_id"]
            )

    def nearest(lat, lon):
        # `walks.json` deliberately keys the endpoint at five decimals.  Check
        # that canonical coordinate first: opposite physical platforms can be
        # only a few metres apart, so a generic nearest-within-25m rule would
        # otherwise call an exact endpoint ambiguous and drop its real walk.
        exact = coord_to_stop.get(walk_key_coord(lat, lon))
        if exact:
            return exact
        candidates = []
        for (a, b), sid in coord_to_stop.items():
            d = math.hypot((a - lat) * 111320, (b - lon) * 111320 * K)
            if d < 25:
                candidates.append((d, sid))
        return candidates[0][1] if len(candidates) == 1 else None

    walks, dropped = [], 0
    raw_walks = json.loads((ROOT / "walks.json").read_text(encoding="utf-8"))["walks"]
    for key, w in raw_walks.items():
        a, b = [tuple(float(x) for x in part.split(",")) for part in key.split(">")]
        f, t = nearest(*a), nearest(*b)
        if not f or not t or f == t:
            dropped += 1
            continue
        walks.append({"from": f, "to": t, "metres": w["metres"], "seconds": w["seconds"],
                      "path": [[round(c[0], 6), round(c[1], 6)] for c in w["path"]]})

    # The feed carries the operator's colour untouched. Drawing needs two more:
    # they give a line and its D variant the same colour, and line 10 is pure
    # black, which disappears on a dark basemap. `palette` makes both readable
    # without changing the identity - see build_map.
    tones = palette()
    lines = []
    for rid, r in routes.items():
        line_id = r["route_short_name"]
        colour = "#" + r["route_color"]
        shades = tones.get(line_id, {"light": colour, "dark": colour})
        lines.append({
            "id": line_id,
            "name": {"ro": r["route_long_name"],
                     "hu": hu.get(r["route_long_name"], r["route_long_name"])},
            "colour": colour,
            "textColour": text_colour(r["route_color"]),
            "light": shades["light"],
            "lightText": text_colour(shades["light"].lstrip("#")),
            "dark": shades["dark"],
            "darkText": text_colour(shades["dark"].lstrip("#")),
        })

    network = {
        "version": feed.get("feed_version", "dev"),
        "generated": feed.get("feed_start_date", ""),
        "validFrom": feed.get("feed_start_date", ""),
        "lines": lines, "stops": stops, "stations": station_list,
        "patterns": list(patterns.values()), "trips": trips, "walks": walks,
        "officialBoards": official_boards(timetable, board_bindings, strict=False),
    }
    broken = [p["id"] for p in network["patterns"]
              if any(b < a for a, b in zip(p["shapeIndex"], p["shapeIndex"][1:]))]
    if broken:
        print(f"  stop anchors go backwards on {broken} - legs will draw wrong",
              file=sys.stderr)
        return 1

    (OUT / "network.json").write_text(json.dumps(network, ensure_ascii=False,
                                                 separators=(",", ":")), encoding="utf-8")

    write_places(stops, hu)
    write_fares()

    size = (OUT / "network.json").stat().st_size / 1024
    print(f"{len(lines)} lines · {len(stops)} stops · {len(station_list)} stations")
    print(f"{len(patterns)} patterns from {len(trips)} trips "
          f"({len(trips) / max(1, len(patterns)):.1f} trips per pattern)")
    print(f"{len(walks)} walks kept, {dropped} unmatched")
    print(f"network.json  {size:.0f} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
