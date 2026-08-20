#!/usr/bin/env python3
"""Check the generated feed against the GTFS rules a consumer will enforce.

Not a replacement for MobilityData's validator, which is the one to run before
publishing. This covers the structural rules that a feed built by script is
most likely to break: dangling references, times or distances that go
backwards, routes with no service, and translations pointing at records that
do not exist.
"""

import csv
import sys
from collections import Counter, defaultdict
from pathlib import Path

GTFS = Path(__file__).resolve().parent / "gtfs"
REQUIRED = [
    "agency.txt", "stops.txt", "routes.txt", "trips.txt",
    "stop_times.txt", "calendar.txt",
]


def read(name):
    path = GTFS / name
    if not path.exists():
        return []
    with path.open(encoding="utf-8", newline="") as fh:
        return list(csv.DictReader(fh))


def seconds(text):
    h, m, s = (int(p) for p in text.split(":"))
    return h * 3600 + m * 60 + s


def main():
    problems, notes = [], []

    missing = [f for f in REQUIRED if not (GTFS / f).exists()]
    if missing:
        print("missing required files:", *missing, sep="\n  ")
        return 1

    agency = read("agency.txt")
    stops = read("stops.txt")
    routes = read("routes.txt")
    trips = read("trips.txt")
    times = read("stop_times.txt")
    calendar = read("calendar.txt")
    shapes = read("shapes.txt")
    translations = read("translations.txt")

    stop_ids = {s["stop_id"] for s in stops}
    route_ids = {r["route_id"] for r in routes}
    service_ids = {c["service_id"] for c in calendar}
    trip_ids = {t["trip_id"] for t in trips}
    shape_ids = {s["shape_id"] for s in shapes}
    agency_ids = {a["agency_id"] for a in agency}

    for name, ids, rows in (("stops", stop_ids, stops), ("routes", route_ids, routes),
                            ("trips", trip_ids, trips)):
        if len(ids) != len(rows):
            dupes = [k for k, n in Counter(
                r[f"{name[:-1]}_id"] for r in rows).items() if n > 1]
            problems.append(f"{name}: duplicate ids {dupes[:5]}")

    # references
    for s in stops:
        parent = s.get("parent_station") or ""
        if parent and parent not in stop_ids:
            problems.append(f"stops: {s['stop_id']} points at missing parent {parent}")
        if s.get("location_type") == "1" and parent:
            problems.append(f"stops: station {s['stop_id']} has a parent itself")
    for r in routes:
        if r.get("agency_id") and r["agency_id"] not in agency_ids:
            problems.append(f"routes: {r['route_id']} unknown agency")
    for t in trips:
        if t["route_id"] not in route_ids:
            problems.append(f"trips: {t['trip_id']} unknown route")
        if t["service_id"] not in service_ids:
            problems.append(f"trips: {t['trip_id']} unknown service")
        if t.get("shape_id") and t["shape_id"] not in shape_ids:
            problems.append(f"trips: {t['trip_id']} unknown shape")

    # every route needs service, every trip needs stops
    used_routes = {t["route_id"] for t in trips}
    for missing_route in sorted(route_ids - used_routes):
        problems.append(f"routes: {missing_route} has no trips")

    by_trip = defaultdict(list)
    for row in times:
        if row["trip_id"] not in trip_ids:
            problems.append(f"stop_times: unknown trip {row['trip_id']}")
            continue
        if row["stop_id"] not in stop_ids:
            problems.append(f"stop_times: unknown stop {row['stop_id']}")
            continue
        by_trip[row["trip_id"]].append(row)

    for tid in trip_ids:
        rows = sorted(by_trip.get(tid, []), key=lambda r: int(r["stop_sequence"]))
        if len(rows) < 2:
            problems.append(f"stop_times: trip {tid} has {len(rows)} stops")
            continue
        order = [int(r["stop_sequence"]) for r in rows]
        if len(set(order)) != len(order):
            problems.append(f"stop_times: trip {tid} repeats a stop_sequence")
        last_time, last_dist = -1, -1.0
        for r in rows:
            t = seconds(r["departure_time"])
            if t < last_time:
                problems.append(f"stop_times: trip {tid} goes back in time at "
                                f"sequence {r['stop_sequence']}")
                break
            last_time = t
            if r.get("shape_dist_traveled"):
                d = float(r["shape_dist_traveled"])
                if d < last_dist - 0.01:
                    problems.append(f"stop_times: trip {tid} distance decreases at "
                                    f"sequence {r['stop_sequence']}")
                    break
                last_dist = d

    by_shape = defaultdict(list)
    for row in shapes:
        by_shape[row["shape_id"]].append(row)
    for sid, rows in by_shape.items():
        rows.sort(key=lambda r: int(r["shape_pt_sequence"]))
        dists = [float(r["shape_dist_traveled"]) for r in rows if r.get("shape_dist_traveled")]
        if any(b < a - 0.01 for a, b in zip(dists, dists[1:])):
            problems.append(f"shapes: {sid} distance decreases")

    # ---- fares ----
    attributes = read("fare_attributes.txt")
    fare_rules = read("fare_rules.txt")
    products = read("fare_products.txt")
    media = read("fare_media.txt")
    areas = read("areas.txt")
    stop_areas = read("stop_areas.txt")
    leg_rules = read("fare_leg_rules.txt")

    fare_ids = {f["fare_id"] for f in attributes}
    zone_ids = {s.get("zone_id") for s in stops if s.get("zone_id")}
    area_ids = {a["area_id"] for a in areas}
    media_ids = {m["fare_media_id"] for m in media}
    product_ids = {p["fare_product_id"] for p in products}

    for r in fare_rules:
        if r["fare_id"] not in fare_ids:
            problems.append(f"fare_rules: unknown fare {r['fare_id']}")
        for side in ("origin_id", "destination_id"):
            if r.get(side) and r[side] not in zone_ids:
                problems.append(f"fare_rules: {r[side]} is no stop's zone_id")
    for f in attributes:
        if not f["price"].replace(".", "", 1).isdigit():
            problems.append(f"fare_attributes: {f['fare_id']} price {f['price']!r}")
        if f["payment_method"] not in ("0", "1"):
            problems.append(f"fare_attributes: {f['fare_id']} payment_method")
    for p in products:
        if p["fare_media_id"] not in media_ids:
            problems.append(f"fare_products: unknown media {p['fare_media_id']}")
    for r in leg_rules:
        if r["fare_product_id"] not in product_ids:
            problems.append(f"fare_leg_rules: unknown product {r['fare_product_id']}")
        for side in ("from_area_id", "to_area_id"):
            if r.get(side) and r[side] not in area_ids:
                problems.append(f"fare_leg_rules: unknown area {r[side]}")
    for a in stop_areas:
        if a["area_id"] not in area_ids:
            problems.append(f"stop_areas: unknown area {a['area_id']}")
        if a["stop_id"] not in stop_ids:
            problems.append(f"stop_areas: unknown stop {a['stop_id']}")

    platforms = {s["stop_id"] for s in stops if s.get("location_type") != "1"}
    unzoned = platforms - {a["stop_id"] for a in stop_areas}
    if unzoned:
        problems.append(f"{len(unzoned)} stops are in no fare area")

    for tr in translations:
        table, record = tr["table_name"], tr["record_id"]
        pool = {"stops": stop_ids, "routes": route_ids, "trips": trip_ids,
                "fare_products": product_ids, "fare_media": media_ids}.get(table)
        if pool is None:
            notes.append(f"translations: unchecked table {table}")
        elif record not in pool:
            problems.append(f"translations: {table} record {record} does not exist")

    served = {r["stop_id"] for r in times}
    orphan = [s["stop_id"] for s in stops
              if s.get("location_type") != "1" and s["stop_id"] not in served]
    if orphan:
        notes.append(f"{len(orphan)} stops are in no trip: {', '.join(orphan[:6])}"
                     + (" …" if len(orphan) > 6 else ""))

    print(f"{len(stops)} stops · {len(routes)} routes · {len(trips)} trips · "
          f"{len(times)} stop_times · {len(shapes)} shape points · "
          f"{len(translations)} translations")
    if attributes:
        prices = ", ".join(f"{f['fare_id']} {f['price']} {f['currency_type']}"
                           for f in attributes)
        print(f"{len(attributes)} fares over {len(area_ids)} zones: {prices}")
    timed = sum(1 for r in times if r.get("timepoint") == "1")
    print(f"{timed} stop_times are published timing points, "
          f"{len(times) - timed} are interpolated\n")

    if problems:
        print("PROBLEMS", *problems[:20], sep="\n  ")
        if len(problems) > 20:
            print(f"  … and {len(problems) - 20} more")
    else:
        print("PROBLEMS: none")
    if notes:
        print("\nWORTH A LOOK", *notes, sep="\n  ")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
