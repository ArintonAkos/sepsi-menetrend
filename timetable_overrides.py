"""Reviewed corrections where an official board label names the wrong route leg."""

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent
OVERRIDES = ROOT / "timetable_overrides.json"


def load_overrides(path=OVERRIDES):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def apply_timetable_overrides(entries, overrides=None):
    """Return copied board columns with reviewed physical direction corrections.

    The raw operator download remains untouched.  These narrow overrides are
    applied by every consumer that needs a route direction, so a stop popup and
    the trip reconstruction cannot disagree about the same physical boarding
    platform.
    """
    overrides = overrides if overrides is not None else load_overrides()
    result = []
    for entry in entries:
        ignored = [rule for rule in overrides.get("ignoreColumns", [])
                   if entry["line"] == rule["line"]
                   and entry.get("direction", "depart") == rule["direction"]
                   and entry["stop_ro"] == rule["stop"]
                   and entry["destination"] == rule["destination"]
                   and ("sourceStationIds" not in rule
                        or entry.get("source_station_id") in rule["sourceStationIds"])]
        if len(ignored) > 1:
            raise ValueError(f"multiple ignore rules for {entry}")
        if ignored:
            continue
        replacement = None
        for rule in overrides.get("rewriteColumns", []):
            if (entry["line"] == rule["line"]
                    and entry.get("direction", "depart") == rule["fromDirection"]
                    and entry["destination"] == rule["fromDestination"]
                    and entry["stop_ro"] in rule["stops"]
                    and ("sourceStationIds" not in rule
                         or entry.get("source_station_id") in rule["sourceStationIds"])):
                if replacement is not None:
                    raise ValueError(f"multiple timetable overrides for {entry}")
                replacement = rule
        if replacement is None:
            result.append(entry)
        else:
            result.append({**entry, "direction": replacement["direction"],
                           "destination": replacement["destination"]})
    return result


def merge_same_platform_columns(entries):
    """Coalesce complementary source cards only after their kerb is proven.

    The operator page can split one physical pole's day into two HTML cards.
    Treating those as competing columns drops the shorter one during trip
    matching; treating all equal names as one would incorrectly join opposite
    sides of a road.  A resolved platform is the necessary and sufficient
    identity for this merge.
    """
    def literal_events(entry):
        services = set(entry.get("events", {})) | set(entry.get("times", {}))
        return {
            service: list(entry.get("events", {}).get(service, [
                {"time": time, "marked": False}
                for time in entry.get("times", {}).get(service, [])
            ]))
            for service in services
        }

    grouped = {}
    order = []
    for position, entry in enumerate(entries):
        platform = entry.get("_platform")
        key = ((platform, entry["line"], entry.get("direction", "depart"),
                entry["stop_ro"], entry["destination"])
               if platform is not None else ("unbound", position))
        if key not in grouped:
            events = literal_events(entry)
            grouped[key] = {**entry,
                            "events": events,
                            "times": {service: [event["time"] for event in values]
                                      for service, values in events.items()},
                            "source_station_ids": [entry["source_station_id"]]
                            if entry.get("source_station_id") is not None else []}
            order.append(key)
            continue

        merged = grouped[key]
        if entry.get("source_station_id") is not None:
            merged["source_station_ids"].append(entry["source_station_id"])
        incoming = literal_events(entry)
        for service in set(merged["events"]) | set(incoming):
            events = merged["events"].get(service, []) + incoming.get(service, [])
            by_time = {}
            for event in events:
                time = event["time"]
                by_time[time] = {"time": time,
                                 "marked": bool(event.get("marked", False))
                                 or bool(by_time.get(time, {}).get("marked", False))}
            merged["events"][service] = [by_time[time] for time in sorted(by_time)]
            merged["times"][service] = [event["time"] for event in merged["events"][service]]

    for merged in grouped.values():
        merged["source_station_ids"] = sorted(set(merged["source_station_ids"]))
    return [grouped[key] for key in order]


def filter_opposite_platform_columns(entries, directions):
    """Remove a wrong-side source copy only when its right-side twin exists.

    This is deliberately evidence-based: a lone literal board remains visible
    even if an older route page has stale geometry.  We discard it only if the
    same line, source direction, headsign and stop label is published again on
    the kerb that the route itself reaches.
    """
    wanted_by_entry = {}
    for entry in entries:
        source_direction = entry.get("direction", "depart")
        wanted = set()
        for direction in directions:
            if direction["line"] != entry["line"]:
                continue
            if direction.get("source_direction", direction["direction"]) != source_direction:
                continue
            if (direction.get("destination") is not None
                    and direction["destination"] != entry["destination"]):
                continue
            for index, stop in enumerate(direction["stops"]):
                if stop["name"]["ro"] == entry["stop_ro"]:
                    platforms = direction.get("callPlatforms", [])
                    if index < len(platforms):
                        wanted.add(platforms[index])
        wanted_by_entry[id(entry)] = wanted

    result = []
    for entry in entries:
        platform = entry.get("_platform")
        wanted = wanted_by_entry[id(entry)]
        same_column = [other for other in entries
                       if other is not entry
                       and other["line"] == entry["line"]
                       and other.get("direction", "depart") == entry.get("direction", "depart")
                       and other["stop_ro"] == entry["stop_ro"]
                       and other["destination"] == entry["destination"]]
        has_matching_twin = any(other.get("_platform") in wanted for other in same_column)
        if platform is not None and wanted and platform not in wanted and has_matching_twin:
            continue
        result.append(entry)
    return result
