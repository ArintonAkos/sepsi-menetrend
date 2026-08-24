#!/usr/bin/env python3
"""Assemble the GTFS feed from everything the other scripts have produced.

    fetch_multitrans.py  stops and inter-stop distances, per language
    merge_lines.py       one file per line and direction
    extract_shapes.py    the drawn route geometry
    fetch_durations.py   how long the road actually takes between stops
    fetch_timetable.py   the published departure times
    build_trips.py       those times turned into complete trips

Output  gtfs/*.txt  and  multitrans-gtfs.zip

Two decisions worth knowing about:

  Stops are the 97 kerbs, not the 66 places. Where a road has a shelter on each
  side those are separate stops sharing a parent station, because a rider
  standing on the wrong side watches their bus go past.

  Romanian names go in stops.txt and Hungarian ones in translations.txt, with
  feed_lang=ro. That is the mechanism GTFS provides, and it is what makes a
  Hungarian-language app show Hungarian stop names.
"""

import csv
import json
import sys
import zipfile
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "gtfs"
ARCHIVE = ROOT / "multitrans-gtfs.zip"

sys.path.insert(0, str(ROOT))
from build_map import (  # noqa: E402
    DESCRIPTIONS, ORDER, anchor_vertices, build_stations, load_directions,
    contrast, official_colours, split_shared_kerbs,
    luminance, metres, palette,
)

AGENCY = {
    "agency_id": "multitrans",
    "agency_name": "Multi-Trans SA Sfântu Gheorghe",
    "agency_url": "https://multitrans.ro",
    "agency_timezone": "Europe/Bucharest",
    "agency_lang": "ro",
}

SERVICES = {
    "weekday": dict(monday=1, tuesday=1, wednesday=1, thursday=1, friday=1,
                    saturday=0, sunday=0),
    "weekend": dict(monday=0, tuesday=0, wednesday=0, thursday=0, friday=0,
                    saturday=1, sunday=1),
}

FEED_START = "20260807"        # "2026. augusztus 7-től érvényes"
FEED_END = "20271231"


def gtfs_time(minutes):
    """GTFS lets a trip run past midnight as 24:xx, so hours are not clamped."""
    total = int(round(minutes * 60))
    return f"{total // 3600:02d}:{total // 60 % 60:02d}:{total % 60:02d}"


def timing_points(directions, built, timetable):
    """Which (line, direction, stop index) the operator actually prints a time for.

    Matching on the stop alone is not enough: a loop passes 33 of the 74 timing
    points twice, and only one of those passes is the printed one. Score each
    candidate index against the published times and keep the pass that fits, so
    timepoint=1 means what it says and the rest are honestly marked as carried
    over.
    """
    entries = {}
    for entry in timetable["timepoints"]:
        entries.setdefault((entry["line"], entry["direction"]), []).append(entry)

    chosen = set()
    for d in directions:
        key = f"{d['line']}-{d['direction']}"
        record = built.get(key)
        if not record:
            continue
        offsets = record["offsets"]
        where = {}
        for i, stop in enumerate(d["stops"]):
            where.setdefault(stop["name"]["ro"], []).append(i)

        for entry in entries.get((d["line"], d["direction"]), []):
            spots = where.get(entry["stop_ro"], [])
            if not spots:
                continue
            if len(spots) == 1:
                chosen.add((d["line"], d["direction"], spots[0]))
                continue
            service = "weekday" if record.get("weekday") else "weekend"
            starts = record.get(service, [])
            published = [int(t[:2]) * 60 + int(t[3:]) for t in
                         entry["times"].get(service, [])]
            if not starts or not published:
                chosen.add((d["line"], d["direction"], spots[0]))
                continue
            best, score = spots[0], None
            for i in spots:
                predicted = [s + offsets[i] / 60 for s in starts]
                gaps = sorted(min(abs(a - p) for p in predicted) for a in published)
                median = gaps[len(gaps) // 2]
                if score is None or median < score:
                    best, score = i, median
            chosen.add((d["line"], d["direction"], best))
    return chosen


def fare_tables(fares, stations, stop_id):
    """The published tariff, in both the old and the new GTFS fare models.

    Fares V1 (fare_attributes + fare_rules) is what almost every consumer
    reads, so the prices have to be there. It cannot say *how* you pay, and
    that is the whole point of the 24pay announcement, so Fares V2 carries the
    media as well. The spec allows both while consumers migrate.

    Arcuș is its own zone: line 10 leaves the municipality, and the ticket
    there is 4 lei for 60 minutes rather than 2.5 for 45.
    """
    arcus = set(fares["zones"]["arcus"])
    zone_of = {}
    for station in stations:
        zone = "arcus" if station["name"]["ro"] in arcus else "city"
        for kerb in range(len(station["points"])):
            zone_of[stop_id[(station["id"], kerb)]] = zone

    attributes, rules, products, leg_rules, names = [], [], [], [], []
    for ticket in fares["tickets"]:
        # a time-limited ticket allows any number of changes inside the window
        limited = "minutes" in ticket
        attributes.append({
            "fare_id": ticket["id"],
            "price": f"{ticket['price']:.2f}",
            "currency_type": fares["currency"],
            "payment_method": 0 if ticket["media"] == "cash" else 1,
            "transfers": "" if limited else max(0, ticket.get("journeys", 1) - 1),
            "agency_id": AGENCY["agency_id"],
            "transfer_duration": ticket["minutes"] * 60 if limited else "",
        })
        rules.append({
            "fare_id": ticket["id"],
            "origin_id": ticket["zone"],
            "destination_id": ticket["zone"],
        })
        products.append({
            "fare_product_id": ticket["id"],
            "fare_product_name": ticket["name"]["ro"],
            "fare_media_id": ticket["media"],
            "amount": f"{ticket['price']:.2f}",
            "currency": fares["currency"],
        })
        leg_rules.append({
            "leg_group_id": ticket["zone"],
            "from_area_id": ticket["zone"],
            "to_area_id": ticket["zone"],
            "fare_product_id": ticket["id"],
        })
        names.append(("fare_products", "fare_product_name", ticket["id"],
                      ticket["name"]["hu"]))

    for season in fares["passes"]:
        products.append({
            "fare_product_id": season["id"],
            "fare_product_name": season["name"]["ro"],
            "fare_media_id": "machine",
            "amount": f"{season['price']:.2f}",
            "currency": fares["currency"],
        })
        names.append(("fare_products", "fare_product_name", season["id"],
                      season["name"]["hu"]))

    media = [{"fare_media_id": key, "fare_media_name": m["name"]["ro"],
              "fare_media_type": m["gtfs_type"]}
             for key, m in fares["media"].items()]
    names += [("fare_media", "fare_media_name", key, m["name"]["hu"])
              for key, m in fares["media"].items()]

    areas = [{"area_id": z} for z in ("city", "arcus")]
    stop_areas = [{"area_id": z, "stop_id": sid} for sid, z in zone_of.items()]

    return zone_of, {
        "fare_attributes.txt": (["fare_id", "price", "currency_type",
                                 "payment_method", "transfers", "agency_id",
                                 "transfer_duration"], attributes),
        "fare_rules.txt": (["fare_id", "origin_id", "destination_id"], rules),
        "fare_media.txt": (["fare_media_id", "fare_media_name",
                            "fare_media_type"], media),
        "fare_products.txt": (["fare_product_id", "fare_product_name",
                               "fare_media_id", "amount", "currency"], products),
        "areas.txt": (["area_id"], areas),
        "stop_areas.txt": (["area_id", "stop_id"], stop_areas),
        "fare_leg_rules.txt": (["leg_group_id", "from_area_id", "to_area_id",
                                "fare_product_id"], leg_rules),
    }, names


def write(name, fields, rows):
    path = OUT / name
    with path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fields, extrasaction="ignore",
                                lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    return len(rows)


def main():
    OUT.mkdir(exist_ok=True)
    directions = load_directions()
    stations = build_stations(directions)
    # the operator repeats one coordinate for both passes at a few stops; give
    # those their second kerb before anything else is keyed off the list
    kerb_by_call, derived, skipped = split_shared_kerbs(stations, directions)
    trips_data = json.loads((ROOT / "trips.json").read_text(encoding="utf-8"))["trips"]
    timetable = json.loads((ROOT / "timetable.json").read_text(encoding="utf-8"))

    printed = timing_points(directions, trips_data, timetable)

    # ---- stops: one per kerb, grouped under a station where there are two ----
    stop_rows, translations, stop_id = [], [], {}
    for station in stations:
        multi = len(station["points"]) > 1
        parent = f"ST{station['id']}" if multi else ""
        if multi:
            stop_rows.append({
                "stop_id": parent, "stop_name": station["name"]["ro"],
                "stop_lat": f"{station['lat']:.6f}", "stop_lon": f"{station['lng']:.6f}",
                "location_type": 1, "parent_station": "",
            })
            translations.append({
                "table_name": "stops", "field_name": "stop_name", "language": "hu",
                "record_id": parent, "translation": station["name"]["hu"],
            })
        for kerb, point in enumerate(station["points"]):
            sid = f"S{station['id']}-{kerb}"
            stop_id[(station["id"], kerb)] = sid
            stop_rows.append({
                "stop_id": sid, "stop_name": station["name"]["ro"],
                "stop_lat": f"{point[0]:.6f}", "stop_lon": f"{point[1]:.6f}",
                "location_type": 0, "parent_station": parent,
                "platform_code": str(kerb + 1) if multi else "",
                "stop_desc": ("Peron helye számítva a menetirányból; "
                              "a forrás egyetlen koordinátát közöl."
                              if station.get("derived_kerbs") else ""),
            })
            translations.append({
                "table_name": "stops", "field_name": "stop_name", "language": "hu",
                "record_id": sid, "translation": station["name"]["hu"],
            })

    station_index = {s["name"]["ro"]: s for s in stations}

    fares = json.loads((ROOT / "fares.json").read_text(encoding="utf-8"))
    zone_of, fare_files, fare_names = fare_tables(fares, stations, stop_id)
    for row in stop_rows:
        if row.get("location_type") != 1:
            row["zone_id"] = zone_of.get(row["stop_id"], "city")
    for table, field, record, hungarian in fare_names:
        translations.append({
            "table_name": table, "field_name": field, "language": "hu",
            "record_id": record, "translation": hungarian,
        })

    # ---- routes ----
    # route_color carries the operator's colour exactly as they publish it.
    # It is tempting to store the adjusted one instead - line 6's lime is hard
    # to read and line 10 is pure black - but other apps consume this feed and
    # expect the official colour, with their own contrast handling on top.
    # The adjustments live in the web bundle, next to the theme that needs them.
    official = official_colours()
    route_rows = []
    for line in ORDER:
        first = next(d for d in directions if d["line"] == line)
        colour = official[line]
        route_rows.append({
            "route_id": line, "agency_id": AGENCY["agency_id"],
            "route_short_name": line,
            "route_long_name": first["headsign"]["ro"],
            "route_type": 3, "route_color": colour.lstrip("#").upper(),
            # white on line 4's yellow is unreadable, so the label follows the fill
            "route_text_color": "FFFFFF" if contrast("#ffffff", colour) >=
                                            contrast("#000000", colour) else "000000",
        })
        translations.append({
            "table_name": "routes", "field_name": "route_long_name", "language": "hu",
            "record_id": line, "translation": DESCRIPTIONS[line],
        })

    # ---- shapes, and how far along each stop sits ----
    shape_rows, stop_distance = [], {}
    for d in directions:
        key = f"{d['line']}-{d['direction']}"
        points = d["shape"]
        along, running = [0.0], 0.0
        for i in range(1, len(points)):
            running += metres(points[i - 1], points[i])
            along.append(running)
        for i, point in enumerate(points):
            shape_rows.append({
                "shape_id": key, "shape_pt_lat": f"{point[0]:.6f}",
                "shape_pt_lon": f"{point[1]:.6f}", "shape_pt_sequence": i,
                "shape_dist_traveled": f"{along[i]:.1f}",
            })
        stop_distance[key] = [along[v] for v in anchor_vertices(d["stops"], points)]

    # ---- trips and stop times ----
    trip_rows, time_rows = [], []
    missing = []
    for d in directions:
        key = f"{d['line']}-{d['direction']}"
        record = trips_data.get(key)
        if not record:
            missing.append(key)
            continue
        offsets = record["offsets"]
        for name, starts in (("weekday", record.get("weekday", [])),
                             ("weekend", record.get("weekend", []))):
            for n, start in enumerate(starts, 1):
                trip_id = f"{key}-{name}-{n:03d}"
                trip_rows.append({
                    "route_id": d["line"], "service_id": name, "trip_id": trip_id,
                    "trip_headsign": d["headsign"]["ro"],
                    "direction_id": 0 if d["direction"] == "depart" else 1,
                    "shape_id": key,
                })
                for i, stop in enumerate(d["stops"]):
                    station = station_index[stop["name"]["ro"]]
                    call = (d["line"], d["direction"], i)
                    kerb = (kerb_by_call[call] if call in kerb_by_call
                            else station["points"].index(
                                [stop["stop_lat"], stop["stop_lon"]]))
                    when = gtfs_time(start + offsets[i] / 60)
                    time_rows.append({
                        "trip_id": trip_id, "arrival_time": when,
                        "departure_time": when,
                        "stop_id": stop_id[(station["id"], kerb)],
                        "stop_sequence": i + 1,
                        # 1 where the operator prints this time, 0 where we carried
                        # it over from the nearest stop that has one
                        "timepoint": 1 if (d["line"], d["direction"], i)
                                          in printed else 0,
                        "shape_dist_traveled": f"{stop_distance[key][i]:.1f}",
                    })

    counts = {
        "agency.txt": write("agency.txt", list(AGENCY), [AGENCY]),
        "stops.txt": write("stops.txt", ["stop_id", "stop_name", "stop_lat", "stop_lon",
                                         "location_type", "parent_station",
                                         "platform_code", "zone_id",
                                         "stop_desc"], stop_rows),
        "routes.txt": write("routes.txt", ["route_id", "agency_id", "route_short_name",
                                           "route_long_name", "route_type",
                                           "route_color", "route_text_color"], route_rows),
        "trips.txt": write("trips.txt", ["route_id", "service_id", "trip_id",
                                         "trip_headsign", "direction_id", "shape_id"],
                           trip_rows),
        "stop_times.txt": write("stop_times.txt", ["trip_id", "arrival_time",
                                                   "departure_time", "stop_id",
                                                   "stop_sequence", "timepoint",
                                                   "shape_dist_traveled"], time_rows),
        "calendar.txt": write("calendar.txt",
                              ["service_id", "monday", "tuesday", "wednesday",
                               "thursday", "friday", "saturday", "sunday",
                               "start_date", "end_date"],
                              [dict(service_id=k, **v, start_date=FEED_START,
                                    end_date=FEED_END) for k, v in SERVICES.items()]),
        "shapes.txt": write("shapes.txt", ["shape_id", "shape_pt_lat", "shape_pt_lon",
                                           "shape_pt_sequence",
                                           "shape_dist_traveled"], shape_rows),
        "translations.txt": write("translations.txt", ["table_name", "field_name",
                                                       "language", "record_id",
                                                       "translation"], translations),
        "feed_info.txt": write("feed_info.txt",
                               ["feed_publisher_name", "feed_publisher_url",
                                "feed_lang", "default_lang", "feed_start_date",
                                "feed_end_date", "feed_version"],
                               [{"feed_publisher_name": "MultiTrans-GTFS",
                                 "feed_publisher_url": "https://multitrans.ro",
                                 "feed_lang": "ro", "default_lang": "ro",
                                 "feed_start_date": FEED_START,
                                 "feed_end_date": FEED_END,
                                 "feed_version": date.today().isoformat()}]),
    }

    for name, (fields, rows) in fare_files.items():
        counts[name] = write(name, fields, rows)

    with zipfile.ZipFile(ARCHIVE, "w", zipfile.ZIP_DEFLATED) as zf:
        for name in counts:
            zf.write(OUT / name, name)

    for name, rows in counts.items():
        print(f"  {name:<20} {rows:>6} sor")
    if derived:
        print(f"\nsecond kerb derived at {len(derived)} stops the source lists once:")
        for name in sorted(derived):
            print(f"  {name}")
    if skipped:
        print(f"left alone, the bus turns round there: {', '.join(sorted(skipped))}")

    print(f"\n{ARCHIVE.name}: {ARCHIVE.stat().st_size / 1024:.0f} KB")
    if missing:
        print("no published times, so no trips for:", *missing, sep="\n  ")
    return 0


if __name__ == "__main__":
    sys.exit(main())
