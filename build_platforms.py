#!/usr/bin/env python3
"""Resolve ordered Multi-Trans calls onto real physical bus platforms.

The operator's route pages tell us which calls follow which.  They cannot be
used as a platform identity: one label can occur on different sides of a road,
and opposite sides can have different labels.  This module uses locally cached
OSM bus-platform nodes when the names and positions agree, and otherwise
preserves the operator coordinate as one explicit fallback platform.
"""

import json
import math
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MATCH_METRES = 35.0


def normalise_name(value):
    """Compare names without case, accents, punctuation, or whitespace noise."""
    plain = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    return "".join(char for char in plain.casefold() if char.isalnum())


def metres(a, b):
    """Planar distance is accurate enough for the 35 m local match radius."""
    latitude = math.radians((a[0] + b[0]) / 2)
    return math.hypot(
        (b[1] - a[1]) * 111320 * math.cos(latitude),
        (b[0] - a[0]) * 111320,
    )


def osm_platform_nodes(payload):
    """Return the bus-platform nodes from an Overpass response or a node list."""
    nodes = payload.get("elements", []) if isinstance(payload, dict) else payload
    result = []
    for node in nodes:
        tags = node.get("tags", {})
        if not tags.get("name"):
            continue
        if tags.get("public_transport") != "platform" and tags.get("highway") != "bus_stop":
            continue
        if "lat" not in node or "lon" not in node:
            continue
        result.append(node)
    return result


def _call_key(key):
    return ":".join((key[0], key[1], str(key[2])))


def _platform_from_override(key, overrides):
    value = overrides.get("calls", {}).get(_call_key(key))
    if not value:
        return None
    name = value["name"]
    return {
        "id": value["id"],
        "name": name,
        "point": value["point"],
        "source": "override",
        "osm_id": value.get("osm_id"),
    }


def nearest_named_osm(stop, nodes):
    """Return a unique closest matching OSM platform inside the match radius."""
    expected = normalise_name(stop["name"]["ro"])
    point = [stop["stop_lat"], stop["stop_lon"]]
    candidates = []
    for node in nodes:
        if normalise_name(node["tags"]["name"]) != expected:
            continue
        distance = metres(point, [node["lat"], node["lon"]])
        if distance <= MATCH_METRES:
            candidates.append((distance, node))
    candidates.sort(key=lambda item: (item[0], item[1]["id"]))
    if not candidates:
        return None
    if len(candidates) > 1 and abs(candidates[0][0] - candidates[1][0]) < 0.001:
        return None
    _, node = candidates[0]
    return {
        "id": f"osm-{node['id']}",
        "name": {
            "ro": node["tags"]["name"],
            "hu": node["tags"].get("name:hu", stop["name"]["hu"]),
        },
        "point": [node["lat"], node["lon"]],
        "source": "osm",
        "osm_id": node["id"],
    }


def fallback_for(stop, source_aliases=None):
    """One source coordinate is one platform until stronger evidence exists."""
    lat, lon = stop["stop_lat"], stop["stop_lon"]
    fallback = {
        "id": f"source-{normalise_name(stop['name']['ro'])}-{lat:.6f}-{lon:.6f}",
        "name": stop["name"],
        "point": [lat, lon],
        "source": "source-fallback",
        "osm_id": None,
    }
    alias = (source_aliases or {}).get(fallback["id"])
    if alias is None:
        return fallback
    return {
        "id": alias["id"],
        "name": alias.get("name", fallback["name"]),
        "point": alias["point"],
        "source": alias.get("source", "override"),
        "osm_id": alias.get("osm_id"),
    }


def resolve_platforms(directions, osm_nodes, overrides):
    """Resolve every ordered call without inventing any extra platform."""
    nodes = osm_platform_nodes(osm_nodes)
    by_id, call_platforms, unmatched = {}, {}, []
    for direction in directions:
        for index, stop in enumerate(direction["stops"]):
            key = (direction["line"], direction["direction"], index)
            platform = _platform_from_override(key, overrides)
            platform = platform or nearest_named_osm(stop, nodes)
            if platform is None:
                platform = fallback_for(stop, overrides.get("source_aliases"))
                if platform["source"] == "source-fallback":
                    unmatched.append({
                        "line": key[0], "direction": key[1], "index": key[2],
                        "name": stop["name"]["ro"], "reason": "no matching OSM platform",
                    })
            record = by_id.setdefault(platform["id"], {**platform, "calls": []})
            record["calls"].append({"line": key[0], "direction": key[1], "index": key[2]})
            call_platforms[key] = record["id"]
    return {
        "platforms": [by_id[key] for key in sorted(by_id)],
        "call_platforms": call_platforms,
        "unmatched": unmatched,
    }


def write_platforms(topology, path):
    """Persist the serializable evidence required to audit platform choices."""
    payload = {
        "platforms": topology["platforms"],
        "unmatched": topology["unmatched"],
    }
    Path(path).write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def load_osm_platforms(path=ROOT / "osm" / "bus_stops.json"):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def load_overrides(path=ROOT / "platform_overrides.json"):
    candidate = Path(path)
    if not candidate.exists():
        return {"calls": {}}
    return json.loads(candidate.read_text(encoding="utf-8"))
